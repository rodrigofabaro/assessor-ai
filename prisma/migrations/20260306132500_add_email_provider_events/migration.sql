-- CreateTable
CREATE TABLE "EmailProviderEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "messageId" TEXT,
    "recipient" TEXT,
    "recipientDomain" TEXT,
    "happenedAt" TIMESTAMP(3),
    "payload" JSONB,

    CONSTRAINT "EmailProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailProviderEvent_provider_providerEventId_key" ON "EmailProviderEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "EmailProviderEvent_createdAt_idx" ON "EmailProviderEvent"("createdAt");

-- CreateIndex
CREATE INDEX "EmailProviderEvent_provider_eventType_createdAt_idx" ON "EmailProviderEvent"("provider", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "EmailProviderEvent_messageId_createdAt_idx" ON "EmailProviderEvent"("messageId", "createdAt");
