"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Copy, Check, Info } from "lucide-react";
import { useState, useCallback } from "react";
import MonacoEditor from "@monaco-editor/react";
// Self-host Monaco under the app CSP (no CDN) — see lib/monaco-setup.ts
import "@/lib/monaco-setup";
import {
  registerCedarLanguage,
  CEDAR_LANGUAGE_ID,
} from "@/lib/cedar-language";
import { Loader2 } from "lucide-react";
import type { PolicyItem } from "../../_components/constants";
import { detectTemplateSlots } from "../../_components/constants";

interface DefinitionSectionProps {
  policy: PolicyItem;
}

export function DefinitionSection({ policy }: DefinitionSectionProps) {
  const t = useTranslations("PolicyLibraryDetail.definition");
  const { resolvedTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  const slots = detectTemplateSlots(policy.cedarCode);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(policy.cedarCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [policy.cedarCode]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">{t("title")}</CardTitle>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
              Cedar
            </Badge>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs"
            onClick={handleCopy}
          >
            <span className="relative inline-flex size-3 items-center justify-center">
              <Check
                aria-hidden
                className={`absolute size-3 text-emerald-500 transition-[opacity,scale,filter] duration-200 ${
                  copied
                    ? "opacity-100 scale-100 blur-0"
                    : "opacity-0 scale-[0.25] blur-[4px]"
                }`}
                style={{ transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)" }}
              />
              <Copy
                aria-hidden
                className={`absolute size-3 transition-[opacity,scale,filter] duration-200 ${
                  copied
                    ? "opacity-0 scale-[0.25] blur-[4px]"
                    : "opacity-100 scale-100 blur-0"
                }`}
                style={{ transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)" }}
              />
            </span>
            {copied ? t("copied") : t("copy")}
          </Button>
        </CardHeader>
        <CardContent>
          {policy.cedarCode ? (
            <div className="space-y-3">
              <div className="rounded-lg border overflow-hidden">
                <MonacoEditor
                  height={Math.min(
                    Math.max(policy.cedarCode.split("\n").length * 20 + 24, 120),
                    400,
                  )}
                  defaultLanguage={CEDAR_LANGUAGE_ID}
                  beforeMount={registerCedarLanguage}
                  theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
                  value={policy.cedarCode}
                  options={{
                    readOnly: true,
                    fontSize: 13,
                    fontFamily:
                      "var(--font-mono, 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace)",
                    minimap: { enabled: false },
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    padding: { top: 12, bottom: 12 },
                    renderLineHighlight: "none",
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    scrollbar: {
                      verticalScrollbarSize: 8,
                      horizontalScrollbarSize: 8,
                    },
                    automaticLayout: true,
                    domReadOnly: true,
                  }}
                  loading={
                    <div className="flex h-24 items-center justify-center">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  }
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("noDefinition")}
            </p>
          )}
        </CardContent>
      </Card>

      {slots.length > 0 && (
        <Card className="rounded-xl border-violet-200 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/20">
          <CardContent className="py-3">
            <div className="flex items-start gap-2.5">
              <div className="rounded-lg bg-violet-100 dark:bg-violet-900/40 p-1.5 shrink-0">
                <Info className="size-3.5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-xs font-medium text-violet-900 dark:text-violet-200 text-balance">
                  {t("templateSlots")}
                </p>
                <p className="text-[11px] text-violet-700 dark:text-violet-400 leading-relaxed text-pretty">
                  {t("templateSlotsDescription")}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
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
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
