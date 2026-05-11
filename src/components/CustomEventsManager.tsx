"use client";

import { useEffect, useState, useCallback } from "react";

type CustomEvent = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  status: "UPCOMING" | "LIVE" | "COMPLETED" | "CANCELLED";
  homeScore: number | null;
  awayScore: number | null;
  sport: { id: string; key: string; name: string };
  odds: { homeOdds: number; awayOdds: number; drawOdds: number | null }[];
  _count: { selections: number; pvpBets: number };
};

function defaultCommenceLocal(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CustomEventsManager() {
  const [events, setEvents] = useState<CustomEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [sportName, setSportName] = useState("Guild PvP");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [commenceTime, setCommenceTime] = useState(defaultCommenceLocal());
  const [threeWay, setThreeWay] = useState(true);
  const [homeOdds, setHomeOdds] = useState("3.50");
  const [drawOdds, setDrawOdds] = useState("3.80");
  const [awayOdds, setAwayOdds] = useState("1.85");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/events");
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
        setLoading(false);
        return;
      }
      setEvents(await res.json());
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  async function handleCreate() {
    setFormError(null);
    setSubmitting(true);
    try {
      const body = {
        sportName,
        homeTeam,
        awayTeam,
        commenceTime: new Date(commenceTime).toISOString(),
        homeOdds: parseFloat(homeOdds),
        awayOdds: parseFloat(awayOdds),
        drawOdds: threeWay ? parseFloat(drawOdds) : null,
      };
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed" }));
        setFormError(data.error ?? "Failed to create event");
        return;
      }
      setHomeTeam("");
      setAwayTeam("");
      setCommenceTime(defaultCommenceLocal());
      await fetchEvents();
    } catch {
      setFormError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAction(event: CustomEvent, action: "settle" | "cancel", winner?: "HOME" | "AWAY" | "DRAW") {
    const confirmMsg =
      action === "settle"
        ? `Settle "${event.homeTeam} vs ${event.awayTeam}" — winner: ${winner === "HOME" ? event.homeTeam : winner === "AWAY" ? event.awayTeam : "Draw"}?\n\nThis credits/debits all tickets immediately and cannot be undone.`
        : `Cancel "${event.homeTeam} vs ${event.awayTeam}"? All tickets will be VOIDed and stakes refunded.`;
    if (!confirm(confirmMsg)) return;
    setBusyId(event.id);
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, winner }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed" }));
        alert(data.error ?? "Failed");
        return;
      }
      await fetchEvents();
    } catch {
      alert("Network error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(event: CustomEvent) {
    if (!confirm(`Delete "${event.homeTeam} vs ${event.awayTeam}"? This permanently removes the event and its odds.`)) return;
    setBusyId(event.id);
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed" }));
        alert(data.error ?? "Failed");
        return;
      }
      await fetchEvents();
    } catch {
      alert("Network error");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-text-muted text-sm py-4">Loading…</p>;
  if (error) return <p className="text-loss text-sm py-4">{error}</p>;

  const upcoming = events.filter((e) => e.status === "UPCOMING" || e.status === "LIVE");
  const settled = events.filter((e) => e.status === "COMPLETED" || e.status === "CANCELLED");

  return (
    <div className="space-y-6">
      {/* Create form */}
      <div className="rounded-xl border border-border-light/50 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary mb-3">Create custom event</h3>
        <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Sport / Category">
              <input
                type="text"
                value={sportName}
                onChange={(e) => setSportName(e.target.value)}
                placeholder="Guild PvP"
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold"
              />
            </Field>
            <Field label="Commence time">
              <input
                type="datetime-local"
                value={commenceTime}
                onChange={(e) => setCommenceTime(e.target.value)}
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold"
              />
            </Field>
            <Field label="Home (player 1)">
              <input
                type="text"
                value={homeTeam}
                onChange={(e) => setHomeTeam(e.target.value)}
                placeholder="Dosenaprikose"
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold"
              />
            </Field>
            <Field label="Away (player 2)">
              <input
                type="text"
                value={awayTeam}
                onChange={(e) => setAwayTeam(e.target.value)}
                placeholder="Foulsy"
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold"
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={threeWay}
              onChange={(e) => setThreeWay(e.target.checked)}
            />
            3-way market (include Draw)
          </label>

          <div className={`grid gap-3 ${threeWay ? "grid-cols-3" : "grid-cols-2"}`}>
            <Field label={`${homeTeam || "Home"} odds`}>
              <input
                type="number"
                step="0.01"
                min="1.01"
                value={homeOdds}
                onChange={(e) => setHomeOdds(e.target.value)}
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:border-gold"
              />
            </Field>
            {threeWay && (
              <Field label="Draw odds">
                <input
                  type="number"
                  step="0.01"
                  min="1.01"
                  value={drawOdds}
                  onChange={(e) => setDrawOdds(e.target.value)}
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:border-gold"
                />
              </Field>
            )}
            <Field label={`${awayTeam || "Away"} odds`}>
              <input
                type="number"
                step="0.01"
                min="1.01"
                value={awayOdds}
                onChange={(e) => setAwayOdds(e.target.value)}
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:border-gold"
              />
            </Field>
          </div>

          {formError && (
            <p className="text-xs text-loss border border-loss/30 rounded p-2" style={{ background: "#1a0000" }}>
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="bg-gold hover:bg-gold-bright text-black px-4 py-1.5 rounded text-sm font-bold uppercase tracking-wide transition-colors disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create event"}
          </button>
        </form>
      </div>

      {/* Upcoming */}
      <div className="rounded-xl border border-border-light/50 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary mb-3">
          Upcoming custom events ({upcoming.length})
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-text-muted text-sm py-4">No upcoming custom events.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((e) => {
              const odds = e.odds[0];
              const busy = busyId === e.id;
              const hasBets = e._count.selections > 0 || e._count.pvpBets > 0;
              return (
                <div key={e.id} className="border border-border rounded p-3 space-y-2" style={{ background: "#161616" }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-sm font-medium text-text-primary">
                        {e.homeTeam} <span className="text-text-muted font-normal">vs</span> {e.awayTeam}
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        {e.sport.name} · {new Date(e.commenceTime).toLocaleString()}
                      </div>
                      {odds && (
                        <div className="text-xs font-mono text-odds-green mt-1">
                          {e.homeTeam} {odds.homeOdds.toFixed(2)}
                          {odds.drawOdds != null && <> · Draw {odds.drawOdds.toFixed(2)}</>}
                          {" "}· {e.awayTeam} {odds.awayOdds.toFixed(2)}
                        </div>
                      )}
                      <div className="text-xs text-text-muted mt-0.5">
                        {e._count.selections} ticket{e._count.selections === 1 ? "" : "s"} · {e._count.pvpBets} PvP bet{e._count.pvpBets === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      disabled={busy}
                      onClick={() => handleAction(e, "settle", "HOME")}
                      className="bg-win/20 hover:bg-win/30 text-win border border-win/40 px-3 py-1 rounded text-xs font-medium disabled:opacity-50"
                    >
                      Settle: {e.homeTeam}
                    </button>
                    {odds?.drawOdds != null && (
                      <button
                        disabled={busy}
                        onClick={() => handleAction(e, "settle", "DRAW")}
                        className="bg-gold/20 hover:bg-gold/30 text-gold border border-gold/40 px-3 py-1 rounded text-xs font-medium disabled:opacity-50"
                      >
                        Settle: Draw
                      </button>
                    )}
                    <button
                      disabled={busy}
                      onClick={() => handleAction(e, "settle", "AWAY")}
                      className="bg-win/20 hover:bg-win/30 text-win border border-win/40 px-3 py-1 rounded text-xs font-medium disabled:opacity-50"
                    >
                      Settle: {e.awayTeam}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => handleAction(e, "cancel")}
                      className="bg-loss/20 hover:bg-loss/30 text-loss border border-loss/40 px-3 py-1 rounded text-xs font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={busy || hasBets}
                      onClick={() => handleDelete(e)}
                      title={hasBets ? "Cannot delete: tickets/bets exist" : "Delete event"}
                      className="bg-bg-tertiary hover:bg-bg-secondary text-text-muted border border-border px-3 py-1 rounded text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* History */}
      <div className="rounded-xl border border-border-light/50 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary mb-3">
          History ({settled.length})
        </h3>
        {settled.length === 0 ? (
          <p className="text-text-muted text-sm py-4">No settled custom events yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-xs uppercase tracking-wide border-b border-border">
                  <th className="text-left pb-2 pr-4">Event</th>
                  <th className="text-left pb-2 px-4">Sport</th>
                  <th className="text-left pb-2 px-4">Result</th>
                  <th className="text-left pb-2 px-4">Tickets</th>
                  <th className="text-left pb-2 px-4">Settled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {settled.map((e) => {
                  const result =
                    e.status === "CANCELLED"
                      ? "Cancelled"
                      : e.homeScore == null || e.awayScore == null
                        ? "—"
                        : e.homeScore > e.awayScore
                          ? `${e.homeTeam} won`
                          : e.awayScore > e.homeScore
                            ? `${e.awayTeam} won`
                            : "Draw";
                  return (
                    <tr key={e.id}>
                      <td className="py-2 pr-4 text-text-primary">{e.homeTeam} vs {e.awayTeam}</td>
                      <td className="py-2 px-4 text-text-secondary">{e.sport.name}</td>
                      <td className="py-2 px-4 text-text-primary">{result}</td>
                      <td className="py-2 px-4 text-text-muted">{e._count.selections}</td>
                      <td className="py-2 px-4 text-text-muted text-xs">
                        {new Date(e.commenceTime).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wide text-text-muted">{label}</span>
      {children}
    </label>
  );
}
