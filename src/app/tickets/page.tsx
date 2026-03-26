"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { CoinAmount } from "@/components/CoinIcon";

interface Event {
  id: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  sport: { name: string; key: string };
  odds: { homeOdds: number; awayOdds: number; drawOdds: number | null }[];
}

interface SlipSelection {
  eventId: string;
  pick: "HOME" | "AWAY" | "DRAW";
  odds: number;
  label: string;
  matchLabel: string;
}

// Sport category mapping
type SportCategory = "all" | "basketball" | "football" | "tennis" | "mma";

const SPORT_CATEGORIES: Record<string, SportCategory> = {
  basketball_nba: "basketball",
  soccer_epl: "football",
  soccer_spain_la_liga: "football",
  soccer_germany_bundesliga: "football",
  soccer_italy_serie_a: "football",
  soccer_uefa_champs_league: "football",
  soccer_uefa_europa_league: "football",
  soccer_uefa_europa_conference_league: "football",
  soccer_uefa_nations_league: "football",
  soccer_fifa_world_cup: "football",
  soccer_europe_euro_qualification: "football",
  soccer_fifa_world_cup_qualification_europe: "football",
  soccer_international_friendly: "football",
  soccer_netherlands_eredivisie: "football",
  tennis_atp_french_open: "tennis",
  tennis_atp_wimbledon: "tennis",
  tennis_atp_us_open: "tennis",
  mma_mixed_martial_arts: "mma",
};

const LEAGUE_NAMES: Record<string, string> = {
  basketball_nba: "NBA",
  soccer_epl: "Premier League",
  soccer_spain_la_liga: "La Liga",
  soccer_germany_bundesliga: "Bundesliga",
  soccer_italy_serie_a: "Serie A",
  soccer_uefa_champs_league: "Champions League",
  soccer_uefa_europa_league: "Europa League",
  soccer_uefa_europa_conference_league: "Conference League",
  soccer_uefa_nations_league: "Nations League",
  soccer_fifa_world_cup: "FIFA World Cup",
  soccer_europe_euro_qualification: "Euro Qualification",
  soccer_fifa_world_cup_qualification_europe: "WC Qualification",
  soccer_international_friendly: "International Friendlies",
  soccer_netherlands_eredivisie: "Eredivisie",
  tennis_atp_french_open: "French Open",
  tennis_atp_wimbledon: "Wimbledon",
  tennis_atp_us_open: "US Open",
  mma_mixed_martial_arts: "MMA",
};

// SVG sport icons
function IconBasketball({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18" />
      <path d="M5.5 5.5C8 8 8 16 5.5 18.5M18.5 5.5C16 8 16 16 18.5 18.5" />
    </svg>
  );
}

function IconFootball({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <polygon points="12,7 14.5,10 13.5,13 10.5,13 9.5,10" fill="currentColor" stroke="none" opacity="0.6" />
      <line x1="12" y1="7" x2="9" y2="4.5" />
      <line x1="12" y1="7" x2="15" y2="4.5" />
      <line x1="14.5" y1="10" x2="18" y2="9" />
      <line x1="13.5" y1="13" x2="16" y2="16" />
      <line x1="10.5" y1="13" x2="8" y2="16" />
      <line x1="9.5" y1="10" x2="6" y2="9" />
    </svg>
  );
}

function IconTennis({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M5.5 6.5C8.5 9 8.5 15 5.5 17.5" />
      <path d="M18.5 6.5C15.5 9 15.5 15 18.5 17.5" />
    </svg>
  );
}

function IconMMA({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 17c0 0-2-1-2-4s2-6 4-7c0 0 1-1 3-1s4 1 5 3c1 2 0 4-1 5l-1 1" />
      <path d="M8 17l2 1h4l2-1" />
      <rect x="7" y="17" width="10" height="3" rx="1.5" />
      <path d="M11 9c0 0-1 2-1 4" />
      <path d="M13 9c0 0 1 2 1 4" />
    </svg>
  );
}

const SPORT_TABS: { id: SportCategory; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "all", label: "All", Icon: ({ className }) => <span className={className}>★</span> },
  { id: "basketball", label: "NBA", Icon: IconBasketball },
  { id: "football", label: "Football", Icon: IconFootball },
  { id: "tennis", label: "Tennis", Icon: IconTennis },
  { id: "mma", label: "MMA", Icon: IconMMA },
];

