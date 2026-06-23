import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { getContestState } from "@/lib/song-contest-state";

export const dynamic = "force-dynamic";

// Public contest state — used by the page for live polling. Includes
// viewer-specific bits (my submission / my vote) only when signed in.
export async function GET() {
  const session = await auth();
  const viewerId = session?.user?.id ?? null;
  const isAdmin =
    session?.user?.role === "ADMIN" || isAdminEmail(session?.user?.email);
  const state = await getContestState(viewerId, isAdmin);
  return NextResponse.json(state);
}
