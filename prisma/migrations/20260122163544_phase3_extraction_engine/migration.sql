/*
  Warnings:

  - You are about to drop the column `bindingLockedAt` on the `Assignment` table. All the data in the column will be lost.
  - You are about to drop the column `bindingLockedBy` on the `Assignment` table. All the data in the column will be lost.
  - You are about to drop the column `bindingStatus` on the `Assignment` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'NEEDS_OCR', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubmissionStatus" ADD VALUE 'EXTRACTED';
ALTER TYPE "SubmissionStatus" ADD VALUE 'NEEDS_OCR';

-- AlterTable
ALTER TABLE "Assignment" DROP COLUMN "bindingLockedAt",
DROP COLUMN "bindingLockedBy",
DROP COLUMN "bindingStatus";

-- CreateTable
CREATE TABLE "SubmissionExtractionRun" (
    "id" TEXT NOT NULL,
    "status" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "isScanned" BOOLEAN NOT NULL DEFAULT false,
    "overallConfidence" DOUBLE PRECISION DEFAULT 0,
    "engineVersion" TEXT NOT NULL DEFAULT 'extract-v1',
    "pageCount" INTEGER,
    "sourceMeta" JSONB,
    "warnings" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submissionId" TEXT NOT NULL,

    CONSTRAINT "SubmissionExtractionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedPage" (
    "id" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "tokens" JSONB,
    "extractionRunId" TEXT NOT NULL,

    CONSTRAINT "ExtractedPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubmissionExtractionRun_submissionId_idx" ON "SubmissionExtractionRun"("submissionId");

-- CreateIndex
CREATE INDEX "ExtractedPage_extractionRunId_idx" ON "ExtractedPage"("extractionRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedPage_extractionRunId_pageNumber_key" ON "ExtractedPage"("extractionRunId", "pageNumber");

-- AddForeignKey
ALTER TABLE "SubmissionExtractionRun" ADD CONSTRAINT "SubmissionExtractionRun_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedPage" ADD CONSTRAINT "ExtractedPage_extractionRunId_fkey" FOREIGN KEY ("extractionRunId") REFERENCES "SubmissionExtractionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
