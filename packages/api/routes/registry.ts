import {
  BedrockAgentCoreClient,
  SearchRegistryRecordsCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import type {
  CreateRegistryRecordCommandInput,
  UpdateRegistryRecordCommandInput,
} from "@aws-sdk/client-bedrock-agentcore-control";
import {
  BedrockAgentCoreControlClient,
  CreateRegistryCommand,
  CreateRegistryRecordCommand,
  DeleteRegistryCommand,
  DeleteRegistryRecordCommand,
  GetRegistryRecordCommand,
  ListRegistriesCommand,
  ListRegistryRecordsCommand,
  SubmitRegistryRecordForApprovalCommand,
  UpdateRegistryCommand,
  UpdateRegistryRecordCommand,
  UpdateRegistryRecordStatusCommand,
} from "@aws-sdk/client-bedrock-agentcore-control";
import { ORPCError, os } from "@orpc/server";
import { z } from "zod";

const REGION = process.env.AGENTCORE_REGISTRY_REGION || "us-east-1";
const cpClient = new BedrockAgentCoreControlClient({ region: REGION });
const dpClient = new BedrockAgentCoreClient({ region: REGION });

// ── Shared Schemas ──────────────────────────────────────────────────────────

const ApprovalConfigurationSchema = z.object({ autoApproval: z.boolean() });

const RegistrySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  registryId: z.string(),
  registryArn: z.string(),
  status: z.enum(["CREATING", "READY", "DELETING", "UPDATING"]),
  approvalConfiguration: ApprovalConfigurationSchema.optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date(),
});

const RecordStatusSchema = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "DEPRECATED",
  "CREATING",
  "UPDATING",
  "CREATE_FAILED",
  "UPDATE_FAILED",
]);
const DescriptorTypeSchema = z.enum(["MCP", "A2A", "CUSTOM", "AGENT_SKILLS"]);

const RegistryRecordSchema = z.object({
  registryArn: z.string(),
  recordId: z.string().optional(),
  recordArn: z.string().optional(),
  name: z.string(),
  descriptorType: DescriptorTypeSchema.optional(),
  recordVersion: z.string().optional(),
  status: RecordStatusSchema,
  description: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

const SchemaContentSchema = z.object({
  inlineContent: z.string(),
  schemaVersion: z.string().optional(),
  protocolVersion: z.string().optional(),
});
const McpDescriptorSchema = z.object({
  server: SchemaContentSchema.optional(),
  tools: SchemaContentSchema.optional(),
});
const A2aDescriptorSchema = z.object({
  agentCard: SchemaContentSchema.optional(),
});
const CustomDescriptorSchema = z.object({ inlineContent: z.string() });
const AgentSkillsDescriptorSchema = z.object({
  skillMd: SchemaContentSchema.optional(),
  skillDefinition: SchemaContentSchema.optional(),
});
const DescriptorsSchema = z.object({
  mcp: McpDescriptorSchema.optional(),
  a2a: A2aDescriptorSchema.optional(),
  custom: CustomDescriptorSchema.optional(),
  agentSkills: AgentSkillsDescriptorSchema.optional(),
});

const IamCredentialProviderSchema = z.object({
  roleArn: z.string(),
  service: z.string(),
  region: z.string().optional(),
});
const OauthCredentialProviderSchema = z.object({
  providerArn: z.string(),
  grantType: z.string().default("CLIENT_CREDENTIALS"),
  scopes: z.array(z.string()).optional(),
  customParameters: z.record(z.string(), z.string()).optional(),
});
const CredentialProviderConfigSchema = z.object({
  credentialProviderType: z.enum(["OAUTH", "IAM"]),
  credentialProvider: z.object({
    oauthCredentialProvider: OauthCredentialProviderSchema.optional(),
    iamCredentialProvider: IamCredentialProviderSchema.optional(),
  }),
});
const SyncConfigurationSchema = z.object({
  fromUrl: z.object({
    url: z.string(),
    credentialProviderConfigurations: z
      .array(CredentialProviderConfigSchema)
      .optional(),
  }),
});

const RegistryRecordDetailSchema = z.object({
  registryArn: z.string(),
  recordId: z.string().optional(),
  recordArn: z.string().optional(),
  name: z.string(),
  descriptorType: DescriptorTypeSchema.optional(),
  recordVersion: z.string().optional(),
  status: RecordStatusSchema,
  statusReason: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  descriptors: DescriptorsSchema.optional(),
  synchronizationType: z.enum(["URL", "MANUAL"]).optional(),
  synchronizationConfiguration: SyncConfigurationSchema.optional(),
});

// ── List Registries ─────────────────────────────────────────────────────────

export const listRegistries = os
  .route({ method: "GET", path: "/registry/list", tags: ["registry"] })
  .input(
    z
      .object({
        status: z
          .enum(["CREATING", "READY", "DELETING", "UPDATING"])
          .optional(),
      })
      .optional(),
  )
  .output(z.object({ registries: z.array(RegistrySchema) }))
  .handler(async ({ input }) => {
    const response = await cpClient.send(new ListRegistriesCommand({}));
    let registries = (response.registries ?? []).map((r) => ({
      name: r.name!,
      description: r.description,
      registryId: r.registryId!,
      registryArn: r.registryArn!,
      status: r.status as z.infer<typeof RegistrySchema>["status"],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt!,
    }));
    if (input?.status)
      registries = registries.filter((r) => r.status === input.status);
    return { registries };
  });

// ── Create Registry ─────────────────────────────────────────────────────────

export const createRegistry = os
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
      approvalConfiguration: ApprovalConfigurationSchema.optional(),
    }),
  )
  .output(z.object({ registryArn: z.string() }))
  .handler(async ({ input }) => {
    // Check for duplicate name
    const existing = await cpClient.send(new ListRegistriesCommand({}));
    if (existing.registries?.some((r) => r.name === input.name)) {
      throw new ORPCError("CONFLICT", {
        message: `Registry with name '${input.name}' already exists`,
      });
    }
    const response = await cpClient.send(
      new CreateRegistryCommand({
        name: input.name,
        description: input.description,
        approvalConfiguration: input.approvalConfiguration || {
          autoApproval: false,
        },
      }),
    );
    return { registryArn: response.registryArn! };
  });

