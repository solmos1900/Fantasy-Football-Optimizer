-- PR D: Player ID crosswalk for nflverse usage ingest
-- Add gsisId + indexes on gsisId / sleeperId (nullable unique allows many NULLs).

ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "gsisId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Player_gsisId_key" ON "Player"("gsisId");
CREATE INDEX IF NOT EXISTS "Player_sleeperId_idx" ON "Player"("sleeperId");
