"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { $orpc } from "@/lib/api";
import { SchemaEditorPanel } from "../_components/schema-editor-panel";
import {
  SKILL_MD_EXAMPLE,
  MCP_SERVER_PLACEHOLDER,
  MCP_TOOL_PLACEHOLDER,
  A2A_AGENT_CARD_PLACEHOLDER,
  CUSTOM_PLACEHOLDER,
  AGENT_SKILLS_DEFINITION_PLACEHOLDER,
} from "../_components/constants";

// UI protocol choices. Mapped to the GA `recordType` enum on submit:
//   MCP -> MCP, A2A -> AGENT, AGENT_SKILLS -> SKILL, CUSTOM -> CUSTOM.
type Protocol = "MCP" | "A2A" | "AGENT_SKILLS" | "CUSTOM";
type SyncMode = "URL" | "MANUAL";
type CredentialType = "IAM" | "OAUTH" | "NONE";

const MANUAL_ONLY_PROTOCOLS: Protocol[] = ["CUSTOM", "AGENT_SKILLS"];

const PROTOCOL_TO_RECORD_TYPE: Record<Protocol, "MCP" | "AGENT" | "SKILL" | "CUSTOM"> = {
  MCP: "MCP",
  A2A: "AGENT",
  AGENT_SKILLS: "SKILL",
  CUSTOM: "CUSTOM",
};

interface RadioCardProps {
  value: string;
  selected: string;
  title: string;
  description: string;
  disabled?: boolean;
}

