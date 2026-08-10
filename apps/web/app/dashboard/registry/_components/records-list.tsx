"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Send,
  Archive,
  RefreshCw,
  Search,
  Trash2,
  FileJson,
  X,
  Eye,
  Plus,
  Loader2,
} from "lucide-react";
import { $orpc } from "@/lib/api";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";

type RecordStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "DEPRECATED" | "CREATING" | "UPDATING" | "CREATE_FAILED" | "UPDATE_FAILED";

const STATUS_VALUES: RecordStatus[] = [
  "DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "DEPRECATED", "CREATING", "UPDATING", "CREATE_FAILED", "UPDATE_FAILED",
];

const STATUS_STYLE: Record<RecordStatus, string> = {
  DRAFT: "",
  PENDING_APPROVAL: "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30",
  APPROVED: "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30",
  REJECTED: "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
  DEPRECATED: "text-muted-foreground",
  CREATING: "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/30",
  UPDATING: "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/30",
  CREATE_FAILED: "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
  UPDATE_FAILED: "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
};

// Keyed by GA recordType (AGENT|MCP|SKILL|CUSTOM).
const PROTOCOL_STYLE: Record<string, string> = {
  MCP: "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/30",
  AGENT: "text-purple-600 border-purple-200 bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:bg-purple-950/30",
  SKILL: "text-teal-600 border-teal-200 bg-teal-50 dark:text-teal-400 dark:border-teal-800 dark:bg-teal-950/30",
};

