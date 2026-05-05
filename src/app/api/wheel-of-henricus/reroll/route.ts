import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isBettingDisabled, bettingDisabledResponse } from "@/lib/betting-status";
import { MAX_DEBT } from "@/lib/bet-limits";
import {
  rerollCost,
  pickRandomAssignee,
  getOrCreateActiveFrame,
  eligibleWheelUsers,
} from "@/lib/wheel-of-henricus";
import { notifyHenricusChampionSelected } from "@/lib/discord-notify";

export const dynamic = "force-dynamic";

class RerollError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function POST() {
  if (isBettingDisabled()) return bettingDisabledResponse();

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
      if (!user) throw new RerollError("User not found", 404);

      const frame = await getOrCreateActiveFrame(tx);

      const existingSpin = await tx.henricusSpin.findFirst({
        where: { frameId: frame.id, spinnerUserId: userId },
        select: {
          id: true,
          rerollCount: true,
          assignedUserId: true,
          assignedAlias: true,
          stake: true,
        },
      });
      if (!existingSpin) {
        throw new RerollError("You haven't spun yet this round. Spin first.");
      }

      const cost = rerollCost(existingSpin.rerollCount);

      if (user.saldoTibiaCoins - cost < -MAX_DEBT.TIBIA_COINS) {
        throw new RerollError(
          `Debt limit reached (${MAX_DEBT.TIBIA_COINS} TC). Pay out your debt to keep rerolling.`
        );
      }

      const pool = await eligibleWheelUsers(tx, userId);
      const filteredPool = pool.filter(
        (u) => u.id !== existingSpin.assignedUserId
      );
      if (filteredPool.length === 0) {
        throw new RerollError(
          "No other guildmates available to reroll to."
        );
      }

      const assignee = pickRandomAssignee(filteredPool);

      const newRerollCount = existingSpin.rerollCount + 1;

      await tx.henricusSpin.update({
        where: { id: existingSpin.id },
        data: {
          assignedUserId: assignee.id,
          assignedAlias: assignee.alias,
          rerollCount: newRerollCount,
          stake: existingSpin.stake + cost,
        },
      });

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { saldoTibiaCoins: { decrement: cost } },
        select: { saldoTibiaCoins: true },
      });

      return {
        spinId: existingSpin.id,
        assignedUserId: assignee.id,
        assignedAlias: assignee.alias,
        assignedDisplayName: assignee.name ?? assignee.alias,
        newBalance: updatedUser.saldoTibiaCoins,
        rerollCount: newRerollCount,
        nextRerollCost: rerollCost(newRerollCount),
        frameId: frame.id,
      };
    });

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
        championDisplayName:
          champion?.alias ?? champion?.name ?? result.assignedAlias,
        championDiscordId: champion?.accounts[0]?.providerAccountId ?? null,
        championAlias: result.assignedAlias,
      });
    })().catch(() => {});

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof RerollError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof Error && err.message === "WHEEL_POOL_EMPTY") {
      return NextResponse.json(
        { error: "No guildmates available to reroll to." },
        { status: 400 }
      );
    }
    console.error("[wheel-of-henricus/reroll]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
