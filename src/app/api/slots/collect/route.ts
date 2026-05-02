import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SLOTS_DISABLED } from "@/lib/slots";

export const dynamic = "force-dynamic";

/**
 * Collect: end the active double-or-nothing chain.
 *
 * Winnings were already credited to saldo at spin time, so there's no balance
 * change — this endpoint just clears the active-gamble state so the player
 * can spin again without the gamble UI showing up.
 */
export async function POST() {
  if (SLOTS_DISABLED) return NextResponse.json({ error: "Not Found" }, { status: 404 });

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: { activeGambleAmount: 0, activeGambleRounds: 0 },
    select: { saldoTibiaCoins: true },
  });

  return NextResponse.json({
    newBalance: updated.saldoTibiaCoins,
    activeGambleAmount: 0,
    activeGambleRounds: 0,
  });
}
