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

// GA flat-keyed descriptors. `data` replaces the old `inlineContent`; URL sync
// moves into a per-descriptor `source.fromUrl` (mcpServer / a2aAgentCard only).
type Descriptors = {
  mcpServer?: {
    data?: string;
    source?: { fromUrl?: { url?: string } };
  };
  custom?: { data?: string };
  [key: string]: unknown;
};

type RegistryRecordLike = {
  recordType?: string;
  descriptors?: Descriptors;
};

// Resolves an MCP record to its server endpoint from sync source or inline data.
function resolveMcp(record: RegistryRecordLike): TargetSpec {
  const syncUrl = record.descriptors?.mcpServer?.source?.fromUrl?.url;
  if (typeof syncUrl === "string" && syncUrl.length > 0) {
    return { kind: "mcpServer", endpoint: syncUrl };
  }
  const inline = record.descriptors?.mcpServer?.data;
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
    'MCP record has no resolvable server URL — set descriptors.mcpServer.source.fromUrl.url or descriptors.mcpServer.data={"url":"..."}',
  );
}

// Resolves a CUSTOM record's inline JSON into a validated lambda target spec.
function resolveCustom(record: RegistryRecordLike): TargetSpec {
  const inline = record.descriptors?.custom?.data;
  if (!inline) {
    throw new UnsupportedDescriptorError(
      "CUSTOM record is missing descriptors.custom.data",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(inline);
  } catch {
    throw new UnsupportedDescriptorError(
      "CUSTOM record's data is not valid JSON",
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new UnsupportedDescriptorError(
      "CUSTOM record's data must be a JSON object",
    );
  }
  const obj = parsed as { lambdaArn?: unknown; toolSchema?: unknown };
  if (typeof obj.lambdaArn !== "string" || obj.lambdaArn.length === 0) {
    throw new UnsupportedDescriptorError(
      "CUSTOM record's data must contain a non-empty `lambdaArn` string",
    );
  }
  if (!Array.isArray(obj.toolSchema)) {
    throw new UnsupportedDescriptorError(
      "CUSTOM record's data must contain a `toolSchema` array",
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

// Dispatches a registry record to the resolver for its record type.
export function resolveTargetSpec(record: RegistryRecordLike): TargetSpec {
  switch (record.recordType) {
    case "MCP":
      return resolveMcp(record);
    case "CUSTOM":
      return resolveCustom(record);
    default:
      throw new UnsupportedDescriptorError(
        `Unsupported record type: ${record.recordType ?? "none"}`,
      );
  }
}
