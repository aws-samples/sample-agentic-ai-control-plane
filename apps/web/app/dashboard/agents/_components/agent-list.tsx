"use client";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentAvatar } from "@/components/agent-avatar";
import { $orpc } from "@/lib/api";
import { useSession } from "@package/auth";
import {
  BotIcon,
  ChevronLeft,
  ChevronRight,
  EyeIcon,
  GlobeIcon,
  Loader2,
  LockIcon,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CreateAgentDialog } from "./create-agent-dialog";

type Agent = {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  preferredModelId: string | null;
  createdById: string | null;
  createdByEmail: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const ITEMS_PER_PAGE = 12;

function VisibilityBadge({
  isPublic,
  publicLabel,
  privateLabel,
}: {
  isPublic: boolean;
  publicLabel: string;
  privateLabel: string;
}) {
  if (isPublic) {
    return (
      <Badge
        variant="outline"
        className="text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30"
      >
        <GlobeIcon className="size-3 mr-1" />
        {publicLabel}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground border-border">
      <LockIcon className="size-3 mr-1" />
      {privateLabel}
    </Badge>
  );
}

export function AgentList() {
  const t = useTranslations("AgentList");
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);

  const fetchAgents = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await $orpc.listAgents({ userId });
      setAgents(response.agents);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("error.loadFailed"));
       console.error("Error fetching agents:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, [userId]);

  const filteredAgents = useMemo(() => {
    let result = agents;

    if (activeTab === "mine") {
      result = result.filter((a) => a.createdById === userId);
    } else if (activeTab === "public") {
      result = result.filter((a) => a.isPublic);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q),
      );
    }

    return result;
  }, [agents, activeTab, searchQuery, userId]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAgents.length / ITEMS_PER_PAGE),
  );
  const paginatedAgents = filteredAgents.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const myCount = agents.filter((a) => a.createdById === userId).length;
  const publicCount = agents.filter((a) => a.isPublic).length;

  const handleTabChange = (value: string | number | null) => {
    setActiveTab(value as string);
    setCurrentPage(1);
  };

  const handleDelete = async (agent: Agent) => {
    try {
      await $orpc.deleteAgent({ id: agent.id });
      toast.success(t("toast.deleteSuccess"));
      fetchAgents();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("toast.deleteFailed"));
    } finally {
      setAgentToDelete(null);
    }
  };

  if (isLoading && agents.length === 0) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full flex-col items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div className="flex h-full w-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              {t("title")}
            </h1>
            <p className="text-xs text-muted-foreground">{t("description")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {filteredAgents.length}{" "}
              {filteredAgents.length === 1 ? t("agent") : t("agents")}
            </Badge>
            <CreateAgentDialog onSuccess={fetchAgents} />
          </div>
        </div>

        {/* Tabs + Search */}
        <div className="border-b px-4 py-2 space-y-2">
          <div className="flex items-center justify-between">
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList variant="line">
                <TabsTrigger value="all">
                  {t("tabs.all")}
                  <Badge
                    variant="secondary"
                    className="ml-1 text-[10px] px-1.5 py-0"
                  >
                    {agents.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="mine">
                  <LockIcon className="size-3.5" />
                  {t("tabs.mine")}
                  <Badge
                    variant="secondary"
                    className="ml-1 text-[10px] px-1.5 py-0"
                  >
                    {myCount}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="public">
                  <GlobeIcon className="size-3.5" />
                  {t("tabs.public")}
                  <Badge
                    variant="secondary"
                    className="ml-1 text-[10px] px-1.5 py-0"
                  >
                    {publicCount}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t("search.placeholder")}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-7"
              />
            </div>
            {searchQuery && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearchQuery("");
                  setCurrentPage(1);
                }}
                className="text-muted-foreground"
              >
                <X className="size-3.5" />
                {t("search.clear")}
              </Button>
            )}
          </div>
        </div>

        {/* Card Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {paginatedAgents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <BotIcon className="size-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">
                {t("empty.title")}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                {searchQuery ? t("empty.withSearch") : t("empty.noData")}
              </p>
              {searchQuery && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                  className="mt-3"
                >
                  {t("search.clearAll")}
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {paginatedAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="group relative flex flex-col rounded-lg border bg-card transition-colors hover:bg-muted/50 cursor-pointer"
                  onClick={() => router.push(`/dashboard/agent/${agent.id}`)}
                >
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
                          <AgentAvatar name={agent.name} id={agent.id} size={30} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-medium text-foreground truncate">
                            {agent.name}
                          </h3>
                          {agent.createdByEmail && (
                            <p className="text-[11px] text-muted-foreground truncate">
                              {agent.createdByEmail}
                            </p>
                          )}
                        </div>
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
                          <DropdownMenuItem>
                            <EyeIcon className="size-3.5" />
                            {t("actions.view")}
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Pencil className="size-3.5" />
                            {t("actions.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAgentToDelete(agent);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                            {t("actions.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <p className="mt-2.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {agent.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between border-t border-muted-foreground/15 px-4 py-2.5">
                    <VisibilityBadge
                      isPublic={agent.isPublic}
                      publicLabel={t("visibility.public")}
                      privateLabel={t("visibility.private")}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(agent.updatedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {filteredAgents.length > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-between border-t px-4 py-2">
            <p className="text-xs text-muted-foreground">
              {t("pagination.showing", {
                from: (currentPage - 1) * ITEMS_PER_PAGE + 1,
                to: Math.min(
                  currentPage * ITEMS_PER_PAGE,
                  filteredAgents.length,
                ),
                total: filteredAgents.length,
              })}
            </p>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="outline"
                className="size-7"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <Button
                    key={page}
                    size="icon"
                    variant={currentPage === page ? "default" : "outline"}
                    className="size-7"
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </Button>
                ),
              )}
              <Button
                size="icon"
                variant="outline"
                className="size-7"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog
        open={!!agentToDelete}
        onOpenChange={(open) => {
          if (!open) setAgentToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialog.description", {
                name: agentToDelete?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("deleteDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => agentToDelete && handleDelete(agentToDelete)}
            >
              {t("deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
