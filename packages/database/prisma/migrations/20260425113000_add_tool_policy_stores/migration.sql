-- CreateTable
CREATE TABLE "ToolPolicyStore" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "namespace" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "aws_policy_store_id" TEXT,
    "aws_policy_store_arn" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CREATING',
    "validation_mode" TEXT NOT NULL DEFAULT 'OFF',
    "schema_json" JSONB,
    "schema_sync_status" TEXT NOT NULL DEFAULT 'unsynced',
    "last_schema_synced_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "ToolPolicyStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolPolicy" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "cedar_code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "action" TEXT NOT NULL DEFAULT '',
    "principal_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resource_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "context_fields" JSONB NOT NULL DEFAULT '[]',
    "library_policy_id" TEXT,
    "template_link_id" TEXT,
    "aws_policy_id" TEXT,
    "aws_policy_arn" TEXT,
    "aws_status" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "last_synced_cedar_hash" TEXT,
    "sync_status" TEXT NOT NULL DEFAULT 'unsynced',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolPolicyTemplate" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "cedar_statement" TEXT NOT NULL,
    "aws_template_id" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "last_synced_hash" TEXT,
    "sync_status" TEXT NOT NULL DEFAULT 'unsynced',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolPolicyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolSyncBatch" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "triggered_by_id" TEXT,

    CONSTRAINT "ToolSyncBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolSyncEvent" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "tool_policy_id" TEXT,
    "action" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "aws_request_id" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ToolPolicyStore_aws_policy_store_id_key" ON "ToolPolicyStore"("aws_policy_store_id");

-- CreateIndex
CREATE INDEX "ToolPolicyStore_created_by_id_idx" ON "ToolPolicyStore"("created_by_id");

-- CreateIndex
CREATE INDEX "ToolPolicyStore_status_idx" ON "ToolPolicyStore"("status");

-- CreateIndex
CREATE INDEX "ToolPolicy_store_id_idx" ON "ToolPolicy"("store_id");

-- CreateIndex
CREATE INDEX "ToolPolicy_library_policy_id_idx" ON "ToolPolicy"("library_policy_id");

-- CreateIndex
CREATE INDEX "ToolPolicy_template_link_id_idx" ON "ToolPolicy"("template_link_id");

-- CreateIndex
CREATE INDEX "ToolPolicy_aws_policy_id_idx" ON "ToolPolicy"("aws_policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "ToolPolicy_store_id_name_key" ON "ToolPolicy"("store_id", "name");

-- CreateIndex
CREATE INDEX "ToolPolicyTemplate_store_id_idx" ON "ToolPolicyTemplate"("store_id");

-- CreateIndex
CREATE INDEX "ToolPolicyTemplate_aws_template_id_idx" ON "ToolPolicyTemplate"("aws_template_id");

-- CreateIndex
CREATE UNIQUE INDEX "ToolPolicyTemplate_store_id_name_key" ON "ToolPolicyTemplate"("store_id", "name");

-- CreateIndex
CREATE INDEX "ToolSyncBatch_store_id_started_at_idx" ON "ToolSyncBatch"("store_id", "started_at");

-- CreateIndex
CREATE INDEX "ToolSyncEvent_store_id_created_at_idx" ON "ToolSyncEvent"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "ToolSyncEvent_batch_id_idx" ON "ToolSyncEvent"("batch_id");

-- AddForeignKey
ALTER TABLE "ToolPolicyStore" ADD CONSTRAINT "ToolPolicyStore_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolPolicy" ADD CONSTRAINT "ToolPolicy_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "ToolPolicyStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolPolicy" ADD CONSTRAINT "ToolPolicy_library_policy_id_fkey" FOREIGN KEY ("library_policy_id") REFERENCES "Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolPolicy" ADD CONSTRAINT "ToolPolicy_template_link_id_fkey" FOREIGN KEY ("template_link_id") REFERENCES "ToolPolicyTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolPolicy" ADD CONSTRAINT "ToolPolicy_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolPolicyTemplate" ADD CONSTRAINT "ToolPolicyTemplate_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "ToolPolicyStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolSyncBatch" ADD CONSTRAINT "ToolSyncBatch_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "ToolPolicyStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolSyncBatch" ADD CONSTRAINT "ToolSyncBatch_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolSyncEvent" ADD CONSTRAINT "ToolSyncEvent_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "ToolPolicyStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolSyncEvent" ADD CONSTRAINT "ToolSyncEvent_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "ToolSyncBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolSyncEvent" ADD CONSTRAINT "ToolSyncEvent_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
