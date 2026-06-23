import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import {
  getOpenContest,
  DEFAULT_TITLE,
  DEFAULT_DESCRIPTION,
  DEFAULT_PRIZE_FIRST,
  DEFAULT_PRIZE_SECOND,
  DEFAULT_PRIZE_LUCKY,
} from "@/lib/song-contest";
import { notifySongContestCreated } from "@/lib/discord-notify";

export const dynamic = "force-dynamic";

function nonNegOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

// Create a new contest. Only one OPEN contest may exist at a time.
export async function POST(req: NextRequest) {
  const session = await auth();
  const isAdmin =
    session?.user?.role === "ADMIN" || isAdminEmail(session?.user?.email);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = (body.title?.toString() ?? "").trim() || DEFAULT_TITLE;
  const description = (body.description?.toString() ?? "").trim() || DEFAULT_DESCRIPTION;
  if (title.length > 120) {
    return NextResponse.json({ error: "Title too long (max 120 chars)." }, { status: 400 });
  }
  if (description.length > 4000) {
    return NextResponse.json({ error: "Description too long (max 4000 chars)." }, { status: 400 });
  }
  const prizeFirst = nonNegOr(body.prizeFirst, DEFAULT_PRIZE_FIRST);
  const prizeSecond = nonNegOr(body.prizeSecond, DEFAULT_PRIZE_SECOND);
  const prizeLuckyVoter = nonNegOr(body.prizeLuckyVoter, DEFAULT_PRIZE_LUCKY);

  const open = await getOpenContest(prisma);
  if (open) {
    return NextResponse.json(
      { error: "A contest is already open. Close it before starting a new one." },
      { status: 409 }
    );
  }

  const contest = await prisma.songContest.create({
    data: { title, description, prizeFirst, prizeSecond, prizeLuckyVoter },
    select: { id: true, title: true, description: true, prizeFirst: true, prizeSecond: true, prizeLuckyVoter: true },
  });

  // Fire-and-forget announcement; never blocks the response.
  notifySongContestCreated({
    title: contest.title,
    description: contest.description,
    prizeFirst: contest.prizeFirst,
    prizeSecond: contest.prizeSecond,
    prizeLuckyVoter: contest.prizeLuckyVoter,
  }).catch(() => {});

  return NextResponse.json({ id: contest.id }, { status: 201 });
}
