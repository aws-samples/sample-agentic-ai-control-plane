"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { useLocale, useTranslations } from "next-intl";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { $orpc } from "@/lib/api";
import { Loader2 } from "lucide-react";

type ChartView = "calls" | "decisions";
type DashboardRange = "7d" | "30d" | "90d";

type ChartPoint = {
  date: string;
  calls: number;
  approvals: number;
  denials: number;
};

const VIEW_KEYS: Record<ChartView, string> = {
  calls: "chart.viewCalls",
  decisions: "chart.viewDecisions",
};

const TIME_KEYS: Record<DashboardRange, string> = {
  "90d": "chart.last90",
  "30d": "chart.last30",
  "7d": "chart.last7",
};

export function AnalyticsChart({
  range,
  onRangeChange,
}: {
  range: DashboardRange;
  onRangeChange: (range: DashboardRange) => void;
}) {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const [chartView, setChartView] = React.useState<ChartView>("decisions");
  const [data, setData] = React.useState<ChartPoint[] | null>(null);
  const [dataRange, setDataRange] = React.useState<DashboardRange | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    $orpc
      .getDashboardTimeseries({ range })
      .then((res) => {
        if (cancelled) return;
        setData(res.points);
        setDataRange(range);
      })
      .catch(() => {
        if (cancelled) return;
        setData([]);
        setDataRange(range);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const callsChartConfig = React.useMemo<ChartConfig>(
    () => ({
      calls: {
        label: t("chart.legendCalls"),
        color: "var(--chart-1)",
      },
    }),
    [t],
  );

  const decisionsChartConfig = React.useMemo<ChartConfig>(
    () => ({
      approvals: {
        label: t("chart.legendApprovals"),
        color: "var(--chart-2)",
      },
      denials: {
        label: t("chart.legendDenials"),
        color: "var(--chart-5)",
      },
    }),
    [t],
  );

  const chartConfig =
    chartView === "calls" ? callsChartConfig : decisionsChartConfig;

  const chartData = data ?? [];
  const isLoading = data === null || dataRange !== range;

  return (
    <Card className="pt-0">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle>{t("chart.title")}</CardTitle>
          <CardDescription>
            {chartView === "calls"
              ? t("chart.descriptionCalls")
              : t("chart.descriptionDecisions")}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={chartView} onValueChange={(v) => setChartView(v as ChartView)}>
            <SelectTrigger
              className="w-[180px] rounded-lg"
              aria-label={t("chart.selectView")}
            >
              <SelectValue>{t(VIEW_KEYS[chartView])}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="calls" className="rounded-lg">
                {t("chart.viewCalls")}
              </SelectItem>
              <SelectItem value="decisions" className="rounded-lg">
                {t("chart.viewDecisions")}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={range}
            onValueChange={(value) => value && onRangeChange(value as DashboardRange)}
          >
            <SelectTrigger
              className="hidden w-[160px] rounded-lg sm:flex"
              aria-label={t("chart.selectRange")}
            >
              <SelectValue>{t(TIME_KEYS[range])}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                {t("chart.last90")}
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                {t("chart.last30")}
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                {t("chart.last7")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {isLoading ? (
          <div className="flex aspect-auto h-[250px] w-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[250px] w-full"
          >
            {chartView === "calls" ? (
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="fillCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-calls)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-calls)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
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
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => {
                        return new Date(value).toLocaleDateString(locale, {
                          month: "short",
                          day: "numeric",
                        });
                      }}
                      indicator="dot"
                    />
                  }
                />
                <Area
                  dataKey="calls"
                  type="monotone"
                  fill="url(#fillCalls)"
                  stroke="var(--color-calls)"
                />
                <ChartLegend content={<ChartLegendContent />} />
              </AreaChart>
            ) : (
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient
                    id="fillApprovals"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--color-approvals)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-approvals)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                  <linearGradient id="fillDenials" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-denials)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-denials)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
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
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => {
                        return new Date(value).toLocaleDateString(locale, {
                          month: "short",
                          day: "numeric",
                        });
                      }}
                      indicator="dot"
                    />
                  }
                />
                <Area
                  dataKey="denials"
                  type="monotone"
                  fill="url(#fillDenials)"
                  stroke="var(--color-denials)"
                  stackId="a"
                />
                <Area
                  dataKey="approvals"
                  type="monotone"
                  fill="url(#fillApprovals)"
                  stroke="var(--color-approvals)"
                  stackId="a"
                />
                <ChartLegend content={<ChartLegendContent />} />
              </AreaChart>
            )}
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
