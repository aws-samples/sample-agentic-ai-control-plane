# AgentCore Agent Registry — GA Migration & Spec

**Status:** Draft / tracking — no code changes yet
**Date opened:** 2026-08-07
**Owner:** _tbd_
**Trigger:** AWS Agent Registry became GA on **2026-08-06**, moving out of the `bedrock-agentcore`
namespace into its own dedicated **`agent-registry`** service. This is a **breaking migration**
across namespace, API schema, and data. Old `bedrock-agentcore` registry namespace **shuts down
2026-09-17**.

> **⚠️ Correction notice (2026-08-07):** Earlier revisions of this doc concluded the control plane
> did *not* change namespace and that the only schema change was one additive optional field. **Both
> were wrong.** They were based on diffing two versions of the *preview* SDK
> (`@aws-sdk/client-bedrock-agentcore-control` `3.1079.0` vs `3.1105.0`) — but the GA schema lives in
> a **different package** (`@aws-sdk/client-agent-registry-control`), which the earlier passes never
> examined. The authoritative source is the AWS
> [Comprehensive registry migration guide](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-faq.html);
> this doc has been rewritten against it and against the actual `agent-registry(-control)@3.1105.0`
> SDK packages. Real-world confirmation: a Workshop Studio deployment broke on 2026-08-06 with
> `AccessDeniedException ... agent-registry:ListRegistries` — i.e. even `ListRegistries` (a
> control-plane op) is now under the `agent-registry:` IAM prefix.

---

## 1. TL;DR

AWS Agent Registry graduated into its **own service and namespace** at GA. The change spans **three
areas** (per the AWS migration guide), and it is **breaking** — not additive:

1. **Namespace & configuration change — applies to BOTH control plane and data plane.** The whole
   service (management *and* discovery) moved from `bedrock-agentcore` to **`agent-registry`**:

   | Surface | Old (`bedrock-agentcore`) | New (`agent-registry`) |
   |---|---|---|
   | Control-plane SDK package | `@aws-sdk/client-bedrock-agentcore-control` | **`@aws-sdk/client-agent-registry-control`** |
   | Control-plane client class | `BedrockAgentCoreControlClient` | **`AgentRegistryControlClient`** |
   | Data-plane SDK package | `@aws-sdk/client-bedrock-agentcore` | **`@aws-sdk/client-agent-registry`** |
   | Data-plane client class | `BedrockAgentCoreClient` | **`AgentRegistryClient`** |
   | Control endpoint | `bedrock-agentcore-control.{region}.amazonaws.com` | **`agent-registry-control.{region}.api.aws`** |
   | Data endpoint | `bedrock-agentcore.{region}.amazonaws.com` | **`agent-registry.{region}.api.aws`** |
   | IAM action prefix (ALL ops incl. `ListRegistries`, `CreateRegistry`, …) | `bedrock-agentcore:*` | **`agent-registry:*`** |
   | Resource ARNs | `arn:aws:bedrock-agentcore:…:registry/…` | **`arn:aws:agent-registry:…:registry/…`** |
   | Service principal (sync role trust) | `bedrock-agentcore.amazonaws.com` | **`agent-registry.amazonaws.com`** |
   | Managed policy | `BedrockAgentCoreFullAccess` | **`AgentRegistryFullAccess`** (old one will NOT be updated) |
   | CloudTrail source / EventBridge source / CW namespace | `…bedrock-agentcore…` | **`…agent-registry…`** |
   | CLI namespace | `aws bedrock-agentcore(-control)` | **`aws agent-registry(-control)`** |

   > **This affects the rest of AgentCore only for Registry.** Identity, Gateway, Runtime, Policy
   > stay on `bedrock-agentcore`. Notably, **workload-identity and OAuth credential-provider
   > resources stay under `bedrock-agentcore:`** — so registries using URL sync must keep those
   > `bedrock-agentcore:*WorkloadIdentity` permissions *alongside* the new `agent-registry:*`.

2. **API schema change — breaking record/registry model redesign** (see §3 for full before/after).
   Highlights: `descriptorType` **removed** → new required **`recordType`** (`AGENT|MCP|SKILL|CUSTOM`);
   `descriptors` flattened from a discriminated union to flat keys (`mcpServer`, `a2aAgentCard`,
   `agentSkillsDefinition`, `custom`); `inlineContent`→**`data`**, `schemaVersion`/`protocolVersion`→**`dataSchemaVersion`**,
   top-level `synchronizationConfiguration`→per-descriptor **`source`**; old `name`→**`displayName`** plus a
   **new required `name`** dedup key; `approvalConfiguration.autoApproval` (bool) → **`autoApprovalRules`** (enum array);
   registry `authorizerType`/`authorizerConfiguration` move under **`discoveryConfiguration`**; List ops
   change **GET→POST** with a structured **`filters`** array; `SearchRegistryRecords` → **`SearchDiscoverableRegistryRecords`**,
   plus new **`ListDiscoverableRegistryRecords`** / **`BatchGetDiscoverableRegistryRecord`** browse APIs.

