-- Soft-exclude flag for Wheel of Henricus. Players keep their alias for
-- Discord/leaderboards, but excluded users are filtered out of the wheel pool
-- and ignored by the death-check cron.
ALTER TABLE "User" ADD COLUMN "excludedFromWheel" BOOLEAN NOT NULL DEFAULT false;
