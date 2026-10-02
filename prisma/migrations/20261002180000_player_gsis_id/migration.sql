-- Player ID crosswalk: nflverse GSIS id + lookup indexes
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "gsisId" TEXT;

CREATE INDEX IF NOT EXISTS "Player_gsisId_idx" ON "Player"("gsisId");
CREATE INDEX IF NOT EXISTS "Player_sleeperId_idx" ON "Player"("sleeperId");