function LeagueIcon({ sportKey }: { sportKey: string }) {
  const cat = SPORT_CATEGORIES[sportKey];
  const cls = "w-3.5 h-3.5";
  if (cat === "basketball") return <IconBasketball className={cls} />;
  if (cat === "football") return <IconFootball className={cls} />;
  if (cat === "tennis") return <IconTennis className={cls} />;
  if (cat === "mma") return <IconMMA className={cls} />;
  return null;
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TicketCard({ ticket }: { ticket: any }) {
  const statusColor =
    ticket.status === "WON"
      ? "text-win"
      : ticket.status === "LOST"
        ? "text-loss"
        : ticket.status === "PENDING"
          ? "text-gold"
          : "text-text-muted";

  const borderColor =
    ticket.status === "WON"
      ? "#00c853"
      : ticket.status === "LOST"
        ? "#C62828"
        : ticket.status === "PENDING"
          ? "#F0A818"
          : "#252525";

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
            <img src="/tibia/green_skull.webp" alt="" width={14} height={14} style={{ imageRendering: "pixelated" }} />
            Bet Slip
          </span>
          <span className="text-[11px] text-text-muted">
            {new Date(ticket.createdAt).toLocaleDateString()}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {ticket.status === "LOST" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/tibia/amulet_of_loss.webp" alt="Amulet of Loss" width={22} height={22} style={{ imageRendering: "pixelated" }} />
          )}
          <span className={`text-xs font-medium uppercase tracking-wide ${statusColor}`}>
            {ticket.status}
          </span>
        </div>
      </div>

      {/* Selections */}
      <div className="divide-y divide-border">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {ticket.selections.map((sel: any) => {
          const pickLabel =
            sel.pick === "HOME"
              ? sel.event.homeTeam
              : sel.pick === "AWAY"
                ? sel.event.awayTeam
                : "Draw";
          const resultColor =
            sel.result === "WON"
              ? "text-win"
              : sel.result === "LOST"
                ? "text-loss"
                : "text-text-muted";
          return (
            <div key={sel.id} className="flex items-center justify-between px-3 py-2.5 text-sm gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] text-text-muted uppercase tracking-wide">
                    {LEAGUE_NAMES[sel.event.sport.key] ?? sel.event.sport.name}
                  </span>
                  <span className="text-[10px] text-text-muted opacity-50">·</span>
                  <span className="text-[10px] text-text-muted">
                    {formatCET(sel.event.commenceTime)}
                  </span>
                </div>
                <span className="text-text-secondary text-xs">
                  {sel.event.homeTeam} vs {sel.event.awayTeam}
                </span>
                <div className="text-text-primary font-medium mt-0.5">{pickLabel}</div>
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
      <div
        className="flex items-center justify-between px-3 py-2 border-t border-border text-xs"
        style={{ background: "#1a1a1a" }}
      >
        <div>
          <span className="text-text-muted">Stake </span>
          <span className="text-text-primary">
            <CoinAmount amount={ticket.amount} currency={ticket.currency} />
          </span>
        </div>
        <div>
          <span className="text-text-muted">Odds </span>
          <span className="text-odds-green font-mono">{ticket.totalOdds.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-text-muted">Payout </span>
          <span className="text-gold font-medium">
            <CoinAmount amount={ticket.potentialPayout} currency={ticket.currency} />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function TicketsPage() {
  const { data: session } = useSession();
  const [events, setEvents] = useState<Event[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tickets, setTickets] = useState<any[]>([]);
  const [slip, setSlip] = useState<SlipSelection[]>([]);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("GOLD");
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<"build" | "mine">("build");
  const [mobileSlipOpen, setMobileSlipOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [sportCategory, setSportCategory] = useState<SportCategory>("all");

  const canInteract = !!session;

  const loadTickets = useCallback(async () => {
    const res = await fetch("/api/tickets");
    setTickets(await res.json());
  }, []);

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then(setEvents);
    if (canInteract) loadTickets();
  }, [loadTickets, canInteract]);

  function addToSlip(event: Event, pick: "HOME" | "AWAY" | "DRAW") {
    if (slip.some((s) => s.eventId === event.id)) return;
    const latestOdds = event.odds[0];
    if (!latestOdds) return;

    const odds =
      pick === "HOME"
        ? latestOdds.homeOdds
        : pick === "AWAY"
          ? latestOdds.awayOdds
          : latestOdds.drawOdds;
    if (!odds) return;

    const label =
      pick === "HOME"
        ? event.homeTeam
        : pick === "AWAY"
          ? event.awayTeam
          : "Draw";

    setSlip([
      ...slip,
      {
        eventId: event.id,
        pick,
        odds,
        label,
        matchLabel: `${event.homeTeam} vs ${event.awayTeam}`,
      },
    ]);
  }

  function removeFromSlip(eventId: string) {
    setSlip(slip.filter((s) => s.eventId !== eventId));
  }

  const totalOdds = slip.reduce((acc, s) => acc * s.odds, 1);
  const potentialPayout = parseFloat(amount || "0") * totalOdds;

  async function handleSubmit() {
    if (slip.length === 0 || !amount) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selections: slip.map((s) => ({
            eventId: s.eventId,
            pick: s.pick,
          })),
          amount,
          currency,
        }),
      });
      if (res.ok) {
        setSlip([]);
        setAmount("");
        loadTickets();
        setTab("mine");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Auto-open mobile slip when first item is added
  useEffect(() => {
    if (slip.length > 0) setMobileSlipOpen(true);
    if (slip.length === 0) setMobileSlipOpen(false);
  }, [slip.length]);

  // Filter events by selected sport category
  const filteredEvents =
    sportCategory === "all"
      ? events
      : events.filter((e) => SPORT_CATEGORIES[e.sport.key] === sportCategory);

  // Group filtered events by sport key
  const grouped = filteredEvents.reduce<Record<string, Event[]>>((acc, event) => {
    const key = event.sport.key;
    if (!acc[key]) acc[key] = [];
    acc[key].push(event);
    return acc;
  }, {});

  // Determine which sport tabs actually have events
  const categoriesWithEvents = new Set(
    events.map((e) => SPORT_CATEGORIES[e.sport.key]).filter(Boolean)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => setTab("build")}
            className={`px-3 py-1 rounded text-xs font-medium uppercase tracking-wide transition-colors ${
              tab === "build"
                ? "bg-white/10 text-white"
                : "text-text-muted hover:text-white"
            }`}
          >
            Build Slip
          </button>
          {canInteract && (
            <button
              onClick={() => setTab("mine")}
              className={`px-3 py-1 rounded text-xs font-medium uppercase tracking-wide transition-colors ${
                tab === "mine"
                  ? "bg-white/10 text-white"
                  : "text-text-muted hover:text-white"
              }`}
            >
              My Slips
            </button>
          )}
        </div>
      </div>

      {tab === "build" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Events list */}
          <div className="lg:col-span-2 space-y-0 pb-20 lg:pb-0">
            {/* Sport category tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1 mb-3 scrollbar-none">
              {SPORT_TABS.filter(
                (t) => t.id === "all" || categoriesWithEvents.has(t.id)
              ).map((sportTab) => {
                const isActive = sportCategory === sportTab.id;
                return (
                  <button
                    key={sportTab.id}
                    onClick={() => setSportCategory(sportTab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium uppercase tracking-wide whitespace-nowrap transition-colors ${
                      isActive
                        ? "bg-gold text-black"
                        : "bg-surface border border-border text-text-secondary hover:text-white hover:border-border-light"
                    }`}
                  >
                    <sportTab.Icon className="w-3.5 h-3.5" />
                    {sportTab.label}
                  </button>
                );
              })}
            </div>

            {Object.keys(grouped).length === 0 && (
              <p className="text-text-muted text-sm py-8 text-center">
                No events with odds available.
              </p>
            )}

            {/* League groups */}
            {Object.entries(grouped).map(([sportKey, leagueEvents]) => (
              <div key={sportKey} className="mb-4 border border-border rounded-md overflow-hidden">
                {/* League header */}
                <div
                  className="flex items-center gap-2 px-3 py-2 border-b border-border"
                  style={{ background: "#1a1a1a", borderLeft: "3px solid #C62828" }}
                >
                  <LeagueIcon sportKey={sportKey} />
                  <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                    {LEAGUE_NAMES[sportKey] ?? sportKey}
                  </span>
                  <span className="ml-auto text-xs text-text-muted">
                    {leagueEvents.length} match{leagueEvents.length !== 1 ? "es" : ""}
                  </span>
                </div>

                {/* Match rows */}
                <div className="divide-y divide-border">
                  {leagueEvents.map((event) => {
                    const odds = event.odds[0];
                    const inSlip = slip.some((s) => s.eventId === event.id);
                    const slipPick = slip.find((s) => s.eventId === event.id)?.pick;

                    return (
                      <div
                        key={event.id}
                        className={`px-3 py-3 transition-colors ${
                          inSlip ? "bg-gold/5" : "bg-surface-row hover:bg-surface"
                        }`}
                      >
                        {/* Teams + time row */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-text-primary">
                            {event.homeTeam} <span className="text-text-muted font-normal">vs</span> {event.awayTeam}
                          </span>
                          <span className="text-xs text-text-muted ml-4 shrink-0">
                            {new Date(event.commenceTime).toLocaleDateString([], { month: "short", day: "numeric" })}{" "}
                            {new Date(event.commenceTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>

                        {/* Odds buttons */}
                        {odds && (
                          <div className="flex gap-2">
                            <OddsButton
                              label={event.homeTeam}
                              odds={odds.homeOdds}
                              selected={slipPick === "HOME"}
                              disabled={inSlip || !canInteract}
                              onClick={() => addToSlip(event, "HOME")}
                            />
                            {odds.drawOdds && (
                              <OddsButton
                                label="Draw"
                                odds={odds.drawOdds}
                                selected={slipPick === "DRAW"}
                                disabled={inSlip || !canInteract}
                                onClick={() => addToSlip(event, "DRAW")}
                              />
                            )}
                            <OddsButton
                              label={event.awayTeam}
                              odds={odds.awayOdds}
                              selected={slipPick === "AWAY"}
                              disabled={inSlip || !canInteract}
                              onClick={() => addToSlip(event, "AWAY")}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Bet slip — desktop only (mobile uses fixed bottom panel) */}
          <div
            className="hidden lg:block rounded-md border border-border h-fit sticky top-16 overflow-hidden"
            style={{ background: "#111111" }}
          >
            <div
              className="px-4 py-2.5 border-b border-border"
              style={{ background: "#1a1a1a" }}
            >
              <h2 className="text-sm font-bold uppercase tracking-wider text-gold">
                Bet Slip
                {slip.length > 0 && (
                  <span className="ml-2 text-xs bg-gold text-black rounded px-1.5 py-0.5 font-bold">
                    {slip.length}
                  </span>
                )}
              </h2>
            </div>

            <div className="p-3 space-y-3">
              {slip.length === 0 ? (
                <p className="text-text-muted text-sm py-4 text-center">
                  Select odds to add to slip.
                </p>
              ) : (
                <div className="space-y-1">
                  {slip.map((sel) => (
                    <div
                      key={sel.eventId}
                      className="flex items-center justify-between text-sm border border-border rounded p-2"
                      style={{ background: "#161616" }}
                    >
                      <div className="min-w-0">
                        <div className="text-text-muted text-xs truncate">{sel.matchLabel}</div>
                        <div className="text-gold font-medium text-xs">{sel.label}</div>
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <span className="text-odds-green font-mono text-sm">{sel.odds.toFixed(2)}</span>
                        <button
                          onClick={() => removeFromSlip(sel.eventId)}
                          className="text-text-muted hover:text-loss text-xs w-4 h-4 flex items-center justify-center"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {slip.length > 0 && (
                <>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Stake"
                      min="1"
                      className="flex-1 bg-surface border border-border rounded px-3 py-1.5 text-text-primary text-sm focus:outline-none focus:border-gold"
                    />
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="bg-surface border border-border rounded px-2 py-1.5 text-text-primary text-sm focus:outline-none"
                    >
                      <option value="GOLD">gp</option>
                      <option value="TIBIA_COINS">TC</option>
                    </select>
                  </div>

                  <div className="text-xs space-y-1 border border-border rounded p-2" style={{ background: "#161616" }}>
                    <div className="flex justify-between text-text-muted">
                      <span>Total Odds</span>
                      <span className="text-odds-green font-mono">{totalOdds.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span className="text-text-secondary">Potential Payout</span>
                      <span className="text-gold">
                        <CoinAmount amount={Math.round(potentialPayout)} currency={currency} />
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !amount}
                    className="w-full bg-gold hover:bg-gold-bright text-black py-2 rounded text-sm font-bold uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Placing..." : "Place Bet"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "mine" && (
        <div className="space-y-3">
          {tickets.length === 0 && (
            <p className="text-text-muted text-center py-10 text-sm">
              No slips yet. Build one!
            </p>
          )}
          {tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </div>
      )}

      {/* Mobile fixed bottom slip — portalled to body to escape any parent constraints */}
      {mounted && tab === "build" && createPortal(
        <div
          className="lg:hidden flex flex-col"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            width: "100%",
            zIndex: 9999,
            background: "#111111",
            maxHeight: "70vh",
            borderTop: "1px solid #252525",
          }}
        >
          {/* Toggle bar — never scrolls */}
          <button
            onClick={() => setMobileSlipOpen((o) => !o)}
            className="w-full shrink-0 flex items-center justify-between px-4 py-3"
            style={{ background: "#1a1a1a" }}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold uppercase tracking-wider text-gold">Bet Slip</span>
              {slip.length > 0 && (
                <span className="text-xs bg-gold text-black rounded px-1.5 py-0.5 font-bold">{slip.length}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {slip.length > 0 && (
                <span className="text-xs text-odds-green font-mono">{totalOdds.toFixed(2)}x</span>
              )}
              <span className="text-text-muted text-xs">{mobileSlipOpen ? "▼" : "▲"}</span>
            </div>
          </button>

          {mobileSlipOpen && (
            <>
              {/* Scrollable events — min-h-0 is required so flex doesn't let it grow unbounded */}
              <div
                className="border-b border-border"
                style={{
                  maxHeight: "200px",
                  overflowY: "auto",
                  overscrollBehavior: "contain",
                  WebkitOverflowScrolling: "touch",
                  touchAction: "pan-y",
                }}
              >
                <div className="p-3 space-y-1">
                  {slip.length === 0 ? (
                    <p className="text-text-muted text-sm py-2 text-center">Select odds to add to slip.</p>
                  ) : (
                    slip.map((sel) => (
                      <div
                        key={sel.eventId}
                        className="flex items-center justify-between text-sm border border-border rounded p-2"
                        style={{ background: "#161616" }}
                      >
                        <div className="min-w-0">
                          <div className="text-text-muted text-xs truncate">{sel.matchLabel}</div>
                          <div className="text-gold font-medium text-xs">{sel.label}</div>
                        </div>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          <span className="text-odds-green font-mono text-sm">{sel.odds.toFixed(2)}</span>
                          <button
                            onClick={() => removeFromSlip(sel.eventId)}
                            className="text-text-muted hover:text-loss text-xs w-4 h-4 flex items-center justify-center"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Controls — shrink-0 keeps this always fully visible below the scroll area */}
              {slip.length > 0 && (
                <div className="shrink-0 p-3 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Stake"
                      min="1"
                      className="flex-1 bg-surface border border-border rounded px-3 py-1.5 text-text-primary text-sm focus:outline-none focus:border-gold"
                    />
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="bg-surface border border-border rounded px-2 py-1.5 text-text-primary text-sm focus:outline-none"
                    >
                      <option value="GOLD">gp</option>
                      <option value="TIBIA_COINS">TC</option>
                    </select>
                  </div>

                  <div className="text-xs space-y-1 border border-border rounded p-2" style={{ background: "#161616" }}>
                    <div className="flex justify-between text-text-muted">
                      <span>Total Odds</span>
                      <span className="text-odds-green font-mono">{totalOdds.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span className="text-text-secondary">Potential Payout</span>
                      <span className="text-gold">
                        <CoinAmount amount={Math.round(potentialPayout)} currency={currency} />
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !amount}
                    className="w-full bg-gold hover:bg-gold-bright text-black py-2 rounded text-sm font-bold uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Placing..." : "Place Bet"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

function OddsButton({
  label,
  odds,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  odds: number;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 flex flex-col items-center py-1.5 px-2 rounded text-xs font-medium transition-colors disabled:cursor-not-allowed ${
        selected
          ? "bg-gold text-black"
          : "bg-bg-tertiary border border-border text-text-secondary hover:border-gold hover:text-white"
      }`}
    >
      <span className="truncate w-full text-center leading-tight mb-0.5" title={label}>
        {label.length > 12 ? label.split(" ").slice(-1)[0] : label}
      </span>
      <span className={`font-mono font-bold text-sm ${selected ? "text-black" : "text-odds-green"}`}>
        {odds.toFixed(2)}
      </span>
    </button>
  );
}
