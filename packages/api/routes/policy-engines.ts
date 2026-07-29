import { createHash } from "node:crypto";
import {
  BedrockAgentCoreControlClient,
  CreatePolicyCommand,
  CreatePolicyEngineCommand,
  DeletePolicyCommand,
  DeletePolicyEngineCommand,
  GetGatewayCommand,
  GetPolicyCommand,
  GetPolicyEngineCommand,
  ListGatewaysCommand,
  UpdateGatewayCommand,
  UpdatePolicyCommand,
  UpdatePolicyEngineCommand,
} from "@aws-sdk/client-bedrock-agentcore-control";
import { ORPCError } from "@orpc/server";
import { prisma } from "@package/database";
import { z } from "zod";
import { authed } from "../context";

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const REGION = process.env.AGENTCORE_REGION || "us-east-1";
const awsClient = new BedrockAgentCoreControlClient({ region: REGION });

// Ownership tag stamped on every policy engine this service creates. The task
// role's IAM policy (apps/infra/lib/dashboard-stack.ts) only permits acting on
// AgentCore resources carrying this tag, so CreatePolicyEngine MUST send it or
// the create — and every later operation on the engine — is denied. Key/value
// are injected by the infra stack; fallbacks keep local dev working.
const AGENTCORE_OWNER_TAG_KEY =
  process.env.AGENTCORE_OWNER_TAG_KEY || "agentic-ai-platform:managed-by";
const AGENTCORE_OWNER_TAG_VALUE =
  process.env.AGENTCORE_OWNER_TAG_VALUE || "dashboard-agentcore-sync";

const agentCoreOwnerTags = (): Record<string, string> => ({
  [AGENTCORE_OWNER_TAG_KEY]: AGENTCORE_OWNER_TAG_VALUE,
});

// ── Zod schemas ──────────────────────────────────────────────────────────────

const EngineStatusSchema = z.enum([
  "CREATING",
  "ACTIVE",
  "UPDATING",
  "DELETING",
  "CREATE_FAILED",
  "UPDATE_FAILED",
  "DELETE_FAILED",
]);

const SyncStatusSchema = z.enum([
  "unsynced",
  "in_sync",
  "drifted",
  "pending",
  "failed",
]);

const GatewayModeSchema = z.enum(["LOG_ONLY", "ENFORCE"]);
const PolicyTypeSchema = z.enum(["permit", "forbid"]);

const ActorSchema = z.object({
  id: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});

const PolicyEngineSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  awsPolicyEngineId: z.string().nullable().optional(),
  awsPolicyEngineArn: z.string().nullable().optional(),
  region: z.string(),
  status: EngineStatusSchema,
  statusReasons: z.array(z.string()),
  createdBy: ActorSchema.nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  archivedAt: z.coerce.date().nullable().optional(),
  policyCount: z.number().int().optional(),
  driftedCount: z.number().int().optional(),
  gatewayCount: z.number().int().optional(),
});

