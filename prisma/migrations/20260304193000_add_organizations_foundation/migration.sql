CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

ALTER TABLE "Student" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AppUser" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Assignment" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Submission" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "ReferenceDocument" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Unit" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "AssignmentBrief" ADD COLUMN "organizationId" TEXT;

CREATE INDEX "Student_organizationId_idx" ON "Student"("organizationId");
CREATE INDEX "AppUser_organizationId_idx" ON "AppUser"("organizationId");
CREATE INDEX "Assignment_organizationId_idx" ON "Assignment"("organizationId");
CREATE INDEX "Submission_organizationId_idx" ON "Submission"("organizationId");
CREATE INDEX "ReferenceDocument_organizationId_idx" ON "ReferenceDocument"("organizationId");
CREATE INDEX "Unit_organizationId_idx" ON "Unit"("organizationId");
CREATE INDEX "AssignmentBrief_organizationId_idx" ON "AssignmentBrief"("organizationId");

ALTER TABLE "Student" ADD CONSTRAINT "Student_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReferenceDocument" ADD CONSTRAINT "ReferenceDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssignmentBrief" ADD CONSTRAINT "AssignmentBrief_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Organization" ("id", "slug", "name", "isActive", "createdAt", "updatedAt")
SELECT 'org_default', 'default', 'Default Organization', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Organization" WHERE "slug" = 'default');

UPDATE "AppUser" SET "organizationId" = 'org_default' WHERE "organizationId" IS NULL;