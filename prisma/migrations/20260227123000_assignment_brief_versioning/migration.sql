-- Preserve historical briefs per unit+assignment while allowing a new active brief each cycle.
ALTER TABLE "AssignmentBrief"
ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "supersededAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "AssignmentBrief_unitId_assignmentCode_key";
CREATE UNIQUE INDEX IF NOT EXISTS "AssignmentBrief_unitId_assignmentCode_version_key"
ON "AssignmentBrief"("unitId", "assignmentCode", "version");

CREATE INDEX IF NOT EXISTS "AssignmentBrief_unitId_assignmentCode_status_updatedAt_idx"
ON "AssignmentBrief"("unitId", "assignmentCode", "status", "updatedAt");
