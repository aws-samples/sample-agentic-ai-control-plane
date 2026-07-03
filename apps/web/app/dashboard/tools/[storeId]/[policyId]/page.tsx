"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Code,
  FileCode,
  History,
  Loader2,
  Settings,
  Upload,
} from "lucide-react";
import { $orpc } from "@/lib/api";
import {
  POLICY_STATUS_CLASSES,
  POLICY_STATUS_VALUES,
  SYNC_STATUS_CLASSES,
  type ToolPolicy,
  type ToolPolicyStatus,
  type ToolPolicyStore,
} from "../../_components/constants";
import { ToolSyncHistorySection } from "../_components/tool-sync-history-section";
import {
  DefinitionSection,
  OverviewSection,
  SdkSection,
  SettingsSection,
} from "./_components";

type SectionId = "overview" | "definition" | "sync-history" | "sdk" | "settings";

const SECTIONS: { id: SectionId; labelKey: string; icon: typeof BookOpen }[] = [
  { id: "overview", labelKey: "sidebar.overview", icon: BookOpen },
  { id: "definition", labelKey: "sidebar.definition", icon: FileCode },
  { id: "sync-history", labelKey: "sidebar.syncHistory", icon: History },
  { id: "sdk", labelKey: "sidebar.sdk", icon: Code },
  { id: "settings", labelKey: "sidebar.settings", icon: Settings },
];

export default function ToolPolicyDetailPage() {
  const t = useTranslations("ToolPolicyDetail");
  const params = useParams();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const storeId = params.storeId as string;
  const policyId = params.policyId as string;

  const [activeSection, setActiveSection] = useQueryState<SectionId>(
    "section",
    parseAsStringLiteral([
      "overview",
      "definition",
      "sync-history",
      "sdk",
      "settings",
    ] as const)
      .withDefault("overview")
      .withOptions({ history: "push" }),
  );

  const [store, setStore] = useState<ToolPolicyStore | null>(null);
  const [policy, setPolicy] = useState<ToolPolicy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!storeId || !policyId) return;
    try {
      const [storeRes, policyRes] = await Promise.all([
        $orpc.getToolPolicyStore({ id: storeId }),
        $orpc.getToolPolicy({ storeId, policyId }),
      ]);
      setStore({
        ...storeRes.store,
        createdAt: new Date(storeRes.store.createdAt),
        updatedAt: new Date(storeRes.store.updatedAt),
        archivedAt: storeRes.store.archivedAt
          ? new Date(storeRes.store.archivedAt)
          : null,
        lastSchemaSyncedAt: storeRes.store.lastSchemaSyncedAt
          ? new Date(storeRes.store.lastSchemaSyncedAt)
          : null,
        lastSyncedAt: storeRes.store.lastSyncedAt
          ? new Date(storeRes.store.lastSyncedAt)
          : null,
      } as ToolPolicyStore);
      setPolicy({
        ...policyRes.policy,
        createdAt: new Date(policyRes.policy.createdAt),
        updatedAt: new Date(policyRes.policy.updatedAt),
        lastSyncedAt: policyRes.policy.lastSyncedAt
          ? new Date(policyRes.policy.lastSyncedAt)
          : null,
      } as ToolPolicy);
      setNotFound(false);
    } catch (err) {
      const e = err as { code?: string; status?: number };
      if (e.code === "NOT_FOUND" || e.status === 404) setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [storeId, policyId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleSyncNow = useCallback(async () => {
    if (!policy) return;
    setIsSyncing(true);
    try {
      await $orpc.syncToolPolicy({ toolPolicyId: policy.id });
      toast.success(t("sync.toast.started"));
      await fetchAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      toast.error(msg);
    } finally {
      setIsSyncing(false);
    }
  }, [policy, fetchAll, t]);

  const handleStatusChange = useCallback(
    async (newStatus: ToolPolicyStatus) => {
      if (!policy) return;
      setIsChangingStatus(true);
      try {
        await $orpc.updateToolPolicy({
          id: policy.id,
          status: newStatus,
        });
        toast.success(t("overview.statusUpdated"));
        await fetchAll();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed";
        toast.error(msg);
      } finally {
        setIsChangingStatus(false);
      }
    },
    [policy, fetchAll, t],
  );

  if (isLoading && !policy) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (notFound || !policy || !store) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full flex-col items-center justify-center">
          <p className="text-muted-foreground">{t("notFound")}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push(`/dashboard/tools/${storeId}`)}
          >
            {t("backToPolicies")}
          </Button>
        </div>
      </div>
    );
  }

  const nextStatuses = POLICY_STATUS_VALUES.filter((s) => s !== policy.status);

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => router.push(`/dashboard/tools/${storeId}`)}
              aria-label={t("backToPolicies")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-semibold text-foreground text-balance">
                  {policy.name}
                </h1>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${POLICY_STATUS_CLASSES[policy.status]}`}
                >
                  {t(`overview.statusValues.${policy.status}`)}
                </Badge>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${SYNC_STATUS_CLASSES[policy.syncStatus]}`}
                >
                  {t(`overview.syncValues.${policy.syncStatus}`)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("policyId")}{" "}
                <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
                  {policy.awsPolicyId ?? policy.id}
                </code>
                <span className="mx-2">·</span>
                {store.name}
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {nextStatuses.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isChangingStatus}
                    />
                  }
                >
                  {t("overview.promote")}
                  <ChevronDown className="ml-1.5 size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {nextStatuses.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => handleStatusChange(s)}
                    >
                      {t(`overview.promoteTo.${s}`)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              size="sm"
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="active:scale-[0.96]"
            >
              {isSyncing ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Upload className="size-3.5 mr-1.5" />
              )}
              {t("sync.syncNow")}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-44 shrink-0 border p-2 ml-4 my-4 rounded-lg">
            <nav className="flex flex-col gap-0.5">
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] leading-tight transition-[background-color,color] ${
                      isActive
                        ? "bg-foreground/6 text-foreground"
                        : "text-foreground/70 hover:bg-foreground/4 hover:text-foreground/90"
                    }`}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    {t(section.labelKey)}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-6 pt-4 space-y-4">
              {activeSection === "overview" && (
                <OverviewSection
                  policy={policy}
                  onPolicyChange={(updated) => setPolicy(updated)}
                  onRefresh={fetchAll}
                />
              )}
              {activeSection === "definition" && (
                <DefinitionSection
                  policy={policy}
                  storeId={storeId}
                  onPolicyUpdated={fetchAll}
                  resolvedTheme={resolvedTheme}
                />
              )}
              {activeSection === "sync-history" && (
                <ToolSyncHistorySection
                  storeId={storeId}
                  toolPolicyId={policy.id}
                />
              )}
              {activeSection === "sdk" && (
                <SdkSection policy={policy} store={store} />
              )}
              {activeSection === "settings" && (
                <SettingsSection
                  policy={policy}
                  storeId={storeId}
                  onPolicyUpdated={fetchAll}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
