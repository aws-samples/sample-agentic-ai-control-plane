"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  ArrowLeft,
  LibraryBig,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import MonacoEditor from "@monaco-editor/react";
// Self-host Monaco under the app CSP (no CDN) — see lib/monaco-setup.ts
import "@/lib/monaco-setup";
import {
  registerCedarLanguage,
  CEDAR_LANGUAGE_ID,
} from "@/lib/cedar-language";
import { $orpc } from "@/lib/api";
import {
  detectTemplateSlots,
  resolveTemplate,
  type PolicyItem,
} from "./constants";

type Step = "pick" | "bind";

function hydrate(p: PolicyItem): PolicyItem {
  return {
    ...p,
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
    archivedAt: p.archivedAt ? new Date(p.archivedAt) : null,
  };
}

export function CreateFromTemplateDialog() {
  const t = useTranslations("PolicyLibrary.createFromTemplate");
  const tLibrary = useTranslations("PolicyLibrary");
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick");

  // Picker state
  const [templates, setTemplates] = useState<PolicyItem[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Binding form state
  const [selected, setSelected] = useState<PolicyItem | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slotBindings, setSlotBindings] = useState<
    Record<string, { entityType: string; entityId: string }>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetPicker = useCallback(() => {
    setStep("pick");
    setSelected(null);
    setName("");
    setDescription("");
    setSlotBindings({});
    setSearch("");
  }, []);

  const loadTemplates = useCallback(async () => {
    if (templatesLoaded) return;
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const res = await $orpc.listPolicies({
        isTemplate: true,
        status: "published",
      });
      setTemplates(res.policies.map(hydrate));
      setTemplatesLoaded(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("loadError");
      setTemplatesError(message);
    } finally {
      setTemplatesLoading(false);
    }
  }, [t, templatesLoaded]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) {
        loadTemplates();
      } else {
        // Reset when closing so the next open starts from the picker
        resetPicker();
      }
    },
    [loadTemplates, resetPicker],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [templates, search]);

  const handlePick = useCallback((tpl: PolicyItem) => {
    const slots = detectTemplateSlots(tpl.cedarCode);
    const initial: Record<string, { entityType: string; entityId: string }> = {};
    for (const slot of slots) {
      initial[slot] = { entityType: "", entityId: "" };
    }
    setSelected(tpl);
    setSlotBindings(initial);
    setName(`${tpl.name} — instance`);
    setDescription("");
    setStep("bind");
  }, []);

  const selectedSlots = useMemo(
    () => (selected ? detectTemplateSlots(selected.cedarCode) : []),
    [selected],
  );

  const canSubmit = useMemo(() => {
    if (!selected || !name.trim()) return false;
    return selectedSlots.every(
      (slot) =>
        slotBindings[slot]?.entityType.trim() &&
        slotBindings[slot]?.entityId.trim(),
    );
  }, [selected, name, selectedSlots, slotBindings]);

  const resolvedPreview = useMemo(() => {
    if (!selected) return "";
    if (Object.keys(slotBindings).length === 0) return selected.cedarCode;
    return resolveTemplate(selected.cedarCode, slotBindings);
  }, [selected, slotBindings]);

  const handleSubmit = useCallback(async () => {
    if (!selected || !canSubmit) return;
    setIsSubmitting(true);
    try {
      const res = await $orpc.instantiateTemplate({
        templateId: selected.id,
        name: name.trim(),
        description: description.trim(),
        principal: slotBindings["?principal"],
        resource: slotBindings["?resource"],
      });
      toast.success(t("success"));
      setOpen(false);
      resetPicker();
      router.push(`/dashboard/policy-library/${res.policy.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : tLibrary("errors.createFailed");
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selected,
    canSubmit,
    name,
    description,
    slotBindings,
    router,
    resetPicker,
    t,
    tLibrary,
  ]);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleOpenChange(true)}
        className="active:scale-[0.96]"
      >
        <LibraryBig className="h-4 w-4" />
        {t("trigger")}
      </Button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-lg! rounded-lg border flex flex-col overflow-hidden">
          <SheetHeader className="border-b py-3 px-3">
            <div className="flex items-center gap-2">
              {step === "bind" && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0"
                  onClick={() => {
                    setStep("pick");
                    setSelected(null);
                  }}
                  aria-label={t("back")}
                >
                  <ArrowLeft className="size-3.5" />
                </Button>
              )}
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-sm font-semibold text-balance">
                  {step === "pick" ? t("pickTitle") : t("bindTitle")}
                </SheetTitle>
                <SheetDescription className="text-xs text-pretty">
                  {step === "pick"
                    ? t("pickDescription")
                    : t("bindDescription", {
                        name: selected?.name ?? "",
                      })}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {step === "pick" ? (
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="relative px-3 py-3 border-b">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("search")}
                  className="pl-8 text-xs"
                  disabled={templatesLoading || !!templatesError}
                />
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {templatesLoading ? (
                  <div
                    className="flex items-center justify-center py-12"
                    role="status"
                  >
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : templatesError ? (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive text-pretty">
                    {templatesError}
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <LibraryBig className="size-8 text-muted-foreground/30 mb-3" />
                    <p className="text-xs text-muted-foreground text-pretty">
                      {templates.length === 0 ? t("empty") : t("emptyFiltered")}
                    </p>
                  </div>
                ) : (
                  filtered.map((tpl) => {
                    const slots = detectTemplateSlots(tpl.cedarCode);
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handlePick(tpl)}
                        className="group w-full rounded-lg border bg-card text-left transition-colors hover:bg-muted/50 active:scale-[0.99] overflow-hidden"
                      >
                        <div className="flex items-start gap-2 px-3 py-2.5">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium truncate">
                                {tpl.name}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 shrink-0 ${
                                  tpl.type === "permit"
                                    ? "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30"
                                    : "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30"
                                }`}
                              >
                                {tpl.type}
                              </Badge>
                            </div>
                            {tpl.description && (
                              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 text-pretty">
                                {tpl.description}
                              </p>
                            )}
                            {slots.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {slots.map((slot) => (
                                  <Badge
                                    key={slot}
                                    variant="outline"
                                    className="font-mono text-[10px] px-1.5 py-0 text-violet-700 border-violet-300 bg-violet-100 dark:text-violet-300 dark:border-violet-700 dark:bg-violet-900/40"
                                  >
                                    {slot}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : selected ? (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                <div className="space-y-2">
                  <Label className="text-xs">
                    {t("form.name")}{" "}
                    <span className="text-muted-foreground">*</span>
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                    placeholder={t("form.namePlaceholder")}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t("form.description")}</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("form.descriptionPlaceholder")}
                    className="text-xs"
                  />
                </div>

                {selectedSlots.length === 0 ? (
                  <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-[11px] text-muted-foreground text-pretty">
                    {t("form.noSlots")}
                  </div>
                ) : (
                  selectedSlots.map((slot) => (
                    <div key={slot} className="space-y-3 rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] px-1.5 py-0 text-violet-700 border-violet-300 bg-violet-100 dark:text-violet-300 dark:border-violet-700 dark:bg-violet-900/40"
                        >
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
                          <Label className="text-[11px]">
                            {t("form.entityId")}
                          </Label>
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
                  ))
                )}

                {resolvedPreview && (
                  <div className="space-y-2">
                    <Label className="text-[11px]">{t("form.preview")}</Label>
                    <div className="rounded-lg border overflow-hidden">
                      <MonacoEditor
                        height={Math.min(
                          Math.max(
                            resolvedPreview.split("\n").length * 18 + 16,
                            80,
                          ),
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
                  onClick={() => {
                    setStep("pick");
                    setSelected(null);
                  }}
                  disabled={isSubmitting}
                >
                  {t("back")}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit || isSubmitting}
                  className="active:scale-[0.96]"
                >
                  {isSubmitting ? (
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5 mr-1.5" />
                  )}
                  {t("form.submit")}
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
