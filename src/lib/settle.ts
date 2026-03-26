import { prisma } from "./db";
import { EventStatus, Pick, PvPBetStatus, SelectionResult } from "@prisma/client";

function getWinningPick(homeScore: number, awayScore: number): Pick {
  if (homeScore > awayScore) return Pick.HOME;
  if (awayScore > homeScore) return Pick.AWAY;
  return Pick.DRAW;
}

export async function settlePvPBets(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.status !== EventStatus.COMPLETED) return;
  if (event.homeScore === null || event.awayScore === null) return;

  const winningPick = getWinningPick(event.homeScore, event.awayScore);

  const matchedBets = await prisma.pvPBet.findMany({
    where: { eventId, status: PvPBetStatus.MATCHED },
  });

  for (const bet of matchedBets) {
    const creatorWon = bet.pick === winningPick;
    await prisma.pvPBet.update({
      where: { id: bet.id },
      data: {
        status: creatorWon
          ? PvPBetStatus.WON_CREATOR
          : PvPBetStatus.WON_ACCEPTOR,
        settledAt: new Date(),
      },
    });
  }

  // Cancel any unmatched open bets for this event
  await prisma.pvPBet.updateMany({
    where: { eventId, status: PvPBetStatus.OPEN },
    data: { status: PvPBetStatus.CANCELLED, settledAt: new Date() },
  });
}

export async function settleTicketSelections(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.status !== EventStatus.COMPLETED) return;
  if (event.homeScore === null || event.awayScore === null) return;

  const winningPick = getWinningPick(event.homeScore, event.awayScore);

  const selections = await prisma.ticketSelection.findMany({
    where: { eventId, result: SelectionResult.PENDING },
    include: { ticket: true },
  });

  for (const sel of selections) {
    const won = sel.pick === winningPick;
    await prisma.ticketSelection.update({
      where: { id: sel.id },
      data: { result: won ? SelectionResult.WON : SelectionResult.LOST },
    });
  }

  // Check if any tickets can be fully settled
  const ticketIds = [...new Set(selections.map((s) => s.ticketId))];
  for (const ticketId of ticketIds) {
    const allSelections = await prisma.ticketSelection.findMany({
      where: { ticketId },
    });

    const allResolved = allSelections.every(
      (s) => s.result !== SelectionResult.PENDING
    );
    if (!allResolved) continue;

    const anyLost = allSelections.some(
      (s) => s.result === SelectionResult.LOST
    );
    const anyVoid = allSelections.some(
      (s) => s.result === SelectionResult.VOID
    );

    let status: "WON" | "LOST" | "VOID";
    if (anyLost) {
      status = "LOST";
    } else if (anyVoid && allSelections.every((s) => s.result === SelectionResult.VOID)) {
      status = "VOID";
    } else {
      status = "WON";
    }

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status, settledAt: new Date() },
    });
  }
}

export async function settleEvent(eventId: string) {
  await settlePvPBets(eventId);
  await settleTicketSelections(eventId);
}
