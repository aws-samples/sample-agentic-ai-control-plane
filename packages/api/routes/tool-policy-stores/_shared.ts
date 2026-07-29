import { createHash } from "node:crypto";
import { VerifiedPermissionsClient } from "@aws-sdk/client-verifiedpermissions";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

const REGION =
  process.env.AVP_REGION ||
  process.env.AGENTCORE_REGION ||
  "us-east-1";
const avpClient = new VerifiedPermissionsClient({ region: REGION });

// Ownership tag stamped on every policy store this service creates. The task
// role's IAM policy (see apps/infra/lib/dashboard-stack.ts) only permits acting
// on stores carrying this tag, so CreatePolicyStore MUST send it or the create
// (and every later operation on the store) is denied. Key/value are injected by
// the infra stack; the fallbacks keep local dev working against a store the
// developer's own credentials can already reach.
const AVP_OWNER_TAG_KEY =
  process.env.AVP_OWNER_TAG_KEY || "agentic-ai-platform:managed-by";
const AVP_OWNER_TAG_VALUE =
  process.env.AVP_OWNER_TAG_VALUE || "dashboard-avp-sync";

// Tags to attach when creating a policy store.
const avpOwnerTags = (): Record<string, string> => ({
  [AVP_OWNER_TAG_KEY]: AVP_OWNER_TAG_VALUE,
});

// ── Zod schemas ──────────────────────────────────────────────────────────────

const StoreStatusSchema = z.enum([
  "CREATING",
  "ACTIVE",
  "DELETING",
  "DELETED",
  "FAILED",
]);

const SyncStatusSchema = z.enum([
  "unsynced",
  "in_sync",
  "drifted",
  "pending",
  "failed",
]);

const PolicyStatusSchema = z.enum(["draft", "in_review", "published", "archived"]);
const PolicyTypeSchema = z.enum(["permit", "forbid"]);
const ValidationModeSchema = z.enum(["STRICT", "OFF"]);

const ContextFieldSchema = z.object({
  name: z.string(),
  type: z.enum(["String", "Boolean", "Long"]),
  required: z.boolean(),
});

const ActorSchema = z.object({
  id: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});

const ToolPolicyStoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  namespace: z.string(),
  region: z.string(),
  awsPolicyStoreId: z.string().nullable().optional(),
  awsPolicyStoreArn: z.string().nullable().optional(),
  status: StoreStatusSchema,
  validationMode: ValidationModeSchema,
  schemaJson: z.string().nullable().optional(),
  schemaSyncStatus: SyncStatusSchema,
  lastSchemaSyncedAt: z.coerce.date().nullable().optional(),
  createdBy: ActorSchema.nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  archivedAt: z.coerce.date().nullable().optional(),
  policyCount: z.number().int().optional(),
  driftedCount: z.number().int().optional(),
  lastSyncedAt: z.coerce.date().nullable().optional(),
});

const ToolPolicySchema = z.object({
  id: z.string(),
  storeId: z.string(),
  name: z.string(),
  description: z.string(),
  cedarCode: z.string(),
  type: PolicyTypeSchema,
  status: PolicyStatusSchema,
  action: z.string(),
  principalTypes: z.array(z.string()),
  resourceTypes: z.array(z.string()),
  contextFields: z.array(ContextFieldSchema),
  libraryPolicyId: z.string().nullable().optional(),
  libraryPolicyName: z.string().nullable().optional(),
  templateLinkId: z.string().nullable().optional(),
  isTemplateLinked: z.boolean(),
  awsPolicyId: z.string().nullable().optional(),
  awsPolicyArn: z.string().nullable().optional(),
  awsStatus: z.string().nullable().optional(),
  lastSyncedAt: z.coerce.date().nullable().optional(),
  syncStatus: SyncStatusSchema,
  createdBy: ActorSchema.nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const ToolPolicyTemplateSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  name: z.string(),
  description: z.string(),
  cedarStatement: z.string(),
  awsTemplateId: z.string().nullable().optional(),
  lastSyncedAt: z.coerce.date().nullable().optional(),
  syncStatus: SyncStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const ToolSyncBatchSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  scope: z.enum(["store", "policy", "schema"]),
  totalCount: z.number().int(),
  successCount: z.number().int(),
  failureCount: z.number().int(),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable().optional(),
  triggeredBy: ActorSchema.nullable().optional(),
});

const ToolSyncEventSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  batchId: z.string().nullable().optional(),
  toolPolicyId: z.string().nullable().optional(),
  toolPolicyName: z.string().nullable().optional(),
  action: z.string(),
  success: z.boolean(),
  errorMessage: z.string().nullable().optional(),
  awsRequestId: z.string().nullable().optional(),
  actor: ActorSchema.nullable().optional(),
  createdAt: z.coerce.date(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

type AwsErrorLike = {
  name?: string;
  message?: string;
  $metadata?: { requestId?: string };
};

// Translates an AWS SDK error into the matching ORPCError code (e.g.
// ValidationException -> BAD_REQUEST), defaulting to INTERNAL_SERVER_ERROR.
function mapAwsError(
  err: unknown,
  fallback: string,
): ORPCError<string, unknown> {
  const awsErr = err as AwsErrorLike;
  const message = awsErr?.message ?? fallback;
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

// Coerces a stored schema value to a JSON string, returning null if absent or
// unserializable.
function schemaJsonToString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

// Maps a Prisma policy-store row to the API ToolPolicyStore shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeStore(s: any) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    namespace: s.namespace,
    region: s.region,
    awsPolicyStoreId: s.awsPolicyStoreId,
    awsPolicyStoreArn: s.awsPolicyStoreArn,
    status: s.status as z.infer<typeof StoreStatusSchema>,
    validationMode: s.validationMode as z.infer<typeof ValidationModeSchema>,
    schemaJson: schemaJsonToString(s.schemaJson),
    schemaSyncStatus: s.schemaSyncStatus as z.infer<typeof SyncStatusSchema>,
    lastSchemaSyncedAt: s.lastSchemaSyncedAt,
    createdBy: s.createdBy
      ? { id: s.createdBy.id, name: s.createdBy.name, email: s.createdBy.email }
      : null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    archivedAt: s.archivedAt,
    policyCount: s._count?.policies,
    driftedCount: s.driftedCount as number | undefined,
    lastSyncedAt: s.lastSyncedAt as Date | null | undefined,
  };
}

// Maps a Prisma tool-policy row to the API ToolPolicy shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializePolicy(p: any) {
  let contextFields: Array<z.infer<typeof ContextFieldSchema>> = [];
  if (Array.isArray(p.contextFields)) {
    contextFields = p.contextFields as Array<
      z.infer<typeof ContextFieldSchema>
    >;
  }
  return {
    id: p.id,
    storeId: p.storeId,
    name: p.name,
    description: p.description,
    cedarCode: p.cedarCode,
    type: p.type as z.infer<typeof PolicyTypeSchema>,
    status: p.status as z.infer<typeof PolicyStatusSchema>,
    action: p.action ?? "",
    principalTypes: p.principalTypes ?? [],
    resourceTypes: p.resourceTypes ?? [],
    contextFields,
    libraryPolicyId: p.libraryPolicyId,
    libraryPolicyName: p.libraryPolicy?.name ?? null,
    templateLinkId: p.templateLinkId,
    isTemplateLinked: !!p.templateLinkId,
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

// Maps a Prisma policy-template row to the API ToolPolicyTemplate shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeTemplate(t: any) {
  return {
    id: t.id,
    storeId: t.storeId,
    name: t.name,
    description: t.description,
    cedarStatement: t.cedarStatement,
    awsTemplateId: t.awsTemplateId,
    lastSyncedAt: t.lastSyncedAt,
    syncStatus: t.syncStatus as z.infer<typeof SyncStatusSchema>,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

// Maps a Prisma sync-batch row to the API ToolSyncBatch shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeBatch(b: any) {
  return {
    id: b.id,
    storeId: b.storeId,
    scope: b.scope as "store" | "policy" | "schema",
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

// Maps a Prisma sync-event row to the API ToolSyncEvent shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeEvent(e: any) {
  return {
    id: e.id,
    storeId: e.storeId,
    batchId: e.batchId,
    toolPolicyId: e.toolPolicyId,
    toolPolicyName: e.toolPolicy?.name ?? null,
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

export {
  StoreStatusSchema,
  SyncStatusSchema,
  PolicyStatusSchema,
  PolicyTypeSchema,
  ValidationModeSchema,
  ContextFieldSchema,
  ToolPolicyStoreSchema,
  ToolPolicySchema,
  ToolPolicyTemplateSchema,
  ToolSyncBatchSchema,
  ToolSyncEventSchema,
  REGION,
  avpClient,
  avpOwnerTags,
  sha256,
  mapAwsError,
  extractAwsError,
  serializeStore,
  serializePolicy,
  serializeTemplate,
  serializeBatch,
  serializeEvent,
};
