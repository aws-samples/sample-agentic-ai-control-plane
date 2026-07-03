"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { $orpc } from "@/lib/api";
import { EngineList } from "./_components/engine-list";
import { CreatePolicyEngineDialog } from "./_components/create-policy-engine-dialog";

export type PolicyEngine = {
  id: string;
  name: string;
  description: string;
  awsPolicyEngineId?: string | null;
  awsPolicyEngineArn?: string | null;
  region: string;
  status:
    | "CREATING"
    | "ACTIVE"
    | "UPDATING"
    | "DELETING"
    | "CREATE_FAILED"
    | "UPDATE_FAILED"
    | "DELETE_FAILED";
  statusReasons: string[];
  createdAt: Date;
  updatedAt: Date;
  policyCount?: number;
  gatewayCount?: number;
  driftedCount?: number;
};

export default function PolicyEnginesPage() {
  const t = useTranslations("PolicyEngines");
  const [engines, setEngines] = useState<PolicyEngine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEngines = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await $orpc.listPolicyEngines({});
      setEngines(
        res.policyEngines.map((e) => ({
          ...e,
          createdAt: new Date(e.createdAt),
          updatedAt: new Date(e.updatedAt),
        })) as PolicyEngine[],
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("errors.loadFailed");
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchEngines();
  }, [fetchEngines]);

  // If any engine is transitioning, refresh its status every 3s.
  useEffect(() => {
    const transitional = engines.filter(
      (e) =>
        e.status === "CREATING" ||
        e.status === "UPDATING" ||
        e.status === "DELETING",
    );
    if (transitional.length === 0) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const results = await Promise.all(
          transitional.map((e) =>
            $orpc
              .refreshPolicyEngineStatus({ id: e.id })
              .then((res) => res.policyEngine)
              .catch(() => null),
          ),
        );
        if (cancelled) return;
        setEngines((prev) =>
          prev.map((e) => {
            const refreshed = results.find((r) => r && r.id === e.id);
            if (!refreshed) return e;
            return {
              ...refreshed,
              createdAt: new Date(refreshed.createdAt),
              updatedAt: new Date(refreshed.updatedAt),
            } as PolicyEngine;
          }),
        );
      } catch {
        // swallow
      }
    };
    const timer = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [engines]);

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              {t("title")}
            </h1>
            <p className="text-xs text-muted-foreground text-pretty">
              {t("description")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CreatePolicyEngineDialog onSuccess={fetchEngines} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-xs text-destructive">
              {error}
            </div>
          )}

          {isLoading && engines.length === 0 ? (
            <div
              className="flex items-center justify-center py-12"
              role="status"
            >
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <EngineList
              engines={engines}
              isLoading={isLoading}
              onRefresh={fetchEngines}
            />
          )}
        </div>
      </div>
    </div>
  );
}
