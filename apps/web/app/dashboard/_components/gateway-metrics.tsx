"use client";

import * as React from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale, useTranslations } from "next-intl";
import { Activity, AlertTriangle, Gauge, Loader2, ShieldAlert } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { $orpc } from "@/lib/api";

type DashboardRange = "7d" | "30d" | "90d";

type GatewayStats = {
  gatewayCount: number;
  invocations: number;
  systemErrors: number;
  userErrors: number;
  throttles: number;
  avgLatencyMs: number;
};

type GatewayPoint = {
  date: string;
  invocations: number;
  systemErrors: number;
  userErrors: number;
  avgLatencyMs: number;
};

function formatNumber(n: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(n);
}

export function GatewayMetrics({ range }: { range: DashboardRange }) {
  const t = useTranslations("Dashboard.gateway");
  const locale = useLocale();

  const [stats, setStats] = React.useState<GatewayStats | null>(null);
  const [statsRange, setStatsRange] = React.useState<DashboardRange | null>(
    null,
  );
  const [points, setPoints] = React.useState<GatewayPoint[] | null>(null);
  const [pointsRange, setPointsRange] = React.useState<DashboardRange | null>(
    null,
  );

  React.useEffect(() => {
    let cancelled = false;
    $orpc
      .getGatewayStats({ range })
      .then((res) => {
        if (cancelled) return;
        setStats(res);
        setStatsRange(range);
      })
      .catch(() => {
        if (cancelled) return;
        setStats({
          gatewayCount: 0,
          invocations: 0,
          systemErrors: 0,
          userErrors: 0,
          throttles: 0,
          avgLatencyMs: 0,
        });
        setStatsRange(range);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  React.useEffect(() => {
    let cancelled = false;
    $orpc
      .getGatewayTimeseries({ range })
      .then((res) => {
        if (cancelled) return;
        setPoints(res.points);
        setPointsRange(range);
      })
      .catch(() => {
        if (cancelled) return;
        setPoints([]);
        setPointsRange(range);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const isStatsLoading = stats === null || statsRange !== range;
  const isChartLoading = points === null || pointsRange !== range;

  const chartConfig = React.useMemo<ChartConfig>(
    () => ({
      invocations: {
        label: t("chart.legendInvocations"),
        color: "var(--chart-1)",
      },
      systemErrors: {
        label: t("chart.legendSystemErrors"),
        color: "var(--chart-5)",
      },
      userErrors: {
        label: t("chart.legendUserErrors"),
        color: "var(--chart-3)",
      },
    }),
    [t],
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">
          {t("sectionTitle")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("sectionDescription")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("stats.invocations")}
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isStatsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                formatNumber(stats?.invocations ?? 0, locale)
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("stats.invocationsDescription", {
                count: stats?.gatewayCount ?? 0,
              })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("stats.systemErrors")}
            </CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isStatsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                formatNumber(stats?.systemErrors ?? 0, locale)
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("stats.systemErrorsDescription")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("stats.userErrors")}
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isStatsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                formatNumber(stats?.userErrors ?? 0, locale)
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("stats.userErrorsDescription")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("stats.avgLatency")}
            </CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isStatsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                `${formatNumber(stats?.avgLatencyMs ?? 0, locale)} ms`
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("stats.avgLatencyDescription")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="pt-0">
        <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
          <div className="grid flex-1 gap-1">
            <CardTitle>{t("chart.title")}</CardTitle>
            <CardDescription>{t("chart.description")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
          {isChartLoading ? (
            <div className="flex aspect-auto h-[250px] w-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[250px] w-full"
            >
              <ComposedChart data={points ?? []}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString(locale, {
                      month: "short",
                      day: "numeric",
                    });
                  }}
                />
                <YAxis
                  yAxisId="left"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={40}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) =>
                        new Date(value).toLocaleDateString(locale, {
                          month: "short",
                          day: "numeric",
                        })
                      }
                      indicator="dot"
                    />
                  }
                />
                <Bar
                  yAxisId="left"
                  dataKey="invocations"
                  fill="var(--color-invocations)"
                  radius={[2, 2, 0, 0]}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="systemErrors"
                  stroke="var(--color-systemErrors)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="userErrors"
                  stroke="var(--color-userErrors)"
                  strokeWidth={2}
                  dot={false}
                />
                <ChartLegend content={<ChartLegendContent />} />
              </ComposedChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
