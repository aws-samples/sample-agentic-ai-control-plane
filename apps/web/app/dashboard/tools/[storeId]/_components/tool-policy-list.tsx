"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Eye,
  Link2,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { $orpc } from "@/lib/api";
import {
  POLICY_STATUS_CLASSES,
  POLICY_STATUS_VALUES,
  POLICY_TYPE_CLASSES,
  SYNC_STATUS_CLASSES,
  SYNC_STATUS_VALUES,
  type SyncStatus,
  type ToolPolicy,
  type ToolPolicyStatus,
  type ToolPolicyType,
} from "../../_components/constants";

interface ToolPolicyListProps {
  policies: ToolPolicy[];
  storeId: string;
  onRefresh: () => void;
}

export function ToolPolicyList({
  policies,
  storeId,
  onRefresh,
}: ToolPolicyListProps) {
  const t = useTranslations("ToolPolicyList");
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [syncFilter, setSyncFilter] = useState<string>("all");

  const filteredPolicies = policies.filter((policy) => {
    if (statusFilter !== "all" && policy.status !== statusFilter) return false;
    if (syncFilter !== "all" && policy.syncStatus !== syncFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      policy.name.toLowerCase().includes(q) ||
      policy.description.toLowerCase().includes(q) ||
      policy.action.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: ToolPolicyStatus) => (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 ${POLICY_STATUS_CLASSES[status]}`}
    >
      {t(`status.${status}`)}
    </Badge>
  );

  const getSyncBadge = (status: SyncStatus) => (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 ${SYNC_STATUS_CLASSES[status]}`}
    >
      {t(`syncStatus.${status}`)}
    </Badge>
  );

  const getTypeBadge = (type: ToolPolicyType) => (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 ${POLICY_TYPE_CLASSES[type]}`}
    >
      {t(`type.${type}`)}
    </Badge>
  );

  const formatDate = (dateValue?: string | Date | null) => {
    if (!dateValue) return t("na");
    return new Date(dateValue).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleSync = async (policyId: string) => {
    try {
      await $orpc.syncToolPolicy({ toolPolicyId: policyId });
      toast.success(t("toast.syncStarted"));
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      toast.error(msg);
    }
  };

  const handleDelete = async (policyId: string) => {
    try {
      await $orpc.deleteToolPolicy({ id: policyId });
      toast.success(t("toast.deleted"));
      onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      toast.error(msg);
    }
  };

  if (policies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground mb-4">{t("empty.title")}</p>
        <p className="text-sm text-muted-foreground">{t("empty.noData")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("search.placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(val) => setStatusFilter(val as string)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue>
              {statusFilter === "all"
                ? t("filters.status.placeholder")
                : t(`filters.status.${statusFilter as ToolPolicyStatus}`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.status.all")}</SelectItem>
            {POLICY_STATUS_VALUES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`filters.status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={syncFilter}
          onValueChange={(val) => setSyncFilter(val as string)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue>
              {syncFilter === "all"
                ? t("filters.sync.placeholder")
                : t(`filters.sync.${syncFilter as SyncStatus}`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.sync.all")}</SelectItem>
            {SYNC_STATUS_VALUES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`filters.sync.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.name")}</TableHead>
              <TableHead>{t("table.type")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.syncStatus")}</TableHead>
              <TableHead>{t("table.action")}</TableHead>
              <TableHead>{t("table.templateLinked")}</TableHead>
              <TableHead>{t("table.creator")}</TableHead>
              <TableHead>{t("table.lastSynced")}</TableHead>
              <TableHead className="text-right">
                {t("table.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPolicies.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="h-24 text-center text-muted-foreground"
                >
                  {searchQuery.trim() ||
                  statusFilter !== "all" ||
                  syncFilter !== "all"
                    ? t("empty.withFilters")
                    : t("empty.title")}
                </TableCell>
              </TableRow>
            ) : (
              filteredPolicies.map((policy) => (
                <TableRow
                  key={policy.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    router.push(
                      `/dashboard/tools/${storeId}/${policy.id}`,
                    )
                  }
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-primary">{policy.name}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                        {policy.description}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{getTypeBadge(policy.type)}</TableCell>
                  <TableCell>{getStatusBadge(policy.status)}</TableCell>
                  <TableCell>{getSyncBadge(policy.syncStatus)}</TableCell>
                  <TableCell>
                    <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
                      {policy.action || "—"}
                    </code>
                  </TableCell>
                  <TableCell>
                    {policy.isTemplateLinked ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 text-purple-600 border-purple-200 bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:bg-purple-950/30"
                      >
                        <Link2 className="size-3 mr-1" />
                        {t("templateLinked")}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {policy.createdBy?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {formatDate(policy.lastSyncedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={(e) => e.stopPropagation()}
                            className="active:scale-[0.96]"
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(
                              `/dashboard/tools/${storeId}/${policy.id}`,
                            );
                          }}
                        >
                          <Eye className="mr-2" />
                          {t("actions.view")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSync(policy.id);
                          }}
                        >
                          <Upload className="mr-2" />
                          {t("actions.sync")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(policy.id);
                          }}
                        >
                          <Trash2 className="mr-2" />
                          {t("actions.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
