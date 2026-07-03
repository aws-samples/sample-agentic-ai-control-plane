"use client";

import { $orpc } from "@/lib/api";
import { useSession } from "@package/auth";
import type { UIMessage } from "ai";
import { nanoid } from "nanoid";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ChatPanel } from "./chat-panel";
import {
  ConversationList,
  type PlaygroundConversation,
} from "./conversation-list";

type Agent = {
  id: string;
  name: string;
  description: string;
};

export type RuntimeLanguage = "typescript" | "python";

export type AgentRuntime = {
  agentRuntimeId: string;
  agentRuntimeArn?: string;
  name: string;
  status: string;
  description?: string;
  language: RuntimeLanguage;
};

const LOCAL_RUNTIME_PATTERNS = [/\btypescript\b/i, /\bts\b/i, /\bnode\b/i, /\bexpress\b/i, /\bstrands-agents\/sdk\b/i];

function inferRuntimeLanguage(name: string, description?: string): RuntimeLanguage {
  const haystack = `${name} ${description ?? ""}`;
  if (LOCAL_RUNTIME_PATTERNS.some((re) => re.test(haystack))) return "typescript";
  return "python";
}

const LOCAL_RUNTIME: AgentRuntime = {
  agentRuntimeId: "__local__",
  name: "Agent Runtime",
  status: "READY",
  description: "Main Agent on TS",
  language: "typescript",
};

type Persona = {
  id: string;
  name: string;
  displayName: string;
  provider: string;
};

type ConversationState = PlaygroundConversation & {
  messages: UIMessage[];
  agentId: string | null;
  runtimeId: string | null;
  personaId: string | null;
  sessionId: string;
};

