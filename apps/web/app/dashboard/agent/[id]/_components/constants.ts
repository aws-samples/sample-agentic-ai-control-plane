import {
  Settings,
  Cpu,
  MessageSquare,
  Wrench,
  Server,
  type LucideIcon,
} from "lucide-react";

export type SectionId =
  | "general"
  | "model"
  | "prompt"
  | "tools"
  | "compute";

export interface MenuSection {
  id: SectionId;
  labelKey: string;
  icon: LucideIcon;
}

export const MENU_SECTIONS: MenuSection[] = [
  { id: "general", labelKey: "sidebar.general", icon: Settings },
  { id: "model", labelKey: "sidebar.model", icon: Cpu },
  { id: "prompt", labelKey: "sidebar.prompt", icon: MessageSquare },
  { id: "tools", labelKey: "sidebar.tools", icon: Wrench },
  { id: "compute", labelKey: "sidebar.compute", icon: Server },
];

// ─── Tool Types ──────────────────────────────────────────────────────────────

export type ToolCategory = "first-party" | "third-party" | "mcp";

export interface SubTool {
  id: string;
  name: string;
  description: string;
}

export interface ToolGroupConfig {
  type: "group";
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  tools: SubTool[];
}

export interface IndividualToolConfig {
  type: "individual";
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
}

export type ToolConfig = ToolGroupConfig | IndividualToolConfig;

export interface RegistryTool {
  registryRecordId: string;
  registryArn: string;
  name: string;
  description?: string;
  protocol: string;
  registryName: string;
  recordVersion?: string;
  agentToolId?: string;
  targetStatus?:
    | "CREATING"
    | "READY"
    | "CREATE_FAILED"
    | "MISSING_FROM_GATEWAY";
  targetReasons?: string[];
}

export interface ToolTableRow {
  id: string;
  name: string;
  category: ToolCategory;
  protocol: string;
  lastUpdated: Date;
  toolIds: string[];
  isGroup: boolean;
}

export const AVAILABLE_TOOL_CONFIGS: ToolConfig[] = [
  {
    type: "individual",
    id: "web-search",
    name: "Web Search",
    description:
      "Search the web for real-time information using DuckDuckGo. Returns relevant results with titles, snippets, and URLs.",
    category: "first-party",
  },
];

// ─── Agent Types ─────────────────────────────────────────────────────────────

export interface AgentTool {
  id: string;
  agentId: string;
  name: string;
  type: string;
  metadata: unknown;
  isEnabled: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  target?: {
    status: "CREATING" | "READY" | "CREATE_FAILED";
    statusReasons: string[];
  } | null;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string | null;
  isPublic: boolean;
  preferredModelId: string | null;
  createdById: string | null;
  createdByEmail: string | null;
  tools?: AgentTool[];
  createdAt: string | Date;
  updatedAt: string | Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getCategoryLabel(category: ToolCategory): string {
  switch (category) {
    case "first-party":
      return "Core";
    case "third-party":
      return "Registry";
    case "mcp":
      return "MCP";
  }
}

export function getCategoryBadgeVariant(
  category: ToolCategory
): "default" | "secondary" | "outline" {
  switch (category) {
    case "first-party":
      return "default";
    case "third-party":
      return "secondary";
    case "mcp":
      return "outline";
  }
}

const PROTOCOL_BADGE_CLASSES: Record<string, string> = {
  MCP: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  A2A: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  CUSTOM: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  AGENT_SKILLS: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
};

export function getProtocolBadgeClass(protocol: string): string {
  return PROTOCOL_BADGE_CLASSES[protocol] ?? "";
}

export function buildToolTableRows(
  enabledToolIds: string[],
  registryTools: RegistryTool[] = [],
): ToolTableRow[] {
  const enabledSet = new Set(enabledToolIds);
  const rows: ToolTableRow[] = [];

  for (const config of AVAILABLE_TOOL_CONFIGS) {
    if (config.type === "group") {
      const enabledTools = config.tools.filter((t) => enabledSet.has(t.id));
      if (enabledTools.length > 0) {
        rows.push({
          id: config.id,
          name: config.name,
          category: config.category,
          protocol: "Tool",
          lastUpdated: new Date(2026, 1, 10),
          toolIds: enabledTools.map((t) => t.id),
          isGroup: true,
        });
      }
    } else if (enabledSet.has(config.id)) {
      rows.push({
        id: config.id,
        name: config.name,
        category: config.category,
        protocol: "Tool",
        lastUpdated: new Date(2026, 1, 8),
        toolIds: [config.id],
        isGroup: false,
      });
    }
  }

  for (const rt of registryTools) {
    rows.push({
      id: rt.registryRecordId,
      name: rt.name,
      category: "third-party",
      protocol: rt.protocol || "MCP",
      lastUpdated: new Date(),
      toolIds: [rt.registryRecordId],
      isGroup: false,
    });
  }

  return rows;
}
