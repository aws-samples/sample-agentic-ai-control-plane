"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  Download,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { $orpc } from "@/lib/api";
import type { PolicyItem } from "../../_components/constants";
import { DuplicatePolicyDialog } from "./duplicate-policy-dialog";

interface PolicySettingsProps {
  policy: PolicyItem;
  onPolicyChange: (updated: PolicyItem) => void;
  onRefresh?: () => void | Promise<void>;
}

function formatDateTime(dateValue?: string | Date | null) {
  if (!dateValue) return "—";
  return new Date(dateValue).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PolicySettings({
  policy,
  onPolicyChange,
  onRefresh,
}: PolicySettingsProps) {
  const t = useTranslations("PolicyLibraryDetail.settings");
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const isArchived = policy.status === "archived";

  const applyUpdatedPolicy = useCallback(
    (p: PolicyItem) => {
      onPolicyChange({
        ...p,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt),
        archivedAt: p.archivedAt ? new Date(p.archivedAt) : null,
      });
    },
    [onPolicyChange],
  );

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      await $orpc.exportPolicy({ id: policy.id });
      const blob = new Blob([policy.cedarCode], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${policy.name.toLowerCase().replace(/\s+/g, "-")}.cedar`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("exportSuccess"));
      await onRefresh?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("exportSuccess");
      toast.error(message);
    } finally {
      setIsExporting(false);
    }
  }, [policy.id, policy.cedarCode, policy.name, t, onRefresh]);

  const handleArchive = useCallback(async () => {
    setIsArchiving(true);
    try {
      const res = await $orpc.updatePolicy({
        id: policy.id,
        status: "archived",
      });
      applyUpdatedPolicy(res.policy);
      toast.success(t("archiveSuccess"));
      setShowArchiveDialog(false);
      await onRefresh?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("archiveSuccess");
      toast.error(message);
    } finally {
      setIsArchiving(false);
    }
  }, [policy.id, applyUpdatedPolicy, onRefresh, t]);

  const handleRestore = useCallback(async () => {
    setIsRestoring(true);
    try {
      const res = await $orpc.updatePolicy({
        id: policy.id,
        status: "draft",
      });
      applyUpdatedPolicy(res.policy);
      toast.success(t("restoreSuccess"));
      setShowRestoreDialog(false);
      await onRefresh?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("restoreSuccess");
      toast.error(message);
    } finally {
      setIsRestoring(false);
    }
  }, [policy.id, applyUpdatedPolicy, onRefresh, t]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await $orpc.deletePolicy({ id: policy.id });
      toast.success(t("deleteSuccess"));
      setShowDeleteDialog(false);
      router.push("/dashboard/policy-library");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("deleteSuccess");
      toast.error(message);
      setIsDeleting(false);
    }
  }, [policy.id, router, t]);

  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(policy.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }, [policy.id]);

  return (
    <div className="space-y-6">
      {/* Archived banner */}
      {isArchived && (
        <Card className="border-muted-foreground/20 bg-muted/30">
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-md bg-muted p-1.5">
              <Archive className="size-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 space-y-0.5">
              <p className="text-xs font-medium">{t("archivedBanner.title")}</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed text-pretty">
                {t("archivedBanner.description")}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowRestoreDialog(true)}
              disabled={isRestoring}
              className="active:scale-[0.96]"
            >
              {isRestoring ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <ArchiveRestore className="size-3.5 mr-1.5" />
              )}
              {t("restoreBtn")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">{t("metadata")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-3">
            <MetadataField label={t("metadataFields.policyId")}>
              <button
                type="button"
                className="group flex items-center gap-1.5"
                onClick={handleCopyId}
                aria-label={t("metadataFields.copyId")}
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
                    style={{
                      transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)",
                    }}
                  />
                  <Copy
                    aria-hidden
                    className={`absolute size-3 text-muted-foreground transition-[opacity,scale,filter] duration-200 ${
                      copiedId
                        ? "opacity-0 scale-[0.25] blur-[4px]"
                        : "opacity-0 group-hover:opacity-100 scale-100 blur-0"
                    }`}
                    style={{
                      transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)",
                    }}
                  />
                </span>
              </button>
            </MetadataField>
            <MetadataField label={t("metadataFields.creator")}>
              <span className="text-xs">
                {policy.createdBy.name}{" "}
                <span className="text-muted-foreground font-normal">
                  ({policy.createdBy.email})
                </span>
              </span>
            </MetadataField>
            <MetadataField label={t("metadataFields.exports")}>
              <span className="text-xs tabular-nums">
                {policy.exportCount ?? 0}
              </span>
            </MetadataField>
            <MetadataField label={t("metadataFields.created")}>
              <span className="text-xs tabular-nums">
                {formatDateTime(policy.createdAt)}
              </span>
            </MetadataField>
            <MetadataField label={t("metadataFields.updated")}>
              <span className="text-xs tabular-nums">
                {formatDateTime(policy.updatedAt)}
              </span>
            </MetadataField>
            {policy.archivedAt && (
              <MetadataField label={t("metadataFields.archivedAt")}>
                <span className="text-xs tabular-nums">
                  {formatDateTime(policy.archivedAt)}
                </span>
              </MetadataField>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* General Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">{t("general")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("duplicate")}</p>
              <p className="text-xs text-muted-foreground">
                {t("duplicateDescription")}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDuplicateDialog(true)}
              className="active:scale-[0.96]"
            >
              <Copy className="size-3.5 mr-1.5" />
              {t("duplicateBtn")}
            </Button>
          </div>
          <div className="border-t" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("export")}</p>
              <p className="text-xs text-muted-foreground">
                {t("exportDescription")}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={isExporting}
              className="active:scale-[0.96]"
            >
              {isExporting ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="size-3.5 mr-1.5" />
              )}
              {t("exportBtn")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-red-600 dark:text-red-400 text-balance">
            {t("dangerZone")}
          </CardTitle>
          <CardDescription className="text-pretty">
            {t("dangerZoneDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isArchived && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("archive")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("archiveDescription")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30 active:scale-[0.96]"
                  onClick={() => setShowArchiveDialog(true)}
                  disabled={isArchiving}
                >
                  {isArchiving ? (
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Archive className="size-3.5 mr-1.5" />
                  )}
                  {t("archiveBtn")}
                </Button>
              </div>
              <div className="border-t" />
            </>
          )}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t("delete")}</p>
              <p className="text-xs text-muted-foreground">
                {t("deleteDescription")}
              </p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              className="active:scale-[0.96]"
            >
              <Trash2 className="size-3.5 mr-1.5" />
              {t("deleteBtn")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Duplicate */}
      <DuplicatePolicyDialog
        policy={policy}
        open={showDuplicateDialog}
        onOpenChange={setShowDuplicateDialog}
      />

      {/* Archive Confirmation */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance">
              {t("archiveTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {t("archiveConfirmDescription", { name: policy.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchive}
              disabled={isArchiving}
              className="active:scale-[0.96]"
            >
              {isArchiving && (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              )}
              {t("archiveConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Confirmation */}
      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance">
              {t("restoreTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {t("restoreConfirmDescription", { name: policy.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={isRestoring}
              className="active:scale-[0.96]"
            >
              {isRestoring && (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              )}
              {t("restoreConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation (type name to confirm) */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance">
              {t("deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {t("deleteConfirmDescription", { name: policy.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3">
            <p className="text-xs text-muted-foreground mb-2">
              {t("deleteTypeToConfirm", { name: policy.name })}
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={policy.name}
              className="text-xs"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmText("")}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirmText !== policy.name || isDeleting}
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.96]"
            >
              {isDeleting && (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              )}
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MetadataField({
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
