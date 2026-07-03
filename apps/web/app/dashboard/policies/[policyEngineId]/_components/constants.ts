import {
  BookOpen,
  FileCode,
  History,
  Network,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type SectionId =
  | "overview"
  | "policies"
  | "gateways"
  | "sync-history"
  | "settings";

export type MenuSection = {
  id: SectionId;
  labelKey: string;
  icon: LucideIcon;
};

export const MENU_SECTIONS: MenuSection[] = [
  { id: "overview", labelKey: "sidebar.overview", icon: BookOpen },
  { id: "policies", labelKey: "sidebar.policies", icon: FileCode },
  { id: "gateways", labelKey: "sidebar.gateways", icon: Network },
  { id: "sync-history", labelKey: "sidebar.syncHistory", icon: History },
  { id: "settings", labelKey: "sidebar.settings", icon: Settings },
];

export type SyncStatus =
  | "unsynced"
  | "in_sync"
  | "drifted"
  | "pending"
  | "failed";

export const SYNC_STATUS_CLASSES: Record<SyncStatus, string> = {
  unsynced: "text-muted-foreground border-border bg-muted/50",
  in_sync:
    "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30",
  drifted:
    "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30",
  pending:
    "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/30",
  failed:
    "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
};

export type EngineStatus =
  | "CREATING"
  | "ACTIVE"
  | "UPDATING"
  | "DELETING"
  | "CREATE_FAILED"
  | "UPDATE_FAILED"
  | "DELETE_FAILED";

export const ENGINE_STATUS_CLASSES: Record<EngineStatus, string> = {
  ACTIVE:
    "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30",
  CREATING:
    "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/30",
  UPDATING:
    "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30",
  DELETING:
    "text-orange-600 border-orange-200 bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:bg-orange-950/30",
  CREATE_FAILED:
    "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
  UPDATE_FAILED:
    "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
  DELETE_FAILED:
    "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
};

export type EnginePolicy = {
  id: string;
  engineId: string;
  name: string;
  description: string;
  cedarCode: string;
  type: "permit" | "forbid";
  libraryPolicyId?: string | null;
  libraryPolicyName?: string | null;
  awsPolicyId?: string | null;
  awsPolicyArn?: string | null;
  awsStatus?: string | null;
  lastSyncedAt?: Date | null;
  syncStatus: SyncStatus;
  createdBy?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GatewayAttachment = {
  id: string;
  engineId: string;
  awsGatewayId: string;
  awsGatewayArn: string;
  gatewayName: string;
  mode: "LOG_ONLY" | "ENFORCE";
  createdAt: Date;
};

export type SyncBatch = {
  id: string;
  engineId: string;
  scope: "engine" | "policy";
  totalCount: number;
  successCount: number;
  failureCount: number;
  startedAt: Date;
  completedAt?: Date | null;
  triggeredBy?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
};

export type SyncEvent = {
  id: string;
  engineId: string;
  batchId?: string | null;
  enginePolicyId?: string | null;
  enginePolicyName?: string | null;
  action: string;
  success: boolean;
  errorMessage?: string | null;
  awsRequestId?: string | null;
  actor?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
  createdAt: Date;
};
