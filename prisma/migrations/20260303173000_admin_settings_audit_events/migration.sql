-- CreateTable
CREATE TABLE "AdminSettingsAuditEvent" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "changes" JSONB,

    CONSTRAINT "AdminSettingsAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminSettingsAuditEvent_ts_idx" ON "AdminSettingsAuditEvent"("ts");

-- CreateIndex
CREATE INDEX "AdminSettingsAuditEvent_target_ts_idx" ON "AdminSettingsAuditEvent"("target", "ts");
