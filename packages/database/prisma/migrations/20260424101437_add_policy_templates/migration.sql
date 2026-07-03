-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "is_template" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parent_template_id" TEXT;

-- CreateIndex
CREATE INDEX "Policy_is_template_idx" ON "Policy"("is_template");

-- CreateIndex
CREATE INDEX "Policy_parent_template_id_idx" ON "Policy"("parent_template_id");

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_parent_template_id_fkey" FOREIGN KEY ("parent_template_id") REFERENCES "Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
