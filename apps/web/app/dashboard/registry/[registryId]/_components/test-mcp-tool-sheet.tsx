"use client";

import { useEffect, useMemo, useState } from "react";
import MonacoEditor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Loader2, Play, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { $orpc } from "@/lib/api";

type AuthType = "none" | "sigv4" | "jwt";

type PropertySchema = {
  type?: string | string[];
  description?: string;
  enum?: string[];
  default?: unknown;
  format?: string;
  items?: unknown;
  properties?: Record<string, unknown>;
};

type ToolSchema = {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, PropertySchema>;
    required?: string[];
  };
};

interface TestMcpToolSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint: string;
  tool: ToolSchema | null;
  defaultAuth: { type: AuthType; bearerToken?: string };
}

type RunResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

function normalizeType(schema: PropertySchema | undefined): string {
  if (!schema) return "string";
  if (Array.isArray(schema.type)) {
    return schema.type.find((t) => t !== "null") ?? "string";
  }
  return schema.type ?? "string";
}

function initialValueFor(schema: PropertySchema | undefined): string {
  if (!schema) return "";
  if (schema.default !== undefined) {
    if (typeof schema.default === "string") return schema.default;
    try {
      return JSON.stringify(schema.default, null, 2);
    } catch {
      return "";
    }
  }
  return "";
}

