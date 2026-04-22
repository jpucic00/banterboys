import { randomInt } from "node:crypto";

export type SlotSymbol =
  | "snake"
  | "dragon_lord"
  | "dragon"
  | "dark_torturer"
  | "demon"
  | "ferumbras"
  | "joker";

export const SYMBOLS: SlotSymbol[] = [
  "snake",
  "dragon",
  "dragon_lord",
  "dark_torturer",
  "demon",
  "ferumbras",
  "joker",
];

// Same weights on all 3 reels. Total = 104. Joker is a scatter: no base payout,
// 3 jokers triggers the free-spin bonus.
export const REEL_WEIGHTS: Record<SlotSymbol, number> = {
  snake: 42,
  dragon: 25,
  dragon_lord: 15,
  dark_torturer: 10,
  demon: 6,
  ferumbras: 2,
  joker: 4,
};

// Multipliers on stake. 3-of-a-kind always wins over pair. Joker has no
// entry — it only triggers the bonus when 3 land. Triple multipliers bumped
// slightly vs. pre-joker to compensate for the weight dilution and keep RTP ~91%.
export const PAYTABLE = {
  threeOfAKind: {
    snake: 6,
    dragon: 9,
    dragon_lord: 16,
    dark_torturer: 28,
    demon: 90,
    ferumbras: 220,
  } as Partial<Record<SlotSymbol, number>>,
  pair: {
    dragon_lord: 2,
    dark_torturer: 3,
    demon: 10,
    ferumbras: 20,
  } as Partial<Record<SlotSymbol, number>>,
};

export const SPRITE_PATH: Record<SlotSymbol, string> = {
  snake: "/tibia/snake.webp",
  dragon_lord: "/tibia/dragon_lord.webp",
  dragon: "/tibia/dragon.webp",
  dark_torturer: "/tibia/dark_torturer.webp",
  demon: "/tibia/demon.webp",
  ferumbras: "/tibia/ferumbras.webp",
  joker: "/tibia/jester_doll.webp",
};

export const SYMBOL_LABEL: Record<SlotSymbol, string> = {
  snake: "Snake",
  dragon_lord: "Dragon Lord",
  dragon: "Dragon",
  dark_torturer: "Dark Torturer",
  demon: "Demon",
  ferumbras: "Ferumbras",
  joker: "Jester Doll",
};

// Build a flat weight array once; pick uniformly from it with crypto.randomInt.
// Dev override: set SLOTS_DEBUG_JOKER_WEIGHT to a positive integer in
// .env.local to inflate the joker probability so the bonus triggers often
// enough to test. RTP is off-tune while set — do NOT ship this enabled.
const REEL_STRIP: SlotSymbol[] = (() => {
  const debugJokerWeight = Number(process.env.SLOTS_DEBUG_JOKER_WEIGHT);
  const overrideJoker =
    Number.isFinite(debugJokerWeight) && debugJokerWeight > 0
      ? Math.floor(debugJokerWeight)
      : null;
  const weights: Record<SlotSymbol, number> =
    overrideJoker !== null
      ? { ...REEL_WEIGHTS, joker: overrideJoker }
      : REEL_WEIGHTS;
  if (overrideJoker !== null) {
    console.warn(
      `[slots] SLOTS_DEBUG_JOKER_WEIGHT=${overrideJoker} — joker weight overridden for testing. RTP is off-tune.`
    );
  }
  const strip: SlotSymbol[] = [];
  for (const s of SYMBOLS) {
    for (let i = 0; i < weights[s]; i++) strip.push(s);
  }
  return strip;
})();

export function spinReels(): [SlotSymbol, SlotSymbol, SlotSymbol] {
  const n = REEL_STRIP.length;
  // randomInt(max) returns 0 <= x < max, cryptographically secure.
  return [
    REEL_STRIP[randomInt(n)],
    REEL_STRIP[randomInt(n)],
    REEL_STRIP[randomInt(n)],
  ];
}

