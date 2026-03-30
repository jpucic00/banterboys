import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchOddsForSport, SPORT_KEYS } from "@/lib/odds-api";
import { ESPN_SPORT_MAP, fetchEspnEventsByDate, findEspnMatch } from "@/lib/espn-api";

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
      let count = 0;

      for (const apiEvent of events) {
        const event = await prisma.event.upsert({
          where: { apiEventId: apiEvent.id },
          update: {
            homeTeam: apiEvent.home_team,
            awayTeam: apiEvent.away_team,
            commenceTime: new Date(apiEvent.commence_time),
          },
          create: {
            apiEventId: apiEvent.id,
            sportId: sport.id,
            homeTeam: apiEvent.home_team,
            awayTeam: apiEvent.away_team,
            commenceTime: new Date(apiEvent.commence_time),
          },
        });

        const bookmaker = apiEvent.bookmakers[0];
        if (bookmaker) {
          const h2h = bookmaker.markets.find((m) => m.key === "h2h");
          if (h2h) {
            const homeOutcome = h2h.outcomes.find((o) => o.name === apiEvent.home_team);
            const awayOutcome = h2h.outcomes.find((o) => o.name === apiEvent.away_team);
            const drawOutcome = h2h.outcomes.find((o) => o.name === "Draw");

            if (homeOutcome && awayOutcome) {
              // Derive double chance odds from h2h: 1X = 1/(1/home + 1/draw), 2X = 1/(1/away + 1/draw)
              // Apply 5% margin since derived odds are fair value (no house edge)
              const DC_MARGIN = 0.05;
              const drawPrice = drawOutcome?.price ?? null;
              const homeDrawOdds = drawPrice
                ? Math.round((1 / (1 / homeOutcome.price + 1 / drawPrice)) * (1 - DC_MARGIN) * 100) / 100
                : null;
              const awayDrawOdds = drawPrice
                ? Math.round((1 / (1 / awayOutcome.price + 1 / drawPrice)) * (1 - DC_MARGIN) * 100) / 100
                : null;

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

      // ── ESPN ID mapping ────────────────────────────────────────────────
      if (sportKey in ESPN_SPORT_MAP) {
        const unmapped = await prisma.event.findMany({
          where: { sportId: sport.id, espnEventId: null },
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

              const espnId = findEspnMatch(
                ev.homeTeam,
                ev.awayTeam,
                ev.commenceTime,
                espnEvents,
                sportKey
              );
              if (espnId) {
                await prisma.event.update({
                  where: { id: ev.id },
                  data: { espnEventId: espnId },
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
