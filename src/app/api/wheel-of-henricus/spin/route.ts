import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isWheelDisabled, wheelDisabledResponse } from "@/lib/betting-status";
import { MAX_DEBT } from "@/lib/bet-limits";
import {
  SPIN_STAKE,
  MAX_SPINS_PER_FRAME,
  pickRandomAssignee,
  getOrCreateActiveFrame,
  eligibleWheelUsers,
} from "@/lib/wheel-of-henricus";
import { notifyHenricusChampionSelected } from "@/lib/discord-notify";

export const dynamic = "force-dynamic";

class SpinError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function POST() {
  if (isWheelDisabled()) return wheelDisabledResponse();

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { saldoTibiaCoins: true },
      });
      if (!user) throw new SpinError("User not found", 404);

      if (user.saldoTibiaCoins - SPIN_STAKE < -MAX_DEBT.TIBIA_COINS) {
        throw new SpinError(
          `Debt limit reached (${MAX_DEBT.TIBIA_COINS} TC). Pay out your debt to keep spinning.`
        );
      }

      const frame = await getOrCreateActiveFrame(tx);

      const mySpins = await tx.henricusSpin.findMany({
        where: { frameId: frame.id, spinnerUserId: userId },
        select: { assignedUserId: true },
      });
      if (mySpins.length >= MAX_SPINS_PER_FRAME) {
        throw new SpinError(
          `You've used all ${MAX_SPINS_PER_FRAME} spins for this round. Wait for the wheel to settle.`
        );
      }

      const pool = await eligibleWheelUsers(tx, userId);
      if (pool.length === 0) {
        throw new SpinError(
          "No guildmates with aliases set yet. The wheel needs more participants."
        );
      }

      // Each of a user's up-to-3 spins must land a distinct champion: settlement
      // pays per winning spin, so a duplicate champion would multiply the payout
      // on a single death. Exclude everyone this user already drew this round.
      const alreadyDrawn = new Set(mySpins.map((s) => s.assignedUserId));
      const availablePool = pool.filter((u) => !alreadyDrawn.has(u.id));
      if (availablePool.length === 0) {
        throw new SpinError(
          "You've already drawn every available guildmate this round."
        );
      }

      const assignee = pickRandomAssignee(availablePool);

      const spin = await tx.henricusSpin.create({
        data: {
          frameId: frame.id,
          spinnerUserId: userId,
          assignedUserId: assignee.id,
          assignedAlias: assignee.alias,
          stake: SPIN_STAKE,
        },
        select: { id: true, createdAt: true },
      });

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { saldoTibiaCoins: { decrement: SPIN_STAKE } },
        select: { saldoTibiaCoins: true },
      });

      await tx.henricusFrame.update({
        where: { id: frame.id },
        data: { totalSpinCount: { increment: 1 } },
      });

      return {
        spinId: spin.id,
        createdAt: spin.createdAt,
        assignedUserId: assignee.id,
        assignedAlias: assignee.alias,
        assignedDisplayName: assignee.name ?? assignee.alias,
        newBalance: updatedUser.saldoTibiaCoins,
        spinsRemaining: MAX_SPINS_PER_FRAME - mySpins.length - 1,
        frameId: frame.id,
      };
    });

    // Fire-and-forget Discord notification — never blocks the response.
    (async () => {
      const [spinner, champion] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            name: true,
            alias: true,
            accounts: {
              where: { provider: "discord" },
              select: { providerAccountId: true },
            },
          },
        }),
        prisma.user.findUnique({
          where: { id: result.assignedUserId },
          select: {
            name: true,
            alias: true,
            accounts: {
              where: { provider: "discord" },
              select: { providerAccountId: true },
            },
          },
        }),
      ]);
      await notifyHenricusChampionSelected({
        spinnerDisplayName: spinner?.alias ?? spinner?.name ?? "Unknown",
        spinnerDiscordId: spinner?.accounts[0]?.providerAccountId ?? null,
        championDisplayName: champion?.alias ?? champion?.name ?? result.assignedAlias,
        championDiscordId: champion?.accounts[0]?.providerAccountId ?? null,
        championAlias: result.assignedAlias,
      });
    })().catch(() => {});

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SpinError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof Error && err.message === "WHEEL_POOL_EMPTY") {
      return NextResponse.json(
        { error: "No guildmates with aliases set yet." },
        { status: 400 }
      );
    }
    console.error("[wheel-of-henricus/spin]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
