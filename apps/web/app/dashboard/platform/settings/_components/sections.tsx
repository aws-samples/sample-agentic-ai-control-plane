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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { $orpc } from "@/lib/api";
import {
  Cpu,
  EllipsisVertical,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CUSTOM_PROVIDER_ID,
  INFERENCE_PROVIDER_PRESETS,
  PERSONA_PROVIDERS,
  PROVIDER_PRESETS,
  type Model,
  type Persona,
  type PersonaGroup,
} from "./constants";
import modelPricingData from "@/data/model-pricing.json";

// ─── Bedrock Model Catalog ──────────────────────────────────────────────────

interface BedrockModelPrice {
  input_mtok?: number;
  output_mtok?: number;
  cache_read_mtok?: number;
  cache_write_mtok?: number;
}

interface BedrockModel {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  prices?: BedrockModelPrice;
}

type RawModelPrice =
  | BedrockModelPrice
  | { base: number; tiers: unknown[] };

function extractSimplePrice(
  val: RawModelPrice | undefined,
): number | undefined {
  if (val == null) return undefined;
  if (typeof val === "number") return val;
  if ("base" in val) return val.base;
  return undefined;
}

const BEDROCK_MODELS: BedrockModel[] = (() => {
  const awsProvider = (
    modelPricingData as {
      id: string;
      models: {
        id: string;
        name?: string;
        deprecated?: boolean;
        description?: string;
        context_window?: number;
        prices?:
          | { input_mtok?: number | RawModelPrice; output_mtok?: number | RawModelPrice; cache_read_mtok?: number | RawModelPrice; cache_write_mtok?: number | RawModelPrice }
          | { prices: { input_mtok?: number | RawModelPrice; output_mtok?: number | RawModelPrice; cache_read_mtok?: number | RawModelPrice; cache_write_mtok?: number | RawModelPrice } }[];
      }[];
    }[]
  ).find((p) => p.id === "aws");
  if (!awsProvider) return [];
  return awsProvider.models
    .filter((m) => !m.deprecated)
    .map((m) => {
      let rawPrices: { input_mtok?: number | RawModelPrice; output_mtok?: number | RawModelPrice; cache_read_mtok?: number | RawModelPrice; cache_write_mtok?: number | RawModelPrice } | undefined;
      if (m.prices) {
        if (Array.isArray(m.prices)) {
          rawPrices = m.prices[m.prices.length - 1]?.prices;
        } else {
          rawPrices = m.prices;
        }
      }
      const prices: BedrockModelPrice | undefined = rawPrices
        ? {
            input_mtok: extractSimplePrice(rawPrices.input_mtok as RawModelPrice | undefined),
            output_mtok: extractSimplePrice(rawPrices.output_mtok as RawModelPrice | undefined),
            cache_read_mtok: extractSimplePrice(rawPrices.cache_read_mtok as RawModelPrice | undefined),
            cache_write_mtok: extractSimplePrice(rawPrices.cache_write_mtok as RawModelPrice | undefined),
          }
        : undefined;

      return {
        id: m.id,
        name: m.name || m.id,
        description: m.description,
        contextWindow: m.context_window,
        prices,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
})();

// ─── Model Form (shared by Add/Edit) ────────────────────────────────────────

interface ModelFormData {
  name: string;
  provider: string;
  modelId: string;
  server: string;
  profile: string;
}

function formatPrice(val: number | undefined): string {
  if (val == null) return "—";
  return `$${val.toFixed(2)}`;
}

function ModelIdSelector({
  value,
  onChange,
  disabled,
  t,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  t: ReturnType<typeof useTranslations<"PlatformSettings">>;
}) {
  const matchedModel = BEDROCK_MODELS.find((m) => m.id === value);
  const [isCustomMode, setIsCustomMode] = useState(
    value !== "" && !matchedModel,
  );

  useEffect(() => {
    if (BEDROCK_MODELS.find((m) => m.id === value)) {
      setIsCustomMode(false);
    }
  }, [value]);

  if (isCustomMode) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2 items-center">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t("models.form.modelIdPlaceholder")}
            disabled={disabled}
            className="flex-1"
            autoFocus
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              setIsCustomMode(false);
              onChange("");
            }}
          >
            {t("models.form.browseModels")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <div className="flex-1">
          <Combobox
            items={BEDROCK_MODELS}
            itemToStringLabel={(m) => m.id}
            itemToStringValue={(m) => m.id}
            value={matchedModel ?? null}
            onValueChange={(val) => {
              onChange(val?.id ?? "");
            }}
            disabled={disabled}
          >
            <ComboboxInput
              placeholder={t("models.form.modelIdPlaceholder")}
              showClear={!!value}
            />
            <ComboboxContent>
              <ComboboxEmpty>{t("models.form.noModelsFound")}</ComboboxEmpty>
              <ComboboxList>
                {(model) => (
                  <ComboboxItem key={model.id} value={model}>
                    <div className="flex flex-col">
                      <span>{model.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {model.id}
                      </span>
                    </div>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={disabled}
          onClick={() => {
            setIsCustomMode(true);
            onChange("");
          }}
        >
          {t("models.form.customModelId")}
        </Button>
      </div>
      {matchedModel && (
        <div className="rounded-md border bg-card px-3 py-2.5 space-y-2">
          <div>
            <p className="text-xs font-medium">{matchedModel.name}</p>
            {matchedModel.description && (
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                {matchedModel.description}
              </p>
            )}
          </div>
          {(matchedModel.contextWindow != null ||
            matchedModel.prices?.input_mtok != null) && (
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {matchedModel.contextWindow != null && (
                <div className="rounded bg-muted/50 px-2 py-1.5">
                  <p className="text-[10px] text-muted-foreground">
                    {t("models.detail.contextWindow")}
                  </p>
                  <p className="text-xs font-medium tabular-nums">
                    {(matchedModel.contextWindow / 1000).toLocaleString()}K
                  </p>
                </div>
              )}
              {matchedModel.prices?.input_mtok != null && (
                <div className="rounded bg-muted/50 px-2 py-1.5">
                  <p className="text-[10px] text-muted-foreground">
                    {t("models.detail.input")}
                  </p>
                  <p className="text-xs font-medium tabular-nums">
                    {formatPrice(matchedModel.prices.input_mtok)}
                    <span className="text-[10px] font-normal text-muted-foreground">
                      /MTok
                    </span>
                  </p>
                </div>
              )}
              {matchedModel.prices?.output_mtok != null && (
                <div className="rounded bg-muted/50 px-2 py-1.5">
                  <p className="text-[10px] text-muted-foreground">
                    {t("models.detail.output")}
                  </p>
                  <p className="text-xs font-medium tabular-nums">
                    {formatPrice(matchedModel.prices.output_mtok)}
                    <span className="text-[10px] font-normal text-muted-foreground">
                      /MTok
                    </span>
                  </p>
                </div>
              )}
              {matchedModel.prices?.cache_read_mtok != null && (
                <div className="rounded bg-muted/50 px-2 py-1.5">
                  <p className="text-[10px] text-muted-foreground">
                    {t("models.detail.cacheRead")}
                  </p>
                  <p className="text-xs font-medium tabular-nums">
                    {formatPrice(matchedModel.prices.cache_read_mtok)}
                    <span className="text-[10px] font-normal text-muted-foreground">
                      /MTok
                    </span>
                  </p>
                </div>
              )}
              {matchedModel.prices?.cache_write_mtok != null && (
                <div className="rounded bg-muted/50 px-2 py-1.5">
                  <p className="text-[10px] text-muted-foreground">
                    {t("models.detail.cacheWrite")}
                  </p>
                  <p className="text-xs font-medium tabular-nums">
                    {formatPrice(matchedModel.prices.cache_write_mtok)}
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
    </div>
  );
}

function ModelFormFields({
  data,
  onChange,
  disabled,
  t,
}: {
  data: ModelFormData;
  onChange: (data: ModelFormData) => void;
  disabled: boolean;
  t: ReturnType<typeof useTranslations<"PlatformSettings">>;
}) {
  const update = (field: keyof ModelFormData, value: string) =>
    onChange({ ...data, [field]: value });

  const matchedPreset = PROVIDER_PRESETS.find((p) => p.id === data.provider);
  const [isCustomMode, setIsCustomMode] = useState(
    data.provider !== "" && !matchedPreset,
  );

  useEffect(() => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === data.provider);
    if (preset) {
      setIsCustomMode(false);
    }
  }, [data.provider]);

  const selectValue = matchedPreset
    ? matchedPreset.id
    : isCustomMode
      ? CUSTOM_PROVIDER_ID
      : "";

  const handleProviderSelect = (value: string | null) => {
    if (!value || value === CUSTOM_PROVIDER_ID) {
      setIsCustomMode(true);
      update("provider", "");
    } else {
      setIsCustomMode(false);
      update("provider", value);
    }
  };

  const matchedInference = INFERENCE_PROVIDER_PRESETS.find(
    (p) => p.id === data.server,
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("models.form.nameLabel")}</Label>
        <Input
          value={data.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder={t("models.form.namePlaceholder")}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("models.form.modelProviderLabel")}</Label>
        <Select
          value={selectValue}
          onValueChange={handleProviderSelect}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("models.form.modelProviderPlaceholder")}>
              {matchedPreset ? (
                <div className="flex items-center gap-2">
                  <Image
                    src={matchedPreset.icon}
                    alt=""
                    width={18}
                    height={18}
                    className="rounded-sm shrink-0 dark:invert"
                  />
                  <span>{matchedPreset.name}</span>
                </div>
              ) : isCustomMode ? (
                <span>
                  {data.provider
                    ? `${t("models.form.customProvider")}: ${data.provider}`
                    : t("models.form.customProvider")}
                </span>
              ) : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_PRESETS.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                <div className="flex items-center gap-2">
                  <Image
                    src={preset.icon}
                    alt=""
                    width={18}
                    height={18}
                    className="rounded-sm shrink-0 dark:invert"
                  />
                  <span>{preset.name}</span>
                </div>
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_PROVIDER_ID}>
              <span>{t("models.form.customProvider")}</span>
            </SelectItem>
          </SelectContent>
        </Select>
        {isCustomMode && (
          <Input
            value={data.provider}
            onChange={(e) => update("provider", e.target.value)}
            placeholder={t("models.form.customProviderPlaceholder")}
            disabled={disabled}
            autoFocus
          />
        )}
      </div>
      <div className="space-y-2">
        <Label>{t("models.form.modelIdLabel")}</Label>
        {data.server === "Amazon Bedrock" ? (
          <ModelIdSelector
            value={data.modelId}
            onChange={(value) => update("modelId", value)}
            disabled={disabled}
            t={t}
          />
        ) : (
          <Input
            value={data.modelId}
            onChange={(e) => update("modelId", e.target.value)}
            placeholder={t("models.form.modelIdPlaceholder")}
            disabled={disabled}
          />
        )}
      </div>
      <div className="space-y-2">
        <Label>{t("models.form.inferenceProviderLabel")}</Label>
        <Select
          value={data.server}
          onValueChange={(value) => update("server", value ?? "")}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("models.form.inferenceProviderPlaceholder")}>
              {matchedInference ? (
                <div className="flex items-center gap-2">
                  <Image
                    src={matchedInference.icon}
                    alt=""
                    width={18}
                    height={18}
                    className="rounded-sm shrink-0"
                  />
                  <span>{matchedInference.name}</span>
                </div>
              ) : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {INFERENCE_PROVIDER_PRESETS.map((preset) => (
              <SelectItem key={preset.id} value={preset.id}>
                <div className="flex items-center gap-2">
                  <Image
                    src={preset.icon}
                    alt=""
                    width={18}
                    height={18}
                    className="rounded-sm shrink-0"
                  />
                  <span>{preset.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

const EMPTY_FORM: ModelFormData = {
  name: "",
  provider: "",
  modelId: "",
  server: "Amazon Bedrock",
  profile: "default",
};

// ─── Add Model Sheet ─────────────────────────────────────────────────────────

interface AddModelSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModelCreated: (model: Model) => void;
}

function AddModelSheet({
  open,
  onOpenChange,
  onModelCreated,
}: AddModelSheetProps) {
  const t = useTranslations("PlatformSettings");
  const [formData, setFormData] = useState<ModelFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) setFormData(EMPTY_FORM);
  }, [open]);

  const isValid =
    formData.name.trim() &&
    formData.provider.trim() &&
    formData.modelId.trim() &&
    formData.server.trim();

  const handleSubmit = async () => {
    if (!isValid) return;
    setIsSaving(true);
    try {
      const { model } = await $orpc.createModel({
        name: formData.name.trim(),
        provider: formData.provider.trim(),
        modelId: formData.modelId.trim(),
        server: formData.server.trim(),
        profile: formData.profile.trim() || "default",
      });
      onModelCreated(model);
      onOpenChange(false);
      toast.success(t("models.toast.created"));
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t("models.toast.createFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-lg! rounded-lg border flex flex-col overflow-hidden">
        <SheetHeader className="border-b py-3 px-3">
          <SheetTitle>{t("models.addTitle")}</SheetTitle>
          <SheetDescription>{t("models.addDescription")}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <ModelFormFields
            data={formData}
            onChange={setFormData}
            disabled={isSaving}
            t={t}
          />
        </div>
        <div className="border-t px-4 py-3 flex items-center gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSaving}>
            {isSaving && <Loader2 className="size-3.5 animate-spin" />}
            {t("models.addSubmit")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Edit Model Sheet ────────────────────────────────────────────────────────

interface EditModelSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: Model | null;
  onModelUpdated: (model: Model) => void;
}

function EditModelSheet({
  open,
  onOpenChange,
  model,
  onModelUpdated,
}: EditModelSheetProps) {
  const t = useTranslations("PlatformSettings");
  const [formData, setFormData] = useState<ModelFormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && model) {
      setFormData({
        name: model.name,
        provider: model.provider,
        modelId: model.modelId,
        server: model.server,
        profile: model.profile,
      });
    }
  }, [open, model]);

  const isValid =
    formData.name.trim() &&
    formData.provider.trim() &&
    formData.modelId.trim() &&
    formData.server.trim();

  const handleSubmit = async () => {
    if (!isValid || !model) return;
    setIsSaving(true);
    try {
      const { model: updated } = await $orpc.updateModel({
        id: model.id,
        name: formData.name.trim(),
        provider: formData.provider.trim(),
        modelId: formData.modelId.trim(),
        server: formData.server.trim(),
        profile: formData.profile.trim() || "default",
      });
      onModelUpdated(updated);
      onOpenChange(false);
      toast.success(t("models.toast.updated"));
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t("models.toast.updateFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-lg! rounded-lg border flex flex-col overflow-hidden">
        <SheetHeader className="border-b py-3 px-3">
          <SheetTitle>{t("models.editTitle")}</SheetTitle>
          <SheetDescription>{t("models.editDescription")}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <ModelFormFields
            data={formData}
            onChange={setFormData}
            disabled={isSaving}
            t={t}
          />
        </div>
        <div className="border-t px-4 py-3 flex items-center gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSaving}>
            {isSaving && <Loader2 className="size-3.5 animate-spin" />}
            {t("save")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Models Section ──────────────────────────────────────────────────────────

interface ModelsSectionProps {
  models: Model[];
  onModelsChanged: (models: Model[]) => void;
}

export function ModelsSection({ models, onModelsChanged }: ModelsSectionProps) {
  const t = useTranslations("PlatformSettings");
  const [searchQuery, setSearchQuery] = useState("");
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [deleteModel, setDeleteModel] = useState<Model | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredModels = searchQuery.trim()
    ? models.filter((m) => {
        const query = searchQuery.toLowerCase();
        return (
          m.name.toLowerCase().includes(query) ||
          m.provider.toLowerCase().includes(query) ||
          m.modelId.toLowerCase().includes(query)
        );
      })
    : models;

  const handleModelCreated = (model: Model) => {
    onModelsChanged([...models, model]);
  };

  const handleModelUpdated = (updated: Model) => {
    onModelsChanged(models.map((m) => (m.id === updated.id ? updated : m)));
  };

  const handleEdit = (model: Model) => {
    setEditingModel(model);
    setEditSheetOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteModel) return;
    setIsDeleting(true);
    try {
      await $orpc.deleteModel({ id: deleteModel.id });
      onModelsChanged(models.filter((m) => m.id !== deleteModel.id));
      toast.success(t("models.toast.deleted"));
      setDeleteModel(null);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t("models.toast.deleteFailed"),
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("models.title")}</CardTitle>
          <CardDescription>{t("models.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("models.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-full"
              />
            </div>
            <Button
              className="gap-1.5"
              onClick={() => setAddSheetOpen(true)}
            >
              <Plus className="size-3.5" />
              {t("models.addModel")}
            </Button>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>{t("models.table.name")}</TableHead>
                  <TableHead>{t("models.table.modelProvider")}</TableHead>
                  <TableHead>{t("models.table.modelId")}</TableHead>
                  <TableHead>{t("models.table.inferenceProvider")}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredModels.length > 0 ? (
                  filteredModels.map((model) => (
                    <TableRow key={model.id}>
                      <TableCell>
                        <span className="font-medium text-foreground">
                          {model.name}
                        </span>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const preset = PROVIDER_PRESETS.find(
                            (p) => p.id === model.provider,
                          );
                          return preset ? (
                            <div className="flex items-center gap-2">
                              <Image
                                src={preset.icon}
                                alt=""
                                width={16}
                                height={16}
                                className="rounded-sm shrink-0 dark:invert"
                              />
                              <span className="text-muted-foreground">
                                {preset.name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              {model.provider}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {model.modelId}
                        </code>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const preset = INFERENCE_PROVIDER_PRESETS.find(
                            (p) => p.id === model.server,
                          );
                          return preset ? (
                            <div className="flex items-center gap-2">
                              <Image
                                src={preset.icon}
                                alt=""
                                width={16}
                                height={16}
                                className="rounded-sm shrink-0"
                              />
                              <span className="text-muted-foreground">
                                {preset.name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              {model.server}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
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
                              <DropdownMenuItem
                                onClick={() => handleEdit(model)}
                              >
                                <Pencil className="size-3.5" />
                                {t("models.actions.edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeleteModel(model)}
                                variant="destructive"
                              >
                                <Trash2 className="size-3.5" />
                                {t("models.actions.delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <Cpu className="size-8 text-muted-foreground/40 mb-1" />
                        <p className="text-xs text-muted-foreground">
                          {searchQuery.trim()
                            ? t("models.noResults", { query: searchQuery })
                            : t("models.empty")}
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

      <AddModelSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        onModelCreated={handleModelCreated}
      />

      <EditModelSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        model={editingModel}
        onModelUpdated={handleModelUpdated}
      />

      <AlertDialog
        open={!!deleteModel}
        onOpenChange={(open) => !open && setDeleteModel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("models.deleteDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("models.deleteDialog.description", {
                name: deleteModel?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("models.deleteDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="size-3.5 animate-spin" />}
              {t("models.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Entra ID Search ────────────────────────────────────────────────────────

interface EntraUser {
  id: string;
  displayName: string | null;
  mail: string | null;
  userPrincipalName: string | null;
  jobTitle: string | null;
  department: string | null;
}

interface EntraGroup {
  id: string;
  displayName: string | null;
  description: string | null;
  mail: string | null;
}

interface EntraResult {
  id: string;
  displayName: string;
  email: string | null;
  metadata: Record<string, unknown>;
}

function useEntraSearch(mode: "user" | "group", enabled: boolean = true) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntraResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);

  const search = useCallback(
    async (searchQuery: string) => {
      setIsSearching(true);
      try {
        if (mode === "user") {
          const { users } = await $orpc.searchMicrosoftUsers({
            search: searchQuery || undefined,
            top: 20,
          });
          setResults(
            users.map((u: EntraUser) => ({
              id: u.id,
              displayName: u.displayName ?? u.userPrincipalName ?? u.id,
              email: u.mail ?? u.userPrincipalName ?? null,
              metadata: {
                jobTitle: u.jobTitle,
                department: u.department,
                userPrincipalName: u.userPrincipalName,
              },
            })),
          );
        } else {
          const { groups } = await $orpc.listMicrosoftGroups({
            search: searchQuery || undefined,
            top: 20,
          });
          setResults(
            groups.map((g: EntraGroup) => ({
              id: g.id,
              displayName: g.displayName ?? g.id,
              email: g.mail ?? null,
              metadata: { description: g.description },
            })),
          );
        }
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
        setHasLoadedInitial(true);
      }
    },
    [mode],
  );

  useEffect(() => {
    setHasLoadedInitial(false);
    setResults([]);
  }, [mode]);

  useEffect(() => {
    if (!enabled) return;
    if (!hasLoadedInitial && query === "") {
      search("");
      return;
    }
    const timeout = setTimeout(() => {
      search(query);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, search, hasLoadedInitial, enabled]);

  return { query, setQuery, results, isSearching };
}

// ─── Cognito Group Listing ──────────────────────────────────────────────────

function useCognitoGroups() {
  const [results, setResults] = useState<EntraResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchGroups = async () => {
      setIsLoading(true);
      try {
        const { groups } = await $orpc.listCognitoGroups();
        if (cancelled) return;
        setResults(
          groups.map((g) => ({
            id: g.name,
            displayName: g.name,
            email: g.description ?? null,
            metadata: {},
          })),
        );
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setHasLoaded(true);
        }
      }
    };
    fetchGroups();
    return () => {
      cancelled = true;
    };
  }, []);

  return { results, isLoading, hasLoaded };
}

// ─── Persona Form ───────────────────────────────────────────────────────────

interface PersonaFormData {
  name: string;
  provider: string;
  email: string | null;
  selectedGroups: EntraResult[];
}

const EMPTY_PERSONA_FORM: PersonaFormData = {
  name: "",
  provider: "entra-id",
  email: null,
  selectedGroups: [],
};

function EntraSearchList({
  search,
  selectedIds,
  onToggle,
  disabled,
  multiSelect,
  noResultsLabel,
  searchPlaceholder,
  icon: Icon,
}: {
  search: ReturnType<typeof useEntraSearch>;
  selectedIds: Set<string>;
  onToggle: (result: EntraResult) => void;
  disabled: boolean;
  multiSelect: boolean;
  noResultsLabel: string;
  searchPlaceholder: string;
  icon: typeof Users;
}) {
  return (
    <>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          disabled={disabled}
          className="pl-8"
        />
      </div>
      {search.isSearching && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {!search.isSearching && search.results.length > 0 && (
        <div className="rounded-lg border max-h-48 overflow-y-auto">
          {search.results.map((result) => {
            const isSelected = selectedIds.has(result.id);
            return (
              <button
                key={result.id}
                type="button"
                onClick={() => onToggle(result)}
                disabled={disabled}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${
                  isSelected ? "bg-muted" : ""
                }`}
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Icon className="size-3 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {result.displayName}
                  </p>
                  {result.email && (
                    <p className="truncate text-xs text-muted-foreground">
                      {result.email}
                    </p>
                  )}
                </div>
                {multiSelect ? (
                  <div
                    className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    }`}
                  >
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="stroke-current">
                        <path d="M2 5L4 7L8 3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                ) : (
                  isSelected && (
                    <div className="size-2 rounded-full bg-primary shrink-0" />
                  )
                )}
              </button>
            );
          })}
        </div>
      )}
      {!search.isSearching && search.results.length === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center">
          {noResultsLabel}
        </p>
      )}
    </>
  );
}

function PersonaFormFields({
  data,
  onChange,
  disabled,
  t,
}: {
  data: PersonaFormData;
  onChange: (data: PersonaFormData) => void;
  disabled: boolean;
  t: ReturnType<typeof useTranslations<"PlatformSettings">>;
}) {
  const groupSearch = useEntraSearch("group", data.provider === "entra-id");
  const cognitoGroups = useCognitoGroups();

  const handleToggleGroup = (result: EntraResult) => {
    const exists = data.selectedGroups.some((g) => g.id === result.id);
    const next = exists
      ? data.selectedGroups.filter((g) => g.id !== result.id)
      : [...data.selectedGroups, result];
    onChange({ ...data, selectedGroups: next });
  };

  const selectedGroupIds = new Set(data.selectedGroups.map((g) => g.id));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("personas.form.nameLabel")}</Label>
        <Input
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          placeholder={t("personas.form.namePlaceholder")}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label>{t("personas.form.emailLabel")}</Label>
        <Input
          value={data.email ?? ""}
          onChange={(e) =>
            onChange({ ...data, email: e.target.value || null })
          }
          placeholder={t("personas.form.emailPlaceholder")}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label>{t("personas.form.providerLabel")}</Label>
        <Select
          value={data.provider}
          onValueChange={(value) => value && onChange({ ...data, provider: value })}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("personas.form.providerPlaceholder")}>
              {(() => {
                const matched = PERSONA_PROVIDERS.find(
                  (p) => p.id === data.provider,
                );
                if (!matched) return undefined;
                return (
                  <div className="flex items-center gap-2">
                    <Image
                      src={matched.icon}
                      alt=""
                      width={18}
                      height={18}
                      className="rounded-sm shrink-0"
                    />
                    <span>{matched.name}</span>
                  </div>
                );
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PERSONA_PROVIDERS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <div className="flex items-center gap-2">
                  <Image
                    src={p.icon}
                    alt=""
                    width={18}
                    height={18}
                    className="rounded-sm shrink-0"
                  />
                  <span>{p.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {data.provider === "entra-id" && (
        <div className="space-y-2">
          <Label>{t("personas.form.selectGroups")}</Label>
          <EntraSearchList
            search={groupSearch}
            selectedIds={selectedGroupIds}
            onToggle={handleToggleGroup}
            disabled={disabled}
            multiSelect={true}
            noResultsLabel={t("personas.form.noResults")}
            searchPlaceholder={t("personas.form.searchGroups")}
            icon={Users}
          />
        </div>
      )}

      {data.provider === "cognito" && (
        <div className="space-y-2">
          <Label>{t("personas.form.selectGroups")}</Label>
          {cognitoGroups.isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!cognitoGroups.isLoading && cognitoGroups.results.length === 0 && (
            <p className="text-xs text-muted-foreground py-2 text-center">
              {t("personas.form.cognitoGroupsEmpty")}
            </p>
          )}
          {!cognitoGroups.isLoading && cognitoGroups.results.length > 0 && (
            <div className="rounded-lg border max-h-48 overflow-y-auto">
              {cognitoGroups.results.map((result) => {
                const isSelected = selectedGroupIds.has(result.id);
                return (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => handleToggleGroup(result)}
                    disabled={disabled}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${
                      isSelected ? "bg-muted" : ""
                    }`}
                  >
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Users className="size-3 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {result.displayName}
                      </p>
                      {result.email && (
                        <p className="truncate text-xs text-muted-foreground">
                          {result.email}
                        </p>
                      )}
                    </div>
                    <div
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {isSelected && (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="stroke-current">
                          <path d="M2 5L4 7L8 3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {data.selectedGroups.length > 0 && (
        <div className="space-y-1.5">
          <Label>
            {t("personas.form.selectedGroups", {
              count: data.selectedGroups.length,
            })}
          </Label>
          <div className="rounded-lg border divide-y max-h-32 overflow-y-auto">
            {data.selectedGroups.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-3 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{item.displayName}</p>
                  {item.email && (
                    <p className="truncate text-xs text-muted-foreground">
                      {item.email}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  onClick={() => handleToggleGroup(item)}
                  disabled={disabled}
                >
                  <X className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add Persona Sheet ──────────────────────────────────────────────────────

interface AddPersonaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPersonaCreated: (persona: Persona) => void;
}

function AddPersonaSheet({
  open,
  onOpenChange,
  onPersonaCreated,
}: AddPersonaSheetProps) {
  const t = useTranslations("PlatformSettings");
  const [formData, setFormData] =
    useState<PersonaFormData>(EMPTY_PERSONA_FORM);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) setFormData(EMPTY_PERSONA_FORM);
  }, [open]);

  const isValid =
    formData.name.trim() &&
    formData.provider.trim();

  const handleSubmit = async () => {
    if (!isValid) return;
    setIsSaving(true);
    try {
      const groups: PersonaGroup[] = formData.selectedGroups.map((g) => ({
        id: g.id,
        displayName: g.displayName,
        email: g.email,
      }));
      const { persona } = await $orpc.createPersona({
        name: formData.name.trim(),
        provider: formData.provider,
        email: formData.email,
        groups,
      });
      onPersonaCreated(persona);
      onOpenChange(false);
      toast.success(t("personas.toast.created"));
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("personas.toast.createFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-lg! rounded-lg border flex flex-col overflow-hidden">
        <SheetHeader className="border-b py-3 px-3">
          <SheetTitle>{t("personas.addTitle")}</SheetTitle>
          <SheetDescription>{t("personas.addDescription")}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <PersonaFormFields
            data={formData}
            onChange={setFormData}
            disabled={isSaving}
            t={t}
          />
        </div>
        <div className="border-t px-4 py-3 flex items-center gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSaving}>
            {isSaving && <Loader2 className="size-3.5 animate-spin" />}
            {t("personas.addSubmit")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Edit Persona Sheet ─────────────────────────────────────────────────────

interface EditPersonaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  persona: Persona | null;
  onPersonaUpdated: (persona: Persona) => void;
}

function EditPersonaSheet({
  open,
  onOpenChange,
  persona,
  onPersonaUpdated,
}: EditPersonaSheetProps) {
  const t = useTranslations("PlatformSettings");
  const [formData, setFormData] =
    useState<PersonaFormData>(EMPTY_PERSONA_FORM);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && persona) {
      const groups = (Array.isArray(persona.groups) ? persona.groups : []) as EntraResult[];
      setFormData({
        name: persona.name,
        provider: persona.provider,
        email: persona.email,
        selectedGroups: groups,
      });
    }
  }, [open, persona]);

  const isValid = formData.name.trim();

  const handleSubmit = async () => {
    if (!isValid || !persona) return;
    setIsSaving(true);
    try {
      const groups: PersonaGroup[] = formData.selectedGroups.map((g) => ({
        id: g.id,
        displayName: g.displayName,
        email: g.email,
      }));
      const { persona: updated } = await $orpc.updatePersona({
        id: persona.id,
        name: formData.name.trim(),
        displayName: formData.name.trim(),
        email: formData.email,
        groups,
      });
      onPersonaUpdated(updated);
      onOpenChange(false);
      toast.success(t("personas.toast.updated"));
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("personas.toast.updateFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-lg! rounded-lg border flex flex-col overflow-hidden">
        <SheetHeader className="border-b py-3 px-3">
          <SheetTitle>{t("personas.editTitle")}</SheetTitle>
          <SheetDescription>{t("personas.editDescription")}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <PersonaFormFields
            data={formData}
            onChange={setFormData}
            disabled={isSaving}
            t={t}
          />
        </div>
        <div className="border-t px-4 py-3 flex items-center gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSaving}>
            {isSaving && <Loader2 className="size-3.5 animate-spin" />}
            {t("save")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Personas Section ─────────────────────────────────────────────────────────

interface PersonasSectionProps {
  personas: Persona[];
  onPersonasChanged: (personas: Persona[]) => void;
}

export function PersonasSection({
  personas,
  onPersonasChanged,
}: PersonasSectionProps) {
  const t = useTranslations("PlatformSettings");
  const [searchQuery, setSearchQuery] = useState("");
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [deletePersona, setDeletePersona] = useState<Persona | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredPersonas = searchQuery.trim()
    ? personas.filter((p) => {
        const query = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(query) ||
          p.displayName.toLowerCase().includes(query) ||
          (p.email?.toLowerCase().includes(query) ?? false) ||
          p.provider.toLowerCase().includes(query)
        );
      })
    : personas;

  const handlePersonaCreated = (persona: Persona) => {
    onPersonasChanged([...personas, persona]);
  };

  const handlePersonaUpdated = (updated: Persona) => {
    onPersonasChanged(
      personas.map((p) => (p.id === updated.id ? updated : p)),
    );
  };

  const handleEdit = (persona: Persona) => {
    setEditingPersona(persona);
    setEditSheetOpen(true);
  };

  const handleDelete = async () => {
    if (!deletePersona) return;
    setIsDeleting(true);
    try {
      await $orpc.deletePersona({ id: deletePersona.id });
      onPersonasChanged(personas.filter((p) => p.id !== deletePersona.id));
      toast.success(t("personas.toast.deleted"));
      setDeletePersona(null);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("personas.toast.deleteFailed"),
      );
    } finally {
      setIsDeleting(false);
    }
  };


  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("personas.title")}</CardTitle>
          <CardDescription>{t("personas.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("personas.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-full"
              />
            </div>
            <Button
              className="gap-1.5"
              onClick={() => setAddSheetOpen(true)}
            >
              <Plus className="size-3.5" />
              {t("personas.addPersona")}
            </Button>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>{t("personas.table.name")}</TableHead>
                  <TableHead>{t("personas.table.groups")}</TableHead>
                  <TableHead>{t("personas.table.provider")}</TableHead>
                  <TableHead>{t("personas.table.email")}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPersonas.length > 0 ? (
                  filteredPersonas.map((persona) => (
                    <TableRow key={persona.id}>
                      <TableCell>
                        <span className="font-medium text-foreground">
                          {persona.name}
                        </span>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const groups = Array.isArray(persona.groups)
                            ? (persona.groups as PersonaGroup[])
                            : [];
                          return groups.length > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {groups.map((g) => g.displayName).join(", ")}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const preset = PERSONA_PROVIDERS.find(
                            (p) => p.id === persona.provider,
                          );
                          return preset ? (
                            <div className="flex items-center gap-2">
                              <Image
                                src={preset.icon}
                                alt=""
                                width={16}
                                height={16}
                                className="rounded-sm shrink-0"
                              />
                              <span className="text-muted-foreground">
                                {preset.name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              {persona.provider}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">
                          {persona.email ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell>
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
                              <DropdownMenuItem
                                onClick={() => handleEdit(persona)}
                              >
                                <Pencil className="size-3.5" />
                                {t("personas.actions.edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeletePersona(persona)}
                                variant="destructive"
                              >
                                <Trash2 className="size-3.5" />
                                {t("personas.actions.delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <Users className="size-8 text-muted-foreground/40 mb-1" />
                        <p className="text-xs text-muted-foreground">
                          {searchQuery.trim()
                            ? t("personas.noResults", {
                                query: searchQuery,
                              })
                            : t("personas.empty")}
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

      <AddPersonaSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        onPersonaCreated={handlePersonaCreated}
      />

      <EditPersonaSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        persona={editingPersona}
        onPersonaUpdated={handlePersonaUpdated}
      />

      <AlertDialog
        open={!!deletePersona}
        onOpenChange={(open) => !open && setDeletePersona(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("personas.deleteDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("personas.deleteDialog.description", {
                name: deletePersona?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("personas.deleteDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="size-3.5 animate-spin" />}
              {t("personas.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
