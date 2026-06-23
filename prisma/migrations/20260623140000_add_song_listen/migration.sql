
-- CreateTable
CREATE TABLE "SongListen" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongListen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SongListen_contestId_userId_idx" ON "SongListen"("contestId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SongListen_userId_submissionId_key" ON "SongListen"("userId", "submissionId");

-- AddForeignKey
ALTER TABLE "SongListen" ADD CONSTRAINT "SongListen_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "SongContest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongListen" ADD CONSTRAINT "SongListen_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "SongSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongListen" ADD CONSTRAINT "SongListen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

