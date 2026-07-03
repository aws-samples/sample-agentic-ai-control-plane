"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnalyticsChart, GatewayMetrics, StatsCards } from "./_components";

export type DashboardRange = "7d" | "30d" | "90d";

export default function Page() {
  const t = useTranslations("Dashboard");
  const [range, setRange] = useState<DashboardRange>("90d");

  return (
    <div className="flex-1 p-4 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>
        <StatsCards range={range} />
        <AnalyticsChart range={range} onRangeChange={setRange} />
        <GatewayMetrics range={range} />
      </div>
    </div>
  );
}
