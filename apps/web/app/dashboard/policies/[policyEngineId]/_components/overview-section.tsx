"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Check,
  Copy,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { $orpc } from "@/lib/api";
import {
  ENGINE_STATUS_CLASSES,
  type EngineStatus,
  type EnginePolicy,
  type GatewayAttachment,
} from "./constants";

interface OverviewSectionProps {
  engine: {
    id: string;
    name: string;
    description: string;
    awsPolicyEngineId?: string | null;
    awsPolicyEngineArn?: string | null;
    region: string;
    status: EngineStatus;
    statusReasons: string[];
    createdAt: Date;
    updatedAt: Date;
    policyCount?: number;
    gatewayCount?: number;
    driftedCount?: number;
  };
  policies: EnginePolicy[];
  attachments: GatewayAttachment[];
  onRefresh: () => void | Promise<void>;
}

function formatDateTime(d?: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OverviewSection({
  engine,
  policies,
  attachments,
  onRefresh,
}: OverviewSectionProps) {
  const t = useTranslations("PolicyEngineDetail.overview");
  const tSync = useTranslations("PolicyEngineDetail.syncAll");
  const [confirmSync, setConfirmSync] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedArn, setCopiedArn] = useState(false);

  const handleSyncAll = useCallback(async () => {
    setIsSyncing(true);
    try {
      const { batch } = await $orpc.syncEngine({ engineId: engine.id });
      toast.success(
        tSync("result", {
          success: batch.successCount,
          failure: batch.failureCount,
        }),
      );
      setConfirmSync(false);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tSync("error"));
    } finally {
      setIsSyncing(false);
    }
  }, [engine.id, onRefresh, tSync]);

  const handleCopyArn = () => {
    if (!engine.awsPolicyEngineArn) return;
    navigator.clipboard.writeText(engine.awsPolicyEngineArn);
    setCopiedArn(true);
    setTimeout(() => setCopiedArn(false), 2000);
  };

  return (
    <div className="space-y-6">
      {!!engine.driftedCount && engine.driftedCount > 0 && (
        <Card className="rounded-xl border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-2.5 py-3">
            <div className="rounded-lg bg-amber-100 dark:bg-amber-900/40 p-1.5 shrink-0">
              <TriangleAlert className="size-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 space-y-0.5">
              <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                {t("driftBanner.title", { count: engine.driftedCount })}
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed text-pretty">
                {t("driftBanner.description")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            {t("title")}
          </CardTitle>
          <Button
            size="sm"
            onClick={() => setConfirmSync(true)}
            disabled={(engine.policyCount ?? policies.length) === 0}
            className="active:scale-[0.96]"
          >
            <RefreshCw className="size-3.5 mr-1.5" />
            {t("syncAll")}
          </Button>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-3">
            <Field label={t("status")}>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${ENGINE_STATUS_CLASSES[engine.status]}`}
              >
                {engine.status}
              </Badge>
            </Field>
            <Field label={t("region")}>
              <span className="text-xs font-mono">{engine.region}</span>
            </Field>
            <Field label={t("policies")}>
              <span className="text-xs tabular-nums">
                {engine.policyCount ?? policies.length}
              </span>
            </Field>
            <Field label={t("gateways")}>
              <span className="text-xs tabular-nums">
                {engine.gatewayCount ?? attachments.length}
              </span>
            </Field>
            <Field label={t("created")}>
              <span className="text-xs tabular-nums">
                {formatDateTime(engine.createdAt)}
              </span>
            </Field>
            <Field label={t("updated")}>
              <span className="text-xs tabular-nums">
                {formatDateTime(engine.updatedAt)}
              </span>
            </Field>
            {engine.awsPolicyEngineId && (
              <Field label={t("awsEngineId")}>
                <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono tabular-nums">
                  {engine.awsPolicyEngineId}
                </code>
              </Field>
            )}
            {engine.awsPolicyEngineArn && (
              <div className="col-span-2 md:col-span-3 space-y-1">
                <dt className="text-[11px] text-muted-foreground uppercase tracking-wider">
                  {t("awsEngineArn")}
                </dt>
                <dd>
                  <button
                    type="button"
                    onClick={handleCopyArn}
                    className="group flex items-center gap-1.5"
                  >
                    <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground break-all">
                      {engine.awsPolicyEngineArn}
                    </code>
                    <span className="relative inline-flex size-3 items-center justify-center shrink-0">
                      <Check
                        aria-hidden
                        className={`absolute size-3 text-emerald-500 transition-[opacity,scale,filter] duration-200 ${
                          copiedArn
                            ? "opacity-100 scale-100 blur-0"
                            : "opacity-0 scale-[0.25] blur-[4px]"
                        }`}
                        style={{
                          transitionTimingFunction:
                            "cubic-bezier(0.2, 0, 0, 1)",
                        }}
                      />
                      <Copy
                        aria-hidden
                        className={`absolute size-3 text-muted-foreground transition-[opacity,scale,filter] duration-200 ${
                          copiedArn
                            ? "opacity-0 scale-[0.25] blur-[4px]"
                            : "opacity-0 group-hover:opacity-100 scale-100 blur-0"
                        }`}
                        style={{
                          transitionTimingFunction:
                            "cubic-bezier(0.2, 0, 0, 1)",
                        }}
                      />
                    </span>
                  </button>
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {engine.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              {t("description")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
              {engine.description}
            </p>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmSync} onOpenChange={setConfirmSync}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance tabular-nums">
              {tSync("title", {
                count: engine.policyCount ?? policies.length,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty tabular-nums">
              {tSync("description", {
                count: engine.policyCount ?? policies.length,
                name: engine.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tSync("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSyncAll}
              disabled={isSyncing}
              className="active:scale-[0.96]"
            >
              {isSyncing && (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              )}
              {tSync("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] text-muted-foreground uppercase tracking-wider">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
