ALTER TABLE "Event" ADD COLUMN "apiFootballId" TEXT;
CREATE UNIQUE INDEX "Event_apiFootballId_key" ON "Event"("apiFootballId");
