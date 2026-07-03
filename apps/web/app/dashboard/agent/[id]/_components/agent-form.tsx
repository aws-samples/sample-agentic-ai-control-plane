"use client";

import { AgentAvatar } from "@/components/agent-avatar";
import { Button } from "@/components/ui/button";
import { $orpc } from "@/lib/api";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import { MENU_SECTIONS, type Agent, type RegistryTool, type SectionId } from "./constants";
import {
  ComputeSection,
  GeneralSection,
  ModelSection,
  PromptSection,
  ToolsSection,
} from "./sections";

interface AgentFormProps {
  agent: Agent;
  onAgentUpdated: (agent: Agent) => void;
}

export function AgentForm({ agent, onAgentUpdated }: AgentFormProps) {
  const t = useTranslations("AgentForm");
  const router = useRouter();
  const [activeSection, setActiveSection] = useQueryState<SectionId>(
    "section",
    parseAsStringLiteral([
      "general",
      "model",
      "prompt",
      "tools",
      "compute",
    ] as const)
      .withDefault("general")
      .withOptions({ history: "push" }),
  );
  const [enabledToolIds, setEnabledToolIds] = useState<string[]>(() =>
    (agent.tools ?? [])
      .filter((t) => t.type === "core")
      .map((t) => {
        const meta = t.metadata as Record<string, unknown> | null;
        return (meta?.toolId as string) ?? t.name;
      }),
  );
  const [registryTools, setRegistryTools] = useState<RegistryTool[]>(() =>
    (agent.tools ?? [])
      .filter((t) => t.type === "registry")
      .map((t) => {
        const meta = t.metadata as Record<string, unknown> | null;
        return {
          registryRecordId: (meta?.registryRecordId as string) ?? t.id,
          registryArn: (meta?.registryArn as string) ?? "",
          name: t.name,
          description: (meta?.description as string) ?? undefined,
          protocol: (meta?.protocol as string) ?? "MCP",
          registryName: (meta?.registryName as string) ?? "",
          recordVersion: (meta?.recordVersion as string) ?? undefined,
          agentToolId: t.id,
          targetStatus: t.target?.status,
          targetReasons: t.target?.statusReasons,
        };
      }),
  );
  const [persistedToolIds, setPersistedToolIds] = useState<Map<string, string>>(
    () => {
      const map = new Map<string, string>();
      for (const t of agent.tools ?? []) {
        if (t.type === "registry") {
          const meta = t.metadata as Record<string, unknown> | null;
          const recordId = (meta?.registryRecordId as string) ?? t.id;
          map.set(recordId, t.id);
        } else if (t.type === "core") {
          const meta = t.metadata as Record<string, unknown> | null;
          const toolId = (meta?.toolId as string) ?? t.name;
          map.set(toolId, t.id);
        }
      }
      return map;
    },
  );

  // Poll for CREATING registry tools until they reach READY or CREATE_FAILED.
  useEffect(() => {
    const pending = registryTools.filter((rt) => rt.targetStatus === "CREATING");
    if (pending.length === 0) return;
    let cancelled = false;
    let attempt = 0;

    const tick = async () => {
      if (cancelled) return;
      const updates: {
        recordId: string;
        status: "READY" | "CREATE_FAILED";
        reasons: string[];
      }[] = [];
      await Promise.all(
        pending.map(async (rt) => {
          try {
            const { target } = await $orpc.getGatewayTarget({
              registryRecordId: rt.registryRecordId,
            });
            if (target && target.status !== "CREATING") {
              updates.push({
                recordId: rt.registryRecordId,
                status: target.status as "READY" | "CREATE_FAILED",
                reasons: target.statusReasons,
              });
            }
          } catch {
            // Best-effort; keep polling.
          }
        }),
      );
      if (updates.length > 0) {
        setRegistryTools((prev) =>
          prev.map((rt) => {
            const u = updates.find((x) => x.recordId === rt.registryRecordId);
            return u
              ? { ...rt, targetStatus: u.status, targetReasons: u.reasons }
              : rt;
          }),
        );
      }
      attempt += 1;
      const delay = [2000, 3000, 5000, 8000, 13000][Math.min(attempt, 4)];
      if (!cancelled && attempt < 12) setTimeout(tick, delay);
    };

    const t = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [registryTools]);

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div className="flex h-full w-full flex-col">
        {/* Header */}
        <div className="flex items-center border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => router.push("/dashboard/agents")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
              <AgentAvatar name={agent.name} id={agent.id} size={32} />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">
                {agent.name}
              </h1>
              <p className="text-xs text-muted-foreground">
                {t("header.subtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-44 shrink-0 border p-2 ml-4 my-4 rounded-lg">
            <nav className="flex flex-col gap-0.5">
              {MENU_SECTIONS.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] leading-tight transition-colors ${
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

          {/* Main Content */}
          {activeSection === "prompt" ? (
            <div className="flex flex-1 flex-col overflow-hidden p-6 pt-4">
              <PromptSection
                systemPrompt={agent.systemPrompt}
                onSave={async (systemPrompt) => {
                  const { agent: updated } = await $orpc.updateAgent({
                    id: agent.id,
                    systemPrompt,
                  });
                  onAgentUpdated(updated);
                }}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {activeSection === "tools" ? (
                <div className="pt-4 px-6 pb-6">
                  <ToolsSection
                    agentId={agent.id}
                    enabledToolIds={enabledToolIds}
                    onToolsChange={setEnabledToolIds}
                    registryTools={registryTools}
                    onRegistryToolsChange={setRegistryTools}
                    persistedToolIds={persistedToolIds}
                    onPersistedToolIdsChange={setPersistedToolIds}
                  />
                </div>
              ) : (
                <div className="max-w-6xl mx-auto p-6 pt-4 space-y-4">
                  {activeSection === "general" && (
                    <GeneralSection
                      agent={agent}
                      onAgentUpdated={onAgentUpdated}
                    />
                  )}

                  {activeSection === "model" && (
                    <ModelSection
                      agent={agent}
                      onAgentUpdated={onAgentUpdated}
                    />
                  )}

                  {activeSection === "compute" && <ComputeSection />}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
