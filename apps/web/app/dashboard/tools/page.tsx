"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { $orpc } from "@/lib/api";
import { ToolStoreList, CreateStoreSheet } from "./_components";
import type { ToolPolicyStore } from "./_components/constants";

export default function ToolStoresPage() {
  const t = useTranslations("ToolStoreList");
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [stores, setStores] = useState<ToolPolicyStore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStores = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await $orpc.listToolPolicyStores({});
      setStores(
        res.stores.map((s) => ({
          ...s,
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.updatedAt),
          archivedAt: s.archivedAt ? new Date(s.archivedAt) : null,
          lastSchemaSyncedAt: s.lastSchemaSyncedAt
            ? new Date(s.lastSchemaSyncedAt)
            : null,
          lastSyncedAt: s.lastSyncedAt ? new Date(s.lastSyncedAt) : null,
        })) as ToolPolicyStore[],
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load policy stores";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  // Poll transitional stores every 3s.
  useEffect(() => {
    const transitional = stores.filter(
      (s) => s.status === "CREATING" || s.status === "DELETING",
    );
    if (transitional.length === 0) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const results = await Promise.all(
          transitional.map((s) =>
            $orpc
              .refreshToolPolicyStoreStatus({ id: s.id })
              .then((r) => r.store)
              .catch(() => null),
          ),
        );
        if (cancelled) return;
        setStores((prev) =>
          prev.map((s) => {
            const refreshed = results.find((r) => r && r.id === s.id);
            if (!refreshed) return s;
            return {
              ...refreshed,
              createdAt: new Date(refreshed.createdAt),
              updatedAt: new Date(refreshed.updatedAt),
              archivedAt: refreshed.archivedAt
                ? new Date(refreshed.archivedAt)
                : null,
              lastSchemaSyncedAt: refreshed.lastSchemaSyncedAt
                ? new Date(refreshed.lastSchemaSyncedAt)
                : null,
              lastSyncedAt: refreshed.lastSyncedAt
                ? new Date(refreshed.lastSyncedAt)
                : null,
            } as ToolPolicyStore;
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
  }, [stores]);

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-foreground">
                {t("title")}
              </h1>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {stores.length}{" "}
                {stores.length === 1 ? t("store") : t("stores")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{t("description")}</p>
          </div>
          <Button
            size="sm"
            onClick={() => setCreateSheetOpen(true)}
            className="active:scale-[0.96]"
          >
            <Plus className="size-3.5 mr-1.5" />
            {t("createStore")}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-xs text-destructive">
              {error}
            </div>
          )}

          {isLoading && stores.length === 0 ? (
            <div
              className="flex items-center justify-center py-12"
              role="status"
            >
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ToolStoreList stores={stores} />
          )}
        </div>
      </div>

      <CreateStoreSheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
        onCreated={fetchStores}
      />
    </div>
  );
}
