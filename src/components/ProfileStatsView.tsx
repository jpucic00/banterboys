import Link from "next/link";
import Image from "next/image";
import {
  Section,
  StatGrid,
  Stat,
  CurrencyStat,
} from "@/components/StatCards";
import {
  calcUserTicketStats,
  calcUserPvpStats,
  type UserTicketRow,
  type UserPvpRow,
} from "@/lib/user-stats";

type Props = {
  user: {
    alias: string | null;
    name: string | null;
    image: string | null;
    saldoGold: number;
    saldoTibiaCoins: number;
  };
  tickets: UserTicketRow[];
  pvpBets: UserPvpRow[];
  userId: string;
  subtitle: string;
  showSelfLinks: boolean;
};

export default function ProfileStatsView({
  user,
  tickets,
  pvpBets,
  userId,
  subtitle,
  showSelfLinks,
}: Props) {
  const goldTickets: UserTicketRow[] = tickets.filter((t) => t.currency === "GOLD");
  const tcTickets: UserTicketRow[] = tickets.filter((t) => t.currency === "TIBIA_COINS");
  const goldPvp: UserPvpRow[] = pvpBets.filter((b) => b.currency === "GOLD");
  const tcPvp: UserPvpRow[] = pvpBets.filter((b) => b.currency === "TIBIA_COINS");

  const ticketsGold = calcUserTicketStats(goldTickets);
  const ticketsTc = calcUserTicketStats(tcTickets);
  const pvpGold = calcUserPvpStats(goldPvp, userId);
  const pvpTc = calcUserPvpStats(tcPvp, userId);

  const totalWon = ticketsGold.counts.won + ticketsTc.counts.won;
  const totalLost = ticketsGold.counts.lost + ticketsTc.counts.lost;
  const settledCount = totalWon + totalLost;
  const combinedWinRate = settledCount > 0 ? (totalWon / settledCount) * 100 : null;

  const pendingTicketCount = ticketsGold.counts.pending + ticketsTc.counts.pending;
  const pendingPvpCount =
    pvpGold.counts.open +
    pvpGold.counts.matched +
    pvpTc.counts.open +
    pvpTc.counts.matched;

  const displayName = user.alias ?? user.name ?? "Anonymous";

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        {user.image && (
          <Image
            src={user.image}
            alt=""
            width={56}
            height={56}
            className="rounded-full ring-1 ring-border-light"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{displayName}</h1>
          <p className="text-xs text-text-muted">{subtitle}</p>
        </div>
      </div>

      <Section title="Current Balance">
        <StatGrid cols={3}>
          <CurrencyStat
            label="Balance"
            gold={user.saldoGold}
            tc={user.saldoTibiaCoins}
            colorFn={(v) => (v >= 0 ? "text-win" : "text-loss")}
            showSign
          />
          <Stat
            label="Pending Bet Slips"
            value={String(pendingTicketCount)}
            color="text-gold"
            sub={pendingTicketCount > 0 ? "awaiting settlement" : "none open"}
          />
          <Stat
            label="Pending PvP Bets"
            value={String(pendingPvpCount)}
            color="text-gold"
            sub={pendingPvpCount > 0 ? "open or matched" : "none open"}
          />
        </StatGrid>
      </Section>

      <Section title="Bet Slips — All Time">
        <StatGrid cols={4}>
          <CurrencyStat
            label="Net Profit"
            gold={ticketsGold.netProfit}
            tc={ticketsTc.netProfit}
            colorFn={(v) => (v >= 0 ? "text-win" : "text-loss")}
            showSign
            sub="winnings minus stakes lost"
          />
          <CurrencyStat
            label="Winnings"
            gold={ticketsGold.netWinnings}
            tc={ticketsTc.netWinnings}
            color="text-win"
            sub="profit on won slips, excl. stake"
          />
          <CurrencyStat
            label="Losses"
            gold={ticketsGold.grossLosses}
            tc={ticketsTc.grossLosses}
            color="text-loss"
            sub="stakes on lost slips"
          />
          <Stat
            label="Win Rate"
            value={combinedWinRate != null ? combinedWinRate.toFixed(1) + "%" : "—"}
            color="text-text-primary"
            sub={`${totalWon}W / ${totalLost}L settled`}
          />
        </StatGrid>
      </Section>

      <Section title="Bet Slips — Pending">
        <StatGrid cols={3}>
          <CurrencyStat
            label="Pending Stakes"
            gold={ticketsGold.pendingStakes}
            tc={ticketsTc.pendingStakes}
            color="text-gold"
            sub="cash currently at risk"
          />
          <CurrencyStat
            label="Potential Payout"
            gold={ticketsGold.pendingPotentialPayout}
            tc={ticketsTc.pendingPotentialPayout}
            color="text-win"
            sub="if all pending slips win"
          />
          <div className="rounded-xl border border-border/50 p-3 bg-bg-tertiary space-y-1 flex flex-col">
            <p className="text-xs text-text-muted uppercase tracking-wide">Open Slips</p>
            <p className="text-xl font-bold font-mono text-gold">{pendingTicketCount}</p>
            {showSelfLinks && (
              <Link
                href="/tickets"
                className="text-xs text-odds-green hover:text-odds-green-dim transition-colors mt-auto"
              >
                View My Slips →
              </Link>
            )}
          </div>
        </StatGrid>
      </Section>

      <Section title="PvP Bets — All Time">
        <StatGrid cols={4}>
          <CurrencyStat
            label="Net Profit"
            gold={pvpGold.netProfit}
            tc={pvpTc.netProfit}
            colorFn={(v) => (v >= 0 ? "text-win" : "text-loss")}
            showSign
            sub="wins minus losses"
          />
          <Stat
            label="Won"
            value={String(pvpGold.counts.won + pvpTc.counts.won)}
            color="text-win"
          />
          <Stat
            label="Lost"
            value={String(pvpGold.counts.lost + pvpTc.counts.lost)}
            color="text-loss"
          />
          <Stat
            label="Void / Cancelled"
            value={`${pvpGold.counts.void + pvpTc.counts.void} / ${pvpGold.counts.cancelled + pvpTc.counts.cancelled}`}
            color="text-text-muted"
          />
        </StatGrid>
      </Section>

      <Section title="PvP Bets — Pending">
        <StatGrid cols={3}>
          <CurrencyStat
            label="Pending Stakes"
            gold={pvpGold.pendingStakes}
            tc={pvpTc.pendingStakes}
            color="text-gold"
            sub="own stake on open / matched bets"
          />
          <Stat
            label="Open (unmatched)"
            value={String(pvpGold.counts.open + pvpTc.counts.open)}
            color="text-gold"
            sub="waiting for an opponent"
          />
          <div className="rounded-xl border border-border/50 p-3 bg-bg-tertiary space-y-1 flex flex-col">
            <p className="text-xs text-text-muted uppercase tracking-wide">Matched</p>
            <p className="text-xl font-bold font-mono text-gold">
              {pvpGold.counts.matched + pvpTc.counts.matched}
            </p>
            {showSelfLinks && (
              <Link
                href="/bets"
                className="text-xs text-odds-green hover:text-odds-green-dim transition-colors mt-auto"
              >
                View PvP Bets →
              </Link>
            )}
          </div>
        </StatGrid>
        <p className="text-xs text-text-muted mt-3">
          PvP bets are settled directly between players and don&apos;t affect your balance here.
        </p>
      </Section>
    </div>
  );
}
