"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { $orpc } from "@/lib/api";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

interface CreatePolicyEngineDialogProps {
  onSuccess?: () => void;
}

export function CreatePolicyEngineDialog({
  onSuccess,
}: CreatePolicyEngineDialogProps) {
  const t = useTranslations("PolicyEngines.createDialog");
  const tEngines = useTranslations("PolicyEngines");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [openAfter, setOpenAfter] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const nameValid = /^[a-zA-Z][a-zA-Z0-9_]{0,47}$/.test(name);
  const isValid = name.trim().length > 0 && nameValid;

  const reset = () => {
    setName("");
    setDescription("");
    setOpenAfter(true);
  };

  const handleCreate = async () => {
    if (!isValid) return;
    setIsCreating(true);
    try {
      const { policyEngine } = await $orpc.createPolicyEngine({
        name: name.trim(),
        description: description.trim(),
      });
      toast.success(t("success"));
      setOpen(false);
      reset();
      if (openAfter) {
        router.push(`/dashboard/policies/${policyEngine.id}`);
      } else {
        onSuccess?.();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : tEngines("errors.createFailed");
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="h-4 w-4" />
        {t("trigger")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-balance">{t("title")}</DialogTitle>
          <DialogDescription className="text-pretty">
            {t("description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field>
            <FieldLabel className="text-xs">
              {t("name.label")}{" "}
              <span className="text-muted-foreground">*</span>
            </FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder={t("name.placeholder")}
              maxLength={48}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isValid && !isCreating) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
            {name && !nameValid && (
              <p className="text-[11px] text-destructive">
                {t("name.invalid")}
              </p>
            )}
          </Field>
          <Field>
            <FieldLabel className="text-xs">{t("descriptionLabel")}</FieldLabel>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("descriptionPlaceholder")}
              className="text-xs"
              maxLength={4096}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!isValid || isCreating}
            className="active:scale-[0.96]"
          >
            {isCreating && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
