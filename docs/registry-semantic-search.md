# Registry Record Search — Semantic + Substring Hybrid

**Status:** Implemented
**Date:** 2026-08-10
**Related:** [[agentcore-registry-ga-migration]] (the registry API this builds on), [[registry-activity-tracing]]

## 1. Goal

Make the "Search records…" bar on the registry detail page
(`/dashboard/registry/[registryId]`) use the AWS AgentCore **semantic** search API
instead of a plain client-side substring filter — while keeping every record
(including Draft/Pending) findable.

## 2. Background — what the AWS API actually does

The data-plane SDK `@aws-sdk/client-agent-registry` exposes
`SearchDiscoverableRegistryRecordsCommand`. Per its JSDoc:

> "Searches the discoverable registry records in a registry using a **natural
> language query**. Returns metadata for the matching records **ordered by
> relevance**."

So it is genuine semantic / relevance-ranked search executed server-side by AWS —
not keyword matching implemented in this repo. The oRPC endpoint
`searchRegistryRecords` (`packages/api/routes/registry.ts:916`) already wrapped it;
it was previously only used by the separate `search-records.tsx` catalog component.

## 3. The key constraint: "discoverable" = APPROVED only

The command name is `Search**Discoverable**RegistryRecords`. "Discoverable" means
**only APPROVED / published records**. But the detail page lists records via the
control-plane `ListRegistryRecordsCommand` (`listRegistryRecords`,
`registry.ts:482`), which returns **all statuses** (DRAFT, PENDING_APPROVAL,
APPROVED, …).

Naively swapping the substring filter for the semantic API would therefore make
Draft/Pending records **disappear from search results** — a regression for a
management view whose whole point is triaging pending items.

## 4. Design — hybrid, debounced

Implemented entirely in `apps/web/app/dashboard/registry/_components/records-list.tsx`.
No backend, schema, or IAM changes (the endpoint and its
`agent-registry:SearchDiscoverableRegistryRecords` permission already existed).

**Trigger:** debounced as-you-type (400 ms after the user stops typing). Empty
query → no network call, plain list restored.

**Result merge (hybrid):**
1. Fire semantic search → get `recordId`s in relevance order (APPROVED only).
2. Map those IDs back to the full local record objects, in order.
3. Append any *other* local records (all statuses) that match a plain substring
   pass and weren't already surfaced.

This means: semantic relevance ranking for approved records **first**, then a
safety net so Draft/Pending/Rejected records matching the text are never lost.
The existing **status filter** dropdown continues to apply on top of everything.

**Failure handling:** if the semantic call throws (transient AWS error, or a
registry with no approved records), we clear the semantic result and fall back to
substring-only — search never hard-fails.

**registryArn source:** all records in a registry share `registryArn`, so it's
derived from `records[0].registryArn` — no new props threaded through.

**UI:** a small spinner (`Loader2`) appears inside the right edge of the search
input while a semantic call is in flight.

## 5. Files changed

- `apps/web/app/dashboard/registry/_components/records-list.tsx`
  - Added `semanticIds` / `isSemanticSearching` state.
  - Added a debounced `useEffect` calling `$orpc.searchRegistryRecords`.
  - Replaced the one-line `.filter()` with a `useMemo` hybrid merge.
  - Added an in-input loading spinner.

## 6. Not done / future

- No new i18n keys were required (reused `searchPlaceholder`, `noMatches.*`).
- Could add a relevance score or "semantic match" badge — the API returns records
  ordered by relevance but no numeric score is surfaced today.
- Could debounce-cancel in-flight requests server-side; currently handled
  client-side via a `cancelled` flag.
