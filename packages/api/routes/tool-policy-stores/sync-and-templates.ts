import {
  CreatePolicyTemplateCommand,
  DeletePolicyTemplateCommand,
  UpdatePolicyTemplateCommand,
} from "@aws-sdk/client-verifiedpermissions";
import { ORPCError } from "@orpc/server";
import { prisma } from "@package/database";
import { z } from "zod";
import { authed } from "../../context";
import {
  avpClient,
  extractAwsError,
  mapAwsError,
  serializeBatch,
  serializeEvent,
  serializeTemplate,
  sha256,
  ToolPolicyTemplateSchema,
  ToolSyncBatchSchema,
  ToolSyncEventSchema,
} from "./_shared";
import {
  detectToolPolicyDriftInternal,
  pushToolPolicyToAws,
} from "./policies";

// ── Sync endpoints ───────────────────────────────────────────────────────────

// Pushes a single policy to AVP within a one-item sync batch, re-checks drift,
// and returns the closed batch plus the sync event.
export const syncToolPolicy = authed
  .route({
    method: "POST",
    path: "/tool-policy-stores/policies/sync",
    tags: ["tool-policy-stores"],
  })
  .input(z.object({ toolPolicyId: z.string().min(1) }))
  .output(
    z.object({
      batch: ToolSyncBatchSchema,
      event: ToolSyncEventSchema,
    }),
  )
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const tp = await prisma.toolPolicy.findUnique({
      where: { id: input.toolPolicyId },
    });
    if (!tp) {
      throw new ORPCError("NOT_FOUND", { message: "Tool policy not found" });
    }

    await prisma.toolPolicy.update({
      where: { id: tp.id },
      data: { syncStatus: "pending" },
    });

    const batch = await prisma.toolSyncBatch.create({
      data: {
        storeId: tp.storeId,
        scope: "policy",
        totalCount: 1,
        triggeredById: userId,
      },
    });

    const outcome = await pushToolPolicyToAws(tp.id);
    const event = await prisma.toolSyncEvent.create({
      data: {
        storeId: tp.storeId,
        batchId: batch.id,
        toolPolicyId: tp.id,
        action: tp.awsPolicyId ? "update" : "create",
        success: outcome.success,
        errorMessage: outcome.errorMessage,
        awsRequestId: outcome.awsRequestId,
        actorId: userId,
      },
    });

    if (outcome.success) {
      await detectToolPolicyDriftInternal(tp.id);
    }

    const closed = await prisma.toolSyncBatch.update({
      where: { id: batch.id },
      data: {
        completedAt: new Date(),
        successCount: outcome.success ? 1 : 0,
        failureCount: outcome.success ? 0 : 1,
      },
      include: {
        triggeredBy: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      batch: serializeBatch(closed),
      event: serializeEvent({ ...event, toolPolicy: tp }),
    };
  });

// Pushes every policy in a store to AVP within one sync batch, logging an event
// per policy and returning the closed batch with success/failure counts.
export const syncToolStore = authed
  .route({
    method: "POST",
    path: "/tool-policy-stores/sync",
    tags: ["tool-policy-stores"],
  })
  .input(z.object({ storeId: z.string().min(1) }))
  .output(z.object({ batch: ToolSyncBatchSchema }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const store = await prisma.toolPolicyStore.findUnique({
      where: { id: input.storeId },
      include: { policies: { select: { id: true } } },
    });
    if (!store) {
      throw new ORPCError("NOT_FOUND", {
        message: "Tool policy store not found",
      });
    }

    const children = store.policies;
    const batch = await prisma.toolSyncBatch.create({
      data: {
        storeId: store.id,
        scope: "store",
        totalCount: children.length,
        triggeredById: userId,
      },
    });

    let success = 0;
    let failure = 0;

    for (const child of children) {
      await prisma.toolPolicy.update({
        where: { id: child.id },
        data: { syncStatus: "pending" },
      });
      const tp = await prisma.toolPolicy.findUnique({
        where: { id: child.id },
      });
      const action = tp?.awsPolicyId ? "update" : "create";
      const outcome = await pushToolPolicyToAws(child.id);
      await prisma.toolSyncEvent.create({
        data: {
          storeId: store.id,
          batchId: batch.id,
          toolPolicyId: child.id,
          action,
          success: outcome.success,
          errorMessage: outcome.errorMessage,
          awsRequestId: outcome.awsRequestId,
          actorId: userId,
        },
      });
      if (outcome.success) {
        success += 1;
        await detectToolPolicyDriftInternal(child.id);
      } else {
        failure += 1;
      }
    }

    const closed = await prisma.toolSyncBatch.update({
      where: { id: batch.id },
      data: {
        completedAt: new Date(),
        successCount: success,
        failureCount: failure,
      },
      include: {
        triggeredBy: { select: { id: true, name: true, email: true } },
      },
    });
    return { batch: serializeBatch(closed) };
  });

