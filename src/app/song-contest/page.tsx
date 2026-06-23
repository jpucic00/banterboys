import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { getContestState } from "@/lib/song-contest-state";
import SongContestClient from "./SongContestClient";

export const dynamic = "force-dynamic";

export default async function SongContestPage() {
  const session = await auth();
  const viewerId = session?.user?.id ?? null;
  const isAdmin =
    session?.user?.role === "ADMIN" || isAdminEmail(session?.user?.email);
  const state = await getContestState(viewerId, isAdmin);

  return <SongContestClient initial={state} isLoggedIn={!!viewerId} />;
}
