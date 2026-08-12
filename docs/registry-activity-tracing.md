# Registry Activity Tracing — Design

**Status:** Design → implementing
**Date:** 2026-08-07
**Related:** [[agentcore-registry-ga-migration]] (the registry API this builds on)

## 1. Goal

Give the registry the same **activity trace** the policy library has: a per-record and
per-registry timeline showing **who** did **what** and **when** — record created/edited, version
updated, submitted for approval, status changed (with a **reason**), deleted, and sync triggered;
plus registry-level create/update/delete. Surfaced as an **Activity** view in the UI, mirroring
`policy-library`'s activity log.

## 2. Why this is the *simpler half* of the policy pattern (no sync)

The policy feature has two DB↔AWS relationships; only one needs a sync mechanism, and it is **not**
the one we're copying:

| Data | Source of truth | Direction | Sync needed? |
|---|---|---|---|
| Policy **content** (Cedar code, versions) | local Postgres | DB **→** AWS (Verified Permissions) | ✅ yes — `SyncBatch`/`SyncEvent`/linked-policy machinery pushes and tracks drift |
| Policy **activity log** (`PolicyActivityEvent`) | local Postgres | never leaves the DB | ❌ no |
| Registry **records** | **AWS** (`agent-registry`) | app reads AWS live; DB stores nothing | n/a |
| Registry **activity log** (this doc) | local Postgres | never leaves the DB | ❌ no |

Registry records already live in AWS and are read live, so there is **no DB copy to push** — the
whole `SyncBatch`/linked-policy layer that exists for policy *content* has no registry analogue and
is deliberately omitted. The activity log itself, in both features, is a **local-only audit trail**:
written as a side-effect of a successful mutation, read back for the timeline, never synced.

> The Phase 2 `RegistryEventsStack` (EventBridge → CloudWatch Logs) is **complementary, not a
> substitute**: it captures AWS lifecycle events at the *account* level with **no user identity*,
> and pulls AWS → logs. This feature captures the **per-user "who"** for the in-app UI. Different
> direction, different purpose; neither implies a DB→AWS sync.

## 3. Key architectural difference from policy (and its consequence)

Policy writes its activity event **inside the same `prisma.$transaction`** as the content mutation —
both are DB writes, so they commit atomically. Registry's mutation is an **AWS SDK call**, not a DB
write, so the event **cannot** be co-transacted. Therefore:

- The activity event is written **after** the AWS call returns success.
- The write is **best-effort**: a logging failure must **not** fail the user's action (the AWS
  operation is the source of truth). We wrap the event write in try/catch and log on failure.
- Consequence: in the rare window where the AWS op succeeds but the event write fails, the audit log
  under-reports. Acceptable for an audit trail; called out here so it is a known, deliberate
  trade-off rather than a silent gap.

A second consequence of records living in AWS: events are keyed by **AWS identifiers**
(`registryId` + optional `recordId`), not a local FK. If a record id were ever reused after
deletion, its history could conflate — acceptable for an audit log, and the same class of assumption
policy makes.

## 4. Data model

New Prisma model (additive; mirrors `PolicyActivityEvent`), plus a back-relation on `User`:

```prisma
model RegistryActivityEvent {
  id          String   @id @default(cuid())
  registryId  String   @map("registry_id")   // AWS registry id (always set)
  recordId    String?  @map("record_id")      // AWS record id; null = registry-level event
  type        String                          // see event types below
  description String                          // human-readable, pre-rendered
  actorId     String?  @map("actor_id")
  actor       User?    @relation(fields: [actorId], references: [id], onDelete: SetNull)
  metadata    Json     @default("{}")          // e.g. { statusReason, fromVersion, toVersion }
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([registryId, recordId, createdAt])
  @@map("registry_activity_event")
}
```
`User` gains `registryActivityEvents RegistryActivityEvent[]`. Requires one migration; `db:setup`
(`prisma migrate deploy` + seed) applies it locally.

## 5. Event types

```
registry_created | registry_updated | registry_deleted
record_created   | record_updated   | record_submitted
status_changed   | record_deleted   | sync_triggered
```
`status_changed` stores the reason: `metadata.statusReason` + it appears in `description`
(e.g. `Status changed to REJECTED — "schema missing required field"`).

## 6. API layer (`packages/api/routes/registry.ts`)

1. **Switch registry procedures `os` → `authed`.** Gives `context.user` for the actor. Behavioral
   change: registry endpoints now require a session (the dashboard already authenticates, so no UX
   change; noted because it changes the API surface).