type RegistryRecord = {
  registryArn: string;
  recordId?: string;
  name: string;
  displayName?: string;
  recordVersion?: string;
  recordType?: string;
  status: RecordStatus;
  description?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

interface RecordsListProps {
  records: RegistryRecord[];
  registryId: string;
  isLoading?: boolean;
  onRefresh: () => void;
}

export function RecordsList({ records, registryId, isLoading, onRefresh }: RecordsListProps) {
  const t = useTranslations("RecordsList");
  const tCreate = useTranslations("CreateRecordDialog");
  const router = useRouter();
  const statusLabel = (status: RecordStatus) => t(`statusLabels.${status}`);
  const [updatingRecordId, setUpdatingRecordId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // recordIds returned by the AWS semantic search (SearchDiscoverableRegistryRecords),
  // in relevance order. Only covers APPROVED ("discoverable") records, so we merge
  // these with a client-side substring pass over all statuses below. null = no
  // active/successful semantic result yet.
  const [semanticIds, setSemanticIds] = useState<string[] | null>(null);
  const [isSemanticSearching, setIsSemanticSearching] = useState(false);

  // The registry's ARN — needed by the semantic API. All records in a registry
  // share the same registryArn, so derive it from the first record.
  const registryArn = records[0]?.registryArn;

  // Debounced semantic search: fire ~400ms after the user stops typing. Empty
  // query resets to the plain (substring-only) view with no network call.
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || !registryArn) {
      setSemanticIds(null);
      setIsSemanticSearching(false);
      return;
    }
    let cancelled = false;
    setIsSemanticSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await $orpc.searchRegistryRecords({
          registryIds: [registryArn],
          searchQuery: q,
          maxResults: 20,
        });
        if (cancelled) return;
        setSemanticIds(
          (res.registryRecords ?? [])
            .map((r) => r.recordId)
            .filter((id): id is string => Boolean(id)),
        );
      } catch {
        // Semantic search failed (e.g. no approved records / transient AWS
        // error) — fall back to substring-only by clearing semantic results.
        if (!cancelled) setSemanticIds(null);
      } finally {
        if (!cancelled) setIsSemanticSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, registryArn]);

  // Hybrid result set. With no query: all records (status filter only). With a
  // query: semantic hits first (relevance order, APPROVED only), then any other
  // records matching a plain substring search — so Draft/Pending records the
  // semantic API can't see are never lost. Status filter applies throughout.
  const filteredRecords = useMemo(() => {
    const byStatus = (record: RegistryRecord) =>
      statusFilter === "all" || record.status === statusFilter;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return records.filter(byStatus);

    const matchesSubstring = (record: RegistryRecord) =>
      record.name.toLowerCase().includes(q) ||
      record.displayName?.toLowerCase().includes(q) ||
      record.description?.toLowerCase().includes(q) ||
      record.recordType?.toLowerCase().includes(q);

    const recordById = new Map(
      records.filter((r) => r.recordId).map((r) => [r.recordId as string, r]),
    );

    const ordered: RegistryRecord[] = [];
    const seen = new Set<string>();

    // 1. Semantic hits, in relevance order.
    for (const id of semanticIds ?? []) {
      const record = recordById.get(id);
      if (record && byStatus(record) && !seen.has(id)) {
        ordered.push(record);
        seen.add(id);
      }
    }

    // 2. Substring matches across all statuses not already surfaced.
    for (const record of records) {
      const key = record.recordId ?? record.name;
      if (seen.has(key)) continue;
      if (byStatus(record) && matchesSubstring(record)) {
        ordered.push(record);
        seen.add(key);
      }
    }

    return ordered;
  }, [records, searchQuery, semanticIds, statusFilter]);

  const metrics = {
    total: records.length,
    pending: records.filter((r) => r.status === "PENDING_APPROVAL").length,
    approved: records.filter((r) => r.status === "APPROVED").length,
    deprecated: records.filter((r) => r.status === "DEPRECATED").length,
    rejected: records.filter((r) => r.status === "REJECTED").length,
  };

  const handleViewDetails = (record: RegistryRecord) => {
    const id = record.recordId;
    if (!id) return;
    router.push(`/dashboard/registry/${registryId}/records/${id}`);
  };

  const handleSubmitForApproval = async (recordId: string) => {
    setUpdatingRecordId(recordId);
    try {
      await $orpc.submitRegistryRecord({ registryId, recordId });
      toast.success(t("toast.submitSuccess"));
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || t("toast.submitError"));
    } finally { setUpdatingRecordId(null); }
  };

  const handleStatusUpdate = async (recordId: string, newStatus: "APPROVED" | "REJECTED" | "DEPRECATED") => {
    setUpdatingRecordId(recordId);
    try {
      await $orpc.updateRegistryRecordStatus({ registryId, recordId, status: newStatus });
      toast.success(t("toast.statusUpdateSuccess", { status: newStatus }));
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || t("toast.statusUpdateError"));
    } finally { setUpdatingRecordId(null); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const { id: recordId } = deleteTarget;
    setDeleteTarget(null);
    setUpdatingRecordId(recordId);
    try {
      await $orpc.deleteRegistryRecord({ registryId, recordId });
      toast.success(t("toast.deleteSuccess"));
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || t("toast.deleteError"));
    } finally { setUpdatingRecordId(null); }
  };

  const getActions = (status: RecordStatus) => {
    const a: Array<{ action: "submit" | "status" | "delete"; status?: "APPROVED" | "REJECTED" | "DEPRECATED"; label: string; icon: any; destructive?: boolean }> = [];
    if (status === "DRAFT") { a.push({ action: "submit", label: t("actions.submitForApproval"), icon: Send }); a.push({ action: "delete", label: "Delete", icon: Trash2, destructive: true }); }
    if (status === "PENDING_APPROVAL") { a.push({ action: "status", status: "APPROVED", label: t("actions.approve"), icon: CheckCircle }); a.push({ action: "status", status: "REJECTED", label: t("actions.reject"), icon: XCircle, destructive: true }); }
    if (status === "APPROVED") { a.push({ action: "status", status: "DEPRECATED", label: t("actions.deprecate"), icon: Archive }); }
    if (status === "DEPRECATED" || status === "REJECTED" || status === "CREATE_FAILED") { a.push({ action: "delete", label: "Delete", icon: Trash2, destructive: true }); }
    return a;
  };

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileJson className="size-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-foreground">{t("empty.title")}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("empty.description")}</p>
        <div className="mt-4">
          <Button onClick={() => router.push(`/dashboard/registry/${registryId}/create`)}>
            <Plus className="mr-2 h-4 w-4" />
            {tCreate("trigger")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 rounded-lg border bg-card px-4 py-3">
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">{t("metrics.totalSubmitted")}</div>
            <div className="text-xl font-semibold text-foreground mt-0.5">{metrics.total}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">{t("metrics.pendingApproval")}</div>
            <div className="text-xl font-semibold text-amber-600 dark:text-amber-400 mt-0.5">{metrics.pending}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">{t("metrics.approved")}</div>
            <div className="text-xl font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">{metrics.approved}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">{t("metrics.deprecated")}</div>
            <div className="text-xl font-semibold text-muted-foreground mt-0.5">{metrics.deprecated}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">{t("metrics.rejected")}</div>
            <div className="text-xl font-semibold text-red-600 dark:text-red-400 mt-0.5">{metrics.rejected}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder={t("searchPlaceholder")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-7 pr-7" />
            {isSemanticSearching && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground animate-spin" />
            )}
          </div>
          {searchQuery && (<Button size="sm" variant="ghost" onClick={() => setSearchQuery("")} className="text-muted-foreground"><X className="size-3.5" /></Button>)}
          <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as string)}>
            <SelectTrigger className="w-[170px]">
              <SelectValue>{statusFilter === "all" ? t("filter.allStatuses") : statusLabel(statusFilter as RecordStatus)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filter.allStatuses")}</SelectItem>
              {STATUS_VALUES.map((s) => (<SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => router.push(`/dashboard/registry/${registryId}/create`)}>
            <Plus className="mr-2 h-4 w-4" />
            {tCreate("trigger")}
          </Button>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileJson className="size-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground">{t("noMatches.title")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("noMatches.description")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredRecords.map((record, index) => {
              const recordId = record.recordId || record.name;
              const isUpdating = updatingRecordId === recordId;
              const actions = getActions(record.status);
              return (
                <div key={`${recordId}-${index}`} className="group relative flex flex-col rounded-lg border bg-card transition-colors hover:bg-muted/50 cursor-pointer" onClick={() => handleViewDetails(record)}>
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-medium text-foreground truncate">{record.displayName || record.name}</h3>
                          {record.recordType && (<Badge variant="outline" className={PROTOCOL_STYLE[record.recordType] || ""}>{record.recordType}</Badge>)}
                        </div>
                        {record.recordVersion && (<p className="text-[11px] text-muted-foreground mt-0.5">v{record.recordVersion}</p>)}
                      </div>
                      {actions.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button size="icon" variant="ghost" className="size-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()} disabled={isUpdating} />
                            }
                          >
                            <MoreHorizontal className="size-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {actions.map((action, idx) => {
                              const Icon = action.icon;
                              return (
                                <DropdownMenuItem
                                  key={`${action.action}-${action.status || "x"}-${idx}`}
                                  variant={action.destructive ? "destructive" : undefined}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (action.action === "submit") handleSubmitForApproval(recordId);
                                    else if (action.action === "delete") setDeleteTarget({ id: recordId, name: record.name });
                                    else if (action.status) handleStatusUpdate(recordId, action.status);
                                  }}
                                >
                                  <Icon className="size-3.5" />{action.label}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    <p className="mt-2.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">{record.description || t("noDescription")}</p>
                  </div>
                  <div className="border-t border-muted-foreground/15 px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={STATUS_STYLE[record.status] || ""}>{statusLabel(record.status)}</Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {record.updatedAt
                          ? t("updatedAt", {
                              date: new Date(record.updatedAt).toLocaleString(undefined, {
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              }),
                            })
                          : ""}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDialog.description", { name: deleteTarget?.name ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("deleteDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConfirm}>{t("deleteDialog.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
