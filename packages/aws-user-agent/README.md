# @package/aws-user-agent

Appends the AWS Solutions metrics token — `AWSSOLUTION/<id>/<version>` — to the
`User-Agent` header of outbound AWS calls so this platform's service API usage is
attributed to the solution.

## The token

Defined once in [`src/user-agent.ts`](./src/user-agent.ts). Deployments set the
`USER_AGENT_STRING` env var (CDK for the agent/web containers and the tool
Lambda; Vercel for a2a-agent) from the single constant in
[`apps/infra/lib/solution.ts`](../../apps/infra/lib/solution.ts). When unset
(local dev) the code falls back to the same constant. The solution ID is
`SO0364`. **On each release, bump the version in both files.**

## Two injection mechanisms

The platform reaches AWS three different ways, so there are two hooks:

1. **`installSolutionUserAgentHook()`** / `import "@package/aws-user-agent/register"`
   — patches the shared `@aws-sdk/client-*` base class `send`, so **every** AWS
   SDK v3 client in the process is tagged at once. Used by:
   - `apps/agent` — imported at the top of `index.ts`, before Strands (and its
     bundled `@aws-sdk/client-bedrock-runtime`) loads.
   - `apps/web` — registered in `instrumentation.ts`, covering the
     `BedrockAgentCoreClient` and all the `@packages/api` route clients.

2. **`solutionFetch(fetch)`** — a `fetch` wrapper for `@ai-sdk/amazon-bedrock`,
   which signs and dispatches via `fetch` rather than `@aws-sdk/client-*` and so
   is invisible to the base-class hook. Used by `apps/a2a-agent`
   (`createAmazonBedrock({ fetch: solutionFetch() })`).

The one remaining hand-signed path (`packages/api/routes/mcp.ts`, manual SigV4)
sets the header directly via `solutionUserAgent()`.

## Constraints

- The base-class hook needs a **single copy** of the AWS SDK runtime so there is
  one base-class object. Verify with `pnpm why @smithy/core` (one version). The
  workspace pins `@smithy/types` and `apps/agent` bundles the SDK inline, both of
  which keep it to one copy.
- Do **not** set `customUserAgent` on Strands' `BedrockModel` or the AI SDK
  provider config — those merge the token into their own marker
  (`.../v0.1.0-strands-agents-ts-sdk`) and the metrics pipeline will not match
  it. These hooks set the header after the SDK builds it, preserving the format.
- The token is asserted **exactly once** per request in the tests, which also
  guards retries and catches a silent drop on an SDK upgrade.

## Test

```
pnpm --filter @package/aws-user-agent test
```