export function Playground() {
  const t = useTranslations("Playground");
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([]);
  const [runtimesLoading, setRuntimesLoading] = useState(true);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personasLoading, setPersonasLoading] = useState(true);
  const [conversations, setConversations] = useState<ConversationState[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchAgents = async () => {
      setAgentsLoading(true);
      try {
        const response = await $orpc.listAgents({ userId });
        if (!cancelled) {
          setAgents(
            response.agents.map((a) => ({
              id: a.id,
              name: a.name,
              description: a.description,
            })),
          );
        }
      } catch (err) {
        console.error("Failed to load agents:", err);
        if (!cancelled) toast.error(t("error.loadAgents"));
      } finally {
        if (!cancelled) setAgentsLoading(false);
      }
    };
    fetchAgents();
    return () => {
      cancelled = true;
    };
  }, [userId, t]);

  useEffect(() => {
    let cancelled = false;
    const fetchRuntimes = async () => {
      setRuntimesLoading(true);
      try {
        const response = await $orpc.listAgentRuntimes({ maxResults: 100 });
        if (!cancelled) {
          const bedrockRuntimes = response.runtimes
            .filter((r) => r.status === "READY")
            .map((r) => ({
              agentRuntimeId: r.agentRuntimeId,
              agentRuntimeArn: r.agentRuntimeArn,
              name: r.name,
              status: r.status,
              description: r.description,
              language: inferRuntimeLanguage(r.name, r.description),
            }));
          setRuntimes(
            process.env.NODE_ENV === "development"
              ? [LOCAL_RUNTIME, ...bedrockRuntimes]
              : bedrockRuntimes,
          );
        }
      } catch (err) {
        console.error("Failed to load runtimes:", err);
        if (!cancelled) toast.error(t("error.loadRuntimes"));
      } finally {
        if (!cancelled) setRuntimesLoading(false);
      }
    };
    fetchRuntimes();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    const fetchPersonas = async () => {
      setPersonasLoading(true);
      try {
        // No provider filter: include both Cognito-native and federated
        // (Entra ID) personas so the playground can mint tokens for any.
        const response = await $orpc.listPersonas();
        if (!cancelled) {
          setPersonas(
            response.personas.map((p) => ({
              id: p.id,
              name: p.name,
              displayName: p.displayName,
              provider: p.provider,
            })),
          );
        }
      } catch (err) {
        console.error("Failed to load personas:", err);
        if (!cancelled) toast.error(t("error.loadPersonas"));
      } finally {
        if (!cancelled) setPersonasLoading(false);
      }
    };
    fetchPersonas();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const handleNewChat = useCallback(() => {
    const id = nanoid();
    const newConv: ConversationState = {
      id,
      title: t("defaultChatTitle"),
      updatedAt: new Date(),
      messages: [],
      agentId: null,
      runtimeId: null,
      personaId: null,
      sessionId: `session-${nanoid()}-${nanoid()}`,
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveId(id);
  }, [t]);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId(null);
    },
    [activeId],
  );

  const ensureActiveConversation = useCallback((): string => {
    if (activeId) return activeId;
    const id = nanoid();
    const newConv: ConversationState = {
      id,
      title: t("defaultChatTitle"),
      updatedAt: new Date(),
      messages: [],
      agentId: null,
      runtimeId: null,
      personaId: null,
      sessionId: `session-${nanoid()}-${nanoid()}`,
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveId(id);
    return id;
  }, [activeId, t]);

  const handleAgentChange = useCallback(
    (agentId: string) => {
      const convId = ensureActiveConversation();
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, agentId } : c)),
      );
    },
    [ensureActiveConversation],
  );

  const handleRuntimeChange = useCallback(
    (runtimeId: string) => {
      const convId = ensureActiveConversation();
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, runtimeId } : c)),
      );
    },
    [ensureActiveConversation],
  );

  const handlePersonaChange = useCallback(
    (personaId: string | null) => {
      const convId = ensureActiveConversation();
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, personaId } : c)),
      );
    },
    [ensureActiveConversation],
  );

  const handleSendMessage = useCallback(
    async (text: string) => {
      const convId = ensureActiveConversation();

      const conv = conversations.find((c) => c.id === convId);
      if (!conv) return;

      const selectedRuntime = runtimes.find(
        (r) => r.agentRuntimeId === conv.runtimeId,
      );
      if (!selectedRuntime) {
        toast.error(t("error.noRuntime"));
        return;
      }

      // AgentCore runtimes are configured with a Cognito authorizer, so the
      // persona JWT is the only path that authenticates. Without one we'd
      // fall through to SigV4 and the call would hang.
      if (selectedRuntime.agentRuntimeId !== "__local__" && !conv.personaId) {
        toast.error(t("error.noPersona"));
        return;
      }

      const userMessage: UIMessage = {
        id: nanoid(),
        role: "user",
        parts: [{ type: "text", text }],
      };

      const assistantMessageId = nanoid();
      const assistantMessage: UIMessage = {
        id: assistantMessageId,
        role: "assistant",
        parts: [{ type: "text", text: "" }],
      };

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c;
          const isFirst = c.messages.length === 0;
          return {
            ...c,
            messages: [...c.messages, userMessage, assistantMessage],
            title: isFirst ? text.slice(0, 40) : c.title,
            updatedAt: new Date(),
          };
        }),
      );

      setIsStreaming(true);
      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const runtimeArn =
          selectedRuntime.agentRuntimeArn ?? selectedRuntime.agentRuntimeId;

        const response = await fetch("/api/agent-runtimes/invoke-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentRuntimeArn: runtimeArn,
            agentId: conv.agentId,
            prompt: text,
            sessionId: conv.sessionId,
            userId: "cli-user",
            personaId: conv.personaId,
          }),
          signal: abort.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedText = "";
        let currentTextPartIdx = 0;
        let hasAnyContent = false;
        const toolParts = new Map<string, number>();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const eventBlock of events) {
            const lines = eventBlock.split("\n");
            let eventType = "";
            let eventData = "";

            for (const line of lines) {
              if (line.startsWith("event: ")) eventType = line.slice(7);
              else if (line.startsWith("data: ")) eventData = line.slice(6);
            }

            if (eventType === "oauth_check") {
              try {
                const parsed = JSON.parse(eventData);
                const authUrl = parsed.auth_url ?? null;
                if (authUrl) {
                  const oauthMessageId = nanoid();
                  setConversations((prev) =>
                    prev.map((c) => {
                      if (c.id !== convId) return c;
                      const oauthMsg: UIMessage = {
                        id: oauthMessageId,
                        role: "assistant" as const,
                        parts: [
                          {
                            type: "text" as const,
                            text: `__oauth__:${authUrl}`,
                          },
                        ],
                      };
                      const insertIdx = c.messages.findIndex(
                        (m) => m.id === assistantMessageId,
                      );
                      if (insertIdx === -1) {
                        return {
                          ...c,
                          messages: [...c.messages, oauthMsg],
                        };
                      }
                      const updated = [...c.messages];
                      updated.splice(insertIdx, 0, oauthMsg);
                      return { ...c, messages: updated };
                    }),
                  );
                }
              } catch {
                /* ignore malformed */
              }
            } else if (eventType === "tool_call") {
              try {
                const parsed = JSON.parse(eventData);
                accumulatedText = "";
                hasAnyContent = true;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    return {
                      ...c,
                      messages: c.messages.map((m) => {
                        if (m.id !== assistantMessageId) return m;
                        const toolCallId = parsed.toolUseId ?? nanoid();
                        const newPart = {
                          type: "dynamic-tool" as const,
                          toolName: parsed.name ?? "unknown",
                          toolCallId,
                          state: "input-available" as const,
                          input: undefined,
                        };
                        toolParts.set(toolCallId, m.parts.length);
                        return { ...m, parts: [...m.parts, newPart] };
                      }),
                    };
                  }),
                );
              } catch {
                /* ignore */
              }
            } else if (eventType === "tool_input") {
              try {
                const parsed = JSON.parse(eventData);
                const toolCallId = parsed.toolUseId;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    return {
                      ...c,
                      messages: c.messages.map((m) => {
                        if (m.id !== assistantMessageId) return m;
                        const idx = toolParts.get(toolCallId);
                        if (idx === undefined) return m;
                        const existing = m.parts[idx];
                        if (existing.type !== "dynamic-tool") return m;
                        const updatedParts = [...m.parts];
                        updatedParts[idx] = {
                          ...existing,
                          input: parsed.input,
                        };
                        return { ...m, parts: updatedParts };
                      }),
                    };
                  }),
                );
              } catch {
                /* ignore */
              }
            } else if (eventType === "tool_result") {
              try {
                const parsed = JSON.parse(eventData);
                const toolCallId = parsed.toolUseId;
                currentTextPartIdx = -1;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    return {
                      ...c,
                      messages: c.messages.map((m) => {
                        if (m.id !== assistantMessageId) return m;
                        const idx = toolParts.get(toolCallId);
                        if (idx === undefined) return m;
                        const existing = m.parts[idx];
                        const preservedInput =
                          existing.type === "dynamic-tool"
                            ? existing.input
                            : undefined;
                        const updatedParts = [...m.parts];
                        updatedParts[idx] = {
                          type: "dynamic-tool" as const,
                          toolName: parsed.name ?? "unknown",
                          toolCallId,
                          state: "output-available" as const,
                          input: preservedInput,
                          output: parsed.result,
                        };
                        return { ...m, parts: updatedParts };
                      }),
                    };
                  }),
                );
              } catch {
                /* ignore */
              }
            } else if (eventType === "text") {
              try {
                const parsed = JSON.parse(eventData);
                const chunk = parsed.text ?? "";
                accumulatedText += chunk;
                hasAnyContent = true;
                const currentText = accumulatedText;
                const needNewPart = currentTextPartIdx === -1;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    return {
                      ...c,
                      messages: c.messages.map((m) => {
                        if (m.id !== assistantMessageId) return m;
                        if (needNewPart) {
                          currentTextPartIdx = m.parts.length;
                          return {
                            ...m,
                            parts: [
                              ...m.parts,
                              { type: "text" as const, text: currentText },
                            ],
                          };
                        }
                        const updatedParts = [...m.parts];
                        updatedParts[currentTextPartIdx] = {
                          type: "text" as const,
                          text: currentText,
                        };
                        return { ...m, parts: updatedParts };
                      }),
                    };
                  }),
                );
              } catch {
                /* ignore */
              }
            } else if (eventType === "error") {
              try {
                const parsed = JSON.parse(eventData);
                const errText = parsed.message ?? t("error.streamError");
                accumulatedText += `\n\n**Error:** ${errText}`;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    return {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantMessageId
                          ? {
                              ...m,
                              parts: [{ type: "text" as const, text: accumulatedText }],
                            }
                          : m,
                      ),
                    };
                  }),
                );
              } catch {
                /* ignore */
              }
            }
          }
        }

        if (!hasAnyContent) {
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c;
              return {
                ...c,
                messages: c.messages.filter((m) => m.id !== assistantMessageId),
              };
            }),
          );
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : t("error.invokeFailed");
        toast.error(msg);
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      parts: [{ type: "text" as const, text: `**Error:** ${msg}` }],
                    }
                  : m,
              ),
            };
          }),
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [ensureActiveConversation, conversations, runtimes, userId, t],
  );

  const conversationListItems: PlaygroundConversation[] = useMemo(
    () =>
      conversations.map(({ id, title, updatedAt }) => ({
        id,
        title,
        updatedAt,
      })),
    [conversations],
  );

  return (
    <div className="absolute inset-0 flex">
      <ConversationList
        conversations={conversationListItems}
        activeId={activeId}
        onSelect={handleSelect}
        onNew={handleNewChat}
        onDelete={handleDelete}
      />
      <ChatPanel
        messages={activeConversation?.messages ?? []}
        agents={agents}
        agentsLoading={agentsLoading}
        selectedAgentId={activeConversation?.agentId ?? null}
        onAgentChange={handleAgentChange}
        runtimes={runtimes}
        runtimesLoading={runtimesLoading}
        selectedRuntimeId={activeConversation?.runtimeId ?? null}
        onRuntimeChange={handleRuntimeChange}
        personas={personas}
        personasLoading={personasLoading}
        selectedPersonaId={activeConversation?.personaId ?? null}
        onPersonaChange={handlePersonaChange}
        onSendMessage={handleSendMessage}
        isStreaming={isStreaming}
      />
    </div>
  );
}
