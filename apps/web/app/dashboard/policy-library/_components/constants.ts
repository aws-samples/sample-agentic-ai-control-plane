export type PolicyStatus = "draft" | "in_review" | "published" | "archived";

export type PolicyType = "permit" | "forbid";

export type PolicyCreator = {
  name: string;
  email: string;
};

export type PolicyItem = {
  id: string;
  name: string;
  description: string;
  cedarCode: string;
  type: PolicyType;
  status: PolicyStatus;
  isTemplate: boolean;
  parentTemplateId?: string | null;
  createdBy: PolicyCreator;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  archivedAt?: Date | null;
  duplicatedFrom?: string | null;
  exportCount?: number;
};

export const STATUS_VALUES: PolicyStatus[] = [
  "draft",
  "in_review",
  "published",
  "archived",
];

export const TYPE_VALUES: PolicyType[] = ["permit", "forbid"];

export type PolicyVersion = {
  version: number;
  cedarCode: string;
  changeNote: string;
  createdBy: PolicyCreator;
  createdAt: Date;
};

export type LinkedPolicyStatus = "ACTIVE" | "CREATING" | "UPDATE_FAILED";

export type LinkedPolicy = {
  id: string;
  name: string;
  policyEngineId: string;
  policyEngineArn: string;
  principal: { entityType: string; entityId: string };
  resource: { entityType: string; entityId: string };
  status: LinkedPolicyStatus;
  createdAt: Date;
  updatedAt: Date;
};

export const LINKED_POLICY_STATUS_VALUES: LinkedPolicyStatus[] = [
  "ACTIVE",
  "CREATING",
  "UPDATE_FAILED",
];

export type TemplateSlot = {
  placeholder: string;
  entityType: string;
  entityId: string;
};

export type ActivityEventType =
  | "created"
  | "edited"
  | "version_created"
  | "status_changed"
  | "linked_policy_created"
  | "linked_policy_updated"
  | "linked_policy_failed"
  | "renamed"
  | "tag_added"
  | "tag_removed"
  | "exported"
  | "duplicated";

export type ActivityEvent = {
  id: string;
  policyId: string;
  type: ActivityEventType;
  actor: PolicyCreator;
  description: string;
  timestamp: Date;
  metadata?: Record<string, string>;
};

export function detectTemplateSlots(
  cedarCode: string,
): Array<"?principal" | "?resource"> {
  const slots: Array<"?principal" | "?resource"> = [];
  if (cedarCode.includes("?principal")) slots.push("?principal");
  if (cedarCode.includes("?resource")) slots.push("?resource");
  return slots;
}

export function resolveTemplate(
  cedarCode: string,
  bindings: Record<string, { entityType: string; entityId: string }>,
): string {
  let resolved = cedarCode;
  for (const [slot, entity] of Object.entries(bindings)) {
    resolved = resolved.replace(
      slot,
      `${entity.entityType}::"${entity.entityId}"`,
    );
  }
  return resolved;
}
