import {
  CreatePolicyCommand,
  DeletePolicyCommand,
  GetPolicyCommand,
  UpdatePolicyCommand,
} from "@aws-sdk/client-verifiedpermissions";
import { ORPCError } from "@orpc/server";
import { prisma } from "@package/database";
import { z } from "zod";
import { authed } from "../../context";
import {
  avpClient,
  ContextFieldSchema,
  extractAwsError,
  mapAwsError,
  PolicyStatusSchema,
  PolicyTypeSchema,
  serializePolicy,
  sha256,
  SyncStatusSchema,
  ToolPolicySchema,
} from "./_shared";

// Lists all policies in a store, newest first.
export const listToolPolicies = authed
  .route({
    method: "GET",
    path: "/tool-policy-stores/policies/list",
    tags: ["tool-policy-stores"],
  })
  .input(z.object({ storeId: z.string().min(1) }))
  .output(z.object({ policies: z.array(ToolPolicySchema) }))
  .handler(async ({ input }) => {
    const policies = await prisma.toolPolicy.findMany({
      where: { storeId: input.storeId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        libraryPolicy: { select: { id: true, name: true } },
      },
    });
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      policies: policies.map((p: any) => serializePolicy(p)),
    };
  });

// Fetches one policy scoped to its store; 404s if not found.
export const getToolPolicy = authed
  .route({
    method: "GET",
    path: "/tool-policy-stores/policies/get",
    tags: ["tool-policy-stores"],
  })
  .input(
    z.object({
      storeId: z.string().min(1),
      policyId: z.string().min(1),
    }),
  )
  .output(z.object({ policy: ToolPolicySchema }))
  .handler(async ({ input }) => {
    const policy = await prisma.toolPolicy.findFirst({
      where: { id: input.policyId, storeId: input.storeId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        libraryPolicy: { select: { id: true, name: true } },
      },
    });
    if (!policy) {
      throw new ORPCError("NOT_FOUND", { message: "Tool policy not found" });
    }
    return { policy: serializePolicy(policy) };
  });

const PolicyShapeFields = {
  action: z.string().max(255).default(""),
  principalTypes: z.array(z.string()).default([]),
  resourceTypes: z.array(z.string()).default([]),
  contextFields: z.array(ContextFieldSchema).default([]),
};

// Creates a standalone (not library-linked) policy in unsynced state.
export const createToolPolicyStandalone = authed
  .route({
    method: "POST",
    path: "/tool-policy-stores/policies/create",
    tags: ["tool-policy-stores"],
  })
  .input(
    z.object({
      storeId: z.string().min(1),
      name: z.string().min(1).max(255),
      description: z.string().max(2048).default(""),
      cedarCode: z.string().default(""),
      type: PolicyTypeSchema,
      status: PolicyStatusSchema.default("draft"),
      ...PolicyShapeFields,
    }),
  )
  .output(z.object({ policy: ToolPolicySchema }))
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
    const created = await prisma.toolPolicy.create({
      data: {
        storeId: input.storeId,
        name: input.name,
        description: input.description,
        cedarCode: input.cedarCode,
        type: input.type,
        status: input.status,
        action: input.action,
        principalTypes: input.principalTypes,
        resourceTypes: input.resourceTypes,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contextFields: input.contextFields as any,
        syncStatus: "unsynced",
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        libraryPolicy: { select: { id: true, name: true } },
      },
    });
    return { policy: serializePolicy(created) };
  });

