import { prisma } from "./db";
import { isVideoMime, MIN_SUBMISSIONS_TO_VOTE, VOTES_PER_DIRECTION } from "./song-contest";

export type Person = { userId: string; name: string; image: string | null };
export type VoteDir = "UP" | "DOWN";

function toPerson(u: {
  id: string;
  name: string | null;
  alias: string | null;
  image: string | null;
}): Person {
  return { userId: u.id, name: u.alias ?? u.name ?? "Unknown", image: u.image };
}

export type SubmissionView = {
  id: string;
  songTitle: string;
  fileName: string;
  mimeType: string;
  isVideo: boolean;
  sizeBytes: number;
  hasCover: boolean;
  createdAt: string;
  submitter: Person;
  upVotes: number;
  downVotes: number;
  score: number;
  upVoters: Person[];
  downVoters: Person[];
};

export type ContestStateView = {
  contest: {
    id: string;
    title: string;
    status: "OPEN" | "CLOSED";
    prizeFirst: number;
    prizeSecond: number;
    prizeLuckyVoter: number;
    createdAt: string;
    closedAt: string | null;
  } | null;
  submissions: SubmissionView[];
  totalVotes: number;
  minSubmissionsToVote: number;
  votesPerDirection: number;
  viewer: {
    userId: string;
    isAdmin: boolean;
    mySubmissionId: string | null;
    myVotes: { submissionId: string; direction: VoteDir }[];
    myListenedSubmissionIds: string[];
  } | null;
  results: {
    winner: { submissionId: string; songTitle: string; submitter: Person; upVotes: number; downVotes: number } | null;
    runnerUp: { submissionId: string; songTitle: string; submitter: Person; upVotes: number; downVotes: number } | null;
    luckyVoter: Person | null;
  } | null;
};

const USER_SELECT = { select: { id: true, name: true, alias: true, image: true } } as const;

// Builds the full, JSON-serializable view of the current (or most recent)
// contest for both the server page and the GET route. `viewerUserId`/`isAdmin`
// scope the viewer-specific bits; pass null for a logged-out visitor.
export async function getContestState(
  viewerUserId: string | null,
  isAdmin: boolean
): Promise<ContestStateView> {
  const contest = await prisma.songContest.findFirst({
    orderBy: { createdAt: "desc" },
    include: {
      submissions: {
        orderBy: { createdAt: "asc" },
        include: {
          user: USER_SELECT,
          votes: {
            orderBy: { createdAt: "asc" },
            include: { user: USER_SELECT },
          },
        },
      },
    },
  });

  if (!contest) {
    return {
      contest: null,
      submissions: [],
      totalVotes: 0,
      minSubmissionsToVote: MIN_SUBMISSIONS_TO_VOTE,
      votesPerDirection: VOTES_PER_DIRECTION,
      viewer: viewerUserId
        ? { userId: viewerUserId, isAdmin, mySubmissionId: null, myVotes: [], myListenedSubmissionIds: [] }
        : null,
      results: null,
    };
  }

  const submissions: SubmissionView[] = contest.submissions.map((s) => {
    const up = s.votes.filter((v) => v.direction === "UP");
    const down = s.votes.filter((v) => v.direction === "DOWN");
    return {
      id: s.id,
      songTitle: s.songTitle,
      fileName: s.fileName,
      mimeType: s.mimeType,
      isVideo: isVideoMime(s.mimeType),
      sizeBytes: s.sizeBytes,
      hasCover: s.coverMimeType != null,
      createdAt: s.createdAt.toISOString(),
      submitter: toPerson(s.user),
      upVotes: up.length,
      downVotes: down.length,
      score: up.length - down.length,
      upVoters: up.map((v) => toPerson(v.user)),
      downVoters: down.map((v) => toPerson(v.user)),
    };
  });

  const totalVotes = submissions.reduce((n, s) => n + s.upVotes + s.downVotes, 0);

  // Viewer-specific state.
  let mySubmissionId: string | null = null;
  let myVotes: { submissionId: string; direction: VoteDir }[] = [];
  let myListenedSubmissionIds: string[] = [];
  if (viewerUserId) {
    mySubmissionId = contest.submissions.find((s) => s.userId === viewerUserId)?.id ?? null;
    for (const s of contest.submissions) {
      const mine = s.votes.find((v) => v.userId === viewerUserId);
      if (mine) myVotes.push({ submissionId: s.id, direction: mine.direction as VoteDir });
    }
    const listens = await prisma.songListen.findMany({
      where: { contestId: contest.id, userId: viewerUserId },
      select: { submissionId: true },
    });
    myListenedSubmissionIds = listens.map((l) => l.submissionId);
  }

  // Result snapshot (only meaningful once closed).
  let results: ContestStateView["results"] = null;
  if (contest.status === "CLOSED") {
    const byId = new Map(submissions.map((s) => [s.id, s]));
    const personById = new Map<string, Person>();
    for (const s of contest.submissions) {
      personById.set(s.user.id, toPerson(s.user));
      for (const v of s.votes) personById.set(v.user.id, toPerson(v.user));
    }
    const toResult = (id: string | null) => {
      if (!id) return null;
      const s = byId.get(id);
      if (!s) return null;
      return { submissionId: s.id, songTitle: s.songTitle, submitter: s.submitter, upVotes: s.upVotes, downVotes: s.downVotes };
    };
    results = {
      winner: toResult(contest.winnerSubmissionId),
      runnerUp: toResult(contest.runnerUpSubmissionId),
      luckyVoter: contest.luckyVoterUserId ? personById.get(contest.luckyVoterUserId) ?? null : null,
    };
  }

  return {
    contest: {
      id: contest.id,
      title: contest.title,
      status: contest.status,
      prizeFirst: contest.prizeFirst,
      prizeSecond: contest.prizeSecond,
      prizeLuckyVoter: contest.prizeLuckyVoter,
      createdAt: contest.createdAt.toISOString(),
      closedAt: contest.closedAt?.toISOString() ?? null,
    },
    submissions,
    totalVotes,
    minSubmissionsToVote: MIN_SUBMISSIONS_TO_VOTE,
    votesPerDirection: VOTES_PER_DIRECTION,
    viewer: viewerUserId
      ? { userId: viewerUserId, isAdmin, mySubmissionId, myVotes, myListenedSubmissionIds }
      : null,
    results,
  };
}