// ── Update Registry ─────────────────────────────────────────────────────────

export const updateRegistry = os
  .route({ method: "PATCH", path: "/registry/update", tags: ["registry"] })
  .input(
    z.object({
      registryId: z.string().min(1),
      description: z.string().optional(),
      approvalConfiguration: ApprovalConfigurationSchema.optional(),
    }),
  )
  .output(RegistrySchema)
  .handler(async ({ input }) => {
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
      }),
    );
    return response as unknown as z.infer<typeof RegistrySchema>;
  });

// ── Delete Registry ─────────────────────────────────────────────────────────

export const deleteRegistry = os
  .route({ method: "DELETE", path: "/registry/delete", tags: ["registry"] })
  .input(z.object({ registryId: z.string().min(1) }))
  .output(z.object({ success: z.boolean(), message: z.string().optional() }))
  .handler(async ({ input }) => {
    await cpClient.send(
      new DeleteRegistryCommand({ registryId: input.registryId }),
    );
    return { success: true, message: "Registry deleted successfully" };
  });

// ── List Registry Records ───────────────────────────────────────────────────

export const listRegistryRecords = os
  .route({ method: "GET", path: "/registry/records/list", tags: ["registry"] })
  .input(
    z.object({
      registryId: z.string().min(1),
      status: RecordStatusSchema.optional(),
    }),
  )
  .output(z.object({ registryRecords: z.array(RegistryRecordSchema) }))
  .handler(async ({ input }) => {
    const response = await cpClient.send(
      new ListRegistryRecordsCommand({
        registryId: input.registryId,
        status: input.status,
      }),
    );
    return {
      registryRecords: (response.registryRecords ?? []).map((r) => ({
        registryArn: r.registryArn!,
        recordId: r.recordId,
        recordArn: r.recordArn,
        name: r.name!,
        descriptorType: r.descriptorType as
          | z.infer<typeof DescriptorTypeSchema>
          | undefined,
        recordVersion: r.recordVersion,
        status: r.status as z.infer<typeof RecordStatusSchema>,
        description: r.description,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    };
  });

// ── Get Registry Record ─────────────────────────────────────────────────────

export const getRegistryRecord = os
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

export const createRegistryRecord = os
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
        })
        .optional(),
      protocol: DescriptorTypeSchema,
      description: z.string().optional(),
      recordVersion: z.string().default("1.0"),
      synchronizationType: z.enum(["URL", "MANUAL"]).default("URL"),
      synchronizationConfiguration: SyncConfigurationSchema.optional(),
      descriptors: DescriptorsSchema.optional(),
    }),
  )
  .output(
    z.object({
      recordArn: z.string().optional(),
      recordId: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    const params: CreateRegistryRecordCommandInput = {
      registryId: input.registryId,
      name: input.name!,
      descriptorType: input.protocol,
      description: input.description,
      recordVersion: input.recordVersion,
    };
    if (
      input.synchronizationType === "URL" &&
      input.synchronizationConfiguration
    ) {
      params.synchronizationType = "URL";
      params.synchronizationConfiguration =
        input.synchronizationConfiguration as CreateRegistryRecordCommandInput["synchronizationConfiguration"];
      params.name = input.name || "url_record";
    } else if (input.descriptors) {
      // Strip undefined/null keys to avoid SDK serialization errors
      const clean: Record<string, any> = {};
      for (const [k, v] of Object.entries(input.descriptors)) {
        if (v != null) clean[k] = v;
      }
      params.descriptors =
        clean as CreateRegistryRecordCommandInput["descriptors"];
    }
    try {
      const response = await cpClient.send(
        new CreateRegistryRecordCommand(params),
      );
      const recordId = response.recordArn?.split("/").pop();
      return { recordArn: response.recordArn, recordId };
    } catch (err: unknown) {
      const awsErr = err as { name?: string; message?: string };
      if (awsErr.name === "ValidationException") {
        throw new ORPCError("BAD_REQUEST", {
          message: awsErr.message ?? "Record validation failed",
        });
      }
      if (awsErr.name === "ConflictException") {
        throw new ORPCError("CONFLICT", {
          message: awsErr.message ?? "Record already exists",
        });
      }
      if (awsErr.name === "ResourceNotFoundException") {
        throw new ORPCError("NOT_FOUND", {
          message: awsErr.message ?? "Registry not found",
        });
      }
      if (awsErr.name === "AccessDeniedException") {
        throw new ORPCError("FORBIDDEN", {
          message: awsErr.message ?? "Access denied",
        });
      }
      if (awsErr.name === "ThrottlingException") {
        throw new ORPCError("TOO_MANY_REQUESTS", {
          message: awsErr.message ?? "Request throttled",
        });
      }
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: awsErr.message ?? "Failed to create registry record",
      });
    }
  });

