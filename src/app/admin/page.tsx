import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import SaldoManager from "@/components/SaldoManager";
import CustomEventsManager from "@/components/CustomEventsManager";
import SongContestManager from "@/components/SongContestManager";
import { isAdminEmail } from "@/lib/admin";
import AdminTabs from "@/components/AdminTabs";
import { Section, StatGrid, Stat, CurrencyStat, fmtStat as fmt } from "@/components/StatCards";
import { DISCORD_NOTIFY_MULTIPLIER } from "@/lib/slots";

const HENRICUS_PAYOUT_PER_WIN = 500;

export const dynamic = "force-dynamic";

type TicketRow = {
  status: string;
  amount: number;
  potentialPayout: number;
  totalOdds: number;
  currency: string;
  createdAt: Date;
};

type PvPRow = {
  status: string;
  amount: number;
  joinerAmount: number | null;
  currency: string;
  createdAt: Date;
};

type TicketStats = {
  houseProfit: number;
  houseGains: number;
  houseLosses: number;
  totalVolume: number;
  pendingExposure: number;
  pendingStakes: number;
  houseWinRate: number | null;
  counts: { won: number; lost: number; pending: number; void: number; total: number };
};

type PvPStats = {
  volume: number;
  counts: {
    open: number;
    matched: number;
    settled: number;
    void: number;
    cancelled: number;
    total: number;
  };
};

type SlotRow = {
  stake: number;
  payout: number;
  multiplier: number;
  symbols: string;
  isFreeSpin: boolean;
  createdAt: Date;
};

type GambleRow = {
  amount: number;
  won: boolean;
  createdAt: Date;
};

type SlotStats = {
  houseProfit: number;       // paidVolume - totalPayouts - gambleNet
  totalVolume: number;       // sum(stake) excluding free spins
  totalPayouts: number;      // sum(payout) including free spins
  gambleNet: number;         // sum(amount won) - sum(amount lost) — positive = house loss
  spinCount: number;
  winCount: number;          // spins with payout > 0
  jackpotCount: number;      // 3x ferumbras
  bigWinCount: number;       // multiplier >= BIG_WIN_MULTIPLIER (Discord threshold)
  biggestMultiplier: number;
  biggestPayout: number;
  avgStake: number;
  hitRate: number | null;    // winCount / spinCount (percent)
  actualRTP: number | null;  // totalPayouts / paidVolume (percent)
  gambleCount: number;
  gambleWinCount: number;
};

type HenricusSpinRow = {
  stake: number;
  payout: number;
  isWinner: boolean;
  assignedAlias: string;
  frameId: string;
  createdAt: Date;
};

type HenricusStats = {
  houseProfit: number;
  totalVolume: number;
  totalPayouts: number;
  spinCount: number;
  winCount: number;
};

function calcTicketStats(tickets: TicketRow[]): TicketStats {
  const won = tickets.filter((t) => t.status === "WON");
  const lost = tickets.filter((t) => t.status === "LOST");
  const pending = tickets.filter((t) => t.status === "PENDING");
  const voided = tickets.filter((t) => t.status === "VOID");

  const houseGains = lost.reduce((s, t) => s + t.amount, 0);
  const houseLosses = won.reduce((s, t) => s + (t.potentialPayout - t.amount), 0);
  const houseProfit = houseGains - houseLosses;
  const totalVolume = [...won, ...lost, ...pending].reduce((s, t) => s + t.amount, 0);
  const pendingExposure = pending.reduce((s, t) => s + (t.potentialPayout - t.amount), 0);
  const pendingStakes = pending.reduce((s, t) => s + t.amount, 0);
  const settledCount = won.length + lost.length;
  const houseWinRate = settledCount > 0 ? (lost.length / settledCount) * 100 : null;

  return {
    houseProfit,
    houseGains,
    houseLosses,
    totalVolume,
    pendingExposure,
    pendingStakes,
    houseWinRate,
    counts: { won: won.length, lost: lost.length, pending: pending.length, void: voided.length, total: tickets.length },
  };
}