2. **Write an event after each successful AWS mutation** — best-effort helper:
   ```ts
   async function recordActivity(e: {
     registryId: string; recordId?: string; type: ActivityType;
     description: string; actorId: string; metadata?: Record<string, string>;
   }) {
     try { await prisma.registryActivityEvent.create({ data: { ...e, metadata: e.metadata ?? {} } }); }
     catch (err) { console.error("registry activity log write failed", err); }
   }
   ```
   Instrumented ops: `createRegistry`, `updateRegistry`, `deleteRegistry`, `createRegistryRecord`,
   `updateRegistryRecord` (incl. `sync_triggered` when `triggerSynchronization`), `submitRegistryRecord`,
   `updateRegistryRecordStatus` (carries `statusReason`), `deleteRegistryRecord`.
3. **`statusReason`**: already accepted by `updateRegistryRecordStatus` (API done in the GA
   migration). UI will pass it; it flows into the `status_changed` event.
4. **New endpoint** `listRegistryActivity({ registryId, recordId? })` (authed): returns events
   ordered `createdAt desc`, actor name/email joined from `User`. `recordId` present → record-scoped
   (detail page); absent → registry-scoped (registry tab, all records + registry-level).

## 7. UI

- **Record detail page** (`registry/[registryId]/records/[recordId]/page.tsx`): a section/tab
  bar (**Details | Activity**). Activity renders the timeline (adapted from policy's `ActivityLog`).
  The **status-change reason dialog** (optional reason for approve/reject/deprecate) feeds
  `statusReason`. **This is the only place activity is surfaced in the UI.**
- **Registry page** (`registry/[registryId]/page.tsx`): **Records | Activity** tab bar. The Activity
  tab renders the registry-scoped timeline via `listRegistryActivity({ registryId })` (recordId
  omitted → registry-level events + every record's events) with `<ActivityLog showRecordId />` so
  each row shows which record it belongs to. Reinstated 2026-08-10 (originally cut 2026-08-07 as
  UI-only; the API/model/component always retained registry-level support, so this was purely
  wiring the existing endpoint into a new tab — no backend change).
- **Shared timeline**: `registry/_components/activity-log.tsx` (per-type icon/color, relative time,
  actor name), modeled on the policy `ActivityLog`.

## 8. Sequencing (small, verified increments) — ✅ ALL DONE 2026-08-07

1. [x] Prisma model + migration (`20260807063132_add_registry_activity_event`) → applied via
   `migrate dev`; table + index + FK verified in local Postgres; client regenerated.
2. [x] `os → authed` on all 14 registry procedures + best-effort `recordActivity` writes on every
   mutation (create/update/delete registry; create/update/submit/status/delete record;
   sync_triggered). `statusReason` flows into the `status_changed` event.
3. [x] `listRegistryActivity({ registryId, recordId? })` endpoint. Route tests grew to **22**
   (added: activity-write-with-reason, best-effort-no-fail, record/registry-scoped queries,
   null-actor tolerance). The existing tests were adapted with a `callAuthed` helper that mocks
   `@package/auth/server` (session) and `@package/database` (activity writes).
4. [x] Status-change confirm dialog on the record detail page — optional reason textarea for
   approve/reject/deprecate; passes `statusReason`.
5. [x] Activity timeline UI: shared `registry/_components/activity-log.tsx`; **Details | Activity**
   tabs on the record detail page (record-scoped).
6. [x] **Registry-level activity UI (2026-08-10):** **Records | Activity** tabs on the registry page
   (`registry/[registryId]/page.tsx`). Activity tab fetches `listRegistryActivity({ registryId })`
   (registry-scoped) and renders `<ActivityLog showRecordId />`. Best-effort fetch (non-blocking on
   failure); refetched on manual refresh. New i18n keys `RegistryDetail.tabs.{records,activity}`
   added to en/ja/ko. web tsc 0. No API/schema/migration change — the backend already wrote
   registry-level events and the endpoint already served the registry-scoped query.

**Verification:** api tsc at 2 pre-existing baseline errors; api tests `4 failed | 51 passed`
(the 4 are pre-existing `gateway-targets.test.ts`; all 22 registry tests pass); web tsc 0;
infra tsc exit 0. Live dev server: `POST /rpc/listRegistryActivity` returns 401 unauthenticated
(auth wired correctly) and the Prisma client resolves `registryActivityEvent` after restart.

> **Dev-server note:** regenerating the Prisma client (`db:generate`) requires a **dev-server
> restart** — a running process holds the old client in memory and will 500 with
> "Cannot read properties of undefined (reading 'findMany')" until restarted.

## 9. Explicitly out of scope

- **DB→AWS sync** for records or activity (see §2 — registry doesn't have the problem policy sync
  solves).
- Backfilling history for records created before this feature (no source to backfill from).
- Editing/deleting activity events (append-only audit log).
