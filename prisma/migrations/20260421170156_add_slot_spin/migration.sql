-- CreateTable
CREATE TABLE "SlotSpin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "stake" DOUBLE PRECISION NOT NULL,
    "payout" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "symbols" TEXT NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotSpin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlotSpin_userId_idx" ON "SlotSpin"("userId");

-- CreateIndex
CREATE INDEX "SlotSpin_createdAt_idx" ON "SlotSpin"("createdAt");

-- CreateIndex
CREATE INDEX "SlotSpin_multiplier_idx" ON "SlotSpin"("multiplier");

-- AddForeignKey
ALTER TABLE "SlotSpin" ADD CONSTRAINT "SlotSpin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
