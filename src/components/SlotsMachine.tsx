"use client";

import { useState, useRef, useEffect } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import SlotReel, { CELL, PADDING } from "./SlotReel";
import { CoinAmount } from "./CoinIcon";
import {
  SlotSymbol,
  SPRITE_PATH,
  SYMBOL_LABEL,
  PAYTABLE,
  STAKE_LIMITS,
  BIG_WIN_MULTIPLIER,
  MAX_SLOT_DEBT,
  GAMBLE_CARDS,
  MAX_GAMBLE_ROUNDS,
} from "@/lib/slots";

type SpinUser = {
  name: string | null;
  alias: string | null;
  image: string | null;
};

type SpinHistoryItem = {
  id: string;
  stake: number;
  payout: number;
  multiplier: number;
  symbols: string;
  currency: string;
  createdAt: Date | string;
  user: SpinUser;
};

type SpinResponse = {
  spinId: string;
  symbols: [SlotSymbol, SlotSymbol, SlotSymbol];
  payout: number;
  multiplier: number;
  newBalance: number;
  activeGambleAmount: number;
  activeGambleRounds: number;
};

type GambleResponse = {
  won: boolean;
  winIndex: number;
  amountAtRisk: number;
  newBalance: number;
  activeGambleAmount: number;
  activeGambleRounds: number;
};

type GambleReveal = {
  pickIndex: number;
  winIndex: number;
  won: boolean;
  amountAtRisk: number;
};

const REEL_DURATIONS = [1400, 1700, 2000];
const LAST_REEL_DURATION = REEL_DURATIONS[REEL_DURATIONS.length - 1];

function deriveWinningPositions(
  symbols: SlotSymbol[] | null,
  multiplier: number
): [boolean, boolean, boolean] {
  if (!symbols || multiplier === 0) return [false, false, false];
  const [a, b, c] = symbols;
  if (a === b && b === c) return [true, true, true];
  if (a === b) return [true, true, false];
  if (a === c) return [true, false, true];
  if (b === c) return [false, true, true];
  return [false, false, false];
}

