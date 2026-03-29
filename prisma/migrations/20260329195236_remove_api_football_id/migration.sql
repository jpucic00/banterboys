/*
  Warnings:

  - You are about to drop the column `apiFootballId` on the `Event` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Event_apiFootballId_key";

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "apiFootballId";
