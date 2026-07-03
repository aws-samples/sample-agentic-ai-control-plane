"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, Pencil, X } from "lucide-react";
import { $orpc } from "@/lib/api";
import {
  POLICY_STATUS_CLASSES,
  POLICY_TYPE_CLASSES,
  SYNC_STATUS_CLASSES,
  type ToolPolicy,
} from "../../../_components/constants";

interface OverviewSectionProps {
  policy: ToolPolicy;
  onPolicyChange?: (updated: ToolPolicy) => void;
  onRefresh?: () => void | Promise<void>;
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

function OverviewField({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

export function OverviewSection({
  policy,
  onPolicyChange,
  onRefresh,
}: OverviewSectionProps) {
  const t = useTranslations("ToolPolicyDetail.overview");

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(policy.name);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(policy.description);
  const [isEditingAction, setIsEditingAction] = useState(false);
  const [actionValue, setActionValue] = useState(policy.action);

  const applyUpdate = useCallback(
    (updated: ToolPolicy) => {
      onPolicyChange?.(updated);
    },
    [onPolicyChange],
  );

  const handleSaveName = useCallback(async () => {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== policy.name) {
      try {
        const res = await $orpc.updateToolPolicy({
          id: policy.id,
          name: trimmed,
        });
        applyUpdate({
          ...res.policy,
          createdAt: new Date(res.policy.createdAt),
          updatedAt: new Date(res.policy.updatedAt),
          lastSyncedAt: res.policy.lastSyncedAt
            ? new Date(res.policy.lastSyncedAt)
            : null,
        } as ToolPolicy);
        toast.success(t("nameUpdated"));
        await onRefresh?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("nameUpdated"));
      }
    } else {
      setNameValue(policy.name);
    }
    setIsEditingName(false);
  }, [nameValue, policy, applyUpdate, onRefresh, t]);

  const handleSaveDesc = useCallback(async () => {
    const trimmed = descValue.trim();
    if (trimmed !== policy.description) {
      try {
        const res = await $orpc.updateToolPolicy({
          id: policy.id,
          description: trimmed,
        });
        applyUpdate({
          ...res.policy,
          createdAt: new Date(res.policy.createdAt),
          updatedAt: new Date(res.policy.updatedAt),
          lastSyncedAt: res.policy.lastSyncedAt
            ? new Date(res.policy.lastSyncedAt)
            : null,
        } as ToolPolicy);
        toast.success(t("descriptionUpdated"));
        await onRefresh?.();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : t("descriptionUpdated"),
        );
      }
    }
    setIsEditingDesc(false);
  }, [descValue, policy, applyUpdate, onRefresh, t]);

