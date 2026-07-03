import { describe, expect, it, vi, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import {
  BedrockAgentCoreControlClient,
  CreateGatewayTargetCommand,
} from "@aws-sdk/client-bedrock-agentcore-control";
import type { prisma as PrismaType } from "@package/database";
import type { materializeGatewayTarget as MaterializeFn } from "./gateway-targets.js";

vi.mock("@package/database", () => ({
  prisma: {
    gatewayTarget: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const awsMock = mockClient(BedrockAgentCoreControlClient as never) as any;

beforeEach(() => {
  vi.clearAllMocks();
  awsMock.reset();
  process.env.AGENTCORE_GATEWAY_ID = "gw-test";
  process.env.AGENTCORE_REGION = "us-east-1";
});

describe("materializeGatewayTarget — cache hit", () => {
  it("returns the existing READY row without calling AWS", async () => {
    const { prisma } = await import("@package/database");
    const { materializeGatewayTarget } = await import("./gateway-targets.js");

    (prisma.gatewayTarget.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "gt_1",
      registryRecordId: "rec_1",
      status: "READY",
      awsTargetId: "tgt-abc",
      targetName: "ExampleTool",
    });

    const result = await materializeGatewayTarget({
      registryRecordId: "rec_1",
      registryArn: "arn:aws:bedrock-agentcore:us-east-1:000:registry/r1",
      registryRecordName: "ExampleTool",
      fetchTargetSpec: vi.fn(),
    });

    expect(result.status).toBe("READY");
    expect(result.awsTargetId).toBe("tgt-abc");
    expect(awsMock.calls()).toHaveLength(0);
  });
});

describe("materializeGatewayTarget — fresh create", () => {
  it("creates a row, calls AWS CreateGatewayTarget, marks READY", async () => {
    const { prisma } = await import("@package/database");
    const { materializeGatewayTarget } = await import("./gateway-targets.js");

    (prisma.gatewayTarget.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.gatewayTarget.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "gt_2",
      registryRecordId: "rec_2",
      status: "CREATING",
      awsTargetId: null,
      targetName: "Fresh-8a3f1c",
    });
    (prisma.gatewayTarget.update as ReturnType<typeof vi.fn>).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "gt_2",
          registryRecordId: "rec_2",
          targetName: "Fresh-8a3f1c",
          ...data,
        }),
    );
    awsMock.on(CreateGatewayTargetCommand).resolves({
      targetId: "tgt-new",
      targetArn: "arn:aws:bedrock-agentcore:us-east-1:000:gateway/gw-test/target/tgt-new",
    });

    const result = await materializeGatewayTarget({
      registryRecordId: "rec_2",
      registryArn: "arn:aws:bedrock-agentcore:us-east-1:000:registry/r1",
      registryRecordName: "Fresh",
      fetchTargetSpec: vi.fn().mockResolvedValue({
        kind: "mcpServer",
        endpoint: "https://mcp.example.com/mcp",
      }),
    });

    expect(result.status).toBe("READY");
    expect(result.awsTargetId).toBe("tgt-new");
    const createCalls = awsMock.commandCalls(CreateGatewayTargetCommand);
    expect(createCalls).toHaveLength(1);
    const sentInput = createCalls[0].args[0].input as Record<string, unknown>;
    expect(sentInput.gatewayIdentifier).toBe("gw-test");
    expect(sentInput.name).toBe("Fresh-8a3f1c");
  });
});

describe("materializeGatewayTarget — AWS failure", () => {
  it("marks the row CREATE_FAILED with the error message", async () => {
    const { prisma } = await import("@package/database");
    const { materializeGatewayTarget } = await import("./gateway-targets.js");

    (prisma.gatewayTarget.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.gatewayTarget.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "gt_3",
      registryRecordId: "rec_3",
      status: "CREATING",
      awsTargetId: null,
      targetName: "Boom-aaaaaa",
    });
    (prisma.gatewayTarget.update as ReturnType<typeof vi.fn>).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "gt_3",
          registryRecordId: "rec_3",
          targetName: "Boom-aaaaaa",
          ...data,
        }),
    );
    awsMock
      .on(CreateGatewayTargetCommand)
      .rejects(new Error("ValidationException: schema invalid"));

    const result = await materializeGatewayTarget({
      registryRecordId: "rec_3",
      registryArn: "arn:aws:bedrock-agentcore:us-east-1:000:registry/r1",
      registryRecordName: "Boom",
      fetchTargetSpec: vi
        .fn()
        .mockResolvedValue({ kind: "mcpServer", endpoint: "https://mcp.example.com/mcp" }),
    });

    expect(result.status).toBe("CREATE_FAILED");
    expect(result.statusReasons).toContain(
      "ValidationException: schema invalid",
    );
  });
});

