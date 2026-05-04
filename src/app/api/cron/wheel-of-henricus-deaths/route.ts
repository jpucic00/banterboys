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

  // Use the earliest spin's createdAt as the death cutoff, not frame.createdAt.
  // The frame is created at the moment the previous one settles — so a death
  // that happens before anyone spins on the new frame would otherwise get
  // wrongly attributed to the first late-arriving spin (the user would lose
  // to a death that happened before they bet). Falling back to frame.createdAt
  // is defensive — the empty-frame skip above guarantees a spin exists.
  const earliestSpin = await prisma.henricusSpin.findFirst({
    where: { frameId: frame.id },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  const deathCutoff = earliestSpin?.createdAt ?? frame.createdAt;

  // Check every alias on the wheel — not just ones with bets — so a non-champion
  // death still settles the frame and the house keeps the unmatched stakes.
  // Excluded players are skipped so an admin-removed character can't trigger
  // settlement (their assigned spins were already refunded on exclusion).
  const wheelUsers = await prisma.user.findMany({
    where: { alias: { not: null }, excludedFromWheel: false },
    select: { alias: true, aliasSetAt: true },
  });
  // Per-user cutoff: a player who joined the wheel mid-round shouldn't be
  // settled by a death that happened before they joined. Take the later of
  // the frame-level deathCutoff and the user's aliasSetAt.
  const aliasCutoffs = new Map<string, Date>();
  for (const u of wheelUsers) {
    const alias = u.alias as string;
    const userCutoff =
      u.aliasSetAt && u.aliasSetAt > deathCutoff ? u.aliasSetAt : deathCutoff;
    aliasCutoffs.set(alias, userCutoff);
  }
  const uniqueAliases = Array.from(aliasCutoffs.keys());

  // Fetch with bounded concurrency (5 at a time) so we don't blast TibiaData.
  type Match = { alias: string; time: Date; level: number; reason: string };
  const matches: Match[] = [];
  const concurrency = 5;
  for (let i = 0; i < uniqueAliases.length; i += concurrency) {
    const batch = uniqueAliases.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (alias) => {
        const deaths = await fetchCharacterDeaths(alias);
        const cutoff = aliasCutoffs.get(alias) ?? deathCutoff;
        const fresh = deaths.filter((d) => d.time > cutoff);
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
  (async () => {
    let deadDisplay = settlement.deadAlias;
    let deadDiscordId: string | null = null;
    const deadAssigned = settlement.winningSpins[0]?.assigned;
    if (deadAssigned) {
      deadDisplay = deadAssigned.alias ?? deadAssigned.name ?? settlement.deadAlias;
      deadDiscordId = deadAssigned.accounts[0]?.providerAccountId ?? null;
    } else {
      // No winning spins — look up the dead user directly so we can still @mention them.
      const dead = await prisma.user.findFirst({
        where: { alias: settlement.deadAlias },
        select: {
          name: true,
          alias: true,
          accounts: {
            where: { provider: "discord" },
            select: { providerAccountId: true },
          },
        },
      });
      if (dead) {
        deadDisplay = dead.alias ?? dead.name ?? settlement.deadAlias;
        deadDiscordId = dead.accounts[0]?.providerAccountId ?? null;
      }
    }

    await notifyHenricusSettled({
      deadAlias: settlement.deadAlias,
      deadDisplay,
      deadDiscordId,
      deathLevel: settlement.deathLevel,
      deathReason: settlement.deathReason,
      totalPayout: settlement.totalPayout,
      frameSpinCount: frame.totalSpinCount,
      winners: settlement.winningSpins.map((s) => ({
        displayName: s.spinner.alias ?? s.spinner.name ?? "Unknown",
        discordId: s.spinner.accounts[0]?.providerAccountId ?? null,
      })),
    });
  })().catch(() => {});

  return NextResponse.json({
    ok: true,
    settled: true,
    deadAlias: settlement.deadAlias,
    winners: settlement.winningSpins.length,
    totalPayout: settlement.totalPayout,
    newFrameId: settlement.newFrameId,
  });
}
