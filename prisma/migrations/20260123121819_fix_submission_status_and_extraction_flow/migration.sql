/*
  Warnings:

  - Made the column `overallConfidence` on table `SubmissionExtractionRun` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "bindingLockedAt" TIMESTAMP(3),
ADD COLUMN     "bindingLockedBy" TEXT,
ADD COLUMN     "bindingStatus" TEXT;

-- AlterTable
ALTER TABLE "SubmissionExtractionRun" ALTER COLUMN "overallConfidence" SET NOT NULL;
