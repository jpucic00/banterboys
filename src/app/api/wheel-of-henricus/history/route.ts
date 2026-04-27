import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  const isAdmin =
    session?.user?.role === "ADMIN" || isAdminEmail(session?.user?.email);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(50, Math.floor(limitParam))
    : 20;
  const before = req.nextUrl.searchParams.get("before");

  const frames = await prisma.henricusFrame.findMany({
    where: { status: "SETTLED" },
    orderBy: { settledAt: "desc" },
    take: limit + 1,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      settledAt: true,
      deadAlias: true,
      deadAtTibia: true,
      deathLevel: true,
      deathReason: true,
      totalSpinCount: true,
      totalPayout: true,
      spins: {
        where: { isWinner: true },
        select: {
          id: true,
          spinner: { select: { id: true, name: true, alias: true, image: true } },
        },
      },
    },
  });

  const hasMore = frames.length > limit;
  const items = (hasMore ? frames.slice(0, limit) : frames).map((f) => ({
    id: f.id,
    createdAt: f.createdAt,
    settledAt: f.settledAt,
    deadAlias: f.deadAlias,
    deadAtTibia: f.deadAtTibia,
    deathLevel: f.deathLevel,
    deathReason: f.deathReason,
    totalSpinCount: f.totalSpinCount,
    totalPayout: f.totalPayout,
    winners: f.spins.map((s) => ({
      id: s.id,
      name: s.spinner.name,
      alias: s.spinner.alias,
      image: s.spinner.image,
    })),
  }));

  return NextResponse.json({
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
  });
}
