import { prisma } from "./db";
import { EventStatus, Pick, PvPBetStatus, SelectionResult } from "@prisma/client";
import { notifyBetSettled, notifyBetVoided, notifyTicketSettled } from "./discord-notify";
import { adjustSaldo } from "./saldo";

function getWinningPick(homeScore: number, awayScore: number): Pick {
  if (homeScore > awayScore) return Pick.HOME;
  if (awayScore > homeScore) return Pick.AWAY;
  return Pick.DRAW;
}

function doesPickWin(pick: Pick, homeScore: number, awayScore: number): boolean {
  const result = getWinningPick(homeScore, awayScore);
  switch (pick) {
    case Pick.HOME:      return result === Pick.HOME;
    case Pick.AWAY:      return result === Pick.AWAY;
    case Pick.DRAW:      return result === Pick.DRAW;
    case Pick.HOME_DRAW: return result === Pick.HOME || result === Pick.DRAW;
    case Pick.AWAY_DRAW: return result === Pick.AWAY || result === Pick.DRAW;
  }
}

export async function settlePvPBets(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return;
  const isCancelled = event.status === EventStatus.CANCELLED;
  if (!isCancelled && event.status !== EventStatus.COMPLETED) return;
  if (!isCancelled && (event.homeScore === null || event.awayScore === null)) return;

  const matchedBets = await prisma.pvPBet.findMany({
    where: { eventId, status: PvPBetStatus.MATCHED },
  });

  for (const bet of matchedBets) {
    let status: PvPBetStatus;
    if (isCancelled) {
      status = PvPBetStatus.VOID;
    } else {
      const creatorWon = doesPickWin(bet.pick, event.homeScore!, event.awayScore!);
      if (bet.joinerPick) {
        // New-style bet: three-way outcome
        const acceptorWon = doesPickWin(bet.joinerPick, event.homeScore!, event.awayScore!);
        if (creatorWon) status = PvPBetStatus.WON_CREATOR;
        else if (acceptorWon) status = PvPBetStatus.WON_ACCEPTOR;
        else status = PvPBetStatus.VOID;
      } else {
        // Legacy bet: binary outcome
        status = creatorWon ? PvPBetStatus.WON_CREATOR : PvPBetStatus.WON_ACCEPTOR;
      }
    }

    await prisma.pvPBet.update({
      where: { id: bet.id },
      data: { status, settledAt: new Date() },
    });
    const settled = await prisma.pvPBet.findUnique({
      where: { id: bet.id },
      include: {
        creator: { select: { name: true, alias: true } },
        acceptor: { select: { name: true, alias: true } },
        event: true,
      },
    });
    if (settled) {
      if (status === PvPBetStatus.VOID) {
        notifyBetVoided(settled).catch(() => {});
      } else {
        notifyBetSettled(settled, status === PvPBetStatus.WON_CREATOR).catch(() => {});
      }
    }
  }

  // Cancel any unmatched open bets for this event
  await prisma.pvPBet.updateMany({
    where: { eventId, status: PvPBetStatus.OPEN },
    data: { status: PvPBetStatus.CANCELLED, settledAt: new Date() },
  });
}

export async function settleTicketSelections(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return;
  const isCancelled = event.status === EventStatus.CANCELLED;
  if (!isCancelled && event.status !== EventStatus.COMPLETED) return;
  if (!isCancelled && (event.homeScore === null || event.awayScore === null)) return;

  const selections = await prisma.ticketSelection.findMany({
    where: { eventId, result: SelectionResult.PENDING },
    include: { ticket: true },
  });

  for (const sel of selections) {
    let result: SelectionResult;
    if (isCancelled) {
      result = SelectionResult.VOID;
    } else {
      const won = doesPickWin(sel.pick, event.homeScore!, event.awayScore!);
      result = won ? SelectionResult.WON : SelectionResult.LOST;
    }
    await prisma.ticketSelection.update({
      where: { id: sel.id },
      data: { result },
    });
  }

  // Settle tickets: bust immediately on first loss, otherwise wait for all picks
  const ticketIds = [...new Set(selections.map((s) => s.ticketId))];
  for (const ticketId of ticketIds) {
    const allSelections = await prisma.ticketSelection.findMany({
      where: { ticketId },
    });

    const anyLost = allSelections.some((s) => s.result === SelectionResult.LOST);

    // Bust immediately if any pick lost — no need to wait for remaining picks
    if (anyLost) {
      // Atomic update: only the first concurrent caller transitions PENDING → LOST.
      // If count === 0 the ticket was already settled (race with live/sweep), skip notification.
      const { count } = await prisma.ticket.updateMany({
        where: { id: ticketId, status: "PENDING" },
        data: { status: "LOST", settledAt: new Date() },
      });
      if (count === 0) continue;

      // No saldo change on loss — stake was already deducted at placement

      const settled = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          user: { select: { name: true, alias: true } },
          selections: { include: { event: true } },
        },
      });
      if (settled) notifyTicketSettled(settled, "LOST").catch(() => {});
      continue;
    }

    // Otherwise only settle when all picks are resolved
    const allResolved = allSelections.every((s) => s.result !== SelectionResult.PENDING);
    if (!allResolved) continue;

    const allVoid = allSelections.every((s) => s.result === SelectionResult.VOID);
    const status = allVoid ? "VOID" : "WON";

    // Same atomic guard for WON/VOID transition
    const { count } = await prisma.ticket.updateMany({
      where: { id: ticketId, status: "PENDING" },
      data: { status, settledAt: new Date() },
    });
    if (count === 0) continue;

    // Recompute effective odds/payout when the ticket contains VOIDed legs: those
    // legs drop out and the remaining (WON) picks define the true payout.
    if (status === "WON") {
      const hasVoids = allSelections.some((s) => s.result === SelectionResult.VOID);
      if (hasVoids) {
        const wonSelections = allSelections.filter((s) => s.result === SelectionResult.WON);
        const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
        if (ticket) {
          const effectiveOdds = wonSelections.reduce((acc, s) => acc * s.odds, 1);
          const effectivePayout = ticket.amount * effectiveOdds;
          await prisma.ticket.update({
            where: { id: ticketId },
            data: { totalOdds: effectiveOdds, potentialPayout: effectivePayout },
          });
        }
      }
    }

    // Fetch ticket for saldo update and notification (reads the recomputed values)
    const settled = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { id: true, name: true, alias: true } },
        selections: { include: { event: true } },
      },
    });

    if (settled) {
      if (status === "WON") {
        await adjustSaldo(settled.userId, settled.currency, settled.potentialPayout);
        notifyTicketSettled(settled, status).catch(() => {});
      } else {
        // VOID — refund the original stake
        await adjustSaldo(settled.userId, settled.currency, settled.amount);
      }
    }
  }
}

export async function settleEvent(eventId: string) {
  await settlePvPBets(eventId);
  await settleTicketSelections(eventId);
}
