"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import BetCard from "@/components/BetCard";
import { CoinAmount } from "@/components/CoinIcon";
import Image from "next/image";

interface Sport {
  id: string;
  name: string;
  key: string;
}

interface Event {
  id: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  sport: Sport;
  odds: { homeOdds: number; awayOdds: number; drawOdds: number | null }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bet = any;

const SPORT_TYPE_META: Record<string, { label: string; emoji: string }> = {
  soccer:           { label: "Football",        emoji: "⚽" },
  basketball:       { label: "Basketball",       emoji: "🏀" },
  americanfootball: { label: "Am. Football",     emoji: "🏈" },
  baseball:         { label: "Baseball",         emoji: "⚾" },
  icehockey:        { label: "Ice Hockey",       emoji: "🏒" },
  tennis:           { label: "Tennis",           emoji: "🎾" },
  mma:              { label: "MMA",              emoji: "🥊" },
  boxing:           { label: "Boxing",           emoji: "🥊" },
  rugby:            { label: "Rugby",            emoji: "🏉" },
  cricket:          { label: "Cricket",          emoji: "🏏" },
  golf:             { label: "Golf",             emoji: "⛳" },
  aussierules:      { label: "Aussie Rules",     emoji: "🏉" },
};

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
  basketball_nba:                       "NBA",
  basketball_ncaab:                     "NCAA Basketball",
  basketball_euroleague:                "EuroLeague",
  americanfootball_nfl:                 "NFL",
  americanfootball_ncaaf:               "NCAA Football",
  baseball_mlb:                         "MLB",
  icehockey_nhl:                        "NHL",
  tennis_atp_french_open:               "Roland Garros",
  tennis_atp_wimbledon:                 "Wimbledon",
  tennis_atp_us_open:                   "US Open",
  tennis_atp_aus_open:                  "Australian Open",
  mma_mixed_martial_arts:               "UFC / MMA",
};

function sportTypeKey(key: string) {
  return key.split("_")[0];
}

function leagueName(sport: Sport) {
  return LEAGUE_LABELS[sport.key] ?? sport.name;
}

function formatMatchDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

export default function BetsPage() {
  const { data: session } = useSession();
  const [bets, setBets] = useState<Bet[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "mine">("all");

  const loadBets = useCallback(async () => {
    const res = await fetch("/api/bets");
    setBets(await res.json());
  }, []);

  useEffect(() => {
    loadBets();
    fetch("/api/events").then((r) => r.json()).then(setEvents);
  }, [loadBets]);

  const filteredBets = bets.filter((bet: Bet) => {
    if (filter === "open") return bet.status === "OPEN";
    if (filter === "mine")
      return bet.creator.id === session?.user?.id || bet.acceptor?.id === session?.user?.id;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white uppercase tracking-wide">PvP Bets</h1>
        {session && (
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs font-medium px-3 py-1.5 rounded transition-colors"
            style={{ background: "#C62828", color: "#fff" }}
          >
            + Create Bet
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "open", "mine"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1 rounded text-xs font-medium transition-colors"
            style={{
              background: filter === f ? "#1f1f1f" : "transparent",
              border: filter === f ? "1px solid #333" : "1px solid transparent",
              color: filter === f ? "#fff" : "#666",
            }}
          >
            {f === "all" ? "All" : f === "open" ? "Open" : "My Bets"}
          </button>
        ))}
      </div>

      {/* Bet list */}
      <div className="space-y-2">
        {filteredBets.map((bet: Bet) => (
          <BetCard key={bet.id} bet={bet} onJoin={loadBets} onCancel={loadBets} />
        ))}
        {filteredBets.length === 0 && (
          <p className="text-text-muted text-sm text-center py-10">No bets found.</p>
        )}
      </div>

      {/* Wizard modal */}
      {showCreate && (
        <CreateBetModal
          events={events}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); loadBets(); }}
        />
      )}
    </div>
  );
}

// ─── Wizard Modal ──────────────────────────────────────────────────────────────

