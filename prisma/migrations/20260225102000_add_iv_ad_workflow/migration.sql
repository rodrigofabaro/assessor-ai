CREATE TABLE "IvAdTemplate" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IvAdTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IvAdDocument" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "programmeTitle" TEXT NOT NULL,
    "unitCodeTitle" TEXT NOT NULL,
    "assignmentTitle" TEXT NOT NULL,
    "assessorName" TEXT NOT NULL,
    "internalVerifierName" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "keyNotes" TEXT,
    "sourceMarkedPdfPath" TEXT NOT NULL,
    "sourceBriefPdfPath" TEXT,
    "outputDocxPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IvAdDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IvAdTemplate_isActive_createdAt_idx" ON "IvAdTemplate"("isActive", "createdAt");
CREATE INDEX "IvAdDocument_templateId_createdAt_idx" ON "IvAdDocument"("templateId", "createdAt");
CREATE INDEX "IvAdDocument_createdAt_idx" ON "IvAdDocument"("createdAt");

ALTER TABLE "IvAdDocument"
ADD CONSTRAINT "IvAdDocument_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "IvAdTemplate"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
