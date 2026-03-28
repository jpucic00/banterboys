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
              await prisma.oddsSnapshot.create({
                data: {
                  eventId: event.id,
                  homeOdds: homeOutcome.price,
                  awayOdds: awayOutcome.price,
                  drawOdds: drawOutcome?.price ?? null,
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
            const espnEvents = await fetchEspnEventsByDate(sportKey, dateStr);

            for (const ev of eventsOnDate) {
              if (espnEvents.length === 0) {
                unmatched.push(`${ev.homeTeam} vs ${ev.awayTeam} (${dateStr}: no ESPN events)`);
                continue;
              }

              const espnId = findEspnMatch(
                ev.homeTeam,
                ev.awayTeam,
                ev.commenceTime,
                espnEvents
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