// Imports a library policy into a store, substituting ?principal/?resource
// template slots with the provided entity bindings.
export const createToolPolicyFromLibrary = authed
  .route({
    method: "POST",
    path: "/tool-policy-stores/policies/import",
    tags: ["tool-policy-stores"],
  })
  .input(
    z.object({
      storeId: z.string().min(1),
      libraryPolicyId: z.string().min(1),
      name: z.string().min(1).max(255).optional(),
      status: PolicyStatusSchema.default("draft"),
      action: z.string().max(255).default(""),
      principalTypes: z.array(z.string()).default([]),
      resourceTypes: z.array(z.string()).default([]),
      contextFields: z.array(ContextFieldSchema).default([]),
      slotBindings: z
        .object({
          principal: z
            .object({
              entityType: z.string().min(1),
              entityId: z.string().min(1),
            })
            .optional(),
          resource: z
            .object({
              entityType: z.string().min(1),
              entityId: z.string().min(1),
            })
            .optional(),
        })
        .optional(),
    }),
  )
  .output(z.object({ policy: ToolPolicySchema }))
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

    const source = await prisma.policy.findUnique({
      where: { id: input.libraryPolicyId },
    });
    if (!source) {
      throw new ORPCError("NOT_FOUND", {
        message: "Library policy not found",
      });
    }

    let cedarCode = source.cedarCode;
    const hasPrincipalSlot = cedarCode.includes("?principal");
    const hasResourceSlot = cedarCode.includes("?resource");
    if (source.isTemplate || hasPrincipalSlot || hasResourceSlot) {
      const { principal, resource } = input.slotBindings ?? {};
      if (hasPrincipalSlot && !principal) {
        throw new ORPCError("BAD_REQUEST", {
          message: "principal binding is required for this template",
        });
      }
      if (hasResourceSlot && !resource) {
        throw new ORPCError("BAD_REQUEST", {
          message: "resource binding is required for this template",
        });
      }
      if (principal && hasPrincipalSlot) {
        cedarCode = cedarCode.replaceAll(
          "?principal",
          `${principal.entityType}::"${principal.entityId}"`,
        );
      }
      if (resource && hasResourceSlot) {
        cedarCode = cedarCode.replaceAll(
          "?resource",
          `${resource.entityType}::"${resource.entityId}"`,
        );
      }
    }

    const name = (input.name ?? source.name).trim();
    const created = await prisma.toolPolicy.create({
      data: {
        storeId: input.storeId,
        name,
        description: source.description,
        cedarCode,
        type: source.type,
        status: input.status,
        action: input.action,
        principalTypes: input.principalTypes,
        resourceTypes: input.resourceTypes,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contextFields: input.contextFields as any,
        libraryPolicyId: source.id,
        syncStatus: "unsynced",
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        libraryPolicy: { select: { id: true, name: true } },
      },
    });
    return { policy: serializePolicy(created) };
  });

// Updates a policy's editable fields, flipping syncStatus to unsynced when the
// Cedar code actually changes.
export const updateToolPolicy = authed
  .route({
    method: "PATCH",
    path: "/tool-policy-stores/policies/update",
    tags: ["tool-policy-stores"],
  })
  .input(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(2048).optional(),
      cedarCode: z.string().optional(),
      status: PolicyStatusSchema.optional(),
      action: z.string().max(255).optional(),
      principalTypes: z.array(z.string()).optional(),
      resourceTypes: z.array(z.string()).optional(),
      contextFields: z.array(ContextFieldSchema).optional(),
    }),
  )
  .output(z.object({ policy: ToolPolicySchema }))
  .handler(async ({ input }) => {
    const existing = await prisma.toolPolicy.findUnique({
      where: { id: input.id },
    });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Tool policy not found" });
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.cedarCode !== undefined) {
      data.cedarCode = input.cedarCode;
      if (input.cedarCode !== existing.cedarCode) {
        data.syncStatus = "unsynced";
      }
    }
    if (input.status !== undefined) data.status = input.status;
    if (input.action !== undefined) data.action = input.action;
    if (input.principalTypes !== undefined)
      data.principalTypes = input.principalTypes;
    if (input.resourceTypes !== undefined)
      data.resourceTypes = input.resourceTypes;
    if (input.contextFields !== undefined)
      data.contextFields = input.contextFields;

    const updated = await prisma.toolPolicy.update({
      where: { id: input.id },
      data,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        libraryPolicy: { select: { id: true, name: true } },
      },
    });
    return { policy: serializePolicy(updated) };
  });

// Deletes the policy in AVP (if synced) and locally, recording a sync event.
export const deleteToolPolicy = authed
  .route({
    method: "DELETE",
    path: "/tool-policy-stores/policies/delete",
    tags: ["tool-policy-stores"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const existing = await prisma.toolPolicy.findUnique({
      where: { id: input.id },
      include: { store: true },
    });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Tool policy not found" });
    }

    if (existing.awsPolicyId && existing.store.awsPolicyStoreId) {
      try {
        const response = await avpClient.send(
          new DeletePolicyCommand({
            policyStoreId: existing.store.awsPolicyStoreId,
            policyId: existing.awsPolicyId,
          }),
        );
        await prisma.toolSyncEvent.create({
          data: {
            storeId: existing.storeId,
            toolPolicyId: existing.id,
            action: "delete",
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
            toolPolicyId: existing.id,
            action: "delete",
            success: false,
            errorMessage: info.message,
            awsRequestId: info.requestId,
            actorId: userId,
          },
        });
        throw mapAwsError(err, "Failed to delete policy on AWS");
      }
    }

    await prisma.toolPolicy.delete({ where: { id: input.id } });
    return { success: true };
  });

// ── Sync primitives (push + drift) ───────────────────────────────────────────

