import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const spins = await prisma.slotSpin.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      stake: true,
      payout: true,
      multiplier: true,
      symbols: true,
      currency: true,
      isFreeSpin: true,
      createdAt: true,
      user: { select: { name: true, alias: true, image: true } },
    },
  });
  return NextResponse.json({ spins });
}
