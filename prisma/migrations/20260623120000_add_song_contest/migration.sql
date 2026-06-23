-- CreateEnum
CREATE TYPE "SongContestStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "SongContest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SongContestStatus" NOT NULL DEFAULT 'OPEN',
    "prizeFirst" DOUBLE PRECISION NOT NULL DEFAULT 20000000,
    "prizeSecond" DOUBLE PRECISION NOT NULL DEFAULT 10000000,
    "prizeLuckyVoter" DOUBLE PRECISION NOT NULL DEFAULT 10000000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "winnerSubmissionId" TEXT,
    "runnerUpSubmissionId" TEXT,
    "luckyVoterUserId" TEXT,

    CONSTRAINT "SongContest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongSubmission" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "songTitle" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongSubmissionBlob" (
    "submissionId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "SongSubmissionBlob_pkey" PRIMARY KEY ("submissionId")
);

-- CreateTable
CREATE TABLE "SongVote" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SongContest_status_idx" ON "SongContest"("status");

-- CreateIndex
CREATE INDEX "SongContest_createdAt_idx" ON "SongContest"("createdAt");

-- CreateIndex
CREATE INDEX "SongSubmission_contestId_idx" ON "SongSubmission"("contestId");

-- CreateIndex
CREATE UNIQUE INDEX "SongSubmission_contestId_userId_key" ON "SongSubmission"("contestId", "userId");

-- CreateIndex
CREATE INDEX "SongVote_submissionId_idx" ON "SongVote"("submissionId");

-- CreateIndex
CREATE INDEX "SongVote_contestId_idx" ON "SongVote"("contestId");

-- CreateIndex
CREATE UNIQUE INDEX "SongVote_contestId_userId_key" ON "SongVote"("contestId", "userId");

-- AddForeignKey
ALTER TABLE "SongSubmission" ADD CONSTRAINT "SongSubmission_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "SongContest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongSubmission" ADD CONSTRAINT "SongSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongSubmissionBlob" ADD CONSTRAINT "SongSubmissionBlob_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "SongSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVote" ADD CONSTRAINT "SongVote_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "SongContest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVote" ADD CONSTRAINT "SongVote_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "SongSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVote" ADD CONSTRAINT "SongVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
