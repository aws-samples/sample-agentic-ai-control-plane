"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { toast } from "sonner";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  BookOpen,
  FileCode,
  History,
  LibraryBig,
  Loader2,
  RefreshCw,
  Save,
  Settings,
  Trash2,
} from "lucide-react";
import MonacoEditor from "@monaco-editor/react";
// Self-host Monaco under the app CSP (no CDN) — see lib/monaco-setup.ts
import "@/lib/monaco-setup";
import {
  registerCedarLanguage,
  CEDAR_LANGUAGE_ID,
} from "@/lib/cedar-language";
import { $orpc } from "@/lib/api";
import {
  SYNC_STATUS_CLASSES,
  type EnginePolicy,
  type SyncStatus,
} from "../_components/constants";
import { SyncHistorySection } from "../_components/sync-history-section";

type SectionId = "overview" | "definition" | "sync-history" | "settings";

const SECTIONS: { id: SectionId; labelKey: string; icon: typeof BookOpen }[] = [
  { id: "overview", labelKey: "sidebar.overview", icon: BookOpen },
  { id: "definition", labelKey: "sidebar.definition", icon: FileCode },
  { id: "sync-history", labelKey: "sidebar.syncHistory", icon: History },
  { id: "settings", labelKey: "sidebar.settings", icon: Settings },
];

