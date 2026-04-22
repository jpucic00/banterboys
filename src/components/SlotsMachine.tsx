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
  FREE_SPINS_AWARDED_PAIR,
  FREE_SPINS_AWARDED_TRIPLE,
  FREE_SPIN_WIN_MULTIPLIER,
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
  isFreeSpin: boolean;
  createdAt: Date | string;
  user: SpinUser;
};

type SpinResponse = {
  spinId: string;
  symbols: [SlotSymbol, SlotSymbol, SlotSymbol];
  payout: number;
  multiplier: number;
  stake: number;
  newBalance: number;
  bonusTrigger: boolean;
  bonusSpinsAwarded: number;
  isFreeSpin: boolean;
  activeFreeSpins: number;
  freeSpinStake: number;
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
// Natural height of the <GamblePanel> once rendered. We reserve this much
// vertical space above the spin controls so the button's viewport position is
// stable whether or not the gamble panel is currently shown.
const GAMBLE_PANEL_HEIGHT = 232;

function deriveWinningPositions(
  symbols: SlotSymbol[] | null,
  multiplier: number,
  bonusTrigger: boolean
): [boolean, boolean, boolean] {
  if (!symbols) return [false, false, false];
  // Bonus trigger: pulse the joker cells (all 3 for triple, just the 2 for pair).
  if (bonusTrigger) {
    return symbols.map((s) => s === "joker") as [boolean, boolean, boolean];
  }
  if (multiplier === 0) return [false, false, false];
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
  initialFreeSpin,
  initialSpins,
  currentUser,
}: {
  isLoggedIn: boolean;
  initialSaldo: { saldoTibiaCoins: number };
  initialGamble: { activeGambleAmount: number; activeGambleRounds: number };
  initialFreeSpin: { activeFreeSpins: number; freeSpinStake: number };
  initialSpins: SpinHistoryItem[];
  currentUser: SpinUser | null;
}) {
  const presets = STAKE_LIMITS.TIBIA_COINS.presets;
  const [stakeInput, setStakeInput] = useState<string>(String(presets[0]));
  const typedStake = Math.max(0, Math.floor(Number(stakeInput) || 0));
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

  // Free-spin bonus state
  const [freeSpinsRemaining, setFreeSpinsRemaining] = useState<number>(
    initialFreeSpin.activeFreeSpins
  );
  const [lockedFreeSpinStake, setLockedFreeSpinStake] = useState<number>(
    initialFreeSpin.freeSpinStake
  );
  // Tracks whether we just triggered the bonus (for a full-size banner) or
  // retriggered mid-bonus (for a small "+N spins" banner).
  const [bonusBanner, setBonusBanner] = useState<
    { kind: "trigger" | "retrigger"; key: string; spins: number; jokers: 2 | 3 } | null
  >(null);
  const bonusBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inBonus = freeSpinsRemaining > 0;
  // Effective stake for button labels and server requests. During the bonus
  // the server ignores the client value, but we display the locked stake.
  const stake = inBonus ? lockedFreeSpinStake : typedStake;

  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gambleRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
      if (gambleRevealTimer.current) clearTimeout(gambleRevealTimer.current);
      if (bonusBannerTimer.current) clearTimeout(bonusBannerTimer.current);
    };
  }, []);

  useEffect(() => {
    // Keep local balance in sync if parent re-hydrates
    setBalance(initialSaldo.saldoTibiaCoins);
  }, [initialSaldo.saldoTibiaCoins]);

  const worstCaseBalance = inBonus ? balance : balance - stake;
  // Debt cap doesn't apply to free spins (no stake at risk).
  const debtLimitHit = isLoggedIn && !inBonus && worstCaseBalance < -MAX_SLOT_DEBT;

  const canSpin =
    isLoggedIn &&
    !spinning &&
    (inBonus ||
      (stake >= STAKE_LIMITS.TIBIA_COINS.min &&
        stake <= STAKE_LIMITS.TIBIA_COINS.max &&
        !debtLimitHit));

  const willGoNegative =
    isLoggedIn && !inBonus && worstCaseBalance < 0 && !debtLimitHit;

  async function handleSpin() {
    if (!canSpin) return;
    setError(null);
    setResultVisible(false);
    setSpinning(true);
    // Any pending gamble is auto-collected server-side when a new spin begins
    // (paid or free). Reset the client state immediately so the cards flip back.
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
      const triggeredMidBonus = data.bonusTrigger && data.isFreeSpin;
      const triggeredFromPaid = data.bonusTrigger && !data.isFreeSpin;

      // Let the last reel finish before updating balance / flipping UI / showing banner.
      if (revealTimer.current) clearTimeout(revealTimer.current);
      revealTimer.current = setTimeout(() => {
        setBalance(data.newBalance);
        setGambleAmount(data.activeGambleAmount);
        setGambleRounds(data.activeGambleRounds);
        setFreeSpinsRemaining(data.activeFreeSpins);
        setLockedFreeSpinStake(data.freeSpinStake);
        setSpinning(false);
        setResultVisible(true);

        if (triggeredFromPaid || triggeredMidBonus) {
          const jokers = data.symbols.filter((s) => s === "joker").length as 2 | 3;
          if (bonusBannerTimer.current) clearTimeout(bonusBannerTimer.current);
          setBonusBanner({
            kind: triggeredMidBonus ? "retrigger" : "trigger",
            key: data.spinId,
            spins: data.bonusSpinsAwarded,
            jokers,
          });
          bonusBannerTimer.current = setTimeout(
            () => setBonusBanner(null),
            triggeredMidBonus ? 2000 : 3200
          );
        }

        // Add to local history (prepend the current user's spin)
        setHistory((h) =>
          [
            {
              id: data.spinId,
              stake: data.stake,
              payout: data.payout,
              multiplier: data.multiplier,
              symbols: data.symbols.join(","),
              currency: "TIBIA_COINS",
              isFreeSpin: data.isFreeSpin,
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
  const isBonusTrigger =
    resultVisible && !!lastResult && lastResult.bonusTrigger;
  const isJackpot =
    resultVisible &&
    !isBonusTrigger &&
    lastResult?.symbols.every((s) => s === "ferumbras");
  const isBigWin =
    resultVisible &&
    !!lastResult &&
    !lastResult.bonusTrigger &&
    lastResult.multiplier >= BIG_WIN_MULTIPLIER;
  const isSmallWin =
    resultVisible &&
    !!lastResult &&
    !lastResult.bonusTrigger &&
    lastResult.multiplier > 0 &&
    lastResult.multiplier < BIG_WIN_MULTIPLIER;
  const isLoss =
    resultVisible &&
    !!lastResult &&
    !lastResult.bonusTrigger &&
    lastResult.multiplier === 0;
  const isWin = !!(isBigWin || isSmallWin);

  // Which middle-row cells are part of the winning combo (for symbol pulse).
  const winningPositions = deriveWinningPositions(
    lastResult?.symbols ?? null,
    lastResult?.multiplier ?? 0,
    !!lastResult?.bonusTrigger
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-text-muted text-xs">
            Match 3 symbols for big payouts. 2 Jesters award {FREE_SPINS_AWARDED_PAIR}, 3 award {FREE_SPINS_AWARDED_TRIPLE} free spins at ×{FREE_SPIN_WIN_MULTIPLIER}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLoggedIn && inBonus && (
            <div
              className="px-3 py-2 rounded-md text-xs"
              style={{
                background: "#1a1224",
                border: "1px solid #A855F7",
                boxShadow: "0 0 12px rgba(168, 85, 247, 0.35)",
              }}
            >
              <div
                className="uppercase tracking-wide text-[10px] mb-0.5 font-bold flex items-center gap-1.5"
                style={{ color: "#A855F7" }}
              >
                <span>🃏 Free Spins</span>
                <span
                  className="font-mono text-[9px] px-1 rounded"
                  style={{
                    background: "rgba(240, 168, 24, 0.2)",
                    color: "#F0A818",
                    border: "1px solid #F0A818",
                    letterSpacing: "0.03em",
                  }}
                >
                  ×{FREE_SPIN_WIN_MULTIPLIER}
                </span>
              </div>
              <div className="font-mono">
                <span style={{ color: "#fff" }}>
                  {freeSpinsRemaining} left
                </span>
              </div>
            </div>
          )}
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
            isBonus={!!isBonusTrigger}
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
                bonus={!!isBonusTrigger}
              />
            ))}
          </SlotCabinet>
        </div>

        {/* Result banner */}
        <div
          className="text-center h-11 mb-3 flex items-center justify-center"
          aria-live="polite"
        >
          {bonusBanner?.kind === "trigger" && (
            <div
              key={`bt-${bonusBanner.key}`}
              className="px-5 py-2 rounded-md font-black uppercase tracking-widest text-sm flex items-center gap-2"
              style={{
                background:
                  bonusBanner.jokers >= 3
                    ? "linear-gradient(to right, #A855F7, #F0A818, #A855F7)"
                    : "linear-gradient(to right, #6B21A8, #A855F7, #6B21A8)",
                color: "#1a1a1a",
                boxShadow:
                  bonusBanner.jokers >= 3
                    ? "0 0 24px rgba(168, 85, 247, 0.8)"
                    : "0 0 16px rgba(168, 85, 247, 0.55)",
                animation:
                  "slots-banner-pop 450ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
              }}
            >
              <span>🃏</span>
              <span>
                {bonusBanner.jokers} JESTERS — {bonusBanner.spins} FREE SPINS × {FREE_SPIN_WIN_MULTIPLIER}
              </span>
              <span>🃏</span>
            </div>
          )}
          {bonusBanner?.kind === "retrigger" && (
            <div
              key={`br-${bonusBanner.key}`}
              className="px-4 py-2 rounded-md font-bold uppercase tracking-wide text-sm"
              style={{
                background: "#A855F722",
                color: "#A855F7",
                border: "1px solid #A855F7",
                boxShadow: "0 0 14px rgba(168, 85, 247, 0.4)",
                animation:
                  "slots-banner-pop 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
              }}
            >
              +{bonusBanner.spins} Free Spins!
            </div>
          )}
          {!bonusBanner && isJackpot && (
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

        {/* Double-or-nothing gamble panel. Always rendered so the spin button
            below never shifts; when there are no winnings, it falls back to
            a dormant/disabled preview. Free spins seed the gamble the same
            way paid spins do, so the panel stays active throughout the bonus. */}
        <div className="mb-3" style={{ minHeight: GAMBLE_PANEL_HEIGHT }}>
          <GamblePanel
            amount={gambleAmount}
            rounds={gambleRounds}
            gambling={gambling}
            reveal={gambleReveal}
            onPick={handleGamble}
            onCollect={handleCollect}
            disabled={gambleAmount <= 0}
          />
        </div>

        {/* Stake controls */}
        <div className="flex flex-wrap items-end gap-3 justify-center">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-text-muted mb-1">
              {inBonus ? "Stake (locked)" : "Stake (TC)"}
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              value={inBonus ? String(lockedFreeSpinStake) : stakeInput}
              onChange={(e) => {
                if (inBonus) return;
                const raw = e.target.value.replace(/\D/g, "").slice(0, 3);
                // Strip leading zeros unless the value is just "" or "0"
                const cleaned =
                  raw.length > 1 ? raw.replace(/^0+/, "") || "0" : raw;
                setStakeInput(cleaned);
              }}
              onBlur={() => {
                if (inBonus) return;
                if (stakeInput === "" || typedStake === 0) {
                  setStakeInput(String(STAKE_LIMITS.TIBIA_COINS.min));
                } else if (typedStake > STAKE_LIMITS.TIBIA_COINS.max) {
                  setStakeInput(String(STAKE_LIMITS.TIBIA_COINS.max));
                } else {
                  setStakeInput(String(typedStake));
                }
              }}
              disabled={spinning || inBonus}
              className="w-28 text-center font-mono"
              style={{
                background: "#0a0a0a",
                border: `1px solid ${inBonus ? "#A855F744" : "#2e2e2e"}`,
                borderRadius: 6,
                color: "#fff",
                padding: "8px 10px",
                fontSize: 14,
                opacity: inBonus ? 0.85 : 1,
              }}
            />
          </div>

          <div className="flex items-end gap-1.5">
            {presets.map((p) => {
              const selected = stake === p;
              const disabled = spinning || inBonus;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setStakeInput(String(p))}
                  disabled={disabled}
                  className="text-xs font-bold"
                  style={{
                    background: selected ? "#A855F7" : "#1f1f1f",
                    color: selected ? "#fff" : "#a0a0a0",
                    border: `1px solid ${selected ? "#A855F7" : "#333"}`,
                    borderRadius: 6,
                    padding: "8px 12px",
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.5 : 1,
                    transition: "all 0.12s",
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>

          {isLoggedIn ? (
            <button
              type="button"
              onClick={handleSpin}
              disabled={!canSpin}
              style={{
                background: canSpin
                  ? inBonus
                    ? "linear-gradient(to bottom, #F0A818, #8a5d0b)"
                    : "linear-gradient(to bottom, #A855F7, #7E22CE)"
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
                boxShadow: canSpin
                  ? inBonus
                    ? "0 2px 10px rgba(240, 168, 24, 0.5)"
                    : "0 2px 8px rgba(168, 85, 247, 0.4)"
                  : "none",
                transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
                minWidth: 160,
                textAlign: "center",
              }}
            >
              {spinning
                ? "Spinning…"
                : inBonus
                  ? `Free Spin (${freeSpinsRemaining} left)`
                  : "Spin"}
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
        {inBonus && (
          <p
            className="text-center text-xs mt-3 font-medium"
            style={{ color: "#A855F7" }}
          >
            Bonus round — stake locked, wins pay ×{FREE_SPIN_WIN_MULTIPLIER}, gamble each hit.
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
  isBonus,
  resultKey,
}: {
  children: React.ReactNode;
  isJackpot: boolean;
  isBigWin: boolean;
  isWin: boolean;
  isBonus: boolean;
  /** Changes when a win is revealed — used to re-trigger one-shot animations. */
  resultKey: string | null;
}) {
  // Where the middle row sits inside a reel: after top padding + one CELL.
  const middleRowTopOffset = PADDING + CELL;

  const paylineColor = isBonus
    ? "#A855F7"
    : isJackpot
      ? "#F0A818"
      : isBigWin
        ? "#00c853"
        : isWin
          ? "#00c85399"
          : "#A855F788";
  const paylineGlow = isBonus
    ? "0 0 18px rgba(168, 85, 247, 0.6), 0 0 4px rgba(168, 85, 247, 0.9)"
    : isJackpot
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
    if ((isJackpot || isBonus) && cabinetRef.current) {
      const el = cabinetRef.current;
      el.style.animation = "none";
      // Force reflow so the animation restarts on the next frame.
      void el.offsetHeight;
      el.style.animation = isBonus
        ? "slots-cabinet-shake 0.6s cubic-bezier(.36,.07,.19,.97) both, slots-cabinet-flash-bonus 1.1s ease-out both"
        : "slots-cabinet-shake 0.6s cubic-bezier(.36,.07,.19,.97) both, slots-cabinet-flash 1.1s ease-out both";
    }
    if ((isWin || isBonus) && paylineRef.current) {
      const el = paylineRef.current;
      el.style.animation = "none";
      void el.offsetHeight;
      el.style.animation = "slots-payline-flash 0.8s ease-out both";
    }
  }, [resultKey, isJackpot, isWin, isBonus]);

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
  disabled = false,
}: {
  amount: number;
  rounds: number;
  gambling: boolean;
  reveal: GambleReveal | null;
  onPick: (pickIndex: number) => void;
  onCollect: () => void;
  /** Dormant preview shown as a placeholder when there are no winnings to gamble. */
  disabled?: boolean;
}) {
  const atMaxRounds = rounds >= MAX_GAMBLE_ROUNDS;
  const nextAmount = amount * 2;

  return (
    <div
      className="rounded-md p-4 space-y-3"
      style={{
        background: disabled
          ? "linear-gradient(to bottom, #151515 0%, #0d0d0d 100%)"
          : "linear-gradient(to bottom, #1a1224 0%, #0f0a18 100%)",
        border: disabled ? "1px solid #252525" : "1px solid #A855F744",
        boxShadow: disabled ? "none" : "0 0 18px rgba(168, 85, 247, 0.15)",
        opacity: disabled ? 0.75 : 1,
        transition: "opacity 0.2s, border-color 0.2s, background 0.2s",
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: disabled ? "#555" : "#A855F7" }}
          >
            Double or Nothing
          </div>
          <div
            className={`text-sm mt-0.5 ${disabled ? "" : "text-text-secondary"}`}
            style={disabled ? { color: "#666" } : undefined}
          >
            {disabled
              ? "Win a hand to unlock the gamble."
              : reveal
                ? reveal.won
                  ? "Correct! Gamble again or collect."
                  : "Wrong card — you lost it."
                : atMaxRounds
                  ? "Max rounds reached. Collect your winnings!"
                  : "Pick the Ferumbras to double your winnings."}
          </div>
        </div>
        {!disabled && (
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
        )}
      </div>

      {/* Cards */}
      <div className="flex items-center justify-center gap-3">
        {Array.from({ length: GAMBLE_CARDS }).map((_, i) => {
          const isRevealed = !disabled && reveal !== null;
          const isPicked = reveal?.pickIndex === i;
          const isWinCard = reveal?.winIndex === i;
          const clickable =
            !disabled && !gambling && !isRevealed && !atMaxRounds;

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
                    background: disabled
                      ? "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 50%, #1a1a1a 100%)"
                      : "linear-gradient(135deg, #2a1f3a 0%, #1a1224 50%, #2a1f3a 100%)",
                    boxShadow: disabled
                      ? "0 1px 3px rgba(0, 0, 0, 0.4)"
                      : isPicked
                        ? "0 0 14px rgba(168, 85, 247, 0.6)"
                        : clickable
                          ? "0 2px 6px rgba(0, 0, 0, 0.5)"
                          : "0 1px 3px rgba(0, 0, 0, 0.4)",
                    borderColor: disabled
                      ? "#252525"
                      : isPicked
                        ? "#A855F7"
                        : "#2e2e2e",
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
                      opacity: disabled ? 0.2 : 0.35,
                      filter: disabled ? "grayscale(1)" : undefined,
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
          disabled={disabled || gambling || !!reveal}
          style={{
            background:
              disabled || gambling || !!reveal
                ? "#2a2a2a"
                : "linear-gradient(to bottom, #00c853, #00a844)",
            color: disabled || gambling || !!reveal ? "#666" : "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 20px",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor:
              disabled || gambling || !!reveal ? "not-allowed" : "pointer",
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

      {/* Jester bonus tiers — scatter rewards, paid in free spins at ×2 wins. */}
      <div
        className="p-3"
        style={{ borderTop: "1px solid #252525", background: "#0f0a18" }}
      >
        <div
          className="text-[10px] uppercase tracking-wide mb-2 font-bold"
          style={{ color: "#A855F7" }}
        >
          🃏 Jester Bonus
        </div>
        <div className="space-y-1.5">
          <BonusRow
            jokers={3}
            reward={`${FREE_SPINS_AWARDED_TRIPLE} free spins × ${FREE_SPIN_WIN_MULTIPLIER}`}
            tone="big"
          />
          <BonusRow
            jokers={2}
            reward={`${FREE_SPINS_AWARDED_PAIR} free spins × ${FREE_SPIN_WIN_MULTIPLIER}`}
            tone="small"
          />
          <div className="text-[10px] text-text-muted italic pt-1">
            Jesters pay no multiplier on their own — they trigger free spins
            (wins pay ×{FREE_SPIN_WIN_MULTIPLIER} during the bonus).
          </div>
        </div>
      </div>
    </div>
  );
}

function BonusRow({
  jokers,
  reward,
  tone,
}: {
  jokers: 2 | 3;
  reward: string;
  tone: "big" | "small";
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <div className="flex items-center gap-1.5 shrink-0">
          {Array.from({ length: jokers }).map((_, i) => (
            <Image
              key={i}
              src={SPRITE_PATH.joker}
              alt=""
              width={20}
              height={20}
              style={{ imageRendering: "pixelated" }}
            />
          ))}
        </div>
        <span className="text-text-secondary text-xs ml-1 truncate">
          {jokers} Jester{jokers > 1 ? "s" : ""}
        </span>
      </div>
      <span
        className="font-mono text-xs shrink-0 whitespace-nowrap"
        style={{ color: tone === "big" ? "#F0A818" : "#A855F7" }}
      >
        {reward}
      </span>
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

type SpinTier = "jackpot" | "big" | "small" | "loss" | "bonus";

function spinTier(symbols: SlotSymbol[], multiplier: number): SpinTier {
  if (symbols.every((s) => s === "joker")) return "bonus";
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
  bonus: {
    border: "#A855F7",
    bg: "rgba(168, 85, 247, 0.08)",
    chipBg: "rgba(168, 85, 247, 0.2)",
    chipColor: "#A855F7",
    chipBorder: "#A855F7",
    text: "#A855F7",
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
          const won = tier !== "loss" && tier !== "bonus";
          const isBonus = tier === "bonus";
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
                {s.isFreeSpin && (
                  <span
                    className="font-mono text-[9px] font-bold px-1 py-0.5 rounded shrink-0"
                    style={{
                      background: "rgba(168, 85, 247, 0.18)",
                      color: "#A855F7",
                      border: "1px solid #A855F7",
                      letterSpacing: "0.05em",
                    }}
                    title="Awarded by the Jester bonus"
                  >
                    FREE
                  </span>
                )}
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
                {isBonus && (
                  <span
                    className="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded"
                    style={{
                      background: styles.chipBg,
                      color: styles.chipColor,
                      border: `1px solid ${styles.chipBorder}`,
                      letterSpacing: "0.05em",
                    }}
                    title="Triggered the free-spin bonus"
                  >
                    🃏 BONUS
                  </span>
                )}
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
                {!isBonus && (
                  <span
                    className="font-mono text-xs flex items-center gap-1"
                    style={{ color: styles.text }}
                  >
                    {won ? "+" : s.isFreeSpin ? "" : "−"}
                    <CoinAmount
                      amount={
                        won
                          ? s.isFreeSpin
                            ? s.payout
                            : s.payout - s.stake
                          : s.isFreeSpin
                            ? 0
                            : s.stake
                      }
                      currency={s.currency}
                      size={12}
                    />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
