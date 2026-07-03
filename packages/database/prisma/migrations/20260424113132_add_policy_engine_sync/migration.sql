-- CreateTable
CREATE TABLE "PolicyEngine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "aws_policy_engine_id" TEXT,
    "aws_policy_engine_arn" TEXT,
    "region" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATING',
    "status_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "PolicyEngine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnginePolicy" (
    "id" TEXT NOT NULL,
    "engine_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "cedar_code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "library_policy_id" TEXT,
    "aws_policy_id" TEXT,
    "aws_policy_arn" TEXT,
    "aws_status" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "last_synced_cedar_hash" TEXT,
    "sync_status" TEXT NOT NULL DEFAULT 'unsynced',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnginePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayAttachment" (
    "id" TEXT NOT NULL,
    "engine_id" TEXT NOT NULL,
    "aws_gateway_id" TEXT NOT NULL,
    "aws_gateway_arn" TEXT NOT NULL,
    "gateway_name" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatewayAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncBatch" (
    "id" TEXT NOT NULL,
    "engine_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "triggered_by_id" TEXT,

    CONSTRAINT "SyncBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL,
    "engine_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "engine_policy_id" TEXT,
    "action" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "aws_request_id" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PolicyEngine_aws_policy_engine_id_key" ON "PolicyEngine"("aws_policy_engine_id");

-- CreateIndex
CREATE INDEX "PolicyEngine_created_by_id_idx" ON "PolicyEngine"("created_by_id");

-- CreateIndex
CREATE INDEX "PolicyEngine_status_idx" ON "PolicyEngine"("status");

-- CreateIndex
CREATE INDEX "EnginePolicy_engine_id_idx" ON "EnginePolicy"("engine_id");

-- CreateIndex
CREATE INDEX "EnginePolicy_library_policy_id_idx" ON "EnginePolicy"("library_policy_id");

-- CreateIndex
CREATE INDEX "EnginePolicy_aws_policy_id_idx" ON "EnginePolicy"("aws_policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "EnginePolicy_engine_id_name_key" ON "EnginePolicy"("engine_id", "name");

-- CreateIndex
CREATE INDEX "GatewayAttachment_engine_id_idx" ON "GatewayAttachment"("engine_id");

-- CreateIndex
CREATE UNIQUE INDEX "GatewayAttachment_engine_id_aws_gateway_id_key" ON "GatewayAttachment"("engine_id", "aws_gateway_id");

-- CreateIndex
CREATE INDEX "SyncBatch_engine_id_started_at_idx" ON "SyncBatch"("engine_id", "started_at");

-- CreateIndex
CREATE INDEX "SyncEvent_engine_id_created_at_idx" ON "SyncEvent"("engine_id", "created_at");

-- CreateIndex
CREATE INDEX "SyncEvent_batch_id_idx" ON "SyncEvent"("batch_id");

-- AddForeignKey
ALTER TABLE "PolicyEngine" ADD CONSTRAINT "PolicyEngine_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnginePolicy" ADD CONSTRAINT "EnginePolicy_engine_id_fkey" FOREIGN KEY ("engine_id") REFERENCES "PolicyEngine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnginePolicy" ADD CONSTRAINT "EnginePolicy_library_policy_id_fkey" FOREIGN KEY ("library_policy_id") REFERENCES "Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnginePolicy" ADD CONSTRAINT "EnginePolicy_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayAttachment" ADD CONSTRAINT "GatewayAttachment_engine_id_fkey" FOREIGN KEY ("engine_id") REFERENCES "PolicyEngine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncBatch" ADD CONSTRAINT "SyncBatch_engine_id_fkey" FOREIGN KEY ("engine_id") REFERENCES "PolicyEngine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncBatch" ADD CONSTRAINT "SyncBatch_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_engine_id_fkey" FOREIGN KEY ("engine_id") REFERENCES "PolicyEngine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "SyncBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
