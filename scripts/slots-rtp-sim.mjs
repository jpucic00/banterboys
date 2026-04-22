// Monte-Carlo RTP simulation for the Tibia Slots game.
// Usage: node scripts/slots-rtp-sim.mjs [spins]
//
// Mirrors REEL_WEIGHTS, PAYTABLE, and the free-spin bonus logic from
// src/lib/slots.ts. Keep this script in lockstep with that file if anything
// changes there.

import { randomInt } from "node:crypto";

const REEL_WEIGHTS = {
  snake: 42,
  dragon: 25,
  dragon_lord: 15,
  dark_torturer: 10,
  demon: 6,
  ferumbras: 2,
  joker: 4,
};
const THREE = {
  snake: 6,
  dragon: 9,
  dragon_lord: 16,
  dark_torturer: 28,
  demon: 90,
  ferumbras: 220,
};
const PAIR = {
  dragon_lord: 2,
  dark_torturer: 3,
  demon: 10,
  ferumbras: 20,
};
const FREE_SPINS_AWARDED = 10;
const FREE_SPIN_WIN_MULTIPLIER = 2;

const STRIP = [];
for (const [s, w] of Object.entries(REEL_WEIGHTS)) {
  for (let i = 0; i < w; i++) STRIP.push(s);
}

function spin() {
  return [
    STRIP[randomInt(STRIP.length)],
    STRIP[randomInt(STRIP.length)],
    STRIP[randomInt(STRIP.length)],
  ];
}

function resolve(symbols, stake) {
  const [a, b, c] = symbols;
  if (a === "joker" && b === "joker" && c === "joker") {
    return { payout: 0, multiplier: 0, bonusTrigger: true };
  }
  if (a === b && b === c && THREE[a]) {
    const m = THREE[a];
    return { payout: stake * m, multiplier: m, bonusTrigger: false };
  }
  let pair = null;
  if (a === b) pair = a;
  else if (a === c) pair = a;
  else if (b === c) pair = b;
  if (pair && PAIR[pair]) {
    const m = PAIR[pair];
    return { payout: stake * m, multiplier: m, bonusTrigger: false };
  }
  return { payout: 0, multiplier: 0, bonusTrigger: false };
}

const N = Number(process.argv[2] ?? 1_000_000);
const stake = 10;

let paidSpins = 0;
let freeSpins = 0;
let bonusTriggers = 0;
let wagered = 0;
let returned = 0;

for (let i = 0; i < N; i++) {
  wagered += stake;
  paidSpins += 1;
  // Paid spin
  const r = resolve(spin(), stake);
  returned += r.payout;
  if (r.bonusTrigger) {
    bonusTriggers += 1;
    // Award free spins; retriggers allowed. Wins during the bonus are
    // multiplied by FREE_SPIN_WIN_MULTIPLIER.
    let remaining = FREE_SPINS_AWARDED;
    while (remaining > 0) {
      remaining -= 1;
      freeSpins += 1;
      const fr = resolve(spin(), stake);
      returned += fr.payout * FREE_SPIN_WIN_MULTIPLIER;
      if (fr.bonusTrigger) remaining += FREE_SPINS_AWARDED;
    }
  }
}

const rtp = returned / wagered;
console.log(JSON.stringify(
  {
    N,
    stake,
    paidSpins,
    freeSpins,
    bonusTriggers,
    wagered,
    returned,
    rtp: rtp.toFixed(4),
    rtpPercent: (rtp * 100).toFixed(2) + "%",
    freeSpinsPerTrigger: bonusTriggers ? (freeSpins / bonusTriggers).toFixed(2) : "n/a",
    triggerRate: (bonusTriggers / paidSpins).toExponential(2),
  },
  null,
  2
));
