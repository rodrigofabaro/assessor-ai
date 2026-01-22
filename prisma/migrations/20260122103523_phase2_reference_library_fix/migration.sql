-- CreateEnum
CREATE TYPE "ReferenceDocumentType" AS ENUM ('SPEC', 'BRIEF', 'RUBRIC');

-- CreateEnum
CREATE TYPE "GradeBand" AS ENUM ('PASS', 'MERIT', 'DISTINCTION');

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "assignmentBriefId" TEXT;

-- CreateTable
CREATE TABLE "ReferenceDocument" (
    "id" TEXT NOT NULL,
    "type" "ReferenceDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "originalFilename" TEXT NOT NULL,
    "storedFilename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "unitCode" TEXT NOT NULL,
    "unitTitle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "specDocumentId" TEXT,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningOutcome" (
    "id" TEXT NOT NULL,
    "loCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "LearningOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentCriterion" (
    "id" TEXT NOT NULL,
    "acCode" TEXT NOT NULL,
    "gradeBand" "GradeBand" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "learningOutcomeId" TEXT NOT NULL,

    CONSTRAINT "AssessmentCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentBrief" (
    "id" TEXT NOT NULL,
    "assignmentCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "unitId" TEXT NOT NULL,
    "briefDocumentId" TEXT,

    CONSTRAINT "AssignmentBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentCriterionMap" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignmentBriefId" TEXT NOT NULL,
    "assessmentCriterionId" TEXT NOT NULL,

    CONSTRAINT "AssignmentCriterionMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LearningOutcome_unitId_loCode_key" ON "LearningOutcome"("unitId", "loCode");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentCriterion_learningOutcomeId_acCode_key" ON "AssessmentCriterion"("learningOutcomeId", "acCode");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentBrief_unitId_assignmentCode_key" ON "AssignmentBrief"("unitId", "assignmentCode");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentCriterionMap_assignmentBriefId_assessmentCriterio_key" ON "AssignmentCriterionMap"("assignmentBriefId", "assessmentCriterionId");

-- CreateIndex
CREATE INDEX "Assignment_assignmentBriefId_idx" ON "Assignment"("assignmentBriefId");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assignmentBriefId_fkey" FOREIGN KEY ("assignmentBriefId") REFERENCES "AssignmentBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_specDocumentId_fkey" FOREIGN KEY ("specDocumentId") REFERENCES "ReferenceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningOutcome" ADD CONSTRAINT "LearningOutcome_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentCriterion" ADD CONSTRAINT "AssessmentCriterion_learningOutcomeId_fkey" FOREIGN KEY ("learningOutcomeId") REFERENCES "LearningOutcome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentBrief" ADD CONSTRAINT "AssignmentBrief_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentBrief" ADD CONSTRAINT "AssignmentBrief_briefDocumentId_fkey" FOREIGN KEY ("briefDocumentId") REFERENCES "ReferenceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentCriterionMap" ADD CONSTRAINT "AssignmentCriterionMap_assignmentBriefId_fkey" FOREIGN KEY ("assignmentBriefId") REFERENCES "AssignmentBrief"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentCriterionMap" ADD CONSTRAINT "AssignmentCriterionMap_assessmentCriterionId_fkey" FOREIGN KEY ("assessmentCriterionId") REFERENCES "AssessmentCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