function calcSlotStats(spins: SlotRow[], gambles: GambleRow[]): SlotStats {
  // Free spins record a "phantom stake" on the SlotSpin row (the locked stake
  // from the trigger) so the multiplier column stays meaningful for analytics.
  // The user did not actually pay that stake, so exclude it from volume.
  const paidSpins = spins.filter((x) => !x.isFreeSpin);
  const paidVolume = paidSpins.reduce((s, x) => s + x.stake, 0);
  const totalPayouts = spins.reduce((s, x) => s + x.payout, 0);
  const winCount = spins.filter((x) => x.payout > 0).length;
  const jackpotCount = spins.filter(
    (x) => x.symbols === "ferumbras,ferumbras,ferumbras"
  ).length;
  const bigWinCount = spins.filter((x) => x.multiplier >= DISCORD_NOTIFY_MULTIPLIER).length;
  const biggestMultiplier = spins.reduce((m, x) => Math.max(m, x.multiplier), 0);
  const biggestPayout = spins.reduce((m, x) => Math.max(m, x.payout), 0);
  // Net player gain on gambles. Positive => house loss; negative => house gain.
  const gambleNet = gambles.reduce(
    (s, g) => s + (g.won ? g.amount : -g.amount),
    0
  );
  const gambleWinCount = gambles.filter((g) => g.won).length;
  return {
    houseProfit: paidVolume - totalPayouts - gambleNet,
    totalVolume: paidVolume,
    totalPayouts,
    gambleNet,
    spinCount: spins.length,
    winCount,
    jackpotCount,
    bigWinCount,
    biggestMultiplier,
    biggestPayout,
    avgStake: paidSpins.length > 0 ? paidVolume / paidSpins.length : 0,
    hitRate: spins.length > 0 ? (winCount / spins.length) * 100 : null,
    actualRTP: paidVolume > 0 ? (totalPayouts / paidVolume) * 100 : null,
    gambleCount: gambles.length,
    gambleWinCount,
  };
}

function calcHenricusStats(spins: HenricusSpinRow[]): HenricusStats {
  const totalVolume = spins.reduce((s, x) => s + x.stake, 0);
  const totalPayouts = spins.reduce((s, x) => s + x.payout, 0);
  const winCount = spins.filter((x) => x.isWinner).length;
  return {
    houseProfit: totalVolume - totalPayouts,
    totalVolume,
    totalPayouts,
    spinCount: spins.length,
    winCount,
  };
}

function calcPvPStats(bets: PvPRow[]): PvPStats {
  const open = bets.filter((b) => b.status === "OPEN");
  const matched = bets.filter((b) => b.status === "MATCHED");
  const wonCreator = bets.filter((b) => b.status === "WON_CREATOR");
  const wonAcceptor = bets.filter((b) => b.status === "WON_ACCEPTOR");
  const voided = bets.filter((b) => b.status === "VOID");
  const cancelled = bets.filter((b) => b.status === "CANCELLED");
  const volume = [...open, ...matched, ...wonCreator, ...wonAcceptor].reduce(
    (s, b) => s + b.amount + (b.joinerAmount ?? 0),
    0
  );
  return {
    volume,
    counts: {
      open: open.length,
      matched: matched.length,
      settled: wonCreator.length + wonAcceptor.length,
      void: voided.length,
      cancelled: cancelled.length,
      total: bets.length,
    },
  };
}

