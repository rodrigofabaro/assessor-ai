-- CreateTable
CREATE TABLE "OpenAiUsageEvent" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,

    CONSTRAINT "OpenAiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpenAiUsageEvent_ts_idx" ON "OpenAiUsageEvent"("ts");

-- CreateIndex
CREATE INDEX "OpenAiUsageEvent_model_ts_idx" ON "OpenAiUsageEvent"("model", "ts");

-- CreateIndex
CREATE INDEX "OpenAiUsageEvent_op_ts_idx" ON "OpenAiUsageEvent"("op", "ts");
