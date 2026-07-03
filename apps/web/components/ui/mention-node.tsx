'use client';

import * as React from 'react';

import type { TComboboxInputElement, TMentionElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';

import { IS_APPLE, KEYS } from 'platejs';
import {
  PlateElement,
  useFocused,
  useReadOnly,
  useSelected,
} from 'platejs/react';
import { ChevronLeft, ChevronRight, Loader2, Server, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

import { cn } from '@/lib/utils';
import { useMounted } from '@/hooks/use-mounted';
import { useDebounce } from '@/hooks/use-debounce';
import { $orpc } from '@/lib/api';
import { ComboboxItem } from '@ariakit/react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox';

type MentionCategory = 'users' | 'groups' | 'cognito-groups' | 'gateways' | 'gateway-targets' | 'gateway-tools' | 'agent-runtimes';

interface MentionableItem {
  key: string;
  text: string;
  category: MentionCategory;
  subtitle?: string;
  gatewayArn?: string;
}

function EntraIdLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/entra-id.png"
      alt="Entra ID"
      width={16}
      height={16}
      className={cn('shrink-0 rounded-sm', className)}
    />
  );
}

function AgentCoreLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/amazon-bedrock-agentcore-logo.png"
      alt="AgentCore"
      width={16}
      height={16}
      className={cn('shrink-0 rounded-sm', className)}
    />
  );
}

function CognitoLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/amazon-cognito.png"
      alt="Cognito"
      width={16}
      height={16}
      className={cn('shrink-0 rounded-sm', className)}
    />
  );
}

function CategoryLogo({ category, className }: { category?: MentionCategory; className?: string }) {
  if (category === 'gateways' || category === 'gateway-targets' || category === 'gateway-tools' || category === 'agent-runtimes') return <AgentCoreLogo className={className} />;
  if (category === 'cognito-groups') return <CognitoLogo className={className} />;
  return <EntraIdLogo className={className} />;
}

export function MentionElement(
  props: PlateElementProps<TMentionElement> & {
    prefix?: string;
  }
) {
  const { editor } = props;
  const element = props.element;

  const selected = useSelected();
  const focused = useFocused();
  const mounted = useMounted();
  const readOnly = useReadOnly();

  const handleRemove = React.useCallback(() => {
    const path = editor.api.findPath(element);
    if (path) {
      editor.tf.removeNodes({ at: path });
    }
  }, [editor, element]);

  const category = (element as any).category as MentionCategory | undefined;
  const isGateway = category === 'gateways';
  const isGatewayTarget = category === 'gateway-targets';
  const isGatewayTool = category === 'gateway-tools';
  const isAgentRuntime = category === 'agent-runtimes';

  const typeSuffix = isGateway ? ' (Gateway)' : isGatewayTarget ? ' (Target)' : isGatewayTool ? ' (Tool)' : isAgentRuntime ? ' (Runtime)' : '';

  const chipContent = mounted && IS_APPLE ? (
    <>
      {props.children}
      <CategoryLogo category={category} className="size-3.5" />
      {props.prefix}
      <span>{element.value}{typeSuffix && <span className="text-muted-foreground font-normal">{typeSuffix}</span>}</span>
      {!readOnly && (
        <button
          type="button"
          className="ml-0.5 rounded-full p-0 text-muted-foreground/70 hover:text-foreground transition-colors"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemove(); }}
        >
          <X className="size-3" />
        </button>
      )}
    </>
  ) : (
    <>
      <CategoryLogo category={category} className="size-3.5" />
      {props.prefix}
      <span>{element.value}{typeSuffix && <span className="text-muted-foreground font-normal">{typeSuffix}</span>}</span>
      {!readOnly && (
        <button
          type="button"
          className="ml-0.5 rounded-full p-0 text-muted-foreground/70 hover:text-foreground transition-colors"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemove(); }}
        >
          <X className="size-3" />
        </button>
      )}
      {props.children}
    </>
  );

  const plateElement = (
    <PlateElement
      {...props}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/60 px-2 py-0.5 align-middle text-xs font-medium',
        !readOnly && 'cursor-pointer',
        selected && focused && 'ring-2 ring-ring',
        element.children[0][KEYS.bold] === true && 'font-bold',
        element.children[0][KEYS.italic] === true && 'italic',
        element.children[0][KEYS.underline] === true && 'underline'
      )}
      attributes={{
        ...props.attributes,
        contentEditable: false,
        'data-slate-value': element.value,
        draggable: true,
      }}
    >
      {chipContent}
    </PlateElement>
  );

  if (!isGateway && !isGatewayTarget && !isGatewayTool && !isAgentRuntime) return plateElement;

  if (isAgentRuntime) {
    return (
      <AgentRuntimeHoverWrapper
        runtimeId={(element as any).key as string}
        runtimeName={(element as any).value as string}
      >
        {plateElement}
      </AgentRuntimeHoverWrapper>
    );
  }

  if (isGateway) {
    return (
      <GatewayHoverWrapper gatewayId={(element as any).key as string}>
        {plateElement}
      </GatewayHoverWrapper>
    );
  }

  if (isGatewayTarget) {
    return (
      <GatewayTargetHoverWrapper
        gatewayName={(element as any).gatewayName as string | undefined}
        gatewayId={(element as any).gatewayId as string | undefined}
      >
        {plateElement}
      </GatewayTargetHoverWrapper>
    );
  }

  return (
    <GatewayToolHoverWrapper
      gatewayName={(element as any).gatewayName as string | undefined}
      targetName={(element as any).targetName as string | undefined}
    >
      {plateElement}
    </GatewayToolHoverWrapper>
  );
}

