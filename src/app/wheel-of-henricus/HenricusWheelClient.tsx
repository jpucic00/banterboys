"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SpinnerInfo = {
  id: string;
  name: string | null;
  alias: string | null;
  image: string | null;
};

type Spin = {
  id: string;
  assignedAlias: string;
  createdAt: string;
  spinner: SpinnerInfo;
};

type EligibleUser = {
  id: string;
  alias: string;
  name: string | null;
  image: string | null;
};

type RecentSettled = {
  id: string;
  deadAlias: string | null;
  totalPayout: number;
  settledAt: string | null;
  winners: string[];
};

type UserState = {
  isLoggedIn: boolean;
  isAdmin: boolean;
  spinsRemaining: number;
  balance: number;
  userId: string | null;
  displayName: string | null;
};

type InitialState = {
  frame: { id: string; totalSpinCount: number; createdAt: string };
  spins: Spin[];
  eligibleUsers: EligibleUser[];
  recentSettled: RecentSettled[];
  user: UserState;
};

type SpinResponse = {
  spinId: string;
  createdAt: string;
  assignedAlias: string;
  assignedDisplayName: string;
  newBalance: number;
  spinsRemaining: number;
  frameId: string;
};

const SPIN_STAKE = 25;
const SPIN_PAYOUT = 500;
const MAX_SPINS_PER_FRAME = 3;
const ANIMATION_MS = 4500;

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function spinnerLabel(s: SpinnerInfo): string {
  return s.alias ?? s.name ?? "Unknown";
}

