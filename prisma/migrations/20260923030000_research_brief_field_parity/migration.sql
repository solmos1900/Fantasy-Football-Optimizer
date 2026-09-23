-- Research brief field parity (PlayerWeekStat usage, ranked trend scores, Defense aliases)

ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "espnPlayerId" TEXT;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "sleeperId" TEXT;

CREATE INDEX IF NOT EXISTS "Player_position_nflTeam_idx" ON "Player"("position", "nflTeam");

ALTER TABLE "PlayerWeekStat" ADD COLUMN IF NOT EXISTS "scoringFormat" TEXT NOT NULL DEFAULT 'PPR';
ALTER TABLE "PlayerWeekStat" ADD COLUMN IF NOT EXISTS "projectionSource" TEXT;
ALTER TABLE "PlayerWeekStat" ADD COLUMN IF NOT EXISTS "actualSource" TEXT;
ALTER TABLE "PlayerWeekStat" ADD COLUMN IF NOT EXISTS "receptions" DOUBLE PRECISION;
ALTER TABLE "PlayerWeekStat" ADD COLUMN IF NOT EXISTS "rushingAttempts" DOUBLE PRECISION;
ALTER TABLE "PlayerWeekStat" ADD COLUMN IF NOT EXISTS "rushingYards" DOUBLE PRECISION;
ALTER TABLE "PlayerWeekStat" ADD COLUMN IF NOT EXISTS "receivingYards" DOUBLE PRECISION;
ALTER TABLE "PlayerWeekStat" ADD COLUMN IF NOT EXISTS "routePct" DOUBLE PRECISION;
ALTER TABLE "PlayerWeekStat" ADD COLUMN IF NOT EXISTS "redZoneTouches" DOUBLE PRECISION;
ALTER TABLE "PlayerWeekStat" ADD COLUMN IF NOT EXISTS "goalLineCarries" DOUBLE PRECISION;
ALTER TABLE "PlayerWeekStat" ADD COLUMN IF NOT EXISTS "gameScriptNote" TEXT;

CREATE INDEX IF NOT EXISTS "PlayerWeekStat_projectionDelta_idx" ON "PlayerWeekStat"("projectionDelta");

ALTER TABLE "PlayerTrendSnapshot" ADD COLUMN IF NOT EXISTS "asOfWeek" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlayerTrendSnapshot" ADD COLUMN IF NOT EXISTS "injuryRoleScore" DOUBLE PRECISION;
ALTER TABLE "PlayerTrendSnapshot" ADD COLUMN IF NOT EXISTS "usageTrajectory" DOUBLE PRECISION;
ALTER TABLE "PlayerTrendSnapshot" ADD COLUMN IF NOT EXISTS "redZoneScore" DOUBLE PRECISION;
ALTER TABLE "PlayerTrendSnapshot" ADD COLUMN IF NOT EXISTS "sosScore" DOUBLE PRECISION;
ALTER TABLE "PlayerTrendSnapshot" ADD COLUMN IF NOT EXISTS "hotColdScore" DOUBLE PRECISION;

ALTER TABLE "DefenseWeekAllow" ADD COLUMN IF NOT EXISTS "nflTeam" TEXT;
ALTER TABLE "DefenseWeekAllow" ADD COLUMN IF NOT EXISTS "vsPosition" TEXT;
ALTER TABLE "DefenseWeekAllow" ADD COLUMN IF NOT EXISTS "pointsAllowedPpr" DOUBLE PRECISION;
ALTER TABLE "DefenseWeekAllow" ADD COLUMN IF NOT EXISTS "rankVsPos" INTEGER;

CREATE INDEX IF NOT EXISTS "DefenseWeekAllow_nflTeam_season_week_idx"
  ON "DefenseWeekAllow"("nflTeam", "season", "week");

-- Backfill aliases
UPDATE "Player" SET "espnPlayerId" = "espnId"::text WHERE "espnPlayerId" IS NULL;
UPDATE "DefenseWeekAllow" SET "nflTeam" = "defenseAbbrev" WHERE "nflTeam" IS NULL;
UPDATE "DefenseWeekAllow" SET "vsPosition" = "position" WHERE "vsPosition" IS NULL;
UPDATE "DefenseWeekAllow" SET "pointsAllowedPpr" = "pointsAllowed" WHERE "pointsAllowedPpr" IS NULL;
