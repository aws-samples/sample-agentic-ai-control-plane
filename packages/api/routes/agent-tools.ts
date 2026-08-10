import {
  AgentRegistryControlClient,
  GetRegistryRecordCommand,
} from "@aws-sdk/client-agent-registry-control";
import { ORPCError, os } from "@orpc/server";
import { prisma } from "@package/database";
import { z } from "zod";
import { materializeGatewayTarget } from "./gateway-targets";
import {
  resolveTargetSpec,
  UnsupportedDescriptorError,
} from "./registry-helpers";

const REGISTRY_REGION = process.env.AGENTCORE_REGISTRY_REGION || "us-west-2";
// Registry reads use the GA agent-registry namespace (records now carry
// recordType + flat descriptors, consumed by resolveTargetSpec).
const registryClient = new AgentRegistryControlClient({ region: REGISTRY_REGION });

const AgentToolSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  name: z.string(),
  type: z.string(),
  metadata: z.unknown(),
  isEnabled: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const TargetStatusSchema = z.enum(["CREATING", "READY", "CREATE_FAILED"]);
const AddAgentToolTargetSchema = z
  .object({
    status: TargetStatusSchema,
    statusReasons: z.array(z.string()),
  })
  .nullable();

// Lists an agent's tools, joining each registry tool to its gateway target's
// materialization status (CREATING/READY/CREATE_FAILED).
export const listAgentTools = os
  .route({
    method: "GET",
    path: "/agent-tools/list",
    tags: ["agent-tools"],
  })
  .input(z.object({ agentId: z.string().min(1, "Agent ID is required") }))
  .output(
    z.object({
      tools: z.array(
        AgentToolSchema.extend({
          target: AddAgentToolTargetSchema,
        }),
      ),
    }),
  )
  .handler(async ({ input }) => {
    const tools = await prisma.agentTool.findMany({
      where: { agentId: input.agentId },
      orderBy: { createdAt: "desc" },
    });
    const recordIds = tools
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((t: any) => (t.metadata as Record<string, unknown>)?.registryRecordId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((v: any): v is string => typeof v === "string");
    type GatewayTargetRecord = { registryRecordId: string; status: string; statusReasons: string[] };
    const targets: GatewayTargetRecord[] =
      recordIds.length > 0
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (await prisma.gatewayTarget.findMany({
            where: { registryRecordId: { in: recordIds } },
          }) as any[]).map((t: any) => ({
            registryRecordId: t.registryRecordId as string,
            status: t.status as string,
            statusReasons: t.statusReasons as string[],
          }))
        : [];
    const byRecord = new Map<string, GatewayTargetRecord>(
      targets.map((t) => [t.registryRecordId, t]),
    );
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: tools.map((t: any) => {
        const recordId = (t.metadata as Record<string, unknown>)?.registryRecordId;
        const target =
          typeof recordId === "string" ? byRecord.get(recordId) : undefined;
        return {
          ...t,
          target: target
            ? { status: target.status as "CREATING" | "READY" | "CREATE_FAILED", statusReasons: target.statusReasons }
            : null,
        };
      }),
    };
  });

// Adds a tool to an agent; for registry tools also materializes a gateway
// target, rolling back the row if required metadata is missing or unsupported.
export const addAgentTool = os
  .route({
    method: "POST",
    path: "/agent-tools/add",
    tags: ["agent-tools"],
  })
  .input(
    z.object({
      agentId: z.string().min(1, "Agent ID is required"),
      name: z.string().min(1, "Name is required"),
      type: z.string().default("registry"),
      metadata: z.unknown(),
      isEnabled: z.boolean().default(true),
    }),
  )
  .output(
    z.object({
      tool: AgentToolSchema,
      target: AddAgentToolTargetSchema,
    }),
  )
  .handler(async ({ input }) => {
    const tool = await prisma.agentTool.create({
      data: {
        agentId: input.agentId,
        name: input.name,
        type: input.type,
        metadata: input.metadata ?? {},
        isEnabled: input.isEnabled,
      },
    });

    if (input.type !== "registry") {
      return { tool, target: null };
    }

    const meta = (input.metadata ?? {}) as Record<string, unknown>;
    const registryRecordId = typeof meta.registryRecordId === "string" ? meta.registryRecordId : null;
    const registryArn = typeof meta.registryArn === "string" ? meta.registryArn : null;
    if (!registryRecordId || !registryArn) {
      await prisma.agentTool.delete({ where: { id: tool.id } });
      throw new ORPCError("BAD_REQUEST", {
        message: "registry tools require metadata.registryRecordId and metadata.registryArn",
      });
    }

    try {
      const target = await materializeGatewayTarget({
        registryRecordId,
        registryArn,
        registryRecordName: input.name,
        fetchTargetSpec: async () => {
          const registryId = registryArn.split("/").pop() ?? "";
          const resp = await registryClient.send(
            new GetRegistryRecordCommand({
              registryId,
              recordId: registryRecordId,
            }),
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return resolveTargetSpec(resp as any);
        },
      });
      return {
        tool,
        target: {
          status: target.status,
          statusReasons: target.statusReasons,
        },
      };
    } catch (err) {
      if (err instanceof UnsupportedDescriptorError) {
        // Roll back the AgentTool row so the UI doesn't show a tool that can never materialize.
        await prisma.agentTool.delete({ where: { id: tool.id } });
        throw new ORPCError("UNSUPPORTED_DESCRIPTOR", {
          message: err.message,
        });
      }
      throw err;
    }
  });

// Updates an agent tool's name, metadata, and/or enabled flag.
export const updateAgentTool = os
  .route({
    method: "PATCH",
    path: "/agent-tools/update",
    tags: ["agent-tools"],
  })
  .input(
    z.object({
      id: z.string().min(1, "Tool ID is required"),
      name: z.string().min(1).optional(),
      metadata: z.unknown().optional(),
      isEnabled: z.boolean().optional(),
    }),
  )
  .output(z.object({ tool: AgentToolSchema }))
  .handler(async ({ input }) => {
    const { id, metadata, ...rest } = input;

    const tool = await prisma.agentTool.update({
      where: { id },
      data: {
        ...rest,
        ...(metadata !== undefined ? { metadata: metadata ?? {} } : {}),
      },
    });

    return { tool };
  });

// Deletes an agent tool row by id.
export const removeAgentTool = os
  .route({
    method: "DELETE",
    path: "/agent-tools/remove",
    tags: ["agent-tools"],
  })
  .input(
    z.object({
      id: z.string().min(1, "Tool ID is required"),
    }),
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => {
    await prisma.agentTool.delete({
      where: { id: input.id },
    });

    return { success: true };
  });

export const agentToolsRouter = {
  listAgentTools,
  addAgentTool,
  updateAgentTool,
  removeAgentTool,
};