3. **Data migration — manual, with a hard deadline.** Existing registries/records are **not**
   migrated automatically. AWS ships a migration tool (in `agentcore-samples`) that extracts from
   `bedrock-agentcore`, transforms to the new schema, and loads into `agent-registry` (same account
   & region). Both namespaces run in parallel **2026-08-06 → 2026-09-17**; after that the old one is
   gone. New customers with no pre-existing data as of 2026-08-06 must use `agent-registry` directly.

So our current `packages/api/routes/registry.ts` is written against the **old preview
`bedrock-agentcore` schema** and must be migrated wholesale: new SDK packages, new clients, new IAM
grant/ARNs, and a rewritten route/zod layer for the new record model. This is a service migration,
not drift cleanup.

---

## 2. Source of truth for this doc

| Item | Value |
|---|---|
| Authoritative source | AWS [Comprehensive registry migration guide](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-faq.html) + [IAM permissions](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-iam-permissions.html) + [Concepts](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-concepts.html) |
| GA date / old namespace shutdown | GA **2026-08-06** · `bedrock-agentcore` registry namespace **shuts down 2026-09-17** |
| Control SDK pinned in repo (OLD) | `@aws-sdk/client-bedrock-agentcore-control` `^3.1079.0` — preview `bedrock-agentcore` schema (see `packages/api/package.json`) |
| Data SDK pinned in repo (OLD) | `@aws-sdk/client-bedrock-agentcore` `^3.1079.0` — preview |
| GA target (control) | **`@aws-sdk/client-agent-registry-control@3.1105.0`** (new package, client `AgentRegistryControlClient`) |
| GA target (data plane) | **`@aws-sdk/client-agent-registry@3.1105.0`** (new package, client `AgentRegistryClient`) |
| GA control-plane shapes verified against | `agent-registry-control@3.1105.0` `dist-types` — signing name `agent-registry`, endpoint `agent-registry-control.{region}.api.aws` |
| GA data-plane shapes verified against | `agent-registry@3.1105.0` `dist-types` — signing name `agent-registry`, endpoint `agent-registry.{region}.api.aws` |

> **Why the earlier revisions were wrong:** they diffed `@aws-sdk/client-bedrock-agentcore-control`
> `3.1079.0` vs `3.1105.0`. Both of those are the **preview** package; AWS froze the preview schema
> and shipped GA under the **new** `agent-registry-control` package. Comparing preview-to-preview
> naturally showed "no change." The correct comparison is preview `bedrock-agentcore-control` →
> GA `agent-registry-control`, which is a breaking redesign (see §3).

Repo files in scope:

- `packages/api/package.json` — swap `@aws-sdk/client-bedrock-agentcore` → `@aws-sdk/client-agent-registry`; bump `-control` to `3.1105.0`
- `packages/api/routes/registry.ts` — all registry oRPC handlers (control-plane on
  `bedrock-agentcore-control`; **data-plane search must move to `agent-registry`**)
- `apps/infra/**` — task-role IAM must add the **`agent-registry:*`** grant for the new data-plane service
- `packages/api/routes/registry-helpers.ts` — resolves a record → target spec (MCP / Lambda)
- `packages/api/routes/registry-helpers.test.ts`
- `packages/api/router.ts` — spreads `registryRouter`
- Web consumers:
  - `apps/web/app/dashboard/registry/page.tsx` + `_components/*` (list, create, edit, records, search)
  - `apps/web/app/dashboard/registry/[registryId]/page.tsx`
  - `apps/web/app/dashboard/registry/[registryId]/create/page.tsx`
  - `apps/web/app/dashboard/registry/[registryId]/records/[recordId]/page.tsx`
  - `apps/web/app/dashboard/registry/search/page.tsx`
  - `apps/web/app/dashboard/agent/[id]/_components/registry-tool-picker.tsx` (consumes records as agent tools)

---

## 3. Authoritative GA shapes (`agent-registry(-control)@3.1105.0`)

Enums shared by both packages:
```
RecordType             = AGENT | MCP | SKILL | CUSTOM      # replaces old DescriptorType (MCP|A2A|CUSTOM|AGENT_SKILLS)
RegistryAuthorizerType = AWS_IAM | CUSTOM_JWT
AutoApprovalRule       = APPROVE_ALL                        # array; [] or absent = manual approval
RegistryStatus         = CREATING | READY | UPDATING | CREATE_FAILED | UPDATE_FAILED | DELETING | DELETE_FAILED
RegistryRecordStatus   = CREATING | DRAFT | PENDING_APPROVAL | APPROVED | REJECTED | DEPRECATED | UPDATING | CREATE_FAILED | UPDATE_FAILED
```

### 3.1 Control plane — `@aws-sdk/client-agent-registry-control` (`AgentRegistryControlClient`)

