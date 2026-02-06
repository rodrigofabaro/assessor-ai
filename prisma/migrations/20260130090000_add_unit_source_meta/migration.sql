-- Add sourceMeta to support archive flags on units
ALTER TABLE "Unit" ADD COLUMN "sourceMeta" JSONB;
