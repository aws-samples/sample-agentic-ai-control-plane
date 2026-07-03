"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { $orpc } from "@/lib/api";
import { Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { RegistryTool } from "./constants";

type Registry = {
  name: string;
  description?: string;
  registryId: string;
  registryArn: string;
  status: string;
};

type RegistryRecord = {
  registryArn: string;
  recordId: string;
  recordArn?: string;
  name: string;
  recordVersion?: string;
  descriptorType: string;
  status: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
};

const PROTOCOL_BADGE_CLASSES: Record<string, string> = {
  MCP: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  A2A: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  CUSTOM: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  AGENT_SKILLS: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
};

function isSupportedDescriptor(descriptorType: string | undefined): boolean {
  return descriptorType === "MCP" || descriptorType === "CUSTOM";
}

interface RegistryToolPickerProps {
  enabledRegistryToolIds: string[];
  onAddTools: (tools: RegistryTool[]) => void;
  onOpenChange: (open: boolean) => void;
}

export function RegistryToolPicker({
  enabledRegistryToolIds,
  onAddTools,
  onOpenChange,
}: RegistryToolPickerProps) {
  const t = useTranslations("AgentForm");

  const [registries, setRegistries] = useState<Registry[]>([]);
  const [isLoadingRegistries, setIsLoadingRegistries] = useState(true);

  const [records, setRecords] = useState<RegistryRecord[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RegistryRecord[] | null>(
    null,
  );
  const [isSearching, setIsSearching] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const enabledSet = useMemo(
    () => new Set(enabledRegistryToolIds),
    [enabledRegistryToolIds],
  );

  useEffect(() => {
    const fetchRegistries = async () => {
      setIsLoadingRegistries(true);
      try {
        const response = await $orpc.listRegistries({ status: "READY" });
        const readyRegistries = response.registries.filter(
          (r) => r.status === "READY",
        );
        setRegistries(readyRegistries);

        if (readyRegistries.length > 0) {
          fetchAllRecords(readyRegistries);
        }
      } catch (err: unknown) {
        toast.error(
          err instanceof Error
            ? err.message
            : t("tools.registry.errorLoadingRegistries"),
        );
      } finally {
        setIsLoadingRegistries(false);
      }
    };

    fetchRegistries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAllRecords = async (regs: Registry[]) => {
    setIsLoadingRecords(true);
    try {
      const results = await Promise.all(
        regs.map((r) =>
          $orpc
            .listRegistryRecords({
              registryId: r.registryId,
              status: "APPROVED",
            })
            .then((res) => (res.registryRecords || []).map((rec: any) => ({
              ...rec,
              recordId: rec.recordId || rec.registryRecordId || "",
              descriptorType: rec.descriptorType || rec.protocol || "",
            }) as RegistryRecord)),
        ),
      );
      setRecords(results.flat());
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("tools.registry.errorLoadingRecords"),
      );
    } finally {
      setIsLoadingRecords(false);
    }
  };

  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    if (registries.length === 0) return;

    const timer = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setIsSearching(true);
      try {
        const results = await Promise.all(
          registries.map((r) =>
            $orpc
              .searchRegistryRecords({
                registryIds: [r.registryArn],
                searchQuery: query,
                maxResults: 20,
              })
              .then((res) => res.registryRecords || []),
          ),
        );

        if (!controller.signal.aborted) {
          const deduped = new Map<string, RegistryRecord>();
          for (const rec of results.flat() as any[]) {
            const record = {
              ...rec,
              recordId: rec.recordId || rec.registryRecordId || "",
              descriptorType: rec.descriptorType || rec.protocol || "",
            } as RegistryRecord;
            deduped.set(record.recordId, record);
          }
          setSearchResults(Array.from(deduped.values()));
        }
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          toast.error(
            err instanceof Error
              ? err.message
              : t("tools.registry.errorSearching"),
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [searchQuery, registries, t]);

  const displayRecords = searchResults ?? records;

  const getRegistryName = useCallback(
    (arn: string | undefined) => {
      if (!arn) return "";
      const registry = registries.find((r) => r.registryArn === arn);
      return registry?.name || arn.split("/").pop() || arn;
    },
    [registries],
  );

  const handleToggle = (record: RegistryRecord) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(record.recordId)) {
        next.delete(record.recordId);
      } else {
        next.add(record.recordId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const selectableRecords = displayRecords.filter(
      (r) => !enabledSet.has(r.recordId) && isSupportedDescriptor(r.descriptorType),
    );
    const allSelected = selectableRecords.every((r) =>
      selectedIds.has(r.recordId),
    );

    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableRecords.map((r) => r.recordId)));
    }
  };

  const handleAdd = () => {
    const toolsToAdd: RegistryTool[] = displayRecords
      .filter((r) => selectedIds.has(r.recordId))
      .map((r) => ({
        registryRecordId: r.recordId,
        registryArn: r.registryArn,
        name: r.name,
        description: r.description,
        protocol: r.descriptorType,
        registryName: getRegistryName(r.registryArn),
        recordVersion: r.recordVersion,
      }));

    if (toolsToAdd.length > 0) {
      onAddTools(toolsToAdd);
      onOpenChange(false);
    }
  };

  const selectableCount = displayRecords.filter(
    (r) => !enabledSet.has(r.recordId) && isSupportedDescriptor(r.descriptorType),
  ).length;
  const allSelected =
    selectableCount > 0 &&
    displayRecords
      .filter((r) => !enabledSet.has(r.recordId) && isSupportedDescriptor(r.descriptorType))
      .every((r) => selectedIds.has(r.recordId));

  if (isLoadingRegistries || isLoadingRecords) {
    return (
      <div className="flex flex-col items-center justify-center py-12 flex-1">
        <Loader2 className="size-6 animate-spin text-muted-foreground mb-2" />
        <p className="text-xs text-muted-foreground">
          {isLoadingRegistries
            ? t("tools.registry.loading")
            : t("tools.registry.loadingRecords")}
        </p>
      </div>
    );
  }

  if (registries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 flex-1 text-center px-6">
        <Search className="size-6 text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground">
          {t("tools.registry.noRegistries")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex flex-col flex-1 px-2 overflow-hidden">
        <div className="relative py-4">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder={t("tools.registry.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
          {isSearching && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        {displayRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Search className="size-6 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">
              {searchResults !== null
                ? t("tools.registry.noSearchResults", { query: searchQuery })
                : t("tools.registry.noResults")}
            </p>
          </div>
        ) : (
          <>
            {selectableCount > 0 && (
              <div className="flex items-center pb-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                  />
                  {allSelected
                    ? t("tools.registry.deselectAll")
                    : t("tools.registry.selectAll")}
                </label>
              </div>
            )}

            <FieldGroup className="flex-1 overflow-y-auto gap-2">
              {displayRecords.map((record) => {
                const alreadyEnabled = enabledSet.has(record.recordId);
                const isSelected = selectedIds.has(record.recordId);
                const isSupported = isSupportedDescriptor(record.descriptorType);

                return (
                  <label
                    key={record.recordId}
                    className={`block rounded-md border p-3 transition-colors ${
                      alreadyEnabled || !isSupported
                        ? "opacity-60 cursor-default"
                        : "cursor-pointer hover:bg-muted/50"
                    } ${isSelected && !alreadyEnabled && isSupported ? "border-primary bg-primary/5" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={alreadyEnabled || (isSelected && isSupported)}
                        disabled={alreadyEnabled || !isSupported}
                        onCheckedChange={() => isSupported && handleToggle(record)}
                        className="mt-0.5"
                      />
                      <FieldContent>
                        <FieldTitle>
                          {record.name}
                          <Badge
                            variant="outline"
                            className={`text-[9px] px-1.5 h-4 ml-2 font-medium ${PROTOCOL_BADGE_CLASSES[record.descriptorType] || ""}`}
                          >
                            {record.descriptorType}
                          </Badge>
                          {alreadyEnabled && (
                            <Badge
                              variant="secondary"
                              className="text-[9px] px-1.5 h-4 ml-1"
                            >
                              {t("tools.alreadyAdded")}
                            </Badge>
                          )}
                          {!isSupported && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 h-4 ml-1"
                              title={t("tools.target.unsupportedHint")}
                            >
                              {t("tools.target.unsupported")}
                            </Badge>
                          )}
                        </FieldTitle>
                        {record.description && (
                          <FieldDescription className="line-clamp-2">
                            {record.description}
                          </FieldDescription>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {getRegistryName(record.registryArn)}
                          {record.recordVersion && ` · v${record.recordVersion}`}
                        </p>
                      </FieldContent>
                    </div>
                  </label>
                );
              })}
            </FieldGroup>
          </>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="border-t px-4 py-3 flex items-center gap-2 justify-end">
          <Button onClick={handleAdd}>
            {t("tools.addCount", { count: selectedIds.size })}
          </Button>
        </div>
      )}
    </div>
  );
}
