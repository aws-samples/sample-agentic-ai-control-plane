"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { $orpc } from "@/lib/api";
import type { ToolSyncBatch, ToolSyncEvent } from "../../_components/constants";

interface ToolSyncHistorySectionProps {
  storeId: string;
  toolPolicyId?: string;
}

function formatDate(d?: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ToolSyncHistorySection({
  storeId,
  toolPolicyId,
}: ToolSyncHistorySectionProps) {
  const t = useTranslations("ToolPolicyDetail.syncHistory");
  const [batches, setBatches] = useState<ToolSyncBatch[]>([]);
  const [events, setEvents] = useState<ToolSyncEvent[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      if (toolPolicyId) {
        const res = await $orpc.listToolSyncEvents({
          storeId,
          toolPolicyId,
          limit: 100,
        });
        setEvents(
          res.events.map((e) => ({
            ...e,
            createdAt: new Date(e.createdAt),
          })) as ToolSyncEvent[],
        );
        setBatches([]);
      } else {
        const [batchRes, eventRes] = await Promise.all([
          $orpc.listToolSyncBatches({ storeId, limit: 50 }),
          $orpc.listToolSyncEvents({ storeId, limit: 200 }),
        ]);
        setBatches(
          batchRes.batches.map((b) => ({
            ...b,
            startedAt: new Date(b.startedAt),
            completedAt: b.completedAt ? new Date(b.completedAt) : null,
          })) as ToolSyncBatch[],
        );
        setEvents(
          eventRes.events.map((e) => ({
            ...e,
            createdAt: new Date(e.createdAt),
          })) as ToolSyncEvent[],
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [storeId, toolPolicyId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (toolPolicyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold tabular-nums">
            {t("policyTitle", { count: events.length })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-xs text-muted-foreground text-pretty py-4 text-center">
              {t("empty")}
            </p>
          ) : (
            <EventTable events={events} t={t} />
          )}
        </CardContent>
      </Card>
    );
  }

  const eventsByBatch = new Map<string, ToolSyncEvent[]>();
  const orphanEvents: ToolSyncEvent[] = [];
  for (const e of events) {
    if (e.batchId) {
      const list = eventsByBatch.get(e.batchId) ?? [];
      list.push(e);
      eventsByBatch.set(e.batchId, list);
    } else {
      orphanEvents.push(e);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold tabular-nums">
            {t("storeTitle", { count: batches.length })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : batches.length === 0 ? (
            <p className="text-xs text-muted-foreground text-pretty py-4 text-center">
              {t("emptyBatches")}
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>{t("batch.scope")}</TableHead>
                    <TableHead>{t("batch.actor")}</TableHead>
                    <TableHead>{t("batch.started")}</TableHead>
                    <TableHead>{t("batch.results")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b) => {
                    const isOpen = expanded.has(b.id);
                    const children = eventsByBatch.get(b.id) ?? [];
                    return (
                      <Fragment key={b.id}>
                        <TableRow
                          className="cursor-pointer transition-colors hover:bg-muted/50"
                          onClick={() => toggle(b.id)}
                        >
                          <TableCell>
                            {isOpen ? (
                              <ChevronDown className="size-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-3.5 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                            >
                              {t(`batch.scopeValue.${b.scope}`)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {b.triggeredBy?.name ?? t("batch.system")}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground tabular-nums">
                            {formatDate(b.startedAt)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {b.successCount}
                            </span>
                            {" / "}
                            <span className="text-red-600 dark:text-red-400">
                              {b.failureCount}
                            </span>
                            {" / "}
                            <span className="text-muted-foreground">
                              {b.totalCount}
                            </span>
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow key={`${b.id}-children`}>
                            <TableCell
                              colSpan={5}
                              className="bg-muted/30 p-3"
                            >
                              {children.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-2">
                                  {t("emptyChildren")}
                                </p>
                              ) : (
                                <EventTable
                                  events={children}
                                  t={t}
                                  compact
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {orphanEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold tabular-nums">
              {t("orphanTitle", { count: orphanEvents.length })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EventTable events={orphanEvents} t={t} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EventTable({
  events,
  t,
  compact,
}: {
  events: ToolSyncEvent[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, values?: any) => string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "rounded-lg border"}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("event.action")}</TableHead>
            <TableHead>{t("event.target")}</TableHead>
            <TableHead>{t("event.result")}</TableHead>
            <TableHead>{t("event.actor")}</TableHead>
            <TableHead>{t("event.when")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((e) => (
            <TableRow key={e.id}>
              <TableCell>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {e.action}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground text-pretty">
                {e.toolPolicyName ?? "—"}
              </TableCell>
              <TableCell>
                {e.success ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30"
                  >
                    {t("event.success")}
                  </Badge>
                ) : (
                  <div className="space-y-1">
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30"
                    >
                      {t("event.failure")}
                    </Badge>
                    {e.errorMessage && (
                      <p className="text-[11px] text-destructive text-pretty">
                        {e.errorMessage}
                      </p>
                    )}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {e.actor?.name ?? t("event.system")}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground tabular-nums">
                {formatDate(e.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
