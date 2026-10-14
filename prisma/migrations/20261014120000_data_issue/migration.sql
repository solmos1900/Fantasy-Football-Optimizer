-- CreateTable
CREATE TABLE "DataIssue" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "espnId" INTEGER,
    "playerName" TEXT,
    "season" INTEGER,
    "week" INTEGER,
    "detail" TEXT NOT NULL,
    "sources" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataIssue_resolved_kind_idx" ON "DataIssue"("resolved", "kind");

-- CreateIndex
CREATE INDEX "DataIssue_espnId_idx" ON "DataIssue"("espnId");

-- CreateIndex
CREATE INDEX "DataIssue_createdAt_idx" ON "DataIssue"("createdAt");
