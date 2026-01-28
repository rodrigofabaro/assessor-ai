/*
  Warnings:

  - Made the column `fullName` on table `Student` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "courseName" TEXT,
ADD COLUMN     "programShortName" TEXT,
ADD COLUMN     "programStatus" TEXT,
ADD COLUMN     "registrationEndAt" TIMESTAMP(3),
ADD COLUMN     "registrationStartAt" TIMESTAMP(3),
ALTER COLUMN "fullName" SET NOT NULL;
