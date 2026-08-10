/**
 * Regenerates the vendored MCP reference schemas used by the registry schema
 * editor's "official schema" version dropdown. Run from the repo root:
 *
 *   npx tsx "apps/web/app/dashboard/registry/[registryId]/_schemas/fetch-schemas.ts"
 *
 * Sources (authoritative, fetched verbatim):
 *   - MCP server.json schema, per registry revision:
 *       https://static.modelcontextprotocol.io/schemas/<version>/server.schema.json
 *   - MCP tool schema, derived from each protocol revision's Tool definition:
 *       https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/<version>/schema.json
 *
 * The tool file is a *curated excerpt* (a small { tools: [Tool] } wrapper around
 * the revision's Tool definition), matching the lightweight reference style the
 * editor already uses — not the full ~200KB protocol schema.
 *
 * NOTE: 2025-11-25 is not published upstream (newest revision); its curated tool
 * file (mcp-tool.2025-11-25.json) is maintained by hand and left untouched here.
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));

const SERVER_VERSIONS = [
  "2025-12-11",
  "2025-10-17",
  "2025-10-11",
  "2025-09-29",
  "2025-09-16",
  "2025-07-09",
];

// Protocol revisions whose Tool definition we can derive an excerpt from.
// 2025-11-25 is intentionally excluded (not published upstream; hand-curated).
const TOOL_REVISIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function writeJson(name: string, data: unknown): Promise<void> {
  await writeFile(join(DIR, name), JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log("wrote", name);
}

async function main() {
  for (const v of SERVER_VERSIONS) {
    const schema = await fetchJson(
      `https://static.modelcontextprotocol.io/schemas/${v}/server.schema.json`,
    );
    await writeJson(`mcp-server.${v}.json`, schema);
  }

  for (const rev of TOOL_REVISIONS) {
    const proto = (await fetchJson(
      `https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/${rev}/schema.json`,
    )) as { definitions?: Record<string, unknown> };
    const toolDef = proto.definitions?.Tool;
    if (!toolDef) throw new Error(`no Tool definition in protocol ${rev}`);
    // Curated excerpt: a { tools: [Tool] } wrapper around the revision's Tool
    // definition, consistent with the editor's existing tool reference shape.
    const excerpt = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "MCP Tool Schema",
      description: `Validates MCP tool definitions for protocol version ${rev}. Excerpt derived from the official MCP protocol schema.`,
      type: "object",
      properties: {
        tools: { type: "array", items: { $ref: "#/$defs/Tool" } },
      },
      required: ["tools"],
      $defs: { Tool: toolDef },
    };
    await writeJson(`mcp-tool.${rev}.json`, excerpt);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
