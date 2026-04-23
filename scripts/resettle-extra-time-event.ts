/**
 * Re-settle an event that was incorrectly settled because its extra-time
 * status (e.g. STATUS_FINAL_AET / STATUS_FINAL_PEN) wasn't recognised.
 *
 * Usage:
 *   # Scan for candidates in the last N days (no writes):
 *   npx tsx --env-file=.env scripts/resettle-extra-time-event.ts --scan [--days 7]
 *
 *   # Dry-run a re-settle for one event (no writes):
 *   npx tsx --env-file=.env scripts/resettle-extra-time-event.ts --event <eventId>
 *   npx tsx --env-file=.env scripts/resettle-extra-time-event.ts --espn <espnEventId>
 *
 *   # Actually apply the re-settle:
 *   npx tsx --env-file=.env scripts/resettle-extra-time-event.ts --event <id> --commit
 *
 * What it does (for the chosen event):
 *   1. Re-fetches ESPN to confirm the match went to ET/pens.
 *   2. Reverses saldo adjustments done at the prior settlement.
 *   3. Resets ticket/selection/pvpBet status so settleEvent can run again.
 *   4. Updates the Event with forced regulation-draw scores (Math.min).
 *   5. Calls settleEvent(), which re-settles everything correctly.
 */

import { prisma } from "../src/lib/db";
import { settleEvent } from "../src/lib/settle";
import { ESPN_SPORT_MAP } from "../src/lib/espn-api";
import {
  EventStatus,
  SelectionResult,
  PvPBetStatus,
  TicketStatus,
} from "@prisma/client";

const EXTRA_TIME_STATUSES = new Set([
  "STATUS_OVERTIME",
  "STATUS_END_OF_EXTRA_TIME",
  "STATUS_PENALTIES",
  "STATUS_SHOOTOUT",
  "STATUS_FULL_TIME_ET",
  "STATUS_FULL_TIME_PEN",
  "STATUS_FINAL_AET",
  "STATUS_FINAL_PEN",
]);

type EspnRaw = {
  id: string;
  competitions: Array<{
    id?: string;
    status?: { type?: { name?: string; completed?: boolean; shortDetail?: string } };
    competitors?: Array<{ homeAway?: string; score?: string; winner?: boolean }>;
  }>;
};

