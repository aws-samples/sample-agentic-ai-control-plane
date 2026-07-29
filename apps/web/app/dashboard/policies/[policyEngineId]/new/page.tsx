"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import type { Value } from "platejs";
import { KEYS } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import { toast } from "sonner";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Redo2,
  Save,
  Sparkles,
  Undo2,
  WandSparkles,
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
import { $orpc } from "@/lib/api";

const defaultValue: Value = [
  {
    type: "p",
    children: [{ text: "" }],
  },
];

export default function NewEnginePolicyPage() {
  const t = useTranslations("PolicyEngineDetail.newPolicy");
  const tEdit = useTranslations("PolicyLibraryEdit");
  const router = useRouter();
  const params = useParams();
  const engineId = params.policyEngineId as string;
  const { resolvedTheme } = useTheme();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"permit" | "forbid">("permit");
  const [cedarText, setCedarText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const isValid = name.trim().length > 0 && cedarText.trim().length > 0;
  const debouncedCedar = useDebounce(cedarText, 400);

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

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerCedarLanguage(monaco);
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, CEDAR_LANGUAGE_ID);
    }
  }, []);

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

  const plateEditor = usePlateEditor({
    plugins: [...MentionKit],
    value: defaultValue,
  });

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      toast.error(tEdit("generateEmptyError"));
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
      toast.success(tEdit("generateSuccess"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : tEdit("generateError");
      toast.error(message);
      console.error("Error generating Cedar policy:", err);
    } finally {
      setIsGenerating(false);
    }
  }, [plateEditor.children, cedarText, tEdit]);

  const handleSave = useCallback(async () => {
    if (!isValid) return;
    setIsSaving(true);
    try {
      const res = await $orpc.createEnginePolicyStandalone({
        engineId,
        name: name.trim(),
        description: description.trim(),
        cedarCode: cedarText,
        type,
      });
      toast.success(t("success"));
      router.push(`/dashboard/policies/${engineId}/${res.policy.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setIsSaving(false);
    }
  }, [engineId, name, description, cedarText, type, router, isValid, t]);

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => router.push(`/dashboard/policies/${engineId}`)}
              aria-label={t("back")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <h1 className="text-sm font-semibold text-foreground text-balance">
              {t("title")}
            </h1>
          </div>
          <div className="ml-auto">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!isValid || isSaving}
              className="active:scale-[0.96]"
            >
              {isSaving ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="size-3.5 mr-1.5" />
              )}
              {t("save")}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Metadata rail */}
          <div className="w-72 shrink-0 border-r overflow-y-auto">
            <div className="p-4 space-y-4">
              <Field>
                <FieldLabel className="text-xs">
                  {t("name")} <span className="text-muted-foreground">*</span>
                </FieldLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                  autoFocus
                  maxLength={255}
                />
              </Field>
              <Field>
                <FieldLabel className="text-xs">{t("type")}</FieldLabel>
                <Select
                  value={type}
                  onValueChange={(v) => setType(v as "permit" | "forbid")}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permit">Permit</SelectItem>
                    <SelectItem value="forbid">Forbid</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel className="text-xs">{t("description")}</FieldLabel>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder={t("descriptionPlaceholder")}
                  className="text-xs"
                  maxLength={2048}
                />
              </Field>
            </div>
          </div>

          {/* Left pane — Plate natural-language editor */}
          <div className="flex-1 flex flex-col border-r min-w-0">
            <div className="flex-1 overflow-hidden">
              <Plate editor={plateEditor}>
                <EditorContainer
                  variant="default"
                  className="h-auto min-h-0 flex-1"
                >
                  <Editor
                    variant="none"
                    placeholder={tEdit("placeholder")}
                    className="px-4 py-3 text-sm h-full min-h-[300px]"
                  />
                </EditorContainer>
              </Plate>
            </div>
            <div className="border-t px-4 py-3 flex justify-end">
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="active:scale-[0.96]"
              >
                {isGenerating ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5 mr-1.5" />
                )}
                {tEdit("generate")}
              </Button>
            </div>
          </div>

          {/* Right pane — Cedar with Monaco */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="border-b px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {tEdit("cedarPolicy")}
                </h2>
                <ValidationBadge
                  cedarLoading={cedarLoading}
                  loadError={loadError}
                  validation={validation}
                  hasContent={!!cedarText.trim()}
                  t={tEdit}
                />
              </div>
              <TooltipProvider>
                <div className="flex items-center gap-0.5">
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
                    <TooltipContent>{tEdit("undo")}</TooltipContent>
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
                    <TooltipContent>{tEdit("redo")}</TooltipContent>
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
                    <TooltipContent>{tEdit("format")}</TooltipContent>
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
                onChange={(v) => setCedarText(v ?? "")}
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