function RadioCard({ value, selected, title, description, disabled }: RadioCardProps) {
  const isSelected = selected === value;
  return (
    <label
      className={cn(
        "flex items-start gap-3 rounded-md border bg-card p-3 cursor-pointer transition-colors",
        isSelected
          ? "border-primary ring-1 ring-primary/30 bg-primary/[0.03]"
          : "hover:bg-muted/40",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <RadioGroupItem value={value} disabled={disabled} className="mt-0.5" />
      <div className="space-y-1 min-w-0">
        <div className="text-xs font-medium">{title}</div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </label>
  );
}

export default function CreateRegistryRecordPage() {
  const t = useTranslations("CreateRecordDialog");
  const p = useTranslations("CreateRecordDialog.page");
  const router = useRouter();
  const params = useParams();
  const registryId = params.registryId as string;

  const [syncMode, setSyncMode] = useState<SyncMode>("URL");
  const [protocol, setProtocol] = useState<Protocol>("MCP");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [syncUrl, setSyncUrl] = useState("");
  const [credType, setCredType] = useState<CredentialType>("IAM");
  const [credArn, setCredArn] = useState("");
  const [oauthScopes, setOauthScopes] = useState("");
  const [iamRoleArn, setIamRoleArn] = useState("");
  const [iamService, setIamService] = useState("execute-api");
  const [iamRegion, setIamRegion] = useState("");

  const [serverSchema, setServerSchema] = useState("");
  const [toolSchema, setToolSchema] = useState("");
  const [addToolDefinition, setAddToolDefinition] = useState(false);
  const [agentCard, setAgentCard] = useState("");
  const [customSchema, setCustomSchema] = useState("");
  const [skillMd, setSkillMd] = useState("");
  const [skillDefinition, setSkillDefinition] = useState("");
  const [includeSkillDoc, setIncludeSkillDoc] = useState(true);
  const [includeSkillDef, setIncludeSkillDef] = useState(true);

  const [showServerSchema, setShowServerSchema] = useState(true);
  const [showToolSchema, setShowToolSchema] = useState(true);
  const [showAgentCardSchema, setShowAgentCardSchema] = useState(true);
  const [showSkillDefSchema, setShowSkillDefSchema] = useState(true);

  const [submitting, setSubmitting] = useState<null | "draft" | "approval">(null);

  const isLoading = submitting !== null;

  const onProtocolChange = (next: Protocol) => {
    setProtocol(next);
    if (MANUAL_ONLY_PROTOCOLS.includes(next)) setSyncMode("MANUAL");
  };

  const validate = (): string | null => {
    if (syncMode === "URL") {
      if (!syncUrl.trim()) return p("endpointRequired");
    } else {
      if (!name.trim()) return t("validation.nameRequired");
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(name)) return t("validation.nameFormat");
      if (protocol === "MCP") {
        try { JSON.parse(serverSchema); } catch { return t("validation.invalidJson"); }
        if (addToolDefinition && toolSchema.trim()) {
          try { JSON.parse(toolSchema); } catch { return t("validation.invalidJson"); }
        }
      } else if (protocol === "A2A") {
        try { JSON.parse(agentCard); } catch { return t("validation.agentCardInvalidJson"); }
      } else if (protocol === "CUSTOM") {
        try { JSON.parse(customSchema); } catch { return t("validation.customSchemaInvalidJson"); }
      } else if (protocol === "AGENT_SKILLS") {
        if (!skillMd.trim()) return t("validation.skillMdRequired");
        if (includeSkillDef) {
          try { JSON.parse(skillDefinition); } catch { return t("validation.skillDefinitionInvalidJson"); }
        }
      }
    }
    return null;
  };

  const buildPayload = () => {
    const recordName =
      syncMode === "URL"
        ? name.trim() ||
          syncUrl
            .trim()
            .replace(/https?:\/\//, "")
            .replace(/[^a-zA-Z0-9]/g, "_")
            .replace(/^_+|_+$/g, "")
            .substring(0, 48) ||
          "url_record"
        : name.trim();

    const recordType = PROTOCOL_TO_RECORD_TYPE[protocol];

    if (syncMode === "URL") {
      // GA: URL sync is expressed as a per-descriptor `source.fromUrl` on the
      // primary descriptor (mcpServer for MCP, a2aAgentCard for AGENT). There is
      // no separate synchronizationType field.
      const credConfigs =
        credType === "OAUTH" && credArn.trim()
          ? [
              {
                credentialProviderType: "OAUTH" as const,
                credentialProvider: {
                  oauthCredentialProvider: {
                    providerArn: credArn.trim(),
                    grantType: "CLIENT_CREDENTIALS",
                    ...(oauthScopes.trim() && {
                      scopes: oauthScopes
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }),
                  },
                },
              },
            ]
          : credType === "IAM" && iamRoleArn.trim()
            ? [
                {
                  credentialProviderType: "IAM" as const,
                  credentialProvider: {
                    iamCredentialProvider: {
                      roleArn: iamRoleArn.trim(),
                      service: iamService.trim() || "execute-api",
                      ...(iamRegion.trim() && { region: iamRegion.trim() }),
                    },
                  },
                },
              ]
            : undefined;

      const source = {
        fromUrl: {
          url: syncUrl.trim(),
          ...(credConfigs && { credentialProviderConfigurations: credConfigs }),
        },
      };
      const descriptors =
        protocol === "A2A"
          ? { a2aAgentCard: { source } }
          : { mcpServer: { source } };

      return {
        registryId,
        name: recordName,
        recordType,
        description: description.trim() || undefined,
        recordVersion: "1.0",
        descriptors,
      };
    }

    let descriptors: Record<string, unknown> = {};
    if (protocol === "MCP") {
      descriptors = {
        mcpServer: {
          data: serverSchema.trim(),
          ...(addToolDefinition && toolSchema.trim() && {
            additionalData: { tools: { data: toolSchema.trim() } },
          }),
        },
      };
    } else if (protocol === "A2A") {
      descriptors = { a2aAgentCard: { data: agentCard.trim() } };
    } else if (protocol === "CUSTOM") {
      descriptors = { custom: { data: customSchema.trim() } };
    } else if (protocol === "AGENT_SKILLS") {
      descriptors = {
        agentSkillsDefinition: {
          ...(includeSkillDef && { data: skillDefinition.trim() }),
          ...(includeSkillDoc && {
            additionalData: { skillMd: { data: skillMd.trim() } },
          }),
        },
      };
    }

    return {
      registryId,
      name: recordName,
      recordType,
      description: description.trim() || undefined,
      recordVersion: "1.0",
      descriptors,
    };
  };

  const submit = async (mode: "draft" | "approval") => {
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(mode);
    try {
      const payload = buildPayload();
      const res = await $orpc.createRegistryRecord(payload);
      const recordId = (res as { recordId?: string })?.recordId;

      if (mode === "approval" && recordId) {
        try {
          await $orpc.submitRegistryRecord({ registryId, recordId });
          toast.success(p("toast.approvalSuccess"));
        } catch (e) {
          const msg = e instanceof Error ? e.message : p("toast.approvalFailed");
          toast.error(msg);
        }
      } else {
        toast.success(t("toast.success"));
      }

      if (mode === "approval" && recordId) {
        router.push(`/dashboard/registry/${registryId}/records/${recordId}`);
      } else {
        router.push(`/dashboard/registry/${registryId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("toast.error");
      toast.error(msg);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="flex-1 h-full overflow-hidden relative flex flex-col">
      <div className="flex items-center border-b px-4 py-3 gap-3">
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={() => router.push(`/dashboard/registry/${registryId}`)}
          aria-label={p("backAria")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-foreground">{p("title")}</h1>
          <p className="text-[11px] text-muted-foreground truncate">
            {p("registryPrefix")}{" "}
            <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
              {registryId}
            </code>
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl p-6 space-y-6">
          {/* Record source */}
          <Card className="pt-0">
            <CardHeader className="border-b bg-muted/40 py-3">
              <CardTitle className="text-sm font-semibold text-foreground">{p("sourceCard.title")}</CardTitle>
              <CardDescription>
                {p("sourceCard.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <RadioGroup
                value={syncMode}
                onValueChange={(v) => setSyncMode(v as SyncMode)}
                className="grid-cols-1 md:grid-cols-2"
              >
                <RadioCard
                  value="URL"
                  selected={syncMode}
                  title={p("sourceCard.sync.title")}
                  description={p("sourceCard.sync.description")}
                  disabled={MANUAL_ONLY_PROTOCOLS.includes(protocol) || isLoading}
                />
                <RadioCard
                  value="MANUAL"
                  selected={syncMode}
                  title={p("sourceCard.manual.title")}
                  description={p("sourceCard.manual.description")}
                  disabled={isLoading}
                />
              </RadioGroup>
              {MANUAL_ONLY_PROTOCOLS.includes(protocol) && (
                <p className="text-[11px] text-muted-foreground mt-3">
                  {t("manualOnlyHint")}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Record details */}
          <Card className="pt-0">
            <CardHeader className="border-b bg-muted/40 py-3">
              <CardTitle className="text-sm font-semibold text-foreground">{p("detailsCard.title")}</CardTitle>
              <CardDescription>
                {p("detailsCard.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-5">
              {/* Type */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">{p("detailsCard.typeLabel")}</Label>
                <RadioGroup
                  value={protocol}
                  onValueChange={(v) => onProtocolChange(v as Protocol)}
                  className="grid-cols-1 md:grid-cols-2"
                >
                  <RadioCard
                    value="MCP"
                    selected={protocol}
                    title={p("detailsCard.types.mcp.title")}
                    description={p("detailsCard.types.mcp.description")}
                    disabled={isLoading}
                  />
                  <RadioCard
                    value="A2A"
                    selected={protocol}
                    title={p("detailsCard.types.agent.title")}
                    description={p("detailsCard.types.agent.description")}
                    disabled={isLoading}
                  />
                  <RadioCard
                    value="AGENT_SKILLS"
                    selected={protocol}
                    title={p("detailsCard.types.agentSkills.title")}
                    description={p("detailsCard.types.agentSkills.description")}
                    disabled={isLoading}
                  />
                  <RadioCard
                    value="CUSTOM"
                    selected={protocol}
                    title={p("detailsCard.types.custom.title")}
                    description={p("detailsCard.types.custom.description")}
                    disabled={isLoading}
                  />
                </RadioGroup>
              </div>

              {/* Name + description */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="name" className="text-xs font-medium">
                    {t("nameLabel")}
                    {syncMode === "MANUAL" && <span className="text-destructive ml-0.5">*</span>}
                  </Label>
                  <Input
                    id="name"
                    placeholder={syncMode === "URL" ? p("detailsCard.deriveFromUrl") : t("namePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isLoading}
                    maxLength={64}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {p("detailsCard.nameHint")}
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="desc" className="text-xs font-medium">
                    {t("descriptionLabel")}
                  </Label>
                  <Input
                    id="desc"
                    placeholder={
                      protocol === "MCP"
                        ? t("descriptionPlaceholderMcp")
                        : protocol === "A2A"
                          ? t("descriptionPlaceholderA2a")
                          : protocol === "AGENT_SKILLS"
                            ? t("descriptionPlaceholderSkill")
                            : t("descriptionPlaceholderCustom")
                    }
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isLoading}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {p("detailsCard.descriptionHint")}
                  </p>
                </div>
              </div>

              {/* URL source fields */}
              {syncMode === "URL" && (
                <div className="space-y-4 pt-1">
                  <div className="grid gap-1.5">
                    <Label htmlFor="endpoint" className="text-xs font-medium">
                      {p("detailsCard.endpointLabel")} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="endpoint"
                      placeholder={p("detailsCard.endpointPlaceholder")}
                      value={syncUrl}
                      onChange={(e) => setSyncUrl(e.target.value)}
                      disabled={isLoading}
                    />
                    <p className="text-[10px] text-muted-foreground">{p("detailsCard.endpointHint")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{p("detailsCard.credentialType")}</Label>
                    <RadioGroup
                      value={credType}
                      onValueChange={(v) => setCredType(v as CredentialType)}
                      className="gap-2"
                    >
                      <RadioCard
                        value="IAM"
                        selected={credType}
                        title={p("detailsCard.credentials.iam.title")}
                        description={p("detailsCard.credentials.iam.description")}
                        disabled={isLoading}
                      />
                      <RadioCard
                        value="OAUTH"
                        selected={credType}
                        title={p("detailsCard.credentials.oauth.title")}
                        description={p("detailsCard.credentials.oauth.description")}
                        disabled={isLoading}
                      />
                      <RadioCard
                        value="NONE"
                        selected={credType}
                        title={p("detailsCard.credentials.none.title")}
                        description={p("detailsCard.credentials.none.description")}
                        disabled={isLoading}
                      />
                    </RadioGroup>
                  </div>

                  {credType === "IAM" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="grid gap-1.5 md:col-span-2">
                        <Label htmlFor="iamArn" className="text-xs font-medium">
                          {p("detailsCard.roleArnLabel")}
                        </Label>
                        <Input
                          id="iamArn"
                          placeholder="arn:aws:iam::123456789012:role/MyRole"
                          value={iamRoleArn}
                          onChange={(e) => setIamRoleArn(e.target.value)}
                          disabled={isLoading}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="iamService" className="text-xs font-medium">
                          {p("detailsCard.serviceLabel")}
                        </Label>
                        <Input
                          id="iamService"
                          placeholder={p("detailsCard.servicePlaceholder")}
                          value={iamService}
                          onChange={(e) => setIamService(e.target.value)}
                          disabled={isLoading}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="iamRegion" className="text-xs font-medium">
                          {p("detailsCard.regionLabel")}
                        </Label>
                        <Input
                          id="iamRegion"
                          placeholder="us-west-2"
                          value={iamRegion}
                          onChange={(e) => setIamRegion(e.target.value)}
                          disabled={isLoading}
                        />
                      </div>
                    </div>
                  )}

                  {credType === "OAUTH" && (
                    <div className="grid gap-4">
                      <div className="grid gap-1.5">
                        <Label htmlFor="oauthArn" className="text-xs font-medium">
                          {p("detailsCard.oauthArnLabel")}
                        </Label>
                        <Input
                          id="oauthArn"
                          placeholder="arn:aws:bedrock-agentcore:..."
                          value={credArn}
                          onChange={(e) => setCredArn(e.target.value)}
                          disabled={isLoading}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="oauthScopes" className="text-xs font-medium">
                          {p("detailsCard.oauthScopesLabel")}
                        </Label>
                        <Input
                          id="oauthScopes"
                          placeholder="mcp-gateway/invoke"
                          value={oauthScopes}
                          onChange={(e) => setOauthScopes(e.target.value)}
                          disabled={isLoading}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {syncMode === "MANUAL" && protocol === "MCP" && (
            <Card className="pt-0">
              <CardHeader className="border-b bg-muted/40 py-3">
                <CardTitle className="text-sm font-semibold text-foreground">{p("mcpCard.title")}</CardTitle>
                <CardDescription>
                  {p("mcpCard.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-5">
                <SchemaEditorPanel
                  id="server-schema"
                  label={p("mcpCard.serverLabel")}
                  required
                  value={serverSchema}
                  onChange={setServerSchema}
                  disabled={isLoading}
                  schemaKey="mcp-server"
                  showSchema={showServerSchema}
                  onShowSchemaChange={setShowServerSchema}
                  placeholder={MCP_SERVER_PLACEHOLDER}
                />

                <div className="flex items-start gap-2 pt-2 border-t">
                  <Checkbox
                    id="add-tool-def"
                    checked={addToolDefinition}
                    onCheckedChange={(v) => setAddToolDefinition(Boolean(v))}
                    disabled={isLoading}
                    className="mt-0.5"
                  />
                  <label htmlFor="add-tool-def" className="cursor-pointer">
                    <div className="text-xs font-medium">{p("mcpCard.addToolTitle")}</div>
                    <p className="text-[11px] text-muted-foreground">
                      {p("mcpCard.addToolDescription")}
                    </p>
                  </label>
                </div>

                {addToolDefinition && (
                  <SchemaEditorPanel
                    id="tool-schema"
                    label={p("mcpCard.toolLabel")}
                    value={toolSchema}
                    onChange={setToolSchema}
                    disabled={isLoading}
                    schemaKey="mcp-tool"
                    showSchema={showToolSchema}
                    onShowSchemaChange={setShowToolSchema}
                    placeholder={MCP_TOOL_PLACEHOLDER}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {syncMode === "MANUAL" && protocol === "A2A" && (
            <Card className="pt-0">
              <CardHeader className="border-b bg-muted/40 py-3">
                <CardTitle className="text-sm font-semibold text-foreground">{p("agentCardSection.title")}</CardTitle>
                <CardDescription>
                  {p("agentCardSection.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <SchemaEditorPanel
                  id="agent-card"
                  label={p("agentCardSection.agentCardLabel")}
                  required
                  value={agentCard}
                  onChange={setAgentCard}
                  disabled={isLoading}
                  schemaKey="a2a-agent-card"
                  showSchema={showAgentCardSchema}
                  onShowSchemaChange={setShowAgentCardSchema}
                  placeholder={A2A_AGENT_CARD_PLACEHOLDER}
                />
              </CardContent>
            </Card>
          )}

          {syncMode === "MANUAL" && protocol === "CUSTOM" && (
            <Card className="pt-0">
              <CardHeader className="border-b bg-muted/40 py-3">
                <CardTitle className="text-sm font-semibold text-foreground">{p("customCard.title")}</CardTitle>
                <CardDescription>
                  {p("customCard.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <SchemaEditorPanel
                  id="custom-schema"
                  label={p("customCard.customLabel")}
                  required
                  value={customSchema}
                  onChange={setCustomSchema}
                  disabled={isLoading}
                  schemaKey="mcp-server"
                  showSchema={false}
                  onShowSchemaChange={() => {}}
                  placeholder={CUSTOM_PLACEHOLDER}
                />
              </CardContent>
            </Card>
          )}

          {syncMode === "MANUAL" && protocol === "AGENT_SKILLS" && (
            <Card className="pt-0">
              <CardHeader className="border-b bg-muted/40 py-3">
                <CardTitle className="text-sm font-semibold text-foreground">{p("skillsCard.title")}</CardTitle>
                <CardDescription>
                  {p("skillsCard.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-5">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="include-skill-doc"
                    checked={includeSkillDoc}
                    onCheckedChange={(v) => setIncludeSkillDoc(Boolean(v))}
                    disabled={isLoading}
                    className="mt-0.5"
                  />
                  <label htmlFor="include-skill-doc" className="cursor-pointer">
                    <div className="text-xs font-medium">{p("skillsCard.includeDocTitle")}</div>
                    <p className="text-[11px] text-muted-foreground">
                      {p("skillsCard.includeDocDescription")}
                    </p>
                  </label>
                </div>

                {includeSkillDoc && (
                  <div className="grid gap-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="skill-md" className="text-xs font-medium">
                        {p("skillsCard.skillMdLabel")}
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setSkillMd(SKILL_MD_EXAMPLE)}
                        disabled={isLoading}
                      >
                        <FileText className="size-3" />
                        {p("skillsCard.pasteExample")}
                      </Button>
                    </div>
                    <textarea
                      id="skill-md"
                      value={skillMd}
                      onChange={(e) => setSkillMd(e.target.value)}
                      disabled={isLoading}
                      rows={8}
                      className="font-mono text-xs rounded-md border bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                      placeholder={"---\nname: my-skill\ndescription: Brief description of what this skill does.\n---\n# My Skill\n\nDescribe your skill's purpose, usage, and capabilities here."}
                    />
                  </div>
                )}

                <div className="flex items-start gap-2 pt-2 border-t">
                  <Checkbox
                    id="include-skill-def"
                    checked={includeSkillDef}
                    onCheckedChange={(v) => setIncludeSkillDef(Boolean(v))}
                    disabled={isLoading}
                    className="mt-0.5"
                  />
                  <label htmlFor="include-skill-def" className="cursor-pointer">
                    <div className="text-xs font-medium">{p("skillsCard.includeDefTitle")}</div>
                    <p className="text-[11px] text-muted-foreground">
                      {p("skillsCard.includeDefDescription")}
                    </p>
                  </label>
                </div>

                {includeSkillDef && (
                  <SchemaEditorPanel
                    id="skill-definition"
                    label={p("skillsCard.skillDefinitionLabel")}
                    value={skillDefinition}
                    onChange={setSkillDefinition}
                    disabled={isLoading}
                    schemaKey="agent-skills"
                    showSchema={showSkillDefSchema}
                    onShowSchemaChange={setShowSkillDefSchema}
                    placeholder={AGENT_SKILLS_DEFINITION_PLACEHOLDER}
                  />
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/dashboard/registry/${registryId}`)}
              disabled={isLoading}
            >
              {p("actions.cancel")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => submit("draft")}
              disabled={isLoading}
            >
              {submitting === "draft" && <Loader2 className="mr-2 size-3.5 animate-spin" />}
              {p("actions.saveDraft")}
            </Button>
            <Button
              size="sm"
              onClick={() => submit("approval")}
              disabled={isLoading}
            >
              {submitting === "approval" && <Loader2 className="mr-2 size-3.5 animate-spin" />}
              {p("actions.submitForApproval")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

