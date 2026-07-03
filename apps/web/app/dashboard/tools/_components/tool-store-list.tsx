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
import { Eye, MoreHorizontal, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type ToolPolicyStore,
  type StoreStatus,
  STORE_STATUS_VALUES,
  STORE_STATUS_CLASSES,
} from "./constants";

interface ToolStoreListProps {
  stores: ToolPolicyStore[];
}

export function ToolStoreList({ stores }: ToolStoreListProps) {
  const t = useTranslations("ToolStoreList");
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredStores = stores.filter((store) => {
    if (statusFilter !== "all" && store.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      store.name.toLowerCase().includes(q) ||
      store.description.toLowerCase().includes(q) ||
      (store.awsPolicyStoreId ?? "").toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: StoreStatus) => (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 ${STORE_STATUS_CLASSES[status]}`}
    >
      {t(`status.${status}`)}
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

  if (stores.length === 0) {
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
          <SelectTrigger className="w-[170px]">
            <SelectValue>
              {statusFilter === "all"
                ? t("filters.status.placeholder")
                : t(`filters.status.${statusFilter as StoreStatus}`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.status.all")}</SelectItem>
            {STORE_STATUS_VALUES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`filters.status.${s}`)}
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
              <TableHead>{t("table.description")}</TableHead>
              <TableHead>{t("table.policyStoreId")}</TableHead>
              <TableHead>{t("table.region")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.policies")}</TableHead>
              <TableHead>{t("table.creator")}</TableHead>
              <TableHead>{t("table.lastSynced")}</TableHead>
              <TableHead className="text-right">
                {t("table.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStores.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="h-24 text-center text-muted-foreground"
                >
                  {searchQuery.trim() || statusFilter !== "all"
                    ? t("empty.withFilters")
                    : t("empty.title")}
                </TableCell>
              </TableRow>
            ) : (
              filteredStores.map((store) => (
                <TableRow
                  key={store.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/dashboard/tools/${store.id}`)}
                >
                  <TableCell className="font-medium text-primary">
                    {store.name}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {store.description}
                  </TableCell>
                  <TableCell>
                    <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
                      {store.awsPolicyStoreId ?? t("na")}
                    </code>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {store.region}
                  </TableCell>
                  <TableCell>{getStatusBadge(store.status)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 tabular-nums"
                    >
                      {store.policyCount ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {store.createdBy?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {formatDate(store.lastSyncedAt)}
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
                            router.push(`/dashboard/tools/${store.id}`);
                          }}
                        >
                          <Eye className="mr-2" />
                          {t("actions.view")}
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
