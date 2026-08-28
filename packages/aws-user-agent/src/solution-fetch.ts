import { solutionUserAgent } from "./user-agent";

// The Vercel AI SDK's `@ai-sdk/amazon-bedrock` provider does NOT use
// `@aws-sdk/client-*` — it signs requests with its own SigV4 implementation and
// dispatches them through `fetch`. The base-class patch in sdk-hook.ts therefore
// never sees these calls. Instead, pass `fetch: solutionFetch(fetch)` into
// `createAmazonBedrock(...)` so the token is appended to the outbound request.
//
// The token is added AFTER the provider has signed the request. Bedrock SigV4
// does not include User-Agent in its signed headers, so appending it does not
// invalidate the signature.
export function solutionFetch(
  baseFetch: typeof fetch = fetch,
): typeof fetch {
  const token = solutionUserAgent();

  return function solutionUserAgentFetch(input, init) {
    const headers = new Headers(init?.headers ?? {});
    // Node fetch exposes the request's own header via `user-agent`.
    const key = headers.has("x-amz-user-agent")
      ? "x-amz-user-agent"
      : "user-agent";
    const current = headers.get(key) ?? "";
    if (!current.split(" ").includes(token)) {
      headers.set(key, `${current} ${token}`.trim());
    }
    return baseFetch(input, { ...init, headers });
  };
}
