"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { SchemaEditorPanel } from "../../_components/schema-editor-panel";
import { TestMcpToolSheet } from "../../_components/test-mcp-tool-sheet";
import {
  ActivityLog,
  type RegistryActivityEvent,
} from "../../../_components/activity-log";
import {
  SKILL_MD_EXAMPLE,
  MCP_SERVER_PLACEHOLDER,
  MCP_TOOL_PLACEHOLDER,
  A2A_AGENT_CARD_PLACEHOLDER,
  CUSTOM_PLACEHOLDER,
  AGENT_SKILLS_DEFINITION_PLACEHOLDER,
} from "../../_components/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  Loader2,
  ArrowLeft,
  Pencil,
  MoreVertical,
  Trash2,
  SendHorizonal,
  CheckCircle2,
  XCircle,
  Archive,
  RefreshCw,
  Wrench,
  Link,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Play,
} from "lucide-react";
import { $orpc } from "@/lib/api";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

function prettifyNestedJSON(obj: any): any {
  if (typeof obj === "string") {
    try {
      const trimmed = obj.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        return prettifyNestedJSON(JSON.parse(obj));
      }
    } catch {}
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(prettifyNestedJSON);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, prettifyNestedJSON(v)])
    );
  }
  return obj;
}

// UI protocol values. The GA API uses `recordType` (AGENT|MCP|SKILL|CUSTOM);
// this page keeps the legacy protocol vocabulary internally and maps at the
// boundary (see recordTypeToProtocol / getRecordProtocol).
type Protocol = "MCP" | "A2A" | "CUSTOM" | "AGENT_SKILLS";

const recordTypeToProtocol = (recordType?: string): Protocol => {
  switch (recordType) {
    case "AGENT":
      return "A2A";
    case "SKILL":
      return "AGENT_SKILLS";
    case "CUSTOM":
      return "CUSTOM";
    default:
      return "MCP";
  }
};

const protocolToRecordType = (
  protocol: Protocol,
): "MCP" | "AGENT" | "SKILL" | "CUSTOM" => {
  switch (protocol) {
    case "A2A":
      return "AGENT";
    case "AGENT_SKILLS":
      return "SKILL";
    case "CUSTOM":
      return "CUSTOM";
    default:
      return "MCP";
  }
};

// Reads the protocol for a record from its GA recordType.
const getRecordProtocol = (record: any): Protocol =>
  recordTypeToProtocol(record?.recordType);

// GA flat descriptors: `data` (was inlineContent), `dataSchemaVersion` (was
// schemaVersion/protocolVersion), and per-descriptor `source` for URL sync.
function getDescriptorContent(record: any, protocol: Protocol) {
  if (protocol === "MCP") {
    return {
      serverSchema: record.descriptors?.mcpServer?.data || "",
      serverSchemaVersion:
        record.descriptors?.mcpServer?.dataSchemaVersion || "2025-12-11",
      toolSchema: record.descriptors?.mcpServer?.additionalData?.tools?.data || "",
      toolSchemaVersion:
        record.descriptors?.mcpServer?.additionalData?.tools?.dataSchemaVersion ||
        "2025-11-25",
    };
  }
  if (protocol === "AGENT_SKILLS") {
    return {
      skillMd:
        record.descriptors?.agentSkillsDefinition?.additionalData?.skillMd?.data ||
        "",
      skillDefinition: record.descriptors?.agentSkillsDefinition?.data || "",
    };
  }
  if (protocol === "CUSTOM") {
    return {
      customSchema: record.descriptors?.custom?.data || "",
    };
  }
  return {
    agentCard: record.descriptors?.a2aAgentCard?.data || "",
    agentCardVersion:
      record.descriptors?.a2aAgentCard?.dataSchemaVersion || "0.3.0",
  };
}

