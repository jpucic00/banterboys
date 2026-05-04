-- Track when each user's alias was last set so the Wheel of Henricus death
-- cron can ignore deaths that happened BEFORE a player joined the wheel.
-- Backfill existing wheel players with their createdAt — well before any
-- currently-running frame — so the per-user cutoff is dominated by the
-- frame-level deathCutoff and the running round is unaffected.
ALTER TABLE "User" ADD COLUMN "aliasSetAt" TIMESTAMP(3);
UPDATE "User" SET "aliasSetAt" = "createdAt" WHERE "alias" IS NOT NULL;
