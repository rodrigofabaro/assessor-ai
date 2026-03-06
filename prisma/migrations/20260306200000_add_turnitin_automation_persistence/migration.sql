-- AlterTable
ALTER TABLE "AppConfig"
ADD COLUMN "turnitinConfig" JSONB,
ADD COLUMN "automationPolicy" JSONB;

-- CreateEnum
CREATE TYPE "TurnitinSubmissionSyncStatus" AS ENUM (
  'NOT_SENT',
  'CREATED',
  'UPLOADING',
  'PROCESSING',
  'COMPLETE',
  'FAILED'
);

-- CreateTable
CREATE TABLE "TurnitinSubmissionSyncState" (
  "submissionId" TEXT NOT NULL,
  "turnitinSubmissionId" TEXT,
  "status" "TurnitinSubmissionSyncStatus" NOT NULL DEFAULT 'NOT_SENT',
  "aiWritingPercentage" INTEGER,
  "overallMatchPercentage" INTEGER,
  "internetMatchPercentage" INTEGER,
  "publicationMatchPercentage" INTEGER,
  "submittedWorksMatchPercentage" INTEGER,
  "reportRequestedAt" TIMESTAMP(3),
  "reportGeneratedAt" TIMESTAMP(3),
  "viewerUrl" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TurnitinSubmissionSyncState_pkey" PRIMARY KEY ("submissionId")
);

-- CreateIndex
CREATE INDEX "TurnitinSubmissionSyncState_status_updatedAt_idx"
ON "TurnitinSubmissionSyncState"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "TurnitinSubmissionSyncState_turnitinSubmissionId_idx"
ON "TurnitinSubmissionSyncState"("turnitinSubmissionId");

-- AddForeignKey
ALTER TABLE "TurnitinSubmissionSyncState"
ADD CONSTRAINT "TurnitinSubmissionSyncState_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
