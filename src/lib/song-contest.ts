import type { Prisma, PrismaClient } from "@prisma/client";

function envNonNegativeInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

type Tx =
  | Omit<
      PrismaClient,
      "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
    >
  | Prisma.TransactionClient;

// Default prize pool (gold). DISPLAY-ONLY — paid by hand in-game, never credited
// to any balance. Overridable per contest at creation time; env vars set the
// defaults the admin form is pre-filled with.
export const DEFAULT_PRIZE_FIRST = envNonNegativeInt("SONG_CONTEST_PRIZE_FIRST", 20_000_000);
export const DEFAULT_PRIZE_SECOND = envNonNegativeInt("SONG_CONTEST_PRIZE_SECOND", 10_000_000);
export const DEFAULT_PRIZE_LUCKY = envNonNegativeInt("SONG_CONTEST_PRIZE_LUCKY", 10_000_000);

// Upload cap. bytea in Postgres handles this comfortably for a ~60-member guild.
export const MAX_FILE_MB = envNonNegativeInt("SONG_CONTEST_MAX_MB", 50);
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

// Voting stays closed until this many songs are in (so there's something to
// choose between). Crossing it fires the "voting is open" Discord announcement.
export const MIN_SUBMISSIONS_TO_VOTE = envNonNegativeInt("SONG_CONTEST_MIN_SUBMISSIONS", 5);

// Each voter gets this many 👍 and this many 👎 (so 2 + 2 = 4 votes total by
// default), at most one vote per submission. Enforced in the vote route.
export const VOTES_PER_DIRECTION = envNonNegativeInt("SONG_CONTEST_VOTES_PER_DIRECTION", 2);

export const DEFAULT_TITLE = "Banter Boys Song Contest";
export const DEFAULT_DESCRIPTION =
  "Write and submit an original song about the Banter Boys — our guild, our players, our glory and our disasters. " +
  "Entries must be relevant to Banter Boys to qualify. One submission per person. " +
  "Anyone can vote, and you can change your vote until the contest closes. Most votes wins.";

// Allowed upload types, keyed by extension → canonical MIME we store and serve.
// Browser-reported MIME is unreliable (often empty/octet-stream), so the file
// extension is authoritative. Audio plays inline in the page player; video
// containers (mp4/webm/mov) play their audio track in most browsers, mkv/avi
// generally won't play inline and fall back to a download link.
const EXT_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/opus",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  weba: "audio/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
};

export const ALLOWED_EXTENSIONS = Object.keys(EXT_MIME);

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

export type FileValidation =
  | { ok: true; mimeType: string; ext: string }
  | { ok: false; error: string };

export function validateSongFile(input: {
  fileName: string;
  sizeBytes: number;
}): FileValidation {
  const ext = fileExtension(input.fileName);
  if (!ext || !(ext in EXT_MIME)) {
    return {
      ok: false,
      error: `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`,
    };
  }
  if (input.sizeBytes <= 0) {
    return { ok: false, error: "File is empty." };
  }
  if (input.sizeBytes > MAX_FILE_BYTES) {
    return { ok: false, error: `File too large. Max ${MAX_FILE_MB} MB.` };
  }
  return { ok: true, mimeType: EXT_MIME[ext], ext };
}

export function isVideoMime(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

// Optional cover art. Smaller cap than songs since these are just images.
export const COVER_MAX_MB = envNonNegativeInt("SONG_CONTEST_COVER_MAX_MB", 5);
export const COVER_MAX_BYTES = COVER_MAX_MB * 1024 * 1024;

const COVER_EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export const ALLOWED_COVER_EXTENSIONS = Object.keys(COVER_EXT_MIME);

export function validateCoverFile(input: {
  fileName: string;
  sizeBytes: number;
}): FileValidation {
  const ext = fileExtension(input.fileName);
  if (!ext || !(ext in COVER_EXT_MIME)) {
    return {
      ok: false,
      error: `Unsupported cover image. Allowed: ${ALLOWED_COVER_EXTENSIONS.join(", ")}.`,
    };
  }
  if (input.sizeBytes <= 0) {
    return { ok: false, error: "Cover image is empty." };
  }
  if (input.sizeBytes > COVER_MAX_BYTES) {
    return { ok: false, error: `Cover image too large. Max ${COVER_MAX_MB} MB.` };
  }
  return { ok: true, mimeType: COVER_EXT_MIME[ext], ext };
}

export async function getOpenContest(tx: Tx) {
  return tx.songContest.findFirst({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
}

export function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

export type ContestResults = {
  winnerSubmissionId: string | null;
  runnerUpSubmissionId: string | null;
  luckyVoterUserId: string | null;
};

// Winner = highest net score (👍 − 👎); ties broken by more upvotes, then
// earliest submission. A submission needs at least one upvote to place. The
// lucky voter is drawn at random WEIGHTED by how many votes each person cast
// (cast more → appear more times in the pool → better odds).
export function computeContestResults(
  submissions: { id: string; createdAt: Date; upVotes: number; downVotes: number }[],
  voterWeights: { userId: string; weight: number }[]
): ContestResults {
  const ranked = [...submissions].sort((a, b) => {
    const scoreDiff = b.upVotes - b.downVotes - (a.upVotes - a.downVotes);
    if (scoreDiff !== 0) return scoreDiff;
    if (b.upVotes !== a.upVotes) return b.upVotes - a.upVotes;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const placed = ranked.filter((s) => s.upVotes > 0);

  const pool: string[] = [];
  for (const v of voterWeights) {
    for (let i = 0; i < v.weight; i++) pool.push(v.userId);
  }

  return {
    winnerSubmissionId: placed[0]?.id ?? null,
    runnerUpSubmissionId: placed[1]?.id ?? null,
    luckyVoterUserId: pickRandom(pool),
  };
}
