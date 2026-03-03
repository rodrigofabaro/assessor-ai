-- CreateTable
CREATE TABLE "OpsRuntimeEvent" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "actor" TEXT,
    "route" TEXT,
    "status" INTEGER,
    "details" JSONB,

    CONSTRAINT "OpsRuntimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpsRuntimeEvent_ts_idx" ON "OpsRuntimeEvent"("ts");

-- CreateIndex
CREATE INDEX "OpsRuntimeEvent_type_idx" ON "OpsRuntimeEvent"("type");

-- CreateIndex
CREATE INDEX "OpsRuntimeEvent_route_ts_idx" ON "OpsRuntimeEvent"("route", "ts");