export default function EnginePolicyDetailPage() {
  const t = useTranslations("EnginePolicyDetail");
  const params = useParams();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const engineId = params.policyEngineId as string;
  const policyId = params.policyId as string;

  const [activeSection, setActiveSection] = useQueryState<SectionId>(
    "section",
    parseAsStringLiteral([
      "overview",
      "definition",
      "sync-history",
      "settings",
    ] as const)
      .withDefault("overview")
      .withOptions({ history: "push" }),
  );

  const [policy, setPolicy] = useState<EnginePolicy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchPolicy = useCallback(async () => {
    if (!engineId || !policyId) return;
    setIsLoading(true);
    try {
      const res = await $orpc.getEnginePolicy({ engineId, policyId });
      setPolicy({
        ...res.policy,
        createdAt: new Date(res.policy.createdAt),
        updatedAt: new Date(res.policy.updatedAt),
        lastSyncedAt: res.policy.lastSyncedAt
          ? new Date(res.policy.lastSyncedAt)
          : null,
      } as EnginePolicy);
      setNotFound(false);
    } catch (err) {
      const e = err as { code?: string; status?: number };
      if (e.code === "NOT_FOUND" || e.status === 404) setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [engineId, policyId]);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  const handleSyncNow = useCallback(async () => {
    if (!policy) return;
    setIsSyncing(true);
    try {
      await $orpc.syncPolicy({ enginePolicyId: policy.id });
      toast.success(t("syncSuccess"));
      await fetchPolicy();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("syncError"));
    } finally {
      setIsSyncing(false);
    }
  }, [policy, fetchPolicy, t]);

  if (isLoading && !policy) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (notFound || !policy) {
    return (
      <div className="flex-1 h-full overflow-hidden relative">
        <div className="flex h-full w-full flex-col items-center justify-center">
          <p className="text-muted-foreground">{t("notFound")}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push(`/dashboard/policies/${engineId}`)}
          >
            {t("back")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div className="flex h-full w-full flex-col">
        <div className="flex items-center border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => router.push(`/dashboard/policies/${engineId}`)}
              aria-label={t("back")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-semibold text-foreground text-balance">
                  {policy.name}
                </h1>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${SYNC_STATUS_CLASSES[policy.syncStatus as SyncStatus]}`}
                >
                  {t(`syncStatus.${policy.syncStatus}`)}
                </Badge>
                {policy.libraryPolicyId && (
                  <Link
                    href={`/dashboard/policy-library/${policy.libraryPolicyId}`}
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0 rounded-md border text-violet-600 border-violet-200 bg-violet-50 dark:text-violet-400 dark:border-violet-800 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors"
                  >
                    <LibraryBig className="size-2.5" />
                    {t("openLibrarySource")}
                  </Link>
                )}
              </div>
            </div>
          </div>
          <div className="ml-auto">
            <Button
              size="sm"
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="active:scale-[0.96]"
            >
              {isSyncing ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5 mr-1.5" />
              )}
              {t("syncNow")}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-44 shrink-0 border p-2 ml-4 my-4 rounded-lg">
            <nav className="flex flex-col gap-0.5">
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] leading-tight transition-[background-color,color] ${
                      isActive
                        ? "bg-foreground/6 text-foreground"
                        : "text-foreground/70 hover:bg-foreground/4 hover:text-foreground/90"
                    }`}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    {t(section.labelKey)}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-6 pt-4 space-y-4">
              {activeSection === "overview" && (
                <OverviewSection policy={policy} />
              )}
              {activeSection === "definition" && (
                <DefinitionSection
                  policy={policy}
                  onPolicyUpdated={fetchPolicy}
                  resolvedTheme={resolvedTheme}
                />
              )}
              {activeSection === "sync-history" && (
                <SyncHistorySection
                  engineId={engineId}
                  enginePolicyId={policy.id}
                />
              )}
              {activeSection === "settings" && (
                <SettingsSection
                  policy={policy}
                  engineId={engineId}
                  onPolicyUpdated={fetchPolicy}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewSection({ policy }: { policy: EnginePolicy }) {
  const t = useTranslations("EnginePolicyDetail.overview");

  function formatDateTime(d?: Date | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 md:grid-cols-3">
          <FieldRow label={t("type")}>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${
                policy.type === "permit"
                  ? "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30"
                  : "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30"
              }`}
            >
              {policy.type}
            </Badge>
          </FieldRow>
          <FieldRow label={t("syncStatus")}>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${SYNC_STATUS_CLASSES[policy.syncStatus as SyncStatus]}`}
            >
              {policy.syncStatus}
            </Badge>
          </FieldRow>
          <FieldRow label={t("lastSynced")}>
            <span className="text-xs tabular-nums">
              {formatDateTime(policy.lastSyncedAt)}
            </span>
          </FieldRow>
          <FieldRow label={t("created")}>
            <span className="text-xs tabular-nums">
              {formatDateTime(policy.createdAt)}
            </span>
          </FieldRow>
          <FieldRow label={t("updated")}>
            <span className="text-xs tabular-nums">
              {formatDateTime(policy.updatedAt)}
            </span>
          </FieldRow>
          {policy.awsPolicyId && (
            <FieldRow label={t("awsPolicyId")}>
              <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono tabular-nums">
                {policy.awsPolicyId}
              </code>
            </FieldRow>
          )}
          {policy.description && (
            <div className="col-span-2 md:col-span-3 space-y-1">
              <dt className="text-[11px] text-muted-foreground uppercase tracking-wider">
                {t("description")}
              </dt>
              <dd className="text-sm text-muted-foreground leading-relaxed text-pretty">
                {policy.description}
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] text-muted-foreground uppercase tracking-wider">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function DefinitionSection({
  policy,
  onPolicyUpdated,
  resolvedTheme,
}: {
  policy: EnginePolicy;
  onPolicyUpdated: () => void | Promise<void>;
  resolvedTheme: string | undefined;
}) {
  const t = useTranslations("EnginePolicyDetail.definition");
  const [cedarText, setCedarText] = useState(policy.cedarCode);
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = cedarText !== policy.cedarCode;

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await $orpc.updateEnginePolicy({ id: policy.id, cedarCode: cedarText });
      toast.success(t("saveSuccess"));
      await onPolicyUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  }, [policy.id, cedarText, onPolicyUpdated, t]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">{t("title")}</CardTitle>
        {isDirty && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="active:scale-[0.96]"
          >
            {isSaving ? (
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="size-3.5 mr-1.5" />
            )}
            {t("save")}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-hidden">
          <MonacoEditor
            height={Math.min(
              Math.max(cedarText.split("\n").length * 20 + 24, 160),
              500,
            )}
            defaultLanguage={CEDAR_LANGUAGE_ID}
            beforeMount={registerCedarLanguage}
            theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
            value={cedarText}
            onChange={(v) => setCedarText(v ?? "")}
            options={{
              fontSize: 13,
              fontFamily:
                "var(--font-mono, 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace)",
              minimap: { enabled: false },
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              padding: { top: 12, bottom: 12 },
              renderLineHighlight: "gutter",
              overviewRulerLanes: 0,
              automaticLayout: true,
            }}
            loading={
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsSection({
  policy,
  engineId,
  onPolicyUpdated,
}: {
  policy: EnginePolicy;
  engineId: string;
  onPolicyUpdated: () => void | Promise<void>;
}) {
  const t = useTranslations("EnginePolicyDetail.settings");
  const router = useRouter();
  const [name, setName] = useState(policy.name);
  const [description, setDescription] = useState(policy.description);
  const [isSaving, setIsSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isDirty =
    name !== policy.name || description !== policy.description;

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await $orpc.updateEnginePolicy({
        id: policy.id,
        name: name.trim(),
        description: description.trim(),
      });
      toast.success(t("saveSuccess"));
      await onPolicyUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setIsSaving(false);
    }
  }, [policy.id, name, description, onPolicyUpdated, t]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await $orpc.deleteEnginePolicy({ id: policy.id });
      toast.success(t("deleteSuccess"));
      router.push(`/dashboard/policies/${engineId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteError"));
      setIsDeleting(false);
    }
  }, [policy.id, engineId, router, t]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            {t("general")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel className="text-xs">{t("nameLabel")}</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
            />
          </Field>
          <Field>
            <FieldLabel className="text-xs">
              {t("descriptionLabel")}
            </FieldLabel>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="text-xs"
              maxLength={2048}
            />
          </Field>
          {isDirty && (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="active:scale-[0.96]"
              >
                {isSaving ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Save className="size-3.5 mr-1.5" />
                )}
                {t("save")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-red-200 dark:border-red-900/50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-red-600 dark:text-red-400 text-balance">
            {t("dangerZone")}
          </CardTitle>
          <CardDescription className="text-pretty">
            {t("dangerZoneDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("delete.title")}</p>
              <p className="text-xs text-muted-foreground text-pretty">
                {t("delete.description")}
              </p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDelete(true)}
              className="active:scale-[0.96]"
            >
              <Trash2 className="size-3.5 mr-1.5" />
              {t("delete.button")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-balance">
              {t("delete.dialogTitle", { name: policy.name })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              {t("delete.dialogDescription", { name: policy.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.96]"
            >
              {isDeleting && (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              )}
              {t("delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
