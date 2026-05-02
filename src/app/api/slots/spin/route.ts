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
  SLOTS_DISABLED,
} from "@/lib/slots";
import { checkSlotThrottle } from "@/lib/slots-rate-limit";
import { notifySlotWin } from "@/lib/discord-notify";
import { isBettingDisabled, bettingDisabledResponse } from "@/lib/betting-status";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (SLOTS_DISABLED) return NextResponse.json({ error: "Not Found" }, { status: 404 });
  if (isBettingDisabled()) return bettingDisabledResponse();

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

  const requestedStake = Number(body.stake);
  const limits = STAKE_LIMITS.TIBIA_COINS;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          saldoTibiaCoins: true,
        },
      });
      if (!user) throw new Error("USER_NOT_FOUND");

      if (
        !Number.isFinite(requestedStake) ||
        !Number.isInteger(requestedStake) ||
        requestedStake <= 0
      ) {
        throw new Error("BAD_STAKE");
      }
      if (requestedStake < limits.min || requestedStake > limits.max) {
        throw new Error("STAKE_OUT_OF_RANGE");
      }
      // Worst case: the spin loses and net = -stake. Check against debt cap.
      if (user.saldoTibiaCoins - requestedStake < -MAX_SLOT_DEBT) {
        throw new Error("DEBT_LIMIT");
      }
      const stake = requestedStake;

      const symbols = spinReels();
      const spinResult = resolveSpin(symbols, stake);
      const payout = spinResult.payout;
      const multiplier = spinResult.multiplier;
      const symbolsStr = symbols.join(",");

      const saldoDelta = payout - stake;
      const newGambleAmount = payout > 0 ? payout : 0;

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          saldoTibiaCoins: { increment: saldoDelta },
          activeGambleAmount: newGambleAmount,
          activeGambleRounds: 0,
        },
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

      return {
        newBalance: updated.saldoTibiaCoins,
        spinId: spin.id,
        symbols,
        payout,
        multiplier,
        stake,
        wildUsed: spinResult.wildUsed,
        activeGambleAmount: newGambleAmount,
      };
    });

    // Big-win Discord ping, plus a special ping for the Triple Jester (all
    // three reels joker — pays Triple Demon, flavor-distinct from a regular
    // Demon triple). Fire and forget — never blocks the response.
    const tripleJester = result.symbols.every((s) => s === "joker");
    if (result.multiplier >= DISCORD_NOTIFY_MULTIPLIER || tripleJester) {
      notifySlotWin({
        user: {
          name: session.user.name ?? null,
          alias:
            (session.user as { alias?: string | null }).alias ?? null,
        },
        stake: result.stake,
        payout: result.payout,
        multiplier: result.multiplier,
        currency: "TIBIA_COINS",
        symbols: result.symbols,
        wildUsed: result.wildUsed,
      }).catch(() => {});
    }

    return NextResponse.json({
      spinId: result.spinId,
      symbols: result.symbols,
      payout: result.payout,
      multiplier: result.multiplier,
      stake: result.stake,
      newBalance: result.newBalance,
      wildUsed: result.wildUsed,
      activeGambleAmount: result.activeGambleAmount,
      activeGambleRounds: 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    if (msg === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    if (msg === "BAD_STAKE") {
      return NextResponse.json(
        { error: "Stake must be a positive integer." },
        { status: 400 }
      );
    }
    if (msg === "STAKE_OUT_OF_RANGE") {
      return NextResponse.json(
        { error: `Stake must be between ${limits.min} and ${limits.max} TC.` },
        { status: 400 }
      );
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
