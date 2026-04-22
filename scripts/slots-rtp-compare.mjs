// Side-by-side RTP comparison: free-spin multiplier 1× vs 2×.
// Run: node scripts/slots-rtp-compare.mjs [spins]

import { randomInt } from "node:crypto";

const WEIGHTS = {
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
const PAIR = { dragon_lord: 2, dark_torturer: 3, demon: 10, ferumbras: 20 };
const FREE_SPINS_AWARDED = 10;

const STRIP = [];
for (const [s, w] of Object.entries(WEIGHTS)) {
  for (let i = 0; i < w; i++) STRIP.push(s);
}

function spin() {
  return [STRIP[randomInt(STRIP.length)], STRIP[randomInt(STRIP.length)], STRIP[randomInt(STRIP.length)]];
}

function resolve(symbols, stake) {
  const [a, b, c] = symbols;
  if (a === "joker" && b === "joker" && c === "joker") return { payout: 0, bonusTrigger: true };
  if (a === b && b === c && THREE[a]) return { payout: stake * THREE[a], bonusTrigger: false };
  let pair = null;
  if (a === b) pair = a;
  else if (a === c) pair = a;
  else if (b === c) pair = b;
  if (pair && PAIR[pair]) return { payout: stake * PAIR[pair], bonusTrigger: false };
  return { payout: 0, bonusTrigger: false };
}

function simulate(spins, freeSpinMult) {
  const stake = 10;
  let wagered = 0;
  let returned = 0;
  let triggers = 0;
  for (let i = 0; i < spins; i++) {
    wagered += stake;
    const r = resolve(spin(), stake);
    returned += r.payout;
    if (r.bonusTrigger) {
      triggers++;
      let rem = FREE_SPINS_AWARDED;
      while (rem > 0) {
        rem--;
        const fr = resolve(spin(), stake);
        returned += fr.payout * freeSpinMult;
        if (fr.bonusTrigger) rem += FREE_SPINS_AWARDED;
      }
    }
  }
  return { rtp: returned / wagered, triggers };
}

const N = Number(process.argv[2] ?? 5_000_000);
console.log(`spins per trial: ${N.toLocaleString()}`);

for (const mult of [0, 1, 2, 3]) {
  const { rtp, triggers } = simulate(N, mult);
  const pct = (rtp * 100).toFixed(3);
  const label =
    mult === 0
      ? "no bonus at all"
      : `free-spin ×${mult}`;
  console.log(`${label.padEnd(20)}  RTP=${pct}%  triggers=${triggers}`);
}
