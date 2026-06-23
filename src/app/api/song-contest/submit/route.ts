import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getOpenContest,
  validateSongFile,
  validateCoverFile,
  MIN_SUBMISSIONS_TO_VOTE,
} from "@/lib/song-contest";
import { notifySongSubmission, notifySongVotingOpen } from "@/lib/discord-notify";

export const dynamic = "force-dynamic";

class SubmitError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// One song per Discord account per contest. Stored as Postgres bytea in a
// separate blob table. Immutable — there is no edit/replace endpoint by design.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in with Discord to submit." }, { status: 401 });
  }
  const userId = session.user.id;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  const songTitle = (form.get("songTitle")?.toString() ?? "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file attached." }, { status: 400 });
  }
  if (!songTitle) {
    return NextResponse.json({ error: "Give your entry a title." }, { status: 400 });
  }
  if (songTitle.length > 120) {
    return NextResponse.json({ error: "Title too long (max 120 chars)." }, { status: 400 });
  }

  const validation = validateSongFile({ fileName: file.name, sizeBytes: file.size });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Optional cover image.
  const coverFile = form.get("cover");
  let coverData: Uint8Array<ArrayBuffer> | null = null;
  let coverMime: string | null = null;
  if (coverFile instanceof File && coverFile.size > 0) {
    const cover = validateCoverFile({ fileName: coverFile.name, sizeBytes: coverFile.size });
    if (!cover.ok) {
      return NextResponse.json({ error: cover.error }, { status: 400 });
    }
    coverMime = cover.mimeType;
    coverData = new Uint8Array(await coverFile.arrayBuffer());
  }

  // Buffer the bytes before opening the transaction so the tx stays short.
  const buf = new Uint8Array(await file.arrayBuffer());

  try {
    const result = await prisma.$transaction(async (tx) => {
      const contest = await getOpenContest(tx);
      if (!contest) {
        throw new SubmitError("There's no open contest right now.", 409);
      }
      const existing = await tx.songSubmission.findUnique({
        where: { contestId_userId: { contestId: contest.id, userId } },
        select: { id: true },
      });
      if (existing) {
        throw new SubmitError("You've already submitted a song — entries can't be changed.", 409);
      }
      const submission = await tx.songSubmission.create({
        data: {
          contestId: contest.id,
          userId,
          songTitle,
          fileName: file.name.slice(0, 255),
          mimeType: validation.mimeType,
          sizeBytes: file.size,
          coverMimeType: coverMime,
          coverSizeBytes: coverData ? coverData.length : null,
          blob: { create: { data: buf } },
          ...(coverData ? { cover: { create: { data: coverData } } } : {}),
        },
        select: { id: true },
      });
      return { submissionId: submission.id, contestId: contest.id, contestTitle: contest.title };
    });

    // Fire-and-forget Discord: announce the new submission, and — exactly once,
    // when this entry crosses the threshold — that voting has opened.
    (async () => {
      const submitter = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          alias: true,
          accounts: { where: { provider: "discord" }, select: { providerAccountId: true } },
        },
      });
      await notifySongSubmission({
        submitterDisplayName: submitter?.alias ?? submitter?.name ?? "Someone",
        submitterDiscordId: submitter?.accounts[0]?.providerAccountId ?? null,
        songTitle,
        contestTitle: result.contestTitle,
      });
      const count = await prisma.songSubmission.count({ where: { contestId: result.contestId } });
      if (count === MIN_SUBMISSIONS_TO_VOTE) {
        await notifySongVotingOpen({ contestTitle: result.contestTitle, submissionCount: count });
      }
    })().catch(() => {});

    return NextResponse.json({ ok: true, submissionId: result.submissionId }, { status: 201 });
  } catch (err) {
    if (err instanceof SubmitError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // Unique-constraint backstop against a double-submit race.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "You've already submitted a song — entries can't be changed." },
        { status: 409 }
      );
    }
    console.error("[song-contest/submit]", err);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
