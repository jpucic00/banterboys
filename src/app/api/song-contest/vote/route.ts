import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOpenContest, MIN_SUBMISSIONS_TO_VOTE, VOTES_PER_DIRECTION } from "@/lib/song-contest";
import { notifySongVote } from "@/lib/discord-notify";

export const dynamic = "force-dynamic";

class VoteError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Cast / switch / toggle a vote. Each user gets VOTES_PER_DIRECTION 👍 and the
// same number of 👎 per contest, at most one vote per submission. Re-posting the
// same direction on a submission removes that vote (toggle); posting the opposite
// direction switches it. No self-voting; gated on the listen + submission-count rules.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in with Discord to vote." }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await req.json().catch(() => null);
  const submissionId = (body as { submissionId?: string } | null)?.submissionId;
  const direction = (body as { direction?: string } | null)?.direction;
  if (!submissionId || typeof submissionId !== "string") {
    return NextResponse.json({ error: "submissionId required." }, { status: 400 });
  }
  if (direction !== "UP" && direction !== "DOWN") {
    return NextResponse.json({ error: "direction must be UP or DOWN." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const contest = await getOpenContest(tx);
      if (!contest) {
        throw new VoteError("Voting is closed.", 409);
      }

      const submissionCount = await tx.songSubmission.count({ where: { contestId: contest.id } });
      if (submissionCount < MIN_SUBMISSIONS_TO_VOTE) {
        throw new VoteError(
          `Voting opens once there are at least ${MIN_SUBMISSIONS_TO_VOTE} submissions (currently ${submissionCount}).`,
          409
        );
      }

      const submission = await tx.songSubmission.findUnique({
        where: { id: submissionId },
        select: { id: true, contestId: true, userId: true },
      });
      if (!submission || submission.contestId !== contest.id) {
        throw new VoteError("That submission isn't in the current contest.", 404);
      }
      if (submission.userId === userId) {
        throw new VoteError("You can't vote for your own submission.", 400);
      }

      // Listen-gate: must have heard every other submission (≥15s) first.
      const others = await tx.songSubmission.findMany({
        where: { contestId: contest.id, userId: { not: userId } },
        select: { id: true },
      });
      const required = others.map((o) => o.id);
      if (required.length > 0) {
        const listens = await tx.songListen.findMany({
          where: { contestId: contest.id, userId, submissionId: { in: required } },
          select: { submissionId: true },
        });
        const heard = new Set(listens.map((l) => l.submissionId));
        const missing = required.filter((id) => !heard.has(id)).length;
        if (missing > 0) {
          throw new VoteError(
            `Listen to every song (15s each) before voting — ${required.length - missing}/${required.length} done.`,
            403
          );
        }
      }

      const myVotes = await tx.songVote.findMany({
        where: { contestId: contest.id, userId },
        select: { submissionId: true, direction: true },
      });
      const existing = myVotes.find((v) => v.submissionId === submissionId) ?? null;

      if (existing && existing.direction === direction) {
        // Same direction again → toggle the vote off.
        await tx.songVote.delete({ where: { userId_submissionId: { userId, submissionId } } });
        return { action: "removed" as const };
      }

      // Adding or switching: enforce the per-direction budget. Exclude this
      // submission's own existing vote — switching frees its old slot.
      const usedInDirection = myVotes.filter(
        (v) => v.direction === direction && v.submissionId !== submissionId
      ).length;
      if (usedInDirection >= VOTES_PER_DIRECTION) {
        const icon = direction === "UP" ? "👍" : "👎";
        throw new VoteError(`You've used all ${VOTES_PER_DIRECTION} of your ${icon} votes.`, 409);
      }

      await tx.songVote.upsert({
        where: { userId_submissionId: { userId, submissionId } },
        create: { contestId: contest.id, userId, submissionId, direction },
        update: { direction },
      });
      return { action: "set" as const };
    });

    // Fire-and-forget Discord: who voted, which way, on which song. Only on an
    // actual cast/switch (not a toggle-off). Set SONG_CONTEST_NOTIFY_VOTES=false
    // to silence it if the channel gets too busy.
    if (result.action === "set" && process.env.SONG_CONTEST_NOTIFY_VOTES !== "false") {
      (async () => {
        const accountSel = { where: { provider: "discord" }, select: { providerAccountId: true } } as const;
        const [voter, sub] = await Promise.all([
          prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, alias: true, accounts: accountSel },
          }),
          prisma.songSubmission.findUnique({
            where: { id: submissionId },
            select: {
              songTitle: true,
              user: { select: { name: true, alias: true } },
              contest: { select: { title: true } },
            },
          }),
        ]);
        if (!sub) return;
        await notifySongVote({
          voterDisplayName: voter?.alias ?? voter?.name ?? "Someone",
          voterDiscordId: voter?.accounts[0]?.providerAccountId ?? null,
          direction,
          songTitle: sub.songTitle,
          submitterDisplayName: sub.user.alias ?? sub.user.name ?? "Unknown",
          contestTitle: sub.contest.title,
        });
      })().catch(() => {});
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof VoteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[song-contest/vote]", err);
    return NextResponse.json({ error: "Vote failed. Try again." }, { status: 500 });
  }
}
