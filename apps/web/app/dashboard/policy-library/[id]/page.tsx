"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { ArrowLeft, LibraryBig, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { $orpc } from "@/lib/api";
import {
  type PolicyItem,
  type PolicyVersion,
  type ActivityEvent,
  type PolicyStatus,
} from "../_components/constants";
import { MENU_SECTIONS, type SectionId } from "./_components/constants";
import { OverviewSection } from "./_components/overview-section";
import { DefinitionSection } from "./_components/definition-section";
import { VersionHistory } from "./_components/version-history";
import { InstancesSection } from "./_components/instances-section";
import { ActivityLog } from "./_components/activity-log";
import { PolicySettings } from "./_components/policy-settings";

function StatusBadge({
  status,
  t,
}: {
  status: PolicyStatus;
  t: (key: string) => string;
}) {
  const colorClasses: Record<PolicyStatus, string> = {
    draft:
      "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/30",
    in_review:
      "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30",
    published:
      "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30",
    archived: "text-muted-foreground border-border bg-muted/50",
  };
  return (
    <Badge variant="outline" className={colorClasses[status]}>
      {t(`statusValues.${status}`)}
    </Badge>
  );
}

function hydratePolicy(p: PolicyItem): PolicyItem {
  return {
    ...p,
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
    archivedAt: p.archivedAt ? new Date(p.archivedAt) : null,
  };
}

function hydrateVersion(v: PolicyVersion): PolicyVersion {
  return { ...v, createdAt: new Date(v.createdAt) };
}

function hydrateActivity(e: ActivityEvent): ActivityEvent {
  return { ...e, timestamp: new Date(e.timestamp) };
}

export default function PolicyLibraryDetailPage() {
  const t = useTranslations("PolicyLibraryDetail");
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [activeSection, setActiveSection] = useQueryState<SectionId>(
    "section",
    parseAsStringLiteral([
      "overview",
      "definition",
      "versions",
      "instances",
      "activity",
      "settings",
    ] as const)
      .withDefault("overview")
      .withOptions({ history: "push" }),
  );

  const [policy, setPolicy] = useState<PolicyItem | null>(null);
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [parentTemplate, setParentTemplate] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const [policyRes, versionsRes, activityRes] = await Promise.all([
        $orpc.getPolicy({ id }),
        $orpc.listVersions({ id }),
        $orpc.listActivity({ id }),
      ]);
      const hydrated = hydratePolicy(policyRes.policy);
      setPolicy(hydrated);
      setVersions(versionsRes.versions.map(hydrateVersion));
      setActivityEvents(activityRes.events.map(hydrateActivity));
      setNotFound(false);

      if (hydrated.parentTemplateId) {
        try {
          const parentRes = await $orpc.getPolicy({
            id: hydrated.parentTemplateId,
          });
          setParentTemplate({
            id: parentRes.policy.id,
            name: parentRes.policy.name,
          });
        } catch {
          setParentTemplate(null);
        }
      } else {
        setParentTemplate(null);
      }
    } catch (err) {
      const e = err as { code?: string; status?: number };
      if (e.code === "NOT_FOUND" || e.status === 404) {
        setNotFound(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handlePolicyChange = useCallback((updated: PolicyItem) => {
    setPolicy(hydratePolicy(updated));
  }, []);

  const handleRevert = useCallback(
    async (version: PolicyVersion) => {
      if (!policy) return;
      try {
        await $orpc.revertToVersion({
          id: policy.id,
          targetVersion: version.version,
        });
        await fetchAll();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to revert version";
        console.error(message);
      }
    },
    [policy, fetchAll],
  );

  const visibleSections = useMemo(() => {
    if (!policy) return MENU_SECTIONS.filter((s) => !s.templateOnly);
    return MENU_SECTIONS.filter((s) => !s.templateOnly || policy.isTemplate);
  }, [policy]);

  // If the active section becomes invalid (e.g. navigated from a template to a non-template),
  // snap back to overview.
  useEffect(() => {
    if (!visibleSections.some((s) => s.id === activeSection)) {
      setActiveSection("overview");
    }
  }, [visibleSections, activeSection, setActiveSection]);

  if (isLoading && !policy) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (notFound || !policy) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full flex-col items-center justify-center">
          <p className="text-muted-foreground">{t("notFound")}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/dashboard/policy-library")}
          >
            {t("backToLibrary")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div className="flex h-full w-full flex-col">
        {/* Header */}
        <div className="flex items-center border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => router.push("/dashboard/policy-library")}
              aria-label={t("backToLibrary")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-foreground text-balance">
                  {policy.name}
                </h1>
                <StatusBadge status={policy.status} t={t} />
                {policy.isTemplate && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 gap-1 text-violet-600 border-violet-200 bg-violet-50 dark:text-violet-400 dark:border-violet-800 dark:bg-violet-950/30"
                  >
                    <LibraryBig className="size-2.5" />
                    {t("templateBadge")}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/dashboard/policy-library/${id}/edit`)}
            >
              <Pencil className="size-3.5 mr-1.5" />
              {t("edit")}
            </Button>
          </div>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Section sidebar */}
          <div className="w-44 shrink-0 border p-2 ml-4 my-4 rounded-lg">
            <nav className="flex flex-col gap-0.5">
              {visibleSections.map((section) => {
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

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 pt-4 space-y-4">
              {parentTemplate && (
                <div className="flex items-center gap-3 rounded-lg border bg-violet-50/50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-900/50 px-3 py-2">
                  <div className="rounded-md bg-violet-100 dark:bg-violet-900/40 p-1.5">
                    <LibraryBig className="size-3.5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <p className="text-xs font-medium text-violet-900 dark:text-violet-200">
                      {t("parentBanner.title")}
                    </p>
                    <p className="text-[11px] text-violet-700 dark:text-violet-400 text-pretty">
                      {t("parentBanner.description", {
                        name: parentTemplate.name,
                      })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs active:scale-[0.96]"
                    onClick={() =>
                      router.push(`/dashboard/policy-library/${parentTemplate.id}`)
                    }
                  >
                    {t("parentBanner.viewTemplate")}
                  </Button>
                </div>
              )}
              {activeSection === "overview" && (
                <OverviewSection
                  policy={policy}
                  versions={versions}
                  linkedPolicies={[]}
                  onPolicyChange={handlePolicyChange}
                  onRefresh={fetchAll}
                />
              )}
              {activeSection === "definition" && (
                <DefinitionSection policy={policy} />
              )}
              {activeSection === "versions" && (
                <VersionHistory versions={versions} onRevert={handleRevert} />
              )}
              {activeSection === "instances" && policy.isTemplate && (
                <InstancesSection policy={policy} />
              )}
              {activeSection === "activity" && (
                <ActivityLog events={activityEvents} />
              )}
              {activeSection === "settings" && (
                <PolicySettings
                  policy={policy}
                  onPolicyChange={handlePolicyChange}
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
