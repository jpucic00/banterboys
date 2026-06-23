"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { CoinAmount } from "@/components/CoinIcon";
import type { ContestStateView, SubmissionView, Person } from "@/lib/song-contest-state";

const ACCEPT =
  ".mp3,.wav,.m4a,.ogg,.oga,.opus,.aac,.flac,.weba,.mp4,.m4v,.webm,.mov,.mkv,.avi,audio/*,video/*";
const COVER_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const ALLOWED_HINT = "mp3, wav, m4a, ogg, flac, aac, mp4, webm, mov…";
const MAX_MB = 50;
const COVER_MAX_MB = 5;
const REQUIRED_LISTEN_SECONDS = 15;

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
function ext(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1).toUpperCase() : "FILE";
}
function coverUrl(id: string): string {
  return `/api/song-contest/submissions/${id}/cover`;
}

function Avatar({ person, size }: { person: Person; size: number }) {
  if (person.image) {
    return (
      <Image
        src={person.image}
        alt={person.name}
        width={size}
        height={size}
        className="rounded-full object-cover ring-1 ring-border-light shrink-0"
      />
    );
  }
  return (
    <span
      className="rounded-full bg-bg-tertiary border border-border flex items-center justify-center text-text-muted shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
      aria-hidden
    >
      {person.name.charAt(0).toUpperCase()}
    </span>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export default function SongContestClient({
  initial,
  isLoggedIn,
}: {
  initial: ContestStateView;
  isLoggedIn: boolean;
}) {
  const [state, setState] = useState<ContestStateView>(initial);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/song-contest", { cache: "no-store" });
      if (res.ok) setState(await res.json());
    } catch {
      /* keep last good state */
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(refresh, 20_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const { contest, submissions, viewer, results } = state;
  const isOpen = contest?.status === "OPEN";
  const isClosed = contest?.status === "CLOSED";

  if (!contest) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20 space-y-3">
        <h1 className="text-2xl font-bold text-text-primary">Song Contest</h1>
        <p className="text-text-secondary">
          No contest is running right now. Check back soon — the next one will be announced on Discord.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-32">
      {/* Header */}
      <header className="rounded-xl border border-border-light/50 bg-surface p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary flex items-center gap-2">
            <span>🎤</span> {contest.title}
          </h1>
          <span
            className={`text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-full ${
              isOpen
                ? "bg-odds-green/15 text-odds-green border border-odds-green/40"
                : "bg-text-muted/10 text-text-muted border border-border"
            }`}
          >
            {isOpen ? "● Open" : "Closed"}
          </span>
        </div>
        <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">
          {contest.description}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <PrizeChip rank="🥇 1st place" amount={contest.prizeFirst} accent />
          <PrizeChip rank="🥈 2nd place" amount={contest.prizeSecond} />
          <PrizeChip rank="🍀 Lucky voter" amount={contest.prizeLuckyVoter} />
        </div>
        <p className="text-xs text-text-muted">
          Prizes are paid out in-game by the house. The lucky voter is drawn at random from everyone who votes.
        </p>
      </header>

      {/* Results banner (closed) */}
      {isClosed && results && <ResultsBanner results={results} contest={contest} />}

      {/* Submission panel (open only) */}
      {isOpen && (
        <SubmitPanel
          isLoggedIn={isLoggedIn}
          mySubmission={
            viewer?.mySubmissionId
              ? submissions.find((s) => s.id === viewer.mySubmissionId) ?? null
              : null
          }
          onSubmitted={refresh}
          onError={setToast}
        />
      )}

      {/* Submissions + player */}
      <SubmissionsSection
        submissions={submissions}
        viewer={viewer}
        results={results}
        isOpen={!!isOpen}
        isLoggedIn={isLoggedIn}
        totalVotes={state.totalVotes}
        minSubmissionsToVote={state.minSubmissionsToVote}
        votesPerDirection={state.votesPerDirection}
        onChanged={refresh}
        onError={setToast}
      />

      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 bg-bg-tertiary border border-border-light text-text-primary text-sm px-4 py-2 rounded-lg shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function PrizeChip({ rank, amount, accent }: { rank: string; amount: number; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3 flex items-center justify-between ${
        accent ? "border-gold/50 bg-gold/5" : "border-border-light/50 bg-bg-tertiary"
      }`}
    >
      <span className="text-xs uppercase tracking-wide text-text-muted">{rank}</span>
      <span className={`text-sm font-bold ${accent ? "text-gold" : "text-text-primary"}`}>
        <CoinAmount amount={amount} currency="GOLD" size={16} />
      </span>
    </div>
  );
}

function ResultsBanner({
  results,
  contest,
}: {
  results: NonNullable<ContestStateView["results"]>;
  contest: NonNullable<ContestStateView["contest"]>;
}) {
  return (
    <section className="rounded-xl border border-gold/40 bg-gold/5 p-5 space-y-3">
      <h2 className="text-lg font-bold text-gold flex items-center gap-2">🏆 Results</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ResultCard
          label="🥇 Winner"
          person={results.winner?.submitter ?? null}
          fallbackName="No winner"
          detail={results.winner ? `“${results.winner.songTitle}” · ${results.winner.upVotes}👍 ${results.winner.downVotes}👎` : "No votes were cast"}
          amount={results.winner ? contest.prizeFirst : null}
          accent
        />
        <ResultCard
          label="🥈 Runner-up"
          person={results.runnerUp?.submitter ?? null}
          fallbackName="—"
          detail={results.runnerUp ? `“${results.runnerUp.songTitle}” · ${results.runnerUp.upVotes}👍 ${results.runnerUp.downVotes}👎` : "—"}
          amount={results.runnerUp ? contest.prizeSecond : null}
        />
        <ResultCard
          label="🍀 Lucky voter"
          person={results.luckyVoter ?? null}
          fallbackName="—"
          detail={results.luckyVoter ? "Randomly drawn from voters" : "—"}
          amount={results.luckyVoter ? contest.prizeLuckyVoter : null}
        />
      </div>
    </section>
  );
}

function ResultCard({
  label,
  person,
  fallbackName,
  detail,
  amount,
  accent,
}: {
  label: string;
  person: Person | null;
  fallbackName: string;
  detail: string;
  amount: number | null;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-light/50 bg-bg-tertiary p-3 space-y-1">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div className="flex items-center gap-2">
        {person && <Avatar person={person} size={24} />}
        <span className={`text-base font-bold ${accent ? "text-gold" : "text-text-primary"}`}>
          {person ? person.name : fallbackName}
        </span>
      </div>
      <div className="text-xs text-text-secondary">{detail}</div>
      {amount != null && (
        <div className="text-sm font-semibold text-text-primary pt-1">
          <CoinAmount amount={amount} currency="GOLD" size={14} />
        </div>
      )}
    </div>
  );
}

function SubmitPanel({
  isLoggedIn,
  mySubmission,
  onSubmitted,
  onError,
}: {
  isLoggedIn: boolean;
  mySubmission: SubmissionView | null;
  onSubmitted: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [songTitle, setSongTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cover) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(cover);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  if (!isLoggedIn) {
    return (
      <section className="rounded-xl border border-border-light/50 bg-surface p-5 text-center space-y-3">
        <p className="text-text-secondary text-sm">Sign in with Discord to submit your song.</p>
        <button
          onClick={() => signIn("discord")}
          className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-2 rounded text-sm font-medium transition-colors cursor-pointer"
        >
          Sign in with Discord
        </button>
      </section>
    );
  }

  if (mySubmission) {
    return (
      <section className="rounded-xl border border-odds-green/40 bg-odds-green/5 p-5 flex items-center gap-4">
        <CoverTile id={mySubmission.id} hasCover={mySubmission.hasCover} size={48} />
        <div>
          <p className="text-sm text-text-primary">
            <span className="text-odds-green font-bold">✓ Your entry is in:</span>{" "}
            <span className="font-semibold">“{mySubmission.songTitle}”</span>{" "}
            <span className="text-text-muted">({ext(mySubmission.fileName)} · {fmtBytes(mySubmission.sizeBytes)})</span>
          </p>
          <p className="text-xs text-text-muted mt-1">Submissions are final and can&apos;t be changed.</p>
        </div>
      </section>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const title = songTitle.trim();
    if (!title) {
      setFormError("Give your entry a title.");
      return;
    }
    if (!file) {
      setFormError("Choose a song file.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setFormError(`File too large. Max ${MAX_MB} MB.`);
      return;
    }
    if (cover && cover.size > COVER_MAX_MB * 1024 * 1024) {
      setFormError(`Cover image too large. Max ${COVER_MAX_MB} MB.`);
      return;
    }

    setUploading(true);
    setPct(0);
    const fd = new FormData();
    fd.append("songTitle", title);
    fd.append("file", file);
    if (cover) fd.append("cover", cover);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/song-contest/submit");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setPct(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = async () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        setSongTitle("");
        setFile(null);
        setCover(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (coverInputRef.current) coverInputRef.current.value = "";
        await onSubmitted();
      } else {
        let msg = "Upload failed.";
        try {
          msg = JSON.parse(xhr.responseText).error ?? msg;
        } catch {
          /* keep default */
        }
        setFormError(msg);
        onError(msg);
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setFormError("Network error during upload.");
    };
    xhr.send(fd);
  }

  return (
    <section className="rounded-xl border border-border-light/50 bg-surface p-5 space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-text-secondary">Submit your song</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-text-muted">Entry title</span>
          <input
            type="text"
            value={songTitle}
            onChange={(e) => setSongTitle(e.target.value)}
            maxLength={120}
            placeholder="My Banter Boys Anthem"
            disabled={uploading}
            className="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-gold disabled:opacity-50"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-text-muted">Song file</span>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={uploading}
            className="w-full text-sm text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-bg-secondary file:text-text-primary file:text-xs file:font-medium hover:file:bg-surface-hover disabled:opacity-50"
          />
        </label>

        <div className="flex items-end gap-3">
          <label className="block space-y-1 flex-1">
            <span className="text-xs uppercase tracking-wide text-text-muted">Cover image (optional)</span>
            <input
              ref={coverInputRef}
              type="file"
              accept={COVER_ACCEPT}
              onChange={(e) => setCover(e.target.files?.[0] ?? null)}
              disabled={uploading}
              className="w-full text-sm text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-bg-secondary file:text-text-primary file:text-xs file:font-medium hover:file:bg-surface-hover disabled:opacity-50"
            />
          </label>
          {coverPreview && (
            <div
              className="w-14 h-14 rounded-lg border border-border bg-cover bg-center shrink-0"
              style={{ backgroundImage: `url(${coverPreview})` }}
              aria-label="Cover preview"
            />
          )}
        </div>

        <p className="text-xs text-text-muted">
          Accepted: {ALLOWED_HINT} · max {MAX_MB} MB · cover ≤ {COVER_MAX_MB} MB · one submission per person, final once sent.
        </p>

        {uploading && (
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-bg-tertiary overflow-hidden">
              <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-text-muted">Uploading… {pct}%</p>
          </div>
        )}

        {formError && (
          <p className="text-xs text-loss border border-loss/30 rounded p-2 bg-loss/5">{formError}</p>
        )}

        <button
          type="submit"
          disabled={uploading}
          className="bg-gold hover:bg-gold-bright text-black px-4 py-2 rounded text-sm font-bold uppercase tracking-wide transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? "Uploading…" : "Submit entry"}
        </button>
      </form>
    </section>
  );
}

// Square cover thumbnail; shows the uploaded art or a music-note placeholder.
function CoverTile({ id, hasCover, size }: { id: string; hasCover: boolean; size: number }) {
  return (
    <div
      className="rounded-lg border border-border bg-bg-tertiary bg-cover bg-center shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, ...(hasCover ? { backgroundImage: `url(${coverUrl(id)})` } : {}) }}
    >
      {!hasCover && <span className="text-text-muted text-lg">🎵</span>}
    </div>
  );
}

function SubmissionsSection({
  submissions,
  viewer,
  results,
  isOpen,
  isLoggedIn,
  totalVotes,
  minSubmissionsToVote,
  votesPerDirection,
  onChanged,
  onError,
}: {
  submissions: SubmissionView[];
  viewer: ContestStateView["viewer"];
  results: ContestStateView["results"];
  isOpen: boolean;
  isLoggedIn: boolean;
  totalVotes: number;
  minSubmissionsToVote: number;
  votesPerDirection: number;
  onChanged: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [voteBusy, setVoteBusy] = useState<string | null>(null);

  // Listen-gating: voting unlocks only once the user has heard every other
  // submission for REQUIRED_LISTEN_SECONDS. We accumulate genuine playback time
  // per track (ignoring seek jumps) and persist each completed listen server-side
  // so progress survives reloads.
  const [listenedIds, setListenedIds] = useState<Set<string>>(
    () => new Set(viewer?.myListenedSubmissionIds ?? [])
  );
  const accumRef = useRef<Map<string, number>>(new Map());
  const lastTickRef = useRef(0);
  const pendingRef = useRef<Set<string>>(new Set());

  // Fold server-known listens (another device, or this page's own POSTs) into local state.
  useEffect(() => {
    const ids = viewer?.myListenedSubmissionIds;
    if (!ids || ids.length === 0) return;
    setListenedIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ids) if (!next.has(id)) { next.add(id); changed = true; }
      return changed ? next : prev;
    });
  }, [viewer?.myListenedSubmissionIds]);

  const recordListen = useCallback(
    async (id: string) => {
      if (!isLoggedIn || pendingRef.current.has(id)) return;
      pendingRef.current.add(id);
      try {
        const res = await fetch("/api/song-contest/listen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId: id }),
        });
        if (res.ok) setListenedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
      } catch {
        /* will retry on the next qualifying tick */
      } finally {
        pendingRef.current.delete(id);
      }
    },
    [isLoggedIn]
  );

  function handleTimeUpdate(e: React.SyntheticEvent<HTMLAudioElement>) {
    const t = e.currentTarget.currentTime;
    setCurrentTime(t);
    const id = nowPlaying;
    if (!id) return;
    const delta = t - lastTickRef.current;
    lastTickRef.current = t;
    // Count only normal forward playback ticks; ignore seek jumps and rewinds.
    if (delta > 0 && delta < 1.5) {
      const accum = (accumRef.current.get(id) ?? 0) + delta;
      accumRef.current.set(id, accum);
      if (accum >= REQUIRED_LISTEN_SECONDS && !listenedIds.has(id) && !pendingRef.current.has(id)) {
        recordListen(id);
      }
    }
  }

  useEffect(() => {
    lastTickRef.current = 0;
    if (nowPlaying && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [nowPlaying]);

  const current = submissions.find((s) => s.id === nowPlaying) ?? null;

  const votingOpen = isOpen && submissions.length >= minSubmissionsToVote;
  const requiredIds =
    isLoggedIn && viewer
      ? submissions.filter((s) => s.submitter.userId !== viewer.userId).map((s) => s.id)
      : [];
  const listenedRequired = requiredIds.filter((id) => listenedIds.has(id)).length;
  const allListened = requiredIds.length === 0 || listenedRequired === requiredIds.length;
  const voteLocked = isLoggedIn && isOpen && (!votingOpen || !allListened);
  const voteLockLabel = !votingOpen ? "🔒 Voting soon" : "🎧 Listen first";

  const myVotes = viewer?.myVotes ?? [];
  const myUpUsed = myVotes.filter((v) => v.direction === "UP").length;
  const myDownUsed = myVotes.filter((v) => v.direction === "DOWN").length;
  const myDirOf = (id: string): "UP" | "DOWN" | null =>
    myVotes.find((v) => v.submissionId === id)?.direction ?? null;

  function togglePlay(id: string) {
    const audio = audioRef.current;
    if (nowPlaying === id) {
      if (audio) {
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
      }
    } else {
      setCurrentTime(0);
      setDuration(0);
      setNowPlaying(id);
    }
  }

  async function vote(submissionId: string, direction: "UP" | "DOWN") {
    if (!isLoggedIn) {
      signIn("discord");
      return;
    }
    setVoteBusy(submissionId);
    try {
      const res = await fetch("/api/song-contest/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, direction }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        onError(d.error ?? "Vote failed.");
      }
      await onChanged();
    } catch {
      onError("Network error.");
    } finally {
      setVoteBusy(null);
    }
  }

  const ranked = isOpen
    ? submissions
    : [...submissions].sort((a, b) => b.score - a.score || b.upVotes - a.upVotes);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-text-primary">
          Submissions <span className="text-text-muted text-base">({submissions.length})</span>
        </h2>
        <div className="text-right">
          <div className="text-xs text-text-muted">{totalVotes} vote{totalVotes === 1 ? "" : "s"} cast</div>
          {votingOpen && isLoggedIn && (
            <div className="text-xs">
              <span className="text-text-muted">your votes: </span>
              <span className="text-odds-green font-semibold">👍 {myUpUsed}/{votesPerDirection}</span>
              <span className="text-text-muted"> · </span>
              <span className="text-loss font-semibold">👎 {myDownUsed}/{votesPerDirection}</span>
            </div>
          )}
        </div>
      </div>

      {isOpen && !votingOpen && (
        <div className="rounded-xl border border-border-light/50 bg-surface p-3 flex items-center gap-3">
          <span className="text-xl shrink-0">🗳️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text-primary">
              Voting opens once there are {minSubmissionsToVote} submissions.
            </p>
            <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden mt-1.5">
              <div
                className="h-full bg-gold transition-all"
                style={{ width: `${Math.min(100, (submissions.length / minSubmissionsToVote) * 100)}%` }}
              />
            </div>
          </div>
          <span className="text-sm font-bold text-text-secondary shrink-0">
            {submissions.length}/{minSubmissionsToVote}
          </span>
        </div>
      )}

      {isOpen && votingOpen && isLoggedIn && requiredIds.length > 0 && !allListened && (
        <div className="rounded-xl border border-gold/40 bg-gold/5 p-3 flex items-center gap-3">
          <span className="text-xl shrink-0">🎧</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text-primary">
              Listen to every song for {REQUIRED_LISTEN_SECONDS}s to unlock voting
            </p>
            <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden mt-1.5">
              <div
                className="h-full bg-gold transition-all"
                style={{ width: `${(listenedRequired / requiredIds.length) * 100}%` }}
              />
            </div>
          </div>
          <span className="text-sm font-bold text-gold shrink-0">
            {listenedRequired}/{requiredIds.length}
          </span>
        </div>
      )}

      {submissions.length === 0 ? (
        <p className="text-text-muted text-sm py-8 text-center border border-border-light/50 rounded-xl bg-surface">
          No submissions yet. Be the first!
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ranked.map((s) => (
            <SubmissionCard
              key={s.id}
              submission={s}
              isPlaying={nowPlaying === s.id && playing}
              isCurrent={nowPlaying === s.id}
              isOwn={viewer?.userId === s.submitter.userId}
              listened={listenedIds.has(s.id)}
              myDir={myDirOf(s.id)}
              canVote={isOpen}
              voteLocked={voteLocked}
              voteLockLabel={voteLockLabel}
              upDisabled={voteBusy === s.id || voteLocked || (myDirOf(s.id) !== "UP" && myUpUsed >= votesPerDirection)}
              downDisabled={voteBusy === s.id || voteLocked || (myDirOf(s.id) !== "DOWN" && myDownUsed >= votesPerDirection)}
              rankBadge={
                results?.winner?.submissionId === s.id
                  ? "🥇"
                  : results?.runnerUp?.submissionId === s.id
                    ? "🥈"
                    : null
              }
              onPlay={() => togglePlay(s.id)}
              onUp={() => vote(s.id, "UP")}
              onDown={() => vote(s.id, "DOWN")}
            />
          ))}
        </div>
      )}

      {/* Persistent audio element (hidden); driven by the player bar. */}
      <audio
        ref={audioRef}
        src={nowPlaying ? `/api/song-contest/submissions/${nowPlaying}/audio` : undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          // A fully-played track counts as listened (covers songs < 15s).
          if (nowPlaying && !listenedIds.has(nowPlaying)) recordListen(nowPlaying);
        }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onError={() => {
          if (!nowPlaying) return;
          setPlaying(false);
          onError("Can't play this file inline in your browser.");
          // Don't let a file the browser can't decode permanently block voting.
          if (!listenedIds.has(nowPlaying)) recordListen(nowPlaying);
        }}
        hidden
      />

      {current && (
        <PlayerBar
          submission={current}
          playing={playing}
          currentTime={currentTime}
          duration={duration}
          onToggle={() => {
            const a = audioRef.current;
            if (!a) return;
            if (a.paused) a.play().catch(() => {});
            else a.pause();
          }}
          onSeek={(v) => {
            const a = audioRef.current;
            if (a) {
              a.currentTime = v;
              setCurrentTime(v);
              lastTickRef.current = v;
            }
          }}
          onClose={() => {
            audioRef.current?.pause();
            setNowPlaying(null);
            setPlaying(false);
          }}
        />
      )}
    </section>
  );
}

function VoterChip({ person }: { person: Person }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 bg-bg-tertiary border border-border rounded-full pl-0.5 pr-2 py-0.5"
      title={person.name}
    >
      <Avatar person={person} size={18} />
      <span className="text-xs text-text-secondary">{person.name}</span>
    </span>
  );
}

function SubmissionCard({
  submission: s,
  isPlaying,
  isCurrent,
  isOwn,
  listened,
  myDir,
  canVote,
  voteLocked,
  voteLockLabel,
  upDisabled,
  downDisabled,
  rankBadge,
  onPlay,
  onUp,
  onDown,
}: {
  submission: SubmissionView;
  isPlaying: boolean;
  isCurrent: boolean;
  isOwn: boolean;
  listened: boolean;
  myDir: "UP" | "DOWN" | null;
  canVote: boolean;
  voteLocked: boolean;
  voteLockLabel: string;
  upDisabled: boolean;
  downDisabled: boolean;
  rankBadge: string | null;
  onPlay: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const [showVotes, setShowVotes] = useState(false);
  const totalCardVotes = s.upVotes + s.downVotes;
  return (
    <div
      className={`rounded-xl border p-4 bg-surface transition-colors ${
        isCurrent ? "border-gold/50" : "border-border-light/50"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Cover doubles as the play/pause button */}
        <button
          onClick={onPlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="group relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-border bg-bg-tertiary bg-cover bg-center cursor-pointer"
          style={s.hasCover ? { backgroundImage: `url(${coverUrl(s.id)})` } : undefined}
        >
          {!s.hasCover && (
            <span className="absolute inset-0 flex items-center justify-center text-text-muted text-xl">🎵</span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/55 transition-colors">
            {isPlaying ? (
              <PauseIcon className="w-6 h-6 text-white" />
            ) : (
              <PlayIcon className="w-6 h-6 text-white ml-0.5" />
            )}
          </span>
        </button>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {rankBadge && <span className="text-lg">{rankBadge}</span>}
            <span className="font-bold text-text-primary truncate">{s.songTitle}</span>
            {listened && (
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-odds-green border border-odds-green/40 rounded px-1.5 py-0.5">
                ✓ Listened
              </span>
            )}
            {isCurrent && <span className="text-[10px] uppercase tracking-wide text-gold">● now playing</span>}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <Avatar person={s.submitter} size={22} />
            <span className="text-sm text-text-secondary truncate">{s.submitter.name}</span>
          </div>
          <div className="text-xs text-text-muted mt-1 flex items-center gap-2 flex-wrap">
            <span className="px-1.5 py-0.5 rounded bg-bg-tertiary border border-border">{ext(s.fileName)}</span>
            <span>{fmtBytes(s.sizeBytes)}</span>
            {s.isVideo && <span>· video (audio plays inline)</span>}
          </div>
        </div>

        {/* Vote tallies + 👍 / 👎 buttons */}
        <div className="shrink-0 flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 text-sm font-bold">
            <span className="text-odds-green">👍 {s.upVotes}</span>
            <span className="text-loss">👎 {s.downVotes}</span>
          </div>
          {canVote &&
            (isOwn ? (
              <span className="text-[10px] uppercase tracking-wide text-text-muted border border-border rounded px-2 py-1">
                Your entry
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onUp}
                  disabled={upDisabled}
                  title={voteLocked ? voteLockLabel : "Thumbs up"}
                  className={`w-9 h-9 rounded-lg text-base flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    myDir === "UP"
                      ? "bg-odds-green text-black"
                      : "border border-odds-green/50 text-odds-green hover:bg-odds-green/10"
                  }`}
                >
                  👍
                </button>
                <button
                  onClick={onDown}
                  disabled={downDisabled}
                  title={voteLocked ? voteLockLabel : "Thumbs down"}
                  className={`w-9 h-9 rounded-lg text-base flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    myDir === "DOWN"
                      ? "bg-loss text-white"
                      : "border border-loss/50 text-loss hover:bg-loss/10"
                  }`}
                >
                  👎
                </button>
              </div>
            ))}
          {totalCardVotes > 0 && (
            <button
              onClick={() => setShowVotes((v) => !v)}
              className="text-xs text-text-muted hover:text-text-secondary cursor-pointer flex items-center gap-1"
            >
              {showVotes ? "Hide votes" : "See votes"}
              <svg
                className={`w-3 h-3 transition-transform ${showVotes ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Voters — collapsed by default, revealed via "See votes" */}
      {showVotes && (
        <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
          {s.upVoters.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs shrink-0">👍</span>
              {s.upVoters.map((v) => (
                <VoterChip key={v.userId} person={v} />
              ))}
            </div>
          )}
          {s.downVoters.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs shrink-0">👎</span>
              {s.downVoters.map((v) => (
                <VoterChip key={v.userId} person={v} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlayerBar({
  submission: s,
  playing,
  currentTime,
  duration,
  onToggle,
  onSeek,
  onClose,
}: {
  submission: SubmissionView;
  playing: boolean;
  currentTime: number;
  duration: number;
  onToggle: () => void;
  onSeek: (v: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-bg-secondary/95 backdrop-blur border-t border-border-light shadow-2xl">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3 sm:gap-4">
        <button
          onClick={onToggle}
          aria-label={playing ? "Pause" : "Play"}
          className="shrink-0 w-11 h-11 rounded-full bg-gold hover:bg-gold-bright text-black flex items-center justify-center transition-colors cursor-pointer"
        >
          {playing ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5 ml-0.5" />}
        </button>

        <CoverTile id={s.id} hasCover={s.hasCover} size={40} />

        <div className="min-w-0 w-28 sm:w-48 shrink-0">
          <div className="text-sm font-semibold text-text-primary truncate">{s.songTitle}</div>
          <div className="text-xs text-text-muted truncate">
            by {s.submitter.name}
            {s.isVideo && " · video"}
          </div>
        </div>

        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-[11px] text-text-muted tabular-nums w-9 text-right">{fmtTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="flex-1 accent-gold h-1 cursor-pointer"
            aria-label="Seek"
          />
          <span className="text-[11px] text-text-muted tabular-nums w-9">{fmtTime(duration)}</span>
        </div>

        <button
          onClick={onClose}
          aria-label="Close player"
          className="shrink-0 text-text-muted hover:text-text-primary p-1 cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
