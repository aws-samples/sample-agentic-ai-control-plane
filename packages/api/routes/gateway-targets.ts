import { createHash } from "node:crypto";
import {
  AgentRegistryControlClient,
  GetRegistryRecordCommand,
} from "@aws-sdk/client-agent-registry-control";
import {
  BedrockAgentCoreControlClient,
  CreateGatewayTargetCommand,
  ListGatewayTargetsCommand,
  UpdateGatewayTargetCommand,
} from "@aws-sdk/client-bedrock-agentcore-control";
import { ORPCError } from "@orpc/server";
import { authed } from "../context";
import { prisma } from "@package/database";
import { z } from "zod";
import {
  resolveTargetSpec,
  type TargetSpec,
} from "./registry-helpers";

const REGISTRY_REGION = process.env.AGENTCORE_REGISTRY_REGION || "us-west-2";
// Registry reads use the GA agent-registry namespace; gateway ops below stay on
// bedrock-agentcore (only Registry changed namespace at GA).
const registryClient = new AgentRegistryControlClient({ region: REGISTRY_REGION });

export type MaterializeInput = {
  registryRecordId: string;
  registryArn: string;
  registryRecordName: string;
  fetchTargetSpec: () => Promise<TargetSpec>;
};

export type GatewayTargetRow = {
  id: string;
  registryRecordId: string;
  awsTargetId: string | null;
  targetName: string;
  status: "CREATING" | "READY" | "CREATE_FAILED";
  statusReasons: string[];
};

const REGION = process.env.AGENTCORE_REGION || "us-east-1";
const awsClient = new BedrockAgentCoreControlClient({ region: REGION });

// Builds a deterministic, AWS-valid target name from the record name plus a
// short hash of the registryRecordId so the same record always maps to one target.
function deriveTargetName(recordName: string, registryRecordId: string): string {
  const hash = createHash("sha256")
    .update(registryRecordId)
    .digest("hex")
    .slice(0, 6);
  // Gateway target names must match [A-Za-z0-9-]{1,100}.
  const slug = recordName.replace(/[^A-Za-z0-9-]/g, "-").slice(0, 90);
  return `${slug || "tool"}-${hash}`;
}

// Looks for an existing gateway target with the given name. Returns its AWS
// IDs if found so the caller can adopt instead of issuing a redundant
// CreateGatewayTargetCommand (which would fail with ConflictException).
// Names are derived deterministically from registryRecordId, so a name match
// implies same tool by the contract documented in deriveTargetName.
async function findExistingTargetByName(
  gatewayId: string,
  targetName: string,
): Promise<{ targetId: string; targetArn: string | null } | null> {
  let nextToken: string | undefined;
  do {
    const resp = await awsClient.send(
      new ListGatewayTargetsCommand({
        gatewayIdentifier: gatewayId,
        nextToken,
      }),
    );
    for (const item of resp.items ?? []) {
      if (item.name === targetName && typeof item.targetId === "string") {
        return { targetId: item.targetId, targetArn: null };
      }
    }
    nextToken = resp.nextToken;
  } while (nextToken);
  return null;
}

// Builds a CreateGatewayTarget command for either an MCP-server or Lambda spec.
function buildCreateCommand(
  targetName: string,
  gatewayId: string,
  spec: TargetSpec,
): CreateGatewayTargetCommand {
  if (spec.kind === "mcpServer") {
    return new CreateGatewayTargetCommand({
      gatewayIdentifier: gatewayId,
      name: targetName,
      targetConfiguration: { mcp: { mcpServer: { endpoint: spec.endpoint } } },
    });
  }
  return new CreateGatewayTargetCommand({
    gatewayIdentifier: gatewayId,
    name: targetName,
    targetConfiguration: {
      mcp: {
        lambda: {
          lambdaArn: spec.lambdaArn,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          toolSchema: { inlinePayload: spec.toolSchema as any },
        },
      },
    },
    // Lambda targets require credentialProviderConfigurations
    credentialProviderConfigurations: [
      { credentialProviderType: "GATEWAY_IAM_ROLE" },
    ],
  });
}

