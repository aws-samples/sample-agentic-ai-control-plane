"use client";

import { useState, useCallback, useMemo } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { RotateCcw, GitCompareArrows } from "lucide-react";
import MonacoEditor, { DiffEditor } from "@monaco-editor/react";
import { Loader2 } from "lucide-react";
import {
  registerCedarLanguage,
  CEDAR_LANGUAGE_ID,
} from "@/lib/cedar-language";
import { toast } from "sonner";
import type { PolicyVersion, PolicyCreator } from "../../_components/constants";

interface VersionHistoryProps {
  versions: PolicyVersion[];
  onRevert: (version: PolicyVersion) => void;
}

function formatDate(dateValue?: string | Date | null) {
  if (!dateValue) return "—";
  return new Date(dateValue).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VersionHistory({ versions, onRevert }: VersionHistoryProps) {
  const t = useTranslations("PolicyLibraryDetail.versions");
  const { resolvedTheme } = useTheme();
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [diffLeft, setDiffLeft] = useState<string>("");
  const [diffRight, setDiffRight] = useState<string>("");
  const [diffLeftLabel, setDiffLeftLabel] = useState("");
  const [diffRightLabel, setDiffRightLabel] = useState("");
  const [revertTarget, setRevertTarget] = useState<PolicyVersion | null>(null);

  const handleCompare = useCallback(
    (leftIdx: number, rightIdx: number) => {
      const left = versions[leftIdx];
      const right = versions[rightIdx];
      if (!left || !right) return;
      setDiffLeft(left.cedarCode);
      setDiffRight(right.cedarCode);
      setDiffLeftLabel(`v${left.version}`);
      setDiffRightLabel(`v${right.version}`);
      setShowDiff(true);
    },
    [versions],
  );

  const handleRevertConfirm = useCallback(() => {
    if (revertTarget) {
      onRevert(revertTarget);
      toast.success(t("revertSuccess", { version: revertTarget.version }));
      setRevertTarget(null);
    }
  }, [revertTarget, onRevert, t]);

  if (versions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold tabular-nums">
            {t("title", { count: 0 })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t("empty")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Diff Compare */}
      {versions.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{t("compare")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Select
                value={diffLeftLabel}
                onValueChange={(val) => {
                  if (!val) return;
                  const v = versions.find((v) => `v${v.version}` === val);
                  if (v) {
                    setDiffLeft(v.cedarCode);
                    setDiffLeftLabel(val);
                  }
                }}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs tabular-nums">
                  <SelectValue placeholder={t("selectVersion")} />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.version} value={`v${v.version}`} className="tabular-nums">
                      v{v.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <GitCompareArrows className="size-4 text-muted-foreground" />
              <Select
                value={diffRightLabel}
                onValueChange={(val) => {
                  if (!val) return;
                  const v = versions.find((v) => `v${v.version}` === val);
                  if (v) {
                    setDiffRight(v.cedarCode);
                    setDiffRightLabel(val);
                  }
                }}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs tabular-nums">
                  <SelectValue placeholder={t("selectVersion")} />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.version} value={`v${v.version}`} className="tabular-nums">
                      v{v.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={!diffLeft || !diffRight || diffLeftLabel === diffRightLabel}
                onClick={() => setShowDiff(true)}
              >
                {t("comparBtn")}
              </Button>
            </div>
            {showDiff && diffLeft && diffRight && diffLeftLabel !== diffRightLabel && (
              <div className="mt-4 rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between border-b px-3 py-1.5 bg-muted/50">
                  <span className="text-xs font-medium tabular-nums">{diffLeftLabel} → {diffRightLabel}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px]"
                    onClick={() => setShowDiff(false)}
                  >
                    {t("closeDiff")}
                  </Button>
                </div>
                <DiffEditor
                  height={280}
                  original={diffLeft}
                  modified={diffRight}
                  language={CEDAR_LANGUAGE_ID}
                  beforeMount={registerCedarLanguage}
                  theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
                  options={{
                    readOnly: true,
                    fontSize: 12,
                    fontFamily:
                      "var(--font-mono, 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace)",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    renderOverviewRuler: false,
                    padding: { top: 8, bottom: 8 },
                    automaticLayout: true,
                  }}
                  loading={
                    <div className="flex h-32 items-center justify-center">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  }
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Version Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold tabular-nums">
            {t("title", { count: versions.length })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border" />
            <div className="space-y-0">
              {versions.map((v, idx) => (
                <div key={v.version} className="relative pl-10 pb-6 last:pb-0">
                  <div className="absolute left-0 top-1 flex items-center justify-center">
                    <div
                      className={`size-[30px] rounded-full border-2 flex items-center justify-center text-[10px] font-bold tabular-nums ${
                        idx === 0
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground"
                      }`}
                    >
                      v{v.version}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-card">
                    <div
                      role="button"
                      tabIndex={0}
                      className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50 cursor-pointer"
                      onClick={() =>
                        setExpandedVersion(
                          expandedVersion === v.version ? null : v.version,
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedVersion(
                            expandedVersion === v.version ? null : v.version,
                          );
                        }
                      }}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{v.changeNote}</span>
                          {idx === 0 && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0">
                              {t("current")}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{v.createdBy.name}</span>
                          <span>·</span>
                          <span className="tabular-nums">{formatDate(v.createdAt)}</span>
                        </div>
                      </div>
                      {idx !== 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1.5 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRevertTarget(v);
                          }}
                        >
                          <RotateCcw className="size-3" />
                          {t("revert")}
                        </Button>
                      )}
                    </div>
                    {expandedVersion === v.version && (
                      <div className="border-t px-4 py-3">
                        <div className="rounded-md overflow-hidden border">
                          <MonacoEditor
                            height={Math.min(
                              Math.max(v.cedarCode.split("\n").length * 20 + 16, 80),
                              300,
                            )}
                            defaultLanguage={CEDAR_LANGUAGE_ID}
                            beforeMount={registerCedarLanguage}
                            theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
                            value={v.cedarCode}
                            options={{
                              readOnly: true,
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
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Revert confirmation */}
      <AlertDialog open={!!revertTarget} onOpenChange={(open) => !open && setRevertTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance">{t("revertTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty tabular-nums">
              {t("revertDescription", { version: revertTarget?.version ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("revertCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevertConfirm} className="active:scale-[0.96]">
              {t("revertConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
