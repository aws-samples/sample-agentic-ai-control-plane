"use client";

import { useMemo, useState } from "react";
import MonacoEditor from "@monaco-editor/react";
// Self-host Monaco under the app CSP (no CDN) — see lib/monaco-setup.ts
import "@/lib/monaco-setup";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Braces, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  OFFICIAL_SCHEMAS,
  type OfficialSchemaKey,
} from "../_schemas";

const MONACO_OPTIONS_BASE = {
  fontSize: 12,
  fontFamily:
    "var(--font-mono, 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace)",
  minimap: { enabled: false },
  lineNumbers: "on" as const,
  scrollBeyondLastLine: false,
  wordWrap: "on" as const,
  padding: { top: 8, bottom: 8 },
  renderLineHighlight: "none" as const,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
  },
  automaticLayout: true,
  tabSize: 2,
};

interface SchemaEditorPanelProps {
  id: string;
  label: React.ReactNode;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  schemaKey: OfficialSchemaKey;
  showSchema: boolean;
  onShowSchemaChange: (next: boolean) => void;
  /** List of protocol versions to expose in the dropdown. Defaults to the version embedded in schemaKey. */
  versions?: string[];
  placeholder?: string;
  height?: number;
}

export function SchemaEditorPanel({
  id,
  label,
  required,
  value,
  onChange,
  disabled,
  schemaKey,
  showSchema,
  onShowSchemaChange,
  versions,
  placeholder,
  height = 320,
}: SchemaEditorPanelProps) {
  const t = useTranslations("CreateRecordDialog.page.editor");
  const { resolvedTheme } = useTheme();
  const monacoTheme = resolvedTheme === "dark" ? "vs-dark" : "vs";

  const official = OFFICIAL_SCHEMAS[schemaKey];
  // Versions to expose: an explicit override (rare), else all vendored versions
  // for this schema, newest first.
  const versionOptions =
    versions && versions.length > 0
      ? versions
      : official.versions.map((v) => v.version);

  const [selectedVersion, setSelectedVersion] = useState(
    official.defaultVersion,
  );

  const selectedSchema = useMemo(() => {
    const match = official.versions.find((v) => v.version === selectedVersion);
    return (match ?? official.versions[0])?.schema;
  }, [official.versions, selectedVersion]);

  const officialJson = useMemo(
    () => JSON.stringify(selectedSchema, null, 2),
    [selectedSchema],
  );

  const prettify = () => {
    try {
      const parsed = JSON.parse(value);
      onChange(JSON.stringify(parsed, null, 2));
    } catch {
      // ignore; editor keeps current content
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs font-medium">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={prettify}
            disabled={disabled || !value.trim()}
          >
            <Braces className="size-3" />
            Prettify
          </Button>
          <div className="flex items-center gap-2">
            <Label
              htmlFor={`${id}-schema-toggle`}
              className="text-[11px] text-muted-foreground cursor-pointer"
            >
              {t("showOfficialSchema")}
            </Label>
            <Switch
              id={`${id}-schema-toggle`}
              checked={showSchema}
              onCheckedChange={(c) => onShowSchemaChange(Boolean(c))}
              disabled={disabled}
              size="sm"
            />
          </div>
        </div>
      </div>

      <div
        className={cn(
          "grid gap-3",
          showSchema ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1",
        )}
      >
        <div className="flex flex-col rounded-md border bg-background overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {showSchema ? t("yourDefinition") : t("definition")}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">JSON</span>
          </div>
          <MonacoEditor
            height={height}
            defaultLanguage="json"
            theme={monacoTheme}
            value={value}
            onChange={(v) => onChange(v ?? "")}
            options={{
              ...MONACO_OPTIONS_BASE,
              readOnly: disabled,
              domReadOnly: disabled,
            }}
            loading={
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            }
          />
          {!value && placeholder && (
            <div className="pointer-events-none px-3 py-1 text-[11px] text-muted-foreground border-t bg-muted/30 truncate">
              {placeholder}
            </div>
          )}
        </div>

        {showSchema && (
          <div className="flex flex-col rounded-md border bg-muted/20 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-1 border-b bg-muted/40">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {t("officialSchema")}
              </span>
              <Select
                value={selectedVersion}
                onValueChange={(v) => v && setSelectedVersion(v)}
                disabled={versionOptions.length <= 1}
              >
                <SelectTrigger className="h-6 text-[11px] w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {versionOptions.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <MonacoEditor
              height={height}
              defaultLanguage="json"
              theme={monacoTheme}
              value={officialJson}
              options={{
                ...MONACO_OPTIONS_BASE,
                readOnly: true,
                domReadOnly: true,
              }}
              loading={
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