export default function SlotsMachine({
  isLoggedIn,
  initialSaldo,
  initialGamble,
  initialSpins,
  currentUser,
}: {
  isLoggedIn: boolean;
  initialSaldo: { saldoTibiaCoins: number };
  initialGamble: { activeGambleAmount: number; activeGambleRounds: number };
  initialSpins: SpinHistoryItem[];
  currentUser: SpinUser | null;
}) {
  const presets = STAKE_LIMITS.TIBIA_COINS.presets;
  const [stakeInput, setStakeInput] = useState<string>(String(presets[0]));
  const stake = Math.max(0, Math.floor(Number(stakeInput) || 0));
  const [balance, setBalance] = useState<number>(initialSaldo.saldoTibiaCoins);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SpinResponse | null>(null);
  const [resultVisible, setResultVisible] = useState(false);
  const [history, setHistory] = useState<SpinHistoryItem[]>(initialSpins);

  // Double-or-nothing gamble state
  const [gambleAmount, setGambleAmount] = useState<number>(
    initialGamble.activeGambleAmount
  );
  const [gambleRounds, setGambleRounds] = useState<number>(
    initialGamble.activeGambleRounds
  );
  const [gambling, setGambling] = useState(false);
  const [gambleReveal, setGambleReveal] = useState<GambleReveal | null>(null);

  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gambleRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
      if (gambleRevealTimer.current) clearTimeout(gambleRevealTimer.current);
    };
  }, []);

  useEffect(() => {
    // Keep local balance in sync if parent re-hydrates
    setBalance(initialSaldo.saldoTibiaCoins);
  }, [initialSaldo.saldoTibiaCoins]);

  const worstCaseBalance = balance - stake;
  const debtLimitHit = isLoggedIn && worstCaseBalance < -MAX_SLOT_DEBT;

  const canSpin =
    isLoggedIn &&
    !spinning &&
    stake >= STAKE_LIMITS.TIBIA_COINS.min &&
    stake <= STAKE_LIMITS.TIBIA_COINS.max &&
    !debtLimitHit;

  const willGoNegative = isLoggedIn && worstCaseBalance < 0 && !debtLimitHit;

  async function handleSpin() {
    if (!canSpin) return;
    setError(null);
    setResultVisible(false);
    setSpinning(true);
    // Any pending gamble is auto-collected server-side when a new spin begins;
    // reset the client state immediately so the gamble UI disappears.
    if (gambleRevealTimer.current) clearTimeout(gambleRevealTimer.current);
    setGambleReveal(null);
    setGambleAmount(0);
    setGambleRounds(0);

    try {
      const res = await fetch("/api/slots/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stake, currency: "TIBIA_COINS" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Spin failed." }));
        setError(data.error ?? "Spin failed.");
        setSpinning(false);
        return;
      }

      const data = (await res.json()) as SpinResponse;
      setLastResult(data);

      // Let the last reel finish before updating balance / flipping UI / showing banner.
      if (revealTimer.current) clearTimeout(revealTimer.current);
      revealTimer.current = setTimeout(() => {
        setBalance(data.newBalance);
        setGambleAmount(data.activeGambleAmount);
        setGambleRounds(data.activeGambleRounds);
        setSpinning(false);
        setResultVisible(true);
        // Add to local history (prepend the current user's spin)
        setHistory((h) =>
          [
            {
              id: data.spinId,
              stake,
              payout: data.payout,
              multiplier: data.multiplier,
              symbols: data.symbols.join(","),
              currency: "TIBIA_COINS",
              createdAt: new Date(),
              user: currentUser ?? { name: null, alias: null, image: null },
            },
            ...h,
          ].slice(0, 10)
        );
      }, LAST_REEL_DURATION + 60);
    } catch (e) {
      console.error(e);
      setError("Network error.");
      setSpinning(false);
    }
  }

  async function handleGamble(pickIndex: number) {
    if (gambling || spinning) return;
    if (gambleAmount <= 0 || gambleRounds >= MAX_GAMBLE_ROUNDS) return;
    setError(null);
    setGambling(true);

    try {
      const res = await fetch("/api/slots/gamble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickIndex }),
      });

      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Gamble failed." }));
        setError(data.error ?? "Gamble failed.");
        setGambling(false);
        return;
      }

      const data = (await res.json()) as GambleResponse;
      setGambleReveal({
        pickIndex,
        winIndex: data.winIndex,
        won: data.won,
        amountAtRisk: data.amountAtRisk,
      });

      // After the flip+reveal animation, commit the new balance/amount state.
      if (gambleRevealTimer.current) clearTimeout(gambleRevealTimer.current);
      gambleRevealTimer.current = setTimeout(() => {
        setBalance(data.newBalance);
        setGambleAmount(data.activeGambleAmount);
        setGambleRounds(data.activeGambleRounds);
        setGambling(false);
        // Keep the reveal visible briefly, then reset so the player can
        // either gamble again (cards reset face-down) or collect.
        if (gambleRevealTimer.current) clearTimeout(gambleRevealTimer.current);
        gambleRevealTimer.current = setTimeout(
          () => setGambleReveal(null),
          1600
        );
      }, 700);
    } catch (e) {
      console.error(e);
      setError("Network error.");
      setGambling(false);
    }
  }

  async function handleCollect() {
    if (gambling || spinning || gambleAmount <= 0) return;
    setError(null);
    setGambling(true);
    try {
      const res = await fetch("/api/slots/collect", { method: "POST" });
      if (!res.ok) {
        setError("Failed to collect.");
        setGambling(false);
        return;
      }
      const data = (await res.json()) as {
        newBalance: number;
        activeGambleAmount: number;
        activeGambleRounds: number;
      };
      setBalance(data.newBalance);
      setGambleAmount(data.activeGambleAmount);
      setGambleRounds(data.activeGambleRounds);
      setGambleReveal(null);
      setGambling(false);
    } catch (e) {
      console.error(e);
      setError("Network error.");
      setGambling(false);
    }
  }

  const targets = lastResult?.symbols ?? null;
  const isJackpot =
    resultVisible && lastResult?.symbols.every((s) => s === "ferumbras");
  const isBigWin =
    resultVisible &&
    !!lastResult &&
    lastResult.multiplier >= BIG_WIN_MULTIPLIER;
  const isSmallWin =
    resultVisible &&
    !!lastResult &&
    lastResult.multiplier > 0 &&
    lastResult.multiplier < BIG_WIN_MULTIPLIER;
  const isLoss =
    resultVisible && !!lastResult && lastResult.multiplier === 0;
  const isWin = !!(isBigWin || isSmallWin);

  // Which middle-row cells are part of the winning combo (for symbol pulse).
  const winningPositions = deriveWinningPositions(
    lastResult?.symbols ?? null,
    lastResult?.multiplier ?? 0
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-text-muted text-xs">
            Match 3 symbols for big payouts. Tibia Coins only.
          </p>
        </div>
        {isLoggedIn && (
          <div
            className="px-3 py-2 rounded-md text-xs"
            style={{
              background: "#141414",
              border: `1px solid ${balance < 0 ? "#C6282866" : "#252525"}`,
            }}
          >
            <div className="text-text-muted uppercase tracking-wide text-[10px] mb-0.5">
              Balance
            </div>
            <span style={{ color: balance < 0 ? "#ef4444" : undefined }}>
              <CoinAmount amount={balance} currency="TIBIA_COINS" size={14} />
            </span>
          </div>
        )}
      </div>

      {/* Machine */}
      <div
        className="rounded-md p-5"
        style={{
          background: "#141414",
          border: "1px solid #252525",
          borderLeft: "2px solid #A855F7",
        }}
      >
        {/* Reel cabinet: 3 reels × 3 rows = 9 visible icons, center row is the payline */}
        <div className="flex items-center justify-center mb-5">
          <SlotCabinet
            isJackpot={!!isJackpot}
            isBigWin={!!isBigWin}
            isWin={isWin}
            resultKey={resultVisible ? lastResult?.spinId ?? null : null}
          >
            {[0, 1, 2].map((i) => (
              <SlotReel
                key={i}
                reelIndex={i}
                target={targets ? targets[i] : null}
                durationMs={REEL_DURATIONS[i]}
                spinId={spinning ? lastResult?.spinId ?? null : null}
                spinning={spinning}
                winning={winningPositions[i]}
                jackpot={!!isJackpot}
              />
            ))}
          </SlotCabinet>
        </div>

        {/* Result banner */}
        <div
          className="text-center h-11 mb-3 flex items-center justify-center"
          aria-live="polite"
        >
          {isJackpot && (
            <div
              key={`jp-${lastResult?.spinId}`}
              className="px-5 py-2 rounded-md font-black uppercase tracking-widest text-sm"
              style={{
                background:
                  "linear-gradient(to right, #FFD044, #F0A818, #FFD044)",
                color: "#1a1a1a",
                boxShadow: "0 0 24px rgba(240, 168, 24, 0.8)",
                animation:
                  "slots-banner-pop 450ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
              }}
            >
              👑 JACKPOT × {lastResult?.multiplier}
            </div>
          )}
          {isBigWin && !isJackpot && (
            <div
              key={`bw-${lastResult?.spinId}`}
              className="px-4 py-2 rounded-md font-bold uppercase tracking-wide text-sm"
              style={{
                background: "#00c85322",
                color: "#00c853",
                border: "1px solid #00c853",
                boxShadow: "0 0 16px rgba(0, 200, 83, 0.4)",
                animation:
                  "slots-banner-pop 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
              }}
            >
              Big win! × {lastResult?.multiplier}
            </div>
          )}
          {isSmallWin && (
            <div
              key={`sw-${lastResult?.spinId}`}
              className="text-sm font-medium"
              style={{
                color: "#00c853",
                animation:
                  "slots-banner-pop 350ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
              }}
            >
              You won × {lastResult?.multiplier} ·{" "}
              <CoinAmount
                amount={lastResult?.payout ?? 0}
                currency="TIBIA_COINS"
                size={13}
              />
            </div>
          )}
          {isLoss && (
            <div
              key={`ls-${lastResult?.spinId}`}
              className="flex items-center gap-2 text-sm text-text-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/tibia/amulet_of_loss.webp"
                alt=""
                width={20}
                height={20}
                style={{ imageRendering: "pixelated" }}
              />
              <span>No match — try again.</span>
            </div>
          )}
        </div>

        {/* Double-or-nothing gamble panel */}
        {gambleAmount > 0 && (
          <GamblePanel
            amount={gambleAmount}
            rounds={gambleRounds}
            gambling={gambling}
            reveal={gambleReveal}
            onPick={handleGamble}
            onCollect={handleCollect}
          />
        )}

        {/* Stake controls */}
        <div className="flex flex-wrap items-end gap-3 justify-center">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-text-muted mb-1">
              Stake (TC)
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              value={stakeInput}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "").slice(0, 3);
                // Strip leading zeros unless the value is just "" or "0"
                const cleaned =
                  raw.length > 1 ? raw.replace(/^0+/, "") || "0" : raw;
                setStakeInput(cleaned);
              }}
              onBlur={() => {
                if (stakeInput === "" || stake === 0) {
                  setStakeInput(String(STAKE_LIMITS.TIBIA_COINS.min));
                } else if (stake > STAKE_LIMITS.TIBIA_COINS.max) {
                  setStakeInput(String(STAKE_LIMITS.TIBIA_COINS.max));
                } else {
                  setStakeInput(String(stake));
                }
              }}
              disabled={spinning}
              className="w-28 text-center font-mono"
              style={{
                background: "#0a0a0a",
                border: "1px solid #2e2e2e",
                borderRadius: 6,
                color: "#fff",
                padding: "8px 10px",
                fontSize: 14,
              }}
            />
          </div>

          <div className="flex items-end gap-1.5">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setStakeInput(String(p))}
                disabled={spinning}
                className="text-xs font-bold"
                style={{
                  background: stake === p ? "#A855F7" : "#1f1f1f",
                  color: stake === p ? "#fff" : "#a0a0a0",
                  border: `1px solid ${stake === p ? "#A855F7" : "#333"}`,
                  borderRadius: 6,
                  padding: "8px 12px",
                  cursor: spinning ? "not-allowed" : "pointer",
                  opacity: spinning ? 0.5 : 1,
                  transition: "all 0.12s",
                }}
              >
                {p}
              </button>
            ))}
          </div>

          {isLoggedIn ? (
            <button
              type="button"
              onClick={handleSpin}
              disabled={!canSpin}
              style={{
                background: canSpin
                  ? "linear-gradient(to bottom, #A855F7, #7E22CE)"
                  : "#2a2a2a",
                color: canSpin ? "#fff" : "#666",
                border: "none",
                borderRadius: 6,
                padding: "10px 28px",
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: canSpin ? "pointer" : "not-allowed",
                boxShadow: canSpin ? "0 2px 8px rgba(168, 85, 247, 0.4)" : "none",
                transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
                minWidth: 140,
                textAlign: "center",
              }}
            >
              {spinning ? "Spinning…" : "Spin"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => signIn("discord")}
              style={{
                background: "#5865f2",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Sign in to play
            </button>
          )}
        </div>

        {error && (
          <p
            className="text-center text-xs mt-3"
            style={{ color: "#ef4444" }}
          >
            {error}
          </p>
        )}
        {debtLimitHit && (
          <p
            className="text-center text-xs mt-3 font-medium"
            style={{ color: "#ef4444" }}
          >
            Debt limit reached ({MAX_SLOT_DEBT} TC). Settle with the house to
            keep playing.
          </p>
        )}
        {willGoNegative && (
          <p
            className="text-center text-xs mt-3 font-medium"
            style={{ color: "#F0A818" }}
          >
            Playing on credit — your balance will go negative.
          </p>
        )}
      </div>

      {/* Paytable */}
      <Paytable />

      {/* Recent spins — public feed */}
      <RecentSpins spins={history} />
    </div>
  );
}

