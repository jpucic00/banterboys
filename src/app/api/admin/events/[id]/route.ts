import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { settleEvent } from "@/lib/settle";
import { EventStatus } from "@prisma/client";

async function loadCustomEvent(id: string) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: { sport: true, _count: { select: { selections: true, pvpBets: true } } },
  });
  if (!event) return { error: "Event not found" as const, status: 404 as const };
  if (!event.sport.key.startsWith("custom_")) {
    return { error: "Not a custom event" as const, status: 400 as const };
  }
  return { event };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const loaded = await loadCustomEvent(id);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  const event = loaded.event;

  const body = await req.json().catch(() => null);
  const action = body?.action as "settle" | "cancel" | undefined;

  if (action === "settle") {
    if (event.status === EventStatus.COMPLETED || event.status === EventStatus.CANCELLED) {
      return NextResponse.json({ error: "Already settled" }, { status: 400 });
    }
    const winner = body?.winner as "HOME" | "AWAY" | "DRAW" | undefined;
    if (winner !== "HOME" && winner !== "AWAY" && winner !== "DRAW") {
      return NextResponse.json({ error: "winner must be HOME, AWAY, or DRAW" }, { status: 400 });
    }
    const homeScore = winner === "HOME" ? 1 : 0;
    const awayScore = winner === "AWAY" ? 1 : 0;

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
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel") {
    if (event.status === EventStatus.COMPLETED || event.status === EventStatus.CANCELLED) {
      return NextResponse.json({ error: "Already settled" }, { status: 400 });
    }
    await prisma.event.update({
      where: { id: event.id },
      data: { status: EventStatus.CANCELLED, completedAt: new Date() },
    });
    await settleEvent(event.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const loaded = await loadCustomEvent(id);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  const event = loaded.event;

  if (event._count.selections > 0 || event._count.pvpBets > 0) {
    return NextResponse.json(
      { error: "Cannot delete: tickets or bets reference this event. Cancel it instead." },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.oddsSnapshot.deleteMany({ where: { eventId: event.id } }),
    prisma.event.delete({ where: { id: event.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
