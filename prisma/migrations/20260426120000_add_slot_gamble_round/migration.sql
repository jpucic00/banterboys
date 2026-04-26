-- CreateTable
CREATE TABLE "SlotGambleRound" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spinId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "won" BOOLEAN NOT NULL,
    "round" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotGambleRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlotGambleRound_userId_idx" ON "SlotGambleRound"("userId");

-- CreateIndex
CREATE INDEX "SlotGambleRound_createdAt_idx" ON "SlotGambleRound"("createdAt");

-- AddForeignKey
ALTER TABLE "SlotGambleRound" ADD CONSTRAINT "SlotGambleRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotGambleRound" ADD CONSTRAINT "SlotGambleRound_spinId_fkey" FOREIGN KEY ("spinId") REFERENCES "SlotSpin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