async function fetchEspnRaw(
  sportKey: string,
  espnEventId: string,
  aroundDate: Date,
): Promise<{ name?: string; completed?: boolean; home?: number; away?: number } | null> {
  const path = ESPN_SPORT_MAP[sportKey];
  if (!path) return null;
  // Try a 3-day window around the event date to account for TZ/boundary issues.
  for (let offset = -1; offset <= 1; offset++) {
    const d = new Date(aroundDate.getTime() + offset * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
    const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${dateStr}&limit=100`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data: { events?: EspnRaw[] } = await res.json();
    for (const ev of data.events ?? []) {
      if (ev.id !== espnEventId) continue;
      const comp = ev.competitions?.[0];
      const name = comp?.status?.type?.name;
      const completed = comp?.status?.type?.completed;
      const home = comp?.competitors?.find((c) => c.homeAway === "home");
      const away = comp?.competitors?.find((c) => c.homeAway === "away");
      return {
        name,
        completed,
        home: home ? parseFloat(home.score ?? "0") || 0 : 0,
        away: away ? parseFloat(away.score ?? "0") || 0 : 0,
      };
    }
  }
  return null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out: {
    scan: boolean;
    days: number;
    eventId?: string;
    espnId?: string;
    commit: boolean;
  } = { scan: false, days: 7, commit: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--scan") out.scan = true;
    else if (a === "--commit") out.commit = true;
    else if (a === "--days") out.days = parseInt(args[++i] ?? "7", 10);
    else if (a === "--event") out.eventId = args[++i];
    else if (a === "--espn") out.espnId = args[++i];
    else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

async function scan(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const events = await prisma.event.findMany({
    where: {
      status: EventStatus.COMPLETED,
      completedAt: { gte: since },
      espnEventId: { not: null },
      homeScore: { not: null },
      awayScore: { not: null },
    },
    include: { sport: { select: { key: true } } },
    orderBy: { completedAt: "desc" },
  });
  console.log(`Scanning ${events.length} completed events since ${since.toISOString()}...`);

  const candidates: string[] = [];
  for (const ev of events) {
    if (ev.homeScore === ev.awayScore) continue; // already a draw in DB
    if (!ev.sport.key.startsWith("soccer_") && ev.sport.key !== "icehockey_nhl") continue;
    const raw = await fetchEspnRaw(ev.sport.key, ev.espnEventId!, ev.commenceTime);
    if (!raw?.name) continue;
    if (!EXTRA_TIME_STATUSES.has(raw.name)) continue;
    const line = `candidate: ${ev.id} | espn=${ev.espnEventId} | ${ev.sport.key} | ${ev.homeTeam} ${ev.homeScore}-${ev.awayScore} ${ev.awayTeam} | espn_status=${raw.name} (DB score is not a draw — should be re-settled)`;
    console.log(line);
    candidates.push(ev.id);
  }
  console.log(`\n${candidates.length} candidate(s) found.`);
  if (candidates.length > 0) {
    console.log("To re-settle one:");
    console.log(`  npx tsx --env-file=.env scripts/resettle-extra-time-event.ts --event ${candidates[0]} --commit`);
  }
}

async function resettleEvent(eventId: string, commit: boolean) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { sport: { select: { key: true } } },
  });
  if (!event) {
    console.error(`Event ${eventId} not found`);
    process.exit(1);
  }

  console.log(`Target event: ${event.homeTeam} vs ${event.awayTeam} (${event.sport.key})`);
  console.log(`  DB: status=${event.status} score=${event.homeScore}-${event.awayScore} espn=${event.espnEventId}`);

  if (!event.espnEventId) {
    console.error("Event has no espnEventId — cannot verify via ESPN.");
    process.exit(1);
  }

  const raw = await fetchEspnRaw(event.sport.key, event.espnEventId, event.commenceTime);
  if (!raw?.name) {
    console.error("Could not find event on ESPN scoreboard.");
    process.exit(1);
  }
  console.log(`  ESPN: status=${raw.name} completed=${raw.completed} score=${raw.home}-${raw.away}`);

  if (!EXTRA_TIME_STATUSES.has(raw.name)) {
    console.error(`ESPN status "${raw.name}" is not an extra-time status. Refusing to re-settle (safety check).`);
    process.exit(1);
  }

  const finalHome = Math.round(raw.home ?? 0);
  const finalAway = Math.round(raw.away ?? 0);
  const drawScore = Math.min(finalHome, finalAway);
  console.log(`  → Forced regulation draw: ${drawScore}-${drawScore}`);

  // ── Collect prior settlement state for this event ─────────────────────
  const selections = await prisma.ticketSelection.findMany({
    where: { eventId: event.id },
    include: {
      ticket: {
        include: {
          selections: true,
          user: { select: { id: true, name: true, alias: true } },
        },
      },
    },
  });
  const pvpBets = await prisma.pvPBet.findMany({ where: { eventId: event.id } });

  console.log(`\n${selections.length} ticket selection(s) on this event.`);
  console.log(`${pvpBets.length} PvP bet(s) on this event.`);

  // Tickets that touch this event
  const ticketMap = new Map<string, (typeof selections)[number]["ticket"]>();
  for (const s of selections) ticketMap.set(s.ticket.id, s.ticket);

  // Plan: saldo reversals
  // - Ticket was WON (and payout added): subtract potentialPayout from user saldo
  //   (at re-settle time, the correct payout will be re-added by settleEvent)
  // - Ticket was VOID (refund added = amount): subtract amount
  // - Ticket was LOST: no saldo change was applied on loss (stake was deducted at placement),
  //   so nothing to reverse. Re-settlement will handle it correctly.
  // - Ticket still PENDING: nothing to reverse.
  type SaldoOp = { userId: string; currency: "GOLD" | "TIBIA_COINS"; delta: number; reason: string };
  const saldoOps: SaldoOp[] = [];
  for (const t of ticketMap.values()) {
    if (t.status === TicketStatus.WON) {
      saldoOps.push({
        userId: t.userId,
        currency: t.currency,
        delta: -t.potentialPayout,
        reason: `revert WON payout ticket ${t.id}`,
      });
    } else if (t.status === TicketStatus.VOID) {
      saldoOps.push({
        userId: t.userId,
        currency: t.currency,
        delta: -t.amount,
        reason: `revert VOID refund ticket ${t.id}`,
      });
    }
  }

  console.log("\nPlanned reversal operations:");
  for (const op of saldoOps) {
    console.log(`  saldo: user=${op.userId} ${op.currency} ${op.delta >= 0 ? "+" : ""}${op.delta} — ${op.reason}`);
  }
  for (const t of ticketMap.values()) {
    console.log(`  ticket ${t.id}: status ${t.status} → PENDING`);
    // Reset effective odds/payout back to the product of original selection odds.
    const originalOdds = t.selections.reduce((acc, s) => acc * s.odds, 1);
    const originalPayout = t.amount * originalOdds;
    if (t.totalOdds !== originalOdds || t.potentialPayout !== originalPayout) {
      console.log(
        `    totalOdds ${t.totalOdds} → ${originalOdds}, potentialPayout ${t.potentialPayout} → ${originalPayout}`,
      );
    }
  }
  for (const s of selections) {
    console.log(`  selection ${s.id}: result ${s.result} → PENDING`);
  }
  // Only revert bets that were settled (WON_CREATOR/WON_ACCEPTOR/VOID).
  // CANCELLED = never matched at settlement time → leave as-is.
  for (const b of pvpBets) {
    const needsRevert =
      b.status === PvPBetStatus.WON_CREATOR ||
      b.status === PvPBetStatus.WON_ACCEPTOR ||
      b.status === PvPBetStatus.VOID;
    if (!needsRevert) continue;
    console.log(`  pvpBet ${b.id}: status ${b.status} → MATCHED`);
  }
  console.log(`  event ${event.id}: score ${event.homeScore}-${event.awayScore} → ${drawScore}-${drawScore}`);

  if (!commit) {
    console.log("\n[dry-run] No changes applied. Re-run with --commit to apply.");
    return;
  }

  console.log("\nApplying changes...");

  await prisma.$transaction(async (tx) => {
    // 1. Reverse saldo
    for (const op of saldoOps) {
      const field = op.currency === "GOLD" ? "saldoGold" : "saldoTibiaCoins";
      await tx.user.update({
        where: { id: op.userId },
        data: { [field]: { increment: op.delta } },
      });
    }

    // 2. Reset tickets that touched this event
    for (const t of ticketMap.values()) {
      const originalOdds = t.selections.reduce((acc, s) => acc * s.odds, 1);
      const originalPayout = t.amount * originalOdds;
      await tx.ticket.update({
        where: { id: t.id },
        data: {
          status: TicketStatus.PENDING,
          settledAt: null,
          totalOdds: originalOdds,
          potentialPayout: originalPayout,
        },
      });
    }

    // 3. Reset this event's selections
    await tx.ticketSelection.updateMany({
      where: { eventId: event.id },
      data: { result: SelectionResult.PENDING },
    });

    // 4. Reset PvP bets that were settled (by the event result)
    for (const b of pvpBets) {
      const needsRevert =
        b.status === PvPBetStatus.WON_CREATOR ||
        b.status === PvPBetStatus.WON_ACCEPTOR ||
        b.status === PvPBetStatus.VOID;
      if (!needsRevert) continue;
      await tx.pvPBet.update({
        where: { id: b.id },
        data: { status: PvPBetStatus.MATCHED, settledAt: null },
      });
    }

    // 5. Update event with forced-draw regulation scores
    await tx.event.update({
      where: { id: event.id },
      data: {
        homeScore: drawScore,
        awayScore: drawScore,
        status: EventStatus.COMPLETED,
      },
    });
  });

  console.log("Reversal complete. Running settleEvent()...");
  await settleEvent(event.id);
  console.log("Done.");
}

(async () => {
  try {
    const args = parseArgs();

    if (args.scan) {
      await scan(args.days);
    } else if (args.eventId) {
      await resettleEvent(args.eventId, args.commit);
    } else if (args.espnId) {
      const ev = await prisma.event.findUnique({ where: { espnEventId: args.espnId } });
      if (!ev) {
        console.error(`No event found with espnEventId=${args.espnId}`);
        process.exit(1);
      }
      await resettleEvent(ev.id, args.commit);
    } else {
      console.error("Pass --scan, --event <id>, or --espn <espnId>. See header comment for usage.");
      process.exit(2);
    }
  } finally {
    await prisma.$disconnect();
  }
})();
