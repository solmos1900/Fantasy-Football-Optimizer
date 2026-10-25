-- CreateTable
CREATE TABLE "PlayerPoolSnapshot" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "builtAt" TIMESTAMP(3) NOT NULL,
    "refreshStartedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerPoolSnapshot_pkey" PRIMARY KEY ("key")
);

