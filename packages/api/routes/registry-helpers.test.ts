import { describe, expect, it } from "vitest";
import { resolveTargetSpec, UnsupportedDescriptorError } from "./registry-helpers";

describe("resolveTargetSpec — MCP", () => {
  it("returns mcpServer spec from descriptors.mcpServer.source.fromUrl.url", () => {
    const spec = resolveTargetSpec({
      recordType: "MCP",
      descriptors: {
        mcpServer: { source: { fromUrl: { url: "https://mcp.example.com/mcp" } } },
      },
    });
    expect(spec).toEqual({
      kind: "mcpServer",
      endpoint: "https://mcp.example.com/mcp",
    });
  });

  it("falls back to descriptors.mcpServer.data.url", () => {
    const spec = resolveTargetSpec({
      recordType: "MCP",
      descriptors: {
        mcpServer: {
          data: JSON.stringify({ url: "https://other.example.com/mcp" }),
        },
      },
    });
    expect(spec).toEqual({
      kind: "mcpServer",
      endpoint: "https://other.example.com/mcp",
    });
  });

  it("throws when MCP record has no resolvable URL", () => {
    expect(() =>
      resolveTargetSpec({
        recordType: "MCP",
        descriptors: { mcpServer: { data: "{}" } },
      }),
    ).toThrow(UnsupportedDescriptorError);
  });
});

describe("resolveTargetSpec — CUSTOM", () => {
  const validData = JSON.stringify({
    lambdaArn: "arn:aws:lambda:us-east-1:000000000000:function:Calc",
    toolSchema: [
      {
        name: "add_numbers",
        description: "Add two numbers",
        inputSchema: { type: "object" },
      },
    ],
  });

  it("returns lambda spec when CUSTOM data has lambdaArn + toolSchema", () => {
    const spec = resolveTargetSpec({
      recordType: "CUSTOM",
      descriptors: { custom: { data: validData } },
    });
    expect(spec).toEqual({
      kind: "lambda",
      lambdaArn: "arn:aws:lambda:us-east-1:000000000000:function:Calc",
      toolSchema: [
        {
          name: "add_numbers",
          description: "Add two numbers",
          inputSchema: { type: "object" },
        },
      ],
    });
  });

  it("throws when data is not valid JSON", () => {
    expect(() =>
      resolveTargetSpec({
        recordType: "CUSTOM",
        descriptors: { custom: { data: "<not json>" } },
      }),
    ).toThrow(UnsupportedDescriptorError);
  });

  it("throws when lambdaArn is missing", () => {
    expect(() =>
      resolveTargetSpec({
        recordType: "CUSTOM",
        descriptors: {
          custom: { data: JSON.stringify({ toolSchema: [] }) },
        },
      }),
    ).toThrow(UnsupportedDescriptorError);
  });

  it("throws when toolSchema is missing", () => {
    expect(() =>
      resolveTargetSpec({
        recordType: "CUSTOM",
        descriptors: {
          custom: { data: JSON.stringify({ lambdaArn: "arn:aws:lambda:..." }) },
        },
      }),
    ).toThrow(UnsupportedDescriptorError);
  });

  it("throws when toolSchema is not an array", () => {
    expect(() =>
      resolveTargetSpec({
        recordType: "CUSTOM",
        descriptors: {
          custom: {
            data: JSON.stringify({
              lambdaArn: "arn:aws:lambda:...",
              toolSchema: { name: "x" },
            }),
          },
        },
      }),
    ).toThrow(UnsupportedDescriptorError);
  });

  it("throws when toolSchema is empty", () => {
    expect(() =>
      resolveTargetSpec({
        recordType: "CUSTOM",
        descriptors: {
          custom: {
            data: JSON.stringify({
              lambdaArn: "arn:aws:lambda:...",
              toolSchema: [],
            }),
          },
        },
      }),
    ).toThrow(UnsupportedDescriptorError);
  });

  it("throws when a tool entry is missing required fields", () => {
    expect(() =>
      resolveTargetSpec({
        recordType: "CUSTOM",
        descriptors: {
          custom: {
            data: JSON.stringify({
              lambdaArn: "arn:aws:lambda:...",
              toolSchema: [{ name: "x" }],
            }),
          },
        },
      }),
    ).toThrow(UnsupportedDescriptorError);
  });
});

describe("resolveTargetSpec — unsupported types", () => {
  it("throws on AGENT", () => {
    expect(() =>
      resolveTargetSpec({
        recordType: "AGENT",
        descriptors: { a2aAgentCard: { data: "{}" } } as never,
      }),
    ).toThrow(UnsupportedDescriptorError);
  });

  it("throws on SKILL", () => {
    expect(() =>
      resolveTargetSpec({
        recordType: "SKILL",
        descriptors: { agentSkillsDefinition: { data: "" } } as never,
      }),
    ).toThrow(UnsupportedDescriptorError);
  });

  it("throws on undefined recordType", () => {
    expect(() =>
      resolveTargetSpec({ recordType: undefined, descriptors: {} }),
    ).toThrow(UnsupportedDescriptorError);
  });
});
