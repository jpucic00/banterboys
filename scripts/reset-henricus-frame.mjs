// One-time script: delete the active Henricus frame and refund all spins.
// Run: npx dotenv -- node scripts/reset-henricus-frame.mjs

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const frame = await prisma.henricusFrame.findFirst({
    where: { status: "ACTIVE" },
    include: {
      spins: { select: { id: true, spinnerUserId: true, stake: true } },
    },
  });

  if (!frame) {
    console.log("No active frame found. Nothing to do.");
    return;
  }

  console.log(
    `Active frame ${frame.id} — ${frame.spins.length} spin(s), ${frame.totalSpinCount} totalSpinCount`
  );

  if (frame.spins.length === 0) {
    await prisma.henricusFrame.delete({ where: { id: frame.id } });
    console.log("Frame had no spins. Deleted.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const refundsBySpinner = new Map();
    for (const s of frame.spins) {
      refundsBySpinner.set(
        s.spinnerUserId,
        (refundsBySpinner.get(s.spinnerUserId) ?? 0) + s.stake
      );
    }

    for (const [userId, amount] of refundsBySpinner) {
      await tx.user.update({
        where: { id: userId },
        data: { saldoTibiaCoins: { increment: amount } },
      });
      console.log(`  Refunded ${amount} TC to user ${userId}`);
    }

    await tx.henricusSpin.deleteMany({
      where: { frameId: frame.id },
    });

    await tx.henricusFrame.delete({ where: { id: frame.id } });
  });

  console.log(
    `Deleted frame ${frame.id}, refunded ${frame.spins.length} spin(s). A new frame will be created on next visit.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
