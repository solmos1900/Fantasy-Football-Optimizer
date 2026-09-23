-- Weekly projection/actual snapshots for PPR trend analysis
CREATE TABLE IF NOT EXISTS "PlayerProjectionSnapshot" (
    "id" TEXT NOT NULL,
    "espnId" INTEGER NOT NULL,
    "playerName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "nflTeam" TEXT,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "projectedPpr" DOUBLE PRECISION,
    "actualPpr" DOUBLE PRECISION,
    "targets" DOUBLE PRECISION,
    "carries" DOUBLE PRECISION,
    "targetShare" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'espn',
    "leagueId" TEXT NOT NULL DEFAULT '',
    "opponent" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerProjectionSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerProjectionSnapshot_espnId_season_week_leagueId_key"
  ON "PlayerProjectionSnapshot"("espnId", "season", "week", "leagueId");

CREATE INDEX IF NOT EXISTS "PlayerProjectionSnapshot_espnId_season_idx"
  ON "PlayerProjectionSnapshot"("espnId", "season");

CREATE INDEX IF NOT EXISTS "PlayerProjectionSnapshot_leagueId_season_week_idx"
  ON "PlayerProjectionSnapshot"("leagueId", "season", "week");

-- Derived trend metrics (hot/cold, boom/bust vs projection, ROS adj)
CREATE TABLE IF NOT EXISTS "PlayerTrendMetric" (
    "id" TEXT NOT NULL,
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
    "trendLabel" TEXT NOT NULL DEFAULT 'thin',
    "usageTrend" TEXT NOT NULL DEFAULT 'unknown',
    "restOfSeasonAdj" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rationale" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerTrendMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerTrendMetric_espnId_season_leagueId_key"
  ON "PlayerTrendMetric"("espnId", "season", "leagueId");

CREATE INDEX IF NOT EXISTS "PlayerTrendMetric_espnId_season_idx"
  ON "PlayerTrendMetric"("espnId", "season");

CREATE INDEX IF NOT EXISTS "PlayerTrendMetric_leagueId_season_trendLabel_idx"
  ON "PlayerTrendMetric"("leagueId", "season", "trendLabel");