function CurrencyCell({
  gold,
  tc,
  sign,
  colorByValue,
}: {
  gold: number;
  tc: number;
  sign?: boolean;
  colorByValue?: boolean;
}) {
  const row = (v: number, src: string, alt: string) => {
    const color = colorByValue
      ? v >= 0
        ? "text-win"
        : "text-loss"
      : "text-text-secondary";
    const prefix = sign && v > 0 ? "+" : "";
    return (
      <div className="flex items-center justify-end gap-1.5">
        <Image
          src={src}
          alt={alt}
          width={12}
          height={12}
          className="inline-block shrink-0"
          style={{ imageRendering: "pixelated" }}
        />
        <span className={`font-mono ${color}`}>
          {prefix}
          {fmt(v)}
        </span>
      </div>
    );
  };
  return (
    <div className="space-y-0.5">
      {row(gold, "/tibia/crystal_coin.webp", "gp")}
      {row(tc, "/tibia/tibia_coin.webp", "TC")}
    </div>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();

  if (!isAdminEmail(session?.user?.email)) {
    redirect("/");
  }

  const { tab = "overview" } = await searchParams;
  const isBalances = tab === "balances";
  const isCustomEvents = tab === "events";
  const isSong = tab === "song";

  const now = new Date();
  const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  // Start of the current week: most recent Sunday at 00:00 (week runs Sun→Sun).
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const [tickets, pvpBets, slotSpins, gambleRounds, henricusSpins, henricusFrames, totalUsers, activeEvents] = await Promise.all([
    prisma.ticket.findMany({
      select: { status: true, amount: true, potentialPayout: true, totalOdds: true, currency: true, createdAt: true },
    }),
    prisma.pvPBet.findMany({
      select: { status: true, amount: true, joinerAmount: true, currency: true, createdAt: true },
    }),
    prisma.slotSpin.findMany({
      select: { stake: true, payout: true, multiplier: true, symbols: true, isFreeSpin: true, createdAt: true },
    }),
    prisma.slotGambleRound.findMany({
      select: { amount: true, won: true, createdAt: true },
    }),
    prisma.henricusSpin.findMany({
      select: { stake: true, payout: true, isWinner: true, assignedAlias: true, frameId: true, createdAt: true },
    }),
    prisma.henricusFrame.findMany({
      select: { id: true, status: true, totalSpinCount: true, totalPayout: true, createdAt: true, settledAt: true },
    }),
    prisma.user.count(),
    prisma.event.count({ where: { status: { in: ["UPCOMING", "LIVE"] } } }),
  ]);

  const allTime = calcTicketStats(tickets);
  const last30d = calcTicketStats(tickets.filter((t) => t.createdAt >= day30Ago));
  const thisWeek = calcTicketStats(tickets.filter((t) => t.createdAt >= weekStart));
  const goldTickets = calcTicketStats(tickets.filter((t) => t.currency === "GOLD"));
  const tcTickets = calcTicketStats(tickets.filter((t) => t.currency === "TIBIA_COINS"));

  // Per-currency, per-period stats for the Period Comparison table. Profit and
  // volume cannot be pooled across GOLD and TIBIA_COINS (different currencies),
  // so each period is split by currency. Win-rate/ticket counts are
  // currency-agnostic and use the pooled allTime/last30d/thisWeek above.
  const goldLast30d = calcTicketStats(tickets.filter((t) => t.currency === "GOLD" && t.createdAt >= day30Ago));
  const tcLast30d = calcTicketStats(tickets.filter((t) => t.currency === "TIBIA_COINS" && t.createdAt >= day30Ago));
  const goldThisWeek = calcTicketStats(tickets.filter((t) => t.currency === "GOLD" && t.createdAt >= weekStart));
  const tcThisWeek = calcTicketStats(tickets.filter((t) => t.currency === "TIBIA_COINS" && t.createdAt >= weekStart));

  const periods = [
    { label: "All-time", all: allTime, gold: goldTickets, tc: tcTickets },
    { label: "Last 30d", all: last30d, gold: goldLast30d, tc: tcLast30d },
    { label: "This week", all: thisWeek, gold: goldThisWeek, tc: tcThisWeek },
  ];

  const pvpGold = calcPvPStats(pvpBets.filter((b) => b.currency === "GOLD"));
  const pvpTc = calcPvPStats(pvpBets.filter((b) => b.currency === "TIBIA_COINS"));

  const slotsAll = calcSlotStats(slotSpins, gambleRounds);
  const slots30d = calcSlotStats(
    slotSpins.filter((s) => s.createdAt >= day30Ago),
    gambleRounds.filter((g) => g.createdAt >= day30Ago)
  );
  const slotsThisWeek = calcSlotStats(
    slotSpins.filter((s) => s.createdAt >= weekStart),
    gambleRounds.filter((g) => g.createdAt >= weekStart)
  );

  const henricusAll = calcHenricusStats(henricusSpins);
  const henricus30d = calcHenricusStats(henricusSpins.filter((s) => s.createdAt >= day30Ago));
  const henricusThisWeek = calcHenricusStats(henricusSpins.filter((s) => s.createdAt >= weekStart));

  const settledHenricusFrames = henricusFrames.filter((f) => f.status === "SETTLED");
  const settledHenricusFrameCount = settledHenricusFrames.length;
  const activeHenricusFrame = henricusFrames.find((f) => f.status === "ACTIVE") ?? null;
  const totalHenricusFrameCount = settledHenricusFrameCount + (activeHenricusFrame ? 1 : 0);
  const avgHenricusSpinsPerRound = settledHenricusFrameCount > 0
    ? settledHenricusFrames.reduce((s, f) => s + f.totalSpinCount, 0) / settledHenricusFrameCount
    : 0;
  const biggestHenricusRoundPayout = settledHenricusFrames.reduce(
    (m, f) => Math.max(m, f.totalPayout),
    0
  );

  const activeHenricusSpins = activeHenricusFrame
    ? henricusSpins.filter((s) => s.frameId === activeHenricusFrame.id)
    : [];
  const activeHenricusVolume = activeHenricusSpins.reduce((s, x) => s + x.stake, 0);
  const aliasSpinCounts = new Map<string, number>();
  for (const s of activeHenricusSpins) {
    aliasSpinCounts.set(s.assignedAlias, (aliasSpinCounts.get(s.assignedAlias) ?? 0) + 1);
  }
  let maxExposureAlias: string | null = null;
  let maxExposureCount = 0;
  for (const [alias, count] of aliasSpinCounts) {
    if (count > maxExposureCount) {
      maxExposureCount = count;
      maxExposureAlias = alias;
    }
  }
  const activeHenricusMaxExposure = maxExposureCount * HENRICUS_PAYOUT_PER_WIN;
  const activeHenricusDaysRunning = activeHenricusFrame
    ? Math.floor(
        (now.getTime() - activeHenricusFrame.createdAt.getTime()) / (24 * 60 * 60 * 1000)
      )
    : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-text-primary">House Dashboard</h1>
          <AdminTabs />
        </div>
        <span className="text-xs text-text-muted">
          {now.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </div>

      {isBalances ? (
        <Section title="Player Balances">
          <SaldoManager />
        </Section>
      ) : isCustomEvents ? (
        <Section title="Custom Events">
          <CustomEventsManager />
        </Section>
      ) : isSong ? (
        <Section title="Song Contest">
          <SongContestManager />
        </Section>
      ) : (
        <>
      {/* Overview */}
      <Section title="Overview">
        <StatGrid>
          <CurrencyStat
            label="House Profit (all-time)"
            gold={goldTickets.houseProfit}
            tc={tcTickets.houseProfit}
            colorFn={(v) => (v >= 0 ? "text-win" : "text-loss")}
            showSign
          />
          <Stat
            label="House Win Rate"
            value={allTime.houseWinRate != null ? allTime.houseWinRate.toFixed(1) + "%" : "—"}
            color="text-text-primary"
            sub={`${allTime.counts.lost} won / ${allTime.counts.won} lost by house`}
          />
          <CurrencyStat
            label="Total Volume"
            gold={goldTickets.totalVolume}
            tc={tcTickets.totalVolume}
            color="text-text-primary"
            sub="all settled + pending stakes"
          />
          <Stat
            label="Platform"
            value={`${totalUsers} users`}
            color="text-text-primary"
            sub={`${activeEvents} active events`}
          />
        </StatGrid>
      </Section>

      {/* Current Exposure */}
      <Section title="Current Exposure">
        <StatGrid cols={3}>
          <CurrencyStat
            label="Pending Stakes"
            gold={goldTickets.pendingStakes}
            tc={tcTickets.pendingStakes}
            color="text-gold"
            sub="cash currently at risk"
          />
          <CurrencyStat
            label="Max Liability"
            gold={goldTickets.pendingExposure}
            tc={tcTickets.pendingExposure}
            color="text-loss"
            sub="additional payout if all pending win"
          />
          <CurrencyStat
            label="House Gains"
            gold={goldTickets.houseGains}
            tc={tcTickets.houseGains}
            color="text-win"
            sub="total collected from lost tickets"
          />
        </StatGrid>
      </Section>

      {/* Ticket counts */}
      <Section title="Ticket Breakdown">
        <StatGrid cols={4}>
          <Stat label="Lost (House Win)" value={String(allTime.counts.lost)} color="text-win" />
          <Stat label="Won (House Loss)" value={String(allTime.counts.won)} color="text-loss" />
          <Stat label="Pending" value={String(allTime.counts.pending)} color="text-gold" />
          <Stat label="Void" value={String(allTime.counts.void)} color="text-text-muted" />
        </StatGrid>
      </Section>

      {/* Period comparison */}
      <Section title="Period Comparison">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-xs uppercase tracking-wide border-b border-border">
                <th className="text-left pb-2 pr-4">Period</th>
                <th className="text-right pb-2 px-4">Profit</th>
                <th className="text-right pb-2 px-4">Win Rate</th>
                <th className="text-right pb-2 px-4">Volume</th>
                <th className="text-right pb-2 px-4">Tickets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {periods.map(({ label, all, gold, tc }) => (
                <tr key={label}>
                  <td className="text-text-secondary py-3 pr-4 font-medium align-top">{label}</td>
                  <td className="text-right px-4 font-semibold align-top">
                    <CurrencyCell gold={gold.houseProfit} tc={tc.houseProfit} sign colorByValue />
                  </td>
                  <td className="text-right px-4 text-text-primary align-top">
                    {all.houseWinRate != null ? all.houseWinRate.toFixed(1) + "%" : "—"}
                  </td>
                  <td className="text-right px-4 align-top">
                    <CurrencyCell gold={gold.totalVolume} tc={tc.totalVolume} />
                  </td>
                  <td className="text-right px-4 text-text-muted align-top">{all.counts.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Currency breakdown */}
      <Section title="By Currency">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CurrencyCard label="Gold" stats={goldTickets} />
          <CurrencyCard label="Tibia Coins" stats={tcTickets} />
        </div>
      </Section>

      {/* PvP bets */}
      <Section title="PvP Bets">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PvPCard label="Gold" stats={pvpGold} unit="gp" />
          <PvPCard label="Tibia Coins" stats={pvpTc} unit="TC" />
        </div>
      </Section>

      {/* Slots */}
      <Section title="Slots (Tibia Coins)">
        <div className="space-y-4">
          {/* Core financials */}
          <StatGrid cols={4}>
            <Stat
              label="House Profit"
              value={`${slotsAll.houseProfit >= 0 ? "+" : ""}${fmt(slotsAll.houseProfit)} TC`}
              color={slotsAll.houseProfit >= 0 ? "text-win" : "text-loss"}
              sub={
                slotsAll.gambleCount > 0
                  ? `${fmt(slotsAll.totalPayouts)} TC paid · gamble net ${slotsAll.gambleNet >= 0 ? "+" : ""}${fmt(slotsAll.gambleNet)} TC`
                  : `${fmt(slotsAll.totalPayouts)} TC paid out`
              }
            />
            <Stat
              label="Total Volume"
              value={`${fmt(slotsAll.totalVolume)} TC`}
              color="text-text-primary"
              sub="total wagered"
            />
            <Stat
              label="Spins"
              value={String(slotsAll.spinCount)}
              color="text-text-primary"
              sub={
                slotsAll.gambleCount > 0
                  ? `${slotsAll.winCount} winning · ${slotsAll.gambleCount} gambles (${slotsAll.gambleWinCount} won)`
                  : `${slotsAll.winCount} winning`
              }
            />
            <Stat
              label="Hit Rate"
              value={slotsAll.hitRate != null ? slotsAll.hitRate.toFixed(1) + "%" : "—"}
              color="text-text-primary"
              sub="% of spins that paid"
            />
          </StatGrid>

          {/* Interesting stats */}
          <StatGrid cols={4}>
            <Stat
              label="Actual RTP"
              value={slotsAll.actualRTP != null ? slotsAll.actualRTP.toFixed(1) + "%" : "—"}
              color="text-text-primary"
              sub="target ~83.7%"
            />
            <Stat
              label="Biggest Multiplier"
              value={slotsAll.biggestMultiplier > 0 ? `×${slotsAll.biggestMultiplier}` : "—"}
              color="text-gold"
              sub={slotsAll.biggestPayout > 0 ? `${fmt(slotsAll.biggestPayout)} TC payout` : undefined}
            />
            <Stat
              label="Jackpots"
              value={String(slotsAll.jackpotCount)}
              color={slotsAll.jackpotCount > 0 ? "text-gold" : "text-text-muted"}
              sub="3× ferumbras"
            />
            <Stat
              label="Big Wins"
              value={String(slotsAll.bigWinCount)}
              color="text-win"
              sub={`×${DISCORD_NOTIFY_MULTIPLIER}+ (Discord pings)`}
            />
          </StatGrid>

          {/* Period comparison */}
          {slotsAll.spinCount > 0 && (
            <div className="overflow-x-auto pt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-muted text-xs uppercase tracking-wide border-b border-border">
                    <th className="text-left pb-2 pr-4">Period</th>
                    <th className="text-right pb-2 px-4">Profit</th>
                    <th className="text-right pb-2 px-4">Volume</th>
                    <th className="text-right pb-2 px-4">Spins</th>
                    <th className="text-right pb-2 px-4">RTP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(
                    [
                      { label: "All-time", s: slotsAll },
                      { label: "Last 30d", s: slots30d },
                      { label: "This week", s: slotsThisWeek },
                    ] as const
                  ).map(({ label, s }) => (
                    <tr key={label}>
                      <td className="text-text-secondary py-3 pr-4 font-medium">{label}</td>
                      <td className={`text-right px-4 font-mono font-semibold ${s.houseProfit >= 0 ? "text-win" : "text-loss"}`}>
                        {s.houseProfit >= 0 ? "+" : ""}{fmt(s.houseProfit)} TC
                      </td>
                      <td className="text-right px-4 text-text-secondary font-mono">
                        {fmt(s.totalVolume)} TC
                      </td>
                      <td className="text-right px-4 text-text-muted">{s.spinCount}</td>
                      <td className="text-right px-4 text-text-primary font-mono">
                        {s.actualRTP != null ? s.actualRTP.toFixed(1) + "%" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {slotsAll.spinCount === 0 && (
            <p className="text-text-muted text-sm text-center py-4">No spins yet.</p>
          )}
        </div>
      </Section>

      {/* Wheel of Henricus */}
      <Section title="Wheel of Henricus (Tibia Coins)">
        <div className="space-y-4">
          {/* Core financials */}
          <StatGrid cols={4}>
            <Stat
              label="House Profit"
              value={`${henricusAll.houseProfit >= 0 ? "+" : ""}${fmt(henricusAll.houseProfit)} TC`}
              color={henricusAll.houseProfit >= 0 ? "text-win" : "text-loss"}
              sub={`${fmt(henricusAll.totalPayouts)} TC paid out`}
            />
            <Stat
              label="Total Volume"
              value={`${fmt(henricusAll.totalVolume)} TC`}
              color="text-text-primary"
              sub="total wagered"
            />
            <Stat
              label="Spins"
              value={String(henricusAll.spinCount)}
              color="text-text-primary"
              sub={`${henricusAll.winCount} winning`}
            />
            <Stat
              label="Rounds"
              value={String(totalHenricusFrameCount)}
              color="text-text-primary"
              sub={`${settledHenricusFrameCount} settled · ${activeHenricusFrame ? 1 : 0} active`}
            />
          </StatGrid>

          {/* Round stats */}
          <StatGrid cols={4}>
            <Stat
              label="Avg Spins/Round"
              value={avgHenricusSpinsPerRound > 0 ? avgHenricusSpinsPerRound.toFixed(1) : "—"}
              color="text-text-primary"
              sub="across settled rounds"
            />
            <Stat
              label="Biggest Round Payout"
              value={biggestHenricusRoundPayout > 0 ? `${fmt(biggestHenricusRoundPayout)} TC` : "—"}
              color={biggestHenricusRoundPayout > 0 ? "text-gold" : "text-text-muted"}
              sub="single round"
            />
            <Stat
              label="Active Round Spins"
              value={activeHenricusFrame ? String(activeHenricusSpins.length) : "—"}
              color={activeHenricusFrame ? "text-gold" : "text-text-muted"}
              sub={
                activeHenricusFrame
                  ? `${fmt(activeHenricusVolume)} TC · ${activeHenricusDaysRunning}d running`
                  : "no active round"
              }
            />
            <Stat
              label="Max Exposure"
              value={
                activeHenricusFrame && maxExposureCount > 0
                  ? `${fmt(activeHenricusMaxExposure)} TC`
                  : "—"
              }
              color={
                activeHenricusFrame && maxExposureCount > 0 ? "text-loss" : "text-text-muted"
              }
              sub={
                activeHenricusFrame && maxExposureAlias
                  ? `if ${maxExposureAlias} dies (${maxExposureCount} spins)`
                  : "active round worst case"
              }
            />
          </StatGrid>

          {/* Period comparison */}
          {henricusAll.spinCount > 0 && (
            <div className="overflow-x-auto pt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-muted text-xs uppercase tracking-wide border-b border-border">
                    <th className="text-left pb-2 pr-4">Period</th>
                    <th className="text-right pb-2 px-4">Profit</th>
                    <th className="text-right pb-2 px-4">Volume</th>
                    <th className="text-right pb-2 px-4">Spins</th>
                    <th className="text-right pb-2 px-4">Winners</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(
                    [
                      { label: "All-time", s: henricusAll },
                      { label: "Last 30d", s: henricus30d },
                      { label: "This week", s: henricusThisWeek },
                    ] as const
                  ).map(({ label, s }) => (
                    <tr key={label}>
                      <td className="text-text-secondary py-3 pr-4 font-medium">{label}</td>
                      <td className={`text-right px-4 font-mono font-semibold ${s.houseProfit >= 0 ? "text-win" : "text-loss"}`}>
                        {s.houseProfit >= 0 ? "+" : ""}{fmt(s.houseProfit)} TC
                      </td>
                      <td className="text-right px-4 text-text-secondary font-mono">
                        {fmt(s.totalVolume)} TC
                      </td>
                      <td className="text-right px-4 text-text-muted">{s.spinCount}</td>
                      <td className="text-right px-4 text-odds-green">{s.winCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {henricusAll.spinCount === 0 && (
            <p className="text-text-muted text-sm text-center py-4">No spins yet.</p>
          )}

          <div className="flex justify-end pt-1">
            <Link
              href="/wheel-of-henricus/history"
              className="text-xs text-[#F0A818] hover:underline"
            >
              Full audit trail →
            </Link>
          </div>
        </div>
      </Section>
        </>
      )}
    </div>
  );
}

// ---- helpers ----

function CurrencyCard({ label, stats }: { label: string; stats: TicketStats }) {
  return (
    <div className="rounded-xl border border-border-light/50 p-4 space-y-3">
      <p className="text-xs text-text-muted uppercase tracking-wide">{label}</p>
      <KV
        label="Profit"
        value={`${stats.houseProfit >= 0 ? "+" : ""}${fmt(stats.houseProfit)}`}
        valueClass={stats.houseProfit >= 0 ? "text-win" : "text-loss"}
      />
      <KV
        label="Win Rate"
        value={stats.houseWinRate != null ? stats.houseWinRate.toFixed(1) + "%" : "—"}
      />
      <KV label="Volume" value={fmt(stats.totalVolume)} />
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">Tickets</span>
        <span className="text-sm">
          <span className="text-win">{stats.counts.lost}W</span>
          <span className="text-text-muted"> / </span>
          <span className="text-loss">{stats.counts.won}L</span>
          <span className="text-text-muted"> / </span>
          <span className="text-gold">{stats.counts.pending}P</span>
        </span>
      </div>
    </div>
  );
}

function PvPCard({ label, stats, unit }: { label: string; stats: PvPStats; unit: string }) {
  return (
    <div className="rounded-xl border border-border-light/50 p-4 space-y-3">
      <p className="text-xs text-text-muted uppercase tracking-wide">{label}</p>
      <KV label="Volume" value={`${fmt(stats.volume)} ${unit}`} />
      <KV label="Total bets" value={String(stats.counts.total)} />
      <KV label="Open" value={String(stats.counts.open)} />
      <KV label="Matched" value={String(stats.counts.matched)} />
      <KV label="Settled" value={String(stats.counts.settled)} />
      <KV label="Cancelled / Void" value={`${stats.counts.cancelled} / ${stats.counts.void}`} />
    </div>
  );
}

function KV({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className={`text-sm font-mono text-text-primary ${valueClass ?? ""}`}>{value}</span>
    </div>
  );
}
