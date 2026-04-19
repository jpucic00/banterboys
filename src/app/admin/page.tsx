import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import SaldoManager from "@/components/SaldoManager";
import { isAdminEmail } from "@/lib/admin";
import AdminTabs from "@/components/AdminTabs";
import { Section, StatGrid, Stat, CurrencyStat, fmtStat as fmt } from "@/components/StatCards";

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

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();

  if (!isAdminEmail(session?.user?.email)) {
    redirect("/");
  }

  const { tab = "overview" } = await searchParams;
  const isTrolian = tab === "trolian";
  const trolianCutoff = new Date("2026-04-16T00:00:00+02:00");

  const now = new Date();
  const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [allTickets, allPvPBets, totalUsers, activeEvents] = await Promise.all([
    prisma.ticket.findMany({
      select: { status: true, amount: true, potentialPayout: true, totalOdds: true, currency: true, createdAt: true },
    }),
    prisma.pvPBet.findMany({
      select: { status: true, amount: true, joinerAmount: true, currency: true, createdAt: true },
    }),
    prisma.user.count(),
    prisma.event.count({ where: { status: { in: ["UPCOMING", "LIVE"] } } }),
  ]);

  const tickets = isTrolian ? allTickets.filter((t) => t.createdAt >= trolianCutoff) : allTickets;
  const pvpBets = isTrolian ? allPvPBets.filter((b) => b.createdAt >= trolianCutoff) : allPvPBets;

  const allTime = calcTicketStats(tickets);
  const last30d = calcTicketStats(tickets.filter((t) => t.createdAt >= day30Ago));
  const last7d = calcTicketStats(tickets.filter((t) => t.createdAt >= day7Ago));
  const goldTickets = calcTicketStats(tickets.filter((t) => t.currency === "GOLD"));
  const tcTickets = calcTicketStats(tickets.filter((t) => t.currency === "TIBIA_COINS"));

  const pvpGold = calcPvPStats(pvpBets.filter((b) => b.currency === "GOLD"));
  const pvpTc = calcPvPStats(pvpBets.filter((b) => b.currency === "TIBIA_COINS"));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-text-primary">House Dashboard</h1>
          <AdminTabs />
        </div>
        <span className="text-xs text-text-muted">
          {isTrolian && <span className="text-gold mr-2">Since Apr 16</span>}
          {now.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </div>

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

      {/* Player Saldos */}
      <Section title="Player Balances">
        <SaldoManager />
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
              {(
                [
                  { label: "All-time", s: allTime },
                  { label: "Last 30d", s: last30d },
                  { label: "Last 7d", s: last7d },
                ] as const
              ).map(({ label, s }) => (
                <tr key={label}>
                  <td className="text-text-secondary py-3 pr-4 font-medium">{label}</td>
                  <td className={`text-right px-4 font-mono font-semibold ${s.houseProfit >= 0 ? "text-win" : "text-loss"}`}>
                    {s.houseProfit >= 0 ? "+" : ""}{fmt(s.houseProfit)} gp
                  </td>
                  <td className="text-right px-4 text-text-primary">
                    {s.houseWinRate != null ? s.houseWinRate.toFixed(1) + "%" : "—"}
                  </td>
                  <td className="text-right px-4 text-text-secondary font-mono">
                    {fmt(s.totalVolume)} gp
                  </td>
                  <td className="text-right px-4 text-text-muted">{s.counts.total}</td>
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