// ── Submit Registry Record for Approval ─────────────────────────────────────

export const submitRegistryRecord = os
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
        status: RecordStatusSchema.optional(),
        name: z.string().optional(),
      })
      .optional(),
  )
  .handler(async ({ input }) => {
    try {
      const response = await cpClient.send(
        new SubmitRegistryRecordForApprovalCommand({
          registryId: input.registryId,
          recordId: input.recordId,
        }),
      );
      return response as any;
    } catch (err: unknown) {
      const awsErr = err as { name?: string; message?: string };
      if (awsErr.name === "ValidationException") {
        throw new ORPCError("BAD_REQUEST", {
          message: awsErr.message ?? "Record submission failed validation",
        });
      }
      if (awsErr.name === "ConflictException") {
        throw new ORPCError("CONFLICT", {
          message: awsErr.message ?? "Record cannot be submitted in its current state",
        });
      }
      if (awsErr.name === "ResourceNotFoundException") {
        throw new ORPCError("NOT_FOUND", {
          message: awsErr.message ?? "Record not found",
        });
      }
      if (awsErr.name === "AccessDeniedException") {
        throw new ORPCError("FORBIDDEN", {
          message: awsErr.message ?? "Access denied",
        });
      }
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: awsErr.message ?? "Failed to submit record for approval",
      });
    }
  });

// ── Update Registry Record Status ───────────────────────────────────────────

export const updateRegistryRecordStatus = os
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
        status: RecordStatusSchema.optional(),
        name: z.string().optional(),
      })
      .optional(),
  )
  .handler(async ({ input }) => {
    const response = await cpClient.send(
      new UpdateRegistryRecordStatusCommand({
        registryId: input.registryId,
        recordId: input.recordId,
        status: input.status,
        statusReason: input.statusReason || `Status changed to ${input.status}`,
      }),
    );
    return response as any;
  });

// ── Delete Registry Record ──────────────────────────────────────────────────

