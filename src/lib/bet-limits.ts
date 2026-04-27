import { Currency } from "@prisma/client";

// Tibia-style shorthand: 1k = 1,000 ; 1kk = 1,000,000.
// All limits here apply to standard bet slips only. PvP bets and slots have
// their own rules (PvP: none; slots: see src/lib/slots.ts).

// Hard cap on stake per slip, by currency.
export const MAX_TICKET_STAKE: Record<Currency, number> = {
  GOLD: 20_000_000,
  TIBIA_COINS: 500,
};

// Minimum stake. GOLD min is a silent restriction: don't surface it in UI
// hints, only in the error returned when a user actually tries to submit
// a sub-minimum slip.
export const MIN_TICKET_STAKE: Record<Currency, number> = {
  GOLD: 100_000,
  TIBIA_COINS: 1,
};

// Cap on profit (payout − stake). Applied to GOLD only; the 500 TC stake cap
// already keeps TC payouts bounded without a separate profit cap.
export const MAX_TICKET_PROFIT: Partial<Record<Currency, number>> = {
  GOLD: 50_000_000,
};

// Hard cap on how far a player may go into debt. Placing a slip that would
// push balance below −MAX_DEBT is rejected; so is any placement while already
// at the limit.
export const MAX_DEBT: Record<Currency, number> = {
  GOLD: 20_000_000,
  TIBIA_COINS: 500,
};

export type TicketLimitError =
  | "MIN_STAKE"
  | "MAX_STAKE"
  | "DEBT_LIMIT"
  | "PROFIT_CAP"
  | "INVALID_STAKE";

export type LimitResult =
  | { ok: true; potentialPayout: number }
  | { ok: false; code: TicketLimitError; message: string };

export function formatCurrencyAmount(
  amount: number,
  currency: Currency
): string {
  if (currency === "TIBIA_COINS") return `${amount} TC`;
  if (amount >= 1_000_000) {
    const v = amount / 1_000_000;
    return `${Number.isInteger(v) ? v : v.toFixed(1)}kk gp`;
  }
  if (amount >= 1_000) {
    const v = amount / 1_000;
    return `${Number.isInteger(v) ? v : v.toFixed(1)}k gp`;
  }
  return `${amount} gp`;
}

/**
 * Pure check for whether the potential profit (payout − stake) would exceed
 * the per-currency profit cap. Exported for client-side UI so we can warn
 * the user and disable the submit button before they try.
 */
export function exceedsProfitCap(
  amount: number,
  totalOdds: number,
  currency: Currency
): boolean {
  const profitCap = MAX_TICKET_PROFIT[currency];
  if (profitCap === undefined) return false;
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const profit = amount * totalOdds - amount;
  return profit > profitCap;
}

export function validateTicketPlacement(params: {
  amount: number;
  currency: Currency;
  totalOdds: number;
  currentBalance: number;
}): LimitResult {
  const { amount, currency, totalOdds, currentBalance } = params;

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, code: "INVALID_STAKE", message: "Invalid stake." };
  }

  const min = MIN_TICKET_STAKE[currency];
  if (amount < min) {
    return {
      ok: false,
      code: "MIN_STAKE",
      message: `Minimum bet is ${formatCurrencyAmount(min, currency)}.`,
    };
  }

  const max = MAX_TICKET_STAKE[currency];
  if (amount > max) {
    return {
      ok: false,
      code: "MAX_STAKE",
      message: `Maximum bet is ${formatCurrencyAmount(max, currency)}.`,
    };
  }

  const debtCap = MAX_DEBT[currency];
  if (currentBalance - amount < -debtCap) {
    return {
      ok: false,
      code: "DEBT_LIMIT",
      message: `Debt limit reached (${formatCurrencyAmount(debtCap, currency)}). Pay out your debt in order to continue playing.`,
    };
  }

  if (exceedsProfitCap(amount, totalOdds, currency)) {
    const cap = MAX_TICKET_PROFIT[currency]!;
    return {
      ok: false,
      code: "PROFIT_CAP",
      message: `Potential profit exceeds the ${formatCurrencyAmount(cap, currency)} cap. Lower your stake or drop a selection.`,
    };
  }

  return { ok: true, potentialPayout: amount * totalOdds };
}

/**
 * Canonical signature for a slip: used to detect duplicate active slips.
 * Order-independent — same events + same picks → same signature.
 */
export function slipSignature(
  selections: { eventId: string; pick: string }[]
): string {
  return selections
    .map((s) => `${s.eventId}:${s.pick}`)
    .sort()
    .join("|");
}