function SlotCabinet({
  children,
  isJackpot,
  isBigWin,
  isWin,
  resultKey,
}: {
  children: React.ReactNode;
  isJackpot: boolean;
  isBigWin: boolean;
  isWin: boolean;
  /** Changes when a win is revealed — used to re-trigger one-shot animations. */
  resultKey: string | null;
}) {
  // Where the middle row sits inside a reel: after top padding + one CELL.
  const middleRowTopOffset = PADDING + CELL;

  const paylineColor = isJackpot
    ? "#F0A818"
    : isBigWin
      ? "#00c853"
      : isWin
        ? "#00c85399"
        : "#A855F788";
  const paylineGlow = isJackpot
    ? "0 0 18px rgba(240, 168, 24, 0.55), 0 0 4px rgba(240, 168, 24, 0.9)"
    : isBigWin
      ? "0 0 14px rgba(0, 200, 83, 0.55)"
      : isWin
        ? "0 0 10px rgba(0, 200, 83, 0.35)"
        : "0 0 6px rgba(168, 85, 247, 0.25)";

  // Imperatively restart the cabinet shake/flash on jackpot without remounting the reels.
  const cabinetRef = useRef<HTMLDivElement>(null);
  const paylineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!resultKey) return;
    if (isJackpot && cabinetRef.current) {
      const el = cabinetRef.current;
      el.style.animation = "none";
      // Force reflow so the animation restarts on the next frame.
      void el.offsetHeight;
      el.style.animation =
        "slots-cabinet-shake 0.6s cubic-bezier(.36,.07,.19,.97) both, slots-cabinet-flash 1.1s ease-out both";
    }
    if (isWin && paylineRef.current) {
      const el = paylineRef.current;
      el.style.animation = "none";
      void el.offsetHeight;
      el.style.animation = "slots-payline-flash 0.8s ease-out both";
    }
  }, [resultKey, isJackpot, isWin]);

  return (
    <div
      ref={cabinetRef}
      className="relative overflow-hidden"
      style={{
        padding: "18px 20px",
        borderRadius: 12,
        background:
          "linear-gradient(to bottom, #1a1224 0%, #0f0a18 50%, #1a1224 100%)",
        border: "1px solid #2a1f3a",
        boxShadow:
          "inset 0 1px 0 rgba(168, 85, 247, 0.25), 0 8px 24px rgba(0, 0, 0, 0.5)",
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: 0,
          height: 3,
          background:
            "linear-gradient(to right, transparent, #A855F7 50%, transparent)",
          opacity: 0.7,
        }}
      />

      {/* Reels + payline are positioned inside a shared coord system */}
      <div className="relative inline-flex gap-3">
        {children}

        {/* Payline: horizontal bar across the middle row of all reels */}
        <div
          ref={paylineRef}
          className="pointer-events-none absolute"
          style={{
            left: -6,
            right: -6,
            top: middleRowTopOffset,
            height: CELL,
            borderTop: `2px solid ${paylineColor}`,
            borderBottom: `2px solid ${paylineColor}`,
            boxShadow: paylineGlow,
            transition: "all 0.3s ease",
            borderRadius: 2,
          }}
        />

        {/* Side arrows indicating the payline */}
        <div
          className="pointer-events-none absolute"
          style={{
            left: -18,
            top: middleRowTopOffset + CELL / 2 - 6,
            width: 0,
            height: 0,
            borderTop: "6px solid transparent",
            borderBottom: "6px solid transparent",
            borderLeft: `9px solid ${paylineColor}`,
            filter: `drop-shadow(0 0 4px ${paylineColor})`,
            transition: "all 0.3s ease",
          }}
        />
        <div
          className="pointer-events-none absolute"
          style={{
            right: -18,
            top: middleRowTopOffset + CELL / 2 - 6,
            width: 0,
            height: 0,
            borderTop: "6px solid transparent",
            borderBottom: "6px solid transparent",
            borderRight: `9px solid ${paylineColor}`,
            filter: `drop-shadow(0 0 4px ${paylineColor})`,
            transition: "all 0.3s ease",
          }}
        />
      </div>

      {/* Coin rain spans the full cabinet so coins fall the entire height. */}
      {isWin && resultKey && (
        <CoinRain
          key={resultKey}
          intensity={isJackpot ? "jackpot" : isBigWin ? "big" : "small"}
        />
      )}
    </div>
  );
}

