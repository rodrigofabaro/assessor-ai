-- AlterTable
ALTER TABLE "AppConfig"
ADD COLUMN "openaiModelConfig" JSONB,
ADD COLUMN "gradingConfig" JSONB;
