-- Research-aligned projection/trend tables (Player, PlayerWeekStat, PlayerTrendSnapshot, DefenseWeekAllow)
-- Migrates rows from earlier PlayerProjectionSnapshot / PlayerTrendMetric if present.

CREATE TABLE IF NOT EXISTS "Player" (
    "id" TEXT NOT NULL,
    "espnId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "nflTeam" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Player_espnId_key" ON "Player"("espnId");

CREATE TABLE IF NOT EXISTS "PlayerWeekStat" (
    "id" TEXT NOT NULL,
    "playerId" TEXT,
    "espnId" INTEGER NOT NULL,
    "playerName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "nflTeam" TEXT,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "projectedPpr" DOUBLE PRECISION,
    "actualPpr" DOUBLE PRECISION,
    "projectionDelta" DOUBLE PRECISION,
    "targets" DOUBLE PRECISION,
    "carries" DOUBLE PRECISION,
    "targetShare" DOUBLE PRECISION,
    "rushShare" DOUBLE PRECISION,
    "snapShare" DOUBLE PRECISION,
    "airYards" DOUBLE PRECISION,
    "redZoneTargets" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'espn',
    "leagueId" TEXT NOT NULL DEFAULT '',
    "opponent" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlayerWeekStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerWeekStat_espnId_season_week_leagueId_key"
  ON "PlayerWeekStat"("espnId", "season", "week", "leagueId");
CREATE INDEX IF NOT EXISTS "PlayerWeekStat_espnId_season_idx" ON "PlayerWeekStat"("espnId", "season");
CREATE INDEX IF NOT EXISTS "PlayerWeekStat_leagueId_season_week_idx" ON "PlayerWeekStat"("leagueId", "season", "week");
CREATE INDEX IF NOT EXISTS "PlayerWeekStat_playerId_idx" ON "PlayerWeekStat"("playerId");

CREATE TABLE IF NOT EXISTS "PlayerTrendSnapshot" (
    "id" TEXT NOT NULL,
    "playerId" TEXT,
    "espnId" INTEGER NOT NULL,
    "playerName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "leagueId" TEXT NOT NULL DEFAULT '',
    "weeksSampled" INTEGER NOT NULL DEFAULT 0,
    "avgProjected" DOUBLE PRECISION,
    "avgActual" DOUBLE PRECISION,
    "avgDelta" DOUBLE PRECISION,
    "recentFormAvg" DOUBLE PRECISION,
    "trendLabel" TEXT NOT NULL DEFAULT 'Thin',
    "usageTrend" TEXT NOT NULL DEFAULT 'unknown',
    "restOfSeasonAdj" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceSentence" TEXT,
    "factJson" TEXT,
    "judgmentJson" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerTrendSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerTrendSnapshot_espnId_season_leagueId_key"
  ON "PlayerTrendSnapshot"("espnId", "season", "leagueId");
CREATE INDEX IF NOT EXISTS "PlayerTrendSnapshot_espnId_season_idx" ON "PlayerTrendSnapshot"("espnId", "season");
CREATE INDEX IF NOT EXISTS "PlayerTrendSnapshot_leagueId_season_trendLabel_idx"
  ON "PlayerTrendSnapshot"("leagueId", "season", "trendLabel");
CREATE INDEX IF NOT EXISTS "PlayerTrendSnapshot_playerId_idx" ON "PlayerTrendSnapshot"("playerId");

CREATE TABLE IF NOT EXISTS "DefenseWeekAllow" (
    "id" TEXT NOT NULL,
    "defenseAbbrev" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "position" TEXT NOT NULL,
    "role" TEXT,
    "pointsAllowed" DOUBLE PRECISION NOT NULL,
    "samplePlayer" TEXT,
    "source" TEXT NOT NULL DEFAULT 'seed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DefenseWeekAllow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DefenseWeekAllow_defenseAbbrev_season_week_position_role_key"
  ON "DefenseWeekAllow"("defenseAbbrev", "season", "week", "position", "role");
CREATE INDEX IF NOT EXISTS "DefenseWeekAllow_defenseAbbrev_season_idx"
  ON "DefenseWeekAllow"("defenseAbbrev", "season");

-- Copy from prior iteration tables when they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'PlayerProjectionSnapshot') THEN
    INSERT INTO "Player" ("id", "espnId", "name", "position", "nflTeam", "createdAt", "updatedAt")
    SELECT DISTINCT ON ("espnId")
      md5("espnId"::text || '-player'),
      "espnId",
      "playerName",
      "position",
      "nflTeam",
      NOW(),
      NOW()
    FROM "PlayerProjectionSnapshot"
    ON CONFLICT ("espnId") DO UPDATE SET
      "name" = EXCLUDED."name",
      "position" = EXCLUDED."position",
      "nflTeam" = EXCLUDED."nflTeam",
      "updatedAt" = NOW();

    INSERT INTO "PlayerWeekStat" (
      "id", "playerId", "espnId", "playerName", "position", "nflTeam", "season", "week",
      "projectedPpr", "actualPpr", "projectionDelta", "targets", "carries", "targetShare",
      "source", "leagueId", "opponent", "capturedAt", "updatedAt"
    )
    SELECT
      "id",
      (SELECT p."id" FROM "Player" p WHERE p."espnId" = s."espnId" LIMIT 1),
      "espnId", "playerName", "position", "nflTeam", "season", "week",
      "projectedPpr", "actualPpr",
      CASE WHEN "projectedPpr" IS NOT NULL AND "actualPpr" IS NOT NULL
        THEN "actualPpr" - "projectedPpr" ELSE NULL END,
      "targets", "carries", "targetShare",
      "source", "leagueId", "opponent", "capturedAt", "updatedAt"
    FROM "PlayerProjectionSnapshot" s
    ON CONFLICT ("espnId", "season", "week", "leagueId") DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'PlayerTrendMetric') THEN
    INSERT INTO "PlayerTrendSnapshot" (
      "id", "playerId", "espnId", "playerName", "position", "season", "leagueId",
      "weeksSampled", "avgProjected", "avgActual", "avgDelta", "recentFormAvg",
      "trendLabel", "usageTrend", "restOfSeasonAdj", "evidenceSentence",
      "factJson", "judgmentJson", "updatedAt", "createdAt"
    )
    SELECT
      "id",
      (SELECT p."id" FROM "Player" p WHERE p."espnId" = m."espnId" LIMIT 1),
      "espnId", "playerName", "position", "season", "leagueId",
      "weeksSampled", "avgProjected", "avgActual", "avgDelta", "recentFormAvg",
      CASE
        WHEN "trendLabel" IN ('rising', 'hot') THEN 'Rising'
        WHEN "trendLabel" IN ('falling', 'cold') THEN 'Fading'
        WHEN "trendLabel" IN ('boom', 'bust') THEN 'BoomBust'
        WHEN "trendLabel" = 'thin' THEN 'Thin'
        ELSE 'Stable'
      END,
      "usageTrend", "restOfSeasonAdj", "rationale",
      NULL, NULL, "updatedAt", "createdAt"
    FROM "PlayerTrendMetric" m
    ON CONFLICT ("espnId", "season", "leagueId") DO NOTHING;
  END IF;
END $$;

ALTER TABLE "PlayerWeekStat"
  DROP CONSTRAINT IF EXISTS "PlayerWeekStat_playerId_fkey";
ALTER TABLE "PlayerWeekStat"
  ADD CONSTRAINT "PlayerWeekStat_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlayerTrendSnapshot"
  DROP CONSTRAINT IF EXISTS "PlayerTrendSnapshot_playerId_fkey";
ALTER TABLE "PlayerTrendSnapshot"
  ADD CONSTRAINT "PlayerTrendSnapshot_playerId_fkey"
  FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop legacy tables from the first trends iteration
DROP TABLE IF EXISTS "PlayerProjectionSnapshot";
DROP TABLE IF EXISTS "PlayerTrendMetric";
