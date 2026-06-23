import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { computeContestResults } from "@/lib/song-contest";
import { notifySongContestClosed } from "@/lib/discord-notify";

export const dynamic = "force-dynamic";

type UserLite = {
  id: string;
  name: string | null;
  alias: string | null;
  accounts: { providerAccountId: string }[];
};

function displayName(u: { name: string | null; alias: string | null }): string {
  return u.alias ?? u.name ?? "Unknown";
}
function discordId(u: UserLite): string | null {
  return u.accounts[0]?.providerAccountId ?? null;
}

// Close the contest: compute winner / runner-up / lucky voter, snapshot them,
// announce on Discord. NO balance changes — prizes are paid by hand in-game.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const isAdmin =
    session?.user?.role === "ADMIN" || isAdminEmail(session?.user?.email);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const userSelect = {
    select: {
      id: true,
      name: true,
      alias: true,
      accounts: { where: { provider: "discord" }, select: { providerAccountId: true } },
    },
  } as const;

  const contest = await prisma.songContest.findUnique({
    where: { id },
    include: {
      submissions: {
        include: {
          user: userSelect,
          votes: { include: { user: userSelect } },
        },
      },
    },
  });

  if (!contest) {
    return NextResponse.json({ error: "Contest not found." }, { status: 404 });
  }
  if (contest.status !== "OPEN") {
    return NextResponse.json({ error: "Contest is already closed." }, { status: 409 });
  }

  // Compute results: net score per submission + a vote-weighted lucky-voter pool.
  const submissionsForCalc = contest.submissions.map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    upVotes: s.votes.filter((v) => v.direction === "UP").length,
    downVotes: s.votes.filter((v) => v.direction === "DOWN").length,
  }));
  const voteCountByUser = new Map<string, number>();
  for (const s of contest.submissions) {
    for (const v of s.votes) {
      voteCountByUser.set(v.userId, (voteCountByUser.get(v.userId) ?? 0) + 1);
    }
  }
  const voterWeights = Array.from(voteCountByUser, ([userId, weight]) => ({ userId, weight }));
  const totalVoteRows = contest.submissions.reduce((n, s) => n + s.votes.length, 0);
  const results = computeContestResults(submissionsForCalc, voterWeights);

  // Atomically close — guards against a double "End contest" click.
  const cas = await prisma.songContest.updateMany({
    where: { id, status: "OPEN" },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      winnerSubmissionId: results.winnerSubmissionId,
      runnerUpSubmissionId: results.runnerUpSubmissionId,
      luckyVoterUserId: results.luckyVoterUserId,
    },
  });
  if (cas.count === 0) {
    return NextResponse.json({ error: "Contest is already closed." }, { status: 409 });
  }

  // Build Discord payload from the snapshot.
  const subById = new Map(contest.submissions.map((s) => [s.id, s]));
  const userById = new Map<string, UserLite>();
  for (const s of contest.submissions) {
    userById.set(s.user.id, s.user);
    for (const v of s.votes) userById.set(v.user.id, v.user);
  }

  const toWinner = (submissionId: string | null) => {
    if (!submissionId) return null;
    const s = subById.get(submissionId);
    if (!s) return null;
    return {
      displayName: displayName(s.user),
      discordId: discordId(s.user),
      songTitle: s.songTitle,
      upVotes: s.votes.filter((v) => v.direction === "UP").length,
      downVotes: s.votes.filter((v) => v.direction === "DOWN").length,
    };
  };
  const luckyVoter = results.luckyVoterUserId
    ? (() => {
        const u = userById.get(results.luckyVoterUserId!);
        return u ? { displayName: displayName(u), discordId: discordId(u) } : null;
      })()
    : null;

  notifySongContestClosed({
    title: contest.title,
    winner: toWinner(results.winnerSubmissionId),
    runnerUp: toWinner(results.runnerUpSubmissionId),
    luckyVoter,
    prizeFirst: contest.prizeFirst,
    prizeSecond: contest.prizeSecond,
    prizeLuckyVoter: contest.prizeLuckyVoter,
    totalSubmissions: contest.submissions.length,
    totalVotes: totalVoteRows,
  }).catch(() => {});

  return NextResponse.json({ ok: true, results });
}
