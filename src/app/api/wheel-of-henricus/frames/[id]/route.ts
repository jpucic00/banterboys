import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const isAdmin =
    session?.user?.role === "ADMIN" || isAdminEmail(session?.user?.email);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const frame = await prisma.henricusFrame.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      totalSpinCount: true,
      totalPayout: true,
      deadAlias: true,
      deadAtServer: true,
      deadAtTibia: true,
      deathLevel: true,
      deathReason: true,
      createdAt: true,
      settledAt: true,
      spins: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          createdAt: true,
          assignedAlias: true,
          stake: true,
          payout: true,
          isWinner: true,
          spinner: { select: { id: true, name: true, alias: true, image: true } },
          assigned: { select: { id: true, name: true, alias: true, image: true } },
        },
      },
    },
  });

  if (!frame) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  return NextResponse.json(frame);
}