Command set (names unchanged; namespace/schema changed): `CreateRegistry`, `GetRegistry`,
`ListRegistries`, `UpdateRegistry`, `DeleteRegistry`, `CreateRegistryRecord`, `GetRegistryRecord`,
`ListRegistryRecords`, `UpdateRegistryRecord`, `UpdateRegistryRecordStatus`,
`SubmitRegistryRecordForApproval`, `DeleteRegistryRecord`.

**CreateRegistryRequest** — authorizer config now nested under `discoveryConfiguration`; approval is
an enum array.
```
name: string
description?: string
discoveryConfiguration?: {                 # was top-level authorizerType/authorizerConfiguration
  authorizerType?: AWS_IAM | CUSTOM_JWT
  authorizerConfiguration?: AuthorizerConfiguration   # { customJWTAuthorizer: { discoveryUrl, allowedAudience?, allowedClients?, allowedScopes?, advertisedScopeMapping?, ... } }
}
approvalConfiguration?: { autoApprovalRules?: ["APPROVE_ALL"] }   # was { autoApproval: boolean }
clientToken?: string
tags?: Record<string,string>               # tags-on-create now supported (was TagResource follow-up)
```
→ `CreateRegistryResponse { registryArn }`

**UpdateRegistryRequest** (PATCH wrappers)
```
registryId, name?, description?: UpdatedDescription,
discoveryConfiguration?: UpdatedDiscoveryConfiguration,
approvalConfiguration?: UpdatedApprovalConfiguration
```

**CreateRegistryRecordRequest** — `recordType` replaces `descriptorType`; `name` is now a **required
dedup key**, human label moves to `displayName`.
```
registryId: string
name: string                 # REQUIRED dedup key, unique per registry ((name, recordVersion) unique)
displayName?: string         # was the old "name"
description?: string
recordType: AGENT | MCP | SKILL | CUSTOM     # REQUIRED; was descriptorType
descriptors: Descriptors     # REQUIRED, flat keyed (see below)
recordVersion?: string
clientToken?: string
tags?: Record<string,string>
```
→ `CreateRegistryRecordResponse { recordArn, status }`   (async; status starts `CREATING`)

**Descriptors** — flat keyed structure (was a discriminated union keyed by `descriptorType`).
Exactly one primary key per record; the valid key depends on `recordType`.
```
{
  mcpServer?:            { data?, dataSchemaVersion?, source?, additionalData?: { tools?: { data?, dataSchemaVersion? } } }
  a2aAgentCard?:         { data?, dataSchemaVersion?, source? }
  agentSkillsDefinition?:{ data?, dataSchemaVersion?, additionalData?: { skillMd?: { data?, dataSchemaVersion?, source? } } }
  custom?:               { data? }
}
# valid primary descriptor per recordType:
#   AGENT  -> a2aAgentCard | mcpServer | custom
#   MCP    -> mcpServer | custom
#   SKILL  -> agentSkillsDefinition | custom
#   CUSTOM -> custom
```
Field renames vs old preview schema:
| Old (`bedrock-agentcore`) | New (`agent-registry`) |
|---|---|
| `descriptorType` (top-level enum) | **removed** → `recordType` |
| `descriptors.mcp.server` / `.tools` | `descriptors.mcpServer` / `.mcpServer.additionalData.tools` |
| `descriptors.a2a.agentCard` | `descriptors.a2aAgentCard` |
| `descriptors.agentSkills.*` | `descriptors.agentSkillsDefinition` (+ `.additionalData.skillMd`) |
| `inlineContent` | **`data`** |
| `schemaVersion` / `protocolVersion` | **`dataSchemaVersion`** |
| top-level `synchronizationType` + `synchronizationConfiguration` | per-descriptor **`source`** (only `source.fromUrl`; only on `mcpServer` & `a2aAgentCard`) |
| record `name` (label) | **`displayName`** (+ new required `name` dedup key) |

> **Sync semantics:** `source` attaches only to `mcpServer` and `a2aAgentCard` (i.e. MCP/AGENT
> records auto-sync). `skillMd.source` is persisted but not synced; SKILL & CUSTOM don't auto-sync.
> CUSTOM records are created manually by providing `data` directly. This replaces the old
> `synchronizationType: URL|MANUAL` — there is no `MANUAL` flag; "manual" = no `source`.

**GetRegistryRecordResponse** — `{ registryArn, recordArn, recordId, name, displayName?,
description?, recordType, descriptors?, recordVersion?, status, createdAt, updatedAt, statusReason? }`

**UpdateRegistryRecordRequest** — `{ registryId, recordId, name?, displayName?: UpdatedDisplayName,
description?: UpdatedDescription, recordType?, descriptors?: UpdatedDescriptors, recordVersion?,
triggerSynchronization? }`

**UpdateRegistryRecordStatusRequest** — `{ registryId, recordId, status, statusReason }` (`statusReason`
required; service accepts `APPROVED|REJECTED|DEPRECATED`).

