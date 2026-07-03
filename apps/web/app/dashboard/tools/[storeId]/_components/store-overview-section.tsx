"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  STORE_STATUS_CLASSES,
  SYNC_STATUS_CLASSES,
  type ToolPolicyStore,
} from "../../_components/constants";

interface StoreOverviewSectionProps {
  store: ToolPolicyStore;
  policyCount: number;
}

function formatDateTime(d?: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] text-muted-foreground uppercase tracking-wider">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

export function StoreOverviewSection({
  store,
  policyCount,
}: StoreOverviewSectionProps) {
  const t = useTranslations("ToolStoreList.overview");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-5 md:grid-cols-3">
          <FieldRow label={t("status")}>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${STORE_STATUS_CLASSES[store.status]}`}
            >
              {t(`statusValues.${store.status}`)}
            </Badge>
          </FieldRow>
          <FieldRow label={t("namespace")}>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
              {store.namespace}
            </code>
          </FieldRow>
          <FieldRow label={t("region")}>
            <span className="text-xs font-mono">{store.region}</span>
          </FieldRow>
          <FieldRow label={t("validationMode")}>
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0"
            >
              {store.validationMode}
            </Badge>
          </FieldRow>
          <FieldRow label={t("schemaStatus")}>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${SYNC_STATUS_CLASSES[store.schemaSyncStatus]}`}
            >
              {t(`syncValues.${store.schemaSyncStatus}`)}
            </Badge>
          </FieldRow>
          <FieldRow label={t("policies")}>
            <span className="text-xs tabular-nums">{policyCount}</span>
          </FieldRow>
          <FieldRow label={t("created")}>
            <span className="text-xs tabular-nums">
              {formatDateTime(store.createdAt)}
            </span>
          </FieldRow>
          <FieldRow label={t("updated")}>
            <span className="text-xs tabular-nums">
              {formatDateTime(store.updatedAt)}
            </span>
          </FieldRow>
          <FieldRow label={t("lastSynced")}>
            <span className="text-xs tabular-nums">
              {formatDateTime(store.lastSyncedAt)}
            </span>
          </FieldRow>
          {store.createdBy && (
            <FieldRow label={t("createdBy")}>
              <span className="text-xs">
                {store.createdBy.name ?? store.createdBy.email ?? "—"}
              </span>
            </FieldRow>
          )}
          {store.awsPolicyStoreId && (
            <FieldRow label={t("policyStoreId")}>
              <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono tabular-nums">
                {store.awsPolicyStoreId}
              </code>
            </FieldRow>
          )}
          {store.description && (
            <div className="col-span-2 md:col-span-3 space-y-1">
              <dt className="text-[11px] text-muted-foreground uppercase tracking-wider">
                {t("description")}
              </dt>
              <dd className="text-sm text-muted-foreground leading-relaxed text-pretty">
                {store.description}
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
