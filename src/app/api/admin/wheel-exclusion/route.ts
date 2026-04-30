import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { SPIN_STAKE, getOrCreateActiveFrame } from "@/lib/wheel-of-henricus";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { userId, excluded } = body as { userId: string; excluded: boolean };

  if (!userId || typeof excluded !== "boolean") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (!excluded) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { excludedFromWheel: false },
      select: { id: true, alias: true, excludedFromWheel: true },
    });
    return NextResponse.json({ ...user, refundedSpinCount: 0 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const frame = await getOrCreateActiveFrame(tx);

    const spins = await tx.henricusSpin.findMany({
      where: { frameId: frame.id, assignedUserId: userId },
      select: { id: true, spinnerUserId: true },
    });

    const refundsBySpinner = new Map<string, number>();
    for (const s of spins) {
      refundsBySpinner.set(
        s.spinnerUserId,
        (refundsBySpinner.get(s.spinnerUserId) ?? 0) + SPIN_STAKE
      );
    }

    for (const [spinnerUserId, amount] of refundsBySpinner) {
      await tx.user.update({
        where: { id: spinnerUserId },
        data: { saldoTibiaCoins: { increment: amount } },
      });
    }

    if (spins.length > 0) {
      await tx.henricusSpin.deleteMany({
        where: { id: { in: spins.map((s) => s.id) } },
      });
      await tx.henricusFrame.update({
        where: { id: frame.id },
        data: { totalSpinCount: { decrement: spins.length } },
      });
    }

    const user = await tx.user.update({
      where: { id: userId },
      data: { excludedFromWheel: true },
      select: { id: true, alias: true, excludedFromWheel: true },
    });

    return { user, refundedSpinCount: spins.length };
  });

  return NextResponse.json({
    ...result.user,
    refundedSpinCount: result.refundedSpinCount,
  });
}
