"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { $orpc } from "@/lib/api";
import {
  ENGINE_STATUS_CLASSES,
  MENU_SECTIONS,
  type EnginePolicy,
  type EngineStatus,
  type GatewayAttachment,
  type SectionId,
} from "./_components/constants";
import { OverviewSection } from "./_components/overview-section";
import { PoliciesSection } from "./_components/policies-section";
import { GatewaysSection } from "./_components/gateways-section";
import { SyncHistorySection } from "./_components/sync-history-section";
import { EngineSettingsSection } from "./_components/settings-section";

type Engine = {
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

export default function PolicyEngineDetailPage() {
  const t = useTranslations("PolicyEngineDetail");
  const params = useParams();
  const router = useRouter();
  const engineId = params.policyEngineId as string;

  const [activeSection, setActiveSection] = useQueryState<SectionId>(
    "section",
    parseAsStringLiteral([
      "overview",
      "policies",
      "gateways",
      "sync-history",
      "settings",
    ] as const)
      .withDefault("overview")
      .withOptions({ history: "push" }),
  );

  const [engine, setEngine] = useState<Engine | null>(null);
  const [policies, setPolicies] = useState<EnginePolicy[]>([]);
  const [attachments, setAttachments] = useState<GatewayAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!engineId) return;
    setIsLoading(true);
    try {
      const [engineRes, policiesRes] = await Promise.all([
        $orpc.getPolicyEngine({ id: engineId }),
        $orpc.listEnginePolicies({ engineId }),
      ]);
      setEngine({
        ...engineRes.policyEngine,
        createdAt: new Date(engineRes.policyEngine.createdAt),
        updatedAt: new Date(engineRes.policyEngine.updatedAt),
      } as Engine);
      setAttachments(
        engineRes.gatewayAttachments.map((a) => ({
          ...a,
          createdAt: new Date(a.createdAt),
        })) as GatewayAttachment[],
      );
      setPolicies(
        policiesRes.policies.map((p) => ({
          ...p,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
          lastSyncedAt: p.lastSyncedAt ? new Date(p.lastSyncedAt) : null,
        })) as EnginePolicy[],
      );
      setNotFound(false);
    } catch (err) {
      const e = err as { code?: string; status?: number };
      if (e.code === "NOT_FOUND" || e.status === 404) setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [engineId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Poll AWS for status transitions while the engine is transitioning.
  useEffect(() => {
    if (!engine) return;
    const transitional =
      engine.status === "CREATING" ||
      engine.status === "UPDATING" ||
      engine.status === "DELETING";
    if (!transitional) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await $orpc.refreshPolicyEngineStatus({ id: engine.id });
        if (cancelled) return;
        setEngine({
          ...res.policyEngine,
          createdAt: new Date(res.policyEngine.createdAt),
          updatedAt: new Date(res.policyEngine.updatedAt),
        } as Engine);
      } catch {
        // swallow — the next tick will retry, or the user can Refresh
      }
    };
    const timer = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [engine]);

  if (isLoading && !engine) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (notFound || !engine) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full flex-col items-center justify-center">
          <p className="text-muted-foreground">{t("notFound")}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/dashboard/policies")}
          >
            {t("back")}
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
              onClick={() => router.push("/dashboard/policies")}
              aria-label={t("back")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-foreground text-balance">
                  {engine.name}
                </h1>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${ENGINE_STATUS_CLASSES[engine.status]}`}
                >
                  {engine.status}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-44 shrink-0 border p-2 ml-4 my-4 rounded-lg">
            <nav className="flex flex-col gap-0.5">
              {MENU_SECTIONS.map((section) => {
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
                  engine={engine}
                  policies={policies}
                  attachments={attachments}
                  onRefresh={fetchAll}
                />
              )}
              {activeSection === "policies" && (
                <PoliciesSection
                  engineId={engine.id}
                  policies={policies}
                  onRefresh={fetchAll}
                />
              )}
              {activeSection === "gateways" && (
                <GatewaysSection
                  engineId={engine.id}
                  attachments={attachments}
                  onRefresh={fetchAll}
                />
              )}
              {activeSection === "sync-history" && (
                <SyncHistorySection engineId={engine.id} />
              )}
              {activeSection === "settings" && (
                <EngineSettingsSection
                  engine={engine}
                  policyCount={engine.policyCount ?? policies.length}
                  onRefresh={fetchAll}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
