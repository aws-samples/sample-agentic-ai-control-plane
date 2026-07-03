"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  CreateFromTemplateDialog,
  CreatePolicyDialog,
  PolicyLibraryList,
} from "./_components";
import type { PolicyItem } from "./_components/constants";
import { $orpc } from "@/lib/api";

export default function PolicyLibraryPage() {
  const t = useTranslations("PolicyLibrary");
  const [policies, setPolicies] = useState<PolicyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPolicies = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await $orpc.listPolicies({});
      setPolicies(
        res.policies.map((p) => ({
          ...p,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
          archivedAt: p.archivedAt ? new Date(p.archivedAt) : null,
        })),
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
    fetchPolicies();
  }, [fetchPolicies]);

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
            <CreateFromTemplateDialog />
            <CreatePolicyDialog onSuccess={fetchPolicies} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {isLoading && policies.length === 0 ? (
            <div
              className="flex items-center justify-center py-12"
              role="status"
              aria-label={t("loading")}
            >
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <PolicyLibraryList
              policies={policies}
              isLoading={isLoading}
              onRefresh={fetchPolicies}
            />
          )}
        </div>
      </div>
    </div>
  );
}
