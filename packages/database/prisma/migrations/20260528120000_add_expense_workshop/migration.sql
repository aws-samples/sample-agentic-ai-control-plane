-- CreateTable
CREATE TABLE "expense" (
    "id" TEXT NOT NULL,
    "submitter_email" TEXT NOT NULL,
    "submitter_name" TEXT NOT NULL,
    "submitter_department" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_submitter_email_idx" ON "expense"("submitter_email");

-- CreateIndex
CREATE INDEX "expense_submitter_department_idx" ON "expense"("submitter_department");

-- CreateIndex
CREATE INDEX "expense_status_idx" ON "expense"("status");
