"use client";

import { Badge } from "@/components/ui/badge";
import { $orpc } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RegistryList } from "./_components/registry-list";

type Registry = {
  name: string;
  description?: string;
  registryId: string;
  registryArn: string;
  status:
    | "CREATING"
    | "CREATE_FAILED"
    | "READY"
    | "UPDATING"
    | "UPDATE_FAILED"
    | "DELETING"
    | "DELETE_FAILED";
  approvalConfiguration?: { autoApprovalRules?: string[] };
  discoveryConfiguration?: {
    authorizerType?: "AWS_IAM" | "CUSTOM_JWT";
  };
  statusReason?: string;
  createdAt?: string | Date;
  updatedAt: string | Date;
};

export default function RegistryPage() {
  const t = useTranslations("RegistryList");
  const [registries, setRegistries] = useState<Registry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitialLoad = useRef(true);

  const fetchRegistries = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await $orpc.listRegistries();
      setRegistries(response.registries);
      if (!isInitialLoad.current) {
        toast.success(t("toast.refreshSuccess"));
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("error.loadFailed");
      setError(message);
      console.error("Error fetching registries:", err);
    } finally {
      setIsLoading(false);
      isInitialLoad.current = false;
    }
  };

  useEffect(() => {
    fetchRegistries();
  }, []);

  if (isLoading && registries.length === 0) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full flex-col items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              {t("title")}
            </h1>
            <p className="text-xs text-muted-foreground">{t("description")}</p>
          </div>
          <Badge variant="secondary">
            {registries.length}{" "}
            {registries.length === 1 ? t("registry") : t("registries")}
          </Badge>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <RegistryList
            registries={registries}
            isLoading={isLoading}
            onRefresh={fetchRegistries}
          />
        </div>
      </div>
    </div>
  );
}
