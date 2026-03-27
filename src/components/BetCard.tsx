"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { CoinAmount } from "./CoinIcon";
import Image from "next/image";
import JoinBetButton from "./JoinBetButton";

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

function formatCET(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) + " CET";
}

interface BetCardProps {
  bet: {
    id: string;
    pick: string;
    amount: number;
    odds: number;
    currency: string;
    status: string;
    createdAt: string;
    creator: { id: string; name: string | null; alias: string | null; image: string | null };
    acceptor?: { id: string; name: string | null; alias: string | null; image: string | null } | null;
    event: {
      homeTeam: string;
      awayTeam: string;
      commenceTime: string;
      sport: { name: string; key: string };
    };
  };
  onJoin?: () => void;
  onCancel?: () => void;
}

function TimeAgo({ date }: { date: string }) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return <span>just now</span>;
  if (diff < 3600) return <span>{Math.floor(diff / 60)}m ago</span>;
  if (diff < 86400) return <span>{Math.floor(diff / 3600)}h ago</span>;
  return <span>{Math.floor(diff / 86400)}d ago</span>;
}

function PlayerAvatar({ name, image }: { name: string | null; image: string | null }) {
  return (
    <span className="inline-flex items-center gap-1">
      {image && <Image src={image} alt="" width={14} height={14} className="rounded-full inline-block" />}
      <span>{name ?? "Unknown"}</span>
    </span>
  );
}

export default function BetCard({ bet, onJoin, onCancel }: BetCardProps) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);

  const isCreator = session?.user?.id === bet.creator.id;
  const isAcceptor = session?.user?.id === bet.acceptor?.id;
  const canCancel = bet.status === "OPEN" && isCreator;
  const userLost =
    (bet.status === "WON_ACCEPTOR" && isCreator) ||
    (bet.status === "WON_CREATOR" && isAcceptor);

  const pickLabel =
    bet.pick === "HOME"
      ? bet.event.homeTeam
      : bet.pick === "AWAY"
        ? bet.event.awayTeam
        : "Draw";

  const joinerPickLabel =
    bet.pick === "HOME"
      ? bet.event.awayTeam
      : bet.pick === "AWAY"
        ? bet.event.homeTeam
        : "Either team wins";

  const borderColor =
    bet.status === "WON_CREATOR" || bet.status === "WON_ACCEPTOR"
      ? "#00c853"
      : bet.status === "CANCELLED" || bet.status === "VOID"
        ? "#252525"
        : bet.status === "OPEN" || bet.status === "MATCHED"
          ? "#F0A818"
          : "#252525";

  const statusLabel =
    bet.status === "WON_CREATOR"
      ? `${bet.creator.alias ?? bet.creator.name ?? "Creator"} won`
      : bet.status === "WON_ACCEPTOR"
        ? `${bet.acceptor?.alias ?? bet.acceptor?.name ?? "Acceptor"} won`
        : bet.status;

  const statusColor =
    bet.status === "WON_CREATOR" || bet.status === "WON_ACCEPTOR"
      ? "#00c853"
      : bet.status === "CANCELLED" || bet.status === "VOID"
        ? "#555"
        : bet.status === "OPEN"
          ? "#F0A818"
          : bet.status === "MATCHED"
            ? "#60a5fa"
            : "#888";

  async function handleCancel() {
    setLoading(true);
    try {
      await fetch("/api/bets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betId: bet.id, action: "cancel" }),
      });
      onCancel?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="rounded-md border border-border overflow-hidden"
      style={{ background: "#141414", borderLeft: `2px solid ${borderColor}` }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-border"
        style={{ background: "#1a1a1a" }}
      >
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="flex items-center gap-1 bg-gold/20 text-gold px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tibia/black_skull.webp" alt="" width={14} height={14} style={{ imageRendering: "pixelated" }} />
            PvP
          </span>
          <span className="uppercase tracking-wide text-[11px]">
            {LEAGUE_LABELS[bet.event.sport.key] ?? bet.event.sport.name}
          </span>
        </div>
        <span className="text-xs text-text-muted">
          <TimeAgo date={bet.createdAt} />
        </span>
      </div>

      {/* Players VS row */}
      <div className="px-3 py-3 flex items-center gap-3">
        {/* Creator */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {bet.creator.image && (
              <Image src={bet.creator.image} alt="" width={20} height={20} className="rounded-full shrink-0" />
            )}
            {userLost && isCreator && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/tibia/amulet_of_loss.webp" alt="" width={20} height={20} style={{ imageRendering: "pixelated" }} />
            )}
            <span className="text-sm font-bold text-white truncate">{bet.creator.alias ?? bet.creator.name ?? "Unknown"}</span>
          </div>
          <div className="text-xs text-gold mt-0.5 pl-0.5">{pickLabel} →</div>
        </div>

        {/* VS divider */}
        <span className="text-xs font-black text-text-muted shrink-0">VS</span>

        {/* Acceptor or Join */}
        <div className="flex-1 min-w-0 flex flex-col items-end">
          {bet.status === "OPEN" ? (
            <div className="flex flex-col items-end gap-1.5">
              <div className="text-sm font-bold text-white truncate max-w-full">
                ← {joinerPickLabel}
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
                {userLost && isAcceptor && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/tibia/amulet_of_loss.webp" alt="" width={20} height={20} style={{ imageRendering: "pixelated" }} />
                )}
                <span className="text-sm font-bold text-white truncate">{bet.acceptor.alias ?? bet.acceptor.name ?? "Unknown"}</span>
                {bet.acceptor.image && (
                  <Image src={bet.acceptor.image} alt="" width={20} height={20} className="rounded-full shrink-0" />
                )}
              </div>
              <div className="text-xs text-gold mt-0.5 pr-0.5">← {joinerPickLabel}</div>
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
        <div className="text-[11px] text-text-muted mt-0.5">
          {formatCET(bet.event.commenceTime)}
        </div>
      </div>

      {/* Footer */}
      <div className="relative flex items-center px-3 py-2 border-t border-border text-xs">
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          <CoinAmount amount={bet.amount} currency={bet.currency} size={13} />
          <span className="text-text-muted">vs</span>
          <CoinAmount amount={Math.round(bet.amount * bet.odds)} currency={bet.currency} size={13} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={loading}
              className="text-loss hover:text-red-400 transition-colors text-[10px] font-medium disabled:opacity-50"
            >
              {loading ? "..." : "Cancel"}
            </button>
          )}
          <span className="font-medium uppercase tracking-wide text-[10px]" style={{ color: statusColor }}>
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
