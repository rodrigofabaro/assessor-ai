-- CreateEnum
CREATE TYPE "SubmissionAutomationJobType" AS ENUM ('EXTRACT', 'GRADE');

-- CreateEnum
CREATE TYPE "SubmissionAutomationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "SubmissionAutomationJob" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "type" "SubmissionAutomationJobType" NOT NULL,
    "status" "SubmissionAutomationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfterAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "payload" JSONB,
    "resultJson" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submissionId" TEXT NOT NULL,

    CONSTRAINT "SubmissionAutomationJob_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SubmissionAutomationJob"
ADD CONSTRAINT "SubmissionAutomationJob_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "SubmissionAutomationJob_status_runAfterAt_priority_createdAt_idx"
ON "SubmissionAutomationJob"("status", "runAfterAt", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "SubmissionAutomationJob_submissionId_type_status_idx"
ON "SubmissionAutomationJob"("submissionId", "type", "status");

-- CreateIndex
CREATE INDEX "SubmissionAutomationJob_submissionId_createdAt_idx"
ON "SubmissionAutomationJob"("submissionId", "createdAt");
