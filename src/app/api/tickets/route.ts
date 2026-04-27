import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Currency, EventStatus, TicketStatus } from "@prisma/client";
import { notifyTicketCreated, notifyTicketCancelled } from "@/lib/discord-notify";
import { adjustSaldo } from "@/lib/saldo";
import { isAdminEmail } from "@/lib/admin";
import { isBettingDisabled, bettingDisabledResponse } from "@/lib/betting-status";
import {
  slipSignature,
  validateTicketPlacement,
} from "@/lib/bet-limits";

class TicketValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tickets = await prisma.ticket.findMany({
    where: { userId: session.user.id },
    include: {
      selections: {
        include: { event: { include: { sport: true } } },
      },
      user: { select: { id: true, name: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(tickets);
}

export async function POST(req: NextRequest) {
  if (isBettingDisabled()) return bettingDisabledResponse();

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { selections, amount, currency } = body;

  if (
    !selections ||
    !Array.isArray(selections) ||
    selections.length === 0 ||
    !amount
  ) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const parsedAmount = parseFloat(amount);
  const resolvedCurrency: Currency =
    currency === "TIBIA_COINS" ? Currency.TIBIA_COINS : Currency.GOLD;

  // Validate all events are upcoming and get current odds
  const validSelections: {
    eventId: string;
    pick: string;
    odds: number;
  }[] = [];

  for (const sel of selections) {
    const event = await prisma.event.findUnique({ where: { id: sel.eventId } });
    if (!event || event.status !== EventStatus.UPCOMING || event.commenceTime <= new Date()) {
      return NextResponse.json(
        { error: `Event ${sel.eventId} not available` },
        { status: 400 }
      );
    }

    // Get latest odds for this event
    const latestOdds = await prisma.oddsSnapshot.findFirst({
      where: { eventId: sel.eventId },
      orderBy: { fetchedAt: "desc" },
    });

    if (!latestOdds) {
      return NextResponse.json(
        { error: `No odds available for ${event.homeTeam} vs ${event.awayTeam}` },
        { status: 400 }
      );
    }

    let odds: number | null = null;
    if (sel.pick === "HOME") odds = latestOdds.homeOdds;
    else if (sel.pick === "AWAY") odds = latestOdds.awayOdds;
    else if (sel.pick === "DRAW") odds = latestOdds.drawOdds;
    else if (sel.pick === "HOME_DRAW") odds = latestOdds.homeDrawOdds;
    else if (sel.pick === "AWAY_DRAW") odds = latestOdds.awayDrawOdds;

    if (!odds) {
      return NextResponse.json(
        { error: `Invalid pick for event` },
        { status: 400 }
      );
    }

    validSelections.push({ eventId: sel.eventId, pick: sel.pick, odds });
  }

  const totalOdds = validSelections.reduce((acc, s) => acc * s.odds, 1);
  const newSignature = slipSignature(validSelections);

  try {
    const ticket = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: session.user.id },
        select: { saldoGold: true, saldoTibiaCoins: true },
      });
      if (!user) throw new TicketValidationError("User not found", 404);

      const currentBalance =
        resolvedCurrency === Currency.GOLD
          ? user.saldoGold
          : user.saldoTibiaCoins;

      const check = validateTicketPlacement({
        amount: parsedAmount,
        currency: resolvedCurrency,
        totalOdds,
        currentBalance,
      });
      if (!check.ok) throw new TicketValidationError(check.message);
      const potentialPayout = check.potentialPayout;

      // Duplicate detection: reject if the user already holds an active
      // (PENDING) slip with the exact same set of (event, pick) pairs.
      const existingPending = await tx.ticket.findMany({
        where: { userId: session.user.id, status: TicketStatus.PENDING },
        select: { selections: { select: { eventId: true, pick: true } } },
      });
      const duplicate = existingPending.some(
        (t) => slipSignature(t.selections) === newSignature
      );
      if (duplicate) {
        throw new TicketValidationError(
          "You already have an active bet slip with these exact picks."
        );
      }

      const created = await tx.ticket.create({
        data: {
          userId: session.user.id,
          totalOdds: Math.round(totalOdds * 100) / 100,
          amount: parsedAmount,
          currency: resolvedCurrency,
          potentialPayout: Math.round(potentialPayout * 100) / 100,
          selections: {
            create: validSelections.map((s) => ({
              eventId: s.eventId,
              pick: s.pick as "HOME" | "AWAY" | "DRAW" | "HOME_DRAW" | "AWAY_DRAW",
              odds: s.odds,
            })),
          },
        },
        include: {
          selections: {
            include: { event: { include: { sport: true } } },
          },
        },
      });

      const field =
        resolvedCurrency === Currency.GOLD ? "saldoGold" : "saldoTibiaCoins";
      await tx.user.update({
        where: { id: session.user.id },
        data: { [field]: { decrement: parsedAmount } },
      });

      return created;
    });

    notifyTicketCreated(ticket, session.user).catch(() => {});
    return NextResponse.json(ticket, { status: 201 });
  } catch (err) {
    if (err instanceof TicketValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[tickets]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const body = await req.json();
  const { ticketId, action } = body;

  if (action !== "cancel") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.status !== TicketStatus.PENDING) {
    return NextResponse.json(
      { error: "Ticket cannot be cancelled" },
      { status: 400 }
    );
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: TicketStatus.VOID, settledAt: new Date() },
    include: {
      selections: { include: { event: { include: { sport: true } } } },
      user: { select: { id: true, name: true, image: true } },
    },
  });

  await adjustSaldo(ticket.userId, ticket.currency, ticket.amount);
  notifyTicketCancelled(updated).catch(() => {});
  return NextResponse.json(updated);
}
