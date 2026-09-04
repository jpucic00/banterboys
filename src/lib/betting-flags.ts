// Committed per-surface kill switches. Paid wagering (P2P bets, house bet
// slips) is closed; the Wheel of Henricus runs on its own switch so free spins
// can keep going while betting stays shut. Slots have their own switch
// (SLOTS_DISABLED in src/lib/slots.ts).
//
// Client-safe on purpose — no next/server import — so client components can
// import these directly.
//
// BETTING_DISABLED=true is the emergency master override: it closes every
// surface below, including the wheel, without a deploy.

// P2P bets and house bet slips.
export const GAMBLING_DISABLED = true;

// Wheel of Henricus. Independent of GAMBLING_DISABLED — free spins run while
// paid betting is closed. Flip to true to stop the wheel too.
export const WHEEL_DISABLED = false;

export const BETTING_DISABLED_MESSAGE =
  "Betting is currently unavailable. Please try again later.";

// Banner copy for the wheel-only state, so the notice doesn't contradict a
// live spin button on /wheel-of-henricus.
export const BETTING_DISABLED_WHEEL_LIVE_MESSAGE =
  "Betting is currently unavailable — only the Wheel of Henricus is running.";

export const WHEEL_DISABLED_MESSAGE =
  "The Wheel of Henricus is currently unavailable. Please try again later.";
