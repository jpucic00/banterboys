-- AlterTable
ALTER TABLE "SongSubmission" ADD COLUMN     "coverMimeType" TEXT,
ADD COLUMN     "coverSizeBytes" INTEGER;

-- CreateTable
CREATE TABLE "SongSubmissionCover" (
    "submissionId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "SongSubmissionCover_pkey" PRIMARY KEY ("submissionId")
);

-- AddForeignKey
ALTER TABLE "SongSubmissionCover" ADD CONSTRAINT "SongSubmissionCover_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "SongSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
