"use client";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { $orpc } from "@/lib/api";
import { useSession } from "@package/auth";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface CreateAgentDialogProps {
  onSuccess?: () => void;
}

export function CreateAgentDialog({ onSuccess }: CreateAgentDialogProps) {
  const t = useTranslations("CreateAgentDialog");
  const router = useRouter();
  const { data: session } = useSession();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const isValid = name.trim().length > 0 && description.trim().length > 0;

  const handleCreate = async () => {
    if (!isValid || !session?.user?.id) return;

    setIsCreating(true);
    try {
      const { agent } = await $orpc.createAgent({
        name: name.trim(),
        description: description.trim(),
        createdById: session.user.id,
      });

      toast.success(t("toast.success"));
      setOpen(false);
      setName("");
      setDescription("");
      onSuccess?.();
      router.push(`/dashboard/agent/${agent.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("toast.error");
      toast.error(message);
      console.error("Error creating agent:", err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-3.5" />
        {t("trigger")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="agent-name">{t("nameLabel")}</Label>
            <Input
              id="agent-name"
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isCreating}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-description">{t("descriptionLabel")}</Label>
            <Textarea
              id="agent-description"
              placeholder={t("descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isCreating}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isCreating}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={!isValid || isCreating}>
            {isCreating && <Loader2 className="size-3.5 animate-spin" />}
            {isCreating ? t("creating") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
