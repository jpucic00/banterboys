import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { notifySaldoSummary } from "@/lib/discord-notify";

export async function POST() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: {
      alias: { not: null },
      OR: [
        { saldoGold: { not: 0 } },
        { saldoTibiaCoins: { not: 0 } },
      ],
    },
    select: {
      alias: true,
      saldoGold: true,
      saldoTibiaCoins: true,
      accounts: {
        where: { provider: "discord" },
        select: { providerAccountId: true },
      },
    },
  });

  if (users.length === 0) {
    return NextResponse.json({ ok: true, sent: false, count: 0 });
  }

  if (!process.env.DISCORD_WEBHOOK_URL) {
    return NextResponse.json(
      { error: "DISCORD_WEBHOOK_URL is not configured" },
      { status: 500 }
    );
  }

  await notifySaldoSummary(
    users.map((u) => ({
      alias: u.alias,
      saldoGold: u.saldoGold,
      saldoTibiaCoins: u.saldoTibiaCoins,
      discordId: u.accounts[0]?.providerAccountId ?? null,
    }))
  );

  return NextResponse.json({ ok: true, sent: true, count: users.length });
}
