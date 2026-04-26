import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  GAMBLE_CARDS,
  MAX_GAMBLE_ROUNDS,
  MAX_SLOT_DEBT,
} from "@/lib/slots";
import { checkSlotThrottle } from "@/lib/slots-rate-limit";
import { isBettingDisabled, bettingDisabledResponse } from "@/lib/betting-status";

export const dynamic = "force-dynamic";

/**
 * Double-or-nothing gamble on the last winning spin's net gain.
 *
 * Body: `{ pickIndex: number }` — which of GAMBLE_CARDS the player picked.
 *
 * Server picks the winning index with a CSPRNG. If the player picked right,
 * their winnings double; if wrong, they lose the amount at stake (which
 * was already credited at spin time, so saldo is decremented).
 */
export async function POST(req: NextRequest) {
  if (isBettingDisabled()) return bettingDisabledResponse();

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const wait = checkSlotThrottle(userId);
  if (wait !== null) {
    return NextResponse.json(
      { error: "Too fast — slow down.", retryAfterMs: wait },
      { status: 429 }
    );
  }

  let body: { pickIndex?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pickIndex = Number(body.pickIndex);
  if (
    !Number.isInteger(pickIndex) ||
    pickIndex < 0 ||
    pickIndex >= GAMBLE_CARDS
  ) {
    return NextResponse.json(
      { error: `Pick must be an integer 0..${GAMBLE_CARDS - 1}.` },
      { status: 400 }
    );
  }

  // Decide the outcome server-side before any DB write.
  const winIndex = randomInt(GAMBLE_CARDS);
  const won = pickIndex === winIndex;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          saldoTibiaCoins: true,
          activeGambleAmount: true,
          activeGambleRounds: true,
        },
      });
      if (!user) throw new Error("USER_NOT_FOUND");
      if (user.activeGambleAmount <= 0) throw new Error("NO_ACTIVE_GAMBLE");
      if (user.activeGambleRounds >= MAX_GAMBLE_ROUNDS) {
        throw new Error("MAX_ROUNDS");
      }

      const amount = user.activeGambleAmount;

      const round = user.activeGambleRounds + 1;

      if (won) {
        // Credit the matched amount — winnings double.
        const nextAmount = amount * 2;
        const updated = await tx.user.update({
          where: { id: userId },
          data: {
            saldoTibiaCoins: { increment: amount },
            activeGambleAmount: nextAmount,
            activeGambleRounds: { increment: 1 },
          },
          select: {
            saldoTibiaCoins: true,
            activeGambleAmount: true,
            activeGambleRounds: true,
          },
        });
        await tx.slotGambleRound.create({
          data: { userId, amount, won: true, round },
        });
        return {
          won,
          winIndex,
          amountAtRisk: amount,
          newBalance: updated.saldoTibiaCoins,
          activeGambleAmount: updated.activeGambleAmount,
          activeGambleRounds: updated.activeGambleRounds,
        };
      }

      // Lose: debt cap applies here too so a bad gamble doesn't put the
      // player below the slot debt floor.
      if (user.saldoTibiaCoins - amount < -MAX_SLOT_DEBT) {
        throw new Error("DEBT_LIMIT");
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          saldoTibiaCoins: { decrement: amount },
          activeGambleAmount: 0,
          activeGambleRounds: 0,
        },
        select: {
          saldoTibiaCoins: true,
          activeGambleAmount: true,
          activeGambleRounds: true,
        },
      });
      await tx.slotGambleRound.create({
        data: { userId, amount, won: false, round },
      });
      return {
        won,
        winIndex,
        amountAtRisk: amount,
        newBalance: updated.saldoTibiaCoins,
        activeGambleAmount: updated.activeGambleAmount,
        activeGambleRounds: updated.activeGambleRounds,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    if (msg === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    if (msg === "NO_ACTIVE_GAMBLE") {
      return NextResponse.json(
        { error: "No active gamble to resolve." },
        { status: 400 }
      );
    }
    if (msg === "MAX_ROUNDS") {
      return NextResponse.json(
        { error: `Max gamble rounds reached (${MAX_GAMBLE_ROUNDS}). Collect your winnings.` },
        { status: 400 }
      );
    }
    if (msg === "DEBT_LIMIT") {
      return NextResponse.json(
        {
          error: `This gamble would breach the ${MAX_SLOT_DEBT} TC debt limit.`,
        },
        { status: 400 }
      );
    }
    console.error("[slots/gamble]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
