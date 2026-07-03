"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { $orpc } from "@/lib/api";
import { useSession } from "@package/auth";
import { Activity, Bot, Loader2, ShieldCheck, ShieldX, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type DashboardRange = "7d" | "30d" | "90d";

type DashboardStats = {
  totalToolRequests: number;
  toolApprovals: number;
  toolDenials: number;
  activePolicies: number;
};

export function StatsCards({ range }: { range: DashboardRange }) {
  const t = useTranslations("Dashboard");
  const { data: session } = useSession();
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsRange, setStatsRange] = useState<DashboardRange | null>(null);

  useEffect(() => {
    $orpc
      .listAgents({ userId: session?.user?.id })
      .then((res) => setAgentCount(res.agents.length))
      .catch(() => setAgentCount(0));
  }, [session?.user?.id]);

  useEffect(() => {
    let cancelled = false;
    $orpc
      .getDashboardStats({ range })
      .then((res) => {
        if (cancelled) return;
        setStats(res);
        setStatsRange(range);
      })
      .catch(() => {
        if (cancelled) return;
        setStats({
          totalToolRequests: 0,
          toolApprovals: 0,
          toolDenials: 0,
          activePolicies: 0,
        });
        setStatsRange(range);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const isLoading = stats === null || statsRange !== range;

  const approvalRate =
    stats && stats.totalToolRequests > 0
      ? `${Math.round((stats.toolApprovals / stats.totalToolRequests) * 100)}%`
      : "—";

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            {t("stats.agents")}
          </CardTitle>
          <Bot className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {agentCount === null ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              agentCount
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("stats.agentsDescription")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            {t("stats.toolRequests")}
          </CardTitle>
          <Wrench className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              stats?.totalToolRequests ?? 0
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-3 w-3" />
              {stats?.toolApprovals ?? 0} {t("stats.approved")}
            </span>
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <ShieldX className="h-3 w-3" />
              {stats?.toolDenials ?? 0} {t("stats.denied")}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            {t("stats.approvalRate")}
          </CardTitle>
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              approvalRate
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("stats.approvalRateDescription")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            {t("stats.activePolicies")}
          </CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              stats?.activePolicies ?? 0
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("stats.activePoliciesDelta")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