**List ops are now POST with structured `filters`** (was GET with discrete query params):
```
ListRegistriesRequest        { maxResults?, nextToken?, filters?: RegistryFilter[] }
ListRegistryRecordsRequest   { registryId, maxResults?, nextToken?, filters?: RegistryRecordFilter[] }
# RegistryRecordFilter = { name: "recordType" | "name" | "status" | ..., values: string[] }
```
`RegistryRecordSummary` (list item): `{ registryArn, recordArn, recordId, name, displayName?,
description?, recordType, recordVersion, status, createdAt, updatedAt }`.

### 3.2 Data plane — `@aws-sdk/client-agent-registry` (`AgentRegistryClient`)

Three discovery commands (consumer-facing; only see APPROVED records):

1. **`SearchDiscoverableRegistryRecords`** (was `SearchRegistryRecords`)
   `{ searchQuery, registryIds[], maxResults?, filters?: Document }` → `{ registryRecords: RegistryRecordSummary[] }`
2. **`ListDiscoverableRegistryRecords`** (new) — `POST /registries/{id}/discoverable-records-list`
   `{ registryId, maxResults? (1-100), nextToken?, filters?: [{ name:"recordType", values:[...] }] }`
   → `{ registryRecords: [...summary+displayName...], nextToken? }`
3. **`BatchGetDiscoverableRegistryRecord`** (new) — `{ entries: [{ registryId, recordIds[] }] }`
   → `{ registryRecords: [...+descriptors...], errors: [{ registryId, recordId, errorCode, message }] }`
   (no own IAM action — authorizes via `agent-registry:GetDiscoverableRegistryRecord`)

Search summary uses **`recordType`**, never `protocol`. Filters use `recordType`/`recordVersion`
(replacing old `descriptorType`/`version`).

---

## 4. What must change in the repo (findings)

Our `registry.ts` targets the **old preview `bedrock-agentcore` schema end-to-end**. This is not
field drift — it's a whole-service migration. Ranked by risk. Line numbers are
`packages/api/routes/registry.ts` unless noted.

| # | Area | Current code | GA reality | Impact |
|---|---|---|---|---|
| M1 | **SDK packages + clients** | Imports `BedrockAgentCoreControlClient` (`@aws-sdk/client-bedrock-agentcore-control`) and `BedrockAgentCoreClient` (`@aws-sdk/client-bedrock-agentcore`) (`:1–29`) | `AgentRegistryControlClient` (`@aws-sdk/client-agent-registry-control`) + `AgentRegistryClient` (`@aws-sdk/client-agent-registry`) | **Blocking.** Every command import + both clients change. Old packages stop working after 2026-09-17. |
| M2 | **IAM grant / ARNs** | Task role presumably grants `bedrock-agentcore:*Registry*` on `arn:aws:bedrock-agentcore:*` | Needs **`agent-registry:*`** on `arn:aws:agent-registry:*` (all ops incl. `ListRegistries`); replace `BedrockAgentCoreFullAccess` → `AgentRegistryFullAccess`; **keep** `bedrock-agentcore:*WorkloadIdentity` for URL-sync records | **Blocking + silent.** Exactly the Workshop Studio failure. Compiles & tests pass; fails at runtime with `AccessDenied`. Also SCP/permission-boundary allowlists must include the new prefix. |
| M3 | **Endpoints** | `bedrock-agentcore-control.{region}.amazonaws.com` / `bedrock-agentcore.{region}.amazonaws.com` (SDK default) | `agent-registry-control.{region}.api.aws` / `agent-registry.{region}.api.aws` (`.api.aws`!) | SDK resolves automatically once packages swap, but VPC endpoints / egress allowlists scoped to the old hosts will break. |
| M4 | **Record model: `descriptorType` → `recordType`** | Input/enum/params use `descriptorType` = MCP\|A2A\|CUSTOM\|AGENT_SKILLS (`:84`, `:384`) | Required `recordType` = AGENT\|MCP\|SKILL\|CUSTOM; `descriptorType` removed | Breaking. Zod schemas, create/update handlers, web forms all change. Note A2A is now the `AGENT` recordType via `a2aAgentCard`. |
| M5 | **`descriptors` flattening + field renames** | Nested union `mcp.server`/`a2a.agentCard`/`agentSkills.*`, `inlineContent`, `schemaVersion`/`protocolVersion`, top-level `synchronizationConfiguration` (`:99–165`, `:414–421`, `:619–657`) | Flat `mcpServer`/`a2aAgentCard`/`agentSkillsDefinition`/`custom`; `data`; `dataSchemaVersion`; per-descriptor `source` | Breaking. `DescriptorsSchema`, create/update record, and `registry-helpers.ts` resolvers all rewrite. |
| M6 | **`registry-helpers.ts` resolvers** | Read `descriptorType`, `descriptors.mcp.server.inlineContent`, `descriptors.custom.inlineContent`, `synchronizationConfiguration.fromUrl.url` | New: `recordType`, `descriptors.mcpServer.data`, `descriptors.custom.data`, `descriptors.mcpServer.source.fromUrl.url` | Breaking. `resolveMcp`/`resolveCustom` + tests must be reworked (was previously assessed as "no change" — that was against the wrong schema). |
| M7 | **`synchronizationType: URL\|MANUAL`** | Input enum + `create/page.tsx` sends `MANUAL` (`:387`, create page `:224`) | No such field. "Manual" = omit `source`; only `mcpServer`/`a2aAgentCard` carry `source` | Breaking. Remove the field; drive sync purely off presence of `descriptors.*.source.fromUrl`. |
| M8 | **Registry auth: `discoveryConfiguration`** | Not modeled; `authorizerType` absent | `discoveryConfiguration.{authorizerType, authorizerConfiguration}` | New capability (AWS_IAM default vs CUSTOM_JWT). |
| M9 | **`approvalConfiguration` bool → enum array** | `{ autoApproval: boolean }` (`:46`, `:226`) | `{ autoApprovalRules: ["APPROVE_ALL"] }` ; `[]`/absent = manual | Breaking. Schema + create dialog. |
| M10 | **Search command + result field** | `SearchRegistryRecordsCommand`; result read as `protocol` (`:666–704`, `search-records.tsx:18,211`) | `SearchDiscoverableRegistryRecordsCommand`; summary field `recordType` | Breaking rename + field fix. |
| M11 | **List ops GET→POST + `filters`** | `ListRegistries`/`ListRegistryRecords` pass discrete params, ignore pagination (`:180`, `:319`) | POST with `filters: [{name,values}]`, `nextToken` pagination | Breaking param shape; also fixes silent first-page truncation. |
| M12 | **`name` vs `displayName` split** | Single `name` (`:376`) | Required `name` dedup key **plus** optional `displayName` | Breaking. Forms + list rendering; `(name, recordVersion)` must be unique. |
| M13 | **Record status responses** | Fabricates `recordId` from ARN, `submit` output has `name` (`:427`, `:474`) | `CreateRegistryRecord` returns `{recordArn, status}`; async `CREATING` | Reconcile outputs; UI handles async create. |
| M14 | **Data migration + sync-role trust** | Existing registries/records live under `bedrock-agentcore` | Must run AWS migration tool (agentcore-samples); URL-sync records need role trust updated `bedrock-agentcore.amazonaws.com` → `agent-registry.amazonaws.com` | Operational, one-time. Data NOT auto-migrated. Deadline 2026-09-17. |

