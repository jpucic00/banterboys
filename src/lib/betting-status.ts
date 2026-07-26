import { NextResponse } from "next/server";
import { GAMBLING_DISABLED, BETTING_DISABLED_MESSAGE } from "./betting-flags";

export { BETTING_DISABLED_MESSAGE };

export function isBettingDisabled(): boolean {
  return GAMBLING_DISABLED || process.env.BETTING_DISABLED === "true";
}

export function bettingDisabledResponse() {
  return NextResponse.json(
    { error: BETTING_DISABLED_MESSAGE },
    { status: 503 }
  );
}
