-- AlterTable
ALTER TABLE "Event" ADD COLUMN "espnReversed" BOOLEAN NOT NULL DEFAULT false;

-- Clear espnEventId on unsettled MMA events so fetch-odds re-matches them with the new flag
UPDATE "Event"
SET "espnEventId" = NULL
WHERE "espnEventId" IS NOT NULL
  AND "status" IN ('UPCOMING', 'LIVE')
  AND "sportId" IN (SELECT "id" FROM "Sport" WHERE "key" = 'mma_mixed_martial_arts');
