-- CreateEnum
CREATE TYPE "SpecSuiteImportJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "SpecSuiteImportJob" (
    "id" TEXT NOT NULL,
    "status" "SpecSuiteImportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "organizationId" TEXT,
    "sourceBlobUrl" TEXT NOT NULL,
    "sourceBlobPathname" TEXT,
    "sourceOriginalFilename" TEXT NOT NULL,
    "sourceSizeBytes" INTEGER,
    "framework" TEXT,
    "category" TEXT,
    "cleanupSourceUpload" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "progressLabel" TEXT,
    "progressPercent" INTEGER,
    "resultSummary" JSONB,
    "reportJson" JSONB,
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecSuiteImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpecSuiteImportJob_status_createdAt_idx" ON "SpecSuiteImportJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SpecSuiteImportJob_organizationId_createdAt_idx" ON "SpecSuiteImportJob"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "SpecSuiteImportJob" ADD CONSTRAINT "SpecSuiteImportJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
