"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useSession } from "@package/auth";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

interface CreatePolicyDialogProps {
  onSuccess?: () => void;
}

export function CreatePolicyDialog({ onSuccess }: CreatePolicyDialogProps) {
  const t = useTranslations("PolicyLibrary.createDialog");
  const tLibrary = useTranslations("PolicyLibrary");
  const router = useRouter();
  const { data: session } = useSession();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [openEditorAfter, setOpenEditorAfter] = useState(true);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const isValid = name.trim().length > 0 && !!session?.user?.id;

  const reset = () => {
    setName("");
    setDescription("");
    setOpenEditorAfter(true);
    setSaveAsTemplate(false);
  };

  const handleCreate = async () => {
    if (!isValid) return;
    setIsCreating(true);
    try {
      const { policy } = await $orpc.createPolicy({
        name: name.trim(),
        description: description.trim(),
        cedarCode: saveAsTemplate ? t("scaffoldedCedar") : "",
        type: "permit",
        status: "draft",
        tags: [],
        isTemplate: saveAsTemplate,
        changeNote: saveAsTemplate ? "Initial template draft" : "Initial draft",
      });
      toast.success(t("toast.success"));
      setOpen(false);
      reset();
      if (openEditorAfter) {
        router.push(`/dashboard/policy-library/${policy.id}/edit`);
      } else {
        onSuccess?.();
        router.push(`/dashboard/policy-library/${policy.id}`);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : tLibrary("errors.createFailed");
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && isValid && !isCreating) {
                  e.preventDefault();
                  handleCreate();
                }
              }}
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
              placeholder={t("descriptionPlaceholder")}
              className="text-xs"
            />
          </Field>
          <label className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3 cursor-pointer">
            <Checkbox
              checked={openEditorAfter}
              onCheckedChange={(v) => setOpenEditorAfter(!!v)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <p className="text-xs font-medium">{t("openEditor.label")}</p>
              <p className="text-xs text-muted-foreground leading-relaxed text-pretty">
                {t("openEditor.helper")}
              </p>
            </div>
          </label>
          <label className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3 cursor-pointer">
            <Checkbox
              checked={saveAsTemplate}
              onCheckedChange={(v) => setSaveAsTemplate(!!v)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <p className="text-xs font-medium">
                {t("saveAsTemplate.label")}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed text-pretty">
                {t("saveAsTemplate.helper")}
              </p>
            </div>
          </label>
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