const EnginePolicySchema = z.object({
  id: z.string(),
  engineId: z.string(),
  name: z.string(),
  description: z.string(),
  cedarCode: z.string(),
  type: PolicyTypeSchema,
  libraryPolicyId: z.string().nullable().optional(),
  libraryPolicyName: z.string().nullable().optional(),
  awsPolicyId: z.string().nullable().optional(),
  awsPolicyArn: z.string().nullable().optional(),
  awsStatus: z.string().nullable().optional(),
  lastSyncedAt: z.coerce.date().nullable().optional(),
  syncStatus: SyncStatusSchema,
  createdBy: ActorSchema.nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const GatewayAttachmentSchema = z.object({
  id: z.string(),
  engineId: z.string(),
  awsGatewayId: z.string(),
  awsGatewayArn: z.string(),
  gatewayName: z.string(),
  mode: GatewayModeSchema,
  createdAt: z.coerce.date(),
});

const SyncBatchSchema = z.object({
  id: z.string(),
  engineId: z.string(),
  scope: z.enum(["engine", "policy"]),
  totalCount: z.number().int(),
  successCount: z.number().int(),
  failureCount: z.number().int(),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable().optional(),
  triggeredBy: ActorSchema.nullable().optional(),
});

const SyncEventSchema = z.object({
  id: z.string(),
  engineId: z.string(),
  batchId: z.string().nullable().optional(),
  enginePolicyId: z.string().nullable().optional(),
  enginePolicyName: z.string().nullable().optional(),
  action: z.string(),
  success: z.boolean(),
  errorMessage: z.string().nullable().optional(),
  awsRequestId: z.string().nullable().optional(),
  actor: ActorSchema.nullable().optional(),
  createdAt: z.coerce.date(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function sha256(cedar: string): string {
  return createHash("sha256").update(cedar).digest("hex");
}

type AwsErrorLike = {
  name?: string;
  message?: string;
  $metadata?: { requestId?: string };
};

// Translates an AWS SDK error into the matching ORPCError code (e.g.
// ValidationException -> BAD_REQUEST), defaulting to INTERNAL_SERVER_ERROR.
function mapAwsError(err: unknown, fallbackMessage: string): ORPCError<string, unknown> {
  const awsErr = err as AwsErrorLike;
  const message = awsErr?.message ?? fallbackMessage;
  switch (awsErr?.name) {
    case "ValidationException":
      return new ORPCError("BAD_REQUEST", { message });
    case "ConflictException":
      return new ORPCError("CONFLICT", { message });
    case "ResourceNotFoundException":
      return new ORPCError("NOT_FOUND", { message });
    case "AccessDeniedException":
      return new ORPCError("FORBIDDEN", { message });
    case "ThrottlingException":
      return new ORPCError("TOO_MANY_REQUESTS", { message });
    default:
      return new ORPCError("INTERNAL_SERVER_ERROR", { message });
  }
}

// Pulls the message and request id out of an AWS SDK error for sync-event logging.
function extractAwsError(err: unknown): { message: string; requestId?: string } {
  const awsErr = err as AwsErrorLike;
  return {
    message: awsErr?.message ?? "AWS request failed",
    requestId: awsErr?.$metadata?.requestId,
  };
}

// Maps a Prisma policy-engine row to the API PolicyEngine shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeEngine(e: any) {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    awsPolicyEngineId: e.awsPolicyEngineId,
    awsPolicyEngineArn: e.awsPolicyEngineArn,
    region: e.region,
    status: e.status as z.infer<typeof EngineStatusSchema>,
    statusReasons: e.statusReasons ?? [],
    createdBy: e.createdBy
      ? {
          id: e.createdBy.id,
          name: e.createdBy.name,
          email: e.createdBy.email,
        }
      : null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    archivedAt: e.archivedAt,
    policyCount: e._count?.policies,
    gatewayCount: e._count?.gatewayAttachments,
    driftedCount: e.driftedCount as number | undefined,
  };
}

// Maps a Prisma engine-policy row to the API EnginePolicy shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeEnginePolicy(p: any) {
  return {
    id: p.id,
    engineId: p.engineId,
    name: p.name,
    description: p.description,
    cedarCode: p.cedarCode,
    type: p.type as z.infer<typeof PolicyTypeSchema>,
    libraryPolicyId: p.libraryPolicyId,
    libraryPolicyName: p.libraryPolicy?.name ?? null,
    awsPolicyId: p.awsPolicyId,
    awsPolicyArn: p.awsPolicyArn,
    awsStatus: p.awsStatus,
    lastSyncedAt: p.lastSyncedAt,
    syncStatus: p.syncStatus as z.infer<typeof SyncStatusSchema>,
    createdBy: p.createdBy
      ? { id: p.createdBy.id, name: p.createdBy.name, email: p.createdBy.email }
      : null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// Maps a Prisma sync-batch row to the API SyncBatch shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeSyncBatch(b: any) {
  return {
    id: b.id,
    engineId: b.engineId,
    scope: b.scope as "engine" | "policy",
    totalCount: b.totalCount,
    successCount: b.successCount,
    failureCount: b.failureCount,
    startedAt: b.startedAt,
    completedAt: b.completedAt,
    triggeredBy: b.triggeredBy
      ? {
          id: b.triggeredBy.id,
          name: b.triggeredBy.name,
          email: b.triggeredBy.email,
        }
      : null,
  };
}

// Maps a Prisma sync-event row to the API SyncEvent shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeSyncEvent(e: any) {
  return {
    id: e.id,
    engineId: e.engineId,
    batchId: e.batchId,
    enginePolicyId: e.enginePolicyId,
    enginePolicyName: e.enginePolicy?.name ?? null,
    action: e.action,
    success: e.success,
    errorMessage: e.errorMessage,
    awsRequestId: e.awsRequestId,
    actor: e.actor
      ? { id: e.actor.id, name: e.actor.name, email: e.actor.email }
      : null,
    createdAt: e.createdAt,
  };
}

// ── PolicyEngine CRUD ────────────────────────────────────────────────────────

export const listPolicyEngines = authed
  .route({
    method: "GET",
    path: "/policy-engines/list",
    tags: ["policy-engines"],
  })
  .input(z.object({}).optional())
  .output(z.object({ policyEngines: z.array(PolicyEngineSchema) }))
  .handler(async () => {
    const engines = await prisma.policyEngine.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { policies: true, gatewayAttachments: true } },
      },
    });

    // Compute drifted counts in one query per engine (small N here).
    const driftedCounts = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      engines.map((e: any) =>
        prisma.enginePolicy.count({
          where: { engineId: e.id, syncStatus: "drifted" },
        }),
      ),
    );

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      policyEngines: engines.map((e: any, i: number) =>
        serializeEngine({ ...e, driftedCount: driftedCounts[i] }),
      ),
    };
  });

