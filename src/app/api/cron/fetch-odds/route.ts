import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchEvents, fetchOddsForSport, SPORT_KEYS } from "@/lib/odds-api";
import { ESPN_SPORT_MAP, fetchEspnEventsByDate, findEspnMatch } from "@/lib/espn-api";

const TEAM_DATE_MATCH_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Match an incoming Odds API event to an existing DB row by apiEventId, then
 * fall back to teams + commenceTime within ±48h. The fallback handles cases
 * where The Odds API issues a fresh apiEventId after a reschedule — without it
 * the stale row would never be touched and a duplicate would accumulate.
 *
 * When the fallback finds a row whose apiEventId differs from the incoming one,
 * a duplicate may already exist in the same run (the /odds pass created it
 * before this /events pass discovered the orphan). Migrate FK references off
 * the duplicate and delete it inside the same transaction so the @unique
 * apiEventId constraint stays satisfied.
 */
async function matchOrCreateEvent(
  sportId: string,
  apiEvent: { id: string; home_team: string; away_team: string; commence_time: string },
) {
  const commenceTime = new Date(apiEvent.commence_time);

  const existingById = await prisma.event.findUnique({
    where: { apiEventId: apiEvent.id },
  });
  if (existingById) {
    return prisma.event.update({
      where: { id: existingById.id },
      data: {
        homeTeam: apiEvent.home_team,
        awayTeam: apiEvent.away_team,
        commenceTime,
      },
    });
  }

  const windowStart = new Date(commenceTime.getTime() - TEAM_DATE_MATCH_WINDOW_MS);
  const windowEnd = new Date(commenceTime.getTime() + TEAM_DATE_MATCH_WINDOW_MS);
  const orphan = await prisma.event.findFirst({
    where: {
      sportId,
      status: "UPCOMING",
      homeTeam: { equals: apiEvent.home_team, mode: "insensitive" },
      awayTeam: { equals: apiEvent.away_team, mode: "insensitive" },
      commenceTime: { gte: windowStart, lte: windowEnd },
    },
  });

  if (orphan) {
    return prisma.$transaction(async (tx) => {
      const dup = await tx.event.findUnique({ where: { apiEventId: apiEvent.id } });
      if (dup && dup.id !== orphan.id) {
        await tx.oddsSnapshot.updateMany({
          where: { eventId: dup.id },
          data: { eventId: orphan.id },
        });
        await tx.pvPBet.updateMany({
          where: { eventId: dup.id },
          data: { eventId: orphan.id },
        });
        await tx.ticketSelection.updateMany({
          where: { eventId: dup.id },
          data: { eventId: orphan.id },
        });
        await tx.event.delete({ where: { id: dup.id } });
      }
      return tx.event.update({
        where: { id: orphan.id },
        data: {
          apiEventId: apiEvent.id,
          homeTeam: apiEvent.home_team,
          awayTeam: apiEvent.away_team,
          commenceTime,
        },
      });
    });
  }

  return prisma.event.create({
    data: {
      apiEventId: apiEvent.id,
      sportId,
      homeTeam: apiEvent.home_team,
      awayTeam: apiEvent.away_team,
      commenceTime,
    },
  });
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, number> = {};

  for (const sportKey of SPORT_KEYS) {
    try {
      const sport = await prisma.sport.upsert({
        where: { key: sportKey },
        update: {},
        create: { key: sportKey, name: sportKey.replace(/_/g, " ") },
      });

      const events = await fetchOddsForSport(sportKey);
      const seenApiIds = new Set<string>();
      let count = 0;

      for (const apiEvent of events) {
        const event = await matchOrCreateEvent(sport.id, apiEvent);
        seenApiIds.add(apiEvent.id);

        // Prefer a bookmaker whose h2h market carries a 3-way outcome (Home/Draw/Away).
        // Soccer h2h is already 3-way everywhere. NHL h2h is 2-way for most bookmakers but
        // ~17 EU/UK books (marathonbet, unibet_*, leovegas, betway, …) quote regulation-time
        // 3-way under the same h2h key; we pick one of those when available so draw/1X/2X
        // match our regulation-time settlement. Falls back to the first bookmaker otherwise.
        const bookmaker = sportKey === "mma_mixed_martial_arts"
          ? apiEvent.bookmakers[0]
          : apiEvent.bookmakers.find((b) =>
              b.markets.some(
                (m) => m.key === "h2h" && m.outcomes.some((o) => o.name === "Draw")
              )
            ) ?? apiEvent.bookmakers[0];
        if (bookmaker) {
          const h2h = bookmaker.markets.find((m) => m.key === "h2h");
          if (h2h) {
            const homeOutcome = h2h.outcomes.find((o) => o.name === apiEvent.home_team);
            const awayOutcome = h2h.outcomes.find((o) => o.name === apiEvent.away_team);
            const drawOutcome = h2h.outcomes.find((o) => o.name === "Draw");
            const isMma = sportKey === "mma_mixed_martial_arts";

            if (homeOutcome && awayOutcome) {
              // Derive double chance odds from h2h: 1X = 1/(1/home + 1/draw), 2X = 1/(1/away + 1/draw)
              // No extra margin — bookmaker margin from h2h carries through. Floor at 1.05 for heavy favorites.
              // MMA has no draws — ignore any draw outcome the API returns.
              const drawPrice = !isMma ? (drawOutcome?.price ?? null) : null;
              const rawHomeDraw = drawPrice ? 1 / (1 / homeOutcome.price + 1 / drawPrice) : null;
              const rawAwayDraw = drawPrice ? 1 / (1 / awayOutcome.price + 1 / drawPrice) : null;
              const homeDrawOdds = rawHomeDraw ? Math.round(Math.max(rawHomeDraw, 1.05) * 100) / 100 : null;
              const awayDrawOdds = rawAwayDraw ? Math.round(Math.max(rawAwayDraw, 1.05) * 100) / 100 : null;

              await prisma.oddsSnapshot.create({
                data: {
                  eventId: event.id,
                  homeOdds: homeOutcome.price,
                  awayOdds: awayOutcome.price,
                  drawOdds: drawPrice,
                  homeDrawOdds,
                  awayDrawOdds,
                  bookmaker: bookmaker.key,
                },
              });
              count++;
            }
          }
        }
      }

      results[sportKey] = count;

      // ── Refresh commenceTime for events without bookmakers ────────────
      // The /odds endpoint excludes events with no usable bookmakers, so a
      // game whose odds were temporarily pulled (or whose Odds API id changed
      // after a reschedule) is invisible to the loop above. /events returns
      // every upcoming event regardless, letting matchOrCreateEvent reconcile
      // stale rows by team + date.
      try {
        const allEvents = await fetchEvents(sportKey);
        let refreshed = 0;
        for (const apiEvent of allEvents) {
          await matchOrCreateEvent(sport.id, apiEvent);
          seenApiIds.add(apiEvent.id);
          refreshed++;
        }
        if (refreshed > 0) results[`${sportKey}_events_refreshed`] = refreshed;
      } catch (error) {
        console.error(`[fetch-odds] /events pass failed for ${sportKey}:`, error);
      }

      // ── Dedup duplicate UPCOMING rows for the same fixture ────────────
      // A row whose apiEventId is no longer returned by either /odds or
      // /events lingers as a stale duplicate of a fresh row created under a
      // new apiEventId. Group UPCOMING rows by (homeTeam, awayTeam) and merge
      // any pair whose commenceTime sits within ±48h: prefer the row whose
      // apiEventId is in the latest API response, migrate FK refs (snapshots,
      // PvP bets, ticket selections), promote any ESPN id / logos that the
      // kept row is missing, then delete the dropped row.
      try {
        const upcoming = await prisma.event.findMany({
          where: { sportId: sport.id, status: "UPCOMING" },
          orderBy: { commenceTime: "asc" },
        });

        const groups = new Map<string, typeof upcoming>();
        for (const ev of upcoming) {
          const key = `${ev.homeTeam.toLowerCase()}|${ev.awayTeam.toLowerCase()}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(ev);
        }

        let merged = 0;
        const dropped = new Set<string>();
        for (const group of groups.values()) {
          if (group.length < 2) continue;
          for (let i = 0; i < group.length; i++) {
            if (dropped.has(group[i].id)) continue;
            for (let j = i + 1; j < group.length; j++) {
              if (dropped.has(group[j].id)) continue;
              const a = group[i];
              const b = group[j];
              const diff = Math.abs(a.commenceTime.getTime() - b.commenceTime.getTime());
              if (diff > TEAM_DATE_MATCH_WINDOW_MS) continue;

              const aInApi = seenApiIds.has(a.apiEventId);
              const bInApi = seenApiIds.has(b.apiEventId);
              let keep: typeof a;
              let drop: typeof a;
              if (aInApi && !bInApi) { keep = a; drop = b; }
              else if (bInApi && !aInApi) { keep = b; drop = a; }
              else if (a.commenceTime > b.commenceTime) { keep = a; drop = b; }
              else { keep = b; drop = a; }

              await prisma.$transaction(async (tx) => {
                await tx.oddsSnapshot.updateMany({
                  where: { eventId: drop.id },
                  data: { eventId: keep.id },
                });
                await tx.pvPBet.updateMany({
                  where: { eventId: drop.id },
                  data: { eventId: keep.id },
                });
                await tx.ticketSelection.updateMany({
                  where: { eventId: drop.id },
                  data: { eventId: keep.id },
                });
                await tx.event.delete({ where: { id: drop.id } });

                const updates: {
                  espnEventId?: string;
                  homeLogoUrl?: string;
                  awayLogoUrl?: string;
                } = {};
                if (!keep.espnEventId && drop.espnEventId) updates.espnEventId = drop.espnEventId;
                if (!keep.homeLogoUrl && drop.homeLogoUrl) updates.homeLogoUrl = drop.homeLogoUrl;
                if (!keep.awayLogoUrl && drop.awayLogoUrl) updates.awayLogoUrl = drop.awayLogoUrl;
                if (Object.keys(updates).length > 0) {
                  await tx.event.update({ where: { id: keep.id }, data: updates });
                }
              });

              dropped.add(drop.id);
              merged++;
              console.log(
                `[fetch-odds] ${sportKey} merged duplicate ${drop.homeTeam} vs ${drop.awayTeam} (${drop.commenceTime.toISOString()} → ${keep.commenceTime.toISOString()})`,
              );
            }
          }
        }
        if (merged > 0) results[`${sportKey}_dedup_merged`] = merged;
      } catch (error) {
        console.error(`[fetch-odds] dedup pass failed for ${sportKey}:`, error);
      }

      // ── ESPN ID mapping ────────────────────────────────────────────────
      if (sportKey in ESPN_SPORT_MAP) {
        const unmapped = await prisma.event.findMany({
          where: { sportId: sport.id, OR: [{ espnEventId: null }, { homeLogoUrl: null }] },
        });

        if (unmapped.length > 0) {
          const byDate = new Map<string, typeof unmapped>();
          for (const ev of unmapped) {
            const dateStr = ev.commenceTime.toISOString().slice(0, 10).replace(/-/g, "");
            if (!byDate.has(dateStr)) byDate.set(dateStr, []);
            byDate.get(dateStr)!.push(ev);
          }

          let mapped = 0;
          const unmatched: string[] = [];

          for (const [dateStr, eventsOnDate] of byDate) {
            // ESPN uses local date; Odds API uses UTC. A game at 7 PM ET sits in ESPN's
            // "previous day" bucket, and some APIs store placeholder dates off by ±1 day.
            // Fetch UTC-1, UTC, and UTC+1 to cover all boundary cases.
            const baseMs = new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T00:00:00Z`).getTime();
            const prevDateStr = new Date(baseMs - 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
            const nextDateStr = new Date(baseMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, "");

            const [espnPrev, espnCurrent, espnNext] = await Promise.all([
              fetchEspnEventsByDate(sportKey, prevDateStr),
              fetchEspnEventsByDate(sportKey, dateStr),
              fetchEspnEventsByDate(sportKey, nextDateStr),
            ]);
            const espnEvents = [...espnPrev, ...espnCurrent, ...espnNext];

            for (const ev of eventsOnDate) {
              if (espnEvents.length === 0) {
                unmatched.push(`${ev.homeTeam} vs ${ev.awayTeam} (${dateStr}: no ESPN events)`);
                continue;
              }

              const espnMatch = findEspnMatch(
                ev.homeTeam,
                ev.awayTeam,
                ev.commenceTime,
                espnEvents,
                sportKey
              );
              if (espnMatch) {
                await prisma.event.update({
                  where: { id: ev.id },
                  data: {
                    espnEventId: espnMatch.event.id,
                    espnReversed: espnMatch.reversed,
                    homeLogoUrl: espnMatch.event.homeLogo ?? null,
                    awayLogoUrl: espnMatch.event.awayLogo ?? null,
                  },
                }).catch(() => {});
                mapped++;
              } else {
                unmatched.push(`${ev.homeTeam} vs ${ev.awayTeam} (${dateStr})`);
              }
            }
          }

              if (mapped > 0) results[`${sportKey}_espn_mapped`] = mapped;
          if (unmatched.length > 0) results[`${sportKey}_espn_unmatched`] = unmatched.length;
          console.log(`[fetch-odds] ${sportKey} ESPN mapping: ${mapped} mapped, unmatched:`, unmatched);
        }
      }

    } catch (error) {
      console.error(`Error fetching odds for ${sportKey}:`, error);
      results[sportKey] = -1;
    }
  }

  return NextResponse.json({ ok: true, results });
}
