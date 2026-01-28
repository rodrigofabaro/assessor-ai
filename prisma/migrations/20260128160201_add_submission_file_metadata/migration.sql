-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "sourceLastModifiedAt" TIMESTAMP(3);