export const deleteRegistryRecord = os
  .route({
    method: "DELETE",
    path: "/registry/records/delete",
    tags: ["registry"],
  })
  .input(
    z.object({ registryId: z.string().min(1), recordId: z.string().min(1) }),
  )
  .output(z.object({ success: z.boolean(), message: z.string().optional() }))
  .handler(async ({ input }) => {
    await cpClient.send(
      new DeleteRegistryRecordCommand({
        registryId: input.registryId,
        recordId: input.recordId,
      }),
    );
    return { success: true, message: "Registry record deleted successfully" };
  });

// ── Update Registry Record ──────────────────────────────────────────────────

export const updateRegistryRecord = os
  .route({
    method: "PATCH",
    path: "/registry/records/update",
    tags: ["registry"],
  })
  .input(
    z.object({
      registryId: z.string().min(1),
      recordId: z.string().min(1),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      protocol: DescriptorTypeSchema.optional(),
      descriptors: DescriptorsSchema.optional(),
      recordVersion: z.string().optional(),
      triggerSynchronization: z.boolean().optional(),
      synchronizationConfiguration: z
        .object({
          optionalValue: z.object({
            fromUrl: z.object({
              url: z.string().url(),
              credentialProviderConfigurations: z
                .array(CredentialProviderConfigSchema)
                .optional(),
            }),
          }),
        })
        .optional(),
    }),
  )
  .output(RegistryRecordDetailSchema)
  .handler(async ({ input }) => {
    const params: UpdateRegistryRecordCommandInput = {
      registryId: input.registryId,
      recordId: input.recordId,
    };
    if (input.name !== undefined) params.name = input.name;
    if (input.description !== undefined)
      params.description = { optionalValue: input.description };
    if (input.recordVersion !== undefined)
      params.recordVersion = input.recordVersion;
    if (input.descriptors !== undefined) {
      // Wrap descriptors in the optionalValue structure the SDK expects
      const wrapped: Record<string, any> = {};
      if (input.descriptors.mcp) {
        wrapped.mcp = {
          optionalValue: {
            server: input.descriptors.mcp.server
              ? { optionalValue: input.descriptors.mcp.server }
              : undefined,
            tools: input.descriptors.mcp.tools
              ? { optionalValue: input.descriptors.mcp.tools }
              : undefined,
          },
        };
      }
      if (input.descriptors.a2a) {
        wrapped.a2a = { optionalValue: input.descriptors.a2a };
      }
      if (input.descriptors.custom) {
        wrapped.custom = { optionalValue: input.descriptors.custom };
      }
      if (input.descriptors.agentSkills) {
        wrapped.agentSkills = {
          optionalValue: {
            skillMd: input.descriptors.agentSkills.skillMd
              ? { optionalValue: input.descriptors.agentSkills.skillMd }
              : undefined,
            skillDefinition: input.descriptors.agentSkills.skillDefinition
              ? { optionalValue: input.descriptors.agentSkills.skillDefinition }
              : undefined,
          },
        };
      }
      params.descriptors = { optionalValue: wrapped };
    }
    if (input.triggerSynchronization) params.triggerSynchronization = true;
    if (input.synchronizationConfiguration)
      params.synchronizationConfiguration =
        input.synchronizationConfiguration as UpdateRegistryRecordCommandInput["synchronizationConfiguration"];
    const response = await cpClient.send(
      new UpdateRegistryRecordCommand(params),
    );
    return response as unknown as z.infer<typeof RegistryRecordDetailSchema>;
  });

// ── Search Registry Records (Data Plane) ────────────────────────────────────

export const searchRegistryRecords = os
  .route({ method: "POST", path: "/registry/search", tags: ["registry"] })
  .input(
    z.object({
      registryIds: z
        .array(z.string())
        .min(1, "At least one registry must be selected"),
      searchQuery: z.string().min(1, "Search query is required"),
      maxResults: z.number().int().min(1).max(50).default(10),
    }),
  )
  .output(
    z.object({
      registryRecords: z
        .array(
          z.object({
            registryArn: z.string(),
            name: z.string(),
            protocol: z.string().optional(),
            recordVersion: z.string().optional(),
            status: z.string().optional(),
            description: z.string().optional(),
            createdAt: z.coerce.date().optional(),
            updatedAt: z.coerce.date().optional(),
          }),
        )
        .optional(),
    }),
  )
  .handler(async ({ input }) => {
    const response = await dpClient.send(
      new SearchRegistryRecordsCommand({
        registryIds: input.registryIds,
        searchQuery: input.searchQuery,
        maxResults: input.maxResults,
      }),
    );
    return { registryRecords: response.registryRecords as any };
  });

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
};