function CreateBetModal({
  events,
  onClose,
  onSuccess,
}: {
  events: Event[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState("");
  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedPick, setSelectedPick] = useState<"HOME" | "AWAY" | "DRAW" | "">("");
  const [amount, setAmount] = useState("");
  const [odds, setOdds] = useState("2.00");
  const [currency, setCurrency] = useState<"GOLD" | "TIBIA_COINS">("GOLD");
  const [submitting, setSubmitting] = useState(false);
  const [matchSearch, setMatchSearch] = useState("");

  const sportTypes = useMemo(() => {
    const seen = new Set<string>();
    events.forEach((e) => seen.add(sportTypeKey(e.sport.key)));
    return Array.from(seen);
  }, [events]);

  const matchesForLeague = useMemo(
    () => events.filter((e) => e.sport.id === selectedSportId),
    [events, selectedSportId]
  );

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId),
    [events, selectedEventId]
  );

  const hasDrawOdds = !!selectedEvent?.odds[0]?.drawOdds;
  const totalSteps = 5;
  const STEP = { sportLeague: 1, match: 2, pick: 3, stake: 4, review: 5 };
  const STEP_LABELS: Record<number, string> = {
    1: "Sport & League",
    2: "Select Match",
    3: "Your Pick",
    4: "Stake & Odds",
    5: "Review",
  };
  const stepLabel = STEP_LABELS[step] ?? "";

  // All leagues grouped, filtered by selected sport type
  const allLeagues = useMemo(() => {
    const map = new Map<string, Sport>();
    events
      .filter((e) => !selectedType || sportTypeKey(e.sport.key) === selectedType)
      .forEach((e) => { if (!map.has(e.sport.id)) map.set(e.sport.id, e.sport); });
    return Array.from(map.values());
  }, [events, selectedType]);

  function selectSport(type: string) {
    setSelectedType((prev) => (prev === type ? "" : type));
    setSelectedSportId("");
    setSelectedEventId("");
    setSelectedPick("");
    setMatchSearch("");
  }

  function selectLeague(id: string) {
    setSelectedSportId(id);
    setSelectedEventId("");
    setSelectedPick("");
    setMatchSearch("");
    setStep(STEP.match);
  }

  function selectMatch(id: string) {
    setSelectedEventId(id);
    setSelectedPick("");
    setStep(STEP.pick);
  }

  function selectPick(pick: "HOME" | "AWAY" | "DRAW") {
    setSelectedPick(pick);
    setStep(STEP.stake);
  }

  function goBack() {
    if (step === STEP.sportLeague) return;
    if (step === STEP.match) { setSelectedSportId(""); setSelectedType(""); setStep(STEP.sportLeague); }
    else if (step === STEP.pick) { setSelectedEventId(""); setStep(STEP.match); }
    else if (step === STEP.stake) { setSelectedPick(""); setStep(STEP.pick); }
    else if (step === STEP.review) { setStep(STEP.stake); }
  }

  async function handleSubmit() {
    if (!selectedEventId || !selectedPick || !amount || !odds) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: selectedEventId, pick: selectedPick, amount, odds, currency }),
      });
      if (res.ok) onSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  const pickLabel =
    selectedPick === "HOME" ? selectedEvent?.homeTeam
    : selectedPick === "AWAY" ? selectedEvent?.awayTeam
    : selectedPick === "DRAW" ? "Draw"
    : "";

  const displayStep = step;

  const content = createPortal(
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,0,0,0.7)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          zIndex: 9991,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(460px, calc(100vw - 32px))",
          background: "#141414",
          border: "1px solid #2a2a2a",
          borderLeft: "2px solid #C62828",
          borderRadius: 8,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #1f1f1f", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>
              Create PvP Bet · Step {displayStep} of {totalSteps}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{stepLabel}</div>
          </div>
          <button
            onClick={onClose}
            style={{ color: "#555", background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 2px" }}
          >
            ×
          </button>
        </div>

        {/* Step progress with snake */}
        <div style={{ display: "flex", gap: 4, padding: "10px 18px 0" }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{ height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {i === displayStep - 1 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src="/tibia/snake.webp"
                    alt=""
                    width={24}
                    height={24}
                    style={{ imageRendering: "pixelated", transform: "rotate(90deg)" }}
                  />
                )}
              </div>
              <div
                style={{
                  width: "100%",
                  height: 2,
                  borderRadius: 2,
                  background: i < displayStep - 1 ? "#00c853" : i === displayStep - 1 ? "#C62828" : "#252525",
                  transition: "background 0.2s",
                }}
              />
            </div>
          ))}
        </div>

        {/* Step body */}
        <div style={{ padding: "16px 18px", minHeight: 140 }}>

          {/* Step 1: Sport & League combined */}
          {step === STEP.sportLeague && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Sport type filter chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {sportTypes.map((type) => {
                  const meta = SPORT_TYPE_META[type] ?? { label: type, emoji: "🏅" };
                  const active = selectedType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => selectSport(type)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "5px 11px", borderRadius: 20,
                        background: active ? "#2a2a2a" : "transparent",
                        border: active ? "1px solid #555" : "1px solid #2a2a2a",
                        color: active ? "#fff" : "#666",
                        cursor: "pointer", fontSize: 12, fontWeight: 500,
                        transition: "all 0.15s",
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{meta.emoji}</span>
                      {meta.label}
                    </button>
                  );
                })}
              </div>

              {/* League list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
                {allLeagues.map((league) => (
                  <button
                    key={league.id}
                    onClick={() => selectLeague(league.id)}
                    style={{
                      padding: "9px 14px", borderRadius: 6, textAlign: "left",
                      background: "#1a1a1a", border: "1px solid #2a2a2a",
                      color: "#ccc", cursor: "pointer", fontSize: 13, fontWeight: 500,
                    }}
                  >
                    {leagueName(league)}
                  </button>
                ))}
                {allLeagues.length === 0 && (
                  <span style={{ fontSize: 13, color: "#555" }}>No upcoming events.</span>
                )}
              </div>
            </div>
          )}

          {/* Match step */}
          {step === STEP.match && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Search */}
              <input
                type="text"
                value={matchSearch}
                onChange={(e) => setMatchSearch(e.target.value)}
                placeholder="Search by team name…"
                autoFocus
                style={{
                  padding: "8px 12px", borderRadius: 6, fontSize: 13,
                  background: "#1a1a1a", border: "1px solid #2a2a2a",
                  color: "#fff", outline: "none", width: "100%", boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {matchesForLeague
                .filter((ev) => {
                  const q = matchSearch.trim().toLowerCase();
                  if (!q) return true;
                  return ev.homeTeam.toLowerCase().includes(q) || ev.awayTeam.toLowerCase().includes(q);
                })
                .map((ev) => (
                <button
                  key={ev.id}
                  onClick={() => selectMatch(ev.id)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 12px", borderRadius: 6, textAlign: "left",
                    background: "#1a1a1a", border: "1px solid #2a2a2a",
                    cursor: "pointer", gap: 12,
                  }}
                >
                  <span style={{ fontSize: 13, color: "#e0e0e0", fontWeight: 600 }}>
                    {ev.homeTeam}
                    <span style={{ color: "#555", fontWeight: 400, margin: "0 6px" }}>vs</span>
                    {ev.awayTeam}
                  </span>
                  <span style={{ fontSize: 10, color: "#555", whiteSpace: "nowrap", background: "#252525", padding: "2px 8px", borderRadius: 4 }}>
                    {formatMatchDate(ev.commenceTime)}
                  </span>
                </button>
              ))}
              </div>
            </div>
          )}

          {/* Pick step */}
          {step === STEP.pick && selectedEvent && (
            <div style={{ display: "grid", gridTemplateColumns: hasDrawOdds ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8 }}>
              {(
                [
                  { value: "HOME" as const, label: selectedEvent.homeTeam, sublabel: "Home win" },
                  ...(hasDrawOdds ? [{ value: "DRAW" as const, label: "Draw", sublabel: "Draw" }] : []),
                  { value: "AWAY" as const, label: selectedEvent.awayTeam, sublabel: "Away win" },
                ]
              ).map(({ value, label, sublabel }) => {
                const snap = selectedEvent.odds[0];
                const mktOdds = snap
                  ? value === "HOME" ? snap.homeOdds
                  : value === "AWAY" ? snap.awayOdds
                  : snap.drawOdds
                  : null;
                return (
                  <button
                    key={value}
                    onClick={() => selectPick(value)}
                    style={{
                      padding: "12px 8px", borderRadius: 6, textAlign: "center",
                      background: "#1a1a1a", border: "1px solid #2a2a2a",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{sublabel}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>{label}</div>
                    {mktOdds != null && (
                      <div style={{ fontSize: 11, color: "#888", marginTop: 6, fontFamily: "monospace" }}>
                        mkt {mktOdds.toFixed(2)}x
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Stake step */}
          {step === STEP.stake && (
            <div>
              {/* Currency */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {(["GOLD", "TIBIA_COINS"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                      background: currency === c ? "#1f1f1f" : "transparent",
                      border: currency === c ? "1px solid #F0A818" : "1px solid #2a2a2a",
                      color: currency === c ? "#F0A818" : "#555",
                      cursor: "pointer",
                    }}
                  >
                    <Image
                      src={c === "TIBIA_COINS" ? "/tibia/tibia_coin.webp" : "/tibia/gold_coin.webp"}
                      alt="" width={13} height={13}
                      style={{ imageRendering: "pixelated" }}
                    />
                    {c === "GOLD" ? "Gold" : "Tibia Coins"}
                  </button>
                ))}
              </div>

              {/* Amount + Odds */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                    Your Stake
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min="1"
                    autoFocus
                    placeholder="e.g. 100,000"
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                      background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#fff",
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                    Odds
                    <span style={{ color: "#444", textTransform: "none", marginLeft: 4 }}>(1:1 = 2.00)</span>
                  </label>
                  <input
                    type="number"
                    value={odds}
                    onChange={(e) => setOdds(e.target.value)}
                    min="1.01" step="0.01"
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 13,
                      background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#fff",
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={!amount || !odds}
                onClick={() => setStep(STEP.review)}
                style={{
                  width: "100%", padding: "10px 0", borderRadius: 6, fontSize: 13,
                  fontWeight: 700, color: "#fff", background: "#C62828", border: "none",
                  cursor: !amount || !odds ? "not-allowed" : "pointer",
                  opacity: !amount || !odds ? 0.4 : 1,
                }}
              >
                Review Bet →
              </button>
            </div>
          )}

          {/* Review step */}
          {step === STEP.review && selectedEvent && (() => {
            const cur = currency === "GOLD" ? "Gold" : "TC";
            const stake = Number(amount);
            const oddsNum = Number(odds);
            const joinerPays = Math.round(stake * oddsNum);
            const youWin = Math.round(stake * oddsNum);
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                {/* Match info block */}
                <div style={{ background: "#1a1a1a", border: "1px solid #252525", borderRadius: 6, overflow: "hidden" }}>
                  <ReviewRow
                    label="Competition"
                    desc="The league this match belongs to"
                    value={leagueName(selectedEvent.sport)}
                    valueColor="#aaa"
                  />
                  <ReviewRow
                    label="Match"
                    desc="The event you are betting on"
                    value={`${selectedEvent.homeTeam} vs ${selectedEvent.awayTeam}`}
                    valueColor="#fff"
                    last
                  />
                </div>

                {/* Pick + kick-off block */}
                <div style={{ background: "#1a1a1a", border: "1px solid #252525", borderRadius: 6, overflow: "hidden" }}>
                  <ReviewRow
                    label="Your pick"
                    desc="You are backing this outcome — the joiner takes the opposite side"
                    value={pickLabel ?? ""}
                    valueColor="#F0A818"
                  />
                  <ReviewRow
                    label="Odds"
                    desc={oddsNum === 2 ? "Equal stakes — both sides risk the same amount" : "Asymmetric — adjust so the joiner agrees the risk is fair"}
                    value={`${oddsNum.toFixed(2)}x`}
                    valueColor="#60a5fa"
                  />
                  <ReviewRow
                    label="Kick-off"
                    desc="Match starts at this time (Central European)"
                    value={formatMatchDate(selectedEvent.commenceTime)}
                    valueColor="#888"
                    last
                  />
                </div>

                {/* Financial block */}
                <div style={{ background: "#1a1a1a", border: "1px solid #252525", borderRadius: 6, overflow: "hidden" }}>
                  <ReviewRow
                    label="Your commitment"
                    desc="You are challenging anyone in the guild to take the other side of this bet for this amount"
                    value={`${stake.toLocaleString()} ${cur}`}
                    valueColor="#ccc"
                  />
                  <ReviewRow
                    label="Joiner's commitment"
                    desc="The player that accepts this bet agrees to pay this amount if they lose — no money changes hands upfront"
                    value={`${joinerPays.toLocaleString()} ${cur}`}
                    valueColor="#ccc"
                  />
                  <ReviewRow
                    label="If you win"
                    desc="The joiner pays you this amount after the match settles"
                    value={`+${joinerPays.toLocaleString()} ${cur} from joiner`}
                    valueColor="#00c853"
                  />
                  <ReviewRow
                    label="If you lose"
                    desc="You pay the joiner this amount after the match settles"
                    value={`−${stake.toLocaleString()} ${cur} to joiner`}
                    valueColor="#ef4444"
                    last
                  />
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  style={{
                    width: "100%", padding: "11px 0", borderRadius: 6, fontSize: 13,
                    fontWeight: 700, color: "#fff", background: "#C62828", border: "none",
                    cursor: submitting ? "not-allowed" : "pointer",
                    opacity: submitting ? 0.6 : 1,
                  }}
                >
                  {submitting ? "Posting..." : "Post Bet"}
                </button>
              </div>
            );
          })()}
        </div>

        {/* Back button footer */}
        {step > 1 && (
          <div style={{ padding: "10px 18px", borderTop: "1px solid #1f1f1f" }}>
            <button
              onClick={goBack}
              style={{
                fontSize: 12, color: "#555", background: "none", border: "none",
                cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4,
              }}
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </>,
    document.body
  );

  return content;
}

// ─── Review row ───────────────────────────────────────────────────────────────

function ReviewRow({
  label,
  desc,
  value,
  valueColor,
  last,
}: {
  label: string;
  desc: string;
  value: string;
  valueColor: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        padding: "9px 14px", gap: 16,
        borderBottom: last ? "none" : "1px solid #1f1f1f",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 10, color: "#444", lineHeight: 1.4 }}>{desc}</div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: valueColor, textAlign: "right", flexShrink: 0, maxWidth: "45%" }}>
        {value}
      </div>
    </div>
  );
}
