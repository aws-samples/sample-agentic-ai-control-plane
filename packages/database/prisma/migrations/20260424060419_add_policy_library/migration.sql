-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "cedar_code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "export_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyVersion" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "cedar_code" TEXT NOT NULL,
    "change_note" TEXT NOT NULL DEFAULT '',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyActivityEvent" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actor_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedPolicy" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "policy_engine_id" TEXT NOT NULL,
    "policy_engine_arn" TEXT NOT NULL,
    "principal_entity_type" TEXT NOT NULL,
    "principal_entity_id" TEXT NOT NULL,
    "resource_entity_type" TEXT NOT NULL,
    "resource_entity_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Policy_created_by_id_idx" ON "Policy"("created_by_id");

-- CreateIndex
CREATE INDEX "Policy_status_idx" ON "Policy"("status");

-- CreateIndex
CREATE INDEX "PolicyVersion_policy_id_idx" ON "PolicyVersion"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyVersion_policy_id_version_key" ON "PolicyVersion"("policy_id", "version");

-- CreateIndex
CREATE INDEX "PolicyActivityEvent_policy_id_created_at_idx" ON "PolicyActivityEvent"("policy_id", "created_at");

-- CreateIndex
CREATE INDEX "LinkedPolicy_policy_id_idx" ON "LinkedPolicy"("policy_id");

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyActivityEvent" ADD CONSTRAINT "PolicyActivityEvent_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyActivityEvent" ADD CONSTRAINT "PolicyActivityEvent_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedPolicy" ADD CONSTRAINT "LinkedPolicy_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
