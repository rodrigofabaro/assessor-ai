-- CreateTable
CREATE TABLE "OutboundEmailEvent" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "attempted" BOOLEAN NOT NULL DEFAULT false,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "recipientDomain" TEXT,
    "subject" TEXT,
    "providerMessageId" TEXT,
    "error" TEXT,
    "details" JSONB,

    CONSTRAINT "OutboundEmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboundEmailEvent_ts_idx" ON "OutboundEmailEvent"("ts");

-- CreateIndex
CREATE INDEX "OutboundEmailEvent_channel_ts_idx" ON "OutboundEmailEvent"("channel", "ts");

-- CreateIndex
CREATE INDEX "OutboundEmailEvent_provider_ts_idx" ON "OutboundEmailEvent"("provider", "ts");

-- CreateIndex
CREATE INDEX "OutboundEmailEvent_sent_ts_idx" ON "OutboundEmailEvent"("sent", "ts");
