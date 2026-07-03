"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Database, Loader2, MoreHorizontal, Pencil, RefreshCw, Search, Trash2, X } from "lucide-react";
import { $orpc } from "@/lib/api";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { EditRegistryDialog } from "./edit-registry-dialog";
import { CreateRegistryDialog } from "./create-registry-dialog";
import { Input } from "@/components/ui/input";

type Registry = {
  name: string;
  description?: string;
  registryId: string;
  registryArn: string;
  status: "CREATING" | "READY" | "DELETING" | "UPDATING";
  approvalConfiguration?: { autoApproval: boolean };
  createdAt?: string | Date;
  updatedAt: string | Date;
};

const STATUS_CONFIG: Record<Registry["status"], { className: string }> = {
  READY: { className: "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30" },
  CREATING: { className: "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/30" },
  UPDATING: { className: "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30" },
  DELETING: { className: "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30" },
};

interface RegistryListProps {
  registries: Registry[];
  isLoading?: boolean;
  onRefresh: () => void;
}

export function RegistryList({ registries, isLoading, onRefresh }: RegistryListProps) {
  const t = useTranslations("RegistryList");
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRegistry, setSelectedRegistry] = useState<Registry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editRegistry, setEditRegistry] = useState<Registry | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRegistries = registries.filter((registry) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      registry.name.toLowerCase().includes(q) ||
      registry.description?.toLowerCase().includes(q) ||
      registry.registryId.toLowerCase().includes(q)
    );
  });

  const handleDeleteClick = (registry: Registry) => {
    setSelectedRegistry(registry);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedRegistry) return;
    setIsDeleting(true);
    try {
      await $orpc.deleteRegistry({ registryId: selectedRegistry.registryId });
      toast.success(t("toast.deleteSuccess"));
      setDeleteDialogOpen(false);
      setSelectedRegistry(null);
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || t("error.deleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  if (registries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Database className="size-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-foreground">{t("empty.title")}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("empty.description")}</p>
        <div className="mt-4">
          <CreateRegistryDialog onSuccess={onRefresh} />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7"
            />
          </div>
          {searchQuery && (
            <Button size="sm" variant="ghost" onClick={() => setSearchQuery("")} className="text-muted-foreground">
              <X className="size-3.5" />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <CreateRegistryDialog onSuccess={onRefresh} />
        </div>

        <Badge variant="secondary">
          {filteredRegistries.length} {filteredRegistries.length === 1 ? "registry" : "registries"}
        </Badge>

        {filteredRegistries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Database className="size-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground">No matching registries</p>
            <p className="text-xs text-muted-foreground mt-1">Try adjusting your search query</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredRegistries.map((registry) => {
              const statusCfg = STATUS_CONFIG[registry.status];
              return (
                <div
                  key={registry.registryId}
                  className="group relative flex flex-col rounded-lg border bg-card transition-colors hover:bg-muted/50 cursor-pointer"
                  onClick={() => {
                    if (registry.status === "CREATING") {
                      toast.error(t("toast.creatingAccessBlocked"));
                      return;
                    }
                    router.push(`/dashboard/registry/${registry.registryId}`);
                  }}
                >
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium text-foreground truncate">
                          {registry.name}
                        </h3>
                        <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                          {registry.registryId}
                        </p>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            />
                          }
                        >
                          <MoreHorizontal className="size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditRegistry(registry);
                              setEditDialogOpen(true);
                            }}
                            disabled={registry.status !== "READY"}
                          >
                            <Pencil className="size-3.5" />
                            {t("actions.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(registry);
                            }}
                            disabled={registry.status !== "READY"}
                          >
                            <Trash2 className="size-3.5" />
                            {t("actions.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <p className="mt-2.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {registry.description || "No description"}
                    </p>
                  </div>

                  <div className="flex items-center justify-between border-t border-muted-foreground/15 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={statusCfg.className}>
                        {registry.status}
                      </Badge>
                      {registry.approvalConfiguration?.autoApproval && (
                        <Badge variant="outline" className="text-[10px]">Auto-approve</Badge>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(registry.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.rich("deleteDialog.description", { name: selectedRegistry?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("deleteDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isDeleting ? t("deleteDialog.deleting") : t("deleteDialog.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editRegistry && (
        <EditRegistryDialog
          registry={editRegistry}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSuccess={onRefresh}
        />
      )}
    </>
  );
}
