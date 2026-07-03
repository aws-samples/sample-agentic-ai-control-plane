"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Download,
  Eye,
  LibraryBig,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { $orpc } from "@/lib/api";
import {
  type PolicyItem,
  type PolicyStatus,
  type PolicyType,
  STATUS_VALUES,
  TYPE_VALUES,
} from "./constants";

interface PolicyLibraryListProps {
  policies: PolicyItem[];
  isLoading?: boolean;
  onRefresh: () => void;
}

type SortField = "name" | "createdAt" | "updatedAt" | "status";
type SortDir = "asc" | "desc";

export function PolicyLibraryList({
  policies,
  isLoading,
  onRefresh,
}: PolicyLibraryListProps) {
  const t = useTranslations("PolicyLibrary");
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "policies" | "templates">(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [deleteTarget, setDeleteTarget] = useState<PolicyItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { draft: 0, published: 0, template: 0 };
    for (const p of policies) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return counts;
  }, [policies]);

  const kindCounts = useMemo(() => {
    let policiesCount = 0;
    let templatesCount = 0;
    for (const p of policies) {
      if (p.isTemplate) templatesCount += 1;
      else policiesCount += 1;
    }
    return {
      all: policies.length,
      policies: policiesCount,
      templates: templatesCount,
    };
  }, [policies]);

  const filteredPolicies = useMemo(() => {
    const result = policies.filter((policy) => {
      if (kindFilter === "policies" && policy.isTemplate) return false;
      if (kindFilter === "templates" && !policy.isTemplate) return false;
      if (statusFilter !== "all" && policy.status !== statusFilter) return false;
      if (typeFilter !== "all" && policy.type !== typeFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        policy.name.toLowerCase().includes(q) ||
        policy.description.toLowerCase().includes(q) ||
        policy.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "createdAt":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "updatedAt":
          cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [policies, kindFilter, statusFilter, typeFilter, searchQuery, sortField, sortDir]);

  const allSelected = filteredPolicies.length > 0 && filteredPolicies.every((p) => selectedIds.has(p.id));
  const someSelected = filteredPolicies.some((p) => selectedIds.has(p.id));

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPolicies.map((p) => p.id)));
    }
  }, [allSelected, filteredPolicies]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsMutating(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) => $orpc.deletePolicy({ id })),
      );
      toast.success(t("bulk.deleteSuccess", { count: selectedIds.size }));
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      onRefresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("errors.deleteFailed");
      toast.error(message);
    } finally {
      setIsMutating(false);
    }
  }, [selectedIds, t, onRefresh]);

  const handleBulkExport = useCallback(() => {
    const selected = policies.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) return;
    const blob = new Blob(
      selected.map((p) => `// ${p.name}\n${p.cedarCode}\n\n`),
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `policies-export-${Date.now()}.cedar`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t("bulk.exportSuccess", { count: selectedIds.size }));
    setSelectedIds(new Set());
  }, [selectedIds, policies, t]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setIsMutating(true);
    try {
      await $orpc.deletePolicy({ id: deleteTarget.id });
      toast.success(t("actions.deleteSuccess"));
      setDeleteTarget(null);
      onRefresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("errors.deleteFailed");
      toast.error(message);
    } finally {
      setIsMutating(false);
    }
  }, [deleteTarget, t, onRefresh]);

  const handlePublish = useCallback(
    async (policy: PolicyItem) => {
      setIsMutating(true);
      try {
        await $orpc.updatePolicy({ id: policy.id, status: "published" });
        toast.success(t("actions.publishSuccess"));
        onRefresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t("errors.updateFailed");
        toast.error(message);
      } finally {
        setIsMutating(false);
      }
    },
    [t, onRefresh],
  );

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("asc");
      }
    },
    [sortField],
  );

  const handleImport = useCallback(() => {
    toast.info(t("importInfo"));
  }, [t]);

  const getStatusBadge = (status: PolicyStatus) => {
    const colorClasses: Record<PolicyStatus, string> = {
      draft:
        "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/30",
      in_review:
        "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30",
      published:
        "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30",
      archived:
        "text-muted-foreground border-border bg-muted/50",
    };
    return (
      <Badge variant="outline" className={colorClasses[status]}>
        {t(`status.${status}`)}
      </Badge>
    );
  };

  const getTypeBadge = (type: PolicyType) => {
    const colorClasses: Record<PolicyType, string> = {
      permit:
        "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30",
      forbid:
        "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
    };
    return (
      <Badge variant="outline" className={colorClasses[type]}>
        {t(`type.${type}`)}
      </Badge>
    );
  };

  const formatDate = (dateValue?: string | Date | null) => {
    if (!dateValue) return t("na");
    return new Date(dateValue).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  function SortHeader({ field, label }: { field: SortField; label: string }) {
    const isActive = sortField === field;
    return (
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => handleSort(field)}
      >
        {label}
        {isActive ? (
          sortDir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    );
  }

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
      {/* Kind tabs: All / Policies / Templates */}
      <Tabs
        value={kindFilter}
        onValueChange={(v) =>
          setKindFilter(v as "all" | "policies" | "templates")
        }
      >
        <TabsList>
          <TabsTrigger value="all">
            {t("tabs.all")}
            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 tabular-nums">
              {kindCounts.all}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="policies">
            {t("tabs.policies")}
            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 tabular-nums">
              {kindCounts.policies}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="templates">
            {t("tabs.templates")}
            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0 tabular-nums">
              {kindCounts.templates}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Stats summary chips */}
      <div className="flex items-center gap-2">
        {STATUS_VALUES.map((status) => (
          <button
            key={status}
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-[background-color,color,border-color] active:scale-[0.98] ${
              statusFilter === status
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
            onClick={() =>
              setStatusFilter(statusFilter === status ? "all" : status)
            }
          >
            <span className="tabular-nums">{statusCounts[status] ?? 0}</span>
            {t(`status.${status}`)}
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("search.placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(val) => setTypeFilter(val as string)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue>
              {typeFilter === "all"
                ? t("filters.type.placeholder")
                : t(`filters.type.${typeFilter}`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.type.all")}</SelectItem>
            {TYPE_VALUES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`filters.type.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={<Button variant="outline" size="icon" onClick={handleImport} />}>
              <Upload className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>{t("import")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Bulk actions bar */}
      {someSelected && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
          <span className="text-xs font-medium tabular-nums">
            {t("bulk.selected", { count: selectedIds.size })}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button size="sm" variant="outline" className="h-7 text-xs active:scale-[0.96]" onClick={handleBulkExport}>
              <Download className="size-3 mr-1.5" />
              {t("bulk.export")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs active:scale-[0.96]"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={isMutating}
            >
              <Trash2 className="size-3 mr-1.5" />
              {t("bulk.delete")}
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected && !allSelected}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>
                <SortHeader field="name" label={t("table.name")} />
              </TableHead>
              <TableHead>{t("table.description")}</TableHead>
              <TableHead>{t("table.type")}</TableHead>
              <TableHead>
                <SortHeader field="status" label={t("table.status")} />
              </TableHead>
              <TableHead>{t("table.tags")}</TableHead>
              <TableHead>
                <SortHeader field="createdAt" label={t("table.created")} />
              </TableHead>
              <TableHead className="text-right">
                {t("table.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPolicies.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-24 text-center text-muted-foreground"
                >
                  {searchQuery.trim() ||
                  statusFilter !== "all" ||
                  typeFilter !== "all"
                    ? t("empty.withFilters")
                    : t("empty.title")}
                </TableCell>
              </TableRow>
            ) : (
              filteredPolicies.map((policy) => (
                <TableRow
                  key={policy.id}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() =>
                    router.push(`/dashboard/policy-library/${policy.id}`)
                  }
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(policy.id)}
                      onCheckedChange={() => toggleOne(policy.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-primary">
                    <div className="flex items-center gap-1.5">
                      <span>{policy.name}</span>
                      {policy.isTemplate && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 gap-1 text-violet-600 border-violet-200 bg-violet-50 dark:text-violet-400 dark:border-violet-800 dark:bg-violet-950/30"
                        >
                          <LibraryBig className="size-2.5" />
                          {t("templateBadge")}
                        </Badge>
                      )}
                      {policy.parentTemplateId && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 text-muted-foreground border-border"
                        >
                          {t("instanceBadge")}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground text-pretty">
                    {policy.description}
                  </TableCell>
                  <TableCell>{getTypeBadge(policy.type)}</TableCell>
                  <TableCell>{getStatusBadge(policy.status)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {policy.tags.slice(0, 2).map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {tag}
                        </Badge>
                      ))}
                      {policy.tags.length > 2 && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 tabular-nums"
                        >
                          +{policy.tags.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs tabular-nums">
                    {formatDate(policy.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(
                              `/dashboard/policy-library/${policy.id}`,
                            );
                          }}
                        >
                          <Eye className="mr-2" />
                          {t("actions.view")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(
                              `/dashboard/policy-library/${policy.id}/edit`,
                            );
                          }}
                        >
                          <Pencil className="mr-2" />
                          {t("actions.edit")}
                        </DropdownMenuItem>
                        {policy.status === "draft" && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePublish(policy);
                            }}
                          >
                            <ArrowUpRight className="mr-2" />
                            {t("actions.publish")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(policy);
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

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance">{t("deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {t("deleteDialog.description", {
                name: deleteTarget?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("deleteDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isMutating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.96]"
            >
              {isMutating && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              {t("deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance tabular-nums">
              {t("bulk.deleteDialog.title", { count: selectedIds.size })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty tabular-nums">
              {t("bulk.deleteDialog.description", { count: selectedIds.size })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("bulk.deleteDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isMutating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.96]"
            >
              {isMutating && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              {t("bulk.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
