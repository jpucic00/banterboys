"use client";

import { useCallback, useEffect, useState } from "react";
import { CoinAmount } from "@/components/CoinIcon";
import type { ContestStateView } from "@/lib/song-contest-state";

const DEFAULT_TITLE = "Banter Boys Song Contest";

export default function SongContestManager() {
  const [state, setState] = useState<ContestStateView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Create form
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [first, setFirst] = useState("30");
  const [second, setSecond] = useState("10");
  const [lucky, setLucky] = useState("10");
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/song-contest", { cache: "no-store" });
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
      } else {
        setState(await res.json());
        setError(null);
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    setFormError(null);
    const kk = (v: string) => Math.round(parseFloat(v || "0") * 1_000_000);
    if (!title.trim()) {
      setFormError("Title required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/song-contest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          prizeFirst: kk(first),
          prizeSecond: kk(second),
          prizeLuckyVoter: kk(lucky),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFormError(d.error ?? "Failed to create contest.");
        return;
      }
      await load();
    } catch {
      setFormError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function handleEnd(contestId: string, submissionCount: number, voteCount: number) {
    if (
      !confirm(
        `End the contest now?\n\n${submissionCount} submissions · ${voteCount} votes.\n\nThis computes the winner, runner-up and a random lucky voter, locks voting, and announces results on Discord. Prizes are paid by hand — no balances change. This can't be undone.`
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/song-contest/${contestId}/end`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Failed to end contest.");
        return;
      }
      await load();
    } catch {
      alert("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(submissionId: string, who: string) {
    if (!confirm(`Delete ${who}'s submission? This permanently removes the file and its votes.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/song-contest/submissions/${submissionId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Failed to delete.");
        return;
      }
      await load();
    } catch {
      alert("Network error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-text-muted text-sm py-4">Loading…</p>;
  if (error) return <p className="text-loss text-sm py-4">{error}</p>;

  const contest = state?.contest ?? null;
  const isOpen = contest?.status === "OPEN";

  return (
    <div className="space-y-6">
      {isOpen && contest ? (
        <div className="rounded-xl border border-border-light/50 p-4 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary">Open contest</h3>
              <p className="text-text-primary font-semibold mt-1">{contest.title}</p>
              <p className="text-xs text-text-muted mt-1">
                {state!.submissions.length} submission{state!.submissions.length === 1 ? "" : "s"} ·{" "}
                {state!.totalVotes} vote{state!.totalVotes === 1 ? "" : "s"} · opened{" "}
                {new Date(contest.createdAt).toLocaleDateString()}
              </p>
            </div>
            <button
              disabled={busy}
              onClick={() => handleEnd(contest.id, state!.submissions.length, state!.totalVotes)}
              className="bg-loss/20 hover:bg-loss/30 text-loss border border-loss/40 px-4 py-2 rounded text-sm font-bold uppercase tracking-wide disabled:opacity-50"
            >
              End contest
            </button>
          </div>

          {/* Prize summary */}
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-text-muted">🥇 <CoinAmount amount={contest.prizeFirst} currency="GOLD" size={14} /></span>
            <span className="text-text-muted">🥈 <CoinAmount amount={contest.prizeSecond} currency="GOLD" size={14} /></span>
            <span className="text-text-muted">🍀 <CoinAmount amount={contest.prizeLuckyVoter} currency="GOLD" size={14} /></span>
          </div>

          {/* Submissions list with moderation */}
          <div className="space-y-2">
            <h4 className="text-xs uppercase tracking-wide text-text-muted">Submissions</h4>
            {state!.submissions.length === 0 ? (
              <p className="text-text-muted text-sm">No submissions yet.</p>
            ) : (
              state!.submissions
                .slice()
                .sort((a, b) => b.score - a.score || b.upVotes - a.upVotes)
                .map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 border border-border rounded p-2.5 bg-bg-tertiary"
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-text-primary truncate">
                        “{s.songTitle}” <span className="text-text-muted">— {s.submitter.name}</span>
                      </div>
                      <div className="text-xs text-text-muted">
                        {s.upVotes}👍 {s.downVotes}👎 ·{" "}
                        <a
                          href={`/api/song-contest/submissions/${s.id}/audio`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-gold underline"
                        >
                          listen
                        </a>
                      </div>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() => handleDelete(s.id, s.submitter.name)}
                      className="shrink-0 bg-bg-secondary hover:bg-surface text-text-muted hover:text-loss border border-border px-3 py-1 rounded text-xs disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Last results, if the most recent contest is closed */}
          {contest && state?.results && (
            <div className="rounded-xl border border-gold/30 p-4 bg-gold/5">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gold mb-2">
                Last contest: {contest.title}
              </h3>
              <ul className="text-sm text-text-secondary space-y-1">
                <li>🥇 {state.results.winner ? `${state.results.winner.submitter.name} — “${state.results.winner.songTitle}” (${state.results.winner.upVotes}👍 ${state.results.winner.downVotes}👎)` : "No winner"}</li>
                <li>🥈 {state.results.runnerUp ? `${state.results.runnerUp.submitter.name} — “${state.results.runnerUp.songTitle}” (${state.results.runnerUp.upVotes}👍 ${state.results.runnerUp.downVotes}👎)` : "—"}</li>
                <li>🍀 {state.results.luckyVoter ? state.results.luckyVoter.name : "—"}</li>
              </ul>
              <p className="text-xs text-text-muted mt-2">Closed {contest.closedAt ? new Date(contest.closedAt).toLocaleString() : ""}.</p>
            </div>
          )}

          {/* Create form */}
          <div className="rounded-xl border border-border-light/50 p-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-text-secondary mb-3">Start a new contest</h3>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="space-y-3">
              <Field label="Title">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-gold"
                />
              </Field>
              <p className="text-xs text-text-muted">
                The contest rules are a fixed text shown on the page — edit them in code (CONTEST_RULES in SongContestClient).
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="🥇 1st (kk gold)">
                  <input type="number" step="0.5" min="0" value={first} onChange={(e) => setFirst(e.target.value)}
                    className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:border-gold" />
                </Field>
                <Field label="🥈 2nd (kk gold)">
                  <input type="number" step="0.5" min="0" value={second} onChange={(e) => setSecond(e.target.value)}
                    className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:border-gold" />
                </Field>
                <Field label="🍀 Lucky (kk gold)">
                  <input type="number" step="0.5" min="0" value={lucky} onChange={(e) => setLucky(e.target.value)}
                    className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text-primary font-mono focus:outline-none focus:border-gold" />
                </Field>
              </div>

              {formError && (
                <p className="text-xs text-loss border border-loss/30 rounded p-2 bg-loss/5">{formError}</p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="bg-gold hover:bg-gold-bright text-black px-4 py-1.5 rounded text-sm font-bold uppercase tracking-wide transition-colors disabled:opacity-50"
              >
                {busy ? "Creating…" : "Create contest"}
              </button>
            </form>
          </div>
        </>
      )}
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
