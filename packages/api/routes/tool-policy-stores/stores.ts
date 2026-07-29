import {
  CreatePolicyStoreCommand,
  DeletePolicyStoreCommand,
  GetPolicyStoreCommand,
  GetSchemaCommand,
  PutSchemaCommand,
  UpdatePolicyStoreCommand,
} from "@aws-sdk/client-verifiedpermissions";
import { ORPCError } from "@orpc/server";
import { prisma } from "@package/database";
import { z } from "zod";
import { authed } from "../../context";
import {
  avpClient,
  avpOwnerTags,
  extractAwsError,
  mapAwsError,
  REGION,
  serializeStore,
  sha256,
  StoreStatusSchema,
  SyncStatusSchema,
  ToolPolicyStoreSchema,
  ValidationModeSchema,
} from "./_shared";

// Lists active (non-archived) policy stores, each enriched with policy count,
// drifted-policy count, and the most recent policy sync time.
export const listToolPolicyStores = authed
  .route({
    method: "GET",
    path: "/tool-policy-stores/list",
    tags: ["tool-policy-stores"],
  })
  .input(z.object({}).optional())
  .output(z.object({ stores: z.array(ToolPolicyStoreSchema) }))
  .handler(async () => {
    const stores = await prisma.toolPolicyStore.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { policies: true } },
      },
    });

    const driftedCounts = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stores.map((s: any) =>
        prisma.toolPolicy.count({
          where: { storeId: s.id, syncStatus: "drifted" },
        }),
      ),
    );

    const lastSynced = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stores.map((s: any) =>
        prisma.toolPolicy.findFirst({
          where: { storeId: s.id, lastSyncedAt: { not: null } },
          orderBy: { lastSyncedAt: "desc" },
          select: { lastSyncedAt: true },
        }),
      ),
    );

    return {
      stores: stores.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any, i: number) =>
          serializeStore({
            ...s,
            driftedCount: driftedCounts[i],
            lastSyncedAt: lastSynced[i]?.lastSyncedAt ?? null,
          }),
      ),
    };
  });

// Fetches one policy store by id with policy count, drifted count, and last
// sync time; 404s if not found.
export const getToolPolicyStore = authed
  .route({
    method: "GET",
    path: "/tool-policy-stores/get",
    tags: ["tool-policy-stores"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ store: ToolPolicyStoreSchema }))
  .handler(async ({ input }) => {
    const store = await prisma.toolPolicyStore.findUnique({
      where: { id: input.id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { policies: true } },
      },
    });
    if (!store) {
      throw new ORPCError("NOT_FOUND", {
        message: "Tool policy store not found",
      });
    }
    const driftedCount = await prisma.toolPolicy.count({
      where: { storeId: store.id, syncStatus: "drifted" },
    });
    const lastSynced = await prisma.toolPolicy.findFirst({
      where: { storeId: store.id, lastSyncedAt: { not: null } },
      orderBy: { lastSyncedAt: "desc" },
      select: { lastSyncedAt: true },
    });
    return {
      store: serializeStore({
        ...store,
        driftedCount,
        lastSyncedAt: lastSynced?.lastSyncedAt ?? null,
      }),
    };
  });

// Creates a local store row then the backing AVP policy store, marking it
// ACTIVE; rolls back the row if the AWS call fails.
export const createToolPolicyStore = authed
  .route({
    method: "POST",
    path: "/tool-policy-stores/create",
    tags: ["tool-policy-stores"],
  })
  .input(
    z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(2048).default(""),
      namespace: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[A-Z][A-Za-z0-9_]*$/, {
          message:
            "Namespace must start with an uppercase letter and contain only letters, numbers, or underscores.",
        }),
      region: z.string().min(1).default(REGION),
      validationMode: ValidationModeSchema.default("OFF"),
    }),
  )
  .output(z.object({ store: ToolPolicyStoreSchema }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;

    const store = await prisma.toolPolicyStore.create({
      data: {
        name: input.name,
        description: input.description,
        namespace: input.namespace,
        region: input.region,
        validationMode: input.validationMode,
        status: "CREATING",
        createdById: userId,
      },
    });

    try {
      const response = await avpClient.send(
        new CreatePolicyStoreCommand({
          description: input.description || undefined,
          validationSettings: { mode: input.validationMode },
          // Stamp the ownership tag so the task role's tag-scoped IAM policy
          // permits this create and every later operation on the store.
          tags: avpOwnerTags(),
        }),
      );

      const updated = await prisma.toolPolicyStore.update({
        where: { id: store.id },
        data: {
          awsPolicyStoreId: response.policyStoreId,
          awsPolicyStoreArn: response.arn,
          status: "ACTIVE",
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { policies: true } },
        },
      });

      await prisma.toolSyncEvent.create({
        data: {
          storeId: store.id,
          action: "store_create",
          success: true,
          awsRequestId: response.$metadata?.requestId,
          actorId: userId,
        },
      });

      return {
        store: serializeStore({ ...updated, driftedCount: 0 }),
      };
    } catch (err) {
      await prisma.toolPolicyStore.delete({ where: { id: store.id } });
      throw mapAwsError(err, "Failed to create policy store");
    }
  });

