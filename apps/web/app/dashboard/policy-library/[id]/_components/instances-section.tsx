"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, Loader2, Plus } from "lucide-react";
import MonacoEditor from "@monaco-editor/react";
import {
  registerCedarLanguage,
  CEDAR_LANGUAGE_ID,
} from "@/lib/cedar-language";
import { $orpc } from "@/lib/api";
import {
  detectTemplateSlots,
  resolveTemplate,
  type PolicyItem,
} from "../../_components/constants";

interface InstancesSectionProps {
  policy: PolicyItem;
}

function hydratePolicy(p: PolicyItem): PolicyItem {
  return {
    ...p,
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
    archivedAt: p.archivedAt ? new Date(p.archivedAt) : null,
  };
}

function formatDate(dateValue?: string | Date | null) {
  if (!dateValue) return "—";
  return new Date(dateValue).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function InstancesSection({ policy }: InstancesSectionProps) {
  const t = useTranslations("PolicyLibraryDetail.instances");
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const [instances, setInstances] = useState<PolicyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const slots = useMemo(
    () => detectTemplateSlots(policy.cedarCode),
    [policy.cedarCode],
  );

  const fetchInstances = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await $orpc.listPolicies({ parentTemplateId: policy.id });
      setInstances(res.policies.map(hydratePolicy));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("loadError");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [policy.id, t]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [slotBindings, setSlotBindings] = useState<
    Record<string, { entityType: string; entityId: string }>
  >({});
  const [isCreating, setIsCreating] = useState(false);

  const handleOpenCreate = useCallback(() => {
    setNewName("");
    setNewDescription("");
    const initial: Record<string, { entityType: string; entityId: string }> = {};
    for (const slot of slots) {
      initial[slot] = { entityType: "", entityId: "" };
    }
    setSlotBindings(initial);
    setIsCreateOpen(true);
  }, [slots]);

  const canCreate = useMemo(() => {
    if (!newName.trim()) return false;
    return slots.every(
      (slot) =>
        slotBindings[slot]?.entityType.trim() &&
        slotBindings[slot]?.entityId.trim(),
    );
  }, [newName, slots, slotBindings]);

  const resolvedPreview = useMemo(() => {
    if (!policy.cedarCode || Object.keys(slotBindings).length === 0) return "";
    return resolveTemplate(policy.cedarCode, slotBindings);
  }, [policy.cedarCode, slotBindings]);

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;
    setIsCreating(true);
    try {
      const res = await $orpc.instantiateTemplate({
        templateId: policy.id,
        name: newName.trim(),
        description: newDescription.trim(),
        principal: slotBindings["?principal"],
        resource: slotBindings["?resource"],
      });
      toast.success(t("createSuccess"));
      setIsCreateOpen(false);
      router.push(`/dashboard/policy-library/${res.policy.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("createError");
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [
    canCreate,
    policy.id,
    newName,
    newDescription,
    slotBindings,
    router,
    t,
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold tabular-nums">
            {t("title", { count: instances.length })}
          </CardTitle>
          {slots.length > 0 && (
            <Button
              size="sm"
              onClick={handleOpenCreate}
              className="active:scale-[0.96]"
            >
              <Plus className="size-3.5 mr-1.5" />
              {t("create")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive text-pretty">
              {error}
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.name")}</TableHead>
                    <TableHead>{t("table.status")}</TableHead>
                    <TableHead>{t("table.created")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instances.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-24 text-center text-muted-foreground text-xs"
                      >
                        {slots.length > 0
                          ? t("empty")
                          : t("noSlots")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    instances.map((inst) => (
                      <TableRow
                        key={inst.id}
                        className="cursor-pointer transition-colors hover:bg-muted/50"
                        onClick={() =>
                          router.push(`/dashboard/policy-library/${inst.id}`)
                        }
                      >
                        <TableCell className="font-medium text-primary">
                          {inst.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {inst.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs tabular-nums">
                          {formatDate(inst.createdAt)}
                        </TableCell>
                        <TableCell>
                          <ExternalLink className="size-3.5 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-lg! rounded-lg border flex flex-col overflow-hidden">
          <SheetHeader className="border-b py-3 px-3">
            <SheetTitle className="text-sm font-semibold text-balance">
              {t("createTitle")}
            </SheetTitle>
            <SheetDescription className="text-xs text-pretty">
              {t("createDescription")}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            <div className="space-y-2">
              <Label className="text-xs">{t("form.name")} *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("form.namePlaceholder")}
                className="text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("form.description")}</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder={t("form.descriptionPlaceholder")}
                className="text-xs"
              />
            </div>

            {slots.map((slot) => (
              <div key={slot} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {slot}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {t("form.bindingFor")}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">
                      {t("form.entityType")}
                    </Label>
                    <Input
                      value={slotBindings[slot]?.entityType ?? ""}
                      onChange={(e) =>
                        setSlotBindings((prev) => ({
                          ...prev,
                          [slot]: {
                            entityType: e.target.value,
                            entityId: prev[slot]?.entityId ?? "",
                          },
                        }))
                      }
                      placeholder="AgentCore::OAuthUser"
                      className="text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">{t("form.entityId")}</Label>
                    <Input
                      value={slotBindings[slot]?.entityId ?? ""}
                      onChange={(e) =>
                        setSlotBindings((prev) => ({
                          ...prev,
                          [slot]: {
                            entityType: prev[slot]?.entityType ?? "",
                            entityId: e.target.value,
                          },
                        }))
                      }
                      placeholder="alice"
                      className="text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            ))}

            {resolvedPreview && (
              <div className="space-y-2">
                <Label className="text-[11px]">{t("form.preview")}</Label>
                <div className="rounded-lg border overflow-hidden">
                  <MonacoEditor
                    height={Math.min(
                      Math.max(resolvedPreview.split("\n").length * 18 + 16, 80),
                      240,
                    )}
                    defaultLanguage={CEDAR_LANGUAGE_ID}
                    beforeMount={registerCedarLanguage}
                    theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
                    value={resolvedPreview}
                    options={{
                      readOnly: true,
                      fontSize: 11,
                      fontFamily:
                        "var(--font-mono, 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace)",
                      minimap: { enabled: false },
                      lineNumbers: "off",
                      scrollBeyondLastLine: false,
                      wordWrap: "on",
                      padding: { top: 8, bottom: 8 },
                      renderLineHighlight: "none",
                      overviewRulerLanes: 0,
                      scrollbar: { verticalScrollbarSize: 6 },
                      automaticLayout: true,
                      domReadOnly: true,
                    }}
                    loading={
                      <div className="flex h-16 items-center justify-center">
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      </div>
                    }
                  />
                </div>
              </div>
            )}
          </div>
          <SheetFooter className="border-t py-3 px-3 flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={isCreating}
            >
              {t("form.cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!canCreate || isCreating}
              className="active:scale-[0.96]"
            >
              {isCreating && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              {t("form.create")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
