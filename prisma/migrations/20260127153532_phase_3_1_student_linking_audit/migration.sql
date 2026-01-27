/*
  Warnings:

  - You are about to drop the column `name` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `studentRef` on the `Student` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[externalRef]` on the table `Student` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('STUDENT_LINKED', 'STUDENT_UNLINKED');

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "name",
DROP COLUMN "studentRef",
ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "fullName" TEXT;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "extractedTextHash" TEXT,
ADD COLUMN     "extractionVersion" TEXT,
ADD COLUMN     "studentLinkedAt" TIMESTAMP(3),
ADD COLUMN     "studentLinkedBy" TEXT;

-- CreateTable
CREATE TABLE "SubmissionAuditEvent" (
    "id" TEXT NOT NULL,
    "type" "AuditEventType" NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,
    "submissionId" TEXT NOT NULL,

    CONSTRAINT "SubmissionAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubmissionAuditEvent_submissionId_idx" ON "SubmissionAuditEvent"("submissionId");

-- CreateIndex
CREATE INDEX "SubmissionAuditEvent_type_idx" ON "SubmissionAuditEvent"("type");

-- CreateIndex
CREATE INDEX "SubmissionAuditEvent_actor_idx" ON "SubmissionAuditEvent"("actor");

-- CreateIndex
CREATE UNIQUE INDEX "Student_externalRef_key" ON "Student"("externalRef");

-- AddForeignKey
ALTER TABLE "SubmissionAuditEvent" ADD CONSTRAINT "SubmissionAuditEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
