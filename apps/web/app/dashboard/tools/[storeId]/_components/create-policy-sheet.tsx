"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  BookMarked,
  FilePlus,
  Link2,
  Loader2,
  Search,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { $orpc } from "@/lib/api";

interface CreatePolicySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  onCreated?: () => void;
}

type LibraryPolicy = {
  id: string;
  name: string;
  description: string;
  cedarCode: string;
  type: "permit" | "forbid";
  status: string;
  tags: string[];
  isTemplate: boolean;
};

const typeColorClasses: Record<"permit" | "forbid", string> = {
  permit:
    "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30",
  forbid:
    "text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-950/30",
};

const statusColorClasses: Record<string, string> = {
  draft:
    "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/30",
  in_review:
    "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30",
  published:
    "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30",
  archived:
    "text-gray-600 border-gray-200 bg-gray-50 dark:text-gray-400 dark:border-gray-700 dark:bg-gray-900/30",
};

export function CreatePolicySheet({
  open,
  onOpenChange,
  storeId,
  onCreated,
}: CreatePolicySheetProps) {
  const t = useTranslations("ToolPolicyList");

  const [searchQuery, setSearchQuery] = useState("");
  const [templates, setTemplates] = useState<LibraryPolicy[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<LibraryPolicy | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"permit" | "forbid">("permit");
  const [action, setAction] = useState("");
  const [cedarCode, setCedarCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      // Only published templates are eligible to pull into a store.
      const res = await $orpc.listPolicies({
        isTemplate: true,
        status: "published",
      });
      setTemplates(
        res.policies.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          cedarCode: p.cedarCode,
          type: p.type as "permit" | "forbid",
          status: p.status,
          tags: p.tags,
          isTemplate: p.isTemplate,
        })),
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load templates";
      toast.error(msg);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSelectedTemplate(null);
      setName("");
      setDescription("");
      setType("permit");
      setAction("");
      setCedarCode("");
      setIsCreating(false);
      setIsImporting(false);
    } else {
      fetchTemplates();
    }
  }, [open, fetchTemplates]);

  const filteredTemplates = templates.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  });

  const getTypeBadge = (policyType: "permit" | "forbid") => (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 ${typeColorClasses[policyType]}`}
    >
      {policyType}
    </Badge>
  );

  const getStatusBadge = (status: string) => (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 ${statusColorClasses[status] ?? statusColorClasses.draft}`}
    >
      {status}
    </Badge>
  );

  const handleUseTemplate = async () => {
    if (!selectedTemplate) return;
    setIsImporting(true);
    try {
      await $orpc.createToolPolicyFromLibrary({
        storeId,
        libraryPolicyId: selectedTemplate.id,
      });
      toast.success(
        t("createSheet.toast.templateApplied", {
          name: selectedTemplate.name,
        }),
      );
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to import";
      toast.error(msg);
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreatePolicy = async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      await $orpc.createToolPolicyStandalone({
        storeId,
        name: name.trim(),
        description: description.trim(),
        cedarCode,
        type,
        action: action.trim(),
        principalTypes: [],
        resourceTypes: [],
        contextFields: [],
      });
      toast.success(t("createSheet.toast.created", { name }));
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create";
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="top-4! right-4! bottom-4! left-auto! h-auto! w-full! sm:max-w-xl! rounded-lg border flex flex-col overflow-hidden">
        <SheetHeader className="border-b py-3 px-4">
          <SheetTitle>{t("createSheet.title")}</SheetTitle>
          <SheetDescription>{t("createSheet.description")}</SheetDescription>
        </SheetHeader>

        <Tabs
          defaultValue="template"
          className="flex-1 flex flex-col overflow-hidden gap-0"
        >
          <div className="px-4 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="template" className="flex-1">
                <BookMarked className="h-3.5 w-3.5" />
                {t("createSheet.tabs.template")}
              </TabsTrigger>
              <TabsTrigger value="new" className="flex-1">
                <FilePlus className="h-3.5 w-3.5" />
                {t("createSheet.tabs.new")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="template"
            className="flex-1 flex flex-col overflow-hidden mt-0 px-4 pb-4"
          >
            {selectedTemplate ? (
              <TemplatePreview
                template={selectedTemplate}
                getTypeBadge={getTypeBadge}
                getStatusBadge={getStatusBadge}
                onBack={() => setSelectedTemplate(null)}
                onConfirm={handleUseTemplate}
                isImporting={isImporting}
                t={t}
              />
            ) : (
              <TemplateList
                templates={filteredTemplates}
                templatesLoading={templatesLoading}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onSelect={setSelectedTemplate}
                getTypeBadge={getTypeBadge}
                getStatusBadge={getStatusBadge}
                t={t}
              />
            )}
          </TabsContent>

          <TabsContent
            value="new"
            className="flex-1 flex flex-col overflow-hidden mt-0 px-4 pb-4"
          >
            <div className="flex-1 overflow-y-auto space-y-4 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="policy-name">
                  {t("createSheet.form.name")}
                </Label>
                <Input
                  id="policy-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("createSheet.form.namePlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="policy-description">
                  {t("createSheet.form.description")}
                </Label>
                <Textarea
                  id="policy-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("createSheet.form.descriptionPlaceholder")}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("createSheet.form.type")}</Label>
                  <Select
                    value={type}
                    onValueChange={(v) => setType(v as "permit" | "forbid")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="permit">
                        {t("createSheet.form.typePermit")}
                      </SelectItem>
                      <SelectItem value="forbid">
                        {t("createSheet.form.typeForbid")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="policy-action">
                    {t("createSheet.form.action")}
                  </Label>
                  <Input
                    id="policy-action"
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    placeholder={t("createSheet.form.actionPlaceholder")}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="policy-cedar">
                  {t("createSheet.form.cedarCode")}
                </Label>
                <Textarea
                  id="policy-cedar"
                  value={cedarCode}
                  onChange={(e) => setCedarCode(e.target.value)}
                  placeholder={t("createSheet.form.cedarPlaceholder")}
                  rows={10}
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <div className="border-t pt-3 mt-3 flex justify-end">
              <Button
                size="sm"
                onClick={handleCreatePolicy}
                disabled={!name.trim() || isCreating}
                className="active:scale-[0.96]"
              >
                {isCreating && (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                )}
                {t("createSheet.createPolicy")}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function TemplateList({
  templates,
  templatesLoading,
  searchQuery,
  onSearchChange,
  onSelect,
  getTypeBadge,
  getStatusBadge,
  t,
}: {
  templates: LibraryPolicy[];
  templatesLoading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelect: (template: LibraryPolicy) => void;
  getTypeBadge: (type: "permit" | "forbid") => React.ReactNode;
  getStatusBadge: (status: string) => React.ReactNode;
  t: ReturnType<typeof useTranslations<"ToolPolicyList">>;
}) {
  return (
    <>
      <div className="relative pt-3">
        <Search className="absolute left-3 top-1/2 mt-1.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("createSheet.templateSearch")}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pt-3">
        {templatesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t("createSheet.templateEmpty")}
            </p>
          </div>
        ) : (
          templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="w-full rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors space-y-1.5 active:scale-[0.99]"
              onClick={() => onSelect(template)}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{template.name}</span>
                {getTypeBadge(template.type)}
                {getStatusBadge(template.status)}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 text-pretty">
                {template.description}
              </p>
              <div className="flex flex-wrap gap-1">
                {template.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );
}

function TemplatePreview({
  template,
  getTypeBadge,
  getStatusBadge,
  onBack,
  onConfirm,
  isImporting,
  t,
}: {
  template: LibraryPolicy;
  getTypeBadge: (type: "permit" | "forbid") => React.ReactNode;
  getStatusBadge: (status: string) => React.ReactNode;
  onBack: () => void;
  onConfirm: () => void;
  isImporting: boolean;
  t: ReturnType<typeof useTranslations<"ToolPolicyList">>;
}) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden pt-3">
      <div className="flex items-center gap-2 mb-3">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={onBack}
        >
          <ArrowLeft className="size-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("createSheet.templatePreview")}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{template.name}</h3>
            {getTypeBadge(template.type)}
            {getStatusBadge(template.status)}
            {template.isTemplate && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 text-purple-600 border-purple-200 bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:bg-purple-950/30"
              >
                <Link2 className="size-3 mr-1" />
                {t("createSheet.templateLink")}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {template.description}
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t("createSheet.cedarDefinition")}
          </p>
          <pre className="rounded-md bg-muted p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
            {template.cedarCode}
          </pre>
        </div>
      </div>

      <div className="border-t pt-3 mt-3 flex justify-end">
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={isImporting}
          className="active:scale-[0.96]"
        >
          {isImporting && (
            <Loader2 className="size-3.5 mr-1.5 animate-spin" />
          )}
          {t("createSheet.useTemplate")}
        </Button>
      </div>
    </div>
  );
}
