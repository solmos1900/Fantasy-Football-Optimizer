-- AlterTable
ALTER TABLE "LeagueConnection" ADD COLUMN     "espnLeagueId" TEXT;

-- CreateTable
CREATE TABLE "EspnLeague" (
    "id" TEXT NOT NULL,
    "espnLeagueId" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspnLeague_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspnSeason" (
    "id" TEXT NOT NULL,
    "espnLeagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "leagueName" TEXT,
    "teamCount" INTEGER,
    "scoringType" TEXT,
    "playoffTeamCount" INTEGER,
    "regularSeasonLength" INTEGER,
    "matchupPeriodCount" INTEGER,
    "finalScoringPeriod" INTEGER,
    "rosterSlotCounts" JSONB,
    "scoringSettings" JSONB,
    "draftType" TEXT,
    "settingsRaw" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspnSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspnMember" (
    "id" TEXT NOT NULL,
    "espnLeagueId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "displayName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "firstSeenSeason" INTEGER,
    "lastSeenSeason" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspnMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspnTeam" (
    "id" TEXT NOT NULL,
    "espnLeagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "memberId" TEXT,
    "teamName" TEXT,
    "location" TEXT,
    "nickname" TEXT,
    "abbrev" TEXT,
    "logoUrl" TEXT,
    "wins" INTEGER,
    "losses" INTEGER,
    "ties" INTEGER,
    "pointsFor" DOUBLE PRECISION,
    "pointsAgainst" DOUBLE PRECISION,
    "playoffSeed" INTEGER,
    "finalRank" INTEGER,
    "regularSeasonRank" INTEGER,
    "waiverRank" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspnTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspnTeamOwner" (
    "espnLeagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "EspnTeamOwner_pkey" PRIMARY KEY ("espnLeagueId","season","teamId","memberId")
);

-- CreateTable
CREATE TABLE "EspnHistoryPlayer" (
    "espnPlayerId" BIGINT NOT NULL,
    "fullName" TEXT,
    "defaultPositionId" INTEGER,
    "position" TEXT,
    "proTeamId" INTEGER,
    "proTeam" TEXT,
    "appPlayerId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspnHistoryPlayer_pkey" PRIMARY KEY ("espnPlayerId")
);

