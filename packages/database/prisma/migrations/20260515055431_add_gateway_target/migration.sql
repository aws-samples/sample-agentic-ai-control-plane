-- CreateTable
CREATE TABLE "gateway_target" (
    "id" TEXT NOT NULL,
    "registry_record_id" TEXT NOT NULL,
    "registry_arn" TEXT NOT NULL,
    "aws_gateway_id" TEXT NOT NULL,
    "aws_target_id" TEXT,
    "aws_target_arn" TEXT,
    "target_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATING',
    "status_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gateway_target_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gateway_target_registry_record_id_key" ON "gateway_target"("registry_record_id");

-- CreateIndex
CREATE INDEX "gateway_target_aws_gateway_id_idx" ON "gateway_target"("aws_gateway_id");

-- CreateIndex
CREATE INDEX "gateway_target_status_idx" ON "gateway_target"("status");