// Re-reads the store's validation mode/status from AVP and syncs them into the
// local row (no-op if the store has no AWS counterpart yet).
export const refreshToolPolicyStoreStatus = authed
  .route({
    method: "POST",
    path: "/tool-policy-stores/refresh-status",
    tags: ["tool-policy-stores"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ store: ToolPolicyStoreSchema }))
  .handler(async ({ input }) => {
    const existing = await prisma.toolPolicyStore.findUnique({
      where: { id: input.id },
    });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Tool policy store not found",
      });
    }
    if (!existing.awsPolicyStoreId) {
      const refreshed = await prisma.toolPolicyStore.findUnique({
        where: { id: input.id },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { policies: true } },
        },
      });
      return { store: serializeStore(refreshed) };
    }

    try {
      const response = await avpClient.send(
        new GetPolicyStoreCommand({
          policyStoreId: existing.awsPolicyStoreId,
        }),
      );
      const updated = await prisma.toolPolicyStore.update({
        where: { id: input.id },
        data: {
          validationMode:
            response.validationSettings?.mode === "STRICT" ? "STRICT" : "OFF",
          status: "ACTIVE",
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { policies: true } },
        },
      });
      return { store: serializeStore(updated) };
    } catch (err) {
      throw mapAwsError(err, "Failed to refresh store status");
    }
  });

// Updates a store's description/validation mode in both AVP and the local row,
// recording a sync event for success or failure.
export const updateToolPolicyStore = authed
  .route({
    method: "PATCH",
    path: "/tool-policy-stores/update",
    tags: ["tool-policy-stores"],
  })
  .input(
    z.object({
      id: z.string().min(1),
      description: z.string().max(2048).optional(),
      validationMode: ValidationModeSchema.optional(),
    }),
  )
  .output(z.object({ store: ToolPolicyStoreSchema }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const existing = await prisma.toolPolicyStore.findUnique({
      where: { id: input.id },
    });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Tool policy store not found",
      });
    }
    if (!existing.awsPolicyStoreId) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Store has not been created in AWS yet",
      });
    }

    try {
      const response = await avpClient.send(
        new UpdatePolicyStoreCommand({
          policyStoreId: existing.awsPolicyStoreId,
          validationSettings: {
            mode:
              input.validationMode ??
              (existing.validationMode === "STRICT" ? "STRICT" : "OFF"),
          },
          description:
            input.description !== undefined ? input.description : undefined,
        }),
      );

      const updated = await prisma.toolPolicyStore.update({
        where: { id: input.id },
        data: {
          description:
            input.description !== undefined
              ? input.description
              : existing.description,
          validationMode: input.validationMode ?? existing.validationMode,
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { policies: true } },
        },
      });

      await prisma.toolSyncEvent.create({
        data: {
          storeId: input.id,
          action: "store_update",
          success: true,
          awsRequestId: response.$metadata?.requestId,
          actorId: userId,
        },
      });

      return { store: serializeStore(updated) };
    } catch (err) {
      const info = extractAwsError(err);
      await prisma.toolSyncEvent.create({
        data: {
          storeId: input.id,
          action: "store_update",
          success: false,
          errorMessage: info.message,
          awsRequestId: info.requestId,
          actorId: userId,
        },
      });
      throw mapAwsError(err, "Failed to update policy store");
    }
  });

