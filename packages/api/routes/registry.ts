import {
  AgentRegistryClient,
  BatchGetDiscoverableRegistryRecordCommand,
  ListDiscoverableRegistryRecordsCommand,
  SearchDiscoverableRegistryRecordsCommand,
} from "@aws-sdk/client-agent-registry";
import type {
  CreateRegistryRecordCommandInput,
  UpdateRegistryRecordCommandInput,
} from "@aws-sdk/client-agent-registry-control";
import {
  AgentRegistryControlClient,
  CreateRegistryCommand,
  CreateRegistryRecordCommand,
  DeleteRegistryCommand,
  DeleteRegistryRecordCommand,
  GetRegistryRecordCommand,
  ListRegistriesCommand,
  ListRegistryRecordsCommand,
  SubmitRegistryRecordForApprovalCommand,
  TagResourceCommand,
  UpdateRegistryCommand,
  UpdateRegistryRecordCommand,
  UpdateRegistryRecordStatusCommand,
} from "@aws-sdk/client-agent-registry-control";
import { ORPCError } from "@orpc/server";
import { prisma } from "@package/database";
import { z } from "zod";
import { authed } from "../context";

const REGION = process.env.AGENTCORE_REGISTRY_REGION || "us-east-1";
const cpClient = new AgentRegistryControlClient({ region: REGION });
const dpClient = new AgentRegistryClient({ region: REGION });

// ── Activity tracing ────────────────────────────────────────────────────────
//
// Registry records live in AWS (agent-registry), which exposes no per-user audit
// read, so we record activity locally as a side-effect of each mutating call —
// keyed by AWS registryId (+ optional recordId), never synced back to AWS. See
// docs/registry-activity-tracing.md.
//
// Unlike policy-library (which co-transacts the event with its DB mutation), the
// registry mutation is an AWS SDK call, so the event is written AFTER the AWS op
// succeeds and is BEST-EFFORT: a logging failure must not fail the user's action.
type RegistryActivityType =
  | "registry_created"
  | "registry_updated"
  | "registry_deleted"
  | "record_created"
  | "record_updated"
  | "record_submitted"
  | "status_changed"
  | "record_deleted"
  | "sync_triggered";

async function recordActivity(e: {
  registryId: string;
  recordId?: string;
  type: RegistryActivityType;
  description: string;
  actorId: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  try {
    await prisma.registryActivityEvent.create({
      data: {
        registryId: e.registryId,
        recordId: e.recordId,
        type: e.type,
        description: e.description,
        actorId: e.actorId,
        metadata: e.metadata ?? {},
      },
    });
  } catch (err) {
    // Audit write is best-effort — the AWS operation already succeeded and is the
    // source of truth. Log and move on rather than failing the user's action.
    console.error("registry activity log write failed", err);
  }
}

// Ownership tag stamped on every registry this service creates. GA CreateRegistry
// supports tags-on-create, so the registry is tagged in the create call itself;
// the task role's IAM only permits acting on registries carrying this tag. A
// best-effort TagResource fallback covers the (unexpected) case where a create
// response arrives without the tag applied. Key/value injected by the infra
// stack; dev fallbacks.
const AGENTCORE_OWNER_TAG_KEY =
  process.env.AGENTCORE_OWNER_TAG_KEY || "agentic-ai-platform:managed-by";
const AGENTCORE_OWNER_TAG_VALUE =
  process.env.AGENTCORE_OWNER_TAG_VALUE || "dashboard-agentcore-sync";

const agentCoreOwnerTags = (): Record<string, string> => ({
  [AGENTCORE_OWNER_TAG_KEY]: AGENTCORE_OWNER_TAG_VALUE,
});

// ── Shared enums / schemas ──────────────────────────────────────────────────

// Registry lifecycle. Includes the *_FAILED states a failed create/update can
// produce, so ListRegistries output validation never 500s on a failed registry.
const RegistryStatusSchema = z.enum([
  "CREATING",
  "CREATE_FAILED",
  "READY",
  "UPDATING",
  "UPDATE_FAILED",
  "DELETING",
  "DELETE_FAILED",
]);

const RecordStatusSchema = z.enum([
  "CREATING",
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "DEPRECATED",
  "UPDATING",
  "CREATE_FAILED",
  "UPDATE_FAILED",
]);

// GA replaces the old descriptorType (MCP|A2A|CUSTOM|AGENT_SKILLS) with a
// semantic recordType. Note AGENT (was A2A) and SKILL (was AGENT_SKILLS).
const RecordTypeSchema = z.enum(["AGENT", "MCP", "SKILL", "CUSTOM"]);

const RegistryAuthorizerTypeSchema = z.enum(["AWS_IAM", "CUSTOM_JWT"]);
const AutoApprovalRuleSchema = z.enum(["APPROVE_ALL"]);

// Approval: array of enum rules. [] / absent => manual approval; ["APPROVE_ALL"]
// => records auto-approve (old boolean autoApproval:true).
const ApprovalConfigurationSchema = z.object({
  autoApprovalRules: z.array(AutoApprovalRuleSchema).optional(),
});

// JWT authorizer config for CUSTOM_JWT registries (inbound consumer auth).
const CustomJWTAuthorizerConfigSchema = z.object({
  discoveryUrl: z.string(),
  allowedAudience: z.array(z.string()).optional(),
  allowedClients: z.array(z.string()).optional(),
  allowedScopes: z.array(z.string()).optional(),
});
const AuthorizerConfigurationSchema = z.object({
  customJWTAuthorizer: CustomJWTAuthorizerConfigSchema,
});
const DiscoveryConfigurationSchema = z.object({
  authorizerType: RegistryAuthorizerTypeSchema.optional(),
  authorizerConfiguration: AuthorizerConfigurationSchema.optional(),
});

const RegistrySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  registryId: z.string(),
  registryArn: z.string(),
  discoveryConfiguration: DiscoveryConfigurationSchema.optional(),
  approvalConfiguration: ApprovalConfigurationSchema.optional(),
  status: RegistryStatusSchema,
  statusReason: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date(),
});