interface GatewayTarget {
  targetId: string;
  name: string;
  status: string;
  description?: string;
}

function useGatewayTargets(gatewayId: string | null) {
  const [targets, setTargets] = React.useState<GatewayTarget[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fetchedRef = React.useRef<string | null>(null);

  const fetch = React.useCallback(async () => {
    if (!gatewayId || fetchedRef.current === gatewayId) return;
    fetchedRef.current = gatewayId;
    setIsLoading(true);
    setError(null);
    try {
      const response = await $orpc.listGatewayTargets({ gatewayId });
      setTargets(response.targets);
    } catch (err) {
      console.error('Failed to fetch gateway targets:', err);
      setError('Failed to load targets');
    } finally {
      setIsLoading(false);
    }
  }, [gatewayId]);

  return { targets, isLoading, error, fetch };
}

const statusColorMap: Record<string, string> = {
  READY: 'bg-emerald-500',
  CREATING: 'bg-blue-500',
  UPDATING: 'bg-blue-500',
  SYNCHRONIZING: 'bg-blue-500',
  DELETING: 'bg-amber-500',
  FAILED: 'bg-red-500',
  UPDATE_UNSUCCESSFUL: 'bg-red-500',
  SYNCHRONIZE_UNSUCCESSFUL: 'bg-red-500',
};

function useGatewayTargetsSearch(gatewayId: string | null, search: string) {
  const debouncedSearch = useDebounce(search, 300);
  const [items, setItems] = React.useState<MentionableItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!gatewayId) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const fetchTargets = async () => {
      try {
        const response = await $orpc.listGatewayTargets({ gatewayId });
        if (!cancelled) {
          const targets = response.targets;
          const filtered = debouncedSearch
            ? targets.filter((t) =>
                t.name.toLowerCase().includes(debouncedSearch.toLowerCase())
              )
            : targets;
          setItems(
            filtered.map((t) => ({
              key: t.targetId,
              text: t.name,
              category: 'gateway-targets' as const,
              subtitle: t.description ?? undefined,
            }))
          );
        }
      } catch (err) {
        console.error('Gateway targets search error:', err);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchTargets();
    return () => { cancelled = true; };
  }, [gatewayId, debouncedSearch]);

  return { items, isLoading };
}

function useGatewayToolsSearch(
  gatewayId: string | null,
  targetId: string | null,
  search: string
) {
  const debouncedSearch = useDebounce(search, 300);
  const [items, setItems] = React.useState<MentionableItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!gatewayId || !targetId) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const fetchTools = async () => {
      try {
        const response = await $orpc.listGatewayTargetTools({ gatewayId, targetId });
        if (!cancelled) {
          const tools = response.tools;
          const filtered = debouncedSearch
            ? tools.filter((t) =>
                t.name.toLowerCase().includes(debouncedSearch.toLowerCase())
              )
            : tools;
          setItems(
            filtered.map((t) => ({
              key: t.name,
              text: t.name,
              category: 'gateway-tools' as const,
              subtitle: t.description || undefined,
            }))
          );
        }
      } catch (err) {
        console.error('Gateway tools search error:', err);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchTools();
    return () => { cancelled = true; };
  }, [gatewayId, targetId, debouncedSearch]);

  return { items, isLoading };
}

function useAgentRuntimeEndpointsSearch(
  agentRuntimeId: string | null,
  search: string
) {
  const debouncedSearch = useDebounce(search, 300);
  const [items, setItems] = React.useState<MentionableItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!agentRuntimeId) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const fetchEndpoints = async () => {
      try {
        const response = await $orpc.listAgentRuntimeEndpoints({ agentRuntimeId });
        if (!cancelled) {
          const endpoints = response.endpoints;
          const filtered = debouncedSearch
            ? endpoints.filter((ep) =>
                ep.name.toLowerCase().includes(debouncedSearch.toLowerCase())
              )
            : endpoints;
          setItems(
            filtered.map((ep) => ({
              key: ep.id,
              text: ep.name,
              category: 'agent-runtimes' as const,
              subtitle: ep.description ?? undefined,
            }))
          );
        }
      } catch (err) {
        console.error('Agent runtime endpoints search error:', err);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchEndpoints();
    return () => { cancelled = true; };
  }, [agentRuntimeId, debouncedSearch]);

  return { items, isLoading };
}

interface AgentRuntimeEndpoint {
  id: string;
  name: string;
  status: string;
  description?: string;
  liveVersion?: string;
  targetVersion?: string;
}