-- CreateTable
CREATE TABLE "EspnMatchup" (
    "id" TEXT NOT NULL,
    "espnLeagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "espnMatchupId" INTEGER NOT NULL,
    "week" INTEGER,
    "homeTeamId" INTEGER,
    "awayTeamId" INTEGER,
    "homeScore" DOUBLE PRECISION,
    "awayScore" DOUBLE PRECISION,
    "homeTiebreak" DOUBLE PRECISION,
    "awayTiebreak" DOUBLE PRECISION,
    "winner" TEXT,
    "playoffTierType" TEXT,
    "isBye" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspnMatchup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspnRosterSlot" (
    "id" TEXT NOT NULL,
    "espnLeagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "espnPlayerId" BIGINT NOT NULL,
    "playerName" TEXT,
    "lineupSlotId" INTEGER,
    "lineupSlot" TEXT,
    "started" BOOLEAN,
    "actualPoints" DOUBLE PRECISION,
    "projectedPoints" DOUBLE PRECISION,
    "position" TEXT,
    "proTeamId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspnRosterSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspnDraftPick" (
    "id" TEXT NOT NULL,
    "espnLeagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "overallPick" INTEGER NOT NULL,
    "round" INTEGER,
    "roundPick" INTEGER,
    "teamId" INTEGER,
    "espnPlayerId" BIGINT,
    "playerName" TEXT,
    "bidAmount" DOUBLE PRECISION,
    "keeper" BOOLEAN,
    "nominatingTeamId" INTEGER,
    "autoDraftType" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspnDraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspnTransaction" (
    "id" TEXT NOT NULL,
    "espnLeagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "transactionId" TEXT NOT NULL,
    "itemIndex" INTEGER NOT NULL,
    "type" TEXT,
    "status" TEXT,
    "executionType" TEXT,
    "itemType" TEXT,
    "teamId" INTEGER,
    "fromTeamId" INTEGER,
    "toTeamId" INTEGER,
    "espnPlayerId" BIGINT,
    "playerName" TEXT,
    "bidAmount" DOUBLE PRECISION,
    "scoringPeriod" INTEGER,
    "proposedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "hasItems" BOOLEAN NOT NULL DEFAULT true,
    "memberId" TEXT,
    "relatedTransactionId" TEXT,
    "isPending" BOOLEAN,
    "fromLineupSlotId" INTEGER,
    "toLineupSlotId" INTEGER,
    "isKeeper" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspnTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspnSeasonChampion" (
    "espnLeagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "championshipWeek" INTEGER,
    "championTeamId" INTEGER,
    "champion" TEXT,
    "championMember" TEXT,
    "championScore" DOUBLE PRECISION,
    "runnerUpTeamId" INTEGER,
    "runnerUp" TEXT,
    "runnerUpMember" TEXT,
    "runnerUpScore" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspnSeasonChampion_pkey" PRIMARY KEY ("espnLeagueId","season")
);

-- CreateTable
CREATE TABLE "EspnTrade" (
    "espnLeagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "transactionId" TEXT NOT NULL,
    "itemIndex" INTEGER NOT NULL,
    "week" INTEGER,
    "processedAt" TIMESTAMP(3),
    "fromTeamId" INTEGER,
    "fromTeam" TEXT,
    "toTeamId" INTEGER,
    "toTeam" TEXT,
    "espnPlayerId" BIGINT,
    "playerName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspnTrade_pkey" PRIMARY KEY ("espnLeagueId","season","transactionId","itemIndex")
);

-- CreateTable
CREATE TABLE "EspnMemberRecord" (
    "espnLeagueId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "displayName" TEXT,
    "seasons" INTEGER,
    "wins" INTEGER,
    "losses" INTEGER,
    "ties" INTEGER,
    "winPct" DOUBLE PRECISION,
    "pointsFor" DOUBLE PRECISION,
    "pointsAgainst" DOUBLE PRECISION,
    "titles" INTEGER,
    "runnerUpFinishes" INTEGER,
    "playoffAppearances" INTEGER,
    "bestFinish" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspnMemberRecord_pkey" PRIMARY KEY ("espnLeagueId","memberId")
);

-- CreateTable
CREATE TABLE "EspnRawResponse" (
    "id" TEXT NOT NULL,
    "espnLeagueId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "view" TEXT NOT NULL,
    "week" INTEGER,
    "body" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EspnRawResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EspnLeague_espnLeagueId_key" ON "EspnLeague"("espnLeagueId");

-- CreateIndex
CREATE INDEX "EspnSeason_season_idx" ON "EspnSeason"("season");

-- CreateIndex
CREATE UNIQUE INDEX "EspnSeason_espnLeagueId_season_key" ON "EspnSeason"("espnLeagueId", "season");

-- CreateIndex
CREATE INDEX "EspnMember_memberId_idx" ON "EspnMember"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "EspnMember_espnLeagueId_memberId_key" ON "EspnMember"("espnLeagueId", "memberId");

-- CreateIndex
CREATE INDEX "EspnTeam_espnLeagueId_memberId_idx" ON "EspnTeam"("espnLeagueId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "EspnTeam_espnLeagueId_season_teamId_key" ON "EspnTeam"("espnLeagueId", "season", "teamId");

-- CreateIndex
CREATE INDEX "EspnHistoryPlayer_fullName_idx" ON "EspnHistoryPlayer"("fullName");

-- CreateIndex
CREATE INDEX "EspnMatchup_espnLeagueId_season_week_idx" ON "EspnMatchup"("espnLeagueId", "season", "week");

-- CreateIndex
CREATE INDEX "EspnMatchup_espnLeagueId_season_playoffTierType_idx" ON "EspnMatchup"("espnLeagueId", "season", "playoffTierType");

-- CreateIndex
CREATE UNIQUE INDEX "EspnMatchup_espnLeagueId_season_espnMatchupId_key" ON "EspnMatchup"("espnLeagueId", "season", "espnMatchupId");

-- CreateIndex
CREATE INDEX "EspnRosterSlot_espnPlayerId_idx" ON "EspnRosterSlot"("espnPlayerId");

-- CreateIndex
CREATE INDEX "EspnRosterSlot_espnLeagueId_season_week_teamId_started_idx" ON "EspnRosterSlot"("espnLeagueId", "season", "week", "teamId", "started");

-- CreateIndex
CREATE UNIQUE INDEX "EspnRosterSlot_espnLeagueId_season_week_teamId_espnPlayerId_key" ON "EspnRosterSlot"("espnLeagueId", "season", "week", "teamId", "espnPlayerId");

-- CreateIndex
CREATE INDEX "EspnDraftPick_espnLeagueId_season_teamId_idx" ON "EspnDraftPick"("espnLeagueId", "season", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "EspnDraftPick_espnLeagueId_season_overallPick_key" ON "EspnDraftPick"("espnLeagueId", "season", "overallPick");

-- CreateIndex
CREATE INDEX "EspnTransaction_espnLeagueId_season_teamId_idx" ON "EspnTransaction"("espnLeagueId", "season", "teamId");

-- CreateIndex
CREATE INDEX "EspnTransaction_espnLeagueId_season_type_idx" ON "EspnTransaction"("espnLeagueId", "season", "type");

-- CreateIndex
CREATE INDEX "EspnTransaction_espnLeagueId_season_status_idx" ON "EspnTransaction"("espnLeagueId", "season", "status");

-- CreateIndex
CREATE INDEX "EspnTransaction_espnPlayerId_idx" ON "EspnTransaction"("espnPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "EspnTransaction_espnLeagueId_season_transactionId_itemIndex_key" ON "EspnTransaction"("espnLeagueId", "season", "transactionId", "itemIndex");

-- CreateIndex
CREATE INDEX "EspnRawResponse_espnLeagueId_season_idx" ON "EspnRawResponse"("espnLeagueId", "season");

-- CreateIndex
CREATE UNIQUE INDEX "EspnRawResponse_espnLeagueId_season_view_week_key" ON "EspnRawResponse"("espnLeagueId", "season", "view", "week");

-- CreateIndex
CREATE INDEX "LeagueConnection_espnLeagueId_idx" ON "LeagueConnection"("espnLeagueId");

-- AddForeignKey
ALTER TABLE "LeagueConnection" ADD CONSTRAINT "LeagueConnection_espnLeagueId_fkey" FOREIGN KEY ("espnLeagueId") REFERENCES "EspnLeague"("espnLeagueId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspnSeason" ADD CONSTRAINT "EspnSeason_espnLeagueId_fkey" FOREIGN KEY ("espnLeagueId") REFERENCES "EspnLeague"("espnLeagueId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspnMember" ADD CONSTRAINT "EspnMember_espnLeagueId_fkey" FOREIGN KEY ("espnLeagueId") REFERENCES "EspnLeague"("espnLeagueId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspnTeam" ADD CONSTRAINT "EspnTeam_espnLeagueId_season_fkey" FOREIGN KEY ("espnLeagueId", "season") REFERENCES "EspnSeason"("espnLeagueId", "season") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspnTeam" ADD CONSTRAINT "EspnTeam_espnLeagueId_memberId_fkey" FOREIGN KEY ("espnLeagueId", "memberId") REFERENCES "EspnMember"("espnLeagueId", "memberId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspnTeamOwner" ADD CONSTRAINT "EspnTeamOwner_espnLeagueId_season_teamId_fkey" FOREIGN KEY ("espnLeagueId", "season", "teamId") REFERENCES "EspnTeam"("espnLeagueId", "season", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspnTeamOwner" ADD CONSTRAINT "EspnTeamOwner_espnLeagueId_memberId_fkey" FOREIGN KEY ("espnLeagueId", "memberId") REFERENCES "EspnMember"("espnLeagueId", "memberId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspnMatchup" ADD CONSTRAINT "EspnMatchup_espnLeagueId_season_fkey" FOREIGN KEY ("espnLeagueId", "season") REFERENCES "EspnSeason"("espnLeagueId", "season") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspnRosterSlot" ADD CONSTRAINT "EspnRosterSlot_espnLeagueId_season_fkey" FOREIGN KEY ("espnLeagueId", "season") REFERENCES "EspnSeason"("espnLeagueId", "season") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspnRosterSlot" ADD CONSTRAINT "EspnRosterSlot_espnLeagueId_season_teamId_fkey" FOREIGN KEY ("espnLeagueId", "season", "teamId") REFERENCES "EspnTeam"("espnLeagueId", "season", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspnDraftPick" ADD CONSTRAINT "EspnDraftPick_espnLeagueId_season_fkey" FOREIGN KEY ("espnLeagueId", "season") REFERENCES "EspnSeason"("espnLeagueId", "season") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspnTransaction" ADD CONSTRAINT "EspnTransaction_espnLeagueId_season_fkey" FOREIGN KEY ("espnLeagueId", "season") REFERENCES "EspnSeason"("espnLeagueId", "season") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspnSeasonChampion" ADD CONSTRAINT "EspnSeasonChampion_espnLeagueId_season_fkey" FOREIGN KEY ("espnLeagueId", "season") REFERENCES "EspnSeason"("espnLeagueId", "season") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspnTrade" ADD CONSTRAINT "EspnTrade_espnLeagueId_season_fkey" FOREIGN KEY ("espnLeagueId", "season") REFERENCES "EspnSeason"("espnLeagueId", "season") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspnMemberRecord" ADD CONSTRAINT "EspnMemberRecord_espnLeagueId_memberId_fkey" FOREIGN KEY ("espnLeagueId", "memberId") REFERENCES "EspnMember"("espnLeagueId", "memberId") ON DELETE CASCADE ON UPDATE CASCADE;