---

## 5. Migration plan (proposed — for review before implementation)

**Phase 0 — Dependencies & IAM (unblock everything)** — ✅ DONE 2026-08-07
- [x] Add `@aws-sdk/client-agent-registry-control@^3.1105.0` and
      `@aws-sdk/client-agent-registry@^3.1105.0` to `packages/api/package.json`.
- [x] **Keep** `@aws-sdk/client-bedrock-agentcore(-control)` — they are **not** registry-only;
      Gateway/Runtime/Policy code (`gateways.ts`, `agent-runtime.ts`, `policy-engines.ts`,
      `agent-tools.ts`, `dashboard-metrics.ts`, web invoke-stream) still uses them, and per AWS
      only Registry changes namespace. *(Corrects an earlier "remove old packages" step — that was
      wrong.)* Remove only if a future audit shows no remaining registry-namespace usage.
- [x] **Infra: added parallel `agent-registry:*` grants** to the dashboard task role in
      `apps/infra/lib/dashboard-stack.ts`, mirroring the existing tag-scoped bedrock-agentcore
      registry structure, on `arn:aws:agent-registry:{region}:{account}:*`
      (sids `AgentRegistryOwnedRegistries`, `AgentRegistryClaimByTag`,
      `AgentRegistryUnscopedActions`, incl. renamed `SearchDiscoverableRegistryRecords` +
      new `ListDiscoverableRegistryRecords`/`GetDiscoverableRegistryRecord`). Old
      `bedrock-agentcore` registry grants retained until the `registry.ts` code migration lands
      (Phase 1/2), then removed. Workload-identity grants left on `bedrock-agentcore` (correct).
      **NOTE:** `BedrockAgentCoreFullAccess` → `AgentRegistryFullAccess` swap is N/A here — this
      repo enumerates actions on the task role, it does not attach the managed policy. SCP/
      permission-boundary allowlisting is an org-level concern (this is what broke Workshop
      Studio); this repo does not manage an SCP.
- [x] VPC/egress (M3): dashboard task SG is `allowAllOutbound: true` with no interface VPC
      endpoints or host-scoped egress rules → `.api.aws` resolves fine, **no infra change needed**.
- [x] pnpm `minimumReleaseAge` gate: added scoped `minimumReleaseAgeExclude` for
      `@aws-sdk/client-agent-registry`, `-control`, and a `@aws-sdk/*` glob (the GA clients pull a
      newer first-party `@aws-sdk` shared-runtime family, all published ~2026-08-05). *(Decision:
      exclude now, per Q1.)*
- [x] Added `overrides: "@smithy/types": "^4.16.1"` — the GA clients pull `@smithy/types@4.16.1`
      while pinned `3.1079.0` clients pull `4.15.1`; two copies made SDK command/middleware types
      structurally incompatible (5 tsc errors in `packages/api`). Override dedupes them.
