import { randomInt } from "node:crypto";

export type SlotSymbol =
  | "snake"
  | "dragon_lord"
  | "dragon"
  | "dark_torturer"
  | "demon"
  | "ferumbras";

export const SYMBOLS: SlotSymbol[] = [
  "snake",
  "dragon",
  "dragon_lord",
  "dark_torturer",
  "demon",
  "ferumbras",
];

// Same weights on all 3 reels (v1). Total = 100.
export const REEL_WEIGHTS: Record<SlotSymbol, number> = {
  snake: 42,
  dragon: 25,
  dragon_lord: 15,
  dark_torturer: 10,
  demon: 6,
  ferumbras: 2,
};

// Multipliers on stake. 3-of-a-kind always wins over pair.
// Tuned for ~91% RTP (9% house edge).
export const PAYTABLE = {
  threeOfAKind: {
    snake: 5,
    dragon: 8,
    dragon_lord: 15,
    dark_torturer: 25,
    demon: 80,
    ferumbras: 200,
  } as Record<SlotSymbol, number>,
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
};

export const SYMBOL_LABEL: Record<SlotSymbol, string> = {
  snake: "Snake",
  dragon_lord: "Dragon Lord",
  dragon: "Dragon",
  dark_torturer: "Dark Torturer",
  demon: "Demon",
  ferumbras: "Ferumbras",
};

// Build a flat weight array once; pick uniformly from it with crypto.randomInt.
const REEL_STRIP: SlotSymbol[] = (() => {
  const strip: SlotSymbol[] = [];
  for (const s of SYMBOLS) {
    for (let i = 0; i < REEL_WEIGHTS[s]; i++) strip.push(s);
  }
  return strip; // length = 100
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
};

export function resolveSpin(
  symbols: [SlotSymbol, SlotSymbol, SlotSymbol],
  stake: number
): SpinResult {
  const [a, b, c] = symbols;

  if (a === b && b === c) {
    const m = PAYTABLE.threeOfAKind[a];
    return { payout: stake * m, multiplier: m, kind: "3x", winSymbol: a };
  }

  // Find which symbol appears exactly twice (at most one can in 3 reels if not all same).
  let pairSymbol: SlotSymbol | null = null;
  if (a === b) pairSymbol = a;
  else if (a === c) pairSymbol = a;
  else if (b === c) pairSymbol = b;

  if (pairSymbol && pairSymbol in PAYTABLE.pair) {
    const m = PAYTABLE.pair[pairSymbol]!;
    return { payout: stake * m, multiplier: m, kind: "2x", winSymbol: pairSymbol };
  }

  return { payout: 0, multiplier: 0, kind: "none", winSymbol: null };
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