// Fetches one engine with its gateway attachments, policy/drift counts; 404s
// if not found.
export const getPolicyEngine = authed
  .route({
    method: "GET",
    path: "/policy-engines/get",
    tags: ["policy-engines"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(
    z.object({
      policyEngine: PolicyEngineSchema,
      gatewayAttachments: z.array(GatewayAttachmentSchema),
    }),
  )
  .handler(async ({ input }) => {
    const engine = await prisma.policyEngine.findUnique({
      where: { id: input.id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { policies: true, gatewayAttachments: true } },
        gatewayAttachments: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!engine) {
      throw new ORPCError("NOT_FOUND", { message: "Policy engine not found" });
    }
    const driftedCount = await prisma.enginePolicy.count({
      where: { engineId: engine.id, syncStatus: "drifted" },
    });
    return {
      policyEngine: serializeEngine({ ...engine, driftedCount }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gatewayAttachments: engine.gatewayAttachments.map((g: any) => ({
        id: g.id,
        engineId: g.engineId,
        awsGatewayId: g.awsGatewayId,
        awsGatewayArn: g.awsGatewayArn,
        gatewayName: g.gatewayName,
        mode: g.mode as z.infer<typeof GatewayModeSchema>,
        createdAt: g.createdAt,
      })),
    };
  });

// Creates a local engine row then the backing AVP policy engine; drops the row
// if the AWS call fails.
export const createPolicyEngine = authed
  .route({
    method: "POST",
    path: "/policy-engines/create",
    tags: ["policy-engines"],
  })
  .input(
    z.object({
      name: z
        .string()
        .min(1)
        .max(48)
        .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,47}$/, {
          message:
            "Name must start with a letter and contain only letters, numbers, or underscores (max 48 characters).",
        }),
      description: z.string().max(4096).default(""),
    }),
  )
  .output(z.object({ policyEngine: PolicyEngineSchema }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;

    // Create Prisma row first so we always have a local record even if AWS call fails.
    const engine = await prisma.policyEngine.create({
      data: {
        name: input.name,
        description: input.description,
        region: REGION,
        status: "CREATING",
        createdById: userId,
      },
    });

    try {
      const response = await awsClient.send(
        new CreatePolicyEngineCommand({
          name: input.name,
          description: input.description || undefined,
          // Stamp the ownership tag so the task role's tag-scoped IAM policy
          // permits this create and every later operation on the engine.
          tags: agentCoreOwnerTags(),
        }),
      );

      const updated = await prisma.policyEngine.update({
        where: { id: engine.id },
        data: {
          awsPolicyEngineId: response.policyEngineId,
          awsPolicyEngineArn: response.policyEngineArn,
          status: (response.status as string | undefined) ?? "ACTIVE",
          statusReasons: response.statusReasons ?? [],
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { policies: true, gatewayAttachments: true } },
        },
      });

      await prisma.syncEvent.create({
        data: {
          engineId: engine.id,
          action: "engine_create",
          success: true,
          awsRequestId: response.$metadata?.requestId,
          actorId: userId,
        },
      });

      return { policyEngine: serializeEngine({ ...updated, driftedCount: 0 }) };
    } catch (err) {
      // The AWS create failed — the engine was never actually provisioned.
      // Drop the local row so the list goes back to a clean state; the user
      // can retry by clicking Create again. No sync event is logged because
      // the engine never existed in AWS (and the row we'd attach it to is
      // about to be deleted).
      await prisma.policyEngine.delete({ where: { id: engine.id } });
      throw mapAwsError(err, "Failed to create policy engine");
    }
  });

// Re-reads the engine's status/statusReasons from AVP into the local row
// (no-op if the engine has no AWS counterpart yet).
export const refreshPolicyEngineStatus = authed
  .route({
    method: "POST",
    path: "/policy-engines/refresh-status",
    tags: ["policy-engines"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ policyEngine: PolicyEngineSchema }))
  .handler(async ({ input }) => {
    const existing = await prisma.policyEngine.findUnique({
      where: { id: input.id },
    });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Policy engine not found" });
    }
    if (!existing.awsPolicyEngineId) {
      // Engine hasn't reached AWS yet — nothing to refresh. Return as-is.
      const refreshed = await prisma.policyEngine.findUnique({
        where: { id: input.id },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { policies: true, gatewayAttachments: true } },
        },
      });
      return { policyEngine: serializeEngine(refreshed) };
    }

    try {
      const response = await awsClient.send(
        new GetPolicyEngineCommand({
          policyEngineId: existing.awsPolicyEngineId,
        }),
      );
      const updated = await prisma.policyEngine.update({
        where: { id: input.id },
        data: {
          status:
            (response.status as string | undefined) ?? existing.status,
          statusReasons: response.statusReasons ?? [],
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { policies: true, gatewayAttachments: true } },
        },
      });
      return { policyEngine: serializeEngine(updated) };
    } catch (err) {
      throw mapAwsError(err, "Failed to refresh engine status");
    }
  });

// Updates an engine's description in AVP and the local row, recording a sync
// event for success or failure.
export const updatePolicyEngine = authed
  .route({
    method: "PATCH",
    path: "/policy-engines/update",
    tags: ["policy-engines"],
  })
  .input(
    z.object({
      id: z.string().min(1),
      description: z.string().max(4096).optional(),
    }),
  )
  .output(z.object({ policyEngine: PolicyEngineSchema }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const existing = await prisma.policyEngine.findUnique({
      where: { id: input.id },
    });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Policy engine not found" });
    }
    if (!existing.awsPolicyEngineId) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Engine has not been created in AWS yet",
      });
    }

    try {
      const response = await awsClient.send(
        new UpdatePolicyEngineCommand({
          policyEngineId: existing.awsPolicyEngineId,
          description:
            input.description !== undefined
              ? { optionalValue: input.description }
              : undefined,
        }),
      );

      const updated = await prisma.policyEngine.update({
        where: { id: input.id },
        data: {
          description:
            input.description !== undefined
              ? input.description
              : existing.description,
          status: (response.status as string | undefined) ?? existing.status,
          statusReasons: response.statusReasons ?? existing.statusReasons,
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { policies: true, gatewayAttachments: true } },
        },
      });

      await prisma.syncEvent.create({
        data: {
          engineId: input.id,
          action: "engine_update",
          success: true,
          awsRequestId: response.$metadata?.requestId,
          actorId: userId,
        },
      });

      return { policyEngine: serializeEngine(updated) };
    } catch (err) {
      const info = extractAwsError(err);
      await prisma.syncEvent.create({
        data: {
          engineId: input.id,
          action: "engine_update",
          success: false,
          errorMessage: info.message,
          awsRequestId: info.requestId,
          actorId: userId,
        },
      });
      throw mapAwsError(err, "Failed to update policy engine");
    }
  });

