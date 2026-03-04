DO $$ BEGIN
  CREATE TYPE "PlatformRole" AS ENUM ('USER', 'SUPER_ADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OrganizationRole" AS ENUM ('ORG_ADMIN', 'ASSESSOR', 'IV', 'VIEWER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "AppUser"
ADD COLUMN IF NOT EXISTS "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

CREATE TABLE IF NOT EXISTS "OrganizationMembership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "role" "OrganizationRole" NOT NULL DEFAULT 'ASSESSOR',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrganizationSetting" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrganizationSecret" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "secretName" TEXT NOT NULL,
  "encryptedValue" TEXT NOT NULL,
  "meta" JSONB,
  "rotatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationSecret_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationMembership_userId_organizationId_key"
ON "OrganizationMembership"("userId", "organizationId");
CREATE INDEX IF NOT EXISTS "OrganizationMembership_organizationId_isActive_idx"
ON "OrganizationMembership"("organizationId", "isActive");
CREATE INDEX IF NOT EXISTS "OrganizationMembership_userId_isActive_idx"
ON "OrganizationMembership"("userId", "isActive");
CREATE INDEX IF NOT EXISTS "OrganizationMembership_userId_isDefault_idx"
ON "OrganizationMembership"("userId", "isDefault");

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationSetting_organizationId_key"
ON "OrganizationSetting"("organizationId");

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationSecret_organizationId_secretName_key"
ON "OrganizationSecret"("organizationId", "secretName");
CREATE INDEX IF NOT EXISTS "OrganizationSecret_organizationId_idx"
ON "OrganizationSecret"("organizationId");

DO $$ BEGIN
  ALTER TABLE "OrganizationMembership"
  ADD CONSTRAINT "OrganizationMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "OrganizationMembership"
  ADD CONSTRAINT "OrganizationMembership_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "OrganizationSetting"
  ADD CONSTRAINT "OrganizationSetting_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "OrganizationSecret"
  ADD CONSTRAINT "OrganizationSecret_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

INSERT INTO "OrganizationMembership" (
  "id",
  "userId",
  "organizationId",
  "role",
  "isDefault",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  'om_' || substr(md5(random()::text || clock_timestamp()::text || u."id"), 1, 24),
  u."id",
  u."organizationId",
  CASE
    WHEN upper(COALESCE(u."role", '')) = 'ADMIN' THEN 'ORG_ADMIN'::"OrganizationRole"
    WHEN upper(COALESCE(u."role", '')) = 'IV' THEN 'IV'::"OrganizationRole"
    ELSE 'ASSESSOR'::"OrganizationRole"
  END,
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "AppUser" u
WHERE u."organizationId" IS NOT NULL
ON CONFLICT ("userId", "organizationId") DO NOTHING;

WITH "missingDefault" AS (
  SELECT "userId", min("id") AS "membershipId"
  FROM "OrganizationMembership"
  GROUP BY "userId"
  HAVING bool_or("isDefault") = false
)
UPDATE "OrganizationMembership" m
SET "isDefault" = true
FROM "missingDefault" d
WHERE m."id" = d."membershipId";

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "AppUser" WHERE "platformRole" = 'SUPER_ADMIN') THEN
    UPDATE "AppUser"
    SET "platformRole" = 'SUPER_ADMIN'
    WHERE "id" = (
      SELECT "id"
      FROM "AppUser"
      WHERE upper(COALESCE("role", '')) = 'ADMIN'
      ORDER BY "createdAt" ASC
      LIMIT 1
    );
  END IF;
END $$;
