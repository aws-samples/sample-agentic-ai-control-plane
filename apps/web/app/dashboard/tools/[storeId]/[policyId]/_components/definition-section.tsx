"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import MonacoEditor from "@monaco-editor/react";
// Self-host Monaco under the app CSP (no CDN) — see lib/monaco-setup.ts
import "@/lib/monaco-setup";
import { Check, Copy, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CEDAR_LANGUAGE_ID,
  registerCedarLanguage,
} from "@/lib/cedar-language";
import type { ToolPolicy } from "../../../_components/constants";

interface DefinitionSectionProps {
  policy: ToolPolicy;
  storeId: string;
  onPolicyUpdated: () => void | Promise<void>;
  resolvedTheme?: string;
}

export function DefinitionSection({
  policy,
  storeId,
  resolvedTheme: themeProp,
}: DefinitionSectionProps) {
  const t = useTranslations("ToolPolicyDetail.definition");
  const router = useRouter();
  const { resolvedTheme: themeFromHook } = useTheme();
  const theme = themeProp ?? themeFromHook;
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(policy.cedarCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [policy.cedarCode]);

  const lineCount = Math.max(policy.cedarCode.split("\n").length, 6);
  const editorHeight = Math.min(Math.max(lineCount * 20 + 24, 160), 500);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">{t("title")}</CardTitle>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopy}
            className="active:scale-[0.96]"
          >
            <span className="relative inline-flex size-3.5 items-center justify-center shrink-0 mr-1.5">
              <Check
                aria-hidden
                className={`absolute size-3.5 text-emerald-500 transition-[opacity,scale,filter] duration-200 ${
                  copied
                    ? "opacity-100 scale-100 blur-0"
                    : "opacity-0 scale-[0.25] blur-[4px]"
                }`}
                style={{
                  transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)",
                }}
              />
              <Copy
                aria-hidden
                className={`absolute size-3.5 transition-[opacity,scale,filter] duration-200 ${
                  copied
                    ? "opacity-0 scale-[0.25] blur-[4px]"
                    : "opacity-100 scale-100 blur-0"
                }`}
                style={{
                  transitionTimingFunction: "cubic-bezier(0.2, 0, 0, 1)",
                }}
              />
            </span>
            {copied ? t("copied") : t("copy")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              router.push(`/dashboard/tools/${storeId}/${policy.id}/edit`)
            }
            className="active:scale-[0.96]"
          >
            <Pencil className="size-3.5 mr-1.5" />
            {t("edit")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {policy.cedarCode ? (
          <div className="rounded-lg border overflow-hidden">
            <MonacoEditor
              height={editorHeight}
              defaultLanguage={CEDAR_LANGUAGE_ID}
              beforeMount={registerCedarLanguage}
              theme={theme === "dark" ? "vs-dark" : "vs"}
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
                domReadOnly: true,
                contextmenu: false,
                folding: true,
                automaticLayout: true,
              }}
              loading={
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              }
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noDefinition")}</p>
        )}
        {policy.isTemplateLinked && policy.templateLinkId && (
          <p className="text-xs text-muted-foreground mt-3">
            {t("templateNote")}{" "}
            <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
              {policy.templateLinkId}
            </code>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
