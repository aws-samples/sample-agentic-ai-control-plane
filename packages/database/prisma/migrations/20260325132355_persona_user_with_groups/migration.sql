/*
  Warnings:

  - You are about to drop the column `type` on the `Persona` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Persona" DROP COLUMN "type",
ADD COLUMN     "groups" JSONB NOT NULL DEFAULT '[]';
