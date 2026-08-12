"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft } from "lucide-react";
import { $orpc } from "@/lib/api";
import { RecordsList } from "../_components/records-list";
import {
  ActivityLog,
  type RegistryActivityEvent,
} from "../_components/activity-log";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

type RegistryRecord = {
  registryArn: string;
  recordId?: string;
  recordArn?: string;
  name: string;
  displayName?: string;
  recordVersion?: string;
  recordType?: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "DEPRECATED" | "CREATING" | "UPDATING" | "CREATE_FAILED" | "UPDATE_FAILED";
  description?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export default function RegistryDetailPage() {
  const t = useTranslations("RegistryDetail");
  const params = useParams();
  const router = useRouter();
  const registryId = params.registryId as string;

  const [records, setRecords] = useState<RegistryRecord[]>([]);
  const [registryName, setRegistryName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"records" | "activity">("records");
  const [activityEvents, setActivityEvents] = useState<RegistryActivityEvent[]>([]);

  // Registry-scoped activity: omit recordId so the endpoint returns registry-level
  // events (registry_created/updated) plus every record's events for this registry.
  const fetchActivity = useCallback(async () => {
    if (!registryId) return;
    try {
      const res = await $orpc.listRegistryActivity({ registryId });
      setActivityEvents(res.events as RegistryActivityEvent[]);
    } catch {
      // Activity is a secondary panel — don't surface a blocking error if it
      // fails to load; the records view stays usable.
    }
  }, [registryId]);

  const fetchRecords = useCallback(async (options?: { showToast?: boolean }) => {
    if (!registryId) {
      setError(t("error.idRequired"));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [recordsRes, registriesRes] = await Promise.all([
        $orpc.listRegistryRecords({ registryId }),
        $orpc.listRegistries(),
      ]);
      setRecords(recordsRes.registryRecords || []);
      const match = registriesRes.registries?.find((r) => r.registryId === registryId);
      if (match) setRegistryName(match.name);
      if (options?.showToast) {
        toast.success(t("toast.refreshSuccess"));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("error.loadFailed");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [registryId, t]);

  useEffect(() => {
    fetchRecords();
    fetchActivity();
  }, [fetchRecords, fetchActivity]);

  const handleRefresh = useCallback(() => {
    fetchRecords({ showToast: true });
    fetchActivity();
  }, [fetchRecords, fetchActivity]);

  const handleBackNavigation = useCallback(() => {
    router.push("/dashboard/registry");
  }, [router]);

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={handleBackNavigation}
              aria-label={t("backToRegistries")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-sm font-semibold text-foreground">
                {registryName ?? t("title")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {t("registryId")}{" "}
                <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
                  {registryId}
                </code>
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {isLoading && records.length === 0 ? (
            <div
              className="flex items-center justify-center py-12"
              role="status"
              aria-label={t("loadingRecords")}
            >
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-1 border-b">
                {(["records", "activity"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      activeTab === tab
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab === "records"
                      ? t("tabs.records")
                      : t("tabs.activity", { count: activityEvents.length })}
                  </button>
                ))}
              </div>
              {activeTab === "records" ? (
                <RecordsList
                  records={records}
                  registryId={registryId}
                  isLoading={isLoading}
                  onRefresh={handleRefresh}
                />
              ) : (
                <ActivityLog events={activityEvents} showRecordId />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
