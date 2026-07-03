"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, Search, TriangleAlert } from "lucide-react";
import type { PolicyEngine } from "../page";

type EngineStatus = PolicyEngine["status"];

const STATUS_CLASSES: Record<EngineStatus, string> = {
  ACTIVE:
    "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30",
  CREATING:
    "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/30",
  UPDATING:
    "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30",
  DELETING:
    "text-orange-600 border-orange-200 bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:bg-orange-950/30",
  CREATE_FAILED:
    "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
  UPDATE_FAILED:
    "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
  DELETE_FAILED:
    "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
};

interface EngineListProps {
  engines: PolicyEngine[];
  isLoading?: boolean;
  onRefresh: () => void;
}

export function EngineList({ engines, isLoading, onRefresh }: EngineListProps) {
  const t = useTranslations("PolicyEngines");
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return engines;
    return engines.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.awsPolicyEngineId?.toLowerCase().includes(q),
    );
  }, [engines, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isLoading}
          aria-label={t("refresh")}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.name")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.policies")}</TableHead>
              <TableHead>{t("table.gateways")}</TableHead>
              <TableHead>{t("table.region")}</TableHead>
              <TableHead>{t("table.created")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-xs text-muted-foreground"
                >
                  {search.trim() ? t("empty.withFilters") : t("empty.title")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((engine) => (
                <TableRow
                  key={engine.id}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() =>
                    router.push(`/dashboard/policies/${engine.id}`)
                  }
                >
                  <TableCell className="font-medium text-primary">
                    <div className="flex items-center gap-1.5">
                      <span>{engine.name}</span>
                      {!!engine.driftedCount && engine.driftedCount > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 gap-1 text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30"
                        >
                          <TriangleAlert className="size-2.5" />
                          {t("drifted", { count: engine.driftedCount })}
                        </Badge>
                      )}
                    </div>
                    {engine.description && (
                      <p className="text-[11px] text-muted-foreground text-pretty line-clamp-1 mt-0.5">
                        {engine.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_CLASSES[engine.status]}
                    >
                      {t(`status.${engine.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums text-xs text-muted-foreground">
                    {engine.policyCount ?? 0}
                  </TableCell>
                  <TableCell className="tabular-nums text-xs text-muted-foreground">
                    {engine.gatewayCount ?? 0}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {engine.region}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {new Date(engine.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
