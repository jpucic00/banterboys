import { NextResponse } from "next/server";

export const BETTING_DISABLED_MESSAGE =
  "Betting is currently unavailable. Please try again later.";

export function isBettingDisabled(): boolean {
  return process.env.BETTING_DISABLED === "true";
}

export function bettingDisabledResponse() {
  return NextResponse.json(
    { error: BETTING_DISABLED_MESSAGE },
    { status: 503 }
  );
}
