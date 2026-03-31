import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ESPN_SPORT_MAP, fetchEspnRecentEvents } from "@/lib/espn-api";
import { settleEvent } from "@/lib/settle";
import { EventStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

        // If a soccer match went to extra time/penalties, regulation ended as a draw.
        // Store equal scores so bets settle on the 90-minute result.
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

  return NextResponse.json({ ok: true, settled, errors });
}
