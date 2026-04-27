-- CreateEnum
CREATE TYPE "HenricusFrameStatus" AS ENUM ('ACTIVE', 'SETTLED');

-- CreateTable
CREATE TABLE "HenricusFrame" (
    "id" TEXT NOT NULL,
    "status" "HenricusFrameStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalSpinCount" INTEGER NOT NULL DEFAULT 0,
    "totalPayout" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deadAlias" TEXT,
    "deadAtServer" TIMESTAMP(3),
    "deadAtTibia" TIMESTAMP(3),
    "deathLevel" INTEGER,
    "deathReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "HenricusFrame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HenricusSpin" (
    "id" TEXT NOT NULL,
    "frameId" TEXT NOT NULL,
    "spinnerUserId" TEXT NOT NULL,
    "assignedUserId" TEXT NOT NULL,
    "assignedAlias" TEXT NOT NULL,
    "stake" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "payout" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "currency" "Currency" NOT NULL DEFAULT 'TIBIA_COINS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HenricusSpin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HenricusFrame_status_idx" ON "HenricusFrame"("status");

-- CreateIndex
CREATE INDEX "HenricusFrame_createdAt_idx" ON "HenricusFrame"("createdAt");

-- CreateIndex
CREATE INDEX "HenricusSpin_frameId_idx" ON "HenricusSpin"("frameId");

-- CreateIndex
CREATE INDEX "HenricusSpin_frameId_spinnerUserId_idx" ON "HenricusSpin"("frameId", "spinnerUserId");

-- CreateIndex
CREATE INDEX "HenricusSpin_assignedAlias_idx" ON "HenricusSpin"("assignedAlias");

-- CreateIndex
CREATE INDEX "HenricusSpin_spinnerUserId_idx" ON "HenricusSpin"("spinnerUserId");

-- CreateIndex
CREATE INDEX "HenricusSpin_createdAt_idx" ON "HenricusSpin"("createdAt");

-- AddForeignKey
ALTER TABLE "HenricusSpin" ADD CONSTRAINT "HenricusSpin_frameId_fkey" FOREIGN KEY ("frameId") REFERENCES "HenricusFrame"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HenricusSpin" ADD CONSTRAINT "HenricusSpin_spinnerUserId_fkey" FOREIGN KEY ("spinnerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HenricusSpin" ADD CONSTRAINT "HenricusSpin_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
