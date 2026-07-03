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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { Value } from "platejs";
import {
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { Plate, usePlateEditor } from "platejs/react";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { FixedToolbar } from "@/components/ui/fixed-toolbar";
import { MarkToolbarButton } from "@/components/ui/mark-toolbar-button";
import { $orpc } from "@/lib/api";
import {
  ArrowLeft,
  BookOpen,
  Braces,
  ChevronDown,
  ChevronRight,
  EllipsisVertical,
  ExternalLink,
  GlobeIcon,
  Loader2,
  LockIcon,
  Pencil,
  Plug,
  PlugZap,
  Plus,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AVAILABLE_TOOL_CONFIGS,
  buildToolTableRows,
  getCategoryBadgeVariant,
  getCategoryLabel,
  getProtocolBadgeClass,
  type Agent,
  type RegistryTool,
  type ToolCategory,
  type ToolGroupConfig,
  type ToolTableRow,
} from "./constants";
import { RegistryToolPicker } from "./registry-tool-picker";
import { ToolStatusBadge } from "./tool-status-badge";
import modelPricingData from "@/data/model-pricing.json";

// ─── General Section ─────────────────────────────────────────────────────────

interface GeneralSectionProps {
  agent: Agent;
  onAgentUpdated: (agent: Agent) => void;
}

export function GeneralSection({ agent, onAgentUpdated }: GeneralSectionProps) {
  const t = useTranslations("AgentForm");
  const router = useRouter();
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    setName(agent.name);
    setDescription(agent.description);
  }, [agent.name, agent.description]);

  const isDirty = name !== agent.name || description !== agent.description;

  const handleSave = async () => {
    if (!isDirty) return;
    setIsSaving(true);
    try {
      const { agent: updated } = await $orpc.updateAgent({
        id: agent.id,
        name: name.trim(),
        description: description.trim(),
      });
      onAgentUpdated(updated);
      toast.success(t("general.toast.updated"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("general.toast.updateFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await $orpc.deleteAgent({ id: agent.id });
      toast.success(t("general.toast.deleted"));
      router.push("/dashboard/agents");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("general.toast.deleteFailed"));
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("general.identity.title")}</CardTitle>
          <CardDescription>{t("general.identity.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel>{t("general.identity.nameLabel")}</FieldLabel>
            <FieldDescription>
              {t("general.identity.nameHint")}
            </FieldDescription>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("general.identity.namePlaceholder")}
              disabled={isSaving}
            />
          </Field>
          <Field>
            <FieldLabel>{t("general.identity.descriptionLabel")}</FieldLabel>
            <FieldDescription>
              {t("general.identity.descriptionHint")}
            </FieldDescription>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("general.identity.descriptionPlaceholder")}
              rows={3}
              disabled={isSaving}
            />
          </Field>
        </CardContent>
        <CardFooter className="border-t pt-3 flex justify-end mt-3">
          <Button
            size="sm"
            disabled={!isDirty || isSaving}
            onClick={handleSave}
          >
            {isSaving && <Loader2 className="size-3.5 animate-spin" />}
            {t("save")}
          </Button>
        </CardFooter>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("general.visibility.title")}</CardTitle>
          <CardDescription>
            {t("general.visibility.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {agent.isPublic ? (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-emerald-50 dark:bg-emerald-950/30">
                    <GlobeIcon className="size-4 text-emerald-500" />
                  </div>
                ) : (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/50">
                    <LockIcon className="size-4 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <FieldLabel>
                    {agent.isPublic
                      ? t("general.visibility.public")
                      : t("general.visibility.private")}
                  </FieldLabel>
                  <FieldDescription>
                    {agent.isPublic
                      ? t("general.visibility.publicHint")
                      : t("general.visibility.privateHint")}
                  </FieldDescription>
                </div>
              </div>
              <Switch
                checked={agent.isPublic}
                onCheckedChange={async (checked) => {
                  try {
                    const { agent: updated } = await $orpc.updateAgent({
                      id: agent.id,
                      isPublic: checked,
                    });
                    onAgentUpdated(updated);
                    toast.success(
                      checked
                        ? t("general.visibility.toast.madePublic")
                        : t("general.visibility.toast.madePrivate"),
                    );
                  } catch (err: unknown) {
                    toast.error(
                      err instanceof Error ? err.message : t("general.visibility.toast.failed"),
                    );
                  }
                }}
              />
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-destructive">
            {t("general.danger.title")}
          </CardTitle>
          <CardDescription>{t("general.danger.description")}</CardDescription>
        </CardHeader>
        <CardFooter className="border-t pt-3 flex justify-end mt-3">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            {isDeleting
              ? t("general.danger.deleting")
              : t("general.danger.delete")}
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("general.danger.dialogTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("general.danger.dialogDescription", { name: agent.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("general.danger.dialogCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
            >
              {t("general.danger.dialogConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Model Section ───────────────────────────────────────────────────────────

interface DbModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  server: string;
}

const PROVIDER_ICONS: Record<string, string> = {
  Anthropic: "/claude.png",
  Amazon: "/amazon.svg",
  Moonshot: "/moonshot-ai.svg",
  "Z.ai": "/z-ai.svg",
};

interface PricingInfo {
  description?: string;
  contextWindow?: number;
  input_mtok?: number;
  output_mtok?: number;
  cache_read_mtok?: number;
  cache_write_mtok?: number;
}

type TieredPrice = { base: number; tiers: unknown[] };

function extractPrice(val: number | TieredPrice | undefined): number | undefined {
  if (val == null) return undefined;
  if (typeof val === "number") return val;
  if ("base" in val) return val.base;
  return undefined;
}

const MODEL_PRICING_MAP: Map<string, PricingInfo> = (() => {
  const map = new Map<string, PricingInfo>();
  for (const provider of modelPricingData as { models: { id: string; name?: string; deprecated?: boolean; description?: string; context_window?: number; prices?: unknown }[] }[]) {
    for (const m of provider.models) {
      if (m.deprecated) continue;
      let rawPrices: Record<string, unknown> | undefined;
      if (m.prices) {
        if (Array.isArray(m.prices)) {
          rawPrices = (m.prices as { prices: Record<string, unknown> }[])[m.prices.length - 1]?.prices;
        } else {
          rawPrices = m.prices as Record<string, unknown>;
        }
      }
      map.set(m.id, {
        description: m.description,
        contextWindow: m.context_window,
        input_mtok: extractPrice(rawPrices?.input_mtok as number | TieredPrice | undefined),
        output_mtok: extractPrice(rawPrices?.output_mtok as number | TieredPrice | undefined),
        cache_read_mtok: extractPrice(rawPrices?.cache_read_mtok as number | TieredPrice | undefined),
        cache_write_mtok: extractPrice(rawPrices?.cache_write_mtok as number | TieredPrice | undefined),
      });
    }
  }
  return map;
})();

function formatPrice(val: number | undefined): string {
  if (val == null) return "—";
  return `$${val.toFixed(2)}`;
}

interface ModelSectionProps {
  agent: Agent;
  onAgentUpdated: (agent: Agent) => void;
}

export function ModelSection({ agent, onAgentUpdated }: ModelSectionProps) {
  const t = useTranslations("AgentForm");
  const [models, setModels] = useState<DbModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedModelId, setSelectedModelId] = useState(
    agent.preferredModelId ?? "",
  );

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const { models: fetched } = await $orpc.listModels();
        setModels(fetched);
      } catch (err) {
        console.error("Failed to load models:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchModels();
  }, []);

  const selectedModel = models.find((m) => m.id === selectedModelId) ?? null;
  const pricingInfo = selectedModel
    ? MODEL_PRICING_MAP.get(selectedModel.modelId)
    : undefined;

  const isDirty = selectedModelId !== (agent.preferredModelId ?? "");

  const handleSave = async () => {
    if (!isDirty) return;
    setIsSaving(true);
    try {
      const { agent: updated } = await $orpc.updateAgent({
        id: agent.id,
        preferredModelId: selectedModelId || null,
      });
      onAgentUpdated(updated);
      toast.success(t("model.toast.updated"));
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t("model.toast.updateFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("model.title")}</CardTitle>
        <CardDescription>{t("model.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field>
          <FieldLabel>{t("model.preferredLabel")}</FieldLabel>
          <FieldDescription>{t("model.preferredHint")}</FieldDescription>
          {isLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {t("model.loading")}
              </span>
            </div>
          ) : models.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              {t("model.noModels")}
            </p>
          ) : (
            <Combobox
              items={models}
              itemToStringLabel={(m) => m.name}
              itemToStringValue={(m) => m.id}
              value={selectedModel}
              onValueChange={(val) => {
                setSelectedModelId(val?.id ?? "");
              }}
            >
              <ComboboxInput
                placeholder={t("model.searchPlaceholder")}
                showClear={!!selectedModelId}
              />
              <ComboboxContent>
                <ComboboxEmpty>{t("model.noResults")}</ComboboxEmpty>
                <ComboboxList>
                  {(model) => (
                    <ComboboxItem key={model.id} value={model}>
                      <div className="flex items-center gap-2">
                        {PROVIDER_ICONS[model.provider] && (
                          <Image
                            src={PROVIDER_ICONS[model.provider]}
                            alt=""
                            width={16}
                            height={16}
                            className="rounded-sm shrink-0"
                          />
                        )}
                        <div className="flex flex-col">
                          <span>{model.name}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {model.modelId}
                          </span>
                        </div>
                      </div>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          )}
        </Field>

        {selectedModel && (
          <div className="rounded-md border bg-card px-3 py-2.5 space-y-2">
            <div>
              <div className="flex items-center gap-2">
                {PROVIDER_ICONS[selectedModel.provider] && (
                  <Image
                    src={PROVIDER_ICONS[selectedModel.provider]}
                    alt=""
                    width={18}
                    height={18}
                    className="rounded-sm shrink-0"
                  />
                )}
                <span className="text-xs font-medium">
                  {selectedModel.name}
                </span>
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0"
                >
                  {selectedModel.provider}
                </Badge>
              </div>
              {pricingInfo?.description && (
                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                  {pricingInfo.description}
                </p>
              )}
            </div>
            {(pricingInfo?.contextWindow != null ||
              pricingInfo?.input_mtok != null) && (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                {pricingInfo.contextWindow != null && (
                  <div className="rounded bg-muted/50 px-2 py-1.5">
                    <p className="text-[10px] text-muted-foreground">
                      {t("model.detail.contextWindow")}
                    </p>
                    <p className="text-xs font-medium tabular-nums">
                      {(pricingInfo.contextWindow / 1000).toLocaleString()}K
                    </p>
                  </div>
                )}
                {pricingInfo.input_mtok != null && (
                  <div className="rounded bg-muted/50 px-2 py-1.5">
                    <p className="text-[10px] text-muted-foreground">
                      {t("model.detail.input")}
                    </p>
                    <p className="text-xs font-medium tabular-nums">
                      {formatPrice(pricingInfo.input_mtok)}
                      <span className="text-[10px] font-normal text-muted-foreground">
                        /MTok
                      </span>
                    </p>
                  </div>
                )}
                {pricingInfo.output_mtok != null && (
                  <div className="rounded bg-muted/50 px-2 py-1.5">
                    <p className="text-[10px] text-muted-foreground">
                      {t("model.detail.output")}
                    </p>
                    <p className="text-xs font-medium tabular-nums">
                      {formatPrice(pricingInfo.output_mtok)}
                      <span className="text-[10px] font-normal text-muted-foreground">
                        /MTok
                      </span>
                    </p>
                  </div>
                )}
                {pricingInfo.cache_read_mtok != null && (
                  <div className="rounded bg-muted/50 px-2 py-1.5">
                    <p className="text-[10px] text-muted-foreground">
                      {t("model.detail.cacheRead")}
                    </p>
                    <p className="text-xs font-medium tabular-nums">
                      {formatPrice(pricingInfo.cache_read_mtok)}
                      <span className="text-[10px] font-normal text-muted-foreground">
                        /MTok
                      </span>
                    </p>
                  </div>
                )}
                {pricingInfo.cache_write_mtok != null && (
                  <div className="rounded bg-muted/50 px-2 py-1.5">
                    <p className="text-[10px] text-muted-foreground">
                      {t("model.detail.cacheWrite")}
                    </p>
                    <p className="text-xs font-medium tabular-nums">
                      {formatPrice(pricingInfo.cache_write_mtok)}
                      <span className="text-[10px] font-normal text-muted-foreground">
                        /MTok
                      </span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t pt-3 flex justify-end mt-3">
        <Button
          size="sm"
          disabled={!isDirty || isSaving}
          onClick={handleSave}
        >
          {isSaving && <Loader2 className="size-3.5 animate-spin" />}
          {t("save")}
        </Button>
      </CardFooter>
    </Card>
  );
}

// ─── Prompt Section ──────────────────────────────────────────────────────────

interface PromptSectionProps {
  systemPrompt: string | null;
  onSave: (systemPrompt: string | null) => Promise<void>;
}

function parsePromptToValue(text: string | null): Value {
  if (!text) {
    return [{ type: "p", children: [{ text: "" }] }];
  }
  return text.split("\n").map((line) => ({
    type: "p" as const,
    children: [{ text: line }],
  }));
}

function serializeValue(value: Value): string {
  return value
    .map((node) => {
      const children = (node as { children?: { text?: string }[] }).children;
      if (!children) return "";
      return children.map((c) => c.text ?? "").join("");
    })
    .join("\n");
}

function PromptEditor({
  initialValue,
  onChange,
  placeholder,
}: {
  initialValue: Value;
  onChange: (value: Value) => void;
  placeholder: string;
}) {
  const editor = usePlateEditor({
    plugins: [BoldPlugin, ItalicPlugin, UnderlinePlugin],
    value: initialValue,
  });

  return (
    <Plate editor={editor} onChange={({ value }) => onChange(value)}>
      <div className="flex flex-1 flex-col overflow-hidden rounded-md border">
        <FixedToolbar className="justify-start rounded-t-md border-b shrink-0">
          <MarkToolbarButton nodeType="bold" tooltip="Bold (⌘+B)">
            <span className="font-bold">B</span>
          </MarkToolbarButton>
          <MarkToolbarButton nodeType="italic" tooltip="Italic (⌘+I)">
            <span className="italic">I</span>
          </MarkToolbarButton>
          <MarkToolbarButton nodeType="underline" tooltip="Underline (⌘+U)">
            <span className="underline">U</span>
          </MarkToolbarButton>
        </FixedToolbar>
        <EditorContainer variant="default" className="flex-1 overflow-y-auto">
          <Editor
            variant="none"
            placeholder={placeholder}
            className="px-3 py-2 text-sm h-full"
          />
        </EditorContainer>
      </div>
    </Plate>
  );
}

export function PromptSection({ systemPrompt, onSave }: PromptSectionProps) {
  const t = useTranslations("AgentForm");
  const initialValue = useMemo(
    () => parsePromptToValue(systemPrompt),
    [systemPrompt],
  );
  const [currentValue, setCurrentValue] = useState<Value>(initialValue);
  const [isSaving, setIsSaving] = useState(false);

  const serialized = serializeValue(currentValue);
  const isDirty = serialized !== (systemPrompt ?? "");

  const handleSave = async () => {
    if (!isDirty) return;
    setIsSaving(true);
    try {
      await onSave(serialized || null);
      toast.success(t("prompt.toast.updated"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("prompt.toast.updateFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card size="sm" className="flex flex-1 flex-col overflow-hidden">
      <CardHeader>
        <CardTitle>{t("prompt.title")}</CardTitle>
        <CardDescription>{t("prompt.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col overflow-hidden">
        <Field className="flex flex-1 flex-col overflow-hidden">
          <FieldLabel>{t("prompt.instructionsLabel")}</FieldLabel>
          <FieldDescription>{t("prompt.instructionsHint")}</FieldDescription>
          <PromptEditor
            initialValue={initialValue}
            onChange={setCurrentValue}
            placeholder={t("prompt.placeholder")}
          />
          <p className="text-[11px] text-muted-foreground text-right shrink-0">
            {serialized.length} / 10,000
          </p>
        </Field>
      </CardContent>
      <CardFooter className="border-t pt-3 flex justify-end mt-3 shrink-0">
        <Button size="sm" disabled={!isDirty || isSaving} onClick={handleSave}>
          {isSaving && <Loader2 className="size-3.5 animate-spin" />}
          {t("save")}
        </Button>
      </CardFooter>
    </Card>
  );
}

// ─── Tools Section ───────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

// ── Add Tools Sheet ──────────────────────────────────────────────────────────

interface AddToolsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enabledToolIds: string[];
  onAddTools: (toolIds: string[]) => void;
  filterCategory?: ToolCategory;
  registryTools: RegistryTool[];
  onAddRegistryTools: (tools: RegistryTool[]) => void;
}

function AddToolsSheet({
  open,
  onOpenChange,
  enabledToolIds,
  onAddTools,
  filterCategory,
  registryTools,
  onAddRegistryTools,
}: AddToolsSheetProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<ToolGroupConfig | null>(
    null,
  );
  const [selectedToolIds, setSelectedToolIds] = useState<Set<string>>(
    new Set(),
  );

  const enabledSet = useMemo(() => new Set(enabledToolIds), [enabledToolIds]);

  const filteredTools = useMemo(() => {
    let tools = AVAILABLE_TOOL_CONFIGS;
    if (filterCategory) {
      tools = tools.filter((t) => t.category === filterCategory);
    }
    if (!searchQuery.trim()) return tools;
    const query = searchQuery.toLowerCase();
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query),
    );
  }, [searchQuery, filterCategory]);

  const handleGroupClick = (group: ToolGroupConfig) => {
    setSelectedGroup(group);
    const newToolIds = group.tools
      .filter((t) => !enabledSet.has(t.id))
      .map((t) => t.id);
    setSelectedToolIds(new Set(newToolIds));
  };

  const handleBack = () => {
    setSelectedGroup(null);
    setSelectedToolIds(new Set());
  };

  const handleToolToggle = (toolId: string) => {
    setSelectedToolIds((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  const handleAdd = () => {
    if (selectedToolIds.size === 0) return;
    onAddTools(Array.from(selectedToolIds));
    onOpenChange(false);
  };

  const handleAddIndividual = (toolId: string) => {
    onAddTools([toolId]);
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) {
      setSelectedGroup(null);
      setSelectedToolIds(new Set());
      setSearchQuery("");
    }
  }, [open]);

  const t = useTranslations("AgentForm");
  const sheetTitle = filterCategory
    ? getCategoryLabel(filterCategory)
    : t("tools.addTools");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-lg! rounded-lg border flex flex-col overflow-hidden">
        {filterCategory === "third-party" ? (
          <>
            <SheetHeader className="border-b py-3 px-3">
              <SheetTitle>{sheetTitle}</SheetTitle>
              <SheetDescription>{t("tools.addDescription")}</SheetDescription>
            </SheetHeader>
            <RegistryToolPicker
              enabledRegistryToolIds={registryTools.map(
                (rt) => rt.registryRecordId,
              )}
              onAddTools={onAddRegistryTools}
              onOpenChange={onOpenChange}
            />
          </>
        ) : selectedGroup ? (
          <>
            <SheetHeader className="border-b py-3 px-3">
              <SheetTitle>{selectedGroup.name}</SheetTitle>
              <SheetDescription>{selectedGroup.description}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col flex-1 px-2 py-4 overflow-hidden">
              <FieldGroup className="flex-1 overflow-y-auto gap-2">
                {selectedGroup.tools.map((tool) => {
                  const alreadyEnabled = enabledSet.has(tool.id);
                  return (
                    <FieldLabel key={tool.id} htmlFor={`tool-${tool.id}`}>
                      <Field
                        orientation="horizontal"
                        className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          id={`tool-${tool.id}`}
                          checked={
                            alreadyEnabled || selectedToolIds.has(tool.id)
                          }
                          disabled={alreadyEnabled}
                          onCheckedChange={() => handleToolToggle(tool.id)}
                        />
                        <FieldContent>
                          <FieldTitle>
                            {tool.name}
                            {alreadyEnabled && (
                              <Badge
                                variant="secondary"
                                className="text-[9px] px-1.5 h-4 ml-2"
                              >
                                {t("tools.alreadyAdded")}
                              </Badge>
                            )}
                          </FieldTitle>
                          <FieldDescription className="line-clamp-2">
                            {tool.description}
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                    </FieldLabel>
                  );
                })}
              </FieldGroup>
            </div>
            <div className="border-t px-4 py-3 flex items-center gap-2 justify-end">
              <Button
                variant="outline"
                onClick={handleBack}
                className="gap-1.5"
              >
                <ArrowLeft className="size-3.5" />
                {t("tools.back")}
              </Button>
              <Button onClick={handleAdd} disabled={selectedToolIds.size === 0}>
                {t("tools.addCount", { count: selectedToolIds.size })}
              </Button>
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="border-b py-3 px-3">
              <SheetTitle>{sheetTitle}</SheetTitle>
              <SheetDescription>{t("tools.addDescription")}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col flex-1 px-2 overflow-hidden">
              <div className="relative py-4">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder={t("tools.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <FieldGroup className="flex-1 overflow-y-auto gap-2">
                {filteredTools.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Search className="size-6 text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">
                      {t("tools.noResults", { query: searchQuery })}
                    </p>
                  </div>
                ) : (
                  filteredTools.map((tool) =>
                    tool.type === "group" ? (
                      <button
                        key={tool.id}
                        onClick={() => handleGroupClick(tool)}
                        className="w-full text-left group"
                      >
                        <Field className="rounded-md border p-3 hover:bg-muted/50 transition-colors">
                          <FieldContent>
                            <div className="flex items-center justify-between">
                              <FieldTitle>
                                {tool.name}
                                <Badge
                                  variant={getCategoryBadgeVariant(
                                    tool.category,
                                  )}
                                  className="text-[9px] px-1.5 h-4 ml-2"
                                >
                                  {getCategoryLabel(tool.category)}
                                </Badge>
                              </FieldTitle>
                              <ChevronRight className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </div>
                            <FieldDescription className="line-clamp-2">
                              {tool.description}
                            </FieldDescription>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {tool.tools.length} tool
                              {tool.tools.length !== 1 ? "s" : ""}
                            </p>
                          </FieldContent>
                        </Field>
                      </button>
                    ) : (
                      <button
                        key={tool.id}
                        onClick={() =>
                          enabledSet.has(tool.id)
                            ? undefined
                            : handleAddIndividual(tool.id)
                        }
                        disabled={enabledSet.has(tool.id)}
                        className="w-full text-left group disabled:opacity-60"
                      >
                        <Field className="rounded-md border p-3 hover:bg-muted/50 transition-colors">
                          <FieldContent>
                            <div className="flex items-center justify-between">
                              <FieldTitle>
                                {tool.name}
                                <Badge
                                  variant={getCategoryBadgeVariant(
                                    tool.category,
                                  )}
                                  className="text-[9px] px-1.5 h-4 ml-2"
                                >
                                  {getCategoryLabel(tool.category)}
                                </Badge>
                                {enabledSet.has(tool.id) && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[9px] px-1.5 h-4 ml-1"
                                  >
                                    {t("tools.alreadyAdded")}
                                  </Badge>
                                )}
                              </FieldTitle>
                              {!enabledSet.has(tool.id) && (
                                <ChevronRight className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                              )}
                            </div>
                            <FieldDescription className="line-clamp-2">
                              {tool.description}
                            </FieldDescription>
                          </FieldContent>
                        </Field>
                      </button>
                    ),
                  )
                )}
              </FieldGroup>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Edit Tool Sheet ──────────────────────────────────────────────────────────

interface EditToolSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolGroupId: string | null;
  enabledToolIds: string[];
  onUpdateTools: (addIds: string[], removeIds: string[]) => void;
}

function EditToolSheet({
  open,
  onOpenChange,
  toolGroupId,
  enabledToolIds,
  onUpdateTools,
}: EditToolSheetProps) {
  const t = useTranslations("AgentForm");
  const enabledSet = useMemo(() => new Set(enabledToolIds), [enabledToolIds]);

  const group = useMemo(() => {
    if (!toolGroupId) return null;
    const config = AVAILABLE_TOOL_CONFIGS.find(
      (c) => c.id === toolGroupId && c.type === "group",
    );
    return (config as ToolGroupConfig | undefined) ?? null;
  }, [toolGroupId]);

  const [selectedToolIds, setSelectedToolIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    if (open && group) {
      setSelectedToolIds(
        new Set(
          group.tools.filter((t) => enabledSet.has(t.id)).map((t) => t.id),
        ),
      );
    }
  }, [open, group, enabledSet]);

  const handleToolToggle = (toolId: string) => {
    setSelectedToolIds((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  const handleSave = () => {
    if (!group) return;
    const allGroupToolIds = group.tools.map((t) => t.id);
    const addIds = allGroupToolIds.filter(
      (id) => selectedToolIds.has(id) && !enabledSet.has(id),
    );
    const removeIds = allGroupToolIds.filter(
      (id) => !selectedToolIds.has(id) && enabledSet.has(id),
    );
    onUpdateTools(addIds, removeIds);
    onOpenChange(false);
  };

  if (!group) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-lg! rounded-lg border flex flex-col overflow-hidden">
        <SheetHeader className="border-b py-3 px-3">
          <SheetTitle>{group.name}</SheetTitle>
          <SheetDescription>{group.description}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col flex-1 px-2 py-4 overflow-hidden">
          <FieldGroup className="flex-1 overflow-y-auto gap-2">
            {group.tools.map((tool) => (
              <FieldLabel key={tool.id} htmlFor={`edit-tool-${tool.id}`}>
                <Field
                  orientation="horizontal"
                  className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    id={`edit-tool-${tool.id}`}
                    checked={selectedToolIds.has(tool.id)}
                    onCheckedChange={() => handleToolToggle(tool.id)}
                  />
                  <FieldContent>
                    <FieldTitle>{tool.name}</FieldTitle>
                    <FieldDescription className="line-clamp-2">
                      {tool.description}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            ))}
          </FieldGroup>
        </div>
        <div className="border-t px-4 py-3 flex items-center gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave}>{t("tools.saveChanges")}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Core Tool Detail Sheet ──────────────────────────────────────────────────

interface CoreToolDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolId: string | null;
}

function CoreToolDetailSheet({
  open,
  onOpenChange,
  toolId,
}: CoreToolDetailSheetProps) {
  const t = useTranslations("AgentForm");

  const toolConfig = useMemo(() => {
    if (!toolId) return null;
    return (
      AVAILABLE_TOOL_CONFIGS.find(
        (c) => c.type === "individual" && c.id === toolId,
      ) ?? null
    );
  }, [toolId]);

  if (!toolConfig || toolConfig.type !== "individual") return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-lg! rounded-lg border flex flex-col overflow-hidden">
        <SheetHeader className="border-b py-3 px-3">
          <SheetTitle>{toolConfig.name}</SheetTitle>
          <SheetDescription>{toolConfig.description}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          <div>
            <h3 className="text-xs font-medium mb-2">
              {t("tools.detail.basicInfo")}
            </h3>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {t("tools.detail.name")}
                </dt>
                <dd className="font-medium">{toolConfig.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {t("tools.coreDetail.category")}
                </dt>
                <dd>
                  <Badge
                    variant={getCategoryBadgeVariant(toolConfig.category)}
                    className="text-[9px] px-1.5 h-4"
                  >
                    {getCategoryLabel(toolConfig.category)}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {t("tools.detail.protocol")}
                </dt>
                <dd>
                  <Badge variant="outline" className="text-[9px] px-1.5 h-4">
                    Tool
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-1">
                  {t("tools.detail.description")}
                </dt>
                <dd>{toolConfig.description}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 className="text-xs font-medium mb-2">
              {t("tools.coreDetail.configuration")}
            </h3>
            <div className="rounded-lg border bg-muted">
              <pre className="text-[11px] p-3 whitespace-pre-wrap break-all leading-relaxed">
                {JSON.stringify(
                  {
                    id: toolConfig.id,
                    name: toolConfig.name,
                    type: "core",
                    category: toolConfig.category,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Registry Tool Detail Sheet ───────────────────────────────────────────────

function prettifyNestedJSON(obj: unknown): unknown {
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
      Object.entries(obj).map(([k, v]) => [k, prettifyNestedJSON(v)]),
    );
  }
  return obj;
}

function extractRegistryId(arn: string): string {
  const parts = arn.split("/");
  return parts[parts.length - 1] || arn;
}

function extractEndpointFromRecord(record: Record<string, unknown>): string | null {
  try {
    const descriptors = record.descriptors as Record<string, unknown> | undefined;
    if ((record.protocol as string) === "MCP") {
      const mcp = descriptors?.mcp as Record<string, unknown> | undefined;
      const serverSchema = mcp?.serverSchema as Record<string, unknown> | undefined;
      const content = JSON.parse((serverSchema?.inlineContent as string) || "{}");
      return content.remotes?.[0]?.url || null;
    }
    if ((record.protocol as string) === "A2A") {
      const a2a = descriptors?.a2a as Record<string, unknown> | undefined;
      const agentCard = a2a?.agentCard as Record<string, unknown> | undefined;
      const content = JSON.parse((agentCard?.inlineContent as string) || "{}");
      return content.url || null;
    }
  } catch {}
  return null;
}

interface RegistryToolDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registryTool: RegistryTool | null;
}

function RegistryToolDetailSheet({
  open,
  onOpenChange,
  registryTool,
}: RegistryToolDetailSheetProps) {
  const t = useTranslations("AgentForm");
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !registryTool) {
      setRecord(null);
      setError(null);
      return;
    }

    const fetchDetail = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const registryId = extractRegistryId(registryTool.registryArn);
        const response = await $orpc.getRegistryRecord({
          registryId,
          recordId: registryTool.registryRecordId,
        });
        setRecord(response.registryRecord as unknown as Record<string, unknown>);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : t("tools.detail.loadError"),
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetail();
  }, [open, registryTool, t]);

  const endpoint = record ? extractEndpointFromRecord(record) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-lg! rounded-lg border flex flex-col overflow-hidden">
        <SheetHeader className="border-b py-3 px-3">
          <SheetTitle>{registryTool?.name ?? t("tools.detail.title")}</SheetTitle>
          <SheetDescription>
            {registryTool?.description || t("tools.detail.subtitle")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">
                {t("tools.detail.loading")}
              </p>
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-xs text-destructive">
              {error}
            </div>
          ) : record ? (
            <>
              {/* Basic Info */}
              <div>
                <h3 className="text-xs font-medium mb-2">
                  {t("tools.detail.basicInfo")}
                </h3>
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {t("tools.detail.name")}
                    </dt>
                    <dd className="font-medium">{record.name as string}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {t("tools.detail.protocol")}
                    </dt>
                    <dd>
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 h-4 font-medium ${getProtocolBadgeClass((record.descriptorType as string) || (record.protocol as string) || "")}`}
                      >
                        {(record.descriptorType as string) || (record.protocol as string)}
                      </Badge>
                    </dd>
                  </div>
                  {(record.recordVersion as string) && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">
                        {t("tools.detail.version")}
                      </dt>
                      <dd>{record.recordVersion as string}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      {t("tools.detail.status")}
                    </dt>
                    <dd>
                      <Badge variant="secondary" className="text-[9px] px-1.5 h-4">
                        {record.status as string}
                      </Badge>
                    </dd>
                  </div>
                  {(record.description as string) && (
                    <div>
                      <dt className="text-muted-foreground mb-1">
                        {t("tools.detail.description")}
                      </dt>
                      <dd>{record.description as string}</dd>
                    </div>
                  )}
                  {endpoint && (
                    <div>
                      <dt className="text-muted-foreground mb-1">
                        {t("tools.detail.endpoint")}
                      </dt>
                      <dd className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] break-all">
                          {endpoint}
                        </span>
                        <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Descriptors */}
              {(record.descriptors as object) && (
                <div>
                  <h3 className="text-xs font-medium mb-2 flex items-center gap-1.5">
                    <Braces className="size-3.5" />
                    {t("tools.detail.descriptors")}
                  </h3>
                  <div className="max-h-[400px] overflow-auto rounded-lg border bg-muted">
                    <pre className="text-[11px] p-3 whitespace-pre-wrap break-all leading-relaxed">
                      {JSON.stringify(
                        prettifyNestedJSON(record.descriptors),
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div>
                <h3 className="text-xs font-medium mb-2">
                  {t("tools.detail.metadata")}
                </h3>
                <dl className="space-y-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground mb-1">
                      {t("tools.detail.recordArn")}
                    </dt>
                    <dd className="font-mono text-[11px] break-all">
                      {record.registryRecordArn as string}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground mb-1">
                      {t("tools.detail.recordId")}
                    </dt>
                    <dd className="font-mono text-[11px]">
                      {record.registryRecordId as string}
                    </dd>
                  </div>
                  {(record.createdAt as string) && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">
                        {t("tools.detail.created")}
                      </dt>
                      <dd>
                        {new Date(record.createdAt as string).toLocaleString()}
                      </dd>
                    </div>
                  )}
                  {(record.updatedAt as string) && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">
                        {t("tools.detail.updated")}
                      </dt>
                      <dd>
                        {new Date(record.updatedAt as string).toLocaleString()}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </>
          ) : null}
        </div>

        {registryTool && (
          <div className="border-t px-4 py-3 flex justify-end">
            <Link
              href={`/dashboard/registry/${extractRegistryId(registryTool.registryArn)}/records/${registryTool.registryRecordId}`}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1.5")}
            >
              <ExternalLink className="size-3.5" />
              {t("tools.detail.viewInRegistry")}
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Main Tools Section ───────────────────────────────────────────────────────

interface ToolsSectionProps {
  agentId: string;
  enabledToolIds: string[];
  onToolsChange: (toolIds: string[]) => void;
  registryTools: RegistryTool[];
  onRegistryToolsChange: (tools: RegistryTool[]) => void;
  persistedToolIds: Map<string, string>;
  onPersistedToolIdsChange: (ids: Map<string, string>) => void;
}

export function ToolsSection({
  agentId,
  enabledToolIds,
  onToolsChange,
  registryTools,
  onRegistryToolsChange,
  persistedToolIds,
  onPersistedToolIdsChange,
}: ToolsSectionProps) {
  const t = useTranslations("AgentForm");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [addSheetCategory, setAddSheetCategory] = useState<
    ToolCategory | undefined
  >();
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editToolGroupId, setEditToolGroupId] = useState<string | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [detailRegistryTool, setDetailRegistryTool] = useState<RegistryTool | null>(null);
  const [coreDetailSheetOpen, setCoreDetailSheetOpen] = useState(false);
  const [coreDetailToolId, setCoreDetailToolId] = useState<string | null>(null);

  const tableRows = useMemo(
    () => buildToolTableRows(enabledToolIds, registryTools),
    [enabledToolIds, registryTools],
  );

  const filteredRows = useMemo(() => {
    let rows = tableRows;
    if (categoryFilter !== "all") {
      rows = rows.filter((r) => r.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(query));
    }
    return rows;
  }, [tableRows, categoryFilter, searchQuery]);

  const handleCategoryChange = (value: string | null) => {
    setCategoryFilter(value ?? "all");
  };

  const handleOpenAddSheet = (category?: ToolCategory) => {
    setAddSheetCategory(category);
    setAddSheetOpen(true);
  };

  const handleAddTools = useCallback(
    async (toolIds: string[]) => {
      const newIds = toolIds.filter((id) => !enabledToolIds.includes(id));
      if (newIds.length === 0) return;

      const newPersistedIds = new Map(persistedToolIds);
      const added: string[] = [];

      for (const toolId of newIds) {
        const config = AVAILABLE_TOOL_CONFIGS.find(
          (c) =>
            (c.type === "individual" && c.id === toolId) ||
            (c.type === "group" && c.tools.some((t) => t.id === toolId)),
        );
        const toolName =
          config?.type === "individual"
            ? config.name
            : config?.type === "group"
              ? config.tools.find((t) => t.id === toolId)?.name ?? toolId
              : toolId;
        const toolDesc =
          config?.type === "individual"
            ? config.description
            : config?.type === "group"
              ? config.tools.find((t) => t.id === toolId)?.description ?? ""
              : "";

        try {
          const { tool: saved } = await $orpc.addAgentTool({
            agentId,
            name: toolName,
            type: "core",
            metadata: {
              toolId,
              description: toolDesc,
              category: config?.category ?? "first-party",
            },
            isEnabled: true,
          });
          newPersistedIds.set(toolId, saved.id);
          added.push(toolId);
        } catch (err: unknown) {
          toast.error(
            err instanceof Error ? err.message : "Failed to save tool",
          );
        }
      }

      if (added.length > 0) {
        onToolsChange([...new Set([...enabledToolIds, ...added])]);
        onPersistedToolIdsChange(newPersistedIds);
      }
    },
    [agentId, enabledToolIds, onToolsChange, persistedToolIds, onPersistedToolIdsChange],
  );

  const handleAddRegistryTools = useCallback(
    async (tools: RegistryTool[]) => {
      const existingIds = new Set(
        registryTools.map((rt) => rt.registryRecordId),
      );
      const newTools = tools.filter(
        (t) => !existingIds.has(t.registryRecordId),
      );
      if (newTools.length === 0) return;

      const newPersistedIds = new Map(persistedToolIds);
      const persisted: RegistryTool[] = [];

      for (const tool of newTools) {
        try {
          const { tool: saved, target } = await $orpc.addAgentTool({
            agentId,
            name: tool.name,
            type: "registry",
            metadata: {
              registryRecordId: tool.registryRecordId,
              registryArn: tool.registryArn,
              description: tool.description,
              protocol: tool.protocol,
              registryName: tool.registryName,
              recordVersion: tool.recordVersion,
            },
            isEnabled: true,
          });
          newPersistedIds.set(tool.registryRecordId, saved.id);
          persisted.push({
            ...tool,
            agentToolId: saved.id,
            targetStatus: target?.status,
            targetReasons: target?.statusReasons,
          });
        } catch (err: unknown) {
          toast.error(
            err instanceof Error ? err.message : "Failed to save tool",
          );
        }
      }

      if (persisted.length > 0) {
        onRegistryToolsChange([...registryTools, ...persisted]);
        onPersistedToolIdsChange(newPersistedIds);
      }
    },
    [agentId, registryTools, onRegistryToolsChange, persistedToolIds, onPersistedToolIdsChange],
  );

  const handleRemoveTool = useCallback(
    async (toolIds: string[]) => {
      const removeSet = new Set(toolIds);

      const newPersistedIds = new Map(persistedToolIds);
      for (const toolId of toolIds) {
        const agentToolId = persistedToolIds.get(toolId);
        if (agentToolId) {
          try {
            await $orpc.removeAgentTool({ id: agentToolId });
            newPersistedIds.delete(toolId);
          } catch (err: unknown) {
            toast.error(
              err instanceof Error ? err.message : "Failed to remove tool",
            );
          }
        }
      }

      onToolsChange(enabledToolIds.filter((id) => !removeSet.has(id)));
      onRegistryToolsChange(
        registryTools.filter((rt) => !removeSet.has(rt.registryRecordId)),
      );
      onPersistedToolIdsChange(newPersistedIds);
    },
    [enabledToolIds, onToolsChange, registryTools, onRegistryToolsChange, persistedToolIds, onPersistedToolIdsChange],
  );

  const handleEditTool = useCallback((toolId: string) => {
    setEditToolGroupId(toolId);
    setEditSheetOpen(true);
  }, []);

  const handleUpdateTools = useCallback(
    async (addIds: string[], removeIds: string[]) => {
      const newPersistedIds = new Map(persistedToolIds);

      for (const toolId of removeIds) {
        const agentToolId = persistedToolIds.get(toolId);
        if (agentToolId) {
          try {
            await $orpc.removeAgentTool({ id: agentToolId });
            newPersistedIds.delete(toolId);
          } catch (err: unknown) {
            toast.error(
              err instanceof Error ? err.message : "Failed to remove tool",
            );
          }
        }
      }

      for (const toolId of addIds) {
        const config = AVAILABLE_TOOL_CONFIGS.find(
          (c) => c.type === "group" && c.tools.some((t) => t.id === toolId),
        );
        const subTool = config?.type === "group"
          ? config.tools.find((t) => t.id === toolId)
          : undefined;

        try {
          const { tool: saved } = await $orpc.addAgentTool({
            agentId,
            name: subTool?.name ?? toolId,
            type: "core",
            metadata: {
              toolId,
              description: subTool?.description ?? "",
              category: config?.category ?? "first-party",
            },
            isEnabled: true,
          });
          newPersistedIds.set(toolId, saved.id);
        } catch (err: unknown) {
          toast.error(
            err instanceof Error ? err.message : "Failed to save tool",
          );
        }
      }

      const removeSet = new Set(removeIds);
      const current = enabledToolIds.filter((id) => !removeSet.has(id));
      onToolsChange([...new Set([...current, ...addIds])]);
      onPersistedToolIdsChange(newPersistedIds);
    },
    [agentId, enabledToolIds, onToolsChange, persistedToolIds, onPersistedToolIdsChange],
  );

  const handleRowClick = (row: ToolTableRow) => {
    if (row.isGroup) {
      handleEditTool(row.id);
    } else if (row.category === "third-party") {
      const rt = registryTools.find((t) => t.registryRecordId === row.id);
      if (rt) {
        setDetailRegistryTool(rt);
        setDetailSheetOpen(true);
      }
    } else if (row.category === "first-party") {
      setCoreDetailToolId(row.id);
      setCoreDetailSheetOpen(true);
    }
  };

  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("tools.title")}</CardTitle>
          <CardDescription>{t("tools.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters Row */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("tools.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-full"
              />
            </div>

            <Select value={categoryFilter} onValueChange={handleCategoryChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue>
                  {categoryFilter === "all"
                    ? t("tools.allTypes")
                    : getCategoryLabel(categoryFilter as ToolCategory)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("tools.allTypes")}</SelectItem>
                <SelectItem value="first-party">{t("tools.core")}</SelectItem>
                <SelectItem value="third-party">
                  {t("tools.thirdParty")}
                </SelectItem>
                <SelectItem value="mcp">{t("tools.mcp")}</SelectItem>
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button className="gap-1.5">
                    <Plus className="size-3.5" />
                    {t("tools.addTool")}
                    <ChevronDown className="size-3" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => handleOpenAddSheet("first-party")}
                >
                  <Wrench className="size-3.5" />
                  {t("tools.core")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleOpenAddSheet("third-party")}
                >
                  <Plug className="size-3.5" />
                  {t("tools.thirdParty")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleOpenAddSheet("mcp")}>
                  <PlugZap className="size-3.5" />
                  {t("tools.mcp")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Table */}
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>{t("tools.table.name")}</TableHead>
                  <TableHead>{t("tools.table.category")}</TableHead>
                  <TableHead>{t("tools.table.type")}</TableHead>
                  <TableHead>{t("tools.table.lastUpdated")}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length > 0 ? (
                  filteredRows.map((row) => {
                    const rt =
                      row.category === "third-party"
                        ? registryTools.find(
                            (r) => r.registryRecordId === row.id,
                          )
                        : undefined;
                    return (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => handleRowClick(row)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar size="sm">
                            <AvatarFallback>
                              {row.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground">
                              {row.name}
                            </span>
                            {rt && (
                              <ToolStatusBadge
                                status={rt.targetStatus}
                                reason={rt.targetReasons?.[0]}
                              />
                            )}
                            {rt?.targetStatus === "CREATE_FAILED" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-2 text-[9px]"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const { target } =
                                      await $orpc.retryGatewayTarget({
                                        registryRecordId: rt.registryRecordId,
                                      });
                                    onRegistryToolsChange(
                                      registryTools.map((r) =>
                                        r.registryRecordId ===
                                        rt.registryRecordId
                                          ? {
                                              ...r,
                                              targetStatus: target.status,
                                              targetReasons:
                                                target.statusReasons,
                                            }
                                          : r,
                                      ),
                                    );
                                  } catch (err) {
                                    toast.error(
                                      err instanceof Error
                                        ? err.message
                                        : "Retry failed",
                                    );
                                  }
                                }}
                              >
                                {t("tools.target.retry")}
                              </Button>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getCategoryBadgeVariant(row.category)}
                          className="text-[9px] px-1.5 h-4"
                        >
                          {getCategoryLabel(row.category)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1.5 h-4 font-medium ${getProtocolBadgeClass(row.protocol)}`}
                        >
                          {row.protocol}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">
                          {formatDate(row.lastUpdated)}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button variant="ghost" size="icon-sm">
                                  <EllipsisVertical className="size-4" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              {row.isGroup && (
                                <DropdownMenuItem
                                  onClick={() => handleEditTool(row.id)}
                                >
                                  <Pencil className="size-3.5" />
                                  {t("tools.editTools")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => handleRemoveTool(row.toolIds)}
                                variant="destructive"
                              >
                                <Trash2 className="size-3.5" />
                                {t("tools.remove")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ); })
                ) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <Wrench className="size-8 text-muted-foreground/40 mb-1" />
                        <p className="text-xs text-muted-foreground">
                          {t("tools.empty")}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AddToolsSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        enabledToolIds={enabledToolIds}
        onAddTools={handleAddTools}
        filterCategory={addSheetCategory}
        registryTools={registryTools}
        onAddRegistryTools={handleAddRegistryTools}
      />

      <EditToolSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        toolGroupId={editToolGroupId}
        enabledToolIds={enabledToolIds}
        onUpdateTools={handleUpdateTools}
      />

      <RegistryToolDetailSheet
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        registryTool={detailRegistryTool}
      />

      <CoreToolDetailSheet
        open={coreDetailSheetOpen}
        onOpenChange={setCoreDetailSheetOpen}
        toolId={coreDetailToolId}
      />
    </>
  );
}

type ComputeRuntime = "bedrock-agentcore" | "lambda";

const COMPUTE_OPTIONS: {
  id: ComputeRuntime;
  nameKey: string;
  descriptionKey: string;
  image: string;
}[] = [
  {
    id: "bedrock-agentcore",
    nameKey: "compute.bedrockName",
    descriptionKey: "compute.bedrockDescription",
    image: "/agentcore.png",
  },
  {
    id: "lambda",
    nameKey: "compute.lambdaName",
    descriptionKey: "compute.lambdaDescription",
    image: "/lambda.jpeg",
  },
];

export function ComputeSection() {
  const t = useTranslations("AgentForm");
  const [selected, setSelected] = useState<ComputeRuntime>("bedrock-agentcore");

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("compute.title")}</CardTitle>
        <CardDescription>{t("compute.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {COMPUTE_OPTIONS.map((option) => {
            const isSelected = selected === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSelected(option.id)}
                className={`relative flex flex-col gap-1.5 rounded-lg border p-4 text-left transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <img
                    src={option.image}
                    alt={t(option.nameKey)}
                    className="size-8 rounded-md object-cover"
                  />
                  <span className="text-sm font-medium text-foreground">
                    {t(option.nameKey)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t(option.descriptionKey)}
                </p>
              </button>
            );
          })}
        </div>
      </CardContent>
      <CardFooter className="border-t pt-3 flex justify-end mt-3">
        <Button size="sm" disabled>
          {t("save")}
        </Button>
      </CardFooter>
    </Card>
  );
}
