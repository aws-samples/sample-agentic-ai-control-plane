"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { $orpc } from "@/lib/api";
import { Copy, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { PolicyItem } from "../../_components/constants";

interface DuplicatePolicyDialogProps {
  policy: PolicyItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DuplicatePolicyDialog({
  policy,
  open,
  onOpenChange,
}: DuplicatePolicyDialogProps) {
  const t = useTranslations("PolicyLibraryDetail.settings.duplicateDialog");
  const tLibrary = useTranslations("PolicyLibrary");
  const router = useRouter();

  const [name, setName] = useState(`Copy of ${policy.name}`);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(`Copy of ${policy.name}`);
    }
  }, [open, policy.name]);

  const isValid = name.trim().length > 0 && name.trim() !== policy.name;

  const handleDuplicate = async () => {
    if (!isValid) return;
    setIsSubmitting(true);
    try {
      const { policy: duplicated } = await $orpc.createPolicy({
        name: name.trim(),
        description: policy.description,
        cedarCode: policy.cedarCode,
        type: policy.type,
        status: "draft",
        tags: policy.tags,
        changeNote: `Duplicated from "${policy.name}"`,
      });
      toast.success(t("success"));
      onOpenChange(false);
      router.push(`/dashboard/policy-library/${duplicated.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : tLibrary("errors.createFailed");
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-balance">{t("title")}</DialogTitle>
          <DialogDescription className="text-pretty">
            {t("description", { name: policy.name })}
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Field>
            <FieldLabel className="text-xs">
              {t("nameLabel")} <span className="text-muted-foreground">*</span>
            </FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder={t("namePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isValid && !isSubmitting) {
                  e.preventDefault();
                  handleDuplicate();
                }
              }}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleDuplicate}
            disabled={!isValid || isSubmitting}
            className="active:scale-[0.96]"
          >
            {isSubmitting ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <Copy className="size-3.5 mr-1.5" />
            )}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