export type SpinResult = {
  payout: number;
  multiplier: number;
  kind: "3x" | "2x" | "none" | "bonus";
  winSymbol: SlotSymbol | null;
  bonusTrigger: boolean;
  /** Free spins awarded by this spin (0, FREE_SPINS_AWARDED_PAIR, or FREE_SPINS_AWARDED_TRIPLE). */
  bonusSpinsAwarded: number;
};

export function resolveSpin(
  symbols: [SlotSymbol, SlotSymbol, SlotSymbol],
  stake: number
): SpinResult {
  const [a, b, c] = symbols;
  const jokerCount =
    (a === "joker" ? 1 : 0) +
    (b === "joker" ? 1 : 0) +
    (c === "joker" ? 1 : 0);

  // Scatter bonus tiers: 3 jokers → big bonus, 2 jokers → small bonus. Both
  // pay nothing directly; the award is free spins at a multiplier.
  if (jokerCount === 3) {
    return {
      payout: 0,
      multiplier: 0,
      kind: "bonus",
      winSymbol: "joker",
      bonusTrigger: true,
      bonusSpinsAwarded: FREE_SPINS_AWARDED_TRIPLE,
    };
  }
  if (jokerCount === 2) {
    return {
      payout: 0,
      multiplier: 0,
      kind: "bonus",
      winSymbol: "joker",
      bonusTrigger: true,
      bonusSpinsAwarded: FREE_SPINS_AWARDED_PAIR,
    };
  }

  if (a === b && b === c) {
    const m = PAYTABLE.threeOfAKind[a];
    if (m) {
      return {
        payout: stake * m,
        multiplier: m,
        kind: "3x",
        winSymbol: a,
        bonusTrigger: false,
        bonusSpinsAwarded: 0,
      };
    }
  }

  // Find which symbol appears exactly twice (at most one can in 3 reels if not all same).
  let pairSymbol: SlotSymbol | null = null;
  if (a === b) pairSymbol = a;
  else if (a === c) pairSymbol = a;
  else if (b === c) pairSymbol = b;

  if (pairSymbol && pairSymbol in PAYTABLE.pair) {
    const m = PAYTABLE.pair[pairSymbol]!;
    return {
      payout: stake * m,
      multiplier: m,
      kind: "2x",
      winSymbol: pairSymbol,
      bonusTrigger: false,
      bonusSpinsAwarded: 0,
    };
  }

  return {
    payout: 0,
    multiplier: 0,
    kind: "none",
    winSymbol: null,
    bonusTrigger: false,
    bonusSpinsAwarded: 0,
  };
}

// Stake bounds — single source of truth for validation + UI.
// GOLD is disabled at launch (see API route); limits kept here for easy v1.1 unlock.
export const STAKE_LIMITS = {
  TIBIA_COINS: { min: 1, max: 25, presets: [1, 5, 10, 25] },
  GOLD: { min: 100, max: 1_000_000, presets: [100, 1_000, 10_000, 100_000] },
} as const;

export const BIG_WIN_MULTIPLIER = 10; // UI tier: green cabinet + green chip
export const DISCORD_NOTIFY_MULTIPLIER = 20; // >= this triggers a Discord webhook

// Max Tibia Coin debt a player is allowed to carry FROM SLOTS. If a spin would
// push saldoTibiaCoins below -MAX_SLOT_DEBT, the server rejects it.
export const MAX_SLOT_DEBT = 500;

// Double-or-nothing gamble after a winning spin: pick which of GAMBLE_CARDS
// face-down cards hides the Ferumbras. Right = winnings double; wrong = lose it.
export const GAMBLE_CARDS = 2;
export const MAX_GAMBLE_ROUNDS = 5;

// Free-spin bonus tiers. Jesters are scatter symbols: 3 on the payline awards
// the big bonus, 2 awards a smaller one. Both lock the triggering stake.
// Retriggers during the bonus round stack the awards. All wins during the
// bonus are multiplied by FREE_SPIN_WIN_MULTIPLIER.
export const FREE_SPINS_AWARDED_TRIPLE = 10;
export const FREE_SPINS_AWARDED_PAIR = 2;
export const FREE_SPIN_WIN_MULTIPLIER = 2;
export const FREE_SPIN_TRIGGER_COUNT = 3;
