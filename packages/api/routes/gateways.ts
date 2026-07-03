import {
  BedrockAgentCoreControlClient,
  GetGatewayTargetCommand,
  ListGatewaysCommand,
  ListGatewayTargetsCommand,
  ListAgentRuntimesCommand,
  ListAgentRuntimeEndpointsCommand,
} from "@aws-sdk/client-bedrock-agentcore-control";
import { os } from "@orpc/server";
import { z } from "zod";

const REGION = process.env.AGENTCORE_REGION || "us-east-1";
const ACCOUNT_ID =
  process.env.AGENTCORE_ACCOUNT_ID || process.env.AWS_ACCOUNT_ID || "";

const client = new BedrockAgentCoreControlClient({ region: REGION });

// ListGatewaysCommand returns only IDs; AgentCore ARNs are predictable so we
// construct them here for downstream consumers (Cedar policies need the full
// ARN, not just the ID).
function deriveGatewayArn(gatewayId: string): string | undefined {
  if (!ACCOUNT_ID) return undefined;
  return `arn:aws:bedrock-agentcore:${REGION}:${ACCOUNT_ID}:gateway/${gatewayId}`;
}

const GatewayStatusSchema = z.enum([
  "CREATING",
  "UPDATING",
  "UPDATE_UNSUCCESSFUL",
  "DELETING",
  "READY",
  "FAILED",
]);

