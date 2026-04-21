import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Currency } from "@prisma/client";
import {
  spinReels,
  resolveSpin,
  STAKE_LIMITS,
  DISCORD_NOTIFY_MULTIPLIER,
  MAX_SLOT_DEBT,
} from "@/lib/slots";
import { checkSlotThrottle } from "@/lib/slots-rate-limit";
import { notifySlotWin } from "@/lib/discord-notify";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const wait = checkSlotThrottle(userId);
  if (wait !== null) {
    return NextResponse.json(
      { error: "Spinning too fast — slow down.", retryAfterMs: wait },
      { status: 429 }
    );
  }

  let body: { stake?: unknown; currency?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only TIBIA_COINS is supported at launch.
  if (body.currency !== "TIBIA_COINS") {
    return NextResponse.json(
      { error: "Only Tibia Coins are supported right now." },
      { status: 400 }
    );
  }
  const currency = Currency.TIBIA_COINS;

  const stake = Number(body.stake);
  if (
    !Number.isFinite(stake) ||
    !Number.isInteger(stake) ||
    stake <= 0
  ) {
    return NextResponse.json(
      { error: "Stake must be a positive integer." },
      { status: 400 }
    );
  }

  const limits = STAKE_LIMITS.TIBIA_COINS;
  if (stake < limits.min || stake > limits.max) {
    return NextResponse.json(
      { error: `Stake must be between ${limits.min} and ${limits.max} TC.` },
      { status: 400 }
    );
  }

  // Decide the outcome server-side before any DB work.
  const symbols = spinReels();
  const { payout, multiplier } = resolveSpin(symbols, stake);
  const net = payout - stake;
  const symbolsStr = symbols.join(",");

  try {
    const { newBalance, spinId } = await prisma.$transaction(async (tx) => {
      // Balance is allowed to go negative — house tracks the debt via saldo
      // until it's paid off in-game. But cap the slot-side debt at MAX_SLOT_DEBT
      // so losses can't spiral indefinitely.
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { saldoTibiaCoins: true },
      });
      if (!user) throw new Error("USER_NOT_FOUND");

      // Worst case: the spin loses and net = -stake. Check against debt cap.
      if (user.saldoTibiaCoins - stake < -MAX_SLOT_DEBT) {
        throw new Error("DEBT_LIMIT");
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: { saldoTibiaCoins: { increment: net } },
        select: { saldoTibiaCoins: true },
      });

      const spin = await tx.slotSpin.create({
        data: {
          userId,
          currency,
          stake,
          payout,
          multiplier,
          symbols: symbolsStr,
        },
        select: { id: true },
      });

      return { newBalance: updated.saldoTibiaCoins, spinId: spin.id };
    });

    // Big-win Discord ping. Fire and forget — never blocks the response.
    if (multiplier >= DISCORD_NOTIFY_MULTIPLIER) {
      notifySlotWin({
        user: {
          name: session.user.name ?? null,
          alias:
            (session.user as { alias?: string | null }).alias ?? null,
        },
        stake,
        payout,
        multiplier,
        currency: "TIBIA_COINS",
        symbols,
      }).catch(() => {});
    }

    return NextResponse.json({
      spinId,
      symbols,
      payout,
      multiplier,
      newBalance,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    if (msg === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    if (msg === "DEBT_LIMIT") {
      return NextResponse.json(
        {
          error: `Slot debt limit reached (${MAX_SLOT_DEBT} TC). Settle with the house to keep playing.`,
        },
        { status: 400 }
      );
    }
    console.error("[slots/spin]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const spins = await prisma.slotSpin.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return NextResponse.json(spins);
}