function CoinRain({
  intensity,
}: {
  intensity: "small" | "big" | "jackpot";
}) {
  const count = intensity === "jackpot" ? 30 : intensity === "big" ? 20 : 14;
  const sprite = "/tibia/crystal_coin.webp";

  // Deterministic pseudo-random placement so SSR/CSR match and it looks varied.
  const coins = Array.from({ length: count }, (_, i) => {
    const seed = ((i + 1) * 2654435761) >>> 0;
    const leftPct = ((seed >>> 8) % 92) + 4; // 4–95%
    const delayMs = (((seed >>> 16) & 0x3ff) % 700) + i * 35; // staggered trailing
    const size = 26 + (((seed >>> 2) & 7) * 2); // 26–40px
    const durationMs = 1100 + ((seed >>> 5) & 0x1ff); // 1100–1600ms
    return { leftPct, delayMs, size, durationMs };
  });

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        zIndex: 20,
      }}
    >
      {coins.map((c, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={sprite}
          alt=""
          width={c.size}
          height={c.size}
          style={{
            position: "absolute",
            top: 0,
            left: `${c.leftPct}%`,
            marginLeft: -c.size / 2,
            imageRendering: "pixelated",
            animation: `slots-coin-fall ${c.durationMs}ms ${c.delayMs}ms cubic-bezier(0.55, 0, 0.75, 0.3) forwards`,
            opacity: 0,
            filter: "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.8))",
          }}
        />
      ))}
    </div>
  );
}