// Deletes the AVP policy store and soft-archives the local row; refuses if the
// store still has policies.
export const deleteToolPolicyStore = authed
  .route({
    method: "DELETE",
    path: "/tool-policy-stores/delete",
    tags: ["tool-policy-stores"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const existing = await prisma.toolPolicyStore.findUnique({
      where: { id: input.id },
      include: { _count: { select: { policies: true } } },
    });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Tool policy store not found",
      });
    }
    if (existing._count.policies > 0) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Remove all policies from this store before deleting it.",
      });
    }

    try {
      if (existing.awsPolicyStoreId) {
        const response = await avpClient.send(
          new DeletePolicyStoreCommand({
            policyStoreId: existing.awsPolicyStoreId,
          }),
        );
        await prisma.toolSyncEvent.create({
          data: {
            storeId: input.id,
            action: "store_delete",
            success: true,
            awsRequestId: response.$metadata?.requestId,
            actorId: userId,
          },
        });
      }
      await prisma.toolPolicyStore.update({
        where: { id: input.id },
        data: { archivedAt: new Date(), status: "DELETING" },
      });
      return { success: true };
    } catch (err) {
      const info = extractAwsError(err);
      await prisma.toolSyncEvent.create({
        data: {
          storeId: input.id,
          action: "store_delete",
          success: false,
          errorMessage: info.message,
          awsRequestId: info.requestId,
          actorId: userId,
        },
      });
      throw mapAwsError(err, "Failed to delete policy store");
    }
  });

// ── Schema management ────────────────────────────────────────────────────────

// Validates and pushes a Cedar JSON schema to AVP, marking the store's schema
// in_sync (or failed) and recording a sync event.
export const putToolPolicyStoreSchema = authed
  .route({
    method: "POST",
    path: "/tool-policy-stores/schema/put",
    tags: ["tool-policy-stores"],
  })
  .input(
    z.object({
      id: z.string().min(1),
      schemaJson: z.string().min(2),
    }),
  )
  .output(z.object({ store: ToolPolicyStoreSchema }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const existing = await prisma.toolPolicyStore.findUnique({
      where: { id: input.id },
    });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Tool policy store not found",
      });
    }
    if (!existing.awsPolicyStoreId) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Store has not been created in AWS yet",
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(input.schemaJson);
    } catch {
      throw new ORPCError("BAD_REQUEST", {
        message: "schemaJson must be valid JSON",
      });
    }

    try {
      const response = await avpClient.send(
        new PutSchemaCommand({
          policyStoreId: existing.awsPolicyStoreId,
          definition: { cedarJson: input.schemaJson },
        }),
      );
      const updated = await prisma.toolPolicyStore.update({
        where: { id: input.id },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          schemaJson: parsed as any,
          schemaSyncStatus: "in_sync",
          lastSchemaSyncedAt: new Date(),
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { policies: true } },
        },
      });

      await prisma.toolSyncEvent.create({
        data: {
          storeId: input.id,
          action: "schema_put",
          success: true,
          awsRequestId: response.$metadata?.requestId,
          actorId: userId,
        },
      });

      return { store: serializeStore(updated) };
    } catch (err) {
      const info = extractAwsError(err);
      await prisma.toolPolicyStore.update({
        where: { id: input.id },
        data: { schemaSyncStatus: "failed" },
      });
      await prisma.toolSyncEvent.create({
        data: {
          storeId: input.id,
          action: "schema_put",
          success: false,
          errorMessage: info.message,
          awsRequestId: info.requestId,
          actorId: userId,
        },
      });
      throw mapAwsError(err, "Failed to put schema");
    }
  });

// Compares the local schema hash against AVP's and updates schemaSyncStatus to
// in_sync or drifted.
export const detectSchemaDrift = authed
  .route({
    method: "POST",
    path: "/tool-policy-stores/schema/detect-drift",
    tags: ["tool-policy-stores"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ schemaSyncStatus: SyncStatusSchema }))
  .handler(async ({ input }) => {
    const existing = await prisma.toolPolicyStore.findUnique({
      where: { id: input.id },
    });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Tool policy store not found",
      });
    }
    if (!existing.awsPolicyStoreId || !existing.schemaJson) {
      return { schemaSyncStatus: existing?.schemaSyncStatus as z.infer<typeof SyncStatusSchema> ?? "unsynced" };
    }
    try {
      const response = await avpClient.send(
        new GetSchemaCommand({
          policyStoreId: existing.awsPolicyStoreId,
        }),
      );
      const remote = response.schema ?? "";
      const local = JSON.stringify(existing.schemaJson);
      const status: z.infer<typeof SyncStatusSchema> =
        sha256(remote) === sha256(local) ? "in_sync" : "drifted";
      await prisma.toolPolicyStore.update({
        where: { id: input.id },
        data: { schemaSyncStatus: status },
      });
      return { schemaSyncStatus: status };
    } catch (err) {
      throw mapAwsError(err, "Failed to detect schema drift");
    }
  });

void StoreStatusSchema;
