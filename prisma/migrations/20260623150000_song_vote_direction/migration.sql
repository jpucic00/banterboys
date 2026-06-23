-- CreateEnum
CREATE TYPE "VoteDirection" AS ENUM ('UP', 'DOWN');

-- DropIndex
DROP INDEX "SongVote_contestId_userId_key";

-- AlterTable
ALTER TABLE "SongVote" ADD COLUMN     "direction" "VoteDirection" NOT NULL DEFAULT 'UP';

-- CreateIndex
CREATE UNIQUE INDEX "SongVote_userId_submissionId_key" ON "SongVote"("userId", "submissionId");
