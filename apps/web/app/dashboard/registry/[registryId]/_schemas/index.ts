import mcpServer from "./mcp-server.2025-12-11.json";
import mcpTool from "./mcp-tool.2025-11-25.json";
import a2aAgentCard from "./a2a-agent-card.0.3.json";
import agentSkills from "./agent-skills.0.1.0.json";

export type OfficialSchemaKey =
  | "mcp-server"
  | "mcp-tool"
  | "a2a-agent-card"
  | "agent-skills";

export const OFFICIAL_SCHEMAS: Record<
  OfficialSchemaKey,
  { version: string; schema: unknown }
> = {
  "mcp-server": { version: "2025-12-11", schema: mcpServer },
  "mcp-tool": { version: "2025-11-25", schema: mcpTool },
  "a2a-agent-card": { version: "0.3", schema: a2aAgentCard },
  "agent-skills": { version: "0.1.0", schema: agentSkills },
};