export function TestMcpToolSheet({
  open,
  onOpenChange,
  endpoint,
  tool,
  defaultAuth,
}: TestMcpToolSheetProps) {
  const tTT = useTranslations("RecordDetailPage.testTool");
  const { resolvedTheme } = useTheme();
  const monacoTheme = resolvedTheme === "dark" ? "vs-dark" : "vs";

  const [authType, setAuthType] = useState<AuthType>(defaultAuth.type);
  const [bearerToken, setBearerToken] = useState(defaultAuth.bearerToken ?? "");
  const [useRawJson, setUseRawJson] = useState(false);
  const [rawJson, setRawJson] = useState("{}");
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const properties = tool?.inputSchema?.properties ?? {};
  const required = useMemo(() => new Set(tool?.inputSchema?.required ?? []), [tool]);

  // Reset state whenever the target tool changes or the sheet is re-opened.
  useEffect(() => {
    if (!open || !tool) return;
    setAuthType(defaultAuth.type);
    setBearerToken(defaultAuth.bearerToken ?? "");
    setUseRawJson(false);
    setResult(null);
    setErrors({});
    const initial: Record<string, string> = {};
    for (const [key, schema] of Object.entries(tool.inputSchema?.properties ?? {})) {
      initial[key] = initialValueFor(schema as PropertySchema);
    }
    setValues(initial);
    setRawJson(JSON.stringify(formValuesToArgs(initial, tool.inputSchema?.properties ?? {}), null, 2));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tool?.name]);

  const setField = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const buildArgs = (): { args: Record<string, unknown>; errors: Record<string, string> } => {
    if (useRawJson) {
      try {
        const parsed = JSON.parse(rawJson || "{}");
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          return { args: {}, errors: { __raw: "Arguments must be a JSON object" } };
        }
        return { args: parsed as Record<string, unknown>, errors: {} };
      } catch (e) {
        return {
          args: {},
          errors: { __raw: e instanceof Error ? e.message : "Invalid JSON" },
        };
      }
    }

    const args: Record<string, unknown> = {};
    const errs: Record<string, string> = {};

    for (const [key, rawSchema] of Object.entries(properties)) {
      const schema = rawSchema as PropertySchema;
      const type = normalizeType(schema);
      const raw = values[key] ?? "";
      const isRequired = required.has(key);

      if (!raw.trim()) {
        if (isRequired) errs[key] = "Required";
        continue;
      }

      if (type === "number" || type === "integer") {
        const n = Number(raw);
        if (Number.isNaN(n)) {
          errs[key] = "Must be a number";
        } else {
          args[key] = type === "integer" ? Math.trunc(n) : n;
        }
      } else if (type === "boolean") {
        args[key] = raw === "true";
      } else if (type === "array" || type === "object") {
        try {
          args[key] = JSON.parse(raw);
        } catch (e) {
          errs[key] = e instanceof Error ? e.message : "Invalid JSON";
        }
      } else {
        args[key] = raw;
      }
    }

    return { args, errors: errs };
  };

  const syncFromRaw = () => {
    try {
      const parsed = JSON.parse(rawJson || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const next: Record<string, string> = { ...values };
        for (const [key, schema] of Object.entries(properties)) {
          const s = schema as PropertySchema;
          const type = normalizeType(s);
          const val = (parsed as Record<string, unknown>)[key];
          if (val === undefined) continue;
          if (type === "boolean") next[key] = String(Boolean(val));
          else if (type === "number" || type === "integer") next[key] = String(val);
          else if (typeof val === "object") next[key] = JSON.stringify(val, null, 2);
          else next[key] = String(val);
        }
        setValues(next);
      }
    } catch {
      // ignore; user stays in raw mode
    }
  };

  const toggleRawJson = (next: boolean) => {
    if (next && !useRawJson) {
      // switching FROM form TO raw: serialize current form into JSON
      const { args } = buildArgs();
      setRawJson(JSON.stringify(args, null, 2));
    }
    if (!next && useRawJson) {
      // switching FROM raw TO form: try to populate form fields
      syncFromRaw();
    }
    setUseRawJson(next);
  };

  const handleRun = async () => {
    if (!tool) return;
    const { args, errors: errs } = buildArgs();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setIsRunning(true);
    setResult(null);
    try {
      const res = await $orpc.callMcpTool({
        endpoint,
        authType,
        bearerToken: authType === "jwt" ? bearerToken.trim() || undefined : undefined,
        toolName: tool.name,
        arguments: args,
      });
      if (res.success) {
        setResult({ ok: true, data: res.result });
      } else {
        setResult({ ok: false, error: res.error || "Tool call failed" });
      }
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Tool call failed" });
    } finally {
      setIsRunning(false);
    }
  };

  const resultString = useMemo(() => {
    if (!result?.ok) return "";
    try {
      return JSON.stringify(result.data, null, 2);
    } catch {
      return String(result.data);
    }
  }, [result]);

  const fieldKeys = Object.keys(properties);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-2xl! rounded-lg border flex flex-col overflow-hidden">
        <SheetHeader className="border-b py-3 px-4">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-md bg-muted flex items-center justify-center">
              <Play className="size-3.5 text-muted-foreground" />
            </div>
            <SheetTitle className="font-mono">{tool?.name ?? tTT("sheetTitle")}</SheetTitle>
          </div>
          {tool?.description && (
            <SheetDescription className="line-clamp-3">
              {tool.description.split("\n")[0]}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Endpoint */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">{tTT("endpointLabel")}</Label>
            <div className="rounded-md bg-muted px-3 py-2">
              <code className="text-[11px] font-mono break-all">{endpoint}</code>
            </div>
          </div>

          {/* Auth */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">{tTT("auth.label")}</Label>
            <RadioGroup
              value={authType}
              onValueChange={(v) => setAuthType(v as AuthType)}
              className="gap-1.5"
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="none" />
                <span className="text-xs">{tTT("auth.none")}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="sigv4" />
                <span className="text-xs">{tTT("auth.sigv4")}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="jwt" />
                <span className="text-xs">{tTT("auth.jwt")}</span>
              </label>
            </RadioGroup>
            {authType === "jwt" && (
              <div className="grid gap-1.5 pt-1">
                <Label htmlFor="bearer-token" className="text-[11px] font-medium text-muted-foreground">
                  {tTT("auth.bearerLabel")}
                </Label>
                <Input
                  id="bearer-token"
                  type="password"
                  placeholder={tTT("auth.bearerPlaceholder")}
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  disabled={isRunning}
                />
                <p className="text-[10px] text-muted-foreground">
                  {tTT("auth.bearerHint")}
                </p>
              </div>
            )}
          </div>

          {/* Arguments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">{tTT("arguments")}</Label>
              <div className="flex items-center gap-2">
                <Label htmlFor="raw-json-toggle" className="text-[11px] text-muted-foreground cursor-pointer">
                  {tTT("rawJson")}
                </Label>
                <Switch
                  id="raw-json-toggle"
                  size="sm"
                  checked={useRawJson}
                  onCheckedChange={(c) => toggleRawJson(Boolean(c))}
                  disabled={isRunning}
                />
              </div>
            </div>

            {useRawJson ? (
              <div className="rounded-md border bg-background overflow-hidden">
                <MonacoEditor
                  height={220}
                  defaultLanguage="json"
                  theme={monacoTheme}
                  value={rawJson}
                  onChange={(v) => setRawJson(v ?? "")}
                  options={{
                    fontSize: 12,
                    fontFamily:
                      "var(--font-mono, 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace)",
                    minimap: { enabled: false },
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    padding: { top: 8, bottom: 8 },
                    renderLineHighlight: "none",
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    scrollbar: {
                      verticalScrollbarSize: 8,
                      horizontalScrollbarSize: 8,
                    },
                    automaticLayout: true,
                    tabSize: 2,
                    readOnly: isRunning,
                  }}
                />
                {errors.__raw && (
                  <div className="border-t bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
                    {errors.__raw}
                  </div>
                )}
              </div>
            ) : fieldKeys.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-4 text-center text-[11px] text-muted-foreground">
                {tTT("noArguments")}
              </div>
            ) : (
              <div className="space-y-3">
                {fieldKeys.map((key) => {
                  const schema = properties[key];
                  const type = normalizeType(schema);
                  const err = errors[key];
                  const isRequired = required.has(key);
                  const enumValues = schema?.enum;

                  return (
                    <div key={key} className="grid gap-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`arg-${key}`} className="text-[11px] font-medium">
                          <span className="font-mono">{key}</span>
                        </Label>
                        <span className="text-[10px] text-muted-foreground">{type}</span>
                        {isRequired && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">
                            {tTT("required")}
                          </Badge>
                        )}
                      </div>
                      {schema?.description && (
                        <p className="text-[10px] text-muted-foreground leading-snug">
                          {schema.description}
                        </p>
                      )}

                      {enumValues && enumValues.length > 0 ? (
                        <Select
                          value={values[key] ?? ""}
                          onValueChange={(v) => setField(key, v ?? "")}
                          disabled={isRunning}
                        >
                          <SelectTrigger id={`arg-${key}`}>
                            <SelectValue placeholder={tTT("selectValuePlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {enumValues.map((v) => (
                              <SelectItem key={v} value={v}>
                                {v}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : type === "boolean" ? (
                        <label
                          htmlFor={`arg-${key}`}
                          className="flex items-center gap-2 cursor-pointer text-xs"
                        >
                          <Checkbox
                            id={`arg-${key}`}
                            checked={values[key] === "true"}
                            onCheckedChange={(c) => setField(key, Boolean(c) ? "true" : "false")}
                            disabled={isRunning}
                          />
                          <span>{values[key] === "true" ? "true" : "false"}</span>
                        </label>
                      ) : type === "array" || type === "object" ? (
                        <Textarea
                          id={`arg-${key}`}
                          value={values[key] ?? ""}
                          onChange={(e) => setField(key, e.target.value)}
                          disabled={isRunning}
                          rows={4}
                          className="font-mono text-xs"
                          placeholder={type === "array" ? "[]" : "{}"}
                        />
                      ) : type === "number" || type === "integer" ? (
                        <Input
                          id={`arg-${key}`}
                          type="number"
                          value={values[key] ?? ""}
                          onChange={(e) => setField(key, e.target.value)}
                          disabled={isRunning}
                        />
                      ) : (
                        <Input
                          id={`arg-${key}`}
                          value={values[key] ?? ""}
                          onChange={(e) => setField(key, e.target.value)}
                          disabled={isRunning}
                        />
                      )}

                      {err && (
                        <p className="text-[10px] text-destructive">{err}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Result */}
          {result && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                {result.ok ? (
                  <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <XCircle className="size-3.5 text-red-600 dark:text-red-400" />
                )}
                <Label className="text-xs font-medium">
                  {result.ok ? tTT("result") : tTT("error")}
                </Label>
              </div>
              {result.ok ? (
                <div className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 overflow-hidden">
                  <div className="max-h-[320px] overflow-auto">
                    <pre className="text-[11px] font-mono p-3 whitespace-pre-wrap break-words leading-relaxed">
                      {resultString || tTT("emptyResult")}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
                  <p className="text-[11px] text-destructive whitespace-pre-wrap break-words">
                    {result.error}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="border-t flex-row justify-end py-3 px-4 mt-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isRunning}
          >
            {tTT("close")}
          </Button>
          <Button size="sm" onClick={handleRun} disabled={isRunning || !tool}>
            {isRunning ? (
              <Loader2 className="mr-2 size-3.5 animate-spin" />
            ) : (
              <Play className="mr-2 size-3.5" />
            )}
            {isRunning ? tTT("running") : tTT("run")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function formValuesToArgs(
  values: Record<string, string>,
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, rawSchema] of Object.entries(properties)) {
    const schema = rawSchema as PropertySchema;
    const type = normalizeType(schema);
    const raw = values[key] ?? "";
    if (!raw.trim()) continue;
    if (type === "boolean") out[key] = raw === "true";
    else if (type === "number" || type === "integer") {
      const n = Number(raw);
      if (!Number.isNaN(n)) out[key] = type === "integer" ? Math.trunc(n) : n;
    } else if (type === "array" || type === "object") {
      try {
        out[key] = JSON.parse(raw);
      } catch {
        /* ignore */
      }
    } else {
      out[key] = raw;
    }
  }
  return out;
}