export default function HenricusWheelClient({
  initialState,
}: {
  initialState: InitialState;
}) {
  const [state, setState] = useState(initialState);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [reveal, setReveal] = useState<SpinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const lastFrameId = useRef(initialState.frame.id);

  // Visible wheel pool: all aliased guildmates (excluding self if logged in).
  // Stable order by alias so the wheel layout doesn't jitter between renders.
  const wheelEntries = useMemo(() => {
    return state.eligibleUsers.filter((u) => u.id !== state.user.userId);
  }, [state.eligibleUsers, state.user.userId]);

  // Re-fetch state every 30s while idle. Detect frame transitions for the toast.
  useEffect(() => {
    if (spinning) return;
    const intervalId = window.setInterval(async () => {
      try {
        const res = await fetch("/api/wheel-of-henricus", { cache: "no-store" });
        if (!res.ok) return;
        const fresh = await res.json();
        setState((prev) => ({
          frame: fresh.frame,
          spins: fresh.spins,
          eligibleUsers: fresh.eligibleUsers,
          recentSettled: fresh.recentSettled,
          user: { ...prev.user, ...fresh.user },
        }));
      } catch {}
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [spinning]);

  // Re-render every 30s so "X seconds ago" timers stay fresh.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Surface a banner when a new frame starts (a settlement just happened).
  const [settlementToast, setSettlementToast] = useState<string | null>(null);
  useEffect(() => {
    if (state.frame.id !== lastFrameId.current) {
      const last = state.recentSettled[0];
      if (last) {
        const winnerStr = last.winners.length
          ? last.winners.join(", ")
          : "no one";
        setSettlementToast(
          `🎯 Last round settled — ${last.deadAlias} died · ${winnerStr} cashed out (${last.totalPayout} TC).`
        );
      }
      lastFrameId.current = state.frame.id;
    }
  }, [state.frame.id, state.recentSettled]);

  const handleSpin = useCallback(async () => {
    if (spinning) return;
    if (!state.user.isLoggedIn) {
      setError("Sign in with Discord to spin.");
      return;
    }
    if (state.user.spinsRemaining <= 0) {
      setError(`You've used all ${MAX_SPINS_PER_FRAME} spins for this round.`);
      return;
    }
    if (state.user.balance - SPIN_STAKE < -500) {
      setError("Debt limit reached (500 TC). Pay out your debt to keep spinning.");
      return;
    }
    setError(null);
    setSpinning(true);

    try {
      const res = await fetch("/api/wheel-of-henricus/spin", { method: "POST" });
      const json: SpinResponse | { error: string } = await res.json();
      if (!res.ok || "error" in json) {
        setError(("error" in json && json.error) || "Spin failed.");
        setSpinning(false);
        return;
      }

      // Compute target rotation so the pointer lands on the assigned alias.
      // Pointer is at the top (12 o'clock); add 6 full rotations for drama.
      // Always grow rotation forward — never reset — so each spin animates
      // smoothly from the wheel's current resting position.
      const idx = wheelEntries.findIndex((u) => u.alias === json.assignedAlias);
      const segCount = Math.max(1, wheelEntries.length);
      const segDeg = 360 / segCount;
      const desiredAtRest = idx >= 0 ? -(idx * segDeg) - segDeg / 2 : 0;
      const currentMod = ((rotation % 360) + 360) % 360;
      const desiredMod = ((desiredAtRest % 360) + 360) % 360;
      const delta = (desiredMod - currentMod + 360) % 360;
      const target = rotation + delta + 360 * 6;
      setRotation(target);

      window.setTimeout(() => {
        setReveal(json);
        setSpinning(false);
        setState((prev) => ({
          ...prev,
          spins: [
            {
              id: json.spinId,
              assignedAlias: json.assignedAlias,
              createdAt: json.createdAt,
              spinner: {
                id: prev.user.userId ?? "self",
                name: prev.user.displayName,
                alias: prev.user.displayName,
                image: null,
              },
            },
            ...prev.spins,
          ],
          frame: { ...prev.frame, totalSpinCount: prev.frame.totalSpinCount + 1 },
          user: {
            ...prev.user,
            balance: json.newBalance,
            spinsRemaining: json.spinsRemaining,
          },
        }));
      }, ANIMATION_MS);
    } catch {
      setError("Network error. Try again.");
      setSpinning(false);
    }
  }, [spinning, state.user, wheelEntries, rotation]);

  const balanceStr = state.user.balance.toLocaleString();
  const debtBlocked = state.user.balance - SPIN_STAKE < -500;
  const canSpin =
    state.user.isLoggedIn && state.user.spinsRemaining > 0 && !debtBlocked && !spinning;

  const revealedUser = reveal
    ? state.eligibleUsers.find((u) => u.alias === reveal.assignedAlias)
    : null;
  const revealFirstChar = reveal
    ? (reveal.assignedAlias.match(/[A-Za-z0-9]/) || [""])[0]?.toUpperCase() || "?"
    : "?";

  return (
    <div className="space-y-8">
      {settlementToast && (
        <div
          className="border border-[#F0A818]/60 bg-[#1a1410] text-[#F0A818] px-4 py-3 rounded flex items-center justify-between"
          role="status"
        >
          <span className="text-sm">{settlementToast}</span>
          <button
            onClick={() => setSettlementToast(null)}
            className="text-xs text-text-muted hover:text-white"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}


      {/* Recent winners marquee */}
      {state.recentSettled.length > 0 && (
        <div className="border border-border bg-[#0f0f0f] rounded-md px-4 py-2 overflow-x-auto">
          <div className="flex items-center gap-6 text-xs whitespace-nowrap">
            <span className="text-text-muted shrink-0">Recent kills</span>
            {state.recentSettled.map((r) => (
              <span key={r.id} className="text-text-secondary shrink-0">
                💀 <span className="text-[#F0A818]">{r.deadAlias}</span> →{" "}
                <span className="text-odds-green">
                  {r.winners.length > 0 ? r.winners.join(", ") : "no one"}
                </span>{" "}
                <span className="text-text-muted">({r.totalPayout} TC)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Wheel + Spin pad */}
      <div className="flex flex-col min-[900px]:flex-row items-center min-[900px]:justify-center gap-8 min-[900px]:gap-8 lg:gap-10">
        <div className="relative shrink-0">
          {/* Pointer */}
          <div
            className="absolute left-1/2 -translate-x-1/2 -top-2 z-10"
            aria-hidden
          >
            <div
              className="w-0 h-0 border-l-[16px] border-r-[16px] border-t-[28px] border-l-transparent border-r-transparent border-t-[#F0A818] drop-shadow-[0_0_6px_#F0A818]"
              style={{ filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.8))" }}
            />
          </div>

          <div className="relative w-[400px] h-[400px] md:w-[560px] md:h-[560px] min-[900px]:w-[560px] min-[900px]:h-[560px] lg:w-[720px] lg:h-[720px]">
            <div
              className="w-full h-full rounded-full shadow-[0_0_60px_#F0A81833]"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: spinning
                  ? `transform ${ANIMATION_MS}ms cubic-bezier(0.17, 0.67, 0.16, 0.99)`
                  : "none",
              }}
            >
              <svg
                viewBox="-100 -100 200 200"
                className="w-full h-full"
                aria-label="Wheel of Henricus"
              >
                {wheelEntries.length === 0 ? (
                  <>
                    <circle cx={0} cy={0} r={95} fill="#1a1410" />
                    <text
                      x={0}
                      y={0}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={6}
                      fill="#7a6240"
                    >
                      No guildmates yet
                    </text>
                  </>
                ) : (
                  <>
                    {/* Pass 1: segment backgrounds + labels */}
                    {wheelEntries.map((u, i) => (
                      <WheelSegment
                        key={u.id}
                        index={i}
                        total={wheelEntries.length}
                        alias={u.alias}
                        image={u.image}
                        layer="base"
                      />
                    ))}
                    {/* Pass 2: avatars on top of all labels */}
                    {wheelEntries.map((u, i) => (
                      <WheelSegment
                        key={u.id + "-avatar"}
                        index={i}
                        total={wheelEntries.length}
                        alias={u.alias}
                        image={u.image}
                        layer="avatar"
                      />
                    ))}
                  </>
                )}
                {/* Outer rim — drawn last so it covers segment edges */}
                <circle
                  cx={0}
                  cy={0}
                  r={95}
                  fill="none"
                  stroke="#F0A818"
                  strokeWidth={1.6}
                />
                <circle
                  cx={0}
                  cy={0}
                  r={97}
                  fill="none"
                  stroke="#F0A818"
                  strokeWidth={0.5}
                  opacity={0.4}
                />
              </svg>
            </div>
            {/* Static hub — stays upright while the wheel underneath rotates */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-8 h-8 md:w-12 md:h-12 lg:w-36 lg:h-36 rounded-full bg-[#0f0f0f] border border-[#F0A818] flex items-center justify-center overflow-hidden shadow-[0_0_18px_#F0A81866]">
                <Image
                  src="/tibia/henricus.webp"
                  alt="Henricus the NPC"
                  width={112}
                  height={112}
                  unoptimized
                  className="object-contain w-[80%] h-[80%]"
                  style={{ imageRendering: "pixelated" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Combined hero + spin pad — narrower on desktop so the wheel dominates */}
        <div className="w-full max-w-md min-[900px]:w-60 min-[900px]:max-w-none lg:w-72 shrink-0 flex flex-col gap-3">
          {/* Hero strip */}
          <div className="border border-[#3a2c0c] bg-gradient-to-br from-[#1a140c] to-[#0f0f0f] rounded-md p-3 text-center">
            <h1 className="text-base md:text-lg font-serif text-[#F0A818] leading-tight tracking-wide drop-shadow-[0_0_4px_#F0A81844]">
              The Wheel of Henricus
            </h1>
            <p className="text-[10px] text-text-muted leading-tight mt-1">
              {SPIN_STAKE} TC spin · win{" "}
              <span className="text-[#F0A818]">{SPIN_PAYOUT} TC</span> if your alias falls
            </p>
          </div>

          <div className="border border-border bg-[#141414] rounded-md p-3 text-center">
            <div className="text-[10px] text-text-muted uppercase tracking-widest">Pay</div>
            <div className="text-xl text-[#F0A818] font-mono mt-0.5">
              {SPIN_STAKE} TC
            </div>
            <div className="text-[10px] text-text-muted mt-2 uppercase tracking-widest">
              Win if your alias falls
            </div>
            <div className="text-2xl text-odds-green font-mono font-semibold mt-0.5 drop-shadow-[0_0_4px_#7ddc2c44]">
              {SPIN_PAYOUT} TC
            </div>
          </div>

          <button
            onClick={handleSpin}
            disabled={!canSpin}
            className={`w-full py-3 rounded-md text-base font-bold tracking-widest transition-all ${
              canSpin
                ? "bg-[#F0A818] text-[#0a0a0a] hover:bg-[#ffb830] hover:scale-[1.02] cursor-pointer shadow-[0_0_20px_#F0A81866]"
                : "bg-[#2a2a2a] text-text-muted cursor-not-allowed"
            }`}
          >
            {spinning
              ? "SPINNING…"
              : !state.user.isLoggedIn
              ? "SIGN IN TO SPIN"
              : state.user.spinsRemaining <= 0
              ? "ROUND LOCKED — WAIT FOR DEATH"
              : debtBlocked
              ? "DEBT LIMIT REACHED"
              : `SPIN — ${SPIN_STAKE} TC`}
          </button>

          <div className="text-xs text-text-muted text-center space-y-1">
            <div>
              You have{" "}
              <span className="text-[#F0A818] font-medium">
                {state.user.spinsRemaining} / {MAX_SPINS_PER_FRAME}
              </span>{" "}
              spins remaining this round
            </div>
            <div>
              Balance: <span className="text-text-secondary font-mono">{balanceStr} TC</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-text-muted border-t border-border pt-2 px-1">
            <span>
              🎰 {state.frame.totalSpinCount} · 👥 {state.eligibleUsers.length}
            </span>
            {state.user.isAdmin && (
              <Link
                href="/wheel-of-henricus/history"
                className="text-[#F0A818] hover:underline"
              >
                audit trail →
              </Link>
            )}
          </div>

          {error && (
            <div className="text-sm text-loss bg-loss/10 border border-loss/30 px-3 py-2 rounded">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Who got who */}
      <section className="border border-border bg-[#0f0f0f] rounded-md p-5">
        <h2 className="text-sm uppercase tracking-widest text-text-muted mb-3">
          Who got who · current round
        </h2>
        {state.spins.length === 0 ? (
          <div className="text-text-muted text-sm italic">
            No spins yet. Be the first to test the wheel.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {state.spins.map((s) => {
              const assignedUser = state.eligibleUsers.find(
                (u) => u.alias === s.assignedAlias
              );
              return (
                <li
                  key={s.id}
                  className="py-2 flex items-center justify-between text-sm gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {s.spinner.image ? (
                      <Image
                        src={s.spinner.image}
                        alt=""
                        width={24}
                        height={24}
                        className="rounded-full ring-1 ring-border-light shrink-0"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-[#1a1a1a] border border-border shrink-0" />
                    )}
                    <span className="text-text-secondary truncate">
                      {spinnerLabel(s.spinner)}
                    </span>
                    <span className="text-text-muted shrink-0">
                      got a new Henricus champion:
                    </span>
                    {assignedUser?.image ? (
                      <Image
                        src={assignedUser.image}
                        alt=""
                        width={24}
                        height={24}
                        className="rounded-full ring-1 ring-[#F0A818]/40 shrink-0"
                      />
                    ) : (
                      <span
                        className="w-6 h-6 rounded-full bg-[#1a140c] border border-[#F0A818]/40 flex items-center justify-center text-[#F0A818] text-[10px] font-bold shrink-0"
                        aria-hidden
                      >
                        {(s.assignedAlias.match(/[A-Za-z0-9]/) || [""])[0]?.toUpperCase() || "?"}
                      </span>
                    )}
                    <span className="text-[#F0A818] font-medium truncate">
                      {s.assignedAlias}
                    </span>
                  </div>
                  <span className="text-xs text-text-muted shrink-0 tabular-nums">
                    {tick >= 0 && timeAgo(s.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Reveal modal */}
      {reveal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setReveal(null)}
        >
          <div
            className="max-w-md w-full bg-[#141414] border-2 border-[#F0A818] rounded-lg p-8 text-center shadow-[0_0_60px_#F0A81866]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs uppercase tracking-widest text-text-muted">
              You drew
            </div>
            <div className="mt-4 flex justify-center">
              {revealedUser?.image ? (
                <Image
                  src={revealedUser.image}
                  alt=""
                  width={96}
                  height={96}
                  className="rounded-full ring-2 ring-[#F0A818] shadow-[0_0_20px_#F0A81866]"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-[#1a140c] ring-2 ring-[#F0A818] shadow-[0_0_20px_#F0A81866] flex items-center justify-center text-[#F0A818] text-3xl font-bold">
                  {revealFirstChar}
                </div>
              )}
            </div>
            <div className="mt-3 text-4xl text-[#F0A818] font-serif drop-shadow-[0_0_12px_#F0A81866]">
              {reveal.assignedAlias}
            </div>
            {reveal.assignedDisplayName !== reveal.assignedAlias && (
              <div className="mt-1 text-sm text-text-muted">
                ({reveal.assignedDisplayName})
              </div>
            )}
            <p className="mt-4 text-sm text-text-secondary italic">
              May they meet a swift end. The wheel watches.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-xs">
              <div className="border border-border bg-[#0f0f0f] rounded p-2">
                <div className="text-text-muted uppercase tracking-widest">
                  Spins left
                </div>
                <div className="text-[#F0A818] text-lg font-mono">
                  {reveal.spinsRemaining} / {MAX_SPINS_PER_FRAME}
                </div>
              </div>
              <div className="border border-border bg-[#0f0f0f] rounded p-2">
                <div className="text-text-muted uppercase tracking-widest">
                  Balance
                </div>
                <div className="text-text-secondary text-lg font-mono">
                  {reveal.newBalance.toLocaleString()} TC
                </div>
              </div>
            </div>
            <button
              onClick={() => setReveal(null)}
              className="mt-6 px-6 py-2 bg-[#F0A818] text-[#0a0a0a] rounded font-bold hover:bg-[#ffb830] cursor-pointer"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WheelSegment({
  index,
  total,
  alias,
  image,
  layer,
}: {
  index: number;
  total: number;
  alias: string;
  image: string | null;
  layer: "base" | "avatar";
}) {
  const r = 95;
  const segDeg = 360 / total;
  const startA = index * segDeg;
  const endA = (index + 1) * segDeg;
  const midA = (startA + endA) / 2;

  // Wheel angle (clockwise from top) → SVG Cartesian (where y is down).
  // Round to 4 decimals so server and client produce byte-identical output —
  // SVG attributes are strings, so even a 1-ulp float difference between Node
  // and the browser triggers a React hydration mismatch.
  const toRad = (a: number) => ((a - 90) * Math.PI) / 180;
  const q = (n: number) => Math.round(n * 10000) / 10000;

  const x1 = q(r * Math.cos(toRad(startA)));
  const y1 = q(r * Math.sin(toRad(startA)));
  const x2 = q(r * Math.cos(toRad(endA)));
  const y2 = q(r * Math.sin(toRad(endA)));
  const largeArc = endA - startA > 180 ? 1 : 0;
  const slicePath = `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

  // Label at ~55% radius (middle band), avatar at ~80% radius (wide outer band).
  const labelR = 55;
  const lx = q(labelR * Math.cos(toRad(midA)));
  const ly = q(labelR * Math.sin(toRad(midA)));
  const avatarR = 80;
  const avatarRadius = 7;
  const ax = q(avatarR * Math.cos(toRad(midA)));
  const ay = q(avatarR * Math.sin(toRad(midA)));

  // Trim text so it never enters the avatar zone. textAnchor=middle means the
  // text extends ±halfWidth from the anchor. The outward edge must stay ≤
  // (avatarR - avatarRadius - 2) to leave a 2-unit gap before the icon.
  const charWidth = 3.3; // approximate SVG units per char at fontSize 5.5
  const halfRoom = avatarR - avatarRadius - 2 - labelR;
  const maxChars = Math.max(4, Math.floor((halfRoom * 2) / charWidth));
  const display = alias.length > maxChars ? alias.slice(0, maxChars - 1) + "…" : alias;
  // Alternating wedge tones; if odd-count, force last wedge to a third tone
  // so segments 0 and N-1 don't share a fill at the seam.
  const seamConflict = total % 2 === 1 && index === total - 1;
  const fill = seamConflict
    ? "#3a2818"
    : index % 2 === 0
    ? "#2c1810"
    : "#4a3520";

  // Label always reads from inside outward. Flip text on the lower half so
  // it doesn't appear upside-down in the wheel's resting frame.
  const isLowerHalf = midA > 90 && midA < 270;
  const baseAngle = midA - 90; // SVG rotation that aligns text with the radius
  const labelAngle = isLowerHalf ? baseAngle + 180 : baseAngle;

  // Initials fallback: take the first letter of the alias for the avatar disk.
  const firstChar = (alias.match(/[A-Za-z0-9]/) || [""])[0]?.toUpperCase() || "?";
  const clipId = `henricus-avatar-clip-${index}`;

  if (layer === "base") return (
    <g>
      <path
        d={slicePath}
        fill={fill}
        stroke="#F0A818"
        strokeWidth={0.7}
        strokeOpacity={0.55}
        strokeLinejoin="round"
      />
      <text
        x={lx}
        y={ly}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={5.5}
        fontWeight={600}
        fontFamily="sans-serif"
        fill="#f5e6c8"
        transform={`rotate(${labelAngle} ${lx} ${ly})`}
        style={{
          paintOrder: "stroke",
          stroke: "rgba(0,0,0,0.9)",
          strokeWidth: 0.7,
          strokeLinejoin: "round",
        }}
      >
        {display}
      </text>
    </g>
  );

  // layer === "avatar"
  return (
    <g>
      {image ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <circle cx={ax} cy={ay} r={avatarRadius} />
            </clipPath>
          </defs>
          <image
            href={image}
            x={ax - avatarRadius}
            y={ay - avatarRadius}
            width={avatarRadius * 2}
            height={avatarRadius * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        </>
      ) : (
        <>
          <circle cx={ax} cy={ay} r={avatarRadius} fill="#1a140c" />
          <text
            x={ax}
            y={ay}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10}
            fontWeight={700}
            fill="#F0A818"
            fontFamily="sans-serif"
          >
            {firstChar}
          </text>
        </>
      )}
      <circle
        cx={ax}
        cy={ay}
        r={avatarRadius}
        fill="none"
        stroke="#F0A818"
        strokeWidth={0.6}
        strokeOpacity={0.7}
      />
    </g>
  );
}
