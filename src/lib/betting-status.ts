import { NextResponse } from "next/server";
import {
  GAMBLING_DISABLED,
  WHEEL_DISABLED,
  BETTING_DISABLED_MESSAGE,
  WHEEL_DISABLED_MESSAGE,
} from "./betting-flags";

export { BETTING_DISABLED_MESSAGE };

function envMasterOverride(): boolean {
  return process.env.BETTING_DISABLED === "true";
}

export function isBettingDisabled(): boolean {
  return GAMBLING_DISABLED || envMasterOverride();
}

export function isWheelDisabled(): boolean {
  return WHEEL_DISABLED || envMasterOverride();
}

export function bettingDisabledResponse() {
  return NextResponse.json(
    { error: BETTING_DISABLED_MESSAGE },
    { status: 503 }
  );
}

export function wheelDisabledResponse() {
  return NextResponse.json({ error: WHEEL_DISABLED_MESSAGE }, { status: 503 });
}
