"use client";

import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

type Status =
  | "CREATING"
  | "READY"
  | "CREATE_FAILED"
  | "MISSING_FROM_GATEWAY"
  | null
  | undefined;

export function ToolStatusBadge({
  status,
  reason,
}: {
  status: Status;
  reason?: string;
}) {
  const t = useTranslations("AgentForm.tools.target");

  if (status === "READY") {
    return (
      <Badge variant="secondary" className="text-[9px] px-1.5 h-4">
        {t("ready")}
      </Badge>
    );
  }
  if (status === "CREATING") {
    return (
      <Badge variant="outline" className="text-[9px] px-1.5 h-4 gap-1">
        <Loader2 className="size-2.5 animate-spin" />
        {t("provisioning")}
      </Badge>
    );
  }
  if (status === "CREATE_FAILED") {
    return (
      <Badge
        variant="outline"
        className="text-[9px] px-1.5 h-4 bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-300"
        title={reason}
      >
        {t("failed")}
      </Badge>
    );
  }
  if (status === "MISSING_FROM_GATEWAY") {
    return (
      <Badge
        variant="outline"
        className="text-[9px] px-1.5 h-4 bg-amber-50 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
        title={reason ?? "Target not found in live gateway"}
      >
        missing
      </Badge>
    );
  }
  return null;
}
