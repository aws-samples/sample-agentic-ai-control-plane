"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { $orpc } from "@/lib/api";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

type Registry = {
  name: string;
  description?: string;
  registryId: string;
  registryArn: string;
  status:
    | "CREATING"
    | "CREATE_FAILED"
    | "READY"
    | "UPDATING"
    | "UPDATE_FAILED"
    | "DELETING"
    | "DELETE_FAILED";
  approvalConfiguration?: { autoApprovalRules?: string[] };
  createdAt?: string | Date;
  updatedAt: string | Date;
};

// GA models approval as an enum-rule array; the UI keeps a simple auto-approve
// toggle. "APPROVE_ALL" present == auto-approve.
const isAutoApproved = (reg: Registry): boolean =>
  reg.approvalConfiguration?.autoApprovalRules?.includes("APPROVE_ALL") ?? false;

interface EditRegistryDialogProps {
  registry: Registry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditRegistryDialog({
  registry,
  open,
  onOpenChange,
  onSuccess,
}: EditRegistryDialogProps) {
  const t = useTranslations("EditRegistryDialog");
  const [description, setDescription] = useState(registry.description ?? "");
  const [autoApproval, setAutoApproval] = useState(isAutoApproved(registry));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state when registry prop changes or dialog opens
  useEffect(() => {
    if (open) {
      setDescription(registry.description ?? "");
      setAutoApproval(isAutoApproved(registry));
      setError(null);
    }
  }, [open, registry]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await $orpc.updateRegistry({
        registryId: registry.registryId,
        description: description.trim() || undefined,
        approvalConfiguration: {
          autoApprovalRules: autoApproval ? ["APPROVE_ALL"] : [],
        },
      });

      toast.success(t("toast.success"));
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      const errorMessage = err.message || t("toast.error");
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !isLoading && onOpenChange(v)}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t("nameLabel")}</Label>
              <p className="text-sm font-medium">{registry.name}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">{t("descriptionLabel")}</Label>
              <Textarea
                id="edit-description"
                placeholder={t("descriptionPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isLoading}
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="edit-auto-approval">
                  {t("autoApprovalLabel")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("autoApprovalHint")}
                </p>
              </div>
              <Switch
                id="edit-auto-approval"
                checked={autoApproval}
                onCheckedChange={setAutoApproval}
                disabled={isLoading}
              />
            </div>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? t("saving") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
