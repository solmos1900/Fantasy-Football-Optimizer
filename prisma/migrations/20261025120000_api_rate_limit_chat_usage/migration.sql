-- CreateTable
CREATE TABLE "ApiRateLimit" (
    "id" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "conversationId" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiRateLimit_windowStart_idx" ON "ApiRateLimit"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "ApiRateLimit_bucketKey_windowStart_key" ON "ApiRateLimit"("bucketKey", "windowStart");

-- CreateIndex
CREATE INDEX "ChatUsage_userId_createdAt_idx" ON "ChatUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatUsage_createdAt_idx" ON "ChatUsage"("createdAt");