// Builds an UpdateGatewayTarget command for either an MCP-server or Lambda spec.
function buildUpdateCommand(
  targetId: string,
  targetName: string,
  gatewayId: string,
  spec: TargetSpec,
): UpdateGatewayTargetCommand {
  if (spec.kind === "mcpServer") {
    return new UpdateGatewayTargetCommand({
      gatewayIdentifier: gatewayId,
      targetId,
      name: targetName,
      targetConfiguration: { mcp: { mcpServer: { endpoint: spec.endpoint } } },
    });
  }
  return new UpdateGatewayTargetCommand({
    gatewayIdentifier: gatewayId,
    targetId,
    name: targetName,
    targetConfiguration: {
      mcp: {
        lambda: {
          lambdaArn: spec.lambdaArn,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          toolSchema: { inlinePayload: spec.toolSchema as any },
        },
      },
    },
    credentialProviderConfigurations: [
      { credentialProviderType: "GATEWAY_IAM_ROLE" },
    ],
  });
}

// Idempotently ensures a gateway target exists for a registry record: reuses a
// READY row, adopts/creates the AWS target for new or failed rows, and persists
// the resulting status. Returns the current row (possibly still CREATING).
export async function materializeGatewayTarget(
  input: MaterializeInput,
): Promise<GatewayTargetRow> {
  const gatewayId = process.env.AGENTCORE_GATEWAY_ID;
  if (!gatewayId) {
    throw new Error("AGENTCORE_GATEWAY_ID env var is required");
  }

  const existing = await prisma.gatewayTarget.findUnique({
    where: { registryRecordId: input.registryRecordId },
  });
  if (existing && existing.status === "READY") {
    return existing as GatewayTargetRow;
  }

  if (
    existing &&
    (existing.status === "CREATE_FAILED" ||
      existing.status === "MISSING_FROM_GATEWAY")
  ) {
    const adopted = await findExistingTargetByName(gatewayId, existing.targetName);
    const spec = await input.fetchTargetSpec();
    if (adopted) {
      try {
        const aws = await awsClient.send(
          buildUpdateCommand(adopted.targetId, existing.targetName, gatewayId, spec),
        );
        const awsRaw = aws as unknown as Record<string, unknown>;
        const updated = await prisma.gatewayTarget.update({
          where: { id: existing.id },
          data: {
            awsTargetId: adopted.targetId,
            awsTargetArn:
              (awsRaw.targetArn as string | undefined) ?? adopted.targetArn,
            status: "READY",
            statusReasons: [],
          },
        });
        console.log(
          `[gateway-target] adopt+update kind=${spec.kind} registryRecordId=${input.registryRecordId} awsTargetId=${adopted.targetId}`,
        );
        return updated as GatewayTargetRow;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const updated = await prisma.gatewayTarget.update({
          where: { id: existing.id },
          data: {
            status: "CREATE_FAILED",
            statusReasons: [`adopt+update failed: ${message}`],
          },
        });
        return updated as GatewayTargetRow;
      }
    }
    try {
      const aws = await awsClient.send(
        buildCreateCommand(existing.targetName, gatewayId, spec),
      );
      const awsRaw = aws as unknown as Record<string, unknown>;
      const updated = await prisma.gatewayTarget.update({
        where: { id: existing.id },
        data: {
          awsTargetId: aws.targetId ?? null,
          awsTargetArn: (awsRaw.targetArn as string | undefined) ?? null,
          status: "READY",
          statusReasons: [],
        },
      });
      console.log(
        `[gateway-target] create kind=${spec.kind} registryRecordId=${input.registryRecordId} awsTargetId=${aws.targetId ?? "null"}`,
      );
      return updated as GatewayTargetRow;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const updated = await prisma.gatewayTarget.update({
        where: { id: existing.id },
        data: {
          status: "CREATE_FAILED",
          statusReasons: [message],
        },
      });
      return updated as GatewayTargetRow;
    }
  }

  const targetName = existing?.targetName ??
    deriveTargetName(input.registryRecordName, input.registryRecordId);

  let row = existing;
  if (!row) {
    const spec = await input.fetchTargetSpec();
    try {
      row = await prisma.gatewayTarget.create({
        data: {
          registryRecordId: input.registryRecordId,
          registryArn: input.registryArn,
          awsGatewayId: gatewayId,
          targetName,
          status: "CREATING",
        },
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "P2002") {
        const winner = await prisma.gatewayTarget.findUnique({
          where: { registryRecordId: input.registryRecordId },
        });
        if (winner) return winner as GatewayTargetRow;
      }
      throw err;
    }
    const adopted = await findExistingTargetByName(gatewayId, row.targetName);
    if (adopted) {
      try {
        const aws = await awsClient.send(
          buildUpdateCommand(adopted.targetId, row.targetName, gatewayId, spec),
        );
        const awsRaw = aws as unknown as Record<string, unknown>;
        const updated = await prisma.gatewayTarget.update({
          where: { id: row.id },
          data: {
            awsTargetId: adopted.targetId,
            awsTargetArn:
              (awsRaw.targetArn as string | undefined) ?? adopted.targetArn,
            status: "READY",
            statusReasons: [],
          },
        });
        console.log(
          `[gateway-target] adopt+update kind=${spec.kind} registryRecordId=${input.registryRecordId} awsTargetId=${adopted.targetId}`,
        );
        return updated as GatewayTargetRow;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const updated = await prisma.gatewayTarget.update({
          where: { id: row.id },
          data: {
            status: "CREATE_FAILED",
            statusReasons: [`adopt+update failed: ${message}`],
          },
        });
        return updated as GatewayTargetRow;
      }
    }
    try {
      const aws = await awsClient.send(
        buildCreateCommand(row.targetName, gatewayId, spec),
      );
      const awsRaw = aws as unknown as Record<string, unknown>;
      const updated = await prisma.gatewayTarget.update({
        where: { id: row.id },
        data: {
          awsTargetId: aws.targetId ?? null,
          awsTargetArn: (awsRaw.targetArn as string | undefined) ?? null,
          status: "READY",
        },
      });
      console.log(
        `[gateway-target] create kind=${spec.kind} registryRecordId=${input.registryRecordId} awsTargetId=${aws.targetId ?? "null"}`,
      );
      return updated as GatewayTargetRow;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const updated = await prisma.gatewayTarget.update({
        where: { id: row.id },
        data: {
          status: "CREATE_FAILED",
          statusReasons: [message],
        },
      });
      return updated as GatewayTargetRow;
    }
  }

  // Existing CREATING row (in-flight materialization). Return as-is so the
  // caller can poll until status flips to READY or CREATE_FAILED.
  return row as GatewayTargetRow;
}

const StatusSchema = z.enum([
  "CREATING",
  "READY",
  "CREATE_FAILED",
  "MISSING_FROM_GATEWAY",
]);

const GatewayTargetSchema = z.object({
  id: z.string(),
  registryRecordId: z.string(),
  awsTargetId: z.string().nullable(),
  awsTargetArn: z.string().nullable(),
  targetName: z.string(),
  status: StatusSchema,
  statusReasons: z.array(z.string()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Returns the gateway target row for a registryRecordId, or null if none exists.
export const getGatewayTarget = authed
  .route({
    method: "GET",
    path: "/gateway-targets/get",
    tags: ["gateway-targets"],
  })
  .input(z.object({ registryRecordId: z.string().min(1) }))
  .output(z.object({ target: GatewayTargetSchema.nullable() }))
  .handler(async ({ input }) => {
    const target = await prisma.gatewayTarget.findUnique({
      where: { registryRecordId: input.registryRecordId },
    });
    return { target: target as z.infer<typeof GatewayTargetSchema> | null };
  });

// Re-materializes a non-READY gateway target by refetching its spec from the
// registry; returns the existing row unchanged if already READY.
export const retryGatewayTarget = authed
  .route({
    method: "POST",
    path: "/gateway-targets/retry",
    tags: ["gateway-targets"],
  })
  .input(z.object({ registryRecordId: z.string().min(1) }))
  .output(z.object({ target: GatewayTargetSchema }))
  .handler(async ({ input }) => {
    const existing = await prisma.gatewayTarget.findUnique({
      where: { registryRecordId: input.registryRecordId },
    });
    if (!existing) {
      throw new ORPCError("NOT_FOUND", {
        message: "Gateway target not found for that registryRecordId",
      });
    }
    if (existing.status === "READY") {
      return { target: existing as z.infer<typeof GatewayTargetSchema> };
    }
    // Re-materialize the failed or creating target.
    const result = await materializeGatewayTarget({
      registryRecordId: existing.registryRecordId,
      registryArn: existing.registryArn,
      registryRecordName: existing.targetName,
      fetchTargetSpec: async () => {
        const registryId = existing.registryArn.split("/").pop() ?? "";
        const resp = await registryClient.send(
          new GetRegistryRecordCommand({
            registryId,
            recordId: existing.registryRecordId,
          }),
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return resolveTargetSpec(resp as any);
      },
    });
    return { target: result as z.infer<typeof GatewayTargetSchema> };
  });

// Drift reconciliation. Lists every target on the live gateway and compares
// to the DB. Each DB row whose `awsTargetId` no longer appears in the live
// list is flipped to MISSING_FROM_GATEWAY (with a reason). Conversely, if a
// row is marked MISSING but reappears, it's flipped back to READY. We never
// delete DB rows or recreate AWS targets here — the prototype's gateway is
// shared, so silent auto-heal is unsafe. Surfacing drift is the goal.
export const syncGatewayTargets = authed
  .route({
    method: "POST",
    path: "/gateway-targets/sync",
    tags: ["gateway-targets"],
  })
  .input(z.object({ awsGatewayId: z.string().optional() }).optional())
  .output(
    z.object({
      gatewayId: z.string(),
      liveTargetCount: z.number(),
      dbRowCount: z.number(),
      markedMissing: z.array(
        z.object({
          registryRecordId: z.string(),
          targetName: z.string(),
          awsTargetId: z.string().nullable(),
        }),
      ),
      restoredToReady: z.array(
        z.object({
          registryRecordId: z.string(),
          targetName: z.string(),
        }),
      ),
    }),
  )
  .handler(async ({ input }) => {
    const gatewayId =
      input?.awsGatewayId ?? process.env.AGENTCORE_GATEWAY_ID ?? "";
    if (!gatewayId) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "awsGatewayId not provided and AGENTCORE_GATEWAY_ID env var not set",
      });
    }

    // Page through ListGatewayTargets for the gateway. The control-plane API
    // returns up to 100 per page; for a prototype this should be one page,
    // but we paginate defensively.
    const liveTargetIds = new Set<string>();
    let nextToken: string | undefined;
    do {
      const resp = await awsClient.send(
        new ListGatewayTargetsCommand({
          gatewayIdentifier: gatewayId,
          nextToken,
        }),
      );
      for (const item of resp.items ?? []) {
        if (item.targetId) liveTargetIds.add(item.targetId);
      }
      nextToken = resp.nextToken;
    } while (nextToken);

    const dbRows = await prisma.gatewayTarget.findMany({
      where: { awsGatewayId: gatewayId },
    });

    const markedMissing: Array<{
      registryRecordId: string;
      targetName: string;
      awsTargetId: string | null;
    }> = [];
    const restoredToReady: Array<{
      registryRecordId: string;
      targetName: string;
    }> = [];

    for (const row of dbRows) {
      const stillLive =
        row.awsTargetId !== null && liveTargetIds.has(row.awsTargetId);
      if (!stillLive && row.status === "READY") {
        await prisma.gatewayTarget.update({
          where: { id: row.id },
          data: {
            status: "MISSING_FROM_GATEWAY",
            statusReasons: [
              `Target ${row.awsTargetId ?? "(no awsTargetId)"} not found in live gateway ${gatewayId} on ${new Date().toISOString()}`,
            ],
          },
        });
        markedMissing.push({
          registryRecordId: row.registryRecordId,
          targetName: row.targetName,
          awsTargetId: row.awsTargetId,
        });
      } else if (stillLive && row.status === "MISSING_FROM_GATEWAY") {
        await prisma.gatewayTarget.update({
          where: { id: row.id },
          data: { status: "READY", statusReasons: [] },
        });
        restoredToReady.push({
          registryRecordId: row.registryRecordId,
          targetName: row.targetName,
        });
      }
    }

    return {
      gatewayId,
      liveTargetCount: liveTargetIds.size,
      dbRowCount: dbRows.length,
      markedMissing,
      restoredToReady,
    };
  });

export const gatewayTargetsRouter = {
  getGatewayTarget,
  retryGatewayTarget,
  syncGatewayTargets,
};