- [x] Verified: `pnpm install` clean; `apps/infra` `tsc` exit 0; `packages/api` `tsc` back to its
      **2 pre-existing** baseline errors (`agents.ts` TS7006, `database/index.ts` TS2835 — both
      unrelated to this work); `packages/api` tests unchanged at the pre-existing `4 failed | 29
      passed` (all 4 failures are in `gateway-targets.test.ts` and pre-date this change).

**Phase 1 — Rewrite control-plane handlers to the new record model** — ✅ DONE 2026-08-07
Chose **Option B** (GA shapes end-to-end): the API exposes GA-native shapes and the web
consumers were rewritten to speak them (no adapter layer).
- [x] Swap clients to `AgentRegistryControlClient` in `registry.ts`. Also migrated the two other
      registry *readers* (`agent-tools.ts`, `gateway-targets.ts` — `GetRegistryRecord`) to the GA
      control client; their gateway ops stay on `bedrock-agentcore`. (M1)
- [x] Replace `descriptorType` → `recordType` (AGENT|MCP|SKILL|CUSTOM) across zod, handlers, and
      web (create page, record detail, records-list, search, tool-picker, sections/constants). (M4, M12)
- [x] Rewrite `DescriptorsSchema` to flat keyed shape (`mcpServer`/`a2aAgentCard`/
      `agentSkillsDefinition`/`custom`) + `data`/`dataSchemaVersion`/`source`; update-record uses
      the nested `optionalValue` PATCH wrappers via `wrapDescriptorsForUpdate`. (M5)
- [x] Rewrite `registry-helpers.ts` resolvers + 13 tests to the new descriptor paths
      (`recordType`, `descriptors.mcpServer.data`, `descriptors.mcpServer.source.fromUrl.url`,
      `descriptors.custom.data`). Tests pass. (M6)
- [x] Remove `synchronizationType`; sync driven off `descriptors.*.source.fromUrl`. Web create
      page maps its URL/MANUAL toggle to presence/absence of `source`. (M7)
- [x] `discoveryConfiguration` (authorizer) + `autoApprovalRules` (approval); create/edit dialogs
      map their boolean auto-approve toggle to `["APPROVE_ALL"]` / `[]`. (M8, M9)
- [x] List handlers now POST with `filters` + full `nextToken` pagination server-side. (M11)
- [x] Create returns `{recordArn, status}`; submit/status responses reconciled to GA. (M13)
- [x] `name`/`displayName` split surfaced in the UI (lists/search prefer `displayName`). (M12)
- **Verified:** `apps/web` tsc 0 errors; `packages/api` tsc at 2 pre-existing baseline errors only;
  `registry-helpers.test.ts` 13/13 pass; `apps/infra` tsc exit 0.
- [x] **Route-level tests added** (`registry.test.ts`, 14 tests, all pass) — mock both GA clients
      via `aws-sdk-client-mock` and invoke handlers with `@orpc/server`'s `call()` (which validates
      input+output against the zod schemas). Cover: create-record flat descriptors + tags +
      old-field absence; the **`updateRegistryRecord` PATCH-wrapper nesting** (asserts the exact
      nested `optionalValue` tree — closes the highest-risk item); list `nextToken` pagination;
      list status→`filters` mapping; approval `autoApprovalRules` default; duplicate-name CONFLICT;
      error mapping; get/submit/status shapes; and the data-plane
      `SearchDiscoverableRegistryRecords` command + `recordType` result. Full api suite now
      `4 failed | 43 passed` (was `4 failed | 29 passed`; the 4 failures are the unchanged
      pre-existing `gateway-targets.test.ts` ones).
- **Still deferred:** live smoke against a real GA registry (needs AWS creds / a GA-enabled
  account) — mocked tests prove request/response *shape*, not that the live service accepts them.

**Phase 2 — New GA capabilities** — ✅ DONE 2026-08-07
- [x] Search swapped to `AgentRegistryClient` / `SearchDiscoverableRegistryRecords`; result field
      `recordType`; `maxResults` capped at 20 per GA. (M10)
- [x] **Browse APIs** — added `listDiscoverableRegistryRecords` (paginated, `maxResults` ≤100,
      `nextToken`, optional recordType filter) and `batchGetDiscoverableRegistryRecords`
      (≤100 ids → one entry; returns records + per-record errors) oRPC procedures. +3 route tests.
- [x] **Structured filters** — `searchRegistryRecords` and the browse list accept a recordType
      `filters` array, plumbed to the GA `filters` param. (Data-plane filter enum supports
      recordType only — status is not filterable there, so the input is constrained to recordType.)
- [x] **Browse/filter UI** — the search page now browses (empty query → `listDiscoverable`) vs.
      searches (query → `searchDiscoverable`), with a recordType dropdown feeding both; button label
      toggles Search/Browse.
- [x] **CUSTOM_JWT registry auth UI** — create-registry dialog gained an authorizer-type select
      (AWS_IAM default / CUSTOM_JWT) with discoveryUrl (required) + allowedAudience/allowedScopes,
      wired to `discoveryConfiguration`.
