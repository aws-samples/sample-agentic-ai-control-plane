export type ToolPolicyStatus =
  | "draft"
  | "in_review"
  | "published"
  | "archived";

export type ToolPolicyType = "permit" | "forbid";

export type StoreStatus =
  | "CREATING"
  | "ACTIVE"
  | "DELETING"
  | "DELETED"
  | "FAILED";

export type SyncStatus =
  | "unsynced"
  | "in_sync"
  | "drifted"
  | "pending"
  | "failed";

export type ValidationMode = "STRICT" | "OFF";

export const POLICY_STATUS_VALUES: ToolPolicyStatus[] = [
  "draft",
  "in_review",
  "published",
  "archived",
];

export const STORE_STATUS_VALUES: StoreStatus[] = [
  "ACTIVE",
  "CREATING",
  "DELETING",
  "FAILED",
];

export const SYNC_STATUS_VALUES: SyncStatus[] = [
  "in_sync",
  "pending",
  "drifted",
  "unsynced",
  "failed",
];

export const TYPE_VALUES: ToolPolicyType[] = ["permit", "forbid"];

export type ContextField = {
  name: string;
  type: "String" | "Boolean" | "Long";
  required: boolean;
};

export type Actor = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

export type ToolPolicyStore = {
  id: string;
  name: string;
  description: string;
  namespace: string;
  region: string;
  awsPolicyStoreId?: string | null;
  awsPolicyStoreArn?: string | null;
  status: StoreStatus;
  validationMode: ValidationMode;
  schemaJson?: string | null;
  schemaSyncStatus: SyncStatus;
  lastSchemaSyncedAt?: Date | null;
  createdBy?: Actor | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
  policyCount?: number;
  driftedCount?: number;
  lastSyncedAt?: Date | null;
};

export type ToolPolicy = {
  id: string;
  storeId: string;
  name: string;
  description: string;
  cedarCode: string;
  type: ToolPolicyType;
  status: ToolPolicyStatus;
  action: string;
  principalTypes: string[];
  resourceTypes: string[];
  contextFields: ContextField[];
  libraryPolicyId?: string | null;
  libraryPolicyName?: string | null;
  templateLinkId?: string | null;
  isTemplateLinked: boolean;
  awsPolicyId?: string | null;
  awsPolicyArn?: string | null;
  awsStatus?: string | null;
  lastSyncedAt?: Date | null;
  syncStatus: SyncStatus;
  createdBy?: Actor | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ToolSyncBatch = {
  id: string;
  storeId: string;
  scope: "store" | "policy" | "schema";
  totalCount: number;
  successCount: number;
  failureCount: number;
  startedAt: Date;
  completedAt?: Date | null;
  triggeredBy?: Actor | null;
};

export type ToolSyncEvent = {
  id: string;
  storeId: string;
  batchId?: string | null;
  toolPolicyId?: string | null;
  toolPolicyName?: string | null;
  action: string;
  success: boolean;
  errorMessage?: string | null;
  awsRequestId?: string | null;
  actor?: Actor | null;
  createdAt: Date;
};

export const STORE_STATUS_CLASSES: Record<StoreStatus, string> = {
  ACTIVE:
    "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30",
  CREATING:
    "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/30",
  DELETING:
    "text-orange-600 border-orange-200 bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:bg-orange-950/30",
  DELETED:
    "text-gray-600 border-gray-200 bg-gray-50 dark:text-gray-400 dark:border-gray-700 dark:bg-gray-900/30",
  FAILED:
    "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
};

export const SYNC_STATUS_CLASSES: Record<SyncStatus, string> = {
  in_sync:
    "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30",
  pending:
    "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/30",
  drifted:
    "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30",
  unsynced: "text-muted-foreground border-border bg-muted/50",
  failed:
    "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
};

export const POLICY_STATUS_CLASSES: Record<ToolPolicyStatus, string> = {
  draft:
    "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/30",
  in_review:
    "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30",
  published:
    "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30",
  archived:
    "text-gray-600 border-gray-200 bg-gray-50 dark:text-gray-400 dark:border-gray-700 dark:bg-gray-900/30",
};

export const POLICY_TYPE_CLASSES: Record<ToolPolicyType, string> = {
  permit:
    "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30",
  forbid:
    "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
};