  const handleSaveAction = useCallback(async () => {
    const trimmed = actionValue.trim();
    if (trimmed !== policy.action) {
      try {
        const res = await $orpc.updateToolPolicy({
          id: policy.id,
          action: trimmed,
        });
        applyUpdate({
          ...res.policy,
          createdAt: new Date(res.policy.createdAt),
          updatedAt: new Date(res.policy.updatedAt),
          lastSyncedAt: res.policy.lastSyncedAt
            ? new Date(res.policy.lastSyncedAt)
            : null,
        } as ToolPolicy);
        toast.success(t("actionUpdated"));
        await onRefresh?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("actionUpdated"));
      }
    }
    setIsEditingAction(false);
  }, [actionValue, policy, applyUpdate, onRefresh, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 md:grid-cols-3">
          <div className="col-span-2 md:col-span-3 space-y-1">
            <p className="text-xs text-muted-foreground">{t("name")}</p>
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") {
                      setNameValue(policy.name);
                      setIsEditingName(false);
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 active:scale-[0.96]"
                  onClick={handleSaveName}
                >
                  <Check className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 active:scale-[0.96]"
                  onClick={() => {
                    setNameValue(policy.name);
                    setIsEditingName(false);
                  }}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNameValue(policy.name);
                  setIsEditingName(true);
                }}
                className="group flex items-center gap-2 text-sm font-medium hover:text-foreground transition-colors text-left"
              >
                <span className="text-balance">{policy.name}</span>
                <Pencil className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
          </div>

          <OverviewField
            label={t("status")}
            value={
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${POLICY_STATUS_CLASSES[policy.status]}`}
              >
                {t(`statusValues.${policy.status}`)}
              </Badge>
            }
          />
          <OverviewField
            label={t("syncStatus")}
            value={
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${SYNC_STATUS_CLASSES[policy.syncStatus]}`}
              >
                {t(`syncValues.${policy.syncStatus}`)}
              </Badge>
            }
          />
          <OverviewField
            label={t("type")}
            value={
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${POLICY_TYPE_CLASSES[policy.type]}`}
              >
                {t(`typeValues.${policy.type}`)}
              </Badge>
            }
          />

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("action")}</p>
            {isEditingAction ? (
              <div className="flex items-center gap-2">
                <Input
                  value={actionValue}
                  onChange={(e) => setActionValue(e.target.value)}
                  className="h-8 text-sm font-mono"
                  placeholder="e.g. ReadProject"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveAction();
                    if (e.key === "Escape") {
                      setActionValue(policy.action);
                      setIsEditingAction(false);
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 active:scale-[0.96]"
                  onClick={handleSaveAction}
                >
                  <Check className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 active:scale-[0.96]"
                  onClick={() => {
                    setActionValue(policy.action);
                    setIsEditingAction(false);
                  }}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActionValue(policy.action);
                  setIsEditingAction(true);
                }}
                className="group flex items-center gap-2 text-left"
              >
                {policy.action ? (
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                    {policy.action}
                  </code>
                ) : (
                  <span className="text-sm text-muted-foreground italic">
                    {t("noAction")}
                  </span>
                )}
                <Pencil className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
          </div>

          <OverviewField
            label={t("lastSynced")}
            value={
              <span className="text-xs tabular-nums text-muted-foreground font-normal">
                {formatDateTime(policy.lastSyncedAt)}
              </span>
            }
          />
          <OverviewField
            label={t("created")}
            value={
              <span className="text-xs tabular-nums text-muted-foreground font-normal">
                {formatDateTime(policy.createdAt)}
              </span>
            }
          />
          <OverviewField
            label={t("updated")}
            value={
              <span className="text-xs tabular-nums text-muted-foreground font-normal">
                {formatDateTime(policy.updatedAt)}
              </span>
            }
          />
          {policy.createdBy && (
            <OverviewField
              label={t("createdBy")}
              value={
                <span className="text-sm">
                  {policy.createdBy.name ?? policy.createdBy.email ?? "—"}
                </span>
              }
            />
          )}
          {policy.awsPolicyId && (
            <OverviewField
              label={t("awsPolicyId")}
              value={
                <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono tabular-nums">
                  {policy.awsPolicyId}
                </code>
              }
            />
          )}
          {policy.principalTypes.length > 0 && (
            <OverviewField
              label={t("principalTypes")}
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
          )}
          {policy.resourceTypes.length > 0 && (
            <OverviewField
              label={t("resourceTypes")}
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
          )}

          <div className="col-span-2 md:col-span-3 space-y-1">
            <p className="text-xs text-muted-foreground">{t("description")}</p>
            {isEditingDesc ? (
              <div className="space-y-2">
                <Textarea
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  rows={3}
                  className="text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setDescValue(policy.description);
                      setIsEditingDesc(false);
                    }
                  }}
                />
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    onClick={handleSaveDesc}
                    className="active:scale-[0.96]"
                  >
                    <Check className="size-3.5 mr-1.5" />
                    {t("save")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDescValue(policy.description);
                      setIsEditingDesc(false);
                    }}
                    className="active:scale-[0.96]"
                  >
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDescValue(policy.description);
                  setIsEditingDesc(true);
                }}
                className="group flex items-start gap-2 text-left w-full"
              >
                {policy.description ? (
                  <p className="text-xs leading-relaxed text-pretty flex-1">
                    {policy.description}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic flex-1">
                    {t("noDescription")}
                  </p>
                )}
                <Pencil className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