- [x] **EventBridge lifecycle events** — new `apps/infra/lib/registry-events-stack.ts`
      (`RegistryEventsStack`, wired in `platform.ts`) captures all `aws.agent-registry` events
      (7 registry + 5 record detail types) into a CloudWatch Logs audit group
      (`/agentic-ai-platform/agent-registry/events`, 90-day retention) via a source-only rule.
      Verified by isolated `cdk synth` → valid `AWS::Events::Rule` + `AWS::Logs::LogGroup`.
- [x] **Multi-version official-schema reference** — the schema editor's "Official schema" version
      dropdown was single-version + disabled; now it lists every vendored MCP revision and switches
      the reference pane live. Schemas are fetched verbatim from upstream via
      `registry/[registryId]/_schemas/fetch-schemas.ts` (server: `static.modelcontextprotocol.io`
      per-version `server.schema.json` × 6; tool: curated `{tools:[Tool]}` excerpts derived from the
      MCP protocol `schema.json` for 2025-06-18 / 2025-03-26 / 2024-11-05, plus the hand-curated
      2025-11-25). `_schemas/index.ts` now models `{ defaultVersion, versions[] }` per key; the
      panel tracks a selected version in state.
- **Verified:** `packages/api` tests `4 failed | 46 passed` (registry route tests now 17; the 4
  failures are the unchanged pre-existing `gateway-targets.test.ts` ones); api/web tsc at baseline
  (2 pre-existing / 0); infra tsc exit 0.
- **Still deferred:** live smoke against a real GA registry (needs AWS creds); a dedicated
  batch-get UI (the API exists; search/browse currently cover the list/detail flows).

**Phase 3 — Cutover (operational)** — bulk data-migration tool **SKIPPED** (only a few
registries; recreate by hand via the dashboard under the `agent-registry` namespace).
- [x] **Decommissioned the old `bedrock-agentcore` registry IAM** in `dashboard-stack.ts`
      (removed `AgentCoreClaimByTag`, `AgentCoreOwnedRegistries`, and the registry create/list/
      search + record-CRUD actions from `AgentCoreUnscopedActions`). Safe because the dashboard code
      already targets `agent-registry` exclusively. **Kept** workload-identity (see below), gateway,
      policy, and runtime grants. infra tsc exit 0; 0 `bedrock-agentcore:*Registr*` actions remain.
- [ ] **Sync-role trust policy (operator action, not repo code).** Any registry record that uses
      the **IAM** URL-sync credential type points at a *user-supplied* role ARN (typed into the
      create-record form — this repo provisions no such role). In the `agent-registry` namespace the
      service principal that assumes that role changed, so its **trust policy** must be updated by
      whoever owns the role:
      ```jsonc
      // BEFORE (bedrock-agentcore preview)          // AFTER (agent-registry GA)
      { "Effect": "Allow",                            { "Effect": "Allow",
        "Principal": {                                  "Principal": {
          "Service": "bedrock-agentcore.amazonaws.com"    "Service": "agent-registry.amazonaws.com"
        },                                              },
        "Action": "sts:AssumeRole" }                    "Action": "sts:AssumeRole" }
      ```
      Records using OAuth or no-auth sync are unaffected. If skipped, the record lands in
      `CREATE_FAILED` and sync silently fails (the service assumes the role asynchronously).

**Phase 4 — Verification**
- [x] `registry-helpers.test.ts` reworked (13 tests) + `registry.test.ts` added (17 tests, incl.
      the PATCH-wrapper nesting and the browse/filter APIs). All pass.
- [ ] **Post-cutover checklist (run against the live `agent-registry` namespace, needs AWS creds):**
  - [ ] `listRegistries` count matches the number of registries you recreated.
  - [ ] Open a recreated record's detail page — descriptors render (server/tools/agent-card/custom).
  - [ ] Create → submit → approve → deprecate a record end-to-end (status transitions work).
  - [ ] Search **and** browse (empty query) return the record; the recordType filter narrows results.
  - [ ] Create a `CUSTOM_JWT` registry (discovery URL) and an `AWS_IAM` registry — both succeed.
  - [ ] For any IAM URL-sync record: trigger sync, confirm it does **not** land in `CREATE_FAILED`
        (i.e. the role trust policy was updated per Phase 3).
  - [ ] Confirm registry lifecycle events appear in the CloudWatch log group
        `/agentic-ai-platform/agent-registry/events` (the `RegistryEventsStack` sink).

---

## 6. IAM / infra notes

