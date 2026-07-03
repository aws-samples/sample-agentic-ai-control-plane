export class UnsupportedDescriptorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedDescriptorError";
  }
}

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: unknown;
};

export type TargetSpec =
  | { kind: "mcpServer"; endpoint: string }
  | { kind: "lambda"; lambdaArn: string; toolSchema: ToolDefinition[] };

type Descriptors = {
  mcp?: { server?: { inlineContent?: string } };
  custom?: { inlineContent?: string };
  [key: string]: unknown;
};

type SyncConfiguration = { fromUrl?: { url?: string } } | undefined;

type RegistryRecordLike = {
  descriptorType?: string;
  descriptors?: Descriptors;
  synchronizationConfiguration?: SyncConfiguration;
};

// Resolves an MCP record to its server endpoint from sync config or inline content.
function resolveMcp(record: RegistryRecordLike): TargetSpec {
  const syncUrl = record.synchronizationConfiguration?.fromUrl?.url;
  if (typeof syncUrl === "string" && syncUrl.length > 0) {
    return { kind: "mcpServer", endpoint: syncUrl };
  }
  const inline = record.descriptors?.mcp?.server?.inlineContent;
  if (inline) {
    try {
      const parsed = JSON.parse(inline) as unknown;
      if (typeof parsed === "object" && parsed && "url" in parsed) {
        const url = (parsed as { url?: unknown }).url;
        if (typeof url === "string" && url.length > 0) {
          return { kind: "mcpServer", endpoint: url };
        }
      }
    } catch {
      // fall through
    }
  }
  throw new UnsupportedDescriptorError(
    "MCP record has no resolvable server URL — set synchronizationConfiguration.fromUrl.url or descriptors.mcp.server.inlineContent={\"url\":\"...\"}",
  );
}

// Resolves a CUSTOM record's inline JSON into a validated lambda target spec.
function resolveCustom(record: RegistryRecordLike): TargetSpec {
  const inline = record.descriptors?.custom?.inlineContent;
  if (!inline) {
    throw new UnsupportedDescriptorError(
      "CUSTOM record is missing descriptors.custom.inlineContent",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(inline);
  } catch {
    throw new UnsupportedDescriptorError(
      "CUSTOM record's inlineContent is not valid JSON",
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new UnsupportedDescriptorError(
      "CUSTOM record's inlineContent must be a JSON object",
    );
  }
  const obj = parsed as { lambdaArn?: unknown; toolSchema?: unknown };
  if (typeof obj.lambdaArn !== "string" || obj.lambdaArn.length === 0) {
    throw new UnsupportedDescriptorError(
      "CUSTOM record's inlineContent must contain a non-empty `lambdaArn` string",
    );
  }
  if (!Array.isArray(obj.toolSchema)) {
    throw new UnsupportedDescriptorError(
      "CUSTOM record's inlineContent must contain a `toolSchema` array",
    );
  }
  if (obj.toolSchema.length === 0) {
    throw new UnsupportedDescriptorError(
      "CUSTOM record's `toolSchema` must contain at least one tool",
    );
  }
  const tools: ToolDefinition[] = [];
  for (const [idx, raw] of obj.toolSchema.entries()) {
    if (typeof raw !== "object" || raw === null) {
      throw new UnsupportedDescriptorError(
        `CUSTOM toolSchema[${idx}] must be an object`,
      );
    }
    const t = raw as { name?: unknown; description?: unknown; inputSchema?: unknown };
    if (typeof t.name !== "string" || t.name.length === 0) {
      throw new UnsupportedDescriptorError(
        `CUSTOM toolSchema[${idx}] is missing a non-empty \`name\` string`,
      );
    }
    if (typeof t.description !== "string") {
      throw new UnsupportedDescriptorError(
        `CUSTOM toolSchema[${idx}] is missing a \`description\` string`,
      );
    }
    if (t.inputSchema === undefined) {
      throw new UnsupportedDescriptorError(
        `CUSTOM toolSchema[${idx}] is missing an \`inputSchema\``,
      );
    }
    tools.push({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    });
  }
  return { kind: "lambda", lambdaArn: obj.lambdaArn, toolSchema: tools };
}

// Dispatches a registry record to the resolver for its descriptor type.
export function resolveTargetSpec(record: RegistryRecordLike): TargetSpec {
  switch (record.descriptorType) {
    case "MCP":
      return resolveMcp(record);
    case "CUSTOM":
      return resolveCustom(record);
    default:
      throw new UnsupportedDescriptorError(
        `Unsupported descriptor type: ${record.descriptorType ?? "none"}`,
      );
  }
}
