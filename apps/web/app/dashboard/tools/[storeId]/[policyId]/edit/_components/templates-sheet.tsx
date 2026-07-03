"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { LibraryBig, Loader2, Search } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { $orpc } from "@/lib/api";

export type LibraryTemplate = {
  id: string;
  name: string;
  description: string;
  cedarCode: string;
  type: "permit" | "forbid";
  tags: string[];
};

interface TemplatesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCedar: string;
  onApply: (template: LibraryTemplate) => void;
}

export function TemplatesSheet({
  open,
  onOpenChange,
  currentCedar,
  onApply,
}: TemplatesSheetProps) {
  const t = useTranslations("ToolPolicyEdit");
  const [templates, setTemplates] = useState<LibraryTemplate[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<LibraryTemplate | null>(null);

  useEffect(() => {
    if (!open || templatesLoaded) return;
    let cancelled = false;
    setTemplatesLoading(true);
    setTemplatesError(null);
    (async () => {
      try {
        // Only published templates are eligible to pull into a policy.
        const res = await $orpc.listPolicies({
          isTemplate: true,
          status: "published",
        });
        if (cancelled) return;
        setTemplates(
          res.policies.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            cedarCode: p.cedarCode,
            type: p.type as "permit" | "forbid",
            tags: p.tags,
          })),
        );
        setTemplatesLoaded(true);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t("templates.loadError");
        if (!cancelled) setTemplatesError(message);
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, templatesLoaded, t]);

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

  const handleSelect = useCallback(
    (template: LibraryTemplate) => {
      if (!currentCedar.trim()) {
        onApply(template);
        onOpenChange(false);
      } else {
        setPending(template);
      }
    },
    [currentCedar, onApply, onOpenChange],
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-lg! rounded-lg border flex flex-col overflow-hidden">
          <SheetHeader className="border-b py-3 px-3">
            <SheetTitle className="text-sm font-semibold text-balance">
              {t("templates.title")}
            </SheetTitle>
            <SheetDescription className="text-xs text-pretty">
              {t("templates.description")}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="relative px-3 py-3 border-b">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("templates.search")}
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
                    {templates.length === 0
                      ? t("templates.empty")
                      : t("templates.emptyFiltered")}
                  </p>
                </div>
              ) : (
                filtered.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleSelect(tpl)}
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
                        {tpl.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {tpl.tags.slice(0, 3).map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {tag}
                              </Badge>
                            ))}
                            {tpl.tags.length > 3 && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 tabular-nums"
                              >
                                +{tpl.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <pre className="border-t bg-muted/30 px-3 py-2 text-[10px] font-mono leading-relaxed overflow-hidden line-clamp-5 whitespace-pre-wrap break-all">
                      {tpl.cedarCode}
                    </pre>
                  </button>
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!pending}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance">
              {t("replaceDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {t("replaceDialog.description", { name: pending?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("replaceDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) {
                  onApply(pending);
                  setPending(null);
                  onOpenChange(false);
                }
              }}
              className="active:scale-[0.96]"
            >
              {t("replaceDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
