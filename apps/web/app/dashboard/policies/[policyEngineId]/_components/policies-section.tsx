"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  Download,
  LibraryBig,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import MonacoEditor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { Label } from "@/components/ui/label";
import {
  registerCedarLanguage,
  CEDAR_LANGUAGE_ID,
} from "@/lib/cedar-language";
import {
  detectTemplateSlots,
  resolveTemplate,
} from "../../../policy-library/_components/constants";
import { $orpc } from "@/lib/api";
import {
  SYNC_STATUS_CLASSES,
  type EnginePolicy,
  type SyncStatus,
} from "./constants";

interface PoliciesSectionProps {
  engineId: string;
  policies: EnginePolicy[];
  onRefresh: () => void | Promise<void>;
}

type LibraryOption = {
  id: string;
  name: string;
  description: string;
  cedarCode: string;
  type: "permit" | "forbid";
  status: "draft" | "in_review" | "published" | "archived";
  tags: string[];
  isTemplate: boolean;
};

export function PoliciesSection({
  engineId,
  policies,
  onRefresh,
}: PoliciesSectionProps) {
  const t = useTranslations("PolicyEngineDetail.policies");
  const router = useRouter();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const handleSync = useCallback(
    async (p: EnginePolicy) => {
      setSyncingId(p.id);
      try {
        await $orpc.syncPolicy({ enginePolicyId: p.id });
        toast.success(t("syncSuccess", { name: p.name }));
        await onRefresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("syncError"));
      } finally {
        setSyncingId(null);
      }
    },
    [t, onRefresh],
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold tabular-nums">
            {t("title", { count: policies.length })}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setImportOpen(true)}
              className="active:scale-[0.96]"
            >
              <LibraryBig className="size-3.5 mr-1.5" />
              {t("import")}
            </Button>
            <Button
              size="sm"
              onClick={() =>
                router.push(`/dashboard/policies/${engineId}/new`)
              }
              className="active:scale-[0.96]"
            >
              <Plus className="size-3.5 mr-1.5" />
              {t("create")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead>{t("table.type")}</TableHead>
                  <TableHead>{t("table.syncStatus")}</TableHead>
                  <TableHead>{t("table.lastSynced")}</TableHead>
                  <TableHead className="w-28 text-right">
                    {t("table.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-24 text-center text-xs text-muted-foreground text-pretty"
                    >
                      {t("empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  policies.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() =>
                        router.push(
                          `/dashboard/policies/${engineId}/${p.id}`,
                        )
                      }
                    >
                      <TableCell className="font-medium text-primary">
                        <div className="flex items-center gap-1.5">
                          <span>{p.name}</span>
                          {p.libraryPolicyName && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 gap-1 text-violet-600 border-violet-200 bg-violet-50 dark:text-violet-400 dark:border-violet-800 dark:bg-violet-950/30"
                            >
                              <LibraryBig className="size-2.5" />
                              {t("fromLibrary")}
                            </Badge>
                          )}
                        </div>
                        {p.description && (
                          <p className="text-[11px] text-muted-foreground text-pretty line-clamp-1 mt-0.5">
                            {p.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${
                            p.type === "permit"
                              ? "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30"
                              : "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30"
                          }`}
                        >
                          {p.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${SYNC_STATUS_CLASSES[p.syncStatus as SyncStatus]}`}
                        >
                          {t(`syncStatus.${p.syncStatus}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {p.lastSyncedAt
                          ? new Date(p.lastSyncedAt).toLocaleDateString(
                              "en-US",
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )
                          : t("neverSynced")}
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs active:scale-[0.96]"
                          onClick={() => handleSync(p)}
                          disabled={syncingId === p.id}
                        >
                          {syncingId === p.id ? (
                            <Loader2 className="size-3 mr-1 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3 mr-1" />
                          )}
                          {t("syncNow")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ImportFromLibrarySheet
        open={importOpen}
        onOpenChange={setImportOpen}
        engineId={engineId}
        onImported={onRefresh}
      />
    </>
  );
}

function ImportFromLibrarySheet({
  open,
  onOpenChange,
  engineId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  engineId: string;
  onImported: () => void | Promise<void>;
}) {
  const t = useTranslations("PolicyEngineDetail.policies.importSheet");
  const router = useRouter();
  const [library, setLibrary] = useState<LibraryOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);
  const [slotTarget, setSlotTarget] = useState<LibraryOption | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    setIsLoading(true);
    setLoadError(null);
    $orpc
      // Only published library policies are eligible to import into an engine.
      .listPolicies({ status: "published" })
      .then((res) => {
        setLibrary(
          res.policies.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            cedarCode: p.cedarCode,
            type: p.type,
            status: p.status,
            tags: p.tags,
            isTemplate: p.isTemplate,
          })),
        );
        setLoaded(true);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : t("loadError"));
      })
      .finally(() => setIsLoading(false));
  }, [open, loaded, t]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return library;
    return library.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [library, search]);

  const handleImport = useCallback(
    async (p: LibraryOption) => {
      const slots = detectTemplateSlots(p.cedarCode);
      if (p.isTemplate || slots.length > 0) {
        setSlotTarget(p);
        return;
      }
      setImportingId(p.id);
      try {
        const res = await $orpc.createEnginePolicyFromLibrary({
          engineId,
          libraryPolicyId: p.id,
        });
        toast.success(t("success"));
        onOpenChange(false);
        await onImported();
        router.push(`/dashboard/policies/${engineId}/${res.policy.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("error"));
      } finally {
        setImportingId(null);
      }
    },
    [engineId, router, onOpenChange, onImported, t],
  );

  const handleTemplateImported = useCallback(
    async (newPolicyId: string) => {
      setSlotTarget(null);
      onOpenChange(false);
      await onImported();
      router.push(`/dashboard/policies/${engineId}/${newPolicyId}`);
    },
    [engineId, onImported, onOpenChange, router],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-lg! rounded-lg border flex flex-col overflow-hidden">
        <SheetHeader className="border-b py-3 px-3">
          <SheetTitle className="text-sm font-semibold text-balance">
            {t("title")}
          </SheetTitle>
          <SheetDescription className="text-xs text-pretty">
            {t("description")}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="relative px-3 py-3 border-b">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              className="pl-8 text-xs"
              disabled={isLoading || !!loadError}
            />
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : loadError ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive text-pretty">
                {loadError}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <LibraryBig className="size-8 text-muted-foreground/30 mb-3" />
                <p className="text-xs text-muted-foreground text-pretty">
                  {library.length === 0 ? t("empty") : t("emptyFiltered")}
                </p>
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={importingId === p.id}
                  onClick={() => handleImport(p)}
                  className="group w-full rounded-lg border bg-card text-left transition-colors hover:bg-muted/50 active:scale-[0.99] px-3 py-2.5 overflow-hidden"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">
                          {p.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 shrink-0 ${
                            p.type === "permit"
                              ? "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30"
                              : "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30"
                          }`}
                        >
                          {p.type}
                        </Badge>
                        {p.isTemplate && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 shrink-0 gap-1 text-violet-600 border-violet-200 bg-violet-50 dark:text-violet-400 dark:border-violet-800 dark:bg-violet-950/30"
                          >
                            <LibraryBig className="size-2.5" />
                            {t("templateBadge")}
                          </Badge>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 text-pretty">
                          {p.description}
                        </p>
                      )}
                    </div>
                    {importingId === p.id ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                    ) : (
                      <Download className="size-3.5 text-muted-foreground shrink-0" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        <SheetFooter className="border-t py-3 px-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
        </SheetFooter>
      </SheetContent>
      <TemplateSlotBindingSheet
        template={slotTarget}
        engineId={engineId}
        onClose={() => setSlotTarget(null)}
        onImported={handleTemplateImported}
      />
    </Sheet>
  );
}

function TemplateSlotBindingSheet({
  template,
  engineId,
  onClose,
  onImported,
}: {
  template: LibraryOption | null;
  engineId: string;
  onClose: () => void;
  onImported: (newPolicyId: string) => void | Promise<void>;
}) {
  const t = useTranslations(
    "PolicyEngineDetail.policies.importSheet.slotBinding",
  );
  const { resolvedTheme } = useTheme();

  const slots = useMemo(
    () => (template ? detectTemplateSlots(template.cedarCode) : []),
    [template],
  );

  const [name, setName] = useState("");
  const [slotBindings, setSlotBindings] = useState<
    Record<string, { entityType: string; entityId: string }>
  >({});
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!template) return;
    setName(template.name);
    const initial: Record<string, { entityType: string; entityId: string }> = {};
    for (const slot of slots) {
      initial[slot] = { entityType: "", entityId: "" };
    }
    setSlotBindings(initial);
  }, [template, slots]);

  const canImport = useMemo(() => {
    if (!name.trim()) return false;
    return slots.every(
      (slot) =>
        slotBindings[slot]?.entityType.trim() &&
        slotBindings[slot]?.entityId.trim(),
    );
  }, [name, slots, slotBindings]);

  const resolvedPreview = useMemo(() => {
    if (!template || Object.keys(slotBindings).length === 0) return "";
    return resolveTemplate(template.cedarCode, slotBindings);
  }, [template, slotBindings]);

  const handleImport = useCallback(async () => {
    if (!template || !canImport) return;
    setIsImporting(true);
    try {
      const res = await $orpc.createEnginePolicyFromLibrary({
        engineId,
        libraryPolicyId: template.id,
        name: name.trim(),
        slotBindings: {
          principal: slotBindings["?principal"],
          resource: slotBindings["?resource"],
        },
      });
      toast.success(t("success"));
      await onImported(res.policy.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setIsImporting(false);
    }
  }, [template, canImport, engineId, name, slotBindings, onImported, t]);

  return (
    <Sheet open={!!template} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-lg! rounded-lg border flex flex-col overflow-hidden">
        <SheetHeader className="border-b py-3 px-3">
          <SheetTitle className="text-sm font-semibold text-balance">
            {t("title")}
          </SheetTitle>
          <SheetDescription className="text-xs text-pretty">
            {t("description", { name: template?.name ?? "" })}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          <div className="space-y-2">
            <Label className="text-xs">{t("form.name")} *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("form.namePlaceholder")}
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
                  <Label className="text-[11px]">{t("form.entityType")}</Label>
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
            onClick={onClose}
            disabled={isImporting}
          >
            {t("form.cancel")}
          </Button>
          <Button
            onClick={handleImport}
            disabled={!canImport || isImporting}
            className="active:scale-[0.96]"
          >
            {isImporting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
            {t("form.import")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