// Deletes the AVP engine and soft-archives the local row; refuses if the engine
// still has policies.
export const deletePolicyEngine = authed
  .route({
    method: "DELETE",
    path: "/policy-engines/delete",
    tags: ["policy-engines"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const existing = await prisma.policyEngine.findUnique({
      where: { id: input.id },
      include: { _count: { select: { policies: true } } },
    });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Policy engine not found" });
    }
    if (existing._count.policies > 0) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Remove all policies from this engine before deleting it. AWS refuses to delete engines with policies.",
      });
    }

    try {
      if (existing.awsPolicyEngineId) {
        const response = await awsClient.send(
          new DeletePolicyEngineCommand({
            policyEngineId: existing.awsPolicyEngineId,
          }),
        );
        await prisma.syncEvent.create({
          data: {
            engineId: input.id,
            action: "engine_delete",
            success: true,
            awsRequestId: response.$metadata?.requestId,
            actorId: userId,
          },
        });
      }
      await prisma.policyEngine.update({
        where: { id: input.id },
        data: { archivedAt: new Date(), status: "DELETING" },
      });
      return { success: true };
    } catch (err) {
      const info = extractAwsError(err);
      await prisma.syncEvent.create({
        data: {
          engineId: input.id,
          action: "engine_delete",
          success: false,
          errorMessage: info.message,
          awsRequestId: info.requestId,
          actorId: userId,
        },
      });
      throw mapAwsError(err, "Failed to delete policy engine");
    }
  });

// ── EnginePolicy CRUD ────────────────────────────────────────────────────────

export const listEnginePolicies = authed
  .route({
    method: "GET",
    path: "/policy-engines/policies/list",
    tags: ["policy-engines"],
  })
  .input(z.object({ engineId: z.string().min(1) }))
  .output(z.object({ policies: z.array(EnginePolicySchema) }))
  .handler(async ({ input }) => {
    const policies = await prisma.enginePolicy.findMany({
      where: { engineId: input.engineId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        libraryPolicy: { select: { id: true, name: true } },
      },
    });
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      policies: policies.map((p: any) => serializeEnginePolicy(p)),
    };
  });

// Fetches one engine policy scoped to its engine; 404s if not found.
export const getEnginePolicy = authed
  .route({
    method: "GET",
    path: "/policy-engines/policies/get",
    tags: ["policy-engines"],
  })
  .input(
    z.object({
      engineId: z.string().min(1),
      policyId: z.string().min(1),
    }),
  )
  .output(z.object({ policy: EnginePolicySchema }))
  .handler(async ({ input }) => {
    const policy = await prisma.enginePolicy.findFirst({
      where: { id: input.policyId, engineId: input.engineId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        libraryPolicy: { select: { id: true, name: true } },
      },
    });
    if (!policy) {
      throw new ORPCError("NOT_FOUND", { message: "Engine policy not found" });
    }
    return { policy: serializeEnginePolicy(policy) };
  });

// Imports a library policy into an engine, substituting ?principal/?resource
// template slots with the provided entity bindings.
export const createEnginePolicyFromLibrary = authed
  .route({
    method: "POST",
    path: "/policy-engines/policies/import",
    tags: ["policy-engines"],
  })
  .input(
    z.object({
      engineId: z.string().min(1),
      libraryPolicyId: z.string().min(1),
      name: z.string().min(1).max(255).optional(),
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
  .output(z.object({ policy: EnginePolicySchema }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;

    const engine = await prisma.policyEngine.findUnique({
      where: { id: input.engineId },
    });
    if (!engine) {
      throw new ORPCError("NOT_FOUND", { message: "Policy engine not found" });
    }

    const source = await prisma.policy.findUnique({
      where: { id: input.libraryPolicyId },
    });
    if (!source) {
      throw new ORPCError("NOT_FOUND", {
        message: "Library policy not found",
      });
    }

    // Resolve template slots if the source is a template and bindings were provided.
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
    const created = await prisma.enginePolicy.create({
      data: {
        engineId: input.engineId,
        name,
        description: source.description,
        cedarCode,
        type: source.type,
        libraryPolicyId: source.id,
        syncStatus: "unsynced",
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        libraryPolicy: { select: { id: true, name: true } },
      },
    });
    return { policy: serializeEnginePolicy(created) };
  });

// Creates a standalone (not library-linked) engine policy in unsynced state.
export const createEnginePolicyStandalone = authed
  .route({
    method: "POST",
    path: "/policy-engines/policies/create",
    tags: ["policy-engines"],
  })
  .input(
    z.object({
      engineId: z.string().min(1),
      name: z.string().min(1).max(255),
      description: z.string().max(2048).default(""),
      cedarCode: z.string().default(""),
      type: PolicyTypeSchema,
    }),
  )
  .output(z.object({ policy: EnginePolicySchema }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const engine = await prisma.policyEngine.findUnique({
      where: { id: input.engineId },
    });
    if (!engine) {
      throw new ORPCError("NOT_FOUND", { message: "Policy engine not found" });
    }
    const created = await prisma.enginePolicy.create({
      data: {
        engineId: input.engineId,
        name: input.name,
        description: input.description,
        cedarCode: input.cedarCode,
        type: input.type,
        syncStatus: "unsynced",
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        libraryPolicy: { select: { id: true, name: true } },
      },
    });
    return { policy: serializeEnginePolicy(created) };
  });

// Updates an engine policy's editable fields, flipping syncStatus to unsynced
// when the Cedar code actually changes.
export const updateEnginePolicy = authed
  .route({
    method: "PATCH",
    path: "/policy-engines/policies/update",
    tags: ["policy-engines"],
  })
  .input(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(2048).optional(),
      cedarCode: z.string().optional(),
    }),
  )
  .output(z.object({ policy: EnginePolicySchema }))
  .handler(async ({ input }) => {
    const existing = await prisma.enginePolicy.findUnique({
      where: { id: input.id },
    });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Engine policy not found" });
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

    const updated = await prisma.enginePolicy.update({
      where: { id: input.id },
      data,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        libraryPolicy: { select: { id: true, name: true } },
      },
    });
    return { policy: serializeEnginePolicy(updated) };
  });

