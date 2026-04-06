import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ESPN_SPORT_MAP, fetchEspnEventsByDate, fetchEspnRecentEvents } from "@/lib/espn-api";
import { settleEvent } from "@/lib/settle";
import { EventStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isSweep = req.nextUrl.searchParams.get("sweep") === "1";

  return isSweep ? runSettlementSweep() : runLiveScores();
}

/**
 * Live mode (default, runs every minute):
 * 1. Query DB for sports with events active right now (commenceTime in last 4h, not yet COMPLETED).
 * 2. Fetch only today's ESPN scoreboard for those sports (~0–5 requests/min).
 * 3. Update LIVE events with current score + clock; settle just-completed events.
 * 4. Reset any DB-LIVE events that ESPN no longer shows as in-progress (delays/postponements).
 */
async function runLiveScores() {
  const now = new Date();
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const fiveMinutesAhead = new Date(now.getTime() + 5 * 60 * 1000);
  const todayStr = now.toISOString().slice(0, 10).replace(/-/g, "");

  // Find active events and their sports
  const activeEvents = await prisma.event.findMany({
    where: {
      commenceTime: { gte: fourHoursAgo, lte: fiveMinutesAhead },
      status: { in: [EventStatus.UPCOMING, EventStatus.LIVE] },
      espnEventId: { not: null },
    },
    include: { sport: true },
  });

  if (activeEvents.length === 0) {
    return NextResponse.json({ ok: true, mode: "live", updated: [], settled: [], reset: [] });
  }

  // Deduplicate sports
  const activeSportKeys = [...new Set(activeEvents.map((e) => e.sport.key))];

  const updated: string[] = [];
  const settled: string[] = [];
  const reset: string[] = [];
  const errors: string[] = [];

  for (const sportKey of activeSportKeys) {
    if (!ESPN_SPORT_MAP[sportKey]) continue;
    try {
      const espnEvents = await fetchEspnEventsByDate(sportKey, todayStr);
      const espnById = new Map(espnEvents.map((e) => [e.id, e]));

      const sportActiveEvents = activeEvents.filter((e) => e.sport.key === sportKey);

      for (const event of sportActiveEvents) {
        const espnEvent = event.espnEventId ? espnById.get(event.espnEventId) : undefined;

        if (!espnEvent) continue;

        if (espnEvent.completed) {
          // Settle just-completed events (same logic as sweep, but for today's active events)
          if (event.status === EventStatus.COMPLETED) continue;

          let homeScore = Math.round(espnEvent.homeScore);
          let awayScore = Math.round(espnEvent.awayScore);
          if (espnEvent.wentToExtraTime) {
            const drawScore = Math.min(homeScore, awayScore);
            homeScore = drawScore;
            awayScore = drawScore;
          }

          await prisma.event.update({
            where: { id: event.id },
            data: {
              homeScore,
              awayScore,
              liveHomeScore: null,
              liveAwayScore: null,
              liveClock: null,
              status: EventStatus.COMPLETED,
              completedAt: new Date(),
            },
          });
          await settleEvent(event.id);
          settled.push(`${event.homeTeam} vs ${event.awayTeam}`);
        } else if (espnEvent.inProgress) {
          // Update live score and clock
          await prisma.event.update({
            where: { id: event.id },
            data: {
              liveHomeScore: Math.round(espnEvent.homeScore),
              liveAwayScore: Math.round(espnEvent.awayScore),
              liveClock: espnEvent.statusDetail ?? null,
              status: EventStatus.LIVE,
            },
          });
          updated.push(`${event.homeTeam} vs ${event.awayTeam}`);
        } else if (event.status === EventStatus.LIVE) {
          // ESPN shows "pre" — match delayed or postponed, reset to UPCOMING
          await prisma.event.update({
            where: { id: event.id },
            data: {
              liveHomeScore: null,
              liveAwayScore: null,
              liveClock: null,
              status: EventStatus.UPCOMING,
            },
          });
          reset.push(`${event.homeTeam} vs ${event.awayTeam}`);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${sportKey}: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, mode: "live", updated, settled, reset, errors });
}

/**
 * Sweep mode (?sweep=1, runs every 5 minutes):
 * Full 3-day settlement sweep across all sports — catches any completions missed by live mode.
 */
async function runSettlementSweep() {
  const settled: string[] = [];
  const errors: string[] = [];

  for (const sportKey of Object.keys(ESPN_SPORT_MAP)) {
    try {
      const espnEvents = await fetchEspnRecentEvents(sportKey, 3);

      for (const espnEvent of espnEvents) {
        if (!espnEvent.completed) continue;

        const event = await prisma.event.findUnique({
          where: { espnEventId: espnEvent.id },
        });
        if (!event || event.status === EventStatus.COMPLETED) continue;

        let homeScore = Math.round(espnEvent.homeScore);
        let awayScore = Math.round(espnEvent.awayScore);
        if (espnEvent.wentToExtraTime) {
          const drawScore = Math.min(homeScore, awayScore);
          homeScore = drawScore;
          awayScore = drawScore;
        }

        await prisma.event.update({
          where: { id: event.id },
          data: {
            homeScore,
            awayScore,
            liveHomeScore: null,
            liveAwayScore: null,
            liveClock: null,
            status: EventStatus.COMPLETED,
            completedAt: new Date(),
          },
        });

        await settleEvent(event.id);
        settled.push(`${event.homeTeam} vs ${event.awayTeam}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${sportKey}: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, mode: "sweep", settled, errors });
}
