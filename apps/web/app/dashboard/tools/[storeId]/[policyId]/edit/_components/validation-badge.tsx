"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CedarDiagnostic } from "@/hooks/use-cedar-validation";

interface ValidationBadgeProps {
  cedarLoading: boolean;
  loadError: string | null;
  validation: { isValid: boolean; diagnostics: CedarDiagnostic[] } | null;
  hasContent: boolean;
}

export function ValidationBadge({
  cedarLoading,
  loadError,
  validation,
  hasContent,
}: ValidationBadgeProps) {
  const t = useTranslations("ToolPolicyEdit.validation");

  if (loadError) {
    return (
      <Badge variant="destructive" className="text-[10px] gap-1 px-1.5 py-0">
        <XCircle className="size-3" />
        {t("loadError")}
      </Badge>
    );
  }

  if (cedarLoading) {
    return (
      <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0">
        <Loader2 className="size-3 animate-spin" />
        {t("loading")}
      </Badge>
    );
  }

  if (!hasContent || !validation) return null;

  if (validation.isValid) {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] gap-1 px-1.5 py-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
      >
        <CheckCircle2 className="size-3" />
        {t("valid")}
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className="text-[10px] gap-1 px-1.5 py-0 bg-destructive/10 text-destructive border-destructive/20"
    >
      <XCircle className="size-3" />
      {t("invalid", { count: validation.diagnostics.length })}
    </Badge>
  );
}
