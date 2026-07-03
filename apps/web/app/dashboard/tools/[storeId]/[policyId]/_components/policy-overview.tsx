"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  POLICY_STATUS_CLASSES,
  POLICY_TYPE_CLASSES,
  SYNC_STATUS_CLASSES,
  type ToolPolicy,
} from "../../../_components/constants";

interface PolicyOverviewProps {
  policy: ToolPolicy;
}

function OverviewField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function formatDate(dateValue?: string | Date | null, fallback = "—") {
  if (!dateValue) return fallback;
  return new Date(dateValue).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PolicyOverview({ policy }: PolicyOverviewProps) {
  const t = useTranslations("ToolPolicyDetail");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          {t("overview.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-4">
          <OverviewField
            label={t("overview.name")}
            value={policy.name}
          />
          <OverviewField
            label={t("overview.status")}
            value={
              <Badge
                variant="outline"
                className={POLICY_STATUS_CLASSES[policy.status]}
              >
                {t(`overview.statusValues.${policy.status}`)}
              </Badge>
            }
          />
          <OverviewField
            label={t("overview.syncStatus")}
            value={
              <Badge
                variant="outline"
                className={SYNC_STATUS_CLASSES[policy.syncStatus]}
              >
                {t(`overview.syncValues.${policy.syncStatus}`)}
              </Badge>
            }
          />
          <OverviewField
            label={t("overview.type")}
            value={
              <Badge
                variant="outline"
                className={POLICY_TYPE_CLASSES[policy.type]}
              >
                {t(`overview.typeValues.${policy.type}`)}
              </Badge>
            }
          />
          <OverviewField
            label={t("overview.action")}
            value={
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                {policy.action}
              </code>
            }
          />
          <OverviewField
            label={t("overview.principalTypes")}
            value={
              <div className="flex flex-wrap gap-1">
                {policy.principalTypes.map((pt) => (
                  <Badge
                    key={pt}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {pt}
                  </Badge>
                ))}
              </div>
            }
          />
          <OverviewField
            label={t("overview.resourceTypes")}
            value={
              <div className="flex flex-wrap gap-1">
                {policy.resourceTypes.map((rt) => (
                  <Badge
                    key={rt}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {rt}
                  </Badge>
                ))}
              </div>
            }
          />
          <OverviewField
            label={t("overview.templateLinked")}
            value={
              policy.isTemplateLinked ? (
                <Badge
                  variant="outline"
                  className="text-purple-600 border-purple-200 bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:bg-purple-950/30"
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  {policy.templateLinkId ?? policy.libraryPolicyName ?? "—"}
                </Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            }
          />
          <OverviewField
            label={t("overview.created")}
            value={formatDate(policy.createdAt)}
          />
          <OverviewField
            label={t("overview.updated")}
            value={formatDate(policy.updatedAt)}
          />
          <OverviewField
            label={t("overview.lastSynced")}
            value={formatDate(policy.lastSyncedAt)}
          />
          <OverviewField
            label={t("overview.description")}
            value={policy.description}
          />
        </div>
      </CardContent>
    </Card>
  );
}