// ── Templates ────────────────────────────────────────────────────────────────

// Lists a store's policy templates, newest first.
export const listToolPolicyTemplates = authed
  .route({
    method: "GET",
    path: "/tool-policy-stores/templates/list",
    tags: ["tool-policy-stores"],
  })
  .input(z.object({ storeId: z.string().min(1) }))
  .output(z.object({ templates: z.array(ToolPolicyTemplateSchema) }))
  .handler(async ({ input }) => {
    const templates = await prisma.toolPolicyTemplate.findMany({
      where: { storeId: input.storeId },
      orderBy: { createdAt: "desc" },
    });
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      templates: templates.map((t: any) => serializeTemplate(t)),
    };
  });

// Creates a policy template locally and in AVP; rolls back the local row if the
// AWS call fails.
export const createToolPolicyTemplate = authed
  .route({
    method: "POST",
    path: "/tool-policy-stores/templates/create",
    tags: ["tool-policy-stores"],
  })
  .input(
    z.object({
      storeId: z.string().min(1),
      name: z.string().min(1).max(255),
      description: z.string().max(2048).default(""),
      cedarStatement: z.string().min(1),
    }),
  )
  .output(z.object({ template: ToolPolicyTemplateSchema }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const store = await prisma.toolPolicyStore.findUnique({
      where: { id: input.storeId },
    });
    if (!store) {
      throw new ORPCError("NOT_FOUND", {
        message: "Tool policy store not found",
      });
    }
    if (!store.awsPolicyStoreId) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Store has not been created in AWS yet",
      });
    }

    const template = await prisma.toolPolicyTemplate.create({
      data: {
        storeId: input.storeId,
        name: input.name,
        description: input.description,
        cedarStatement: input.cedarStatement,
        syncStatus: "pending",
      },
    });

    try {
      const response = await avpClient.send(
        new CreatePolicyTemplateCommand({
          policyStoreId: store.awsPolicyStoreId,
          description: input.description || undefined,
          statement: input.cedarStatement,
        }),
      );
      const updated = await prisma.toolPolicyTemplate.update({
        where: { id: template.id },
        data: {
          awsTemplateId: response.policyTemplateId,
          lastSyncedAt: new Date(),
          lastSyncedHash: sha256(input.cedarStatement),
          syncStatus: "in_sync",
        },
      });
      await prisma.toolSyncEvent.create({
        data: {
          storeId: input.storeId,
          action: "template_create",
          success: true,
          awsRequestId: response.$metadata?.requestId,
          actorId: userId,
        },
      });
      return { template: serializeTemplate(updated) };
    } catch (err) {
      const info = extractAwsError(err);
      await prisma.toolPolicyTemplate.delete({ where: { id: template.id } });
      await prisma.toolSyncEvent.create({
        data: {
          storeId: input.storeId,
          action: "template_create",
          success: false,
          errorMessage: info.message,
          awsRequestId: info.requestId,
          actorId: userId,
        },
      });
      throw mapAwsError(err, "Failed to create policy template");
    }
  });

// Updates a template's statement/description in AVP and locally; requires the
// template to already be synced to AWS.
export const updateToolPolicyTemplate = authed
  .route({
    method: "PATCH",
    path: "/tool-policy-stores/templates/update",
    tags: ["tool-policy-stores"],
  })
  .input(
    z.object({
      id: z.string().min(1),
      description: z.string().max(2048).optional(),
      cedarStatement: z.string().optional(),
    }),
  )
  .output(z.object({ template: ToolPolicyTemplateSchema }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const existing = await prisma.toolPolicyTemplate.findUnique({
      where: { id: input.id },
      include: { store: true },
    });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Tool policy template not found",
      });
    }
    if (!existing.awsTemplateId || !existing.store.awsPolicyStoreId) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Template has not been synced to AWS yet",
      });
    }

    const statement = input.cedarStatement ?? existing.cedarStatement;
    try {
      const response = await avpClient.send(
        new UpdatePolicyTemplateCommand({
          policyStoreId: existing.store.awsPolicyStoreId,
          policyTemplateId: existing.awsTemplateId,
          description:
            input.description !== undefined ? input.description : undefined,
          statement,
        }),
      );
      const updated = await prisma.toolPolicyTemplate.update({
        where: { id: input.id },
        data: {
          description:
            input.description !== undefined
              ? input.description
              : existing.description,
          cedarStatement: statement,
          lastSyncedAt: new Date(),
          lastSyncedHash: sha256(statement),
          syncStatus: "in_sync",
        },
      });
      await prisma.toolSyncEvent.create({
        data: {
          storeId: existing.storeId,
          action: "template_update",
          success: true,
          awsRequestId: response.$metadata?.requestId,
          actorId: userId,
        },
      });
      return { template: serializeTemplate(updated) };
    } catch (err) {
      const info = extractAwsError(err);
      await prisma.toolPolicyTemplate.update({
        where: { id: input.id },
        data: { syncStatus: "failed" },
      });
      await prisma.toolSyncEvent.create({
        data: {
          storeId: existing.storeId,
          action: "template_update",
          success: false,
          errorMessage: info.message,
          awsRequestId: info.requestId,
          actorId: userId,
        },
      });
      throw mapAwsError(err, "Failed to update policy template");
    }
  });