function GamblePanel({
  amount,
  rounds,
  gambling,
  reveal,
  onPick,
  onCollect,
}: {
  amount: number;
  rounds: number;
  gambling: boolean;
  reveal: GambleReveal | null;
  onPick: (pickIndex: number) => void;
  onCollect: () => void;
}) {
  const atMaxRounds = rounds >= MAX_GAMBLE_ROUNDS;
  const nextAmount = amount * 2;

  return (
    <div
      className="rounded-md p-4 mb-3 space-y-3"
      style={{
        background:
          "linear-gradient(to bottom, #1a1224 0%, #0f0a18 100%)",
        border: "1px solid #A855F744",
        boxShadow: "0 0 18px rgba(168, 85, 247, 0.15)",
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: "#A855F7" }}
          >
            Double or Nothing
          </div>
          <div className="text-sm text-text-secondary mt-0.5">
            {reveal
              ? reveal.won
                ? "Correct! Gamble again or collect."
                : "Wrong card — you lost it."
              : atMaxRounds
                ? "Max rounds reached. Collect your winnings!"
                : "Pick the Ferumbras to double your winnings."}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-text-muted">
            Round {Math.min(rounds + 1, MAX_GAMBLE_ROUNDS)} / {MAX_GAMBLE_ROUNDS}
          </div>
          <div className="flex items-center justify-end gap-3 mt-0.5 text-xs font-mono">
            <span className="text-text-muted">
              at risk{" "}
              <span style={{ color: "#F0A818" }}>
                <CoinAmount amount={amount} currency="TIBIA_COINS" size={12} />
              </span>
            </span>
            {!atMaxRounds && (
              <span className="text-text-muted">
                win{" "}
                <span style={{ color: "#00c853" }}>
                  <CoinAmount
                    amount={nextAmount}
                    currency="TIBIA_COINS"
                    size={12}
                  />
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="flex items-center justify-center gap-3">
        {Array.from({ length: GAMBLE_CARDS }).map((_, i) => {
          const isRevealed = reveal !== null;
          const isPicked = reveal?.pickIndex === i;
          const isWinCard = reveal?.winIndex === i;
          const clickable = !gambling && !isRevealed && !atMaxRounds;

          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(i)}
              disabled={!clickable}
              aria-label={`Card ${i + 1}`}
              className={`slots-gamble-card ${isRevealed ? "slots-gamble-card-flipped" : ""}`}
              style={{
                width: 76,
                height: 100,
                padding: 0,
                background: "transparent",
                border: "none",
                cursor: clickable ? "pointer" : "default",
                transform: isPicked && !isRevealed ? "translateY(-4px)" : undefined,
                transition: "transform 0.15s",
              }}
            >
              <div className="slots-gamble-card-inner">
                {/* Back (face-down) */}
                <div
                  className="slots-gamble-card-face"
                  style={{
                    background:
                      "linear-gradient(135deg, #2a1f3a 0%, #1a1224 50%, #2a1f3a 100%)",
                    boxShadow: isPicked
                      ? "0 0 14px rgba(168, 85, 247, 0.6)"
                      : clickable
                        ? "0 2px 6px rgba(0, 0, 0, 0.5)"
                        : "0 1px 3px rgba(0, 0, 0, 0.4)",
                    borderColor: isPicked ? "#A855F7" : "#2e2e2e",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/tibia/black_skull.webp"
                    alt=""
                    width={36}
                    height={36}
                    style={{
                      imageRendering: "pixelated",
                      opacity: 0.35,
                    }}
                  />
                </div>
                {/* Front (revealed) */}
                <div
                  className="slots-gamble-card-face slots-gamble-card-face-front"
                  style={{
                    background: isWinCard
                      ? "linear-gradient(135deg, #F0A818 0%, #8a5d0b 100%)"
                      : "linear-gradient(135deg, #7a1a1a 0%, #3a0a0a 100%)",
                    borderColor: isWinCard ? "#FFD044" : "#C62828",
                    boxShadow: isWinCard
                      ? "0 0 18px rgba(240, 168, 24, 0.55)"
                      : "0 2px 6px rgba(0, 0, 0, 0.5)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      isWinCard
                        ? "/tibia/ferumbras.webp"
                        : "/tibia/amulet_of_loss.webp"
                    }
                    alt=""
                    width={isWinCard ? 48 : 40}
                    height={isWinCard ? 48 : 40}
                    style={{ imageRendering: "pixelated" }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Collect button */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onCollect}
          disabled={gambling || !!reveal}
          style={{
            background: gambling || !!reveal
              ? "#2a2a2a"
              : "linear-gradient(to bottom, #00c853, #00a844)",
            color: gambling || !!reveal ? "#666" : "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 20px",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: gambling || !!reveal ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}
        >
          Collect{" "}
          <span style={{ marginLeft: 6 }}>
            <CoinAmount amount={amount} currency="TIBIA_COINS" size={12} />
          </span>
        </button>
      </div>
    </div>
  );
}

function Paytable() {
  const threeOfAKindEntries = (
    Object.entries(PAYTABLE.threeOfAKind) as [SlotSymbol, number][]
  ).sort((a, b) => b[1] - a[1]);
  const pairEntries = (
    Object.entries(PAYTABLE.pair) as [SlotSymbol, number][]
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{ background: "#141414", border: "1px solid #252525" }}
    >
      <div
        className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-text-muted"
        style={{ background: "#1a1a1a", borderBottom: "1px solid #252525" }}
      >
        Paytable
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
        <div className="p-3">
          <div className="text-[10px] uppercase tracking-wide text-text-muted mb-2">
            3 of a kind
          </div>
          <div className="space-y-1.5">
            {threeOfAKindEntries.map(([sym, mult]) => (
              <PayRow key={sym} symbol={sym} count={3} mult={mult} />
            ))}
          </div>
        </div>
        <div className="p-3">
          <div className="text-[10px] uppercase tracking-wide text-text-muted mb-2">
            Any 2 (pair)
          </div>
          <div className="space-y-1.5">
            {pairEntries.map(([sym, mult]) => (
              <PayRow key={sym} symbol={sym} count={2} mult={mult} />
            ))}
            <div className="text-[10px] text-text-muted italic pt-1">
              Pairs only pay on Dragon Lord and above.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PayRow({
  symbol,
  count,
  mult,
}: {
  symbol: SlotSymbol;
  count: number;
  mult: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <div className="flex items-center gap-1.5 shrink-0">
          {Array.from({ length: count }).map((_, i) => (
            <Image
              key={i}
              src={SPRITE_PATH[symbol]}
              alt=""
              width={20}
              height={20}
              style={{ imageRendering: "pixelated" }}
            />
          ))}
        </div>
        <span className="text-text-secondary text-xs ml-1 truncate">
          {SYMBOL_LABEL[symbol]}
        </span>
      </div>
      <span
        className="font-mono text-xs shrink-0 whitespace-nowrap"
        style={{ color: mult >= 50 ? "#F0A818" : "#00c853" }}
      >
        × {mult}
      </span>
    </div>
  );
}

type SpinTier = "jackpot" | "big" | "small" | "loss";

function spinTier(symbols: SlotSymbol[], multiplier: number): SpinTier {
  if (symbols.every((s) => s === "ferumbras") && multiplier > 0) return "jackpot";
  if (multiplier >= BIG_WIN_MULTIPLIER) return "big";
  if (multiplier > 0) return "small";
  return "loss";
}

const TIER_STYLES: Record<
  SpinTier,
  { border: string; bg: string; chipBg: string; chipColor: string; chipBorder: string; text: string }
> = {
  jackpot: {
    border: "#F0A818",
    bg: "rgba(240, 168, 24, 0.08)",
    chipBg: "rgba(240, 168, 24, 0.2)",
    chipColor: "#F0A818",
    chipBorder: "#F0A818",
    text: "#F0A818",
  },
  big: {
    border: "#00c853",
    bg: "rgba(0, 200, 83, 0.06)",
    chipBg: "rgba(0, 200, 83, 0.18)",
    chipColor: "#00c853",
    chipBorder: "#00c85380",
    text: "#00c853",
  },
  small: {
    border: "#00a84466",
    bg: "transparent",
    chipBg: "rgba(0, 200, 83, 0.12)",
    chipColor: "#00c853",
    chipBorder: "transparent",
    text: "#00c853",
  },
  loss: {
    border: "#C6282844",
    bg: "transparent",
    chipBg: "transparent",
    chipColor: "#ef4444",
    chipBorder: "transparent",
    text: "#ef4444",
  },
};

function RecentSpins({ spins }: { spins: SpinHistoryItem[] }) {
  if (spins.length === 0) {
    return (
      <div
        className="rounded-md p-4 text-center text-xs text-text-muted"
        style={{ background: "#141414", border: "1px solid #252525" }}
      >
        No spins yet. Pull that lever.
      </div>
    );
  }

  return (
    <div
      className="rounded-md overflow-hidden"
      style={{ background: "#141414", border: "1px solid #252525" }}
    >
      <div
        className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-text-muted"
        style={{ background: "#1a1a1a", borderBottom: "1px solid #252525" }}
      >
        Recent spins
      </div>
      <div className="divide-y divide-border">
        {spins.map((s) => {
          const syms = s.symbols.split(",") as SlotSymbol[];
          const tier = spinTier(syms, s.multiplier);
          const styles = TIER_STYLES[tier];
          const playerName = s.user.alias ?? s.user.name ?? "Unknown";
          const won = tier !== "loss";
          return (
            <div
              key={s.id}
              className="flex items-center gap-2 sm:gap-3 px-3 py-2 text-sm transition-colors"
              style={{
                background: styles.bg,
                borderLeft: `3px solid ${styles.border}`,
              }}
            >
              {/* Player */}
              <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0 w-24 sm:w-32 md:w-40">
                {s.user.image ? (
                  <Image
                    src={s.user.image}
                    alt=""
                    width={20}
                    height={20}
                    className="rounded-full flex-shrink-0"
                  />
                ) : (
                  <span
                    className="w-[20px] h-[20px] rounded-full flex-shrink-0"
                    style={{ background: "#252525" }}
                  />
                )}
                <span className="text-xs text-text-secondary truncate font-medium">
                  {playerName}
                </span>
              </div>

              {/* Reels */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {syms.map((sym, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center rounded-sm"
                    style={{
                      width: 28,
                      height: 28,
                      background: "#0a0a0a",
                      border: "1px solid #1f1f1f",
                    }}
                  >
                    <Image
                      src={SPRITE_PATH[sym] ?? SPRITE_PATH.snake}
                      alt={sym}
                      width={22}
                      height={22}
                      style={{ imageRendering: "pixelated" }}
                    />
                  </div>
                ))}
              </div>

              {/* Multiplier chip + result */}
              <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                {won && (
                  <span
                    className="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded"
                    style={{
                      background: styles.chipBg,
                      color: styles.chipColor,
                      border: `1px solid ${styles.chipBorder}`,
                      letterSpacing: "0.02em",
                    }}
                    title={tier === "jackpot" ? "Jackpot!" : tier === "big" ? "Big win" : "Win"}
                  >
                    {tier === "jackpot" && "👑 "}
                    ×{s.multiplier}
                  </span>
                )}
                <span
                  className="font-mono text-xs flex items-center gap-1"
                  style={{ color: styles.text }}
                >
                  {won ? "+" : "−"}
                  <CoinAmount
                    amount={won ? s.payout - s.stake : s.stake}
                    currency={s.currency}
                    size={12}
                  />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
