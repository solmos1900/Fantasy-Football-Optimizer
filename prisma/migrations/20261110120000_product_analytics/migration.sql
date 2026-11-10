-- AlterTable
ALTER TABLE "ChatUsage" ADD COLUMN     "costUsd" DOUBLE PRECISION,
ADD COLUMN     "toolCalls" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "props" JSONB,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveDay" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActiveDay_pkey" PRIMARY KEY ("userId","day")
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_name_createdAt_idx" ON "AnalyticsEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_userId_createdAt_idx" ON "AnalyticsEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ActiveDay_day_idx" ON "ActiveDay"("day");

