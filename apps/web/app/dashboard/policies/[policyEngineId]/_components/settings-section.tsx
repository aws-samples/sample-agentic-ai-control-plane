"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Loader2, Save, Trash2 } from "lucide-react";
import { $orpc } from "@/lib/api";

interface EngineSettingsSectionProps {
  engine: {
    id: string;
    name: string;
    description: string;
  };
  policyCount: number;
  onRefresh: () => void | Promise<void>;
}

export function EngineSettingsSection({
  engine,
  policyCount,
  onRefresh,
}: EngineSettingsSectionProps) {
  const t = useTranslations("PolicyEngineDetail.settings");
  const router = useRouter();
  const [description, setDescription] = useState(engine.description);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const isDirty = description !== engine.description;

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await $orpc.updatePolicyEngine({
        id: engine.id,
        description: description.trim(),
      });
      toast.success(t("saveSuccess"));
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  }, [engine.id, description, onRefresh, t]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await $orpc.deletePolicyEngine({ id: engine.id });
      toast.success(t("deleteSuccess"));
      router.push("/dashboard/policies");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteError"));
      setIsDeleting(false);
    }
  }, [engine.id, router, t]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            {t("general")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel className="text-xs">{t("name.label")}</FieldLabel>
            <Input
              value={engine.name}
              disabled
              className="text-xs"
              readOnly
            />
            <p className="text-[11px] text-muted-foreground text-pretty">
              {t("name.helper")}
            </p>
          </Field>
          <Field>
            <FieldLabel className="text-xs">
              {t("description.label")}
            </FieldLabel>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="text-xs"
              maxLength={4096}
            />
          </Field>
          {isDirty && (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="active:scale-[0.96]"
              >
                {isSaving ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Save className="size-3.5 mr-1.5" />
                )}
                {t("save")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-red-600 dark:text-red-400 text-balance">
            {t("dangerZone")}
          </CardTitle>
          <CardDescription className="text-pretty">
            {t("dangerZoneDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("delete.title")}</p>
              <p className="text-xs text-muted-foreground text-pretty">
                {policyCount > 0
                  ? t("delete.hasPolicies", { count: policyCount })
                  : t("delete.description")}
              </p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={policyCount > 0}
              className="active:scale-[0.96]"
            >
              <Trash2 className="size-3.5 mr-1.5" />
              {t("delete.button")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance">
              {t("delete.dialogTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {t("delete.dialogDescription", { name: engine.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3">
            <p className="text-xs text-muted-foreground mb-2">
              {t("delete.typeToConfirm", { name: engine.name })}
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={engine.name}
              className="text-xs"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmText("")}>
              {t("delete.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                deleteConfirmText !== engine.name || isDeleting
              }
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.96]"
            >
              {isDeleting && (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              )}
              {t("delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