function useAgentRuntimeEndpoints(runtimeId: string | null) {
  const [endpoints, setEndpoints] = React.useState<AgentRuntimeEndpoint[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fetchedRef = React.useRef<string | null>(null);

  const fetch = React.useCallback(async () => {
    if (!runtimeId || fetchedRef.current === runtimeId) return;
    fetchedRef.current = runtimeId;
    setIsLoading(true);
    setError(null);
    try {
      const response = await $orpc.listAgentRuntimeEndpoints({ agentRuntimeId: runtimeId });
      setEndpoints(response.endpoints);
    } catch (err) {
      console.error('Failed to fetch agent runtime endpoints:', err);
      setError('Failed to load endpoints');
    } finally {
      setIsLoading(false);
    }
  }, [runtimeId]);

  return { endpoints, isLoading, error, fetch };
}

function AgentRuntimeHoverWrapper({
  runtimeId,
  runtimeName,
  children,
}: {
  runtimeId: string;
  runtimeName: string;
  children: React.ReactNode;
}) {
  const { endpoints, isLoading, error, fetch } = useAgentRuntimeEndpoints(runtimeId);

  return (
    <HoverCard
      onOpenChange={(open) => {
        if (open) fetch();
      }}
    >
      <HoverCardTrigger render={<span />}>
        {children}
      </HoverCardTrigger>
      <AgentRuntimeEndpointsHoverContent
        runtimeName={runtimeName}
        endpoints={endpoints}
        isLoading={isLoading}
        error={error}
      />
    </HoverCard>
  );
}

function AgentRuntimeEndpointsHoverContent({
  runtimeName,
  endpoints,
  isLoading,
  error,
}: {
  runtimeName: string;
  endpoints: AgentRuntimeEndpoint[];
  isLoading: boolean;
  error: string | null;
}) {
  const t = useTranslations('Mentions');

  return (
    <HoverCardContent side="top" align="start" className="w-80">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <AgentCoreLogo className="size-4" />
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">{t('runtimeEndpoints')}</p>
            <p className="truncate text-xs font-medium">{runtimeName}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">{t('loading')}</span>
          </div>
        ) : error ? (
          <p className="text-xs text-destructive py-2">{error}</p>
        ) : endpoints.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">{t('noEndpoints')}</p>
        ) : (
          <div className="space-y-1.5">
            {endpoints.map((ep) => (
              <div
                key={ep.id}
                className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-2"
              >
                <Server className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">{ep.name}</span>
                    <span className={cn(
                      'inline-block size-1.5 shrink-0 rounded-full',
                      statusColorMap[ep.status] ?? 'bg-gray-400'
                    )} title={ep.status} />
                  </div>
                  {ep.description && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground leading-tight">
                      {ep.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </HoverCardContent>
  );
}

function GatewayHoverWrapper({ gatewayId, children }: { gatewayId: string; children: React.ReactNode }) {
  const { targets, isLoading, error, fetch } = useGatewayTargets(gatewayId);

  return (
    <HoverCard
      onOpenChange={(open) => {
        if (open) fetch();
      }}
    >
      <HoverCardTrigger render={<span />}>
        {children}
      </HoverCardTrigger>
      <GatewayTargetsHoverContent targets={targets} isLoading={isLoading} error={error} />
    </HoverCard>
  );
}

function GatewayTargetHoverWrapper({
  gatewayName,
  gatewayId,
  children,
}: {
  gatewayName?: string;
  gatewayId?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('Mentions');

  if (!gatewayName && !gatewayId) return <>{children}</>;

  return (
    <HoverCard>
      <HoverCardTrigger render={<span />}>
        {children}
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-56">
        <div className="flex items-center gap-2">
          <AgentCoreLogo className="size-4" />
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">{t('parentGateway')}</p>
            <p className="truncate text-xs font-medium">{gatewayName ?? gatewayId}</p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function GatewayToolHoverWrapper({
  gatewayName,
  targetName,
  children,
}: {
  gatewayName?: string;
  targetName?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('Mentions');

  if (!gatewayName && !targetName) return <>{children}</>;

  return (
    <HoverCard>
      <HoverCardTrigger render={<span />}>
        {children}
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-64">
        <div className="flex items-start gap-2">
          <AgentCoreLogo className="size-4 mt-0.5" />
          <div className="min-w-0 space-y-1">
            {gatewayName && (
              <div>
                <p className="text-[11px] text-muted-foreground">{t('parentGateway')}</p>
                <p className="truncate text-xs font-medium">{gatewayName}</p>
              </div>
            )}
            {targetName && (
              <div>
                <p className="text-[11px] text-muted-foreground">{t('parentTarget')}</p>
                <p className="truncate text-xs font-medium">{targetName}</p>
              </div>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function GatewayTargetsHoverContent({ targets, isLoading, error }: { targets: GatewayTarget[]; isLoading: boolean; error: string | null }) {
  const t = useTranslations('Mentions');

  return (
    <HoverCardContent
      side="top"
      align="start"
      className="w-80"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <AgentCoreLogo className="size-4" />
          <span className="text-xs font-semibold">{t('gatewayTargets')}</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">{t('loading')}</span>
          </div>
        ) : error ? (
          <p className="text-xs text-destructive py-2">{error}</p>
        ) : targets.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">{t('noTargets')}</p>
        ) : (
          <div className="space-y-1.5">
            {targets.map((target) => (
              <div
                key={target.targetId}
                className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-2"
              >
                <Server className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">{target.name}</span>
                    <span className={cn(
                      'inline-block size-1.5 shrink-0 rounded-full',
                      statusColorMap[target.status] ?? 'bg-gray-400'
                    )} title={target.status} />
                  </div>
                  {target.description && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground leading-tight">
                      {target.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </HoverCardContent>
  );
}

function useMentionSearch(category: MentionCategory | null, search: string) {
  const debouncedSearch = useDebounce(search, 300);
  const [items, setItems] = React.useState<MentionableItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!category) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const fetchItems = async () => {
      try {
        if (category === 'users') {
          const response = await $orpc.searchMicrosoftUsers({
            search: debouncedSearch || undefined,
            top: 20,
          });
          if (!cancelled) {
            setItems(
              response.users.map((user) => ({
                key: user.id,
                text: user.displayName ?? user.userPrincipalName ?? user.id,
                category: 'users' as const,
                subtitle: user.mail ?? user.userPrincipalName ?? undefined,
              }))
            );
          }
        } else if (category === 'groups') {
          const response = await $orpc.listMicrosoftGroups({
            search: debouncedSearch || undefined,
            top: 20,
          });
          if (!cancelled) {
            setItems(
              response.groups.map((group) => ({
                key: group.id,
                text: group.displayName ?? group.id,
                category: 'groups' as const,
                subtitle: group.description ?? group.mail ?? undefined,
              }))
            );
          }
        } else if (category === 'cognito-groups') {
          // Admin-created Cognito groups only — Entra-mirrored ones (named
          // `EntraGroup-<entraId>`) are surfaced via the entra-group picker.
          const response = await $orpc.listCognitoGroups();
          if (!cancelled) {
            const adminGroups = response.groups.filter(
              (g) => !g.name.startsWith('EntraGroup-'),
            );
            const filtered = debouncedSearch
              ? adminGroups.filter((g) =>
                  g.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
                )
              : adminGroups;
            setItems(
              filtered.map((g) => ({
                key: g.name,
                text: g.name,
                category: 'cognito-groups' as const,
                subtitle: g.description ?? undefined,
              })),
            );
          }
        } else if (category === 'gateways') {
          const response = await $orpc.listGateways({
            maxResults: 20,
          });
          if (!cancelled) {
            const filtered = debouncedSearch
              ? response.gateways.filter((gw) =>
                  gw.name.toLowerCase().includes(debouncedSearch.toLowerCase())
                )
              : response.gateways;
            setItems(
              filtered.map((gw) => ({
                key: gw.gatewayId,
                text: gw.name,
                category: 'gateways' as const,
                subtitle: gw.description ?? undefined,
                gatewayArn: gw.gatewayArn ?? undefined,
              }))
            );
          }
        } else if (category === 'agent-runtimes') {
          const response = await $orpc.listAgentRuntimes({
            maxResults: 20,
          });
          if (!cancelled) {
            const runtimes = response.runtimes;
            const filtered = debouncedSearch
              ? runtimes.filter((rt) =>
                  rt.name.toLowerCase().includes(debouncedSearch.toLowerCase())
                )
              : runtimes;
            setItems(
              filtered.map((rt) => ({
                key: rt.agentRuntimeId,
                text: rt.name,
                category: 'agent-runtimes' as const,
                subtitle: rt.description ?? undefined,
              }))
            );
          }
        }
      } catch (err) {
        console.error('Mention search error:', err);
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchItems();
    return () => {
      cancelled = true;
    };
  }, [category, debouncedSearch]);

  return { items, isLoading };
}

export function MentionInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const { editor, element } = props;
  const [search, setSearch] = React.useState('');
  const [activeCategory, setActiveCategory] = React.useState<MentionCategory | null>(null);
  const [selectedGateway, setSelectedGateway] = React.useState<{ id: string; name: string; gatewayArn?: string } | null>(null);
  const [selectedTarget, setSelectedTarget] = React.useState<{ id: string; name: string } | null>(null);
  const [selectedRuntime, setSelectedRuntime] = React.useState<{ id: string; name: string } | null>(null);

  const needsGatewayPicker = (activeCategory === 'gateway-targets' || activeCategory === 'gateway-tools') && !selectedGateway;
  const needsTargetPicker = activeCategory === 'gateway-tools' && selectedGateway && !selectedTarget;
  const needsTargetList = activeCategory === 'gateway-targets' && selectedGateway;
  const needsToolList = activeCategory === 'gateway-tools' && selectedGateway && selectedTarget;
  const needsRuntimePicker = activeCategory === 'agent-runtimes' && !selectedRuntime;
  const needsEndpointList = activeCategory === 'agent-runtimes' && selectedRuntime;

  const { items: apiItems, isLoading } = useMentionSearch(
    needsGatewayPicker || needsTargetPicker || needsTargetList || needsToolList || needsRuntimePicker || needsEndpointList ? null : activeCategory,
    search
  );
  const { items: gatewayPickerItems, isLoading: isLoadingGatewayPicker } = useMentionSearch(
    needsGatewayPicker ? 'gateways' : null,
    search
  );
  const { items: runtimePickerItems, isLoading: isLoadingRuntimePicker } = useMentionSearch(
    needsRuntimePicker ? 'agent-runtimes' : null,
    search
  );
  const { items: targetItems, isLoading: isLoadingTargets } = useGatewayTargetsSearch(
    needsTargetList || needsTargetPicker ? selectedGateway?.id ?? null : null,
    needsTargetList || needsTargetPicker ? search : ''
  );
  const { items: toolItems, isLoading: isLoadingTools } = useGatewayToolsSearch(
    needsToolList ? selectedGateway?.id ?? null : null,
    needsToolList ? selectedTarget?.id ?? null : null,
    needsToolList ? search : ''
  );
  const { items: endpointItems, isLoading: isLoadingEndpoints } = useAgentRuntimeEndpointsSearch(
    needsEndpointList ? selectedRuntime?.id ?? null : null,
    needsEndpointList ? search : ''
  );

  const handleSelectMention = React.useCallback(
    (item: MentionableItem) => {
      const extra: Record<string, string> = {};
      if (item.category === 'gateways' && item.gatewayArn) {
        extra.gatewayArn = item.gatewayArn;
      }
      if (item.category === 'gateway-targets' && selectedGateway) {
        extra.gatewayId = selectedGateway.id;
        extra.gatewayName = selectedGateway.name;
        if (selectedGateway.gatewayArn) {
          extra.gatewayArn = selectedGateway.gatewayArn;
        }
      }
      if (item.category === 'gateway-tools' && selectedGateway && selectedTarget) {
        extra.gatewayId = selectedGateway.id;
        extra.gatewayName = selectedGateway.name;
        extra.targetId = selectedTarget.id;
        extra.targetName = selectedTarget.name;
        if (selectedGateway.gatewayArn) {
          extra.gatewayArn = selectedGateway.gatewayArn;
        }
      }
      if (item.category === 'agent-runtimes' && selectedRuntime) {
        extra.agentRuntimeId = selectedRuntime.id;
        extra.agentRuntimeName = selectedRuntime.name;
      }
      editor.tf.insertNodes({
        key: item.key,
        children: [{ text: '' }],
        type: KEYS.mention,
        value: item.text,
        category: item.category,
        ...extra,
      });
      editor.tf.move({ unit: 'offset' });
    },
    [editor, selectedGateway, selectedTarget, selectedRuntime]
  );

  const handleDrillIn = React.useCallback(
    (category: MentionCategory) => {
      setActiveCategory(category);
      setSearch('');
    },
    []
  );

  const handleDrillOut = React.useCallback(() => {
    if (selectedTarget) {
      setSelectedTarget(null);
      setSearch('');
    } else if (selectedGateway) {
      setSelectedGateway(null);
      setSearch('');
    } else if (selectedRuntime) {
      setSelectedRuntime(null);
      setSearch('');
    } else {
      setActiveCategory(null);
      setSearch('');
    }
  }, [selectedGateway, selectedTarget, selectedRuntime]);

  const handleSelectGateway = React.useCallback(
    (gateway: MentionableItem) => {
      setSelectedGateway({
        id: gateway.key,
        name: gateway.text,
        gatewayArn: gateway.gatewayArn,
      });
      setSearch('');
    },
    []
  );

  const handleSelectTarget = React.useCallback(
    (target: MentionableItem) => {
      setSelectedTarget({ id: target.key, name: target.text });
      setSearch('');
    },
    []
  );

  const handleSelectRuntime = React.useCallback(
    (runtime: MentionableItem) => {
      setSelectedRuntime({ id: runtime.key, name: runtime.text });
      setSearch('');
    },
    []
  );

  const filter = activeCategory === null ? undefined : false;

  const renderContent = () => {
    if (activeCategory === null) {
      return (
        <CategoryMenuView
          search={search}
          onDrillIn={handleDrillIn}
        />
      );
    }

    if (needsRuntimePicker) {
      return (
        <RuntimeListView
          items={runtimePickerItems}
          isLoading={isLoadingRuntimePicker}
          onSelectRuntime={handleSelectRuntime}
          onBack={() => { setActiveCategory(null); setSearch(''); }}
        />
      );
    }

    if (needsEndpointList) {
      return (
        <RuntimeEndpointsMenuView
          runtime={selectedRuntime!}
          items={endpointItems}
          isLoading={isLoadingEndpoints}
          onSelect={handleSelectMention}
          onBack={handleDrillOut}
        />
      );
    }

    if (needsGatewayPicker) {
      return (
        <GatewayListView
          items={gatewayPickerItems}
          isLoading={isLoadingGatewayPicker}
          onSelectGateway={handleSelectGateway}
          onBack={() => { setActiveCategory(null); setSearch(''); }}
        />
      );
    }

    if (needsTargetPicker) {
      return (
        <TargetPickerView
          gateway={selectedGateway!}
          items={targetItems}
          isLoading={isLoadingTargets}
          onSelectTarget={handleSelectTarget}
          onBack={handleDrillOut}
        />
      );
    }

    if (needsToolList) {
      return (
        <GatewayToolsMenuView
          gateway={selectedGateway!}
          target={selectedTarget!}
          items={toolItems}
          isLoading={isLoadingTools}
          onSelect={handleSelectMention}
          onBack={handleDrillOut}
        />
      );
    }

    if (needsTargetList) {
      return (
        <GatewayTargetsMenuView
          gateway={selectedGateway!}
          items={targetItems}
          isLoading={isLoadingTargets}
          onSelect={handleSelectMention}
          onBack={handleDrillOut}
        />
      );
    }

    return (
      <SubMenuView
        category={activeCategory}
        items={apiItems}
        isLoading={isLoading}
        onSelect={handleSelectMention}
        onBack={() => { setActiveCategory(null); setSearch(''); }}
      />
    );
  };

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox
        value={search}
        element={element}
        setValue={setSearch}
        showTrigger={true}
        trigger="@"
        filter={filter}
      >
        <span
          className="inline-block rounded-md bg-muted px-1.5 py-0.5 align-baseline text-xs ring-ring focus-within:ring-2"
          onKeyDownCapture={(e) => {
            if ((activeCategory !== null || selectedGateway !== null || selectedTarget !== null || selectedRuntime !== null) && (e.key === 'Escape' || (e.key === 'Backspace' && search === ''))) {
              e.preventDefault();
              e.stopPropagation();
              handleDrillOut();
            }
          }}
        >
          <InlineComboboxInput />
        </span>

        <InlineComboboxContent className="my-1.5">
          {renderContent()}
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}

function CategoryMenuView({
  search,
  onDrillIn,
}: {
  search: string;
  onDrillIn: (category: MentionCategory) => void;
}) {
  const t = useTranslations('Mentions');

  const categories: { id: MentionCategory; label: string }[] = React.useMemo(
    () => [
      { id: 'users', label: t('categories.users') },
      { id: 'groups', label: t('categories.groups') },
      { id: 'cognito-groups', label: t('categories.cognito-groups') },
      { id: 'gateways', label: t('categories.gateways') },
      { id: 'gateway-targets', label: t('categories.gateway-targets') },
      { id: 'gateway-tools', label: t('categories.gateway-tools') },
      { id: 'agent-runtimes', label: t('categories.agent-runtimes') },
    ],
    [t]
  );

  const filtered = React.useMemo(() => {
    if (!search) return categories;
    const lower = search.toLowerCase();
    return categories.filter((cat) => cat.label.toLowerCase().includes(lower));
  }, [categories, search]);

  if (filtered.length === 0) {
    return <InlineComboboxEmpty>{t('noResults')}</InlineComboboxEmpty>;
  }

  return (
    <InlineComboboxGroup>
      {filtered.map((cat) => (
        <ComboboxItem
          key={cat.id}
          value={cat.label}
          className="relative mx-1 flex h-8 cursor-pointer select-none items-center rounded-sm px-2 text-foreground text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[active-item=true]:bg-accent data-[active-item=true]:text-accent-foreground"
          onClick={(e) => {
            e.preventDefault();
            onDrillIn(cat.id);
          }}
        >
          <CategoryLogo category={cat.id} className="mr-2 size-4" />
          <span className="flex-1 truncate">{cat.label}</span>
          <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
        </ComboboxItem>
      ))}
    </InlineComboboxGroup>
  );
}

function SubMenuView({
  category,
  items,
  isLoading,
  onSelect,
  onBack,
}: {
  category: MentionCategory;
  items: MentionableItem[];
  isLoading: boolean;
  onSelect: (item: MentionableItem) => void;
  onBack: () => void;
}) {
  const t = useTranslations('Mentions');

  return (
    <>
      <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
        <button
          type="button"
          className="flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          <ChevronLeft className="size-3" />
          {t('back')}
        </button>
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <CategoryLogo category={category} className="size-3.5" />
          {t(`categories.${category}`)}
        </span>
      </div>

      {isLoading ? (
        <InlineComboboxEmpty>
          <div className="flex items-center justify-center py-2">
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">{t('loading')}</span>
          </div>
        </InlineComboboxEmpty>
      ) : items.length === 0 ? (
        <InlineComboboxEmpty>
          <span className="text-xs">{t('noResults')}</span>
        </InlineComboboxEmpty>
      ) : (
        <InlineComboboxGroup>
          {items.map((item) => (
            <InlineComboboxItem
              key={item.key}
              value={item.text}
              className={item.subtitle ? 'h-auto py-1.5 text-xs' : 'text-xs'}
              onClick={() => onSelect(item)}
            >
              <div className="flex flex-col min-w-0">
                <span className="truncate">{item.text}</span>
                {item.subtitle && (
                  <span className="truncate text-[11px] text-muted-foreground leading-tight">
                    {item.subtitle}
                  </span>
                )}
              </div>
            </InlineComboboxItem>
          ))}
        </InlineComboboxGroup>
      )}
    </>
  );
}

function GatewayListView({
  items,
  isLoading,
  onSelectGateway,
  onBack,
}: {
  items: MentionableItem[];
  isLoading: boolean;
  onSelectGateway: (item: MentionableItem) => void;
  onBack: () => void;
}) {
  const t = useTranslations('Mentions');

  return (
    <>
      <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
        <button
          type="button"
          className="flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          <ChevronLeft className="size-3" />
          {t('back')}
        </button>
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <AgentCoreLogo className="size-3.5" />
          {t('selectGateway')}
        </span>
      </div>

      {isLoading ? (
        <InlineComboboxEmpty>
          <div className="flex items-center justify-center py-2">
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">{t('loading')}</span>
          </div>
        </InlineComboboxEmpty>
      ) : items.length === 0 ? (
        <InlineComboboxEmpty>
          <span className="text-xs">{t('noResults')}</span>
        </InlineComboboxEmpty>
      ) : (
        <InlineComboboxGroup>
          {items.map((item) => (
            <ComboboxItem
              key={item.key}
              value={item.text}
              className="relative mx-1 flex h-auto cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-foreground text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[active-item=true]:bg-accent data-[active-item=true]:text-accent-foreground"
              onClick={(e) => {
                e.preventDefault();
                onSelectGateway(item);
              }}
            >
              <div className="flex flex-1 flex-col min-w-0">
                <span className="truncate">{item.text}</span>
                {item.subtitle && (
                  <span className="truncate text-[11px] text-muted-foreground leading-tight">
                    {item.subtitle}
                  </span>
                )}
              </div>
              <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
            </ComboboxItem>
          ))}
        </InlineComboboxGroup>
      )}
    </>
  );
}

function GatewayTargetsMenuView({
  gateway,
  items,
  isLoading,
  onSelect,
  onBack,
}: {
  gateway: { id: string; name: string };
  items: MentionableItem[];
  isLoading: boolean;
  onSelect: (item: MentionableItem) => void;
  onBack: () => void;
}) {
  const t = useTranslations('Mentions');

  return (
    <>
      <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
        <button
          type="button"
          className="flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          <ChevronLeft className="size-3" />
          {t('back')}
        </button>
        <span className="min-w-0 text-xs font-medium text-muted-foreground flex items-center gap-1">
          <AgentCoreLogo className="size-3.5 shrink-0" />
          <span className="truncate">{gateway.name}</span>
          <ChevronRight className="size-3 shrink-0" />
          <span className="shrink-0">{t('targets')}</span>
        </span>
      </div>

      {isLoading ? (
        <InlineComboboxEmpty>
          <div className="flex items-center justify-center py-2">
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">{t('loading')}</span>
          </div>
        </InlineComboboxEmpty>
      ) : items.length === 0 ? (
        <InlineComboboxEmpty>
          <span className="text-xs">{t('noTargets')}</span>
        </InlineComboboxEmpty>
      ) : (
        <InlineComboboxGroup>
          {items.map((item) => (
            <InlineComboboxItem
              key={item.key}
              value={item.text}
              className={item.subtitle ? 'h-auto py-1.5 text-xs' : 'text-xs'}
              onClick={() => onSelect(item)}
            >
              <div className="flex items-start gap-2 min-w-0">
                <Server className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{item.text}</span>
                  {item.subtitle && (
                    <span className="truncate text-[11px] text-muted-foreground leading-tight">
                      {item.subtitle}
                    </span>
                  )}
                </div>
              </div>
            </InlineComboboxItem>
          ))}
        </InlineComboboxGroup>
      )}
    </>
  );
}

function TargetPickerView({
  gateway,
  items,
  isLoading,
  onSelectTarget,
  onBack,
}: {
  gateway: { id: string; name: string };
  items: MentionableItem[];
  isLoading: boolean;
  onSelectTarget: (item: MentionableItem) => void;
  onBack: () => void;
}) {
  const t = useTranslations('Mentions');

  return (
    <>
      <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
        <button
          type="button"
          className="flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          <ChevronLeft className="size-3" />
          {t('back')}
        </button>
        <span className="min-w-0 text-xs font-medium text-muted-foreground flex items-center gap-1">
          <AgentCoreLogo className="size-3.5 shrink-0" />
          <span className="truncate">{gateway.name}</span>
          <ChevronRight className="size-3 shrink-0" />
          <span className="shrink-0">{t('selectTarget')}</span>
        </span>
      </div>

      {isLoading ? (
        <InlineComboboxEmpty>
          <div className="flex items-center justify-center py-2">
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">{t('loading')}</span>
          </div>
        </InlineComboboxEmpty>
      ) : items.length === 0 ? (
        <InlineComboboxEmpty>
          <span className="text-xs">{t('noTargets')}</span>
        </InlineComboboxEmpty>
      ) : (
        <InlineComboboxGroup>
          {items.map((item) => (
            <ComboboxItem
              key={item.key}
              value={item.text}
              className="relative mx-1 flex h-auto cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-foreground text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[active-item=true]:bg-accent data-[active-item=true]:text-accent-foreground"
              onClick={(e) => {
                e.preventDefault();
                onSelectTarget(item);
              }}
            >
              <div className="flex flex-1 items-start gap-2 min-w-0">
                <Server className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{item.text}</span>
                  {item.subtitle && (
                    <span className="truncate text-[11px] text-muted-foreground leading-tight">
                      {item.subtitle}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
            </ComboboxItem>
          ))}
        </InlineComboboxGroup>
      )}
    </>
  );
}

function RuntimeListView({
  items,
  isLoading,
  onSelectRuntime,
  onBack,
}: {
  items: MentionableItem[];
  isLoading: boolean;
  onSelectRuntime: (item: MentionableItem) => void;
  onBack: () => void;
}) {
  const t = useTranslations('Mentions');

  return (
    <>
      <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
        <button
          type="button"
          className="flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          <ChevronLeft className="size-3" />
          {t('back')}
        </button>
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <AgentCoreLogo className="size-3.5" />
          {t('selectRuntime')}
        </span>
      </div>

      {isLoading ? (
        <InlineComboboxEmpty>
          <div className="flex items-center justify-center py-2">
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">{t('loading')}</span>
          </div>
        </InlineComboboxEmpty>
      ) : items.length === 0 ? (
        <InlineComboboxEmpty>
          <span className="text-xs">{t('noResults')}</span>
        </InlineComboboxEmpty>
      ) : (
        <InlineComboboxGroup>
          {items.map((item) => (
            <ComboboxItem
              key={item.key}
              value={item.text}
              className="relative mx-1 flex h-auto cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-foreground text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[active-item=true]:bg-accent data-[active-item=true]:text-accent-foreground"
              onClick={(e) => {
                e.preventDefault();
                onSelectRuntime(item);
              }}
            >
              <div className="flex flex-1 flex-col min-w-0">
                <span className="truncate">{item.text}</span>
                {item.subtitle && (
                  <span className="truncate text-[11px] text-muted-foreground leading-tight">
                    {item.subtitle}
                  </span>
                )}
              </div>
              <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
            </ComboboxItem>
          ))}
        </InlineComboboxGroup>
      )}
    </>
  );
}

function RuntimeEndpointsMenuView({
  runtime,
  items,
  isLoading,
  onSelect,
  onBack,
}: {
  runtime: { id: string; name: string };
  items: MentionableItem[];
  isLoading: boolean;
  onSelect: (item: MentionableItem) => void;
  onBack: () => void;
}) {
  const t = useTranslations('Mentions');

  return (
    <>
      <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
        <button
          type="button"
          className="flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          <ChevronLeft className="size-3" />
          {t('back')}
        </button>
        <span className="min-w-0 text-xs font-medium text-muted-foreground flex items-center gap-1">
          <AgentCoreLogo className="size-3.5 shrink-0" />
          <span className="truncate">{runtime.name}</span>
          <ChevronRight className="size-3 shrink-0" />
          <span className="shrink-0">{t('endpoints')}</span>
        </span>
      </div>

      {isLoading ? (
        <InlineComboboxEmpty>
          <div className="flex items-center justify-center py-2">
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">{t('loading')}</span>
          </div>
        </InlineComboboxEmpty>
      ) : items.length === 0 ? (
        <InlineComboboxEmpty>
          <span className="text-xs">{t('noEndpoints')}</span>
        </InlineComboboxEmpty>
      ) : (
        <InlineComboboxGroup>
          {items.map((item) => (
            <InlineComboboxItem
              key={item.key}
              value={item.text}
              className={item.subtitle ? 'h-auto py-1.5 text-xs' : 'text-xs'}
              onClick={() => onSelect(item)}
            >
              <div className="flex items-start gap-2 min-w-0">
                <Server className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{item.text}</span>
                  {item.subtitle && (
                    <span className="truncate text-[11px] text-muted-foreground leading-tight">
                      {item.subtitle}
                    </span>
                  )}
                </div>
              </div>
            </InlineComboboxItem>
          ))}
        </InlineComboboxGroup>
      )}
    </>
  );
}

function GatewayToolsMenuView({
  gateway,
  target,
  items,
  isLoading,
  onSelect,
  onBack,
}: {
  gateway: { id: string; name: string };
  target: { id: string; name: string };
  items: MentionableItem[];
  isLoading: boolean;
  onSelect: (item: MentionableItem) => void;
  onBack: () => void;
}) {
  const t = useTranslations('Mentions');

  return (
    <>
      <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
        <button
          type="button"
          className="flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          <ChevronLeft className="size-3" />
          {t('back')}
        </button>
        <span className="min-w-0 text-xs font-medium text-muted-foreground flex items-center gap-1">
          <AgentCoreLogo className="size-3.5 shrink-0" />
          <span className="truncate">{gateway.name}</span>
          <ChevronRight className="size-3 shrink-0" />
          <span className="truncate">{target.name}</span>
          <ChevronRight className="size-3 shrink-0" />
          <span className="shrink-0">{t('tools')}</span>
        </span>
      </div>

      {isLoading ? (
        <InlineComboboxEmpty>
          <div className="flex items-center justify-center py-2">
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">{t('loading')}</span>
          </div>
        </InlineComboboxEmpty>
      ) : items.length === 0 ? (
        <InlineComboboxEmpty>
          <span className="text-xs">{t('noTools')}</span>
        </InlineComboboxEmpty>
      ) : (
        <InlineComboboxGroup>
          {items.map((item) => (
            <InlineComboboxItem
              key={item.key}
              value={item.text}
              className={item.subtitle ? 'h-auto py-1.5 text-xs' : 'text-xs'}
              onClick={() => onSelect(item)}
            >
              <div className="flex flex-col min-w-0">
                <span className="truncate font-mono text-xs">{item.text}</span>
                {item.subtitle && (
                  <span className="truncate text-[11px] text-muted-foreground leading-tight">
                    {item.subtitle}
                  </span>
                )}
              </div>
            </InlineComboboxItem>
          ))}
        </InlineComboboxGroup>
      )}
    </>
  );
}
