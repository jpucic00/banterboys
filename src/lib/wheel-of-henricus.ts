import type { Prisma, PrismaClient } from "@prisma/client";

function envNonNegativeInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export const SPIN_STAKE = envNonNegativeInt("HENRICUS_SPIN_STAKE", 25);
export const SPIN_PAYOUT = envNonNegativeInt("HENRICUS_SPIN_PAYOUT", 500);
export const MAX_SPINS_PER_FRAME = 3;

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"> | Prisma.TransactionClient;

export function pickRandomAssignee<T>(pool: T[]): T {
  if (pool.length === 0) {
    throw new Error("WHEEL_POOL_EMPTY");
  }
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

// There must always be exactly one ACTIVE frame at any time. The settlement
// cron creates a new ACTIVE frame in the same transaction that flips the
// previous one to SETTLED, so day-to-day this just returns the existing row.
// On a fresh DB (or if the active frame is somehow missing), lazily create it.
export async function getOrCreateActiveFrame(tx: Tx) {
  const existing = await tx.henricusFrame.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  return tx.henricusFrame.create({ data: { status: "ACTIVE" } });
}

export async function eligibleWheelUsers(
  tx: Tx,
  excludeUserId: string
): Promise<{ id: string; alias: string; name: string | null }[]> {
  const users = await tx.user.findMany({
    where: {
      alias: { not: null },
      excludedFromWheel: false,
      id: { not: excludeUserId },
    },
    select: { id: true, alias: true, name: true },
  });
  return users.map((u) => ({ id: u.id, alias: u.alias as string, name: u.name }));
}
