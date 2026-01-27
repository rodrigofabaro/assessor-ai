-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "createdFromFilename" TEXT,
ADD COLUMN     "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "triageConfidence" DOUBLE PRECISION,
ADD COLUMN     "triageSignals" JSONB;

-- CreateIndex
CREATE INDEX "Assignment_unitCode_assignmentRef_idx" ON "Assignment"("unitCode", "assignmentRef");
