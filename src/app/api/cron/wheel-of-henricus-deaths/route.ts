import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchCharacterDeaths } from "@/lib/tibia-data";
import { SPIN_PAYOUT } from "@/lib/wheel-of-henricus";
import { notifyHenricusSettled } from "@/lib/discord-notify";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const frame = await prisma.henricusFrame.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });

  if (!frame) {
    return NextResponse.json({ ok: true, skipped: "no-active-frame" });
  }

  if (frame.totalSpinCount === 0) {
    return NextResponse.json({ ok: true, skipped: "empty-frame" });
  }

  const spins = await prisma.henricusSpin.findMany({
    where: { frameId: frame.id },
    select: { assignedAlias: true },
  });
  const uniqueAliases = Array.from(new Set(spins.map((s) => s.assignedAlias)));

  // Fetch with bounded concurrency (5 at a time) so we don't blast TibiaData.
  type Match = { alias: string; time: Date; level: number; reason: string };
  const matches: Match[] = [];
  const concurrency = 5;
  for (let i = 0; i < uniqueAliases.length; i += concurrency) {
    const batch = uniqueAliases.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (alias) => {
        const deaths = await fetchCharacterDeaths(alias);
        const fresh = deaths.filter((d) => d.time > frame.createdAt);
        if (fresh.length === 0) return null;
        // Pick the EARLIEST fresh death for this alias (the one that "ended" the frame).
        const earliest = fresh.reduce((a, b) => (a.time <= b.time ? a : b));
        return {
          alias,
          time: earliest.time,
          level: earliest.level,
          reason: earliest.reason,
        } satisfies Match;
      })
    );
    for (const r of results) {
      if (r) matches.push(r);
    }
  }

  if (matches.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: "no-deaths",
      checked: uniqueAliases.length,
    });
  }

  // Earliest death across all aliases is the one that wins this frame.
  const winningMatch = matches.reduce((a, b) => (a.time <= b.time ? a : b));

  const settlement = await prisma.$transaction(async (tx) => {
    // CAS guard: only proceed if this frame is still ACTIVE. Another cron tick
    // (or a manual trigger) may have already settled it.
    const cas = await tx.henricusFrame.updateMany({
      where: { id: frame.id, status: "ACTIVE" },
      data: { status: "SETTLED" },
    });
    if (cas.count === 0) {
      return { skipped: "already-settled" as const };
    }

    const winningSpins = await tx.henricusSpin.findMany({
      where: { frameId: frame.id, assignedAlias: winningMatch.alias },
      select: {
        id: true,
        spinnerUserId: true,
        spinner: {
          select: {
            id: true,
            name: true,
            alias: true,
            accounts: {
              where: { provider: "discord" },
              select: { providerAccountId: true },
            },
          },
        },
        assigned: {
          select: {
            id: true,
            name: true,
            alias: true,
            accounts: {
              where: { provider: "discord" },
              select: { providerAccountId: true },
            },
          },
        },
      },
    });

    for (const s of winningSpins) {
      await tx.henricusSpin.update({
        where: { id: s.id },
        data: { isWinner: true, payout: SPIN_PAYOUT },
      });
      await tx.user.update({
        where: { id: s.spinnerUserId },
        data: { saldoTibiaCoins: { increment: SPIN_PAYOUT } },
      });
    }

    const totalPayout = SPIN_PAYOUT * winningSpins.length;

    await tx.henricusFrame.update({
      where: { id: frame.id },
      data: {
        deadAlias: winningMatch.alias,
        deadAtServer: new Date(),
        deadAtTibia: winningMatch.time,
        deathLevel: winningMatch.level,
        deathReason: winningMatch.reason,
        totalPayout,
        settledAt: new Date(),
      },
    });

    const newFrame = await tx.henricusFrame.create({
      data: { status: "ACTIVE" },
      select: { id: true },
    });

    return {
      skipped: null,
      winningSpins,
      totalPayout,
      deadAlias: winningMatch.alias,
      deathLevel: winningMatch.level,
      deathReason: winningMatch.reason,
      newFrameId: newFrame.id,
    };
  });

  if (settlement.skipped === "already-settled") {
    return NextResponse.json({ ok: true, skipped: "already-settled" });
  }

  // Fire-and-forget Discord notification — never blocks the response.
  const deadAssigned = settlement.winningSpins[0]?.assigned;
  notifyHenricusSettled({
    deadAlias: settlement.deadAlias,
    deadDisplay: deadAssigned?.alias ?? deadAssigned?.name ?? settlement.deadAlias,
    deadDiscordId: deadAssigned?.accounts[0]?.providerAccountId ?? null,
    deathLevel: settlement.deathLevel,
    deathReason: settlement.deathReason,
    totalPayout: settlement.totalPayout,
    frameSpinCount: frame.totalSpinCount,
    winners: settlement.winningSpins.map((s) => ({
      displayName: s.spinner.alias ?? s.spinner.name ?? "Unknown",
      discordId: s.spinner.accounts[0]?.providerAccountId ?? null,
    })),
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    settled: true,
    deadAlias: settlement.deadAlias,
    winners: settlement.winningSpins.length,
    totalPayout: settlement.totalPayout,
    newFrameId: settlement.newFrameId,
  });
}
