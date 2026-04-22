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
  FREE_SPINS_AWARDED,
  FREE_SPIN_WIN_MULTIPLIER,
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

  const requestedStake = Number(body.stake);
  const limits = STAKE_LIMITS.TIBIA_COINS;
  // Note: stake is validated only on the paid-spin branch inside the
  // transaction. Free spins use the server-locked stake instead.

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          saldoTibiaCoins: true,
          activeFreeSpins: true,
          freeSpinStake: true,
          activeGambleAmount: true,
        },
      });
      if (!user) throw new Error("USER_NOT_FOUND");

      const inBonus = user.activeFreeSpins > 0;

      // Lock stake from server state for free spins; otherwise trust client input.
      let stake: number;
      if (inBonus) {
        stake = user.freeSpinStake;
      } else {
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
        stake = requestedStake;
      }

      const symbols = spinReels();
      const baseResult = resolveSpin(symbols, stake);
      const { bonusTrigger } = baseResult;
      // Bonus-round wins are boosted by FREE_SPIN_WIN_MULTIPLIER. The stake
      // stored on the SlotSpin row stays at the locked value so the effective
      // multiplier (payout / stake) reflects the boost for analytics.
      const boost = inBonus ? FREE_SPIN_WIN_MULTIPLIER : 1;
      const payout = baseResult.payout * boost;
      const multiplier = baseResult.multiplier * boost;
      const symbolsStr = symbols.join(",");

      let newFreeSpins: number;
      let newFreeSpinStake: number;
      let newGambleAmount: number;
      let saldoDelta: number;

      if (inBonus) {
        // Free spin: no stake debit. Credit any payout. Each winning free spin
        // gets its own double-or-nothing opportunity (same pattern as paid
        // spins), so seed the gamble from this spin's payout — any pending
        // gamble from the previous free spin is auto-collected.
        // Retriggers on 3 jokers add more free spins.
        saldoDelta = payout;
        newFreeSpins =
          user.activeFreeSpins - 1 + (bonusTrigger ? FREE_SPINS_AWARDED : 0);
        newFreeSpinStake = newFreeSpins > 0 ? user.freeSpinStake : 0;
        newGambleAmount = payout > 0 ? payout : 0;
      } else if (bonusTrigger) {
        // Paid spin that triggered the bonus: debit stake, no payout this spin.
        saldoDelta = -stake;
        newFreeSpins = FREE_SPINS_AWARDED;
        newFreeSpinStake = stake;
        newGambleAmount = 0;
      } else {
        // Ordinary paid spin. Existing behavior: net = payout - stake, seed
        // gamble with the full payout (auto-collecting any prior gamble).
        saldoDelta = payout - stake;
        newFreeSpins = 0;
        newFreeSpinStake = 0;
        newGambleAmount = payout > 0 ? payout : 0;
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          saldoTibiaCoins: { increment: saldoDelta },
          activeFreeSpins: newFreeSpins,
          freeSpinStake: newFreeSpinStake,
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
          isFreeSpin: inBonus,
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
        bonusTrigger,
        isFreeSpin: inBonus,
        activeFreeSpins: newFreeSpins,
        freeSpinStake: newFreeSpinStake,
        activeGambleAmount: newGambleAmount,
      };
    });

    // Big-win Discord ping, plus a special ping when the joker bonus triggers.
    // Fire and forget — never blocks the response.
    if (result.multiplier >= DISCORD_NOTIFY_MULTIPLIER || result.bonusTrigger) {
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
        bonusTrigger: result.bonusTrigger,
        isFreeSpin: result.isFreeSpin,
      }).catch(() => {});
    }

    return NextResponse.json({
      spinId: result.spinId,
      symbols: result.symbols,
      payout: result.payout,
      multiplier: result.multiplier,
      stake: result.stake,
      newBalance: result.newBalance,
      bonusTrigger: result.bonusTrigger,
      isFreeSpin: result.isFreeSpin,
      activeFreeSpins: result.activeFreeSpins,
      freeSpinStake: result.freeSpinStake,
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
