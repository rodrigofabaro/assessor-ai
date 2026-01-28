/*
  Warnings:

  - You are about to drop the column `programShortName` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `programStatus` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `registrationEndAt` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `registrationStartAt` on the `Student` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Student" DROP COLUMN "programShortName",
DROP COLUMN "programStatus",
DROP COLUMN "registrationEndAt",
DROP COLUMN "registrationStartAt",
ADD COLUMN     "registrationDate" TIMESTAMP(3);