// ── Descriptors (GA flat-keyed model) ───────────────────────────────────────
//
// One primary descriptor key per record, chosen by recordType:
//   AGENT  -> a2aAgentCard | mcpServer | custom
//   MCP    -> mcpServer | custom
//   SKILL  -> agentSkillsDefinition | custom
//   CUSTOM -> custom
// Each carries `data` (the inline JSON/string) + optional `dataSchemaVersion`.
// `source` (URL sync) attaches only to mcpServer / a2aAgentCard.

const CredentialProviderConfigSchema = z.object({
  credentialProviderType: z.enum(["OAUTH", "IAM"]),
  credentialProvider: z.object({
    oauthCredentialProvider: z
      .object({
        providerArn: z.string(),
        grantType: z.string().default("CLIENT_CREDENTIALS"),
        scopes: z.array(z.string()).optional(),
        customParameters: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
    iamCredentialProvider: z
      .object({
        roleArn: z.string(),
        service: z.string(),
        region: z.string().optional(),
      })
      .optional(),
  }),
});
const DescriptorSourceSchema = z.object({
  fromUrl: z.object({
    url: z.string(),
    credentialProviderConfigurations: z
      .array(CredentialProviderConfigSchema)
      .optional(),
  }),
});

const McpServerDescriptorSchema = z.object({
  data: z.string().optional(),
  dataSchemaVersion: z.string().optional(),
  additionalData: z
    .object({
      tools: z
        .object({
          data: z.string().optional(),
          dataSchemaVersion: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  source: DescriptorSourceSchema.optional(),
});
const A2aAgentCardDescriptorSchema = z.object({
  data: z.string().optional(),
  dataSchemaVersion: z.string().optional(),
  source: DescriptorSourceSchema.optional(),
});
const AgentSkillsDefinitionDescriptorSchema = z.object({
  data: z.string().optional(),
  dataSchemaVersion: z.string().optional(),
  additionalData: z
    .object({
      skillMd: z
        .object({
          data: z.string().optional(),
          dataSchemaVersion: z.string().optional(),
          source: DescriptorSourceSchema.optional(),
        })
        .optional(),
    })
    .optional(),
});
const CustomDescriptorSchema = z.object({ data: z.string().optional() });

const DescriptorsSchema = z.object({
  mcpServer: McpServerDescriptorSchema.optional(),
  a2aAgentCard: A2aAgentCardDescriptorSchema.optional(),
  agentSkillsDefinition: AgentSkillsDefinitionDescriptorSchema.optional(),
  custom: CustomDescriptorSchema.optional(),
});

const RegistryRecordSchema = z.object({
  registryArn: z.string(),
  recordId: z.string().optional(),
  recordArn: z.string().optional(),
  name: z.string(),
  displayName: z.string().optional(),
  recordType: RecordTypeSchema.optional(),
  recordVersion: z.string().optional(),
  status: RecordStatusSchema,
  description: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

const RegistryRecordDetailSchema = z.object({
  registryArn: z.string(),
  recordId: z.string().optional(),
  recordArn: z.string().optional(),
  name: z.string(),
  displayName: z.string().optional(),
  recordType: RecordTypeSchema.optional(),
  recordVersion: z.string().optional(),
  status: RecordStatusSchema,
  statusReason: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  descriptors: DescriptorsSchema.optional(),
});

// ── List Registries ─────────────────────────────────────────────────────────
//
// GA ListRegistries is POST with a structured `filters` array and cursor
// pagination. We fully paginate server-side so callers see every registry, then
// apply the optional status filter locally (kept for input compatibility).

export const listRegistries = authed
  .route({ method: "GET", path: "/registry/list", tags: ["registry"] })
  .input(
    z
      .object({
        status: RegistryStatusSchema.optional(),
      })
      .optional(),
  )
  .output(z.object({ registries: z.array(RegistrySchema) }))
  .handler(async ({ input }) => {
    const collected: Array<z.infer<typeof RegistrySchema>> = [];
    let nextToken: string | undefined;
    do {
      const response = await cpClient.send(
        new ListRegistriesCommand({ nextToken }),
      );
      for (const r of response.registries ?? []) {
        collected.push({
          name: r.name!,
          description: r.description,
          registryId: r.registryId!,
          registryArn: r.registryArn!,
          discoveryConfiguration: r.discoveryConfiguration as z.infer<
            typeof DiscoveryConfigurationSchema
          >,
          status: r.status as z.infer<typeof RegistryStatusSchema>,
          statusReason: r.statusReason,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt!,
        });
      }
      nextToken = response.nextToken;
    } while (nextToken);

    const registries = input?.status
      ? collected.filter((r) => r.status === input.status)
      : collected;
    return { registries };
  });

// ── Create Registry ─────────────────────────────────────────────────────────

export const createRegistry = authed
  .route({ method: "POST", path: "/registry/create", tags: ["registry"] })
  .input(
    z.object({
      name: z
        .string()
        .min(1)
        .max(48)
        .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,47}$/, {
          message:
            "Name must start with a letter and contain only letters, numbers, and underscores (max 48 characters)",
        }),
      description: z.string().optional(),
      discoveryConfiguration: DiscoveryConfigurationSchema.optional(),
      approvalConfiguration: ApprovalConfigurationSchema.optional(),
    }),
  )
  .output(z.object({ registryArn: z.string() }))
  .handler(async ({ input, context }) => {
    // Duplicate-name pre-check (ListRegistries paginated).
    let nextToken: string | undefined;
    do {
      const page = await cpClient.send(
        new ListRegistriesCommand({ nextToken }),
      );
      if (page.registries?.some((r) => r.name === input.name)) {
        throw new ORPCError("CONFLICT", {
          message: `Registry with name '${input.name}' already exists`,
        });
      }
      nextToken = page.nextToken;
    } while (nextToken);

    // GA supports tags-on-create, so ownership is claimed atomically in the
    // create call (no separate create-then-tag rollback needed).
    const response = await cpClient.send(
      new CreateRegistryCommand({
        name: input.name,
        description: input.description,
        discoveryConfiguration: input.discoveryConfiguration,
        approvalConfiguration: input.approvalConfiguration ?? {
          autoApprovalRules: [],
        },
        tags: agentCoreOwnerTags(),
      }),
    );

    const registryArn = response.registryArn!;

    // Defensive fallback: if the create somehow didn't carry the tag, claim it
    // now so later (tag-scoped) registry ops keep working. Best-effort — surface
    // the failure and roll back the untagged registry so it isn't orphaned.
    try {
      await cpClient.send(
        new TagResourceCommand({
          resourceArn: registryArn,
          tags: agentCoreOwnerTags(),
        }),
      );
    } catch (err) {
      const registryId = registryArn.split("/").pop();
      try {
        if (registryId) {
          await cpClient.send(new DeleteRegistryCommand({ registryId }));
        }
      } catch {
        // Best-effort rollback; surface the original tagging failure below.
      }
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message:
          "Registry created but ownership tagging failed; rolled back. Please retry.",
        cause: err,
      });
    }

    const registryId = registryArn.split("/").pop() ?? registryArn;
    await recordActivity({
      registryId,
      type: "registry_created",
      description: `Registry "${input.name}" created`,
      actorId: context.user.id,
    });

    return { registryArn };
  });

// ── Update Registry ─────────────────────────────────────────────────────────

export const updateRegistry = authed
  .route({ method: "PATCH", path: "/registry/update", tags: ["registry"] })
  .input(
    z.object({
      registryId: z.string().min(1),
      description: z.string().optional(),
      approvalConfiguration: ApprovalConfigurationSchema.optional(),
      discoveryConfiguration: DiscoveryConfigurationSchema.optional(),
    }),
  )
  .output(RegistrySchema)
  .handler(async ({ input, context }) => {
    const response = await cpClient.send(
      new UpdateRegistryCommand({
        registryId: input.registryId,
        description:
          input.description !== undefined
            ? { optionalValue: input.description }
            : undefined,
        approvalConfiguration:
          input.approvalConfiguration !== undefined
            ? { optionalValue: input.approvalConfiguration }
            : undefined,
        discoveryConfiguration:
          input.discoveryConfiguration?.authorizerConfiguration !== undefined
            ? {
                authorizerConfiguration: {
                  optionalValue:
                    input.discoveryConfiguration.authorizerConfiguration,
                },
              }
            : undefined,
      }),
    );
    await recordActivity({
      registryId: input.registryId,
      type: "registry_updated",
      description: "Registry settings updated",
      actorId: context.user.id,
    });
    return response as unknown as z.infer<typeof RegistrySchema>;
  });

// ── Delete Registry ─────────────────────────────────────────────────────────

export const deleteRegistry = authed
  .route({ method: "DELETE", path: "/registry/delete", tags: ["registry"] })
  .input(z.object({ registryId: z.string().min(1) }))
  .output(z.object({ success: z.boolean(), message: z.string().optional() }))
  .handler(async ({ input, context }) => {
    await cpClient.send(
      new DeleteRegistryCommand({ registryId: input.registryId }),
    );
    await recordActivity({
      registryId: input.registryId,
      type: "registry_deleted",
      description: "Registry deleted",
      actorId: context.user.id,
    });
    return { success: true, message: "Registry deleted successfully" };
  });

// ── List Registry Records ───────────────────────────────────────────────────
//
// GA ListRegistryRecords is POST with a structured `filters` array and cursor
// pagination. We paginate fully, then apply the optional status filter via the
// GA `filters` param (status is a filterable field).

export const listRegistryRecords = authed
  .route({ method: "GET", path: "/registry/records/list", tags: ["registry"] })
  .input(
    z.object({
      registryId: z.string().min(1),
      status: RecordStatusSchema.optional(),
    }),
  )
  .output(z.object({ registryRecords: z.array(RegistryRecordSchema) }))
  .handler(async ({ input }) => {
    const collected: Array<z.infer<typeof RegistryRecordSchema>> = [];
    let nextToken: string | undefined;
    do {
      const response = await cpClient.send(
        new ListRegistryRecordsCommand({
          registryId: input.registryId,
          nextToken,
          filters: input.status
            ? [{ name: "status", values: [input.status] }]
            : undefined,
        }),
      );
      for (const r of response.registryRecords ?? []) {
        collected.push({
          registryArn: r.registryArn!,
          recordId: r.recordId,
          recordArn: r.recordArn,
          name: r.name!,
          displayName: r.displayName,
          recordType: r.recordType as z.infer<typeof RecordTypeSchema>,
          recordVersion: r.recordVersion,
          status: r.status as z.infer<typeof RecordStatusSchema>,
          description: r.description,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        });
      }
      nextToken = response.nextToken;
    } while (nextToken);

    return { registryRecords: collected };
  });

// ── Get Registry Record ─────────────────────────────────────────────────────

export const getRegistryRecord = authed
  .route({ method: "GET", path: "/registry/records/get", tags: ["registry"] })
  .input(
    z.object({ registryId: z.string().min(1), recordId: z.string().min(1) }),
  )
  .output(z.object({ registryRecord: RegistryRecordDetailSchema }))
  .handler(async ({ input }) => {
    const response = await cpClient.send(
      new GetRegistryRecordCommand({
        registryId: input.registryId,
        recordId: input.recordId,
      }),
    );
    return {
      registryRecord: response as unknown as z.infer<
        typeof RegistryRecordDetailSchema
      >,
    };
  });

// ── Create Registry Record ──────────────────────────────────────────────────

export const createRegistryRecord = authed
  .route({
    method: "POST",
    path: "/registry/records/create",
    tags: ["registry"],
  })
  .input(
    z.object({
      registryId: z.string().min(1),
      name: z
        .string()
        .max(64)
        .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/, {
          message:
            "Name must start with a letter and contain only letters, numbers, and underscores (max 64 characters)",
        }),
      displayName: z.string().optional(),
      recordType: RecordTypeSchema,
      description: z.string().optional(),
      recordVersion: z.string().default("1.0"),
      descriptors: DescriptorsSchema,
    }),
  )
  .output(
    z.object({
      recordArn: z.string().optional(),
      recordId: z.string().optional(),
      status: RecordStatusSchema.optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    // Strip undefined descriptor keys so the SDK doesn't serialize empty ones.
    const cleanDescriptors: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input.descriptors)) {
      if (v != null) cleanDescriptors[k] = v;
    }
    const params: CreateRegistryRecordCommandInput = {
      registryId: input.registryId,
      name: input.name,
      displayName: input.displayName,
      recordType: input.recordType,
      description: input.description,
      recordVersion: input.recordVersion,
      descriptors: cleanDescriptors as CreateRegistryRecordCommandInput["descriptors"],
    };
    try {
      const response = await cpClient.send(
        new CreateRegistryRecordCommand(params),
      );
      const recordId = response.recordArn?.split("/").pop();
      await recordActivity({
        registryId: input.registryId,
        recordId,
        type: "record_created",
        description: `Record "${input.displayName || input.name}" created (${input.recordType}) v${input.recordVersion}`,
        actorId: context.user.id,
        metadata: { recordType: input.recordType, recordVersion: input.recordVersion },
      });
      return {
        recordArn: response.recordArn,
        recordId,
        status: response.status as z.infer<typeof RecordStatusSchema>,
      };
    } catch (err: unknown) {
      throw mapAwsError(err, "Failed to create registry record");
    }
  });

// ── Submit Registry Record for Approval ─────────────────────────────────────

export const submitRegistryRecord = authed
  .route({
    method: "POST",
    path: "/registry/records/submit",
    tags: ["registry"],
  })
  .input(
    z.object({ registryId: z.string().min(1), recordId: z.string().min(1) }),
  )
  .output(
    z
      .object({
        recordId: z.string().optional(),
        recordArn: z.string().optional(),
        status: RecordStatusSchema.optional(),
      })
      .optional(),
  )
  .handler(async ({ input, context }) => {
    try {
      const response = await cpClient.send(
        new SubmitRegistryRecordForApprovalCommand({
          registryId: input.registryId,
          recordId: input.recordId,
        }),
      );
      await recordActivity({
        registryId: input.registryId,
        recordId: input.recordId,
        type: "record_submitted",
        description: "Record submitted for approval",
        actorId: context.user.id,
      });
      return {
        recordId: response.recordId,
        recordArn: response.recordArn,
        status: response.status as z.infer<typeof RecordStatusSchema>,
      };
    } catch (err: unknown) {
      throw mapAwsError(err, "Failed to submit record for approval");
    }
  });

// ── Update Registry Record Status ───────────────────────────────────────────

export const updateRegistryRecordStatus = authed
  .route({
    method: "PATCH",
    path: "/registry/records/update-status",
    tags: ["registry"],
  })
  .input(
    z.object({
      registryId: z.string().min(1),
      recordId: z.string().min(1),
      status: z.enum(["APPROVED", "REJECTED", "DEPRECATED"]),
      statusReason: z.string().optional(),
    }),
  )
  .output(
    z
      .object({
        recordId: z.string().optional(),
        status: RecordStatusSchema.optional(),
      })
      .optional(),
  )
  .handler(async ({ input, context }) => {
    const statusReason =
      input.statusReason || `Status changed to ${input.status}`;
    const response = await cpClient.send(
      new UpdateRegistryRecordStatusCommand({
        registryId: input.registryId,
        recordId: input.recordId,
        status: input.status,
        statusReason,
      }),
    );
    await recordActivity({
      registryId: input.registryId,
      recordId: input.recordId,
      type: "status_changed",
      description: input.statusReason
        ? `Status changed to ${input.status} — "${input.statusReason}"`
        : `Status changed to ${input.status}`,
      actorId: context.user.id,
      metadata: { status: input.status, statusReason },
    });
    return {
      recordId: response.recordId,
      status: response.status as z.infer<typeof RecordStatusSchema>,
    };
  });

// ── Delete Registry Record ──────────────────────────────────────────────────

export const deleteRegistryRecord = authed
  .route({
    method: "DELETE",
    path: "/registry/records/delete",
    tags: ["registry"],
  })
  .input(
    z.object({ registryId: z.string().min(1), recordId: z.string().min(1) }),
  )
  .output(z.object({ success: z.boolean(), message: z.string().optional() }))
  .handler(async ({ input, context }) => {
    await cpClient.send(
      new DeleteRegistryRecordCommand({
        registryId: input.registryId,
        recordId: input.recordId,
      }),
    );
    await recordActivity({
      registryId: input.registryId,
      recordId: input.recordId,
      type: "record_deleted",
      description: "Record deleted",
      actorId: context.user.id,
    });
    return { success: true, message: "Registry record deleted successfully" };
  });

// ── Update Registry Record ──────────────────────────────────────────────────
//
// GA update uses PATCH-wrapper semantics: each optional field is wrapped in
// `{ optionalValue }` (present = set, absent = leave unchanged). Descriptors
// nest wrappers per level (see UpdatedDescriptors -> ...Fields -> optionalValue).

export const updateRegistryRecord = authed
  .route({
    method: "PATCH",
    path: "/registry/records/update",
    tags: ["registry"],
  })
  .input(
    z.object({
      registryId: z.string().min(1),
      recordId: z.string().min(1),
      name: z.string().min(1).max(64).optional(),
      displayName: z.string().optional(),
      description: z.string().optional(),
      recordType: RecordTypeSchema.optional(),
      recordVersion: z.string().optional(),
      descriptors: DescriptorsSchema.optional(),
      triggerSynchronization: z.boolean().optional(),
    }),
  )
  .output(RegistryRecordDetailSchema)
  .handler(async ({ input, context }) => {
    const params: UpdateRegistryRecordCommandInput = {
      registryId: input.registryId,
      recordId: input.recordId,
    };
    if (input.name !== undefined) params.name = input.name;
    if (input.displayName !== undefined)
      params.displayName = { optionalValue: input.displayName };
    if (input.description !== undefined)
      params.description = { optionalValue: input.description };
    if (input.recordType !== undefined) params.recordType = input.recordType;
    if (input.recordVersion !== undefined)
      params.recordVersion = input.recordVersion;
    if (input.descriptors !== undefined) {
      params.descriptors = {
        optionalValue: wrapDescriptorsForUpdate(input.descriptors),
      } as UpdateRegistryRecordCommandInput["descriptors"];
    }
    if (input.triggerSynchronization)
      params.triggerSynchronization = input.triggerSynchronization;

    const response = await cpClient.send(
      new UpdateRegistryRecordCommand(params),
    );

    // A sync-only trigger (no other fields) is logged as sync_triggered;
    // otherwise it's a content edit. recordVersion, when changed, is noted.
    const isSyncOnly =
      input.triggerSynchronization &&
      input.name === undefined &&
      input.displayName === undefined &&
      input.description === undefined &&
      input.recordType === undefined &&
      input.recordVersion === undefined &&
      input.descriptors === undefined;
    await recordActivity({
      registryId: input.registryId,
      recordId: input.recordId,
      type: isSyncOnly ? "sync_triggered" : "record_updated",
      description: isSyncOnly
        ? "Synchronization triggered"
        : input.recordVersion !== undefined
          ? `Record updated (version ${input.recordVersion})`
          : "Record updated",
      actorId: context.user.id,
      metadata: input.recordVersion !== undefined
        ? { recordVersion: input.recordVersion }
        : undefined,
    });

    return response as unknown as z.infer<typeof RegistryRecordDetailSchema>;
  });

// Wraps a flat descriptors object into the GA PATCH-wrapper shape
// (UpdatedDescriptorsFields). Each scalar becomes `{ optionalValue }`; nested
// descriptors nest an extra `{ optionalValue: fields }` level.
function wrapDescriptorsForUpdate(
  descriptors: z.infer<typeof DescriptorsSchema>,
): Record<string, unknown> {
  const wrapped: Record<string, unknown> = {};

  if (descriptors.mcpServer) {
    const m = descriptors.mcpServer;
    const fields: Record<string, unknown> = {};
    if (m.data !== undefined) fields.data = { optionalValue: m.data };
    if (m.dataSchemaVersion !== undefined)
      fields.dataSchemaVersion = { optionalValue: m.dataSchemaVersion };
    if (m.source !== undefined) fields.source = { optionalValue: m.source };
    if (m.additionalData?.tools !== undefined) {
      const t = m.additionalData.tools;
      const toolFields: Record<string, unknown> = {};
      if (t.data !== undefined) toolFields.data = { optionalValue: t.data };
      if (t.dataSchemaVersion !== undefined)
        toolFields.dataSchemaVersion = { optionalValue: t.dataSchemaVersion };
      fields.additionalData = { optionalValue: { tools: { optionalValue: toolFields } } };
    }
    wrapped.mcpServer = { optionalValue: fields };
  }

  if (descriptors.a2aAgentCard) {
    const a = descriptors.a2aAgentCard;
    const fields: Record<string, unknown> = {};
    if (a.data !== undefined) fields.data = { optionalValue: a.data };
    if (a.dataSchemaVersion !== undefined)
      fields.dataSchemaVersion = { optionalValue: a.dataSchemaVersion };
    if (a.source !== undefined) fields.source = { optionalValue: a.source };
    wrapped.a2aAgentCard = { optionalValue: fields };
  }

  if (descriptors.agentSkillsDefinition) {
    const s = descriptors.agentSkillsDefinition;
    const fields: Record<string, unknown> = {};
    if (s.data !== undefined) fields.data = { optionalValue: s.data };
    if (s.dataSchemaVersion !== undefined)
      fields.dataSchemaVersion = { optionalValue: s.dataSchemaVersion };
    if (s.additionalData?.skillMd !== undefined) {
      const md = s.additionalData.skillMd;
      const mdFields: Record<string, unknown> = {};
      if (md.data !== undefined) mdFields.data = { optionalValue: md.data };
      if (md.dataSchemaVersion !== undefined)
        mdFields.dataSchemaVersion = { optionalValue: md.dataSchemaVersion };
      if (md.source !== undefined)
        mdFields.source = { optionalValue: md.source };
      fields.additionalData = {
        optionalValue: { skillMd: { optionalValue: mdFields } },
      };
    }
    wrapped.agentSkillsDefinition = { optionalValue: fields };
  }

  if (descriptors.custom) {
    const c = descriptors.custom;
    const fields: Record<string, unknown> = {};
    if (c.data !== undefined) fields.data = { optionalValue: c.data };
    wrapped.custom = { optionalValue: fields };
  }

  return wrapped;
}

// ── Discoverable Records (Data Plane) ───────────────────────────────────────
//
// Consumer-facing discovery APIs — they only return APPROVED records. Three
// commands: keyword Search, paginated List (browse/catalog), and BatchGet.

// A discoverable-record summary as returned by Search / List (no descriptors).
const DiscoverableRecordSummarySchema = z.object({
  registryArn: z.string(),
  recordArn: z.string().optional(),
  recordId: z.string().optional(),
  name: z.string(),
  displayName: z.string().optional(),
  recordType: z.string().optional(),
  recordVersion: z.string().optional(),
  status: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

// Data-plane record filter. The service supports filtering discoverable records
// by recordType (and descriptorType for back-compat); status is NOT filterable
// here, so we constrain the exposed filter to recordType.
const DiscoverableRecordFilterSchema = z.object({
  name: z.enum(["recordType"]),
  values: z.array(z.string()).min(1),
});

export const searchRegistryRecords = authed
  .route({ method: "POST", path: "/registry/search", tags: ["registry"] })
  .input(
    z.object({
      registryIds: z
        .array(z.string())
        .min(1, "At least one registry must be selected"),
      searchQuery: z.string().min(1, "Search query is required"),
      maxResults: z.number().int().min(1).max(20).default(10),
      filters: z.array(DiscoverableRecordFilterSchema).optional(),
    }),
  )
  .output(
    z.object({
      registryRecords: z.array(DiscoverableRecordSummarySchema).optional(),
    }),
  )
  .handler(async ({ input }) => {
    const response = await dpClient.send(
      new SearchDiscoverableRegistryRecordsCommand({
        registryIds: input.registryIds,
        searchQuery: input.searchQuery,
        maxResults: input.maxResults,
        filters: input.filters as any,
      }),
    );
    return { registryRecords: response.registryRecords as any };
  });

// ── List Discoverable Registry Records (browse / catalog) ───────────────────
//
// Paginated browse over a registry's APPROVED records. Unlike Search this needs
// no query; supports an optional recordType filter. Returns one page plus a
// nextToken cursor the UI can page through.

export const listDiscoverableRegistryRecords = authed
  .route({
    method: "POST",
    path: "/registry/discoverable/list",
    tags: ["registry"],
  })
  .input(
    z.object({
      registryId: z.string().min(1),
      maxResults: z.number().int().min(1).max(100).default(50),
      nextToken: z.string().optional(),
      filters: z.array(DiscoverableRecordFilterSchema).optional(),
    }),
  )
  .output(
    z.object({
      registryRecords: z.array(DiscoverableRecordSummarySchema),
      nextToken: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    try {
      const response = await dpClient.send(
        new ListDiscoverableRegistryRecordsCommand({
          registryId: input.registryId,
          maxResults: input.maxResults,
          nextToken: input.nextToken,
          filters: input.filters as any,
        }),
      );
      return {
        registryRecords: (response.registryRecords ?? []) as any,
        nextToken: response.nextToken,
      };
    } catch (err: unknown) {
      throw mapAwsError(err, "Failed to list discoverable records");
    }
  });

// ── Batch Get Discoverable Registry Records ─────────────────────────────────
//
// Fetch full details (incl. descriptors) for up to 100 record ids in one call.
// The service accepts exactly one registry entry today; returns per-record
// errors alongside the successful records rather than failing the whole call.

export const batchGetDiscoverableRegistryRecords = authed
  .route({
    method: "POST",
    path: "/registry/discoverable/batch-get",
    tags: ["registry"],
  })
  .input(
    z.object({
      registryId: z.string().min(1),
      recordIds: z.array(z.string().min(1)).min(1).max(100),
    }),
  )
  .output(
    z.object({
      registryRecords: z.array(RegistryRecordDetailSchema),
      errors: z
        .array(
          z.object({
            registryId: z.string().optional(),
            recordId: z.string().optional(),
            errorCode: z.string().optional(),
            message: z.string().optional(),
          }),
        )
        .optional(),
    }),
  )
  .handler(async ({ input }) => {
    try {
      const response = await dpClient.send(
        new BatchGetDiscoverableRegistryRecordCommand({
          entries: [
            { registryId: input.registryId, recordIds: input.recordIds },
          ],
        }),
      );
      return {
        registryRecords: (response.registryRecords ?? []) as any,
        errors: (response.errors ?? []) as any,
      };
    } catch (err: unknown) {
      throw mapAwsError(err, "Failed to batch-get discoverable records");
    }
  });

// ── List Registry Activity ──────────────────────────────────────────────────
//
// Local audit trail (see recordActivity + docs/registry-activity-tracing.md).
// recordId present -> record-scoped (detail page); absent -> registry-scoped
// (registry tab: registry-level + all record events). Actor name/email joined
// from the User table; actor may be null if the user was since deleted.

const ActivityActorSchema = z.object({
  name: z.string(),
  email: z.string(),
});
const RegistryActivityEventSchema = z.object({
  id: z.string(),
  registryId: z.string(),
  recordId: z.string().nullable().optional(),
  type: z.string(),
  description: z.string(),
  actor: ActivityActorSchema.nullable(),
  metadata: z.record(z.string(), z.string()).optional(),
  timestamp: z.coerce.date(),
});

export const listRegistryActivity = authed
  .route({ method: "GET", path: "/registry/activity/list", tags: ["registry"] })
  .input(
    z.object({
      registryId: z.string().min(1),
      recordId: z.string().optional(),
    }),
  )
  .output(z.object({ events: z.array(RegistryActivityEventSchema) }))
  .handler(async ({ input }) => {
    const events = await prisma.registryActivityEvent.findMany({
      where: {
        registryId: input.registryId,
        ...(input.recordId ? { recordId: input.recordId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { name: true, email: true } } },
    });
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      events: events.map((e: any) => ({
        id: e.id,
        registryId: e.registryId,
        recordId: e.recordId,
        type: e.type,
        description: e.description,
        actor: e.actor
          ? { name: e.actor.name, email: e.actor.email }
          : null,
        metadata: (e.metadata ?? undefined) as
          | Record<string, string>
          | undefined,
        timestamp: e.createdAt,
      })),
    };
  });

// ── Error mapping ───────────────────────────────────────────────────────────

function mapAwsError(err: unknown, fallbackMessage: string): ORPCError<any, any> {
  const awsErr = err as { name?: string; message?: string };
  switch (awsErr.name) {
    case "ValidationException":
      return new ORPCError("BAD_REQUEST", {
        message: awsErr.message ?? "Validation failed",
      });
    case "ConflictException":
      return new ORPCError("CONFLICT", {
        message: awsErr.message ?? "Resource conflict",
      });
    case "ResourceNotFoundException":
      return new ORPCError("NOT_FOUND", {
        message: awsErr.message ?? "Resource not found",
      });
    case "AccessDeniedException":
      return new ORPCError("FORBIDDEN", {
        message: awsErr.message ?? "Access denied",
      });
    case "ThrottlingException":
      return new ORPCError("TOO_MANY_REQUESTS", {
        message: awsErr.message ?? "Request throttled",
      });
    default:
      return new ORPCError("INTERNAL_SERVER_ERROR", {
        message: awsErr.message ?? fallbackMessage,
      });
  }
}

// ── Router Export ───────────────────────────────────────────────────────────

export const registryRouter = {
  listRegistries,
  createRegistry,
  updateRegistry,
  deleteRegistry,
  listRegistryRecords,
  getRegistryRecord,
  createRegistryRecord,
  updateRegistryRecord,
  submitRegistryRecord,
  updateRegistryRecordStatus,
  deleteRegistryRecord,
  searchRegistryRecords,
  listDiscoverableRegistryRecords,
  batchGetDiscoverableRegistryRecords,
  listRegistryActivity,
};
