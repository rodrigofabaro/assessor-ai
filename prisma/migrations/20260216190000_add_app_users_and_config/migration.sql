-- Create app-level users for audit attribution and future auth integration.
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");
CREATE INDEX "AppUser_isActive_idx" ON "AppUser"("isActive");

-- Singleton app config row to hold current actor and branding timestamps.
CREATE TABLE "AppConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "activeAuditUserId" TEXT,
    "faviconUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AppConfig"
ADD CONSTRAINT "AppConfig_activeAuditUserId_fkey"
FOREIGN KEY ("activeAuditUserId") REFERENCES "AppUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AppConfig" ("id", "createdAt", "updatedAt")
VALUES (1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
