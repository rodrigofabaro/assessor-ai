ALTER TABLE "AppUser"
ADD COLUMN "loginEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "loginPasswordHash" TEXT,
ADD COLUMN "passwordUpdatedAt" TIMESTAMP(3);

CREATE INDEX "AppUser_loginEnabled_idx" ON "AppUser"("loginEnabled");
