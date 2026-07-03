"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Download,
  FileCode,
  GitBranch,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  Tag,
  XCircle,
  Copy,
  type LucideIcon,
} from "lucide-react";
import type { ActivityEvent, ActivityEventType } from "../../_components/constants";

interface ActivityLogProps {
  events: ActivityEvent[];
}

function formatDate(dateValue: Date) {
  return new Date(dateValue).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) return formatDate(date);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

const EVENT_CONFIG: Record<
  ActivityEventType,
  { icon: LucideIcon; colorClass: string }
> = {
  created: { icon: Plus, colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" },
  edited: { icon: Pencil, colorClass: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" },
  version_created: { icon: GitBranch, colorClass: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400" },
  status_changed: { icon: Shield, colorClass: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" },
  linked_policy_created: { icon: Link2, colorClass: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" },
  linked_policy_updated: { icon: RefreshCw, colorClass: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400" },
  linked_policy_failed: { icon: ShieldAlert, colorClass: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" },
  renamed: { icon: Pencil, colorClass: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400" },
  tag_added: { icon: Tag, colorClass: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400" },
  tag_removed: { icon: XCircle, colorClass: "bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400" },
  exported: { icon: Download, colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400" },
  duplicated: { icon: Copy, colorClass: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400" },
};

export function ActivityLog({ events }: ActivityLogProps) {
  const t = useTranslations("PolicyLibraryDetail.activity");

  const sortedEvents = [...events].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold tabular-nums">
          {t("title", { count: events.length })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sortedEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {t("empty")}
          </p>
        ) : (
          <div className="relative">
            <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border" />
            <div className="space-y-0">
              {sortedEvents.map((event, idx) => {
                const config = EVENT_CONFIG[event.type];
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
                        <span>{event.actor.name}</span>
                        <span>·</span>
                        <span title={formatDate(event.timestamp)} className="tabular-nums">
                          {relativeTime(event.timestamp)}
                        </span>
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