- **Whole registry namespace moved to `agent-registry:` — including control-plane ops.** The
  Workshop Studio failure (`AccessDeniedException ... agent-registry:ListRegistries ... no service
  control policy allows`) is the canonical example: `ListRegistries` is control-plane yet now
  authorizes under `agent-registry:`. IAM identity policies **and** SCPs / permission boundaries
  must allow the new prefix. An IAM allow cannot override an SCP deny — brand-new service prefixes
  may be blocked by org SCP allowlists until explicitly added (this is what broke Workshop Studio;
  the WS team's fix was to add `agent-registry` to allowed service prefixes).
- **Managed policy:** the swap `BedrockAgentCoreFullAccess` → `AgentRegistryFullAccess` is **N/A
  for this repo** — `dashboard-stack.ts` enumerates actions on the task role rather than attaching
  the managed policy. (Relevant only for setups that attach the managed policy.)
- **Retain a slice of `bedrock-agentcore:`.** Workload-identity and OAuth credential-provider
  resources stay under `bedrock-agentcore` — URL-sync records need
  `bedrock-agentcore:{Create,Get,Delete,Update}WorkloadIdentity` **alongside** the `agent-registry:*`
  grants. These are retained in `AgentCoreUnscopedActions`; only the registry actions were removed.
- **Old registry grants decommissioned (Phase 3).** The `bedrock-agentcore` registry actions have
  been removed from `dashboard-stack.ts` now that the dashboard code targets `agent-registry`
  exclusively. Current registry grants: `AgentRegistryOwnedRegistries` (tag-scoped Get/Update/
  Delete), `AgentRegistryClaimByTag` (TagResource), and `AgentRegistryUnscopedActions`
  (Create/List/records CRUD + the three `*Discoverable*` data-plane actions).
- **ARNs** change to `arn:aws:agent-registry:{region}:{account}:registry/{id}[/record/{rid}]` — update
  any ARN parsing/storage (e.g. our `registryArn.split("/").pop()` logic still works, but resource
  policies / conditions keyed on the old ARN namespace do not).
- **Tags-on-create now exist** (`CreateRegistry`/`CreateRegistryRecord` take `tags`) — the current
  create-then-`TagResource` rollback dance in `createRegistry` can be simplified.
- **Endpoints** use `.api.aws` (not `.amazonaws.com`). Region still via `AGENTCORE_REGISTRY_REGION`
  (default `us-east-1`); confirm GA region availability.
- **Sync-role trust:** service principal for assuming URL-sync roles changed
  `bedrock-agentcore.amazonaws.com` → `agent-registry.amazonaws.com` (M14). The migration tool does
  not fix this — update trust policies manually or synced records land in `CREATE_FAILED`.

---

## 7. Open questions (need a decision before implementation)

1. **pnpm release-age gate.** GA packages published 2026-08-06; `minimumReleaseAge` is 7 days.
   Wait, or add a scoped `minimumReleaseAgeExclude` for `@aws-sdk/client-agent-registry*`?
2. **Migration approach (§ data migration).** Do we have existing `bedrock-agentcore` registries/
   records to migrate, or are we effectively a new customer starting fresh on `agent-registry`?
   Determines whether we run the migration tool at all (Case 1 simple / Case 2 Glue / Case 3
   active-active) — and the 2026-09-17 deadline.
3. **A2A / AGENT record support.** The new model makes A2A a first-class `AGENT` recordType via
   `a2aAgentCard`. Do we expose AGENT/SKILL record types now, or stay MCP+CUSTOM and expand later?
   (`resolveTargetSpec` currently handles only MCP+CUSTOM.)
4. **Authorizer type UX.** Expose `CUSTOM_JWT` (discoveryConfiguration) now, or ship `AWS_IAM`-only first?
5. **Async record creation.** GA `CreateRegistryRecord` returns `status: CREATING`. Poll
   `GetRegistryRecord` until `DRAFT`/`APPROVED`, or fire-and-forget in the UI?
6. **VPC/egress for `.api.aws` endpoints.** Confirm connectivity before rollout.

---

## 8. Appendix — verification commands (reproducible)

```bash
# The GA packages are NEW (agent-registry*, not bedrock-agentcore*)
npm view @aws-sdk/client-agent-registry-control version   # -> 3.1105.0
npm view @aws-sdk/client-agent-registry version           # -> 3.1105.0

# Confirm namespace on the GA control package
npm pack @aws-sdk/client-agent-registry-control@3.1105.0
tar xzf aws-sdk-client-agent-registry-control-3.1105.0.tgz
grep -rho 'SigningName: *"[^"]*"' package/dist-cjs/index.js | sort -u    # -> "agent-registry"
grep -rhoE 'https://[^"]*agent-registry[^"]*' package/dist-cjs/index.js   # -> agent-registry-control.{Region}.api.aws
# New record model: recordType (not descriptorType), flat descriptors (mcpServer/a2aAgentCard/...)
grep -n 'recordType\|descriptorType' package/dist-types/models/*.d.ts | head

# LESSON: the earlier passes diffed @aws-sdk/client-bedrock-agentcore-control 3.1079.0 vs 3.1105.0.
# BOTH are the PREVIEW package (frozen schema) -> "no change" was an artifact of comparing the
# wrong packages. GA lives under @aws-sdk/client-agent-registry-control. Always confirm the
# PACKAGE identity (signing name + endpoint), not just two versions of a familiar package name.

# Authoritative doc:
# https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-faq.html
```
