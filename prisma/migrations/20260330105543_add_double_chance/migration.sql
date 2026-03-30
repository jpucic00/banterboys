-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Pick" ADD VALUE 'HOME_DRAW';
ALTER TYPE "Pick" ADD VALUE 'AWAY_DRAW';

-- AlterTable
ALTER TABLE "OddsSnapshot" ADD COLUMN     "awayDrawOdds" DOUBLE PRECISION,
ADD COLUMN     "homeDrawOdds" DOUBLE PRECISION;
