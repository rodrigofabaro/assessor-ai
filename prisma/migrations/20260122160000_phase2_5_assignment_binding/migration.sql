-- Phase 2.5: Assignment ↔ locked reference binding fields
ALTER TABLE "Assignment"
ADD COLUMN     "bindingStatus" "RecordStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "bindingLockedAt" TIMESTAMP(3),
ADD COLUMN     "bindingLockedBy" TEXT;
