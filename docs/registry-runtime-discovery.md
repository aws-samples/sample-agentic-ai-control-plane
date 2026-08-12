# Registry-Driven Runtime Discovery — Design

**Status:** Design (for review) — no code yet
**Date:** 2026-08-07
**Related:** [[agentcore-registry-ga-migration]], [[registry-activity-tracing]]
**References:**
- AWS `discovery_and_invocation_at_runtime.py` — **orchestrator pattern** (AgentCore Runtime;
  ephemeral sub-agent-per-request; executes MCP + A2A; agent calls registry directly via boto3).
- AWS `strands-mcp-ecs-registry` (Financial Analyst) — **SKILL-centric pattern** (self-hosted ECS;
  single agent; SKILL is the unit of discovery, MCP is the tool transport; per-skill *selective*
  tool loading; treats A2A/CUSTOM as informational-only).

## 0. Two reference patterns — pick the mental model first

| | Orchestrator sample | SKILL-centric sample (Financial Analyst) |
|---|---|---|
| Unit of discovery | any record (MCP/A2A) | **SKILL record**; MCP tools are pulled in by the skill |
| Per request | build an ephemeral **sub-agent** with all discovered tools | search → top SKILL → parse `mcp_tools:` frontmatter → load **only those** MCP tools |
| Executes | MCP + A2A | MCP only (A2A/CUSTOM = informational) |
| Tool loading | broad (all hits, + hardcoded fallback queries) | **selective** (only the skill's declared tools — scales to big registries) |
| Compute | AgentCore Runtime | self-hosted ECS Fargate |
| SKILL meaning | n/a | **`SKILL.md` = procedure/instructions injected into the agent + a `mcp_tools:` manifest** |

**Key takeaways for us:**
- The SKILL-centric sample **answers the "what does executing a SKILL mean" question** (§4): a SKILL
  is *not* a callable endpoint — its `SKILL.md` becomes the agent's instructions, and its YAML
  frontmatter **declares which MCP tools to load**. Skills live in the registry, so adding/editing a
  skill needs **no agent redeploy** ("separate what the agent knows how to do from the agent").
- **Selective tool loading** (load only a skill's declared tools, not the whole MCP server) is the
  better default — it directly fixes the "won't scale / context bloat" critique of the orchestrator
  sample's broad search.
- **Both samples give the agent direct AWS credentials** (boto3 + task/exec role calling
  `agent-registry`), i.e. both chose **Option A** below. Our agent is credential-light today, so
  that remains the central decision (§3).
- Our runtime already matches the SKILL-centric sample on the easy parts: **Cognito JWT inbound +
  SSE streaming + Strands SDK**. It diverges on **compute** (AgentCore Runtime vs ECS) and **MCP
  auth** (our gateway uses an OAuth bearer; the sample uses SigV4 `execute-api`).

## 1. Goal

Attach an AWS Agent Registry to an agent so that, at **runtime**, the agent searches the registry
for the user's query and executes the relevant **MCP tools / A2A agents / (later) skills** it
discovers — instead of the current model where tools are **statically pre-attached at config time**.

## 2. How it works today (baseline) vs. the target

**Today** (`apps/agent/index.ts`):
- Agent connects to **one** AgentCore Gateway MCP endpoint with the forwarded **persona bearer**.
- Lists all gateway tools, then `filterToolsByTargets` narrows to the agent's `allowedTargetNames`
  (a fixed set attached at config time via `agent-tools.ts` → `materializeGatewayTarget`).
- Agent has **no AWS SDK clients and no AWS credentials** — everything goes through the gateway.

**Target** (from the AWS reference): a **two-level orchestrator**:
```
Consumer → Orchestrator agent (static, one tool: discover_and_execute)
              1. semantic search the registry for the query
              2. instantiate discovered records as callable tools
                   MCP   → MCP client to the Gateway URL (OAuth2 bearer)
                   A2A   → wrap remote runtime invocation as a tool (IAM SigV4)
              3. build an ephemeral sub-agent with those tools
              4. sub-agent runs the request; tools torn down after
```

## 3. The crux: our agent has no AWS credentials

The reference orchestrator calls `agent-registry:SearchDiscoverableRegistryRecords` **directly**
via boto3, using its **execution-role credentials**, and reads a **Cognito client secret** from
Secrets Manager to mint MCP OAuth2 tokens. Our `apps/agent` has neither. This is the central
design decision, and there are two ways to close the gap:

### Option A — Agent calls AWS directly (mirror the reference)
Give the runtime execution role `agent-registry:SearchDiscoverableRegistryRecords`, add the
`@aws-sdk/client-agent-registry` client to `apps/agent`, and have the agent search + resolve
records itself (using the container's ambient IAM role for SigV4; Secrets Manager for the MCP
OAuth secret).
- **Pros:** faithful to the reference; self-contained in the agent; no extra hop.
- **Cons:** pushes AWS SDK + credential handling into the agent (which today is deliberately
  credential-light); duplicates registry/descriptor logic that already exists in `packages/api`
  (`registry.ts`, `registry-helpers.ts`).

### Option B — Discovery via a platform "meta-tool" exposed through the gateway/API (Recommended)
Keep the agent credential-light. Expose **search + resolve as tools the agent already reaches**:
the API layer (which already has AWS creds, the `agent-registry` client, and `resolveTargetSpec`)
serves a `discover_registry(query)` tool. The agent calls it like any other tool; the API does the
AWS work and returns resolved target specs (endpoint + auth hints). The agent then connects to the
MCP/A2A endpoints for execution.
- **Pros:** reuses `packages/api` registry code and its IAM (no new creds in the agent); one place
  owns registry access; consistent with how tools already flow (through the gateway/API boundary).
- **Cons:** more moving parts to wire (the meta-tool transport); execution still needs the agent to
  reach MCP/A2A endpoints, so *some* connectivity/auth still lands in the agent.

> **Recommendation:** Option B for **discovery** (search/resolve stays in the credentialed API
> layer), with **execution** handled by the agent connecting to the resolved endpoints — reusing
> the existing gateway-target materialization path for MCP/CUSTOM. This keeps the credential
> boundary where it is today and maximizes reuse. Revisit Option A only if the meta-tool hop proves
> too limiting.

## 4. Execution path per record type (what "execute" means)

| recordType | How to execute | Status in repo |
|---|---|---|
| **MCP** | Materialize as a Gateway target (existing `materializeGatewayTarget` + `resolveTargetSpec`), connect via the Gateway MCP URL. Auth: gateway's configured auth (persona bearer / OAuth2). | **Path exists** — reuse. |
| **CUSTOM** (Lambda) | Same gateway-target path (`resolveTargetSpec` handles `custom.data → lambdaArn + toolSchema`). | **Path exists** — reuse. |
| **A2A** | Invoke the remote agent at its `…/runtimes/{arn}/invocations/` URL via **IAM SigV4** (or `InvokeAgentRuntime`). Wrap as a callable tool. | **NEW** — `resolveTargetSpec` throws on A2A today; needs an A2A resolver + SigV4 invocation. The repo's `apps/a2a-agent` (agent-card + invoke) is a reference for the A2A shape. |
| **SKILL** | **Not an endpoint.** Its `SKILL.md` (in `descriptors.agentSkillsDefinition.additionalData.skillMd.data`) is *procedure/instructions* injected into the agent, and its YAML frontmatter's `mcp_tools:` list **declares which MCP tools to load** for that skill. Optional supporting files (references/scripts) can live in S3. | **NEW** — but the SKILL-centric sample gives a concrete, proven recipe (parse frontmatter → selective MCP load → inject SKILL.md). |

> A2A and SKILL are the genuinely new work. MCP/CUSTOM reuse the existing materialization flow.
> The SKILL-centric sample shows SKILL is arguably the *most valuable* type — it turns the registry
> into an editable capability catalog (no agent redeploy to add/change a skill).

### Selective tool loading (adopt regardless of pattern)
Rather than dumping every discovered tool into the LLM context, load only what the request needs:
the top SKILL's `mcp_tools:` frontmatter names the exact tools; connect the MCP server and filter
`listTools()` to just those. Keeps context lean and scales to large registries. This is the single
best idea from the SKILL-centric sample and should be the default even if we don't do full skills.

## 5. Proposed phasing (small, reviewable increments)

**Phase R1 — MCP/CUSTOM discovery (reuses everything):**
- Add a `discover_registry(query)` capability (Option B): API-side search via
  `SearchDiscoverableRegistryRecords` → for each MCP/CUSTOM hit, resolve via `resolveTargetSpec` and
  materialize a gateway target → return the tool set to the agent.
- Attach a **registryId** to an agent (new agent config field) instead of / alongside the current
  per-record `allowedTargetNames`.
- Agent runs discovered MCP/CUSTOM tools through the existing gateway path.

**Phase R2 — A2A execution (new path):**
- Add an A2A resolver (`resolveTargetSpec` case for `a2aAgentCard` → agent runtime ARN + invoke URL).
- SigV4-invoke the remote runtime; wrap as a tool. Grant the runtime role `bedrock-agentcore:InvokeAgentRuntime`.

**Phase R3 — SKILL (needs product definition):**
- Decide semantics (prompt injection vs. packaged-tool run), then implement.

**Cross-cutting infra (needed once discovery is dynamic):**
- Runtime execution role: add `agent-registry:SearchDiscoverableRegistryRecords` (Option A) OR keep
  it on the API task role (Option B). For A2A: `bedrock-agentcore:InvokeAgentRuntime`.
- Inject `AGENTCORE_REGISTRY_ARN`/region into the relevant runtime env (mirrors the reference's
  `REGISTRY_ARN`).

## 6. Open questions (decide before building)

1. **Option A vs B** for the credential boundary (see §3). Recommendation: **B**.
2. **Orchestrator shape:** ephemeral sub-agent-per-request (reference) vs. attaching discovered
   tools to the existing single agent loop. Sub-agent is more faithful but heavier.
3. **Search strategy:** the reference fires the user query **plus hardcoded fallback queries** every
   turn (broad net for a 3-record demo). For a real registry, use just the user query (+ maybe
   recordType filter) — the fallback approach won't scale.
4. **A2A + SKILL scope:** confirm both are in the first delivery, or land MCP/CUSTOM first (R1) and
   treat A2A/SKILL as follow-ups.
5. **Cost/latency budget:** every turn = search(s) + MCP connect + a full sub-agent LLM loop.
   Acceptable? Any caching of resolved targets within a session?

## 7. What we already have (reduces the work)

- Registry search/list/batch-get APIs (`registry.ts`) — done.
- `resolveTargetSpec` for MCP + CUSTOM, and `materializeGatewayTarget` (config-time today; reusable
  at runtime) — done.
- Gateway MCP plumbing in `apps/agent` — done.
- The GA descriptor shapes the reference uses (`mcpServer.data` + `additionalData.tools`,
  `a2aAgentCard.data`) — match our schema exactly.
