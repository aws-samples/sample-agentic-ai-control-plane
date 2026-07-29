"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import type { Value } from "platejs";
import { KEYS } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ArrowLeft,
  CheckCircle2,
  LibraryBig,
  Loader2,
  Redo2,
  Save,
  Search,
  Sparkles,
  Undo2,
  WandSparkles,
  X,
  XCircle,
} from "lucide-react";
import MonacoEditor, { type OnMount } from "@monaco-editor/react";
// Self-host Monaco under the app CSP (no CDN) — see lib/monaco-setup.ts
import "@/lib/monaco-setup";
import type { editor as monacoEditor } from "monaco-editor";
import { MentionKit } from "@/components/editor/plugins/mention-kit";
import {
  registerCedarLanguage,
  CEDAR_LANGUAGE_ID,
} from "@/lib/cedar-language";
import {
  useCedarValidation,
  type CedarDiagnostic,
} from "@/hooks/use-cedar-validation";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";
import { $orpc } from "@/lib/api";
import type { PolicyItem } from "../../_components/constants";

const defaultValue: Value = [
  {
    type: "p",
    children: [{ text: "" }],
  },
];

export default function PolicyLibraryEditPage() {
  const t = useTranslations("PolicyLibraryEdit");
  const params = useParams();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const id = params.id as string;

  const [policy, setPolicy] = useState<PolicyItem | null>(null);
  const [isLoadingPolicy, setIsLoadingPolicy] = useState(true);
  const [policyNotFound, setPolicyNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!id) return;
      setIsLoadingPolicy(true);
      try {
        const res = await $orpc.getPolicy({ id });
        if (cancelled) return;
        setPolicy({
          ...res.policy,
          createdAt: new Date(res.policy.createdAt),
          updatedAt: new Date(res.policy.updatedAt),
          archivedAt: res.policy.archivedAt
            ? new Date(res.policy.archivedAt)
            : null,
        });
      } catch (err) {
        const e = err as { code?: string; status?: number };
        if (e.code === "NOT_FOUND" || e.status === 404) {
          if (!cancelled) setPolicyNotFound(true);
        }
      } finally {
        if (!cancelled) setIsLoadingPolicy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const rawCedar = useMemo(
    () => policy?.cedarCode ?? "",
    [policy?.cedarCode],
  );

  const [cedarText, setCedarText] = useState(rawCedar);
  const hydratedCedarRef = useRef(false);
  useEffect(() => {
    if (!hydratedCedarRef.current && policy) {
      setCedarText(policy.cedarCode);
      hydratedCedarRef.current = true;
    }
  }, [policy]);
  const debouncedCedar = useDebounce(cedarText, 400);
  const isDirty = cedarText !== rawCedar;

  const { isLoading: cedarLoading, loadError, checkParse, formatPolicy } =
    useCedarValidation();

  const [validation, setValidation] = useState<{
    isValid: boolean;
    diagnostics: CedarDiagnostic[];
  } | null>(null);

  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);

  useEffect(() => {
    if (cedarLoading || !debouncedCedar.trim()) {
      setValidation(null);
      return;
    }
    setValidation(checkParse(debouncedCedar));
  }, [debouncedCedar, cedarLoading, checkParse]);

  useEffect(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;

    if (!validation || validation.isValid) {
      monaco.editor.setModelMarkers(model, "cedar", []);
      return;
    }

    const markers: monacoEditor.IMarkerData[] = validation.diagnostics.map(
      (d) => {
        let startLine = 1;
        let startCol = 1;
        let endLine = 1;
        let endCol = 1;

        if (d.start != null && d.end != null) {
          const text = model.getValue();
          const startPos = model.getPositionAt(d.start);
          const endPos = model.getPositionAt(Math.min(d.end, text.length));
          startLine = startPos.lineNumber;
          startCol = startPos.column;
          endLine = endPos.lineNumber;
          endCol = endPos.column;
        } else {
          endCol = model.getLineMaxColumn(1);
        }

        return {
          severity:
            d.severity === "warning"
              ? monaco.MarkerSeverity.Warning
              : d.severity === "advice"
                ? monaco.MarkerSeverity.Info
                : monaco.MarkerSeverity.Error,
          message: d.help ? `${d.message}\n${d.help}` : d.message,
          startLineNumber: startLine,
          startColumn: startCol,
          endLineNumber: endLine,
          endColumn: endCol,
        };
      },
    );

    monaco.editor.setModelMarkers(model, "cedar", markers);
  }, [validation]);

  const handleFormat = useCallback(() => {
    const result = formatPolicy(cedarText);
    if (result.success && result.formatted) {
      setCedarText(result.formatted);
    }
  }, [cedarText, formatPolicy]);

  const handleUndo = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    editor.trigger("toolbar", "undo", null);
  }, []);

  const handleRedo = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    editor.trigger("toolbar", "redo", null);
  }, []);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerCedarLanguage(monaco);
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, CEDAR_LANGUAGE_ID);
    }
  }, []);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Templates sheet state
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<PolicyItem[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [pendingTemplate, setPendingTemplate] = useState<PolicyItem | null>(
    null,
  );

  const handleOpenTemplates = useCallback(async () => {
    setTemplatesOpen(true);
    if (templatesLoaded) return;
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const res = await $orpc.listPolicies({ status: "published" });
      setTemplates(
        res.policies
          .filter((p) => p.id !== id)
          .map((p) => ({
            ...p,
            createdAt: new Date(p.createdAt),
            updatedAt: new Date(p.updatedAt),
            archivedAt: p.archivedAt ? new Date(p.archivedAt) : null,
          })),
      );
      setTemplatesLoaded(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("templates.loadError");
      setTemplatesError(message);
    } finally {
      setTemplatesLoading(false);
    }
  }, [id, t, templatesLoaded]);

  const applyTemplate = useCallback(
    (template: PolicyItem) => {
      setCedarText(template.cedarCode);
      setTemplatesOpen(false);
      setPendingTemplate(null);
      // Focus the editor so the change lands in Monaco's undo stack
      setTimeout(() => editorRef.current?.focus(), 0);
    },
    [],
  );

  const handleTemplateSelect = useCallback(
    (template: PolicyItem) => {
      if (!cedarText.trim()) {
        applyTemplate(template);
      } else {
        setPendingTemplate(template);
      }
    },
    [cedarText, applyTemplate],
  );

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [templates, templateSearch]);

  const handleSaveClick = useCallback(() => {
    setChangeNote("");
    setShowSaveDialog(true);
  }, []);

  const handleSaveConfirm = useCallback(async () => {
    if (!policy) return;
    setIsSaving(true);
    try {
      await $orpc.saveNewVersion({
        id: policy.id,
        cedarCode: cedarText,
        changeNote: changeNote.trim(),
      });
      toast.success(t("toast.saved"));
      setShowSaveDialog(false);
      setChangeNote("");
      router.push(`/dashboard/policy-library/${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("toast.saved");
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [policy, cedarText, changeNote, t, router, id]);

  const handleBack = useCallback(() => {
    if (isDirty) {
      setShowDiscardDialog(true);
    } else {
      router.push(`/dashboard/policy-library/${id}`);
    }
  }, [router, id, isDirty]);

  const handleDiscardConfirm = useCallback(() => {
    setShowDiscardDialog(false);
    router.push(`/dashboard/policy-library/${id}`);
  }, [router, id]);

  const [isGenerating, setIsGenerating] = useState(false);

  const plateEditor = usePlateEditor({
    plugins: [...MentionKit],
    value: defaultValue,
  });

  const handleGenerate = useCallback(async () => {
    type MentionData = {
      id: string;
      name: string;
      category: "entra-user" | "entra-group" | "cognito-group" | "gateway" | "gateway-target" | "gateway-tool" | "agent-runtime";
      subtitle?: string;
      gatewayId?: string;
      gatewayName?: string;
      gatewayArn?: string;
      targetId?: string;
      targetName?: string;
      agentRuntimeId?: string;
      agentRuntimeName?: string;
    };

    const categoryMap: Record<string, MentionData["category"]> = {
      users: "entra-user",
      groups: "entra-group",
      "cognito-groups": "cognito-group",
      gateways: "gateway",
      "gateway-targets": "gateway-target",
      "gateway-tools": "gateway-tool",
      "agent-runtimes": "agent-runtime",
    };

    const mentions: MentionData[] = [];

    function nodeToText(node: any): string {
      if (node.type === KEYS.mention) {
        if (node.key && node.category) {
          const mapped = categoryMap[node.category];
          if (mapped) {
            mentions.push({
              id: node.key,
              name: node.value ?? "",
              category: mapped,
              subtitle: node.subtitle,
              gatewayId: node.gatewayId,
              gatewayName: node.gatewayName,
              gatewayArn: node.gatewayArn,
              targetId: node.targetId,
              targetName: node.targetName,
              agentRuntimeId: node.agentRuntimeId,
              agentRuntimeName: node.agentRuntimeName,
            });
          }
        }
        return node.value ?? "";
      }
      if (node.text != null) return node.text;
      if (Array.isArray(node.children)) {
        return node.children.map(nodeToText).join("");
      }
      return "";
    }

    const naturalLanguage = plateEditor.children
      .map(nodeToText)
      .join("\n")
      .trim();

    if (!naturalLanguage) {
      toast.error(t("generateEmptyError"));
      return;
    }

    setIsGenerating(true);
    try {
      const { cedarPolicy } = await $orpc.generateCedarPolicy({
        naturalLanguage,
        existingPolicy: cedarText || undefined,
        mentions: mentions.length > 0 ? mentions : undefined,
      });
      setCedarText(cedarPolicy);
      toast.success(t("generateSuccess"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("generateError");
      toast.error(message);
      console.error("Error generating Cedar policy:", err);
    } finally {
      setIsGenerating(false);
    }
  }, [plateEditor.children, cedarText, t]);

  if (isLoadingPolicy) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (policyNotFound || !policy) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full flex-col items-center justify-center">
          <p className="text-muted-foreground">{t("notFound")}</p>
          <Button variant="outline" className="mt-4" onClick={handleBack}>
            {t("back")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={handleBack}
              aria-label={t("back")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-sm font-semibold text-foreground text-balance">
                {t("title", { name: policy.name })}
              </h1>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isDirty && (
              <Button size="sm" onClick={handleSaveClick} className="active:scale-[0.96]">
                <Save className="size-3.5 mr-1.5" />
                {t("save")}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={handleBack}>
              <X className="size-3.5 mr-1.5" />
              {t("cancel")}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Left panel — Natural language editor */}
          <div className="flex-1 flex flex-col border-r min-w-0">
            <div className="flex-1 overflow-hidden">
              <Plate editor={plateEditor}>
                <EditorContainer variant="default" className="h-auto min-h-0 flex-1">
                  <Editor
                    variant="none"
                    placeholder={t("placeholder")}
                    className="px-4 py-3 text-sm h-full min-h-[300px]"
                  />
                </EditorContainer>
              </Plate>
            </div>
            <div className="border-t px-4 py-3 flex justify-end">
              <Button size="sm" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5 mr-1.5" />
                )}
                {t("generate")}
              </Button>
            </div>
          </div>

          {/* Right panel — Cedar policy with Monaco + validation */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="border-b px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("cedarPolicy")}
                </h2>
                <ValidationBadge
                  cedarLoading={cedarLoading}
                  loadError={loadError}
                  validation={validation}
                  hasContent={!!cedarText.trim()}
                  t={t}
                />
              </div>
              <TooltipProvider>
                <div className="flex items-center gap-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 text-xs active:scale-[0.96]"
                    onClick={handleOpenTemplates}
                  >
                    <LibraryBig className="size-3.5" />
                    {t("templates.trigger")}
                  </Button>
                  <div className="h-4 w-px bg-border mx-1" />
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={handleUndo}
                        />
                      }
                    >
                      <Undo2 className="size-3.5" />
                    </TooltipTrigger>
                    <TooltipContent>{t("undo")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={handleRedo}
                        />
                      }
                    >
                      <Redo2 className="size-3.5" />
                    </TooltipTrigger>
                    <TooltipContent>{t("redo")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={handleFormat}
                          disabled={cedarLoading || !cedarText.trim()}
                        />
                      }
                    >
                      <WandSparkles className="size-3.5" />
                    </TooltipTrigger>
                    <TooltipContent>{t("format")}</TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </div>

            <div className="flex-1 overflow-hidden">
              <MonacoEditor
                height="100%"
                defaultLanguage={CEDAR_LANGUAGE_ID}
                beforeMount={registerCedarLanguage}
                theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
                value={cedarText}
                onChange={(value) => setCedarText(value ?? "")}
                onMount={handleEditorMount}
                options={{
                  fontSize: 13,
                  fontFamily:
                    "var(--font-mono, 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace)",
                  minimap: { enabled: false },
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  padding: { top: 12, bottom: 12 },
                  renderLineHighlight: "gutter",
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  scrollbar: {
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8,
                  },
                  automaticLayout: true,
                }}
                loading={
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save with version note dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-balance">{t("saveDialog.title")}</DialogTitle>
            <DialogDescription className="text-pretty">{t("saveDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">{t("saveDialog.changeNote")}</Label>
              <Textarea
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder={t("saveDialog.changeNotePlaceholder")}
                rows={3}
                className="text-sm"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSaveConfirm} disabled={isSaving} className="active:scale-[0.96]">
              {isSaving ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="size-3.5 mr-1.5" />
              )}
              {t("saveDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard changes confirmation */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance">{t("discardDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {t("discardDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("discardDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardConfirm} className="active:scale-[0.96]">
              {t("discardDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Templates sheet */}
      <Sheet open={templatesOpen} onOpenChange={setTemplatesOpen}>
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
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
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
              ) : filteredTemplates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <LibraryBig className="size-8 text-muted-foreground/30 mb-3" />
                  <p className="text-xs text-muted-foreground text-pretty">
                    {templates.length === 0
                      ? t("templates.empty")
                      : t("templates.emptyFiltered")}
                  </p>
                </div>
              ) : (
                filteredTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleTemplateSelect(tpl)}
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

      {/* Replace confirmation */}
      <AlertDialog
        open={!!pendingTemplate}
        onOpenChange={(open) => {
          if (!open) setPendingTemplate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance">
              {t("replaceDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {t("replaceDialog.description", {
                name: pendingTemplate?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("replaceDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingTemplate) applyTemplate(pendingTemplate);
              }}
              className="active:scale-[0.96]"
            >
              {t("replaceDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ValidationBadge({
  cedarLoading,
  loadError,
  validation,
  hasContent,
  t,
}: {
  cedarLoading: boolean;
  loadError: string | null;
  validation: { isValid: boolean; diagnostics: CedarDiagnostic[] } | null;
  hasContent: boolean;
  t: ReturnType<typeof useTranslations<"PolicyLibraryEdit">>;
}) {
  if (loadError) {
    return (
      <Badge variant="destructive" className="text-[10px] gap-1 px-1.5 py-0">
        <XCircle className="size-3" />
        {t("validation.loadError")}
      </Badge>
    );
  }

  if (cedarLoading) {
    return (
      <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0">
        <Loader2 className="size-3 animate-spin" />
        {t("validation.loading")}
      </Badge>
    );
  }

  if (!hasContent || !validation) return null;

  if (validation.isValid) {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] gap-1 px-1.5 py-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
      >
        <CheckCircle2 className="size-3" />
        {t("validation.valid")}
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className="text-[10px] gap-1 px-1.5 py-0 bg-destructive/10 text-destructive border-destructive/20"
    >
      <XCircle className="size-3" />
      {t("validation.invalid", { count: validation.diagnostics.length })}
    </Badge>
  );
}
