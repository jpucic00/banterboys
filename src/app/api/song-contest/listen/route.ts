import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOpenContest } from "@/lib/song-contest";

export const dynamic = "force-dynamic";

// Records that the signed-in user has listened to a submission (the client
// posts this after ~15s of real playback). Idempotent per [user, submission].
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await req.json().catch(() => null);
  const submissionId = (body as { submissionId?: string } | null)?.submissionId;
  if (!submissionId || typeof submissionId !== "string") {
    return NextResponse.json({ error: "submissionId required." }, { status: 400 });
  }

  const contest = await getOpenContest(prisma);
  if (!contest) {
    return NextResponse.json({ error: "Voting is closed." }, { status: 409 });
  }

  const submission = await prisma.songSubmission.findUnique({
    where: { id: submissionId },
    select: { contestId: true },
  });
  if (!submission || submission.contestId !== contest.id) {
    return NextResponse.json({ error: "Unknown submission." }, { status: 404 });
  }

  try {
    await prisma.songListen.create({
      data: { contestId: contest.id, submissionId, userId },
    });
  } catch (err) {
    // Already recorded — that's fine, listening is idempotent.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
      console.error("[song-contest/listen]", err);
      return NextResponse.json({ error: "Could not record listen." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
