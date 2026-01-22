-- CreateEnum
CREATE TYPE "ReferenceDocumentStatus" AS ENUM ('UPLOADED', 'EXTRACTED', 'REVIEWED', 'LOCKED', 'FAILED');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('DRAFT', 'LOCKED');

-- CreateEnum
CREATE TYPE "MapSource" AS ENUM ('AUTO_FROM_BRIEF', 'MANUAL_OVERRIDE');

-- AlterTable
ALTER TABLE "AssignmentBrief" ADD COLUMN     "aiasLevel" INTEGER,
ADD COLUMN     "assignmentNumber" INTEGER,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedBy" TEXT,
ADD COLUMN     "status" "RecordStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "totalAssignments" INTEGER;

-- AlterTable
ALTER TABLE "AssignmentCriterionMap" ADD COLUMN     "confidence" DOUBLE PRECISION DEFAULT 1,
ADD COLUMN     "source" "MapSource" NOT NULL DEFAULT 'AUTO_FROM_BRIEF';

-- AlterTable
ALTER TABLE "LearningOutcome" ADD COLUMN     "essentialContent" TEXT;

-- AlterTable
ALTER TABLE "ReferenceDocument" ADD COLUMN     "extractedJson" JSONB,
ADD COLUMN     "extractionWarnings" JSONB,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedBy" TEXT,
ADD COLUMN     "sourceMeta" JSONB,
ADD COLUMN     "status" "ReferenceDocumentStatus" NOT NULL DEFAULT 'UPLOADED';

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedBy" TEXT,
ADD COLUMN     "specIssue" TEXT,
ADD COLUMN     "specVersionLabel" TEXT,
ADD COLUMN     "status" "RecordStatus" NOT NULL DEFAULT 'DRAFT';
