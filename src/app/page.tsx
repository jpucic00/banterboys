import { prisma } from "@/lib/db";
import Link from "next/link";
import Image from "next/image";
import { CoinAmount } from "@/components/CoinIcon";
import JoinBetButton from "@/components/JoinBetButton";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [pvpBets, tickets] = await Promise.all([
    prisma.pvPBet.findMany({
      include: {
        creator: { select: { id: true, name: true, alias: true, image: true } },
        acceptor: { select: { id: true, name: true, alias: true, image: true } },
        event: { include: { sport: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.ticket.findMany({
      include: {
        user: { select: { name: true, alias: true, image: true } },
        selections: { include: { event: { include: { sport: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  // Merge and sort by settledAt descending
  type HistoryItem =
    | { type: "pvp"; date: Date; data: PvPBetWithRelations }
    | { type: "ticket"; date: Date; data: TicketWithRelations };

  const feed: HistoryItem[] = [
    ...pvpBets.map((b) => ({ type: "pvp" as const, date: b.createdAt, data: b })),
    ...tickets.map((t) => ({ type: "ticket" as const, date: t.createdAt, data: t })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="space-y-5">
      {/* Quick nav */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/bets"
          className="group relative overflow-hidden rounded-md p-5 transition-all duration-200 hover:bg-surface-hover"
          style={{ background: "#141414", border: "1px solid #252525" }}
        >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ borderLeft: "2px solid #F0A818", borderRadius: "inherit" }} />
          <Image
            src="/tibia/ferumbras.webp"
            alt=""
            width={72}
            height={72}
            className="absolute right-4 bottom-4 opacity-60 group-hover:opacity-85 transition-opacity pointer-events-none"
            style={{ imageRendering: "pixelated" }}
          />
          <div className="relative z-10 pr-16">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gold" />
              <h2 className="text-base font-bold text-white uppercase tracking-wide">PvP Bets</h2>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">
              Challenge other guild members. Set your own odds and amount. Someone picks it up, you&apos;re on.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Image src="/tibia/gold_coin.webp" alt="" width={13} height={13} style={{ imageRendering: "pixelated" }} />
              <Image src="/tibia/tibia_coin.webp" alt="" width={13} height={13} style={{ imageRendering: "pixelated" }} />
              <span className="text-xs text-text-muted">Gold or Tibia Coins</span>
            </div>
          </div>
        </Link>

        <Link
          href="/tickets"
          className="group relative overflow-hidden rounded-md p-5 transition-all duration-200 hover:bg-surface-hover"
          style={{ background: "#141414", border: "1px solid #252525" }}
        >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ borderLeft: "2px solid #00c853", borderRadius: "inherit" }} />
          <Image
            src="/tibia/demon.webp"
            alt=""
            width={72}
            height={72}
            className="absolute right-4 bottom-4 opacity-60 group-hover:opacity-85 transition-opacity pointer-events-none"
            style={{ imageRendering: "pixelated" }}
          />
          <div className="relative z-10 pr-16">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-odds-green" />
              <h2 className="text-base font-bold text-white uppercase tracking-wide">Bet Slips</h2>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">
              Build a bet slip with one or more picks against house odds. Higher combo, bigger payout.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Image src="/tibia/gold_coin.webp" alt="" width={13} height={13} style={{ imageRendering: "pixelated" }} />
              <Image src="/tibia/tibia_coin.webp" alt="" width={13} height={13} style={{ imageRendering: "pixelated" }} />
              <span className="text-xs text-text-muted">Gold or Tibia Coins</span>
            </div>
          </div>
        </Link>
      </div>

      {/* History feed */}
      <div className="pt-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-text-muted mb-3">
          Recent Activity
        </h2>

        {feed.length === 0 && (
          <p className="text-text-muted text-sm text-center py-10">No settled bets yet.</p>
        )}

        <div className="space-y-2">
          {feed.map((item) =>
            item.type === "pvp" ? (
              <PvPCard key={`pvp-${item.data.id}`} bet={item.data} />
            ) : (
              <TicketCard key={`ticket-${item.data.id}`} ticket={item.data} />
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

const LEAGUE_LABELS: Record<string, string> = {
  soccer_epl:                           "Premier League",
  soccer_spain_la_liga:                 "La Liga",
  soccer_germany_bundesliga:            "Bundesliga",
  soccer_france_ligue_one:              "Ligue 1",
  soccer_italy_serie_a:                 "Serie A",
  soccer_netherlands_eredivisie:        "Eredivisie",
  soccer_portugal_primeira_liga:        "Primeira Liga",
  soccer_uefa_champs_league:            "Champions League",
  soccer_uefa_europa_league:            "Europa League",
  soccer_uefa_europa_conference_league: "Conference League",
  soccer_conmebol_copa_libertadores:    "Copa Libertadores",
  soccer_mexico_ligamx:                 "Liga MX",
  soccer_brazil_campeonato:             "Brasileirão",
  soccer_argentina_primera_division:    "Primera División",
  soccer_turkey_super_league:           "Süper Lig",
  soccer_belgium_first_div:             "Belgian Pro League",
  soccer_spl:                           "Scottish Premiership",
  soccer_usa_mls:                       "MLS",
  soccer_fifa_world_cup:                       "FIFA World Cup",
  soccer_fifa_world_cup_qualifiers_europe:     "WC Qualification",
  basketball_nba:                       "NBA",
  basketball_ncaab:                     "NCAA Basketball",
  basketball_euroleague:                "EuroLeague",
  americanfootball_nfl:                 "NFL",
  americanfootball_ncaaf:               "NCAA Football",
  baseball_mlb:                         "MLB",
  icehockey_nhl:                        "NHL",
  mma_mixed_martial_arts:               "UFC / MMA",
};

function formatCET(date: Date) {
  return date.toLocaleString("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) + " CET";
}

function leagueLabel(sport: { name: string; key: string }) {
  return LEAGUE_LABELS[sport.key] ?? sport.name;
}

function pvpBorderColor(status: string) {
  if (status === "WON_CREATOR" || status === "WON_ACCEPTOR") return "#00c853";
  if (status === "CANCELLED" || status === "VOID") return "#252525";
  if (status === "LOST") return "#ef4444";
  return "#F0A818"; // OPEN, MATCHED, PENDING
}

function pvpStatusColor(status: string) {
  if (status === "WON_CREATOR" || status === "WON_ACCEPTOR") return "#00c853";
  if (status === "CANCELLED" || status === "VOID") return "#555";
  if (status === "LOST") return "#ef4444";
  if (status === "MATCHED") return "#60a5fa";
  return "#F0A818";
}

function ticketBorderColor(status: string) {
  if (status === "WON") return "#00c853";
  if (status === "LOST") return "#C62828";
  return "#F0A818";
}

function ticketStatusColor(status: string) {
  if (status === "WON") return "#00c853";
  if (status === "LOST") return "#C62828";
  return "#F0A818";
}

function PlayerAvatar({ name, alias, image }: { name: string | null; alias: string | null; image: string | null }) {
  return (
    <span className="inline-flex items-center gap-1">
      {image ? (
        <Image src={image} alt="" width={14} height={14} className="rounded-full inline-block" />
      ) : null}
      <span>{alias ?? name ?? "Unknown"}</span>
    </span>
  );
}

function TimeAgo({ date }: { date: Date }) {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return <span>just now</span>;
  if (diff < 3600) return <span>{Math.floor(diff / 60)}m ago</span>;
  if (diff < 86400) return <span>{Math.floor(diff / 3600)}h ago</span>;
  return <span>{Math.floor(diff / 86400)}d ago</span>;
}

// ─── PvP card ─────────────────────────────────────────────────────────────────

type PvPBetWithRelations = {
  id: string;
  status: string;
  pick: string;
  amount: number;
  odds: number;
  currency: string;
  createdAt: Date;
  settledAt: Date | null;
  creator: { id: string; name: string | null; alias: string | null; image: string | null };
  acceptor: { id: string; name: string | null; alias: string | null; image: string | null } | null;
  event: {
    homeTeam: string;
    awayTeam: string;
    commenceTime: Date;
    sport: { name: string; key: string };
  };
};

function PvPCard({ bet }: { bet: PvPBetWithRelations }) {
  const pick =
    bet.pick === "HOME" ? bet.event.homeTeam
    : bet.pick === "AWAY" ? bet.event.awayTeam
    : "Draw";

  const joinerPick =
    bet.pick === "HOME" ? bet.event.awayTeam
    : bet.pick === "AWAY" ? bet.event.homeTeam
    : "Either team wins";

  const statusLabel =
    bet.status === "WON_CREATOR" ? `${bet.creator.alias ?? bet.creator.name ?? "Creator"} won`
    : bet.status === "WON_ACCEPTOR" ? `${bet.acceptor?.alias ?? bet.acceptor?.name ?? "Acceptor"} won`
    : bet.status;

  return (
    <div
      className="rounded-md border border-border overflow-hidden"
      style={{ background: "#141414", borderLeft: `2px solid ${pvpBorderColor(bet.status)}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border" style={{ background: "#1a1a1a" }}>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="flex items-center gap-1 bg-gold/20 text-gold px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tibia/black_skull.webp" alt="" width={14} height={14} style={{ imageRendering: "pixelated" }} />
            PvP
          </span>
          <span className="uppercase tracking-wide text-[11px]">{leagueLabel(bet.event.sport)}</span>
        </div>
        <span className="text-xs text-text-muted"><TimeAgo date={bet.createdAt} /></span>
      </div>

      {/* Players VS row */}
      <div className="px-3 py-3 flex items-center gap-3">
        {/* Creator */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {bet.creator.image && (
              <Image src={bet.creator.image} alt="" width={20} height={20} className="rounded-full shrink-0" />
            )}
            <span className="text-sm font-bold text-white truncate">{bet.creator.alias ?? bet.creator.name ?? "Unknown"}</span>
          </div>
          <div className="text-xs text-gold mt-0.5 pl-0.5">{pick} →</div>
        </div>

        <span className="text-xs font-black text-text-muted shrink-0">VS</span>

        {/* Acceptor or Join */}
        <div className="flex-1 min-w-0 flex flex-col items-end">
          {bet.status === "OPEN" ? (
            <div className="flex flex-col items-end gap-1.5">
              <div className="text-sm font-bold text-white truncate max-w-full">
                ← {joinerPick}
              </div>
              <JoinBetButton
                betId={bet.id}
                creatorId={bet.creator.id}
                matchLabel={`${bet.event.homeTeam} vs ${bet.event.awayTeam}`}
                homeTeam={bet.event.homeTeam}
                awayTeam={bet.event.awayTeam}
                creatorPick={bet.pick}
                amount={bet.amount}
                currency={bet.currency}
                odds={bet.odds}
              />
            </div>
          ) : bet.acceptor ? (
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-white truncate">{bet.acceptor.alias ?? bet.acceptor.name ?? "Unknown"}</span>
                {bet.acceptor.image && (
                  <Image src={bet.acceptor.image} alt="" width={20} height={20} className="rounded-full shrink-0" />
                )}
              </div>
              <div className="text-xs text-gold mt-0.5 pr-0.5">← {joinerPick}</div>
            </div>
          ) : (
            <span className="text-xs text-text-muted italic">No opponent</span>
          )}
        </div>
      </div>

      {/* Match info */}
      <div className="px-3 pb-2.5 -mt-1">
        <div className="text-xs text-text-secondary">
          {bet.event.homeTeam} <span className="text-text-muted">vs</span> {bet.event.awayTeam}
        </div>
        <div className="text-[11px] text-text-muted mt-0.5">{formatCET(bet.event.commenceTime)}</div>
      </div>

      {/* Footer */}
      <div className="relative flex items-center px-3 py-2 border-t border-border text-xs" style={{ background: "#1a1a1a" }}>
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          <CoinAmount amount={bet.amount} currency={bet.currency} size={13} />
          <span className="text-text-muted">vs</span>
          <CoinAmount amount={Math.round(bet.amount * bet.odds)} currency={bet.currency} size={13} />
        </div>
        <span className="ml-auto font-medium uppercase tracking-wide text-[10px]" style={{ color: pvpStatusColor(bet.status) }}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

// ─── Ticket card ──────────────────────────────────────────────────────────────

type TicketWithRelations = {
  id: string;
  status: string;
  amount: number;
  totalOdds: number;
  potentialPayout: number;
  currency: string;
  createdAt: Date;
  settledAt: Date | null;
  user: { name: string | null; alias: string | null; image: string | null };
  selections: {
    id: string;
    pick: string;
    odds: number;
    result: string;
    event: {
      homeTeam: string;
      awayTeam: string;
      commenceTime: Date;
      sport: { name: string; key: string };
    };
  }[];
};

function TicketCard({ ticket }: { ticket: TicketWithRelations }) {
  return (
    <div
      className="rounded-md border border-border overflow-hidden"
      style={{ background: "#141414", borderLeft: `2px solid ${ticketBorderColor(ticket.status)}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border" style={{ background: "#1a1a1a" }}>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="flex items-center gap-1 bg-gold/20 text-gold px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tibia/green_skull.webp" alt="" width={14} height={14} style={{ imageRendering: "pixelated" }} />
            Bet Slip
          </span>
          <PlayerAvatar name={ticket.user.name} alias={ticket.user.alias} image={ticket.user.image} />
        </div>
        <div className="flex items-center gap-1.5">
          {ticket.status === "LOST" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/tibia/amulet_of_loss.webp" alt="" width={22} height={22} style={{ imageRendering: "pixelated" }} />
          )}
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: ticketStatusColor(ticket.status) }}>
            {ticket.status}
          </span>
        </div>
      </div>

      {/* Selections */}
      <div className="divide-y divide-border">
        {ticket.selections.map((sel) => {
          const pick =
            sel.pick === "HOME" ? sel.event.homeTeam
            : sel.pick === "AWAY" ? sel.event.awayTeam
            : "Draw";
          const resultColor =
            sel.result === "WON" ? "text-win"
            : sel.result === "LOST" ? "text-loss"
            : "text-text-muted";
          return (
            <div key={sel.id} className="flex items-center justify-between px-3 py-2.5 text-sm gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] text-text-muted uppercase tracking-wide">
                    {leagueLabel(sel.event.sport)}
                  </span>
                  <span className="text-[10px] text-text-muted opacity-50">·</span>
                  <span className="text-[10px] text-text-muted">
                    {formatCET(sel.event.commenceTime)}
                  </span>
                </div>
                <span className="text-text-secondary text-xs">
                  {sel.event.homeTeam} vs {sel.event.awayTeam}
                </span>
                <div className="text-text-primary font-medium mt-0.5">{pick}</div>
              </div>
              <div className="flex items-center gap-3 text-right shrink-0">
                <span className="text-odds-green font-mono">{sel.odds.toFixed(2)}</span>
                <span className={`text-xs uppercase ${resultColor}`}>{sel.result}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs" style={{ background: "#1a1a1a" }}>
        <div>
          <span className="text-text-muted">Stake </span>
          <CoinAmount amount={ticket.amount} currency={ticket.currency} size={13} />
        </div>
        <div>
          <span className="text-text-muted">Odds </span>
          <span className="text-odds-green font-mono">{ticket.totalOdds.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-text-muted">Payout </span>
          <span className="text-gold font-medium">
            <CoinAmount amount={ticket.potentialPayout} currency={ticket.currency} size={13} />
          </span>
        </div>
      </div>
    </div>
  );
}