type SyncOutcome = {
  success: boolean;
  awsRequestId?: string;
  errorMessage?: string;
};

// Creates or updates the policy's static definition in AVP and records the
// synced hash; returns a SyncOutcome instead of throwing.
export async function pushToolPolicyToAws(
  toolPolicyId: string,
): Promise<SyncOutcome> {
  const tp = await prisma.toolPolicy.findUnique({
    where: { id: toolPolicyId },
    include: { store: true },
  });
  if (!tp) {
    return { success: false, errorMessage: "Tool policy missing" };
  }
  if (!tp.store.awsPolicyStoreId) {
    return {
      success: false,
      errorMessage: "Parent store has not been created on AWS yet",
    };
  }

  try {
    let awsPolicyId = tp.awsPolicyId;
    let awsPolicyArn = tp.awsPolicyArn;
    let awsRequestId: string | undefined;

    if (!awsPolicyId) {
      const response = await avpClient.send(
        new CreatePolicyCommand({
          policyStoreId: tp.store.awsPolicyStoreId,
          definition: {
            static: {
              statement: tp.cedarCode,
              description: tp.description || undefined,
            },
          },
        }),
      );
      awsPolicyId = response.policyId ?? null;
      awsPolicyArn = null;
      awsRequestId = response.$metadata?.requestId;
    } else {
      const response = await avpClient.send(
        new UpdatePolicyCommand({
          policyStoreId: tp.store.awsPolicyStoreId,
          policyId: awsPolicyId,
          definition: {
            static: {
              statement: tp.cedarCode,
              description: tp.description || undefined,
            },
          },
        }),
      );
      awsRequestId = response.$metadata?.requestId;
    }

    await prisma.toolPolicy.update({
      where: { id: tp.id },
      data: {
        awsPolicyId,
        awsPolicyArn,
        lastSyncedAt: new Date(),
        lastSyncedCedarHash: sha256(tp.cedarCode),
        syncStatus: "in_sync",
      },
    });
    return { success: true, awsRequestId };
  } catch (err) {
    const info = extractAwsError(err);
    await prisma.toolPolicy.update({
      where: { id: tp.id },
      data: { syncStatus: "failed" },
    });
    return {
      success: false,
      errorMessage: info.message,
      awsRequestId: info.requestId,
    };
  }
}

// Compares the remote AVP Cedar against the last-synced hash and marks the
// policy drifted on mismatch; returns a SyncOutcome instead of throwing.
export async function detectToolPolicyDriftInternal(
  toolPolicyId: string,
): Promise<SyncOutcome> {
  const tp = await prisma.toolPolicy.findUnique({
    where: { id: toolPolicyId },
    include: { store: true },
  });
  if (!tp || !tp.awsPolicyId || !tp.store.awsPolicyStoreId) {
    return { success: true };
  }
  try {
    const response = await avpClient.send(
      new GetPolicyCommand({
        policyStoreId: tp.store.awsPolicyStoreId,
        policyId: tp.awsPolicyId,
      }),
    );
    const remoteCedar =
      response.definition?.static?.statement ?? "";
    const remoteHash = sha256(remoteCedar);
    const localHash = tp.lastSyncedCedarHash;
    if (localHash && remoteHash !== localHash) {
      await prisma.toolPolicy.update({
        where: { id: tp.id },
        data: { syncStatus: "drifted" },
      });
    }
    return { success: true, awsRequestId: response.$metadata?.requestId };
  } catch (err) {
    const info = extractAwsError(err);
    return {
      success: false,
      errorMessage: info.message,
      awsRequestId: info.requestId,
    };
  }
}

// Runs drift detection for one policy and returns its refreshed sync status.
export const detectToolPolicyDrift = authed
  .route({
    method: "POST",
    path: "/tool-policy-stores/policies/detect-drift",
    tags: ["tool-policy-stores"],
  })
  .input(z.object({ toolPolicyId: z.string().min(1) }))
  .output(z.object({ syncStatus: SyncStatusSchema }))
  .handler(async ({ input }) => {
    const tp = await prisma.toolPolicy.findUnique({
      where: { id: input.toolPolicyId },
    });
    if (!tp) {
      throw new ORPCError("NOT_FOUND", { message: "Tool policy not found" });
    }
    await detectToolPolicyDriftInternal(tp.id);
    const refreshed = await prisma.toolPolicy.findUnique({
      where: { id: tp.id },
    });
    return {
      syncStatus: (refreshed?.syncStatus ?? "unsynced") as z.infer<
        typeof SyncStatusSchema
      >,
    };
  });
