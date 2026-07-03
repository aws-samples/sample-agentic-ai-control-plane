"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { $orpc } from "@/lib/api";

interface CreateStoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const AWS_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ap-northeast-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
];

const NAMESPACE_REGEX = /^[A-Z][A-Za-z0-9_]*$/;

export function CreateStoreSheet({
  open,
  onOpenChange,
  onCreated,
}: CreateStoreSheetProps) {
  const t = useTranslations("ToolStoreList.createSheet");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [namespace, setNamespace] = useState("");
  const [region, setRegion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setNamespace("");
      setRegion("");
      setIsSubmitting(false);
    }
  }, [open]);

  const namespaceValid =
    namespace.trim() === "" || NAMESPACE_REGEX.test(namespace.trim());
  const namespaceError =
    namespace.trim() !== "" && !namespaceValid
      ? t("fields.namespaceInvalid")
      : null;

  const isValid =
    name.trim() !== "" &&
    namespace.trim() !== "" &&
    namespaceValid &&
    region !== "";

  const handleCreate = async () => {
    if (!isValid) return;
    setIsSubmitting(true);
    try {
      await $orpc.createToolPolicyStore({
        name: name.trim(),
        description: description.trim(),
        namespace: namespace.trim(),
        region,
      });
      toast.success(t("toast.created", { name }));
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create policy store";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-xl! rounded-lg border flex flex-col overflow-hidden">
        <SheetHeader className="border-b py-3 px-4">
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="store-name">{t("fields.name")}</Label>
            <Input
              id="store-name"
              placeholder={t("fields.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="store-description">{t("fields.description")}</Label>
            <Textarea
              id="store-description"
              placeholder={t("fields.descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="store-namespace">{t("fields.namespace")}</Label>
            <Input
              id="store-namespace"
              placeholder={t("fields.namespacePlaceholder")}
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              aria-invalid={namespaceError ? true : undefined}
            />
            {namespaceError ? (
              <p className="text-xs text-destructive">{namespaceError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("fields.namespaceHint")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t("fields.region")}</Label>
            <Select value={region} onValueChange={(v) => setRegion(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder={t("fields.regionPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {AWS_REGIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-t px-4 py-3 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!isValid || isSubmitting}
            className="active:scale-[0.96]"
          >
            {isSubmitting && (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            )}
            {t("create")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
