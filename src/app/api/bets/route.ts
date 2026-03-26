import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EventStatus, PvPBetStatus } from "@prisma/client";

export async function GET() {
  const bets = await prisma.pvPBet.findMany({
    include: {
      creator: { select: { id: true, name: true, alias: true, image: true } },
      acceptor: { select: { id: true, name: true, alias: true, image: true } },
      event: { include: { sport: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(bets);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { eventId, pick, amount, odds, currency } = body;

  if (!eventId || !pick || !amount || !odds) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.status !== EventStatus.UPCOMING) {
    return NextResponse.json(
      { error: "Event not available for betting" },
      { status: 400 }
    );
  }

  const bet = await prisma.pvPBet.create({
    data: {
      creatorId: session.user.id,
      eventId,
      pick,
      amount: parseFloat(amount),
      odds: parseFloat(odds),
      currency: currency || "GOLD",
    },
    include: {
      creator: { select: { id: true, name: true, alias: true, image: true } },
      event: { include: { sport: true } },
    },
  });

  return NextResponse.json(bet, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { betId, action } = body;

  if (action === "join") {
    const bet = await prisma.pvPBet.findUnique({ where: { id: betId } });
    if (!bet || bet.status !== PvPBetStatus.OPEN) {
      return NextResponse.json({ error: "Bet not available" }, { status: 400 });
    }
    if (bet.creatorId === session.user.id) {
      return NextResponse.json(
        { error: "Cannot join your own bet" },
        { status: 400 }
      );
    }

    const updated = await prisma.pvPBet.update({
      where: { id: betId },
      data: {
        acceptorId: session.user.id,
        status: PvPBetStatus.MATCHED,
      },
      include: {
        creator: { select: { id: true, name: true, alias: true, image: true } },
        acceptor: { select: { id: true, name: true, alias: true, image: true } },
        event: { include: { sport: true } },
      },
    });

    return NextResponse.json(updated);
  }

  if (action === "cancel") {
    const bet = await prisma.pvPBet.findUnique({ where: { id: betId } });
    if (!bet || bet.status !== PvPBetStatus.OPEN) {
      return NextResponse.json(
        { error: "Bet cannot be cancelled" },
        { status: 400 }
      );
    }
    if (bet.creatorId !== session.user.id) {
      return NextResponse.json(
        { error: "Only creator can cancel" },
        { status: 403 }
      );
    }

    const updated = await prisma.pvPBet.update({
      where: { id: betId },
      data: { status: PvPBetStatus.CANCELLED },
    });

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
