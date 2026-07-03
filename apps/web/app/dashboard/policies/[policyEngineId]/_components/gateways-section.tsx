"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Network, Plug, Plus, Search, Unplug } from "lucide-react";
import { $orpc } from "@/lib/api";
import type { GatewayAttachment } from "./constants";

interface GatewaysSectionProps {
  engineId: string;
  attachments: GatewayAttachment[];
  onRefresh: () => void | Promise<void>;
}

type Mode = "LOG_ONLY" | "ENFORCE";

type AvailableGateway = {
  gatewayId: string;
  name: string;
  description?: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export function GatewaysSection({
  engineId,
  attachments,
  onRefresh,
}: GatewaysSectionProps) {
  const t = useTranslations("PolicyEngineDetail.gateways");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [available, setAvailable] = useState<AvailableGateway[]>([]);
  const [isLoadingGateways, setIsLoadingGateways] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AvailableGateway | null>(null);
  const [mode, setMode] = useState<Mode>("ENFORCE");
  const [isAttaching, setIsAttaching] = useState(false);
  const [detachTarget, setDetachTarget] = useState<GatewayAttachment | null>(
    null,
  );
  const [isDetaching, setIsDetaching] = useState(false);

  const attachedIds = useMemo(
    () => new Set(attachments.map((a) => a.awsGatewayId)),
    [attachments],
  );

  const openSheet = useCallback(async () => {
    setSheetOpen(true);
    setSelected(null);
    setMode("ENFORCE");
    setSearch("");
    setIsLoadingGateways(true);
    setLoadError(null);
    try {
      const res = await $orpc.listGatewaysAvailable({});
      setAvailable(
        res.gateways.map((g) => ({
          ...g,
          createdAt: new Date(g.createdAt),
          updatedAt: new Date(g.updatedAt),
        })) as AvailableGateway[],
      );
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("loadError"));
    } finally {
      setIsLoadingGateways(false);
    }
  }, [t]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.gatewayId.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q),
    );
  }, [available, search]);

  const handleAttach = async () => {
    if (!selected) return;
    setIsAttaching(true);
    try {
      await $orpc.attachGateway({
        engineId,
        awsGatewayId: selected.gatewayId,
        mode,
      });
      toast.success(t("attachSuccess"));
      setSheetOpen(false);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("attachError"));
    } finally {
      setIsAttaching(false);
    }
  };

  const handleDetach = async () => {
    if (!detachTarget) return;
    setIsDetaching(true);
    try {
      await $orpc.detachGateway({ attachmentId: detachTarget.id });
      toast.success(t("detachSuccess"));
      setDetachTarget(null);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("detachError"));
    } finally {
      setIsDetaching(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold tabular-nums">
            {t("title", { count: attachments.length })}
          </CardTitle>
          <Button
            size="sm"
            onClick={openSheet}
            className="active:scale-[0.96]"
          >
            <Plus className="size-3.5 mr-1.5" />
            {t("attach")}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.gateway")}</TableHead>
                  <TableHead>{t("table.mode")}</TableHead>
                  <TableHead>{t("table.attachedAt")}</TableHead>
                  <TableHead className="w-24 text-right">
                    {t("table.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attachments.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-24 text-center text-xs text-muted-foreground text-pretty"
                    >
                      {t("empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  attachments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Network className="size-3.5 text-muted-foreground" />
                          <div>
                            <p className="text-xs font-medium">
                              {a.gatewayName}
                            </p>
                            <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono tabular-nums text-muted-foreground">
                              {a.awsGatewayId}
                            </code>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${
                            a.mode === "ENFORCE"
                              ? "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30"
                              : "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30"
                          }`}
                        >
                          {t(`mode.${a.mode}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {new Date(a.createdAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-destructive"
                          onClick={() => setDetachTarget(a)}
                        >
                          <Unplug className="size-3 mr-1" />
                          {t("detach")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-lg! rounded-lg border flex flex-col overflow-hidden">
          <SheetHeader className="border-b py-3 px-3">
            <SheetTitle className="text-sm font-semibold text-balance">
              {t("attachSheet.title")}
            </SheetTitle>
            <SheetDescription className="text-xs text-pretty">
              {t("attachSheet.description")}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="relative px-3 py-3 border-b">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("attachSheet.search")}
                className="pl-8 text-xs"
                disabled={isLoadingGateways || !!loadError}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {isLoadingGateways ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : loadError ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive text-pretty">
                  {loadError}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Plug className="size-8 text-muted-foreground/30 mb-3" />
                  <p className="text-xs text-muted-foreground text-pretty">
                    {t("attachSheet.empty")}
                  </p>
                </div>
              ) : (
                filtered.map((g) => {
                  const already = attachedIds.has(g.gatewayId);
                  const isSelected = selected?.gatewayId === g.gatewayId;
                  return (
                    <button
                      key={g.gatewayId}
                      type="button"
                      disabled={already}
                      onClick={() => setSelected(g)}
                      className={`w-full rounded-lg border text-left px-3 py-2.5 transition-colors ${
                        already
                          ? "opacity-60 cursor-not-allowed"
                          : isSelected
                            ? "bg-muted"
                            : "hover:bg-muted/50 active:scale-[0.99]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Network className="size-3.5 text-muted-foreground shrink-0" />
                        <p className="text-xs font-medium truncate flex-1">
                          {g.name}
                        </p>
                        {already && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {t("attachSheet.alreadyAttached")}
                          </Badge>
                        )}
                      </div>
                      <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono tabular-nums text-muted-foreground mt-1 inline-block">
                        {g.gatewayId}
                      </code>
                      {g.description && (
                        <p className="text-[11px] text-muted-foreground text-pretty mt-1 line-clamp-2">
                          {g.description}
                        </p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            {selected && (
              <div className="border-t px-4 py-3 space-y-2">
                <Label className="text-xs">{t("attachSheet.mode")}</Label>
                <Select
                  value={mode}
                  onValueChange={(v) => setMode(v as Mode)}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOG_ONLY">
                      {t("mode.LOG_ONLY")}
                    </SelectItem>
                    <SelectItem value="ENFORCE">
                      {t("mode.ENFORCE")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground text-pretty">
                  {t(`attachSheet.modeHelper.${mode}`)}
                </p>
              </div>
            )}
          </div>
          <SheetFooter className="border-t py-3 px-3 flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setSheetOpen(false)}
              disabled={isAttaching}
            >
              {t("attachSheet.cancel")}
            </Button>
            <Button
              onClick={handleAttach}
              disabled={!selected || isAttaching}
              className="active:scale-[0.96]"
            >
              {isAttaching && (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              )}
              {t("attachSheet.confirm")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!detachTarget}
        onOpenChange={(o) => !o && setDetachTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance">
              {t("detachDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {t("detachDialog.description", {
                name: detachTarget?.gatewayName ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("detachDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDetach}
              disabled={isDetaching}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.96]"
            >
              {isDetaching && (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              )}
              {t("detachDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
