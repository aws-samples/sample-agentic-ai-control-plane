"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Check,
  ChevronDown,
  Copy,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { $orpc } from "@/lib/api";
import type {
  PolicyItem,
  PolicyStatus,
  PolicyType,
  PolicyVersion,
  LinkedPolicy,
} from "../../_components/constants";
import { STATUS_VALUES } from "../../_components/constants";

interface OverviewSectionProps {
  policy: PolicyItem;
  versions: PolicyVersion[];
  linkedPolicies: LinkedPolicy[];
  onPolicyChange: (updated: PolicyItem) => void;
  onRefresh?: () => void | Promise<void>;
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

function StatusBadge({ status, t }: { status: PolicyStatus; t: (key: string) => string }) {
  const colorClasses: Record<PolicyStatus, string> = {
    draft:
      "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/30",
    in_review:
      "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30",
    published:
      "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30",
    archived: "text-muted-foreground border-border bg-muted/50",
  };
  return (
    <Badge variant="outline" className={colorClasses[status]}>
      {t(`statusValues.${status}`)}
    </Badge>
  );
}

function TypeBadge({ type, t }: { type: PolicyType; t: (key: string) => string }) {
  const colorClasses: Record<PolicyType, string> = {
    permit:
      "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30",
    forbid:
      "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
  };
  return (
    <Badge variant="outline" className={colorClasses[type]}>
      {t(`typeValues.${type}`)}
    </Badge>
  );
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

export function OverviewSection({
  policy,
  versions,
  linkedPolicies,
  onPolicyChange,
  onRefresh,
}: OverviewSectionProps) {
  const t = useTranslations("PolicyLibraryDetail.overview");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(policy.name);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(policy.description);
  const [tagInput, setTagInput] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const handleSaveName = useCallback(async () => {
    if (nameValue.trim() && nameValue !== policy.name) {
      try {
        const res = await $orpc.updatePolicy({
          id: policy.id,
          name: nameValue.trim(),
        });
        onPolicyChange({
          ...res.policy,
          createdAt: new Date(res.policy.createdAt),
          updatedAt: new Date(res.policy.updatedAt),
        });
        toast.success(t("nameUpdated"));
        await onRefresh?.();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t("nameUpdated");
        toast.error(message);
      }
    }
    setIsEditingName(false);
  }, [nameValue, policy, onPolicyChange, onRefresh, t]);

  const handleSaveDesc = useCallback(async () => {
    if (descValue !== policy.description) {
      try {
        const res = await $orpc.updatePolicy({
          id: policy.id,
          description: descValue.trim(),
        });
        onPolicyChange({
          ...res.policy,
          createdAt: new Date(res.policy.createdAt),
          updatedAt: new Date(res.policy.updatedAt),
        });
        toast.success(t("descriptionUpdated"));
        await onRefresh?.();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t("descriptionUpdated");
        toast.error(message);
      }
    }
    setIsEditingDesc(false);
  }, [descValue, policy, onPolicyChange, onRefresh, t]);

  const handleAddTag = useCallback(async () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !policy.tags.includes(tag)) {
      try {
        const res = await $orpc.updatePolicy({
          id: policy.id,
          tags: [...policy.tags, tag],
        });
        onPolicyChange({
          ...res.policy,
          createdAt: new Date(res.policy.createdAt),
          updatedAt: new Date(res.policy.updatedAt),
        });
        toast.success(t("tagAdded"));
        await onRefresh?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : t("tagAdded");
        toast.error(message);
      }
    }
    setTagInput("");
    setIsAddingTag(false);
  }, [tagInput, policy, onPolicyChange, onRefresh, t]);

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      try {
        const res = await $orpc.updatePolicy({
          id: policy.id,
          tags: policy.tags.filter((x) => x !== tag),
        });
        onPolicyChange({
          ...res.policy,
          createdAt: new Date(res.policy.createdAt),
          updatedAt: new Date(res.policy.updatedAt),
        });
        await onRefresh?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed";
        toast.error(message);
      }
    },
    [policy, onPolicyChange, onRefresh],
  );

  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(policy.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }, [policy.id]);

  const handleStatusChange = useCallback(
    async (newStatus: PolicyStatus) => {
      try {
        const res = await $orpc.updatePolicy({
          id: policy.id,
          status: newStatus,
        });
        onPolicyChange({
          ...res.policy,
          createdAt: new Date(res.policy.createdAt),
          updatedAt: new Date(res.policy.updatedAt),
        });
        toast.success(t("statusUpdated"));
        await onRefresh?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : t("statusUpdated");
        toast.error(message);
      }
    },
    [policy, onPolicyChange, onRefresh, t],
  );

  const nextStatuses = STATUS_VALUES.filter((s) => s !== policy.status);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">{t("title")}</CardTitle>
          {nextStatuses.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="sm" variant="outline" />
                }
              >
                {t("promote")}
                <ChevronDown className="ml-1.5 size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {nextStatuses.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => handleStatusChange(s)}>
                    {t(`promoteTo.${s}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5 md:grid-cols-3">
            {/* Name (editable) */}
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
                  <Button size="icon" variant="ghost" className="size-7" onClick={handleSaveName}>
                    <Check className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
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
                  className="group flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors"
                  onClick={() => setIsEditingName(true)}
                >
                  {policy.name}
                  <Pencil className="size-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                </button>
              )}
            </div>

            <OverviewField
              label={t("status")}
              value={<StatusBadge status={policy.status} t={t} />}
            />
            <OverviewField
              label={t("type")}
              value={<TypeBadge type={policy.type} t={t} />}
            />
            <OverviewField
              label={t("policyId")}
              value={
                <button
                  type="button"
                  className="group flex items-center gap-1.5"
                  onClick={handleCopyId}
                >
                  <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono tabular-nums">
                    {policy.id}
                  </code>
                  <span className="relative inline-flex size-3 items-center justify-center">
                    <Check
                      aria-hidden
                      className={`absolute size-3 text-emerald-500 transition-[opacity,scale,filter] duration-200 ${
                        copiedId
                          ? "opacity-100 scale-100 blur-0"
                          : "opacity-0 scale-[0.25] blur-[4px]"
                      }`}
                      style={{ transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)" }}
                    />
                    <Copy
                      aria-hidden
                      className={`absolute size-3 text-muted-foreground transition-[opacity,scale,filter] duration-200 ${
                        copiedId
                          ? "opacity-0 scale-[0.25] blur-[4px]"
                          : "opacity-0 group-hover:opacity-100 scale-100 blur-0"
                      }`}
                      style={{ transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)" }}
                    />
                  </span>
                </button>
              }
            />
            <OverviewField
              label={t("creator")}
              value={
                <span>
                  {policy.createdBy.name}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({policy.createdBy.email})
                  </span>
                </span>
              }
            />
            <OverviewField
              label={t("created")}
              value={<span className="tabular-nums">{formatDate(policy.createdAt)}</span>}
            />
            <OverviewField
              label={t("updated")}
              value={<span className="tabular-nums">{formatDate(policy.updatedAt)}</span>}
            />
            <OverviewField
              label={t("versionCount")}
              value={
                <span className="tabular-nums">
                  {versions.length > 0
                    ? `v${versions[0].version} (${versions.length} versions)`
                    : "—"}
                </span>
              }
            />
            <OverviewField
              label={t("linkedCount")}
              value={<span className="tabular-nums">{`${linkedPolicies.length} linked`}</span>}
            />
          </div>
        </CardContent>
      </Card>

      {/* Description Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">{t("description")}</CardTitle>
          {!isEditingDesc && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => setIsEditingDesc(true)}
            >
              <Pencil className="size-3.5" />
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isEditingDesc ? (
            <div className="space-y-3">
              <Textarea
                value={descValue}
                onChange={(e) => setDescValue(e.target.value)}
                rows={4}
                className="text-sm"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDescValue(policy.description);
                    setIsEditingDesc(false);
                  }}
                >
                  {t("cancel")}
                </Button>
                <Button size="sm" onClick={handleSaveDesc}>
                  {t("save")}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
              {policy.description || t("noDescription")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tags Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">{t("tags")}</CardTitle>
          {!isAddingTag && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setIsAddingTag(true)}
            >
              <Plus className="size-3 mr-1" />
              {t("addTag")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {policy.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs px-2 py-0.5 gap-1.5"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  className="relative transition-colors hover:text-destructive before:absolute before:-inset-3.5 before:content-['']"
                  onClick={() => handleRemoveTag(tag)}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            {isAddingTag && (
              <div className="flex items-center gap-1.5">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  className="h-7 w-32 text-xs"
                  placeholder={t("tagPlaceholder")}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddTag();
                    if (e.key === "Escape") {
                      setTagInput("");
                      setIsAddingTag(false);
                    }
                  }}
                />
                <Button size="icon" variant="ghost" className="size-6" onClick={handleAddTag}>
                  <Check className="size-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  onClick={() => {
                    setTagInput("");
                    setIsAddingTag(false);
                  }}
                >
                  <X className="size-3" />
                </Button>
              </div>
            )}
            {policy.tags.length === 0 && !isAddingTag && (
              <p className="text-xs text-muted-foreground">{t("noTags")}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
