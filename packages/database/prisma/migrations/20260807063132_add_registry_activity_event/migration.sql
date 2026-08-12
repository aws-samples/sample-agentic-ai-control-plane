-- CreateTable
CREATE TABLE "registry_activity_event" (
    "id" TEXT NOT NULL,
    "registry_id" TEXT NOT NULL,
    "record_id" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actor_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registry_activity_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registry_activity_event_registry_id_record_id_created_at_idx" ON "registry_activity_event"("registry_id", "record_id", "created_at");

-- AddForeignKey
ALTER TABLE "registry_activity_event" ADD CONSTRAINT "registry_activity_event_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
