"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { $orpc } from "@/lib/api";
import { ToolPolicyList, CreatePolicySheet, SchemaEditorSection } from "./_components";
import { StoreOverviewSection } from "./_components/store-overview-section";
import { ToolSyncHistorySection } from "./_components/tool-sync-history-section";
import {
  type StoreStatus,
  STORE_STATUS_CLASSES,
  type ToolPolicy,
  type ToolPolicyStore,
} from "../_components/constants";

type Tab = "overview" | "schema" | "policies" | "sync-history";

const TAB_VALUES: Tab[] = ["overview", "schema", "policies", "sync-history"];

export default function ToolStorePoliciesPage() {
  const t = useTranslations("ToolPolicyList");
  const tStore = useTranslations("ToolStoreList");
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [store, setStore] = useState<ToolPolicyStore | null>(null);
  const [policies, setPolicies] = useState<ToolPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [tab, setTab] = useQueryState<Tab>(
    "tab",
    parseAsStringLiteral(TAB_VALUES).withDefault("overview"),
  );

  const fetchStore = useCallback(async () => {
    try {
      const res = await $orpc.getToolPolicyStore({ id: storeId });
      setStore({
        ...res.store,
        createdAt: new Date(res.store.createdAt),
        updatedAt: new Date(res.store.updatedAt),
        archivedAt: res.store.archivedAt ? new Date(res.store.archivedAt) : null,
        lastSchemaSyncedAt: res.store.lastSchemaSyncedAt
          ? new Date(res.store.lastSchemaSyncedAt)
          : null,
        lastSyncedAt: res.store.lastSyncedAt
          ? new Date(res.store.lastSyncedAt)
          : null,
      } as ToolPolicyStore);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load policy store";
      setError(message);
    }
  }, [storeId]);

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await $orpc.listToolPolicies({ storeId });
      setPolicies(
        res.policies.map((p) => ({
          ...p,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
          lastSyncedAt: p.lastSyncedAt ? new Date(p.lastSyncedAt) : null,
        })) as ToolPolicy[],
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load policies";
      toast.error(message);
    }
  }, [storeId]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    await Promise.all([fetchStore(), fetchPolicies()]);
    setIsLoading(false);
  }, [fetchStore, fetchPolicies]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSyncAll = async () => {
    if (!store) return;
    setIsSyncingAll(true);
    try {
      const res = await $orpc.syncToolStore({ storeId });
      toast.success(
        t("toast.syncAllDone", {
          success: res.batch.successCount,
          failure: res.batch.failureCount,
        }),
      );
      await refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to sync store";
      toast.error(message);
    } finally {
      setIsSyncingAll(false);
    }
  };

  const currentTab: Tab = TAB_VALUES.includes(tab) ? tab : "overview";

  const getStoreStatusBadge = (status: StoreStatus) => (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 ${STORE_STATUS_CLASSES[status]}`}
    >
      {tStore(`status.${status}`)}
    </Badge>
  );

  if (isLoading && !store) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full flex-col items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full flex-col items-center justify-center">
          <p className="text-muted-foreground">
            {error ?? t("storeNotFound")}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/dashboard/tools")}
          >
            {t("backToStores")}
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
              onClick={() => router.push("/dashboard/tools")}
              aria-label={t("backToStores")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-semibold text-foreground text-balance">
                  {store.name}
                </h1>
                {getStoreStatusBadge(store.status)}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {store.awsPolicyStoreId ? (
                  <>
                    {t("storeId")}{" "}
                    <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
                      {store.awsPolicyStoreId}
                    </code>
                    <span className="mx-2">·</span>
                  </>
                ) : null}
                {store.namespace}
                <span className="mx-2">·</span>
                {store.region}
                {store.createdBy?.name && (
                  <>
                    <span className="mx-2">·</span>
                    {tStore("overview.createdByInline", {
                      name: store.createdBy.name,
                    })}
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncAll}
              disabled={isSyncingAll || policies.length === 0}
              className="active:scale-[0.96]"
            >
              {isSyncingAll ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Upload className="size-3.5 mr-1.5" />
              )}
              {t("syncAll")}
            </Button>
            <Button
              size="sm"
              onClick={() => setCreateSheetOpen(true)}
              className="active:scale-[0.96]"
            >
              <Plus className="size-3.5 mr-1.5" />
              {t("createPolicy")}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1 border-b px-4 py-2">
          {TAB_VALUES.map((value) => (
            <Button
              key={value}
              variant={currentTab === value ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setTab(value)}
              className="active:scale-[0.96]"
            >
              {value === "overview"
                ? t("tabs.overview")
                : value === "schema"
                  ? t("tabs.schema")
                  : value === "policies"
                    ? t("tabs.policies")
                    : t("tabs.syncHistory")}
            </Button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-4">
          {currentTab === "overview" ? (
            <StoreOverviewSection store={store} policyCount={policies.length} />
          ) : currentTab === "schema" ? (
            <SchemaEditorSection store={store} onSaved={refresh} />
          ) : currentTab === "policies" ? (
            <ToolPolicyList
              policies={policies}
              storeId={storeId}
              onRefresh={refresh}
            />
          ) : (
            <ToolSyncHistorySection storeId={storeId} />
          )}
        </div>
      </div>
      <CreatePolicySheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
        storeId={storeId}
        onCreated={refresh}
      />
    </div>
  );
}
