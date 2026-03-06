-- CreateTable
CREATE TABLE "ContactLead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organization" TEXT,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'landing-page',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "emailDeliveryProvider" TEXT,
    "emailDeliveryId" TEXT,
    "emailDeliveredAt" TIMESTAMP(3),
    "emailDeliveryError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactLead_createdAt_idx" ON "ContactLead"("createdAt");

-- CreateIndex
CREATE INDEX "ContactLead_source_createdAt_idx" ON "ContactLead"("source", "createdAt");

-- CreateIndex
CREATE INDEX "ContactLead_email_createdAt_idx" ON "ContactLead"("email", "createdAt");