// Deletes a template in AVP (if synced) and locally, recording a sync event.
export const deleteToolPolicyTemplate = authed
  .route({
    method: "DELETE",
    path: "/tool-policy-stores/templates/delete",
    tags: ["tool-policy-stores"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const existing = await prisma.toolPolicyTemplate.findUnique({
      where: { id: input.id },
      include: { store: true },
    });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Tool policy template not found",
      });
    }

    if (existing.awsTemplateId && existing.store.awsPolicyStoreId) {
      try {
        const response = await avpClient.send(
          new DeletePolicyTemplateCommand({
            policyStoreId: existing.store.awsPolicyStoreId,
            policyTemplateId: existing.awsTemplateId,
          }),
        );
        await prisma.toolSyncEvent.create({
          data: {
            storeId: existing.storeId,
            action: "template_delete",
            success: true,
            awsRequestId: response.$metadata?.requestId,
            actorId: userId,
          },
        });
      } catch (err) {
        const info = extractAwsError(err);
        await prisma.toolSyncEvent.create({
          data: {
            storeId: existing.storeId,
            action: "template_delete",
            success: false,
            errorMessage: info.message,
            awsRequestId: info.requestId,
            actorId: userId,
          },
        });
        throw mapAwsError(err, "Failed to delete template on AWS");
      }
    }

    await prisma.toolPolicyTemplate.delete({ where: { id: input.id } });
    return { success: true };
  });

// ── Sync history ─────────────────────────────────────────────────────────────

// Lists a store's recent sync batches (most recent first, capped by limit).
export const listToolSyncBatches = authed
  .route({
    method: "GET",
    path: "/tool-policy-stores/sync/batches",
    tags: ["tool-policy-stores"],
  })
  .input(
    z.object({
      storeId: z.string().min(1),
      limit: z.number().int().min(1).max(100).default(25),
    }),
  )
  .output(z.object({ batches: z.array(ToolSyncBatchSchema) }))
  .handler(async ({ input }) => {
    const batches = await prisma.toolSyncBatch.findMany({
      where: { storeId: input.storeId },
      orderBy: { startedAt: "desc" },
      take: input.limit,
      include: {
        triggeredBy: { select: { id: true, name: true, email: true } },
      },
    });
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      batches: batches.map((b: any) => serializeBatch(b)),
    };
  });

// Lists a store's sync events (optionally filtered by batch/policy), backfilling
// each event's tool-policy name.
export const listToolSyncEvents = authed
  .route({
    method: "GET",
    path: "/tool-policy-stores/sync/events",
    tags: ["tool-policy-stores"],
  })
  .input(
    z.object({
      storeId: z.string().min(1),
      batchId: z.string().optional(),
      toolPolicyId: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }),
  )
  .output(z.object({ events: z.array(ToolSyncEventSchema) }))
  .handler(async ({ input }) => {
    const where: Record<string, unknown> = { storeId: input.storeId };
    if (input.batchId) where.batchId = input.batchId;
    if (input.toolPolicyId) where.toolPolicyId = input.toolPolicyId;

    const events = await prisma.toolSyncEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: input.limit,
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
    });

    const policyIds = Array.from(
      new Set(
        events
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((e: any) => e.toolPolicyId)
          .filter((x: string | null): x is string => !!x),
      ),
    );
    const policies = policyIds.length
      ? await prisma.toolPolicy.findMany({
          where: { id: { in: policyIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      policies.map((p: any) => [p.id as string, p.name as string]),
    );

    return {
      events: events.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e: any) =>
          serializeEvent({
            ...e,
            toolPolicy: e.toolPolicyId
              ? { name: nameById.get(e.toolPolicyId) ?? null }
              : undefined,
          }),
      ),
    };
  });