describe("materializeGatewayTarget — retry on CREATE_FAILED", () => {
  it("re-issues CreateGatewayTarget and updates the existing row", async () => {
    const { prisma } = await import("@package/database");
    const { materializeGatewayTarget } = await import("./gateway-targets.js");

    (prisma.gatewayTarget.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "gt_4",
      registryRecordId: "rec_4",
      status: "CREATE_FAILED",
      awsTargetId: null,
      targetName: "Retry-bbbbbb",
    });
    (prisma.gatewayTarget.update as ReturnType<typeof vi.fn>).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "gt_4",
          registryRecordId: "rec_4",
          targetName: "Retry-bbbbbb",
          ...data,
        }),
    );
    awsMock.on(CreateGatewayTargetCommand).resolves({
      targetId: "tgt-retry-ok",
    });

    const result = await materializeGatewayTarget({
      registryRecordId: "rec_4",
      registryArn: "arn:aws:bedrock-agentcore:us-east-1:000:registry/r1",
      registryRecordName: "Retry",
      fetchTargetSpec: vi
        .fn()
        .mockResolvedValue({ kind: "mcpServer", endpoint: "https://mcp.example.com/mcp" }),
    });

    expect(result.status).toBe("READY");
    expect(result.awsTargetId).toBe("tgt-retry-ok");
    expect(awsMock.commandCalls(CreateGatewayTargetCommand)).toHaveLength(1);
  });
});

describe("materializeGatewayTarget — race", () => {
  it("re-reads the row when create races on the unique constraint", async () => {
    const { prisma } = await import("@package/database");
    const { materializeGatewayTarget } = await import("./gateway-targets.js");

    (prisma.gatewayTarget.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null) // first call: not yet created
      .mockResolvedValueOnce({
        id: "gt_5",
        registryRecordId: "rec_5",
        status: "CREATING",
        awsTargetId: null,
        targetName: "Race-cccccc",
      });
    const p2002 = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    (prisma.gatewayTarget.create as ReturnType<typeof vi.fn>).mockRejectedValue(p2002);

    const result = await materializeGatewayTarget({
      registryRecordId: "rec_5",
      registryArn: "arn:aws:bedrock-agentcore:us-east-1:000:registry/r1",
      registryRecordName: "Race",
      fetchTargetSpec: vi
        .fn()
        .mockResolvedValue({ kind: "mcpServer", endpoint: "https://mcp.example.com/mcp" }),
    });

    expect(result.status).toBe("CREATING");
    expect(awsMock.commandCalls(CreateGatewayTargetCommand)).toHaveLength(0);
  });
});

describe("materializeGatewayTarget — lambda spec", () => {
  it("creates a target with mcp.lambda.lambdaArn and inlinePayload", async () => {
    const { prisma } = await import("@package/database");
    const { materializeGatewayTarget } = await import("./gateway-targets.js");

    (prisma.gatewayTarget.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.gatewayTarget.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "gt_lambda",
      registryRecordId: "rec_lambda",
      status: "CREATING",
      awsTargetId: null,
      targetName: "Calc-aaaaaa",
    });
    (prisma.gatewayTarget.update as ReturnType<typeof vi.fn>).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "gt_lambda",
          registryRecordId: "rec_lambda",
          targetName: "Calc-aaaaaa",
          ...data,
        }),
    );
    awsMock.on(CreateGatewayTargetCommand).resolves({
      targetId: "tgt-lambda-ok",
      targetArn: "arn:aws:bedrock-agentcore:us-east-1:000:gateway/gw-test/target/tgt-lambda-ok",
    });

    const result = await materializeGatewayTarget({
      registryRecordId: "rec_lambda",
      registryArn: "arn:aws:bedrock-agentcore:us-east-1:000:registry/r1",
      registryRecordName: "Calc",
      fetchTargetSpec: vi.fn().mockResolvedValue({
        kind: "lambda",
        lambdaArn: "arn:aws:lambda:us-east-1:000:function:Calc",
        toolSchema: [
          {
            name: "add_numbers",
            description: "Add",
            inputSchema: { type: "object" },
          },
        ],
      }),
    });

    expect(result.status).toBe("READY");
    expect(result.awsTargetId).toBe("tgt-lambda-ok");
    const createCalls = awsMock.commandCalls(CreateGatewayTargetCommand);
    expect(createCalls).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sentInput = createCalls[0].args[0].input as Record<string, any>;
    expect(sentInput.targetConfiguration?.mcp?.lambda?.lambdaArn).toBe(
      "arn:aws:lambda:us-east-1:000:function:Calc",
    );
    expect(
      sentInput.targetConfiguration?.mcp?.lambda?.toolSchema?.inlinePayload,
    ).toHaveLength(1);
    expect(
      sentInput.targetConfiguration?.mcp?.lambda?.toolSchema?.inlinePayload?.[0]
        ?.name,
    ).toBe("add_numbers");
  });
});

// Suppress unused-import warnings — these type imports are used for IDE inference.
export type { PrismaType, MaterializeFn };
