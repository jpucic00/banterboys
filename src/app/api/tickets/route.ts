import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EventStatus } from "@prisma/client";
import { notifyTicketCreated } from "@/lib/discord-notify";

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

    let odds: number;
    if (sel.pick === "HOME") odds = latestOdds.homeOdds;
    else if (sel.pick === "AWAY") odds = latestOdds.awayOdds;
    else if (sel.pick === "DRAW" && latestOdds.drawOdds)
      odds = latestOdds.drawOdds;
    else {
      return NextResponse.json(
        { error: `Invalid pick for event` },
        { status: 400 }
      );
    }

    validSelections.push({ eventId: sel.eventId, pick: sel.pick, odds });
  }

  const totalOdds = validSelections.reduce((acc, s) => acc * s.odds, 1);
  const potentialPayout = parseFloat(amount) * totalOdds;

  const ticket = await prisma.ticket.create({
    data: {
      userId: session.user.id,
      totalOdds: Math.round(totalOdds * 100) / 100,
      amount: parseFloat(amount),
      currency: currency || "GOLD",
      potentialPayout: Math.round(potentialPayout * 100) / 100,
      selections: {
        create: validSelections.map((s) => ({
          eventId: s.eventId,
          pick: s.pick as "HOME" | "AWAY" | "DRAW",
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

  notifyTicketCreated(ticket, session.user).catch(() => {});
  return NextResponse.json(ticket, { status: 201 });
}