const GatewaySummarySchema = z.object({
  gatewayId: z.string(),
  gatewayArn: z.string().optional(),
  name: z.string(),
  status: GatewayStatusSchema,
  description: z.string().optional(),
  authorizerType: z.string().optional(),
  protocolType: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Lists AgentCore gateways (paginated), deriving each gateway's full ARN.
export const listGateways = os
  .route({
    method: "GET",
    path: "/gateways/list",
    tags: ["gateways"],
  })
  .input(
    z
      .object({
        maxResults: z.coerce.number().int().min(1).max(100).optional(),
        nextToken: z.string().optional(),
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
    const command = new ListGatewaysCommand({
      maxResults: input?.maxResults,
      nextToken: input?.nextToken,
    });

    const response = await client.send(command);

    return {
      gateways: (response.items ?? []).map((gw) => ({
        gatewayId: gw.gatewayId!,
        gatewayArn: deriveGatewayArn(gw.gatewayId!),
        name: gw.name!,
        status: gw.status as z.infer<typeof GatewayStatusSchema>,
        description: gw.description ?? undefined,
        authorizerType: gw.authorizerType ?? undefined,
        protocolType: gw.protocolType ?? undefined,
        createdAt: gw.createdAt!,
        updatedAt: gw.updatedAt!,
      })),
      nextToken: response.nextToken ?? undefined,
    };
  });

const TargetStatusSchema = z.enum([
  "CREATING",
  "UPDATING",
  "UPDATE_UNSUCCESSFUL",
  "DELETING",
  "READY",
  "FAILED",
  "SYNCHRONIZING",
  "SYNCHRONIZE_UNSUCCESSFUL",
]);

const TargetSummarySchema = z.object({
  targetId: z.string(),
  name: z.string(),
  status: TargetStatusSchema,
  description: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Lists a gateway's targets (paginated) from AgentCore.
export const listGatewayTargets = os
  .route({
    method: "GET",
    path: "/gateways/targets/list",
    tags: ["gateways"],
  })
  .input(
    z.object({
      gatewayId: z.string().min(1),
      maxResults: z.coerce.number().int().min(1).max(100).optional(),
      nextToken: z.string().optional(),
    }),
  )
  .output(
    z.object({
      targets: z.array(TargetSummarySchema),
      nextToken: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    const command = new ListGatewayTargetsCommand({
      gatewayIdentifier: input.gatewayId,
      maxResults: input.maxResults,
      nextToken: input.nextToken,
    });

    const response = await client.send(command);

    return {
      targets: (response.items ?? []).map((t) => ({
        targetId: t.targetId!,
        name: t.name!,
        status: t.status as z.infer<typeof TargetStatusSchema>,
        description: t.description ?? undefined,
        createdAt: t.createdAt!,
        updatedAt: t.updatedAt!,
      })),
      nextToken: response.nextToken ?? undefined,
    };
  });

const ToolSummarySchema = z.object({
  name: z.string(),
  description: z.string(),
});

// Returns the tools exposed by a gateway target, reading from either the Lambda
// inline tool schema or the API Gateway tool overrides.
export const listGatewayTargetTools = os
  .route({
    method: "GET",
    path: "/gateways/targets/tools",
    tags: ["gateways"],
  })
  .input(
    z.object({
      gatewayId: z.string().min(1),
      targetId: z.string().min(1),
    }),
  )
  .output(
    z.object({
      tools: z.array(ToolSummarySchema),
      targetName: z.string(),
    }),
  )
  .handler(async ({ input }) => {
    const command = new GetGatewayTargetCommand({
      gatewayIdentifier: input.gatewayId,
      targetId: input.targetId,
    });

    const response = await client.send(command);
    const tools: z.infer<typeof ToolSummarySchema>[] = [];
    const mcp = response.targetConfiguration?.mcp;

    if (mcp) {
      const lambdaTools = mcp.lambda?.toolSchema?.inlinePayload;
      if (lambdaTools) {
        for (const tool of lambdaTools) {
          if (tool.name) {
            tools.push({
              name: tool.name,
              description: tool.description ?? "",
            });
          }
        }
      }

      const apiGwOverrides =
        mcp.apiGateway?.apiGatewayToolConfiguration?.toolOverrides;
      if (apiGwOverrides) {
        for (const override of apiGwOverrides) {
          if (override.name) {
            tools.push({
              name: override.name,
              description:
                override.description ??
                `${override.method ?? "GET"} ${override.path ?? "/"}`,
            });
          }
        }
      }
    }

    return {
      tools,
      targetName: response.name ?? input.targetId,
    };
  });

const AgentRuntimeStatusSchema = z.enum([
  "CREATING",
  "CREATE_FAILED",
  "UPDATING",
  "UPDATE_FAILED",
  "READY",
  "DELETING",
]);

const AgentRuntimeSummarySchema = z.object({
  agentRuntimeId: z.string(),
  agentRuntimeArn: z.string().optional(),
  name: z.string(),
  status: AgentRuntimeStatusSchema,
  description: z.string().optional(),
  lastUpdatedAt: z.coerce.date(),
});

// Lists AgentCore agent runtimes (paginated).
export const listAgentRuntimes = os
  .route({
    method: "GET",
    path: "/agent-runtimes/list",
    tags: ["agent-runtimes"],
  })
  .input(
    z
      .object({
        maxResults: z.coerce.number().int().min(1).max(100).optional(),
        nextToken: z.string().optional(),
      })
      .optional(),
  )
  .output(
    z.object({
      runtimes: z.array(AgentRuntimeSummarySchema),
      nextToken: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    const command = new ListAgentRuntimesCommand({
      maxResults: input?.maxResults,
      nextToken: input?.nextToken,
    });

    const response = await client.send(command);

    return {
      runtimes: (response.agentRuntimes ?? []).map((rt) => ({
        agentRuntimeId: rt.agentRuntimeId!,
        agentRuntimeArn: (rt as unknown as Record<string, unknown>).agentRuntimeArn as string | undefined,
        name: rt.agentRuntimeName!,
        status: rt.status as z.infer<typeof AgentRuntimeStatusSchema>,
        description:
          rt.description && rt.description.trim()
            ? rt.description
            : undefined,
        lastUpdatedAt: rt.lastUpdatedAt!,
      })),
      nextToken: response.nextToken ?? undefined,
    };
  });

const AgentRuntimeEndpointStatusSchema = z.enum([
  "CREATING",
  "CREATE_FAILED",
  "UPDATING",
  "UPDATE_FAILED",
  "READY",
  "DELETING",
]);

const AgentRuntimeEndpointSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: AgentRuntimeEndpointStatusSchema,
  description: z.string().optional(),
  liveVersion: z.string().optional(),
  targetVersion: z.string().optional(),
  createdAt: z.coerce.date(),
  lastUpdatedAt: z.coerce.date(),
});

// Lists the endpoints for a given agent runtime (paginated).
export const listAgentRuntimeEndpoints = os
  .route({
    method: "GET",
    path: "/agent-runtimes/endpoints/list",
    tags: ["agent-runtimes"],
  })
  .input(
    z.object({
      agentRuntimeId: z.string().min(1),
      maxResults: z.coerce.number().int().min(1).max(100).optional(),
      nextToken: z.string().optional(),
    }),
  )
  .output(
    z.object({
      endpoints: z.array(AgentRuntimeEndpointSummarySchema),
      nextToken: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    const command = new ListAgentRuntimeEndpointsCommand({
      agentRuntimeId: input.agentRuntimeId,
      maxResults: input.maxResults,
      nextToken: input.nextToken,
    });

    const response = await client.send(command);

    return {
      endpoints: (response.runtimeEndpoints ?? []).map((ep) => ({
        id: ep.id!,
        name: ep.name!,
        status: ep.status as z.infer<typeof AgentRuntimeEndpointStatusSchema>,
        description: ep.description ?? undefined,
        liveVersion: ep.liveVersion ?? undefined,
        targetVersion: ep.targetVersion ?? undefined,
        createdAt: ep.createdAt!,
        lastUpdatedAt: ep.lastUpdatedAt!,
      })),
      nextToken: response.nextToken ?? undefined,
    };
  });

export const gatewaysRouter = {
  listGateways,
  listGatewayTargets,
  listGatewayTargetTools,
  listAgentRuntimes,
  listAgentRuntimeEndpoints,
};
