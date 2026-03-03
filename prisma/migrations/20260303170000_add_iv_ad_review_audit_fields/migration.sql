-- Add IV-AD review draft approval + snapshot persistence
ALTER TABLE "IvAdDocument"
  ADD COLUMN IF NOT EXISTS "reviewDraftJson" JSONB,
  ADD COLUMN IF NOT EXISTS "reviewDraftApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reviewDraftApprovedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewDraftApprovedAt" TIMESTAMP(3);
