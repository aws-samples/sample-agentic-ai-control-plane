"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { $orpc } from "@/lib/api";
import type { ToolPolicy } from "../../../_components/constants";

interface SettingsSectionProps {
  policy: ToolPolicy;
  storeId: string;
  onPolicyUpdated: () => void | Promise<void>;
}

export function SettingsSection({
  policy,
  storeId,
  onPolicyUpdated,
}: SettingsSectionProps) {
  const t = useTranslations("ToolPolicyDetail.settings");
  const router = useRouter();
  const [name, setName] = useState(policy.name);
  const [description, setDescription] = useState(policy.description);
  const [action, setAction] = useState(policy.action);
  const [isSaving, setIsSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isDirty =
    name !== policy.name ||
    description !== policy.description ||
    action !== policy.action;

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await $orpc.updateToolPolicy({
        id: policy.id,
        name: name.trim(),
        description: description.trim(),
        action: action.trim(),
      });
      toast.success(t("saveSuccess"));
      await onPolicyUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  }, [policy.id, name, description, action, onPolicyUpdated, t]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await $orpc.deleteToolPolicy({ id: policy.id });
      toast.success(t("deleteSuccess"));
      router.push(`/dashboard/tools/${storeId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteError"));
      setIsDeleting(false);
    }
  }, [policy.id, storeId, router, t]);

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
            <FieldLabel className="text-xs">{t("nameLabel")}</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
            />
          </Field>
          <Field>
            <FieldLabel className="text-xs">{t("actionLabel")}</FieldLabel>
            <Input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              maxLength={255}
              placeholder="e.g. ReadProject"
            />
          </Field>
          <Field>
            <FieldLabel className="text-xs">
              {t("descriptionLabel")}
            </FieldLabel>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="text-xs"
              maxLength={2048}
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
                {t("delete.description")}
              </p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDelete(true)}
              className="active:scale-[0.96]"
            >
              <Trash2 className="size-3.5 mr-1.5" />
              {t("delete.button")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance">
              {t("delete.dialogTitle", { name: policy.name })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {t("delete.dialogDescription", { name: policy.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
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
