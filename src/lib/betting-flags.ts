// Committed kill switch for all wagering: P2P bets, house bet slips, and the
// Wheel of Henricus. When true, every wagering endpoint responds 503 and the
// UI hides its wager controls. Slots have their own switch (SLOTS_DISABLED in
// src/lib/slots.ts). Flip to false to reopen gambling.
//
// Client-safe on purpose — no next/server import — so client components can
// import the flag directly. Runtime override: BETTING_DISABLED=true.
export const GAMBLING_DISABLED = true;

export const BETTING_DISABLED_MESSAGE =
  "Betting is currently unavailable. Please try again later.";
