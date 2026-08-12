"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Archive,
  CheckCircle2,
  Pencil,
  Plus,
  RefreshCw,
  SendHorizonal,
  Settings2,
  Trash2,
  XCircle,
  type LucideIcon,
} from "lucide-react";

// Mirrors the policy-library ActivityLog timeline for the registry's local
// audit trail. Event types match RegistryActivityType in
// packages/api/routes/registry.ts.
export type RegistryActivityEvent = {
  id: string;
  registryId: string;
  recordId?: string | null;
  type: string;
  description: string;
  actor: { name: string; email: string } | null;
  metadata?: Record<string, string>;
  timestamp: string | Date;
};

interface ActivityLogProps {
  events: RegistryActivityEvent[];
  /** Show the record id chip on each row (useful in the registry-wide view). */
  showRecordId?: boolean;
  emptyLabel?: string;
}

function formatDate(dateValue: string | Date) {
  return new Date(dateValue).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(value: string | Date): string {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 30) return formatDate(date);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

const GREEN = "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400";
const BLUE = "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400";
const AMBER = "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400";
const PURPLE = "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400";
const CYAN = "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400";
const RED = "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400";
const GRAY = "bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400";

const EVENT_CONFIG: Record<string, { icon: LucideIcon; colorClass: string }> = {
  registry_created: { icon: Plus, colorClass: GREEN },
  registry_updated: { icon: Settings2, colorClass: BLUE },
  registry_deleted: { icon: Trash2, colorClass: RED },
  record_created: { icon: Plus, colorClass: GREEN },
  record_updated: { icon: Pencil, colorClass: BLUE },
  record_submitted: { icon: SendHorizonal, colorClass: PURPLE },
  status_changed: { icon: CheckCircle2, colorClass: AMBER },
  record_deleted: { icon: Trash2, colorClass: RED },
  sync_triggered: { icon: RefreshCw, colorClass: CYAN },
};

const FALLBACK = { icon: Settings2, colorClass: GRAY };

export function ActivityLog({ events, showRecordId, emptyLabel }: ActivityLogProps) {
  const sorted = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold tabular-nums">
          Activity ({events.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {emptyLabel ?? "No activity recorded yet."}
          </p>
        ) : (
          <div className="relative">
            <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border" />
            <div className="space-y-0">
              {sorted.map((event) => {
                const config = EVENT_CONFIG[event.type] ?? FALLBACK;
                const Icon = config.icon;
                return (
                  <div key={event.id} className="relative pl-10 pb-5 last:pb-0">
                    <div className="absolute left-0 top-0.5 flex items-center justify-center">
                      <div
                        className={`size-[30px] rounded-full flex items-center justify-center ${config.colorClass}`}
                      >
                        <Icon className="size-3.5" />
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm text-pretty">{event.description}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{event.actor?.name ?? "Unknown user"}</span>
                        <span>·</span>
                        <span
                          title={formatDate(event.timestamp)}
                          className="tabular-nums"
                        >
                          {relativeTime(event.timestamp)}
                        </span>
                        {showRecordId && event.recordId && (
                          <>
                            <span>·</span>
                            <code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">
                              {event.recordId}
                            </code>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