// Deletes the policy in AVP (if synced) and locally, recording a sync event.
export const deleteEnginePolicy = authed
  .route({
    method: "DELETE",
    path: "/policy-engines/policies/delete",
    tags: ["policy-engines"],
  })
  .input(z.object({ id: z.string().min(1) }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const existing = await prisma.enginePolicy.findUnique({
      where: { id: input.id },
      include: { engine: true },
    });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: "Engine policy not found" });
    }

    // If the policy exists on AWS, delete it remotely first.
    if (existing.awsPolicyId && existing.engine.awsPolicyEngineId) {
      try {
        const response = await awsClient.send(
          new DeletePolicyCommand({
            policyEngineId: existing.engine.awsPolicyEngineId,
            policyId: existing.awsPolicyId,
          }),
        );
        await prisma.syncEvent.create({
          data: {
            engineId: existing.engineId,
            enginePolicyId: existing.id,
            action: "delete",
            success: true,
            awsRequestId: response.$metadata?.requestId,
            actorId: userId,
          },
        });
      } catch (err) {
        const info = extractAwsError(err);
        await prisma.syncEvent.create({
          data: {
            engineId: existing.engineId,
            enginePolicyId: existing.id,
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

    await prisma.enginePolicy.delete({ where: { id: input.id } });
    return { success: true };
  });

// ── Sync: single-policy push + drift ─────────────────────────────────────────

type SyncOutcome = {
  success: boolean;
  awsRequestId?: string;
  errorMessage?: string;
};

// Creates or updates the policy's Cedar definition in AVP and records the
// synced hash; returns a SyncOutcome instead of throwing.
async function pushPolicyToAws(
  enginePolicyId: string,
): Promise<SyncOutcome> {
  const ep = await prisma.enginePolicy.findUnique({
    where: { id: enginePolicyId },
    include: { engine: true },
  });
  if (!ep) {
    return { success: false, errorMessage: "Engine policy missing" };
  }
  if (!ep.engine.awsPolicyEngineId) {
    return {
      success: false,
      errorMessage: "Parent engine has not been created on AWS yet",
    };
  }

  try {
    let awsPolicyId = ep.awsPolicyId;
    let awsPolicyArn = ep.awsPolicyArn;
    let awsStatus: string | undefined;
    let awsRequestId: string | undefined;

    if (!awsPolicyId) {
      const response = await awsClient.send(
        new CreatePolicyCommand({
          policyEngineId: ep.engine.awsPolicyEngineId,
          name: ep.name,
          description: ep.description || undefined,
          definition: { cedar: { statement: ep.cedarCode } },
          // Structural "Overly Restrictive" / "Allow All" findings block
          // FAIL_ON_ANY_FINDINGS (the default) even when the policy is
          // correct at runtime — e.g. a `forbid` scoped by principal+action
          // is flagged DENY_ALL though it only fires for the intended group.
          validationMode: "IGNORE_ALL_FINDINGS",
        }),
      );
      awsPolicyId = response.policyId ?? null;
      awsPolicyArn = response.policyArn ?? null;
      awsStatus = response.status as string | undefined;
      awsRequestId = response.$metadata?.requestId;
    } else {
      try {
        const response = await awsClient.send(
          new UpdatePolicyCommand({
            policyEngineId: ep.engine.awsPolicyEngineId,
            policyId: awsPolicyId,
            definition: { cedar: { statement: ep.cedarCode } },
            // AWS enforces 1–4096 chars when the field is present. The DB
            // column defaults to "" which would fail validation — only send
            // the description wrapper when we actually have text to pass.
            description: ep.description
              ? { optionalValue: ep.description }
              : undefined,
            validationMode: "IGNORE_ALL_FINDINGS",
          }),
        );
        awsPolicyArn = response.policyArn ?? awsPolicyArn;
        awsStatus = response.status as string | undefined;
        awsRequestId = response.$metadata?.requestId;
      } catch (err) {
        // Self-heal DB/AWS drift: the row has a stored awsPolicyId, but the
        // policy no longer exists in AWS (e.g. the engine was recreated, or the
        // policy was deleted out-of-band, or the DB was seeded from another
        // account). UpdatePolicy then fails with ResourceNotFoundException
        // ("Policy with ID … not found"). Recover by recreating the policy
        // instead of leaving the row permanently unsyncable.
        if ((err as { name?: string }).name !== "ResourceNotFoundException") {
          throw err;
        }
        const response = await awsClient.send(
          new CreatePolicyCommand({
            policyEngineId: ep.engine.awsPolicyEngineId,
            name: ep.name,
            description: ep.description || undefined,
            definition: { cedar: { statement: ep.cedarCode } },
            validationMode: "IGNORE_ALL_FINDINGS",
          }),
        );
        awsPolicyId = response.policyId ?? null;
        awsPolicyArn = response.policyArn ?? null;
        awsStatus = response.status as string | undefined;
        awsRequestId = response.$metadata?.requestId;
      }
    }

    await prisma.enginePolicy.update({
      where: { id: ep.id },
      data: {
        awsPolicyId,
        awsPolicyArn,
        awsStatus,
        lastSyncedAt: new Date(),
        lastSyncedCedarHash: sha256(ep.cedarCode),
        syncStatus: "in_sync",
      },
    });

    return { success: true, awsRequestId };
  } catch (err) {
    const info = extractAwsError(err);
    await prisma.enginePolicy.update({
      where: { id: ep.id },
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
async function detectDriftInternal(
  enginePolicyId: string,
): Promise<SyncOutcome> {
  const ep = await prisma.enginePolicy.findUnique({
    where: { id: enginePolicyId },
    include: { engine: true },
  });
  if (!ep || !ep.awsPolicyId || !ep.engine.awsPolicyEngineId) {
    return { success: true };
  }
  try {
    const response = await awsClient.send(
      new GetPolicyCommand({
        policyEngineId: ep.engine.awsPolicyEngineId,
        policyId: ep.awsPolicyId,
      }),
    );
    const remoteCedar = response.definition?.cedar?.statement ?? "";
    const remoteHash = sha256(remoteCedar);
    const localHash = ep.lastSyncedCedarHash;

    if (localHash && remoteHash !== localHash) {
      await prisma.enginePolicy.update({
        where: { id: ep.id },
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

// Pushes a single engine policy to AVP within a one-item sync batch, re-checks
// drift, and returns the closed batch plus the sync event.
export const syncPolicy = authed
  .route({
    method: "POST",
    path: "/policy-engines/policies/sync",
    tags: ["policy-engines"],
  })
  .input(z.object({ enginePolicyId: z.string().min(1) }))
  .output(
    z.object({
      batch: SyncBatchSchema,
      event: SyncEventSchema,
    }),
  )
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const ep = await prisma.enginePolicy.findUnique({
      where: { id: input.enginePolicyId },
    });
    if (!ep) {
      throw new ORPCError("NOT_FOUND", { message: "Engine policy not found" });
    }

    await prisma.enginePolicy.update({
      where: { id: ep.id },
      data: { syncStatus: "pending" },
    });

    const batch = await prisma.syncBatch.create({
      data: {
        engineId: ep.engineId,
        scope: "policy",
        totalCount: 1,
        triggeredById: userId,
      },
    });

    const outcome = await pushPolicyToAws(ep.id);
    const updatedPolicy = await prisma.enginePolicy.findUnique({
      where: { id: ep.id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        libraryPolicy: { select: { id: true, name: true } },
      },
    });
    const event = await prisma.syncEvent.create({
      data: {
        engineId: ep.engineId,
        batchId: batch.id,
        enginePolicyId: ep.id,
        action: ep.awsPolicyId ? "update" : "create",
        success: outcome.success,
        errorMessage: outcome.errorMessage,
        awsRequestId: outcome.awsRequestId,
        actorId: userId,
      },
      include: {
        actor: { select: { id: true, name: true, email: true } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });

    // Drift detection after a successful push
    if (outcome.success) {
      await detectDriftInternal(ep.id);
    }

    const closed = await prisma.syncBatch.update({
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

    void updatedPolicy;
    return {
      batch: serializeSyncBatch(closed),
      event: serializeSyncEvent({ ...event, enginePolicy: ep }),
    };
  });

// Pushes every policy in an engine to AVP within one sync batch, logging an
// event per policy and returning the closed batch with success/failure counts.
export const syncEngine = authed
  .route({
    method: "POST",
    path: "/policy-engines/sync",
    tags: ["policy-engines"],
  })
  .input(z.object({ engineId: z.string().min(1) }))
  .output(z.object({ batch: SyncBatchSchema }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const engine = await prisma.policyEngine.findUnique({
      where: { id: input.engineId },
      include: { policies: { select: { id: true } } },
    });
    if (!engine) {
      throw new ORPCError("NOT_FOUND", { message: "Policy engine not found" });
    }

    const children = engine.policies;
    const batch = await prisma.syncBatch.create({
      data: {
        engineId: engine.id,
        scope: "engine",
        totalCount: children.length,
        triggeredById: userId,
      },
    });

    let success = 0;
    let failure = 0;

    for (const child of children) {
      await prisma.enginePolicy.update({
        where: { id: child.id },
        data: { syncStatus: "pending" },
      });
      const ep = await prisma.enginePolicy.findUnique({
        where: { id: child.id },
      });
      const action = ep?.awsPolicyId ? "update" : "create";
      const outcome = await pushPolicyToAws(child.id);
      await prisma.syncEvent.create({
        data: {
          engineId: engine.id,
          batchId: batch.id,
          enginePolicyId: child.id,
          action,
          success: outcome.success,
          errorMessage: outcome.errorMessage,
          awsRequestId: outcome.awsRequestId,
          actorId: userId,
        },
      });
      if (outcome.success) {
        success += 1;
        await detectDriftInternal(child.id);
      } else {
        failure += 1;
      }
    }

    const closed = await prisma.syncBatch.update({
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
    return { batch: serializeSyncBatch(closed) };
  });

// Runs drift detection for one engine policy and returns its refreshed sync status.
export const detectDrift = authed
  .route({
    method: "POST",
    path: "/policy-engines/policies/detect-drift",
    tags: ["policy-engines"],
  })
  .input(z.object({ enginePolicyId: z.string().min(1) }))
  .output(z.object({ syncStatus: SyncStatusSchema }))
  .handler(async ({ input }) => {
    const ep = await prisma.enginePolicy.findUnique({
      where: { id: input.enginePolicyId },
    });
    if (!ep) {
      throw new ORPCError("NOT_FOUND", { message: "Engine policy not found" });
    }
    await detectDriftInternal(ep.id);
    const refreshed = await prisma.enginePolicy.findUnique({
      where: { id: ep.id },
    });
    return {
      syncStatus: (refreshed?.syncStatus ?? "unsynced") as z.infer<
        typeof SyncStatusSchema
      >,
    };
  });

// ── Gateway attachment ───────────────────────────────────────────────────────

const GatewaySummarySchema = z.object({
  gatewayId: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  status: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Lists AgentCore gateways available to attach an engine to (paginated).
export const listGatewaysAvailable = authed
  .route({
    method: "GET",
    path: "/policy-engines/gateways/list",
    tags: ["policy-engines"],
  })
  .input(
    z
      .object({
        nextToken: z.string().optional(),
        maxResults: z.number().int().min(1).max(100).optional(),
      })
      .optional(),
  )
  .output(
    z.object({
      gateways: z.array(GatewaySummarySchema),
      nextToken: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    try {
      const response = await awsClient.send(
        new ListGatewaysCommand({
          nextToken: input?.nextToken,
          maxResults: input?.maxResults,
        }),
      );
      return {
        gateways: (response.items ?? []).map((g) => ({
          gatewayId: g.gatewayId!,
          name: g.name!,
          description: g.description ?? null,
          status: g.status ?? "UNKNOWN",
          createdAt: g.createdAt!,
          updatedAt: g.updatedAt!,
        })),
        nextToken: response.nextToken ?? undefined,
      };
    } catch (err) {
      throw mapAwsError(err, "Failed to list gateways");
    }
  });

// Attaches an engine to a gateway by setting its policyEngineConfiguration
// (LOG_ONLY/ENFORCE) and upserts the local attachment record.
export const attachGateway = authed
  .route({
    method: "POST",
    path: "/policy-engines/gateways/attach",
    tags: ["policy-engines"],
  })
  .input(
    z.object({
      engineId: z.string().min(1),
      awsGatewayId: z.string().min(1),
      mode: GatewayModeSchema,
    }),
  )
  .output(z.object({ attachment: GatewayAttachmentSchema }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const engine = await prisma.policyEngine.findUnique({
      where: { id: input.engineId },
    });
    if (!engine) {
      throw new ORPCError("NOT_FOUND", { message: "Policy engine not found" });
    }
    if (!engine.awsPolicyEngineArn) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Engine has not been created in AWS yet",
      });
    }

    try {
      // Fetch the gateway to echo all required fields back on Update.
      const gw = await awsClient.send(
        new GetGatewayCommand({ gatewayIdentifier: input.awsGatewayId }),
      );

      const response = await awsClient.send(
        new UpdateGatewayCommand({
          gatewayIdentifier: input.awsGatewayId,
          name: gw.name!,
          description: gw.description,
          roleArn: gw.roleArn!,
          protocolType: gw.protocolType!,
          protocolConfiguration: gw.protocolConfiguration,
          authorizerType: gw.authorizerType!,
          authorizerConfiguration: gw.authorizerConfiguration,
          kmsKeyArn: gw.kmsKeyArn,
          interceptorConfigurations: gw.interceptorConfigurations,
          exceptionLevel: gw.exceptionLevel,
          policyEngineConfiguration: {
            arn: engine.awsPolicyEngineArn,
            mode: input.mode,
          },
        }),
      );

      const attachment = await prisma.gatewayAttachment.upsert({
        where: {
          engineId_awsGatewayId: {
            engineId: engine.id,
            awsGatewayId: input.awsGatewayId,
          },
        },
        update: { mode: input.mode, gatewayName: gw.name! },
        create: {
          engineId: engine.id,
          awsGatewayId: input.awsGatewayId,
          awsGatewayArn: gw.gatewayArn!,
          gatewayName: gw.name!,
          mode: input.mode,
        },
      });

      await prisma.syncEvent.create({
        data: {
          engineId: engine.id,
          action: "gateway_attach",
          success: true,
          awsRequestId: response.$metadata?.requestId,
          actorId: userId,
        },
      });

      return {
        attachment: {
          id: attachment.id,
          engineId: attachment.engineId,
          awsGatewayId: attachment.awsGatewayId,
          awsGatewayArn: attachment.awsGatewayArn,
          gatewayName: attachment.gatewayName,
          mode: attachment.mode as z.infer<typeof GatewayModeSchema>,
          createdAt: attachment.createdAt,
        },
      };
    } catch (err) {
      const info = extractAwsError(err);
      await prisma.syncEvent.create({
        data: {
          engineId: engine.id,
          action: "gateway_attach",
          success: false,
          errorMessage: info.message,
          awsRequestId: info.requestId,
          actorId: userId,
        },
      });
      throw mapAwsError(err, "Failed to attach gateway");
    }
  });

// Detaches an engine from a gateway by clearing its policyEngineConfiguration
// and deletes the local attachment record.
export const detachGateway = authed
  .route({
    method: "POST",
    path: "/policy-engines/gateways/detach",
    tags: ["policy-engines"],
  })
  .input(z.object({ attachmentId: z.string().min(1) }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    const userId = context.user.id;
    const attachment = await prisma.gatewayAttachment.findUnique({
      where: { id: input.attachmentId },
      include: { engine: true },
    });
    if (!attachment) {
      throw new ORPCError("NOT_FOUND", { message: "Attachment not found" });
    }

    try {
      const gw = await awsClient.send(
        new GetGatewayCommand({
          gatewayIdentifier: attachment.awsGatewayId,
        }),
      );

      const response = await awsClient.send(
        new UpdateGatewayCommand({
          gatewayIdentifier: attachment.awsGatewayId,
          name: gw.name!,
          description: gw.description,
          roleArn: gw.roleArn!,
          protocolType: gw.protocolType!,
          protocolConfiguration: gw.protocolConfiguration,
          authorizerType: gw.authorizerType!,
          authorizerConfiguration: gw.authorizerConfiguration,
          kmsKeyArn: gw.kmsKeyArn,
          interceptorConfigurations: gw.interceptorConfigurations,
          exceptionLevel: gw.exceptionLevel,
          policyEngineConfiguration: undefined,
        }),
      );

      await prisma.gatewayAttachment.delete({
        where: { id: attachment.id },
      });

      await prisma.syncEvent.create({
        data: {
          engineId: attachment.engineId,
          action: "gateway_detach",
          success: true,
          awsRequestId: response.$metadata?.requestId,
          actorId: userId,
        },
      });

      return { success: true };
    } catch (err) {
      const info = extractAwsError(err);
      await prisma.syncEvent.create({
        data: {
          engineId: attachment.engineId,
          action: "gateway_detach",
          success: false,
          errorMessage: info.message,
          awsRequestId: info.requestId,
          actorId: userId,
        },
      });
      throw mapAwsError(err, "Failed to detach gateway");
    }
  });

// ── Sync history ─────────────────────────────────────────────────────────────

export const listSyncBatches = authed
  .route({
    method: "GET",
    path: "/policy-engines/sync/batches",
    tags: ["policy-engines"],
  })
  .input(
    z.object({
      engineId: z.string().min(1),
      limit: z.number().int().min(1).max(100).default(25),
    }),
  )
  .output(z.object({ batches: z.array(SyncBatchSchema) }))
  .handler(async ({ input }) => {
    const batches = await prisma.syncBatch.findMany({
      where: { engineId: input.engineId },
      orderBy: { startedAt: "desc" },
      take: input.limit,
      include: {
        triggeredBy: { select: { id: true, name: true, email: true } },
      },
    });
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      batches: batches.map((b: any) => serializeSyncBatch(b)),
    };
  });

// Lists an engine's sync events (optionally filtered by batch/policy),
// backfilling each event's engine-policy name.
export const listSyncEvents = authed
  .route({
    method: "GET",
    path: "/policy-engines/sync/events",
    tags: ["policy-engines"],
  })
  .input(
    z.object({
      engineId: z.string().min(1),
      batchId: z.string().optional(),
      enginePolicyId: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }),
  )
  .output(z.object({ events: z.array(SyncEventSchema) }))
  .handler(async ({ input }) => {
    const where: Record<string, unknown> = { engineId: input.engineId };
    if (input.batchId) where.batchId = input.batchId;
    if (input.enginePolicyId) where.enginePolicyId = input.enginePolicyId;

    const events = await prisma.syncEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: input.limit,
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
    });

    // Pull policy names in a single query
    const policyIds = Array.from(
      new Set(
        events
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((e: any) => e.enginePolicyId)
          .filter((x: string | null): x is string => !!x),
      ),
    );
    const policies = policyIds.length
      ? await prisma.enginePolicy.findMany({
          where: { id: { in: policyIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      policies.map((p: any) => [p.id as string, p.name as string]),
    );

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      events: events.map((e: any) =>
        serializeSyncEvent({
          ...e,
          enginePolicy: e.enginePolicyId
            ? { name: nameById.get(e.enginePolicyId) ?? null }
            : undefined,
        }),
      ),
    };
  });

// ── Router export ────────────────────────────────────────────────────────────

export const policyEnginesRouter = {
  listPolicyEngines,
  getPolicyEngine,
  createPolicyEngine,
  refreshPolicyEngineStatus,
  updatePolicyEngine,
  deletePolicyEngine,
  listEnginePolicies,
  getEnginePolicy,
  createEnginePolicyFromLibrary,
  createEnginePolicyStandalone,
  updateEnginePolicy,
  deleteEnginePolicy,
  syncPolicy,
  syncEngine,
  detectDrift,
  listGatewaysAvailable,
  attachGateway,
  detachGateway,
  listSyncBatches,
  listSyncEvents,
};