function prettifyJsonString(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export default function RecordDetailPage() {
  const t = useTranslations("RecordDetailPage");
  const params = useParams();
  const router = useRouter();
  const registryId = params.registryId as string;
  const recordId = params.recordId as string;

  const [record, setRecord] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Details | Activity tab + the record-scoped activity timeline.
  const [activeTab, setActiveTab] = useState<"details" | "activity">("details");
  const [activityEvents, setActivityEvents] = useState<RegistryActivityEvent[]>(
    [],
  );

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStatusChanging, setIsStatusChanging] = useState(false);
  // Pending status transition awaiting an optional reason in the confirm dialog.
  const [pendingStatus, setPendingStatus] = useState<
    "APPROVED" | "REJECTED" | "DEPRECATED" | null
  >(null);
  const [statusReasonInput, setStatusReasonInput] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editProtocol, setEditProtocol] = useState<Protocol>("MCP");
  const [editVersion, setEditVersion] = useState("");
  const [editServerSchema, setEditServerSchema] = useState("");
  const [editToolSchema, setEditToolSchema] = useState("");
  const [editAgentCard, setEditAgentCard] = useState("");
  const [editCustomSchema, setEditCustomSchema] = useState("");
  const [editSkillMd, setEditSkillMd] = useState("");
  const [editSkillDefinition, setEditSkillDefinition] = useState("");

  const fetchRecordDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await $orpc.getRegistryRecord({ registryId, recordId });
      setRecord(response.registryRecord);
    } catch (err: any) {
      setError(err.message || t("error.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [registryId, recordId, t]);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await $orpc.listRegistryActivity({ registryId, recordId });
      setActivityEvents(res.events as RegistryActivityEvent[]);
    } catch {
      // Activity is a secondary panel — don't surface a blocking error if it
      // fails to load; the primary record view stays usable.
    }
  }, [registryId, recordId]);

  useEffect(() => {
    if (registryId && recordId) {
      fetchRecordDetail();
      fetchActivity();
    }
  }, [fetchRecordDetail, fetchActivity, registryId, recordId]);

  const enterEditMode = useCallback(() => {
    if (!record) return;
    const protocol = getRecordProtocol(record);
    setEditName(record.name || "");
    setEditDescription(record.description || "");
    setEditProtocol(protocol);
    setEditVersion(record.recordVersion || "");

    const desc = getDescriptorContent(record, protocol);
    if (protocol === "MCP") {
      const mcp = desc as {
        serverSchema: string;
        toolSchema: string;
      };
      setEditServerSchema(prettifyJsonString(mcp.serverSchema));
      setEditToolSchema(prettifyJsonString(mcp.toolSchema));
    } else if (protocol === "AGENT_SKILLS") {
      const skills = desc as { skillMd: string; skillDefinition: string };
      setEditSkillMd(skills.skillMd);
      setEditSkillDefinition(prettifyJsonString(skills.skillDefinition));
    } else if (protocol === "CUSTOM") {
      const custom = desc as { customSchema: string };
      setEditCustomSchema(prettifyJsonString(custom.customSchema));
    } else {
      const a2a = desc as { agentCard: string };
      setEditAgentCard(prettifyJsonString(a2a.agentCard));
    }

    setIsEditing(true);
  }, [record]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);

    try {
      const currentProtocol = getRecordProtocol(record);
      let descriptors: any;
      if (editProtocol === "MCP") {
        if (editServerSchema.trim()) {
          JSON.parse(editServerSchema);
        }
        if (editToolSchema.trim()) {
          JSON.parse(editToolSchema);
        }
        const desc = getDescriptorContent(record, currentProtocol);
        const mcp = desc as {
          serverSchemaVersion: string;
          toolSchemaVersion: string;
        };
        descriptors = {
          mcpServer: {
            data: editServerSchema.trim(),
            dataSchemaVersion: mcp.serverSchemaVersion,
            ...(editToolSchema.trim() && {
              additionalData: {
                tools: {
                  data: editToolSchema.trim(),
                  dataSchemaVersion: mcp.toolSchemaVersion,
                },
              },
            }),
          },
        };
      } else if (editProtocol === "AGENT_SKILLS") {
        if (editSkillDefinition.trim()) {
          JSON.parse(editSkillDefinition);
        }
        descriptors = {
          agentSkillsDefinition: {
            data: editSkillDefinition.trim(),
            additionalData: { skillMd: { data: editSkillMd.trim() } },
          },
        };
      } else if (editProtocol === "CUSTOM") {
        if (editCustomSchema.trim()) {
          JSON.parse(editCustomSchema);
        }
        descriptors = {
          custom: { data: editCustomSchema.trim() },
        };
      } else {
        if (editAgentCard.trim()) {
          JSON.parse(editAgentCard);
        }
        const desc = getDescriptorContent(record, currentProtocol);
        const a2a = desc as { agentCardVersion: string };
        descriptors = {
          a2aAgentCard: {
            data: editAgentCard.trim(),
            dataSchemaVersion: a2a.agentCardVersion,
          },
        };
      }

      const updatePayload: Record<string, any> = {
        registryId,
        recordId,
      };

      if (editName.trim() !== (record.name || ""))
        updatePayload.name = editName.trim();
      if (editDescription.trim() !== (record.description || ""))
        updatePayload.description = editDescription.trim() || undefined;
      if (editVersion !== (record.recordVersion || ""))
        updatePayload.recordVersion = editVersion || undefined;

      if (descriptors) {
        updatePayload.descriptors = descriptors;
      }

      await $orpc.updateRegistryRecord(updatePayload as any);

      toast.success(t("toast.updateSuccess"));
      setIsEditing(false);
      await fetchRecordDetail();
      await fetchActivity();
    } catch (err: any) {
      const msg = err.message || t("toast.updateError");
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  }, [
    editName,
    editDescription,
    editProtocol,
    editVersion,
    editServerSchema,
    editToolSchema,
    editAgentCard,
    editCustomSchema,
    editSkillMd,
    editSkillDefinition,
    registryId,
    recordId,
    record,
    fetchRecordDetail,
    t,
  ]);

  const handleSubmitForApproval = useCallback(async () => {
    setIsStatusChanging(true);
    try {
      await $orpc.submitRegistryRecord({ registryId, recordId });
      toast.success(t("toast.submitSuccess"));
      await fetchRecordDetail();
      await fetchActivity();
    } catch (err: any) {
      toast.error(err.message || t("toast.statusError"));
    } finally {
      setIsStatusChanging(false);
    }
  }, [registryId, recordId, fetchRecordDetail, t]);

  const handleStatusChange = useCallback(
    async (
      status: "APPROVED" | "REJECTED" | "DEPRECATED",
      statusReason?: string,
    ) => {
      setIsStatusChanging(true);
      try {
        await $orpc.updateRegistryRecordStatus({
          registryId,
          recordId,
          status,
          ...(statusReason?.trim() ? { statusReason: statusReason.trim() } : {}),
        });
        toast.success(t("toast.statusSuccess"));
        await fetchRecordDetail();
      await fetchActivity();
      } catch (err: any) {
        toast.error(err.message || t("toast.statusError"));
      } finally {
        setIsStatusChanging(false);
      }
    },
    [registryId, recordId, fetchRecordDetail, t],
  );

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await $orpc.deleteRegistryRecord({ registryId, recordId });
      toast.success(t("toast.deleteSuccess"));
      router.push(`/dashboard/registry/${registryId}`);
    } catch (err: any) {
      toast.error(err.message || t("toast.deleteError"));
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }, [registryId, recordId, router, t]);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await $orpc.updateRegistryRecord({
        registryId,
        recordId,
        triggerSynchronization: true,
      } as any);
      toast.success(t("editView.syncTriggered"));
      // Poll until status transitions out of UPDATING
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const response = await $orpc.getRegistryRecord({ registryId, recordId });
          setRecord(response.registryRecord);
          if (response.registryRecord?.status !== "UPDATING" && response.registryRecord?.status !== "CREATING") break;
        } catch { break; }
      }
    } catch (err: any) {
      toast.error(err.message || t("editView.syncFailed"));
    } finally {
      setIsSyncing(false);
    }
  }, [registryId, recordId]);

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div className="flex h-full w-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => router.push(`/dashboard/registry/${registryId}`)}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-sm font-semibold text-foreground">
                {t("title")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {t("description")}
              </p>
            </div>
          </div>
          {record && !isLoading && (
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cancelEdit}
                    disabled={isSaving}
                  >
                    {t("cancel")}
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={isSaving}>
                    {isSaving && (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    )}
                    {isSaving ? t("saving") : t("save")}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={enterEditMode}>
                    <Pencil />
                    {t("edit")}
                  </Button>
                  {(record.descriptors?.mcpServer?.source?.fromUrl?.url ||
                    record.descriptors?.a2aAgentCard?.source?.fromUrl?.url) && (
                    <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing}>
                      {isSyncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      {t("readView.sections.syncButton")}
                    </Button>
                  )}
                  {(record.status === "DRAFT" ||
                    record.status === "PENDING_APPROVAL" ||
                    record.status === "APPROVED") && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={buttonVariants({ variant: "default", size: "sm" })}
                        disabled={isStatusChanging}
                      >
                        {isStatusChanging ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <>
                            {t("actions.updateStatus")}
                            <ChevronDown className="ml-1 size-3.5" />
                          </>
                        )}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {record.status === "DRAFT" && (
                          <DropdownMenuItem onClick={handleSubmitForApproval}>
                            <SendHorizonal className="mr-2 size-4" />
                            {t("actions.submitForApproval")}
                          </DropdownMenuItem>
                        )}
                        {record.status === "PENDING_APPROVAL" && (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                setStatusReasonInput("");
                                setPendingStatus("APPROVED");
                              }}
                            >
                              <CheckCircle2 className="mr-2 size-4 text-green-600" />
                              {t("actions.approve")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setStatusReasonInput("");
                                setPendingStatus("REJECTED");
                              }}
                            >
                              <XCircle className="mr-2 size-4 text-orange-600" />
                              {t("actions.reject")}
                            </DropdownMenuItem>
                          </>
                        )}
                        {record.status === "APPROVED" && (
                          <DropdownMenuItem
                            onClick={() => {
                              setStatusReasonInput("");
                              setPendingStatus("DEPRECATED");
                            }}
                          >
                            <Archive className="mr-2 size-4" />
                            {t("actions.deprecate")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={buttonVariants({ variant: "outline", size: "icon-sm" })}
                      disabled={isDeleting}
                    >
                      <MoreVertical />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 className="mr-2 size-4" />
                        {t("actions.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error && !record ? (
            <div className="m-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-xs text-destructive">
              {error}
            </div>
          ) : record ? (
            <div className="flex-1 overflow-y-auto p-6 w-full space-y-6">
              {error && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-xs text-destructive">
                  {error}
                </div>
              )}

              {isEditing ? (
                <EditView
                  t={t}
                  editName={editName}
                  setEditName={setEditName}
                  editDescription={editDescription}
                  setEditDescription={setEditDescription}
                  editProtocol={editProtocol}
                  editVersion={editVersion}
                  setEditVersion={setEditVersion}
                  editServerSchema={editServerSchema}
                  setEditServerSchema={setEditServerSchema}
                  editToolSchema={editToolSchema}
                  setEditToolSchema={setEditToolSchema}
                  editAgentCard={editAgentCard}
                  setEditAgentCard={setEditAgentCard}
                  editCustomSchema={editCustomSchema}
                  setEditCustomSchema={setEditCustomSchema}
                  editSkillMd={editSkillMd}
                  setEditSkillMd={setEditSkillMd}
                  editSkillDefinition={editSkillDefinition}
                  setEditSkillDefinition={setEditSkillDefinition}
                  isSaving={isSaving}
                />
              ) : (
                <>
                  <div className="flex items-center gap-1 border-b">
                    {(["details", "activity"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                          activeTab === tab
                            ? "border-primary text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab === "details" ? "Details" : `Activity (${activityEvents.length})`}
                      </button>
                    ))}
                  </div>
                  {activeTab === "details" ? (
                    <ReadView t={t} record={record} />
                  ) : (
                    <ActivityLog events={activityEvents} />
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Status-change confirm dialog with an optional reason. The reason is
          recorded on the activity timeline (see updateRegistryRecordStatus). */}
      <AlertDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => {
          if (!open && !isStatusChanging) setPendingStatus(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatus === "APPROVED"
                ? t("actions.approve")
                : pendingStatus === "REJECTED"
                  ? t("actions.reject")
                  : t("actions.deprecate")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {`Optionally record why this record is being ${
                pendingStatus === "APPROVED"
                  ? "approved"
                  : pendingStatus === "REJECTED"
                    ? "rejected"
                    : "deprecated"
              }. The reason is saved to the activity log.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5 py-1">
            <Label htmlFor="status-reason" className="text-xs font-medium">
              Reason <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="status-reason"
              value={statusReasonInput}
              onChange={(e) => setStatusReasonInput(e.target.value)}
              disabled={isStatusChanging}
              rows={3}
              placeholder={
                pendingStatus === "APPROVED"
                  ? "e.g. schema validated, endpoint reachable"
                  : pendingStatus === "REJECTED"
                    ? "e.g. schema is missing a required field"
                    : "e.g. superseded by a newer version"
              }
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isStatusChanging}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={pendingStatus === "REJECTED" ? "destructive" : "default"}
              disabled={isStatusChanging}
              onClick={async () => {
                if (!pendingStatus) return;
                const status = pendingStatus;
                const reason = statusReasonInput;
                setPendingStatus(null);
                await handleStatusChange(status, reason);
              }}
            >
              {isStatusChanging && (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              )}
              {t("actions.updateStatus")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialog.description", { name: record?.name || recordId })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              {isDeleting ? t("deleteDialog.deleting") : t("deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReadView({ t, record }: { t: any; record: any }) {
  const tStatus = useTranslations("RecordsList.statusLabels");
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const toggleTool = (name: string) => setExpandedTools(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  const [testingTool, setTestingTool] = useState<{
    name: string;
    description?: string;
    inputSchema?: any;
  } | null>(null);

  const protocol = getRecordProtocol(record);

  // URL-sync source now lives on the primary descriptor.
  const sourceFromUrl =
    record.descriptors?.mcpServer?.source?.fromUrl ??
    record.descriptors?.a2aAgentCard?.source?.fromUrl;
  const creds = sourceFromUrl?.credentialProviderConfigurations?.[0];
  const defaultAuth: { type: "none" | "sigv4" | "jwt"; bearerToken?: string } =
    creds?.credentialProviderType === "IAM"
      ? { type: "sigv4" }
      : creds?.credentialProviderType === "OAUTH"
        ? { type: "jwt", bearerToken: "" }
        : { type: "none" };

  // Parse descriptors (GA: descriptors.mcpServer.data, .a2aAgentCard.data, ...)
  let serverInfo: any = null;
  let tools: Array<{ name: string; description: string; inputSchema?: any }> = [];
  let a2aCard: any = null;
  let endpoint: string | null = sourceFromUrl?.url || null;

  if (protocol === "MCP" && record.descriptors?.mcpServer) {
    try {
      const raw = record.descriptors.mcpServer.data;
      serverInfo = typeof raw === "string" ? JSON.parse(raw) : raw;
      endpoint = endpoint || serverInfo?.remotes?.[0]?.url || null;
    } catch {}
    try {
      const raw = record.descriptors.mcpServer.additionalData?.tools?.data;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      tools = parsed?.tools || [];
    } catch {}
  }
  if (protocol === "A2A" && record.descriptors?.a2aAgentCard) {
    try {
      const raw = record.descriptors.a2aAgentCard.data;
      a2aCard = typeof raw === "string" ? JSON.parse(raw) : raw;
      endpoint = endpoint || a2aCard?.url || null;
    } catch {}
  }

  // capabilities can be a string array ["payment_processing", ...] or an object with skills
  const capabilities: string[] = Array.isArray(a2aCard?.capabilities)
    ? a2aCard.capabilities.filter((c: any) => typeof c === "string")
    : [];
  const skills = a2aCard?.skills || (typeof a2aCard?.capabilities === "object" && !Array.isArray(a2aCard?.capabilities) ? a2aCard.capabilities.skills : []) || [];

  const STATUS_TONE: Record<string, string> = {
    DRAFT: "text-muted-foreground",
    PENDING_APPROVAL: "text-amber-600 dark:text-amber-400",
    APPROVED: "text-emerald-600 dark:text-emerald-400",
    REJECTED: "text-red-600 dark:text-red-400",
    DEPRECATED: "text-muted-foreground",
    CREATING: "text-blue-600 dark:text-blue-400",
    UPDATING: "text-blue-600 dark:text-blue-400",
    CREATE_FAILED: "text-red-600 dark:text-red-400",
    UPDATE_FAILED: "text-red-600 dark:text-red-400",
  };

  const STATUS_DOT: Record<string, string> = {
    DRAFT: "bg-muted-foreground/50",
    PENDING_APPROVAL: "bg-amber-500",
    APPROVED: "bg-emerald-500",
    REJECTED: "bg-red-500",
    DEPRECATED: "bg-muted-foreground/50",
    CREATING: "bg-blue-500",
    UPDATING: "bg-blue-500",
    CREATE_FAILED: "bg-red-500",
    UPDATE_FAILED: "bg-red-500",
  };

  const TYPE_LABEL: Record<string, string> = {
    MCP: "MCP",
    A2A: "Agent",
    AGENT_SKILLS: "Agent skills",
    CUSTOM: "Custom",
  };

  const formatDateTime = (value: string | Date | undefined) => {
    if (!value) return "—";
    const d = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("readView.sections.copied", { label }));
    } catch {
      toast.error(t("readView.sections.copyFailed"));
    }
  };

  const statusLabel = tStatus(record.status);
  const statusTone = STATUS_TONE[record.status] ?? "text-foreground";
  const statusDot = STATUS_DOT[record.status] ?? "bg-muted-foreground/50";
  const typeLabel = TYPE_LABEL[protocol] ?? protocol;

  return (
    <>
    <div className="space-y-6">
      {/* Hero header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex items-center gap-3">
          <h2 className="text-xl font-semibold truncate">{record.name}</h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs ${statusTone}`}
          >
            <span className={`size-1.5 rounded-full ${statusDot}`} />
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Failure reason banner */}
      {(record.status === "CREATE_FAILED" || record.status === "UPDATE_FAILED") && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-md bg-destructive/15 flex items-center justify-center shrink-0">
              <XCircle className="size-4 text-destructive" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="text-sm font-semibold text-destructive">
                {record.status === "CREATE_FAILED" ? t("readView.failure.createTitle") : t("readView.failure.updateTitle")}
              </h3>
              <p className="text-xs text-destructive/90 leading-relaxed whitespace-pre-wrap break-words">
                {record.statusReason || t("readView.failure.defaultReason")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Record details container */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
          <h3 className="text-sm font-semibold">{t("readView.recordDetails")}</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 p-5">
          <DetailField label={t("readView.fields.name")} value={record.name} />
          <DetailField
            label={t("readView.fields.description")}
            value={record.description || "—"}
            muted={!record.description}
          />
          <DetailField
            label={t("readView.fields.recordId")}
            value={record.recordId || "—"}
            mono
            copy={record.recordId ? () => copyValue(record.recordId, t("readView.fields.recordId")) : undefined}
          />

          <div className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">{t("readView.fields.status")}</div>
            <div className={`inline-flex items-center gap-1.5 text-xs ${statusTone}`}>
              <span className={`size-1.5 rounded-full ${statusDot}`} />
              {statusLabel}
            </div>
          </div>
          <DetailField label={t("readView.fields.version")} value={record.recordVersion || "—"} />
          <DetailField
            label={t("readView.fields.lastUpdated")}
            value={formatDateTime(record.updatedAt)}
          />

          <DetailField label={t("readView.fields.recordType")} value={typeLabel} />
          <DetailField
            label={t("readView.fields.created")}
            value={formatDateTime(record.createdAt)}
          />
        </div>
      </div>

      {/* Endpoint */}
      {endpoint && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Link className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{protocol === "A2A" ? t("readView.sections.agentEndpoint") : t("readView.sections.mcpEndpoint")}</span>
          </div>
          <div className="rounded-md bg-muted px-4 py-2.5">
            <code className="text-sm font-mono break-all">{endpoint}</code>
          </div>
        </div>
      )}

      {/* MCP: Server + Tools */}
      {protocol === "MCP" && (
        <div className="space-y-6">
          {/* Server info card */}
          {serverInfo && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="text-sm font-medium">{t("readView.sections.serverInformation")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">{t("readView.sections.serverName")}</span>
                  <p className="font-mono text-xs mt-0.5 break-all">{serverInfo.name || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("readView.sections.version")}</span>
                  <p className="mt-0.5">{serverInfo.version || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t("readView.sections.transport")}</span>
                  <p className="mt-0.5">{serverInfo.remotes?.[0]?.type || "—"}</p>
                </div>
              </div>
            </div>
          )}

          {/* Tools */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">{t("readView.sections.tools")}</h3>
              <Badge variant="secondary" className="text-[10px]">{tools.length}</Badge>
            </div>
            {tools.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <Wrench className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t("readView.sections.noToolsDefined")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tools.map((tool) => {
                  const isExpanded = expandedTools.has(tool.name);
                  return (
                    <div key={tool.name} className="rounded-lg border bg-card overflow-hidden">
                      <div className="flex items-center gap-2 p-3 pr-3">
                        <button
                          type="button"
                          className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-md hover:bg-muted/50 transition-colors -mx-1 px-1 py-1"
                          onClick={() => toggleTool(tool.name)}
                          aria-expanded={isExpanded}
                        >
                          <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                            <Wrench className="size-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium font-mono truncate">{tool.name}</p>
                            {tool.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tool.description.split("\n")[0]}</p>
                            )}
                          </div>
                        </button>
                        {endpoint && (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTestingTool(tool);
                            }}
                            className="shrink-0"
                          >
                            <Play className="mr-1.5 size-3.5" />
                            {t("testTool.trigger")}
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleTool(tool.name)}
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                          className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors shrink-0"
                        >
                          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="border-t px-4 py-4 space-y-4 bg-muted/30">
                          {tool.description && (
                            <div>
                              <h4 className="text-xs font-medium mb-1.5">{t("readView.sections.descriptionLabel")}</h4>
                              <div className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto break-words">{tool.description}</div>
                            </div>
                          )}
                          {tool.inputSchema && Object.keys(tool.inputSchema.properties || {}).length > 0 && (
                            <div>
                              <h4 className="text-xs font-medium mb-1.5">{t("readView.sections.parameters")}</h4>
                              <div className="space-y-1.5">
                                {Object.entries(tool.inputSchema.properties || {}).map(([key, val]: [string, any]) => (
                                  <div key={key} className="flex items-start gap-2 text-xs">
                                    <code className="font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{key}</code>
                                    <span className="text-muted-foreground">{val.type}</span>
                                    {(tool.inputSchema.required || []).includes(key) && <Badge variant="outline" className="text-[9px] px-1 py-0">required</Badge>}
                                    {val.description && <span className="text-muted-foreground truncate">— {val.description.split("\n")[0]}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* A2A: Agent capabilities */}
      {protocol === "A2A" && a2aCard && (
        <div className="space-y-6">
          {/* Agent info */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="text-sm font-medium">{t("readView.sections.agentInformation")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {a2aCard.name && (
                <div><span className="text-xs text-muted-foreground">{t("readView.sections.agentName")}</span><p className="mt-0.5 font-medium">{a2aCard.name}</p></div>
              )}
              {(a2aCard.version || a2aCard.protocolVersion) && (
                <div><span className="text-xs text-muted-foreground">{t("readView.sections.protocolVersion")}</span><p className="mt-0.5">{a2aCard.protocolVersion || a2aCard.version}</p></div>
              )}
              {a2aCard.description && (
                <div className="sm:col-span-2"><span className="text-xs text-muted-foreground">{t("readView.sections.descriptionLabel")}</span><p className="mt-0.5 text-sm">{a2aCard.description}</p></div>
              )}
            </div>
          </div>

          {/* Capabilities (string array) */}
          {capabilities.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Wrench className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">{t("readView.sections.capabilities")}</h3>
                <Badge variant="secondary" className="text-[10px]">{capabilities.length}</Badge>
              </div>
              <div className="space-y-2">
                {capabilities.map((cap: string) => (
                  <div key={cap} className="rounded-lg border bg-card overflow-hidden">
                    <div className="flex items-center gap-3 p-4">
                      <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Wrench className="size-4 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">{cap.replace(/_/g, " ")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skills (object array, if present) */}
          {skills.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Wrench className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">{t("readView.sections.skills")}</h3>
                <Badge variant="secondary" className="text-[10px]">{skills.length}</Badge>
              </div>
              <div className="space-y-2">
                {skills.map((skill: any, i: number) => (
                  <div key={i} className="rounded-lg border bg-card overflow-hidden">
                    <div className="flex items-center gap-3 p-4">
                      <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Wrench className="size-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{skill.name || skill.id || `Skill ${i + 1}`}</p>
                        {skill.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{skill.description}</p>}
                      </div>
                      {skill.tags && skill.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap shrink-0">
                          {skill.tags.map((tag: string) => <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {capabilities.length === 0 && skills.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">{t("readView.sections.noCapabilities")}</p>
            </div>
          )}
        </div>
      )}

      {/* AGENT_SKILLS: Skill MD + Skill Definition */}
      {protocol === "AGENT_SKILLS" && (() => {
        const skillMdRaw = record.descriptors?.agentSkillsDefinition?.additionalData?.skillMd?.data || "";
        const skillDefRaw = record.descriptors?.agentSkillsDefinition?.data || "";
        let skillDef: any = null;
        try { skillDef = typeof skillDefRaw === "string" ? JSON.parse(skillDefRaw) : skillDefRaw; } catch {}
        return (
          <div className="space-y-6">
            {/* Skill Definition info card */}
            {skillDef && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <h3 className="text-sm font-medium">{t("readView.sections.skillDefinition")}</h3>
                {skillDef.repository && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">{t("readView.sections.repository")}</span>
                      <p className="font-mono text-xs mt-0.5 break-all">{skillDef.repository.url || "—"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">{t("readView.sections.source")}</span>
                      <p className="mt-0.5">{skillDef.repository.source || "—"}</p>
                    </div>
                  </div>
                )}
                {skillDef.packages && skillDef.packages.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">{t("readView.sections.packages")}</span>
                    <div className="mt-1.5 space-y-1">
                      {skillDef.packages.map((pkg: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="text-[10px]">{pkg.registryType}</Badge>
                          <code className="font-mono">{pkg.identifier}</code>
                          {pkg.version && <span className="text-muted-foreground">v{pkg.version}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!skillDef.repository && !skillDef.packages && (
                  <div className="max-h-[350px] overflow-auto rounded-lg border bg-muted">
                    <pre className="text-xs p-4 whitespace-pre-wrap break-all">{JSON.stringify(prettifyNestedJSON(skillDef), null, 2)}</pre>
                  </div>
                )}
              </div>
            )}

            {/* Skill Markdown */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="text-sm font-medium">{t("readView.sections.skillMarkdown")}</h3>
              {skillMdRaw ? (
                <div className="max-h-[500px] overflow-auto rounded-lg border bg-muted">
                  <pre className="text-xs p-4 whitespace-pre-wrap break-words leading-relaxed">{skillMdRaw}</pre>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("readView.sections.noSkillMarkdown")}</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* CUSTOM: Raw descriptor */}
      {protocol === "CUSTOM" && (() => {
        const customRaw = record.descriptors?.custom?.data || "";
        let customParsed: any = null;
        try { customParsed = typeof customRaw === "string" ? JSON.parse(customRaw) : customRaw; } catch {}
        return (
          <div className="space-y-6">
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="text-sm font-medium">{t("readView.sections.customDescriptor")}</h3>
              {customParsed ? (
                <>
                  {customParsed.name && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                      {customParsed.name && (
                        <div><span className="text-xs text-muted-foreground">{t("readView.sections.name")}</span><p className="mt-0.5 font-medium">{customParsed.name}</p></div>
                      )}
                      {customParsed.version && (
                        <div><span className="text-xs text-muted-foreground">{t("readView.sections.version")}</span><p className="mt-0.5">{customParsed.version}</p></div>
                      )}
                      {customParsed.endpoint && (
                        <div><span className="text-xs text-muted-foreground">{t("readView.sections.endpoint")}</span><p className="font-mono text-xs mt-0.5 break-all">{customParsed.endpoint}</p></div>
                      )}
                    </div>
                  )}
                  <div className="max-h-[400px] overflow-auto rounded-lg border bg-muted">
                    <pre className="text-xs p-4 whitespace-pre-wrap break-all">{JSON.stringify(prettifyNestedJSON(customParsed), null, 2)}</pre>
                  </div>
                </>
              ) : customRaw ? (
                <div className="max-h-[400px] overflow-auto rounded-lg border bg-muted">
                  <pre className="text-xs p-4 whitespace-pre-wrap break-all">{customRaw}</pre>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("readView.sections.noCustomDescriptor")}</p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
    <TestMcpToolSheet
      open={!!testingTool}
      onOpenChange={(o) => {
        if (!o) setTestingTool(null);
      }}
      endpoint={endpoint ?? ""}
      tool={testingTool}
      defaultAuth={defaultAuth}
    />
    </>
  );
}

function DetailField({
  label,
  value,
  mono,
  muted,
  copy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
  copy?: () => void;
}) {
  return (
    <div className="space-y-1 min-w-0">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="flex items-start gap-1.5">
        <div
          className={`text-xs break-all min-w-0 ${mono ? "font-mono" : ""} ${muted ? "text-muted-foreground" : "text-foreground"}`}
        >
          {value}
        </div>
        {copy && (
          <button
            type="button"
            onClick={copy}
            aria-label={`Copy ${label}`}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
          >
            <Copy className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function EditView({
  t,
  editName,
  setEditName,
  editDescription,
  setEditDescription,
  editProtocol,
  editVersion,
  setEditVersion,
  editServerSchema,
  setEditServerSchema,
  editToolSchema,
  setEditToolSchema,
  editAgentCard,
  setEditAgentCard,
  editCustomSchema,
  setEditCustomSchema,
  editSkillMd,
  setEditSkillMd,
  editSkillDefinition,
  setEditSkillDefinition,
  isSaving,
}: {
  t: any;
  editName: string;
  setEditName: (v: string) => void;
  editDescription: string;
  setEditDescription: (v: string) => void;
  editProtocol: Protocol;
  editVersion: string;
  setEditVersion: (v: string) => void;
  editServerSchema: string;
  setEditServerSchema: (v: string) => void;
  editToolSchema: string;
  setEditToolSchema: (v: string) => void;
  editAgentCard: string;
  setEditAgentCard: (v: string) => void;
  editCustomSchema: string;
  setEditCustomSchema: (v: string) => void;
  editSkillMd: string;
  setEditSkillMd: (v: string) => void;
  editSkillDefinition: string;
  setEditSkillDefinition: (v: string) => void;
  isSaving: boolean;
}) {
  const [showServerSchema, setShowServerSchema] = useState(true);
  const [showToolSchema, setShowToolSchema] = useState(true);
  const [showAgentCardSchema, setShowAgentCardSchema] = useState(true);
  const [showSkillDefSchema, setShowSkillDefSchema] = useState(true);
  const [addToolDefinition, setAddToolDefinition] = useState(
    () => !!editToolSchema.trim(),
  );
  const [includeSkillDoc, setIncludeSkillDoc] = useState(
    () => !!editSkillMd.trim(),
  );
  const [includeSkillDef, setIncludeSkillDef] = useState(
    () => !!editSkillDefinition.trim(),
  );

  const TYPE_LABEL: Record<Protocol, string> = {
    MCP: "MCP",
    A2A: "Agent",
    AGENT_SKILLS: "Agent skills",
    CUSTOM: "Custom",
  };

  return (
    <div className="space-y-6">
      {/* Basic info */}
      <Card className="pt-0">
        <CardHeader className="border-b bg-muted/40 py-3">
          <CardTitle className="text-sm font-semibold text-foreground">
            {t("basicInfo")}
          </CardTitle>
          <CardDescription>
            {t("editView.basicInfo.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-name" className="text-xs font-medium">
                {t("nameLabel")}
              </Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={isSaving}
              />
              <p className="text-[10px] text-muted-foreground">
                {t("editView.basicInfo.nameHint")}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-description" className="text-xs font-medium">
                {t("descriptionEditLabel")}
              </Label>
              <Input
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                disabled={isSaving}
              />
              <p className="text-[10px] text-muted-foreground">
                {t("editView.basicInfo.descriptionHint")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-version" className="text-xs font-medium">
                {t("versionLabel")}
              </Label>
              <Input
                id="edit-version"
                value={editVersion}
                onChange={(e) => setEditVersion(e.target.value)}
                disabled={isSaving}
              />
              <p className="text-[10px] text-muted-foreground">
                {t("editView.basicInfo.versionHint")}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">{t("protocolLabel")}</span>
              <div>
                <Badge variant="secondary" className="font-normal">
                  {TYPE_LABEL[editProtocol] ?? editProtocol}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {t("editView.basicInfo.typeFixedHint")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MCP */}
      {editProtocol === "MCP" && (
        <Card className="pt-0">
          <CardHeader className="border-b bg-muted/40 py-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              {t("editView.mcp.title")}
            </CardTitle>
            <CardDescription>
              {t("editView.mcp.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-5">
            <SchemaEditorPanel
              id="edit-server-schema"
              label={t("editView.mcp.serverLabel")}
              required
              value={editServerSchema}
              onChange={setEditServerSchema}
              disabled={isSaving}
              schemaKey="mcp-server"
              showSchema={showServerSchema}
              onShowSchemaChange={setShowServerSchema}
              placeholder={MCP_SERVER_PLACEHOLDER}
            />

            <div className="flex items-start gap-2 pt-2 border-t">
              <Checkbox
                id="edit-add-tool-def"
                checked={addToolDefinition}
                onCheckedChange={(v) => {
                  const next = Boolean(v);
                  setAddToolDefinition(next);
                  if (!next) setEditToolSchema("");
                }}
                disabled={isSaving}
                className="mt-0.5"
              />
              <label htmlFor="edit-add-tool-def" className="cursor-pointer">
                <div className="text-xs font-medium">{t("editView.mcp.addToolTitle")}</div>
                <p className="text-[11px] text-muted-foreground">
                  {t("editView.mcp.addToolDescription")}
                </p>
              </label>
            </div>

            {addToolDefinition && (
              <SchemaEditorPanel
                id="edit-tool-schema"
                label={t("editView.mcp.toolLabel")}
                value={editToolSchema}
                onChange={setEditToolSchema}
                disabled={isSaving}
                schemaKey="mcp-tool"
                showSchema={showToolSchema}
                onShowSchemaChange={setShowToolSchema}
                placeholder={MCP_TOOL_PLACEHOLDER}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* A2A */}
      {editProtocol === "A2A" && (
        <Card className="pt-0">
          <CardHeader className="border-b bg-muted/40 py-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              {t("editView.a2a.title")}
            </CardTitle>
            <CardDescription>
              {t("editView.a2a.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <SchemaEditorPanel
              id="edit-agent-card"
              label={t("editView.a2a.agentCardLabel")}
              required
              value={editAgentCard}
              onChange={setEditAgentCard}
              disabled={isSaving}
              schemaKey="a2a-agent-card"
              showSchema={showAgentCardSchema}
              onShowSchemaChange={setShowAgentCardSchema}
              placeholder={A2A_AGENT_CARD_PLACEHOLDER}
            />
          </CardContent>
        </Card>
      )}

      {/* Custom */}
      {editProtocol === "CUSTOM" && (
        <Card className="pt-0">
          <CardHeader className="border-b bg-muted/40 py-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              {t("editView.custom.title")}
            </CardTitle>
            <CardDescription>
              {t("editView.custom.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <SchemaEditorPanel
              id="edit-custom-schema"
              label={t("editView.custom.customLabel")}
              required
              value={editCustomSchema}
              onChange={setEditCustomSchema}
              disabled={isSaving}
              schemaKey="mcp-server"
              showSchema={false}
              onShowSchemaChange={() => {}}
              placeholder={CUSTOM_PLACEHOLDER}
            />
          </CardContent>
        </Card>
      )}

      {/* Agent skills */}
      {editProtocol === "AGENT_SKILLS" && (
        <Card className="pt-0">
          <CardHeader className="border-b bg-muted/40 py-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              {t("editView.skills.title")}
            </CardTitle>
            <CardDescription>
              {t("editView.skills.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-5">
            <div className="flex items-start gap-2">
              <Checkbox
                id="edit-include-skill-doc"
                checked={includeSkillDoc}
                onCheckedChange={(v) => {
                  const next = Boolean(v);
                  setIncludeSkillDoc(next);
                  if (!next) setEditSkillMd("");
                }}
                disabled={isSaving}
                className="mt-0.5"
              />
              <label htmlFor="edit-include-skill-doc" className="cursor-pointer">
                <div className="text-xs font-medium">{t("editView.skills.includeDocTitle")}</div>
                <p className="text-[11px] text-muted-foreground">
                  {t("editView.skills.includeDocDescription")}
                </p>
              </label>
            </div>

            {includeSkillDoc && (
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-skill-md" className="text-xs font-medium">
                    {t("editView.skills.skillMdLabel")}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setEditSkillMd(SKILL_MD_EXAMPLE)}
                    disabled={isSaving}
                  >
                    <FileText className="size-3" />
                    {t("editView.skills.pasteExample")}
                  </Button>
                </div>
                <Textarea
                  id="edit-skill-md"
                  value={editSkillMd}
                  onChange={(e) => setEditSkillMd(e.target.value)}
                  disabled={isSaving}
                  rows={10}
                  className="font-mono text-xs"
                  placeholder={"---\nname: my-skill\ndescription: Brief description of what this skill does.\n---\n# My Skill\n\nDescribe your skill's purpose, usage, and capabilities here."}
                />
              </div>
            )}

            <div className="flex items-start gap-2 pt-2 border-t">
              <Checkbox
                id="edit-include-skill-def"
                checked={includeSkillDef}
                onCheckedChange={(v) => {
                  const next = Boolean(v);
                  setIncludeSkillDef(next);
                  if (!next) setEditSkillDefinition("");
                }}
                disabled={isSaving}
                className="mt-0.5"
              />
              <label htmlFor="edit-include-skill-def" className="cursor-pointer">
                <div className="text-xs font-medium">{t("editView.skills.includeDefTitle")}</div>
                <p className="text-[11px] text-muted-foreground">
                  {t("editView.skills.includeDefDescription")}
                </p>
              </label>
            </div>

            {includeSkillDef && (
              <SchemaEditorPanel
                id="edit-skill-def"
                label={t("editView.skills.skillDefinitionLabel")}
                value={editSkillDefinition}
                onChange={setEditSkillDefinition}
                disabled={isSaving}
                schemaKey="agent-skills"
                showSchema={showSkillDefSchema}
                onShowSchemaChange={setShowSkillDefSchema}
                placeholder={AGENT_SKILLS_DEFINITION_PLACEHOLDER}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
