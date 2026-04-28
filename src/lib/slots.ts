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

// Same weights on all 3 reels. Total = 106. Joker is a wild (substitutes for
// any symbol to form the highest-paying combo) but cannot complete Triple
// Ferumbras — that 220× jackpot is exclusive to three actual ferumbras. Three
// jokers pay as Triple Demon (mid-tier prize). Joker weight matches Demon so
// jesters and demons appear equally often.
export const REEL_WEIGHTS: Record<SlotSymbol, number> = {
  snake: 42,
  dragon: 25,
  dragon_lord: 15,
  dark_torturer: 10,
  demon: 6,
  ferumbras: 2,
  joker: 6,
};

// Multipliers on stake. RTP tuned to ~94.6% (margin ~5.4%) under the wild rules
// above, validated by 10M-spin Monte Carlo. Snake/Dragon have no pair payout.
export const PAYTABLE = {
  threeOfAKind: {
    snake: 3,
    dragon: 5,
    dragon_lord: 8,
    dark_torturer: 16,
    demon: 50,
    ferumbras: 220,
  } as Partial<Record<SlotSymbol, number>>,
  pair: {
    dragon_lord: 1,
    dark_torturer: 2,
    demon: 4,
    ferumbras: 8,
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
// .env.local to inflate the joker probability so wild substitution triggers
// often enough to test. RTP is off-tune while set — do NOT ship this enabled.
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
  kind: "3x" | "2x" | "none";
  winSymbol: SlotSymbol | null;
  /** True when at least one joker substituted to form the winning combo. */
  wildUsed: boolean;
};

const TRIPLE_ORDER: SlotSymbol[] = [
  "demon",
  "dark_torturer",
  "dragon_lord",
  "dragon",
  "snake",
];
const PAIR_ORDER: SlotSymbol[] = [
  "ferumbras",
  "demon",
  "dark_torturer",
  "dragon_lord",
];

export function resolveSpin(
  symbols: [SlotSymbol, SlotSymbol, SlotSymbol],
  stake: number
): SpinResult {
  const jokerCount =
    (symbols[0] === "joker" ? 1 : 0) +
    (symbols[1] === "joker" ? 1 : 0) +
    (symbols[2] === "joker" ? 1 : 0);

  // Three jokers — Triple Jester pays as Triple Demon (mid-tier, not jackpot).
  if (jokerCount === 3) {
    const m = PAYTABLE.threeOfAKind.demon!;
    return {
      payout: stake * m,
      multiplier: m,
      kind: "3x",
      winSymbol: "joker",
      wildUsed: true,
    };
  }

  let bestMultiplier = 0;
  let bestKind: "3x" | "2x" | "none" = "none";
  let bestSymbol: SlotSymbol | null = null;

  // Triple Ferumbras — jackpot is exclusive to three actual ferumbras
  // (jokers cannot substitute to reach it).
  if (
    symbols[0] === "ferumbras" &&
    symbols[1] === "ferumbras" &&
    symbols[2] === "ferumbras"
  ) {
    const m = PAYTABLE.threeOfAKind.ferumbras!;
    if (m > bestMultiplier) {
      bestMultiplier = m;
      bestKind = "3x";
      bestSymbol = "ferumbras";
    }
  }

  // Triples for non-Ferumbras symbols — jokers substitute freely.
  for (const s of TRIPLE_ORDER) {
    const count = countOf(symbols, s) + jokerCount;
    if (count >= 3) {
      const m = PAYTABLE.threeOfAKind[s];
      if (m && m > bestMultiplier) {
        bestMultiplier = m;
        bestKind = "3x";
        bestSymbol = s;
      }
    }
  }

  // Pairs — jokers substitute including for Ferumbras pair.
  for (const s of PAIR_ORDER) {
    const count = countOf(symbols, s) + jokerCount;
    if (count >= 2) {
      const m = PAYTABLE.pair[s];
      if (m && m > bestMultiplier) {
        bestMultiplier = m;
        bestKind = "2x";
        bestSymbol = s;
      }
    }
  }

  if (bestKind === "none" || bestSymbol === null) {
    return {
      payout: 0,
      multiplier: 0,
      kind: "none",
      winSymbol: null,
      wildUsed: false,
    };
  }

  return {
    payout: stake * bestMultiplier,
    multiplier: bestMultiplier,
    kind: bestKind,
    winSymbol: bestSymbol,
    wildUsed: jokerCount > 0,
  };
}

function countOf(
  symbols: readonly SlotSymbol[],
  s: SlotSymbol
): number {
  let c = 0;
  for (const x of symbols) if (x === s) c++;
  return c;
}

// Stake bounds — single source of truth for validation + UI.
// GOLD is disabled at launch (see API route); limits kept here for easy v1.1 unlock.
export const STAKE_LIMITS = {
  TIBIA_COINS: { min: 1, max: 10, presets: [1, 2, 5, 10] },
  GOLD: { min: 100, max: 1_000_000, presets: [100, 1_000, 10_000, 100_000] },
} as const;

export const BIG_WIN_MULTIPLIER = 10; // UI tier: green cabinet + green chip
export const DISCORD_NOTIFY_MULTIPLIER = 15; // >= this triggers a Discord webhook

// Max Tibia Coin debt a player is allowed to carry FROM SLOTS. If a spin would
// push saldoTibiaCoins below -MAX_SLOT_DEBT, the server rejects it.
export const MAX_SLOT_DEBT = 500;

// Double-or-nothing gamble after a winning spin: pick which of GAMBLE_CARDS
// face-down cards hides the Ferumbras. Right = winnings double; wrong = lose it.
export const GAMBLE_CARDS = 2;
export const MAX_GAMBLE_ROUNDS = 5;
