// Vendored "official schema" references shown in the registry schema editor's
// version dropdown. MCP server + tool schemas are fetched verbatim from upstream
// (see fetch-schemas.ts); A2A and agent-skills have a single reference version.

import mcpServer_2025_12_11 from "./mcp-server.2025-12-11.json";
import mcpServer_2025_10_17 from "./mcp-server.2025-10-17.json";
import mcpServer_2025_10_11 from "./mcp-server.2025-10-11.json";
import mcpServer_2025_09_29 from "./mcp-server.2025-09-29.json";
import mcpServer_2025_09_16 from "./mcp-server.2025-09-16.json";
import mcpServer_2025_07_09 from "./mcp-server.2025-07-09.json";

import mcpTool_2025_11_25 from "./mcp-tool.2025-11-25.json";
import mcpTool_2025_06_18 from "./mcp-tool.2025-06-18.json";
import mcpTool_2025_03_26 from "./mcp-tool.2025-03-26.json";
import mcpTool_2024_11_05 from "./mcp-tool.2024-11-05.json";

import a2aAgentCard from "./a2a-agent-card.0.3.json";
import agentSkills from "./agent-skills.0.1.0.json";

export type OfficialSchemaKey =
  | "mcp-server"
  | "mcp-tool"
  | "a2a-agent-card"
  | "agent-skills";

export type OfficialSchemaVersion = { version: string; schema: unknown };

export type OfficialSchemaEntry = {
  /** The default/most-recent version, shown first. */
  defaultVersion: string;
  /** All selectable versions, newest first. */
  versions: OfficialSchemaVersion[];
};

// Newest version first in each list; the first entry is the default selection.
export const OFFICIAL_SCHEMAS: Record<OfficialSchemaKey, OfficialSchemaEntry> = {
  "mcp-server": {
    defaultVersion: "2025-12-11",
    versions: [
      { version: "2025-12-11", schema: mcpServer_2025_12_11 },
      { version: "2025-10-17", schema: mcpServer_2025_10_17 },
      { version: "2025-10-11", schema: mcpServer_2025_10_11 },
      { version: "2025-09-29", schema: mcpServer_2025_09_29 },
      { version: "2025-09-16", schema: mcpServer_2025_09_16 },
      { version: "2025-07-09", schema: mcpServer_2025_07_09 },
    ],
  },
  "mcp-tool": {
    defaultVersion: "2025-11-25",
    versions: [
      { version: "2025-11-25", schema: mcpTool_2025_11_25 },
      { version: "2025-06-18", schema: mcpTool_2025_06_18 },
      { version: "2025-03-26", schema: mcpTool_2025_03_26 },
      { version: "2024-11-05", schema: mcpTool_2024_11_05 },
    ],
  },
  "a2a-agent-card": {
    defaultVersion: "0.3",
    versions: [{ version: "0.3", schema: a2aAgentCard }],
  },
  "agent-skills": {
    defaultVersion: "0.1.0",
    versions: [{ version: "0.1.0", schema: agentSkills }],
  },
};
