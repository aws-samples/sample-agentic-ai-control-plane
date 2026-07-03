"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import type { Value } from "platejs";
import { KEYS } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import MonacoEditor, { type OnMount } from "@monaco-editor/react";
import type { editor as monacoEditor } from "monaco-editor";
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
import { Button } from "@/components/ui/button";
import { Editor, EditorContainer } from "@/components/ui/editor";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  LibraryBig,
  Loader2,
  Redo2,
  Save,
  Sparkles,
  Undo2,
  WandSparkles,
  X,
} from "lucide-react";
import { MentionKit } from "@/components/editor/plugins/mention-kit";
import {
  CEDAR_LANGUAGE_ID,
  registerCedarLanguage,
} from "@/lib/cedar-language";
import {
  useCedarValidation,
  type CedarDiagnostic,
} from "@/hooks/use-cedar-validation";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";
import { $orpc } from "@/lib/api";
import type { ToolPolicy } from "../../../_components/constants";
import {
  TemplatesSheet,
  type LibraryTemplate,
} from "./_components/templates-sheet";
import { ValidationBadge } from "./_components/validation-badge";

const defaultValue: Value = [{ type: "p", children: [{ text: "" }] }];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MentionNode = any;

export default function ToolPolicyEditPage() {
  const t = useTranslations("ToolPolicyEdit");
  const params = useParams();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const storeId = params.storeId as string;
  const policyId = params.policyId as string;

  const [policy, setPolicy] = useState<ToolPolicy | null>(null);
  const [isLoadingPolicy, setIsLoadingPolicy] = useState(true);
  const [policyNotFound, setPolicyNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!storeId || !policyId) return;
      setIsLoadingPolicy(true);
      try {
        const res = await $orpc.getToolPolicy({ storeId, policyId });
        if (cancelled) return;
        setPolicy({
          ...res.policy,
          createdAt: new Date(res.policy.createdAt),
          updatedAt: new Date(res.policy.updatedAt),
          lastSyncedAt: res.policy.lastSyncedAt
            ? new Date(res.policy.lastSyncedAt)
            : null,
        } as ToolPolicy);
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
  }, [storeId, policyId]);

  const rawCedar = useMemo(() => policy?.cedarCode ?? "", [policy?.cedarCode]);
  const [cedarText, setCedarText] = useState(rawCedar);
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!hydratedRef.current && policy) {
      setCedarText(policy.cedarCode);
      hydratedRef.current = true;
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
    if (result.success && result.formatted) setCedarText(result.formatted);
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
    if (model) monaco.editor.setModelLanguage(model, CEDAR_LANGUAGE_ID);
  }, []);

  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const plateEditor = usePlateEditor({
    plugins: [...MentionKit],
    value: defaultValue,
  });

  const handleApplyTemplate = useCallback((template: LibraryTemplate) => {
    setCedarText(template.cedarCode);
    setTimeout(() => editorRef.current?.focus(), 0);
  }, []);

  const handleSave = useCallback(async () => {
    if (!policy) return;
    setIsSaving(true);
    try {
      await $orpc.updateToolPolicy({ id: policy.id, cedarCode: cedarText });
      toast.success(t("toast.saved"));
      router.push(`/dashboard/tools/${storeId}/${policyId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("toast.saveError");
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [policy, cedarText, router, storeId, policyId, t]);

  const handleBack = useCallback(() => {
    if (isDirty) setShowDiscardDialog(true);
    else router.push(`/dashboard/tools/${storeId}/${policyId}`);
  }, [router, storeId, policyId, isDirty]);

  const handleDiscardConfirm = useCallback(() => {
    setShowDiscardDialog(false);
    router.push(`/dashboard/tools/${storeId}/${policyId}`);
  }, [router, storeId, policyId]);

  const handleGenerate = useCallback(async () => {
    type MentionData = {
      id: string;
      name: string;
      category:
        | "entra-user"
        | "entra-group"
        | "gateway"
        | "gateway-target"
        | "gateway-tool"
        | "agent-runtime";
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
      gateways: "gateway",
      "gateway-targets": "gateway-target",
      "gateway-tools": "gateway-tool",
      "agent-runtimes": "agent-runtime",
    };

    const mentions: MentionData[] = [];

    function nodeToText(node: MentionNode): string {
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
      const message = err instanceof Error ? err.message : t("generateError");
      toast.error(message);
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
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="active:scale-[0.96]"
              >
                {isSaving ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Save className="size-3.5 mr-1.5" />
                )}
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
          <div className="flex-1 flex flex-col border-r min-w-0">
            <div className="flex-1 overflow-hidden">
              <Plate editor={plateEditor}>
                <EditorContainer
                  variant="default"
                  className="h-auto min-h-0 flex-1"
                >
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
                />
              </div>
              <TooltipProvider>
                <div className="flex items-center gap-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 text-xs active:scale-[0.96]"
                    onClick={() => setTemplatesOpen(true)}
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

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance">
              {t("discardDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {t("discardDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("discardDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscardConfirm}
              className="active:scale-[0.96]"
            >
              {t("discardDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TemplatesSheet
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        currentCedar={cedarText}
        onApply={handleApplyTemplate}
      />
    </div>
  );
}
