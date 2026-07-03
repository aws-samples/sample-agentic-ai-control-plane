import { describe, expect, it } from "vitest";
import { resolveTargetSpec, UnsupportedDescriptorError } from "./registry-helpers";

describe("resolveTargetSpec — MCP", () => {
  it("returns mcpServer spec from synchronizationConfiguration.fromUrl.url", () => {
    const spec = resolveTargetSpec({
      descriptorType: "MCP",
      synchronizationConfiguration: {
        fromUrl: { url: "https://mcp.example.com/mcp" },
      },
    });
    expect(spec).toEqual({
      kind: "mcpServer",
      endpoint: "https://mcp.example.com/mcp",
    });
  });

  it("falls back to descriptors.mcp.server.inlineContent.url", () => {
    const spec = resolveTargetSpec({
      descriptorType: "MCP",
      descriptors: {
        mcp: {
          server: {
            inlineContent: JSON.stringify({ url: "https://other.example.com/mcp" }),
          },
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
        descriptorType: "MCP",
        descriptors: { mcp: { server: { inlineContent: "{}" } } },
      }),
    ).toThrow(UnsupportedDescriptorError);
  });
});

describe("resolveTargetSpec — CUSTOM", () => {
  const validInline = JSON.stringify({
    lambdaArn: "arn:aws:lambda:us-east-1:000000000000:function:Calc",
    toolSchema: [
      {
        name: "add_numbers",
        description: "Add two numbers",
        inputSchema: { type: "object" },
      },
    ],
  });

  it("returns lambda spec when CUSTOM inlineContent has lambdaArn + toolSchema", () => {
    const spec = resolveTargetSpec({
      descriptorType: "CUSTOM",
      descriptors: { custom: { inlineContent: validInline } },
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

  it("throws when inlineContent is not valid JSON", () => {
    expect(() =>
      resolveTargetSpec({
        descriptorType: "CUSTOM",
        descriptors: { custom: { inlineContent: "<not json>" } },
      }),
    ).toThrow(UnsupportedDescriptorError);
  });

  it("throws when lambdaArn is missing", () => {
    expect(() =>
      resolveTargetSpec({
        descriptorType: "CUSTOM",
        descriptors: {
          custom: { inlineContent: JSON.stringify({ toolSchema: [] }) },
        },
      }),
    ).toThrow(UnsupportedDescriptorError);
  });

  it("throws when toolSchema is missing", () => {
    expect(() =>
      resolveTargetSpec({
        descriptorType: "CUSTOM",
        descriptors: {
          custom: {
            inlineContent: JSON.stringify({ lambdaArn: "arn:aws:lambda:..." }),
          },
        },
      }),
    ).toThrow(UnsupportedDescriptorError);
  });

  it("throws when toolSchema is not an array", () => {
    expect(() =>
      resolveTargetSpec({
        descriptorType: "CUSTOM",
        descriptors: {
          custom: {
            inlineContent: JSON.stringify({
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
        descriptorType: "CUSTOM",
        descriptors: {
          custom: {
            inlineContent: JSON.stringify({
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
        descriptorType: "CUSTOM",
        descriptors: {
          custom: {
            inlineContent: JSON.stringify({
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
  it("throws on A2A", () => {
    expect(() =>
      resolveTargetSpec({
        descriptorType: "A2A",
        descriptors: { a2a: { agentCard: { inlineContent: "{}" } } },
      }),
    ).toThrow(UnsupportedDescriptorError);
  });

  it("throws on AGENT_SKILLS", () => {
    expect(() =>
      resolveTargetSpec({
        descriptorType: "AGENT_SKILLS",
        descriptors: { agentSkills: { skillMd: { inlineContent: "" } } },
      }),
    ).toThrow(UnsupportedDescriptorError);
  });

  it("throws on undefined descriptorType", () => {
    expect(() =>
      resolveTargetSpec({ descriptorType: undefined, descriptors: {} }),
    ).toThrow(UnsupportedDescriptorError);
  });
});
