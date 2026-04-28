-- Drop free-spin bonus state from User. The slots redesign replaces the
-- scatter/free-spin mechanic with a wild Joker that substitutes for any
-- symbol. SlotSpin.isFreeSpin is kept for historical analytics.
ALTER TABLE "User" DROP COLUMN IF EXISTS "activeFreeSpins";
ALTER TABLE "User" DROP COLUMN IF EXISTS "freeSpinStake";
