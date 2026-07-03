"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { AgentAvatar } from "@/components/agent-avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { UIMessage } from "ai";
import {
  BotIcon,
  CheckCircle2Icon,
  ChevronsUpDownIcon,
  ExternalLinkIcon,
  FlaskConicalIcon,
  LoaderIcon,
  ShieldCheckIcon,
  UserIcon,
  WrenchIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { FilePy, FileTs } from "@phosphor-icons/react";
import type { AgentRuntime, RuntimeLanguage } from "./playground";

type Agent = {
  id: string;
  name: string;
  description: string;
};

type Persona = {
  id: string;
  name: string;
  displayName: string;
  provider: string;
};

type ChatPanelProps = {
  messages: UIMessage[];
  agents: Agent[];
  agentsLoading: boolean;
  selectedAgentId: string | null;
  onAgentChange: (agentId: string) => void;
  runtimes: AgentRuntime[];
  runtimesLoading: boolean;
  selectedRuntimeId: string | null;
  onRuntimeChange: (runtimeId: string) => void;
  personas: Persona[];
  personasLoading: boolean;
  selectedPersonaId: string | null;
  onPersonaChange: (personaId: string | null) => void;
  onSendMessage: (text: string) => void;
  isStreaming: boolean;
};

function RuntimeLanguageIcon({ language, className }: { language?: RuntimeLanguage; className?: string }) {
  if (language === "typescript") return <FileTs size={16} weight="duotone" className={className} />;
  return <FilePy size={16} weight="duotone" className={className} />;
}

export function ChatPanel({
  messages,
  agents,
  agentsLoading,
  selectedAgentId,
  onAgentChange,
  runtimes,
  runtimesLoading,
  selectedRuntimeId,
  onRuntimeChange,
  personas,
  personasLoading,
  selectedPersonaId,
  onPersonaChange,
  onSendMessage,
  isStreaming,
}: ChatPanelProps) {
  const t = useTranslations("Playground");
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [runtimePickerOpen, setRuntimePickerOpen] = useState(false);
  const [personaPickerOpen, setPersonaPickerOpen] = useState(false);
  const agentPickerId = useId();
  const runtimePickerId = useId();
  const personaPickerId = useId();

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const selectedRuntime = useMemo(
    () => runtimes.find((r) => r.agentRuntimeId === selectedRuntimeId) ?? null,
    [runtimes, selectedRuntimeId],
  );

  const selectedPersona = useMemo(
    () => personas.find((p) => p.id === selectedPersonaId) ?? null,
    [personas, selectedPersonaId],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {messages.length === 0 ? (
        <ConversationEmptyState>
          <FlaskConicalIcon className="size-8 text-muted-foreground/40" />
          <div className="space-y-0.5">
            <h3 className="text-xs font-medium">{t("emptyState.title")}</h3>
            <p className="text-[11px] text-muted-foreground">
              {t("emptyState.description")}
            </p>
          </div>
        </ConversationEmptyState>
      ) : (
        <Conversation>
          <ConversationContent>
            {messages.map((message, idx) => {
              const isLastAssistant =
                message.role === "assistant" && idx === messages.length - 1;

              const oauthUrl = getOAuthUrl(message);
              if (oauthUrl) {
                return (
                  <Message key={message.id} from="assistant">
                    <MessageContent>
                      <OAuthCard authUrl={oauthUrl} />
                    </MessageContent>
                  </Message>
                );
              }

              const isEmpty =
                message.parts.length === 1 &&
                message.parts[0].type === "text" &&
                !message.parts[0].text;

              return (
                <Message key={message.id} from={message.role}>
                  <MessageContent>
                    {isLastAssistant && isStreaming && isEmpty ? (
                      <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                        <LoaderIcon className="size-3.5 animate-spin" />
                        {t("streaming.thinking")}
                      </div>
                    ) : (
                      message.parts.map((part, i) => {
                        if (part.type === "text") {
                          return (
                            <MessageResponse key={`${message.id}-${i}`}>
                              {part.text}
                            </MessageResponse>
                          );
                        }
                        if (part.type === "dynamic-tool") {
                          return (
                            <ToolCallCard
                              key={`${message.id}-tool-${i}`}
                              toolName={part.toolName}
                              state={part.state}
                              input={part.input}
                              output={
                                part.state === "output-available"
                                  ? part.output
                                  : undefined
                              }
                            />
                          );
                        }
                        return null;
                      })
                    )}
                  </MessageContent>
                </Message>
              );
            })}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      <div className="border-t p-4">
        <PromptInput
          onSubmit={({ text }) => {
            if (text.trim() && !isStreaming) {
              onSendMessage(text.trim());
            }
          }}
        >
          <PromptInputTextarea
            placeholder={t("input.placeholder")}
            disabled={isStreaming}
          />
          <PromptInputFooter>
            <PromptInputTools>
              {/* Agent picker */}
              <Popover open={agentPickerOpen} onOpenChange={setAgentPickerOpen} triggerId={agentPickerId}>
                <PopoverTrigger
                  id={agentPickerId}
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-44 justify-between gap-2 px-2 text-xs font-medium text-muted-foreground"
                    />
                  }
                >
                  {selectedAgent ? (
                    <span className="flex items-center gap-2 truncate">
                      <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full">
                        <AgentAvatar
                          name={selectedAgent.name}
                          id={selectedAgent.id}
                          size={20}
                        />
                      </span>
                      <span className="truncate">{selectedAgent.name}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <BotIcon className="size-4 shrink-0" />
                      {agentsLoading
                        ? t("agentSelect.loading")
                        : t("agentSelect.placeholder")}
                    </span>
                  )}
                  <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent
                  className="w-72 p-0"
                  align="start"
                  side="top"
                  sideOffset={8}
                >
                  <Command>
                    <CommandInput placeholder={t("agentSelect.search")} />
                    <CommandList>
                      <CommandEmpty>{t("agentSelect.empty")}</CommandEmpty>
                      <CommandGroup>
                        {agents.map((agent) => (
                          <CommandItem
                            key={agent.id}
                            value={`${agent.name} ${agent.description}`}
                            data-checked={selectedAgentId === agent.id}
                            onSelect={() => {
                              onAgentChange(agent.id);
                              setAgentPickerOpen(false);
                            }}
                          >
                            <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full">
                              <AgentAvatar
                                name={agent.name}
                                id={agent.id}
                                size={24}
                              />
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-xs font-medium">
                                {agent.name}
                              </span>
                              {agent.description && (
                                <span className="truncate text-[11px] text-muted-foreground">
                                  {agent.description}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Runtime picker */}
              <Popover
                open={runtimePickerOpen}
                onOpenChange={setRuntimePickerOpen}
                triggerId={runtimePickerId}
              >
                <PopoverTrigger
                  id={runtimePickerId}
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-52 justify-between gap-2 px-2 text-xs font-medium text-muted-foreground"
                    />
                  }
                >
                  {selectedRuntime ? (
                    <span className="flex items-center gap-2 truncate">
                      <RuntimeLanguageIcon language={selectedRuntime.language} className="shrink-0" />
                      <span className="truncate">{selectedRuntime.name}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <FilePy size={16} weight="duotone" className="shrink-0 opacity-50" />
                      {runtimesLoading
                        ? t("runtimeSelect.loading")
                        : t("runtimeSelect.placeholder")}
                    </span>
                  )}
                  <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent
                  className="w-72 p-0"
                  align="start"
                  side="top"
                  sideOffset={8}
                >
                  <Command>
                    <CommandInput
                      placeholder={t("runtimeSelect.search")}
                    />
                    <CommandList>
                      <CommandEmpty>{t("runtimeSelect.empty")}</CommandEmpty>
                      <CommandGroup>
                        {runtimes.map((runtime) => (
                          <CommandItem
                            key={runtime.agentRuntimeId}
                            value={`${runtime.name} ${runtime.description ?? ""}`}
                            data-checked={
                              selectedRuntimeId === runtime.agentRuntimeId
                            }
                            onSelect={() => {
                              onRuntimeChange(runtime.agentRuntimeId);
                              setRuntimePickerOpen(false);
                            }}
                          >
                            <RuntimeLanguageIcon language={runtime.language} className="shrink-0" />
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-xs font-medium">
                                {runtime.name}
                              </span>
                              {runtime.description && (
                                <span className="truncate text-[11px] text-muted-foreground">
                                  {runtime.description}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Persona picker */}
              <Popover
                open={personaPickerOpen}
                onOpenChange={setPersonaPickerOpen}
                triggerId={personaPickerId}
              >
                <PopoverTrigger
                  id={personaPickerId}
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-44 justify-between gap-2 px-2 text-xs font-medium text-muted-foreground"
                    />
                  }
                >
                  {selectedPersona ? (
                    <span className="flex items-center gap-2 truncate">
                      <UserIcon className="size-4 shrink-0" />
                      <span className="truncate">
                        {selectedPersona.displayName}
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <UserIcon className="size-4 shrink-0 opacity-50" />
                      {personasLoading
                        ? t("personaSelect.loading")
                        : t("personaSelect.placeholder")}
                    </span>
                  )}
                  <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent
                  className="w-72 p-0"
                  align="start"
                  side="top"
                  sideOffset={8}
                >
                  <Command>
                    <CommandInput placeholder={t("personaSelect.search")} />
                    <CommandList>
                      <CommandEmpty>{t("personaSelect.empty")}</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__none__"
                          data-checked={selectedPersonaId === null}
                          onSelect={() => {
                            onPersonaChange(null);
                            setPersonaPickerOpen(false);
                          }}
                        >
                          <UserIcon className="size-4 shrink-0 opacity-50" />
                          <span className="text-xs text-muted-foreground">
                            {t("personaSelect.none")}
                          </span>
                        </CommandItem>
                        {personas.map((persona) => (
                          <CommandItem
                            key={persona.id}
                            value={`${persona.displayName} ${persona.name}`}
                            data-checked={selectedPersonaId === persona.id}
                            onSelect={() => {
                              onPersonaChange(persona.id);
                              setPersonaPickerOpen(false);
                            }}
                          >
                            <UserIcon className="size-4 shrink-0" />
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-xs font-medium">
                                {persona.displayName}
                              </span>
                              <span className="truncate text-[11px] text-muted-foreground">
                                {persona.provider}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </PromptInputTools>
            <PromptInputSubmit disabled={isStreaming} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

const OAUTH_PREFIX = "__oauth__:";

function ToolCallCard({
  toolName,
  state,
  input,
  output,
}: {
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
}) {
  const isComplete = state === "output-available";
  const hasInput = input !== undefined && input !== null;
  return (
    <div className="my-1.5 flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
        {isComplete ? (
          <CheckCircle2Icon className="size-3.5 text-emerald-500" />
        ) : (
          <WrenchIcon className="size-3.5 animate-pulse text-primary" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs font-medium">
          {toolName}
          {!isComplete && (
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              running...
            </span>
          )}
        </span>
        {hasInput && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              input
            </span>
            <pre className="max-h-24 overflow-auto rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
            </pre>
          </div>
        )}
        {isComplete && output !== undefined && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              output
            </span>
            <pre className="max-h-24 overflow-auto rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              {typeof output === "string" ? output : JSON.stringify(output, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
function getOAuthUrl(message: UIMessage): string | null {
  if (message.role !== "assistant") return null;
  const first = message.parts[0];
  if (first?.type !== "text" || !first.text.startsWith(OAUTH_PREFIX))
    return null;
  return first.text.slice(OAUTH_PREFIX.length);
}

function OAuthCard({ authUrl }: { authUrl: string }) {
  const t = useTranslations("Playground.oauth");
  const [opened, setOpened] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    popupRef.current = null;
    setOpened(false);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const handleClick = useCallback(() => {
    const width = 500;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      "oauth_popup",
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`,
    );

    if (popup) {
      popupRef.current = popup;
      setOpened(true);
      timerRef.current = setInterval(() => {
        if (popup.closed) cleanup();
      }, 500);
    }
  }, [authUrl, cleanup]);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
        <ShieldCheckIcon className="size-4 text-amber-500" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-medium">{t("title")}</p>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
        {opened ? (
          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <LoaderIcon className="size-3 animate-spin" />
            {t("waiting")}
          </span>
        ) : (
          <button
            type="button"
            onClick={handleClick}
            className="mt-1 inline-flex w-fit items-center gap-1.5 text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
          >
            <ExternalLinkIcon className="size-3" />
            {t("authenticate")}
          </button>
        )}
      </div>
    </div>
  );
}
