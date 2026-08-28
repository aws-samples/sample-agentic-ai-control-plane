import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

import { solutionUserAgent } from "./user-agent.js";

// Every generated `@aws-sdk/client-*` class extends one common base class
// (@smithy/smithy-client's `Client`). Patching `send` on that base class covers
// every AWS SDK v3 client that shares it at once — no call site needs touching.
//
// The catch: a base class is shared only across clients built against the SAME
// copy of the SDK runtime. This monorepo intentionally dual-tracks two AWS SDK
// majors during the agent-registry GA migration (the pinned 3.1079.x clients and
// the GA 3.1105.x agent-registry clients), so there are TWO base-class objects.
// We therefore patch the base class of EVERY client constructor passed in, not
// just one — a process that uses both SDK generations passes one client per
// generation. `apps/agent` (Strands) uses only the 3.1079 copy, so the default
// (bedrock-runtime) covers it; `apps/web` passes a 3.1105 client too.

const APPLIED = Symbol.for("agentic-ai-platform.solution-user-agent.applied");

type SendableClient = {
  send: (...args: unknown[]) => unknown;
  middlewareStack: {
    add: (middleware: unknown, options: Record<string, unknown>) => void;
  };
  [APPLIED]?: boolean;
};

// Any AWS SDK v3 client constructor — we only read its prototype chain.
type ClientCtor = new (...args: never[]) => unknown;

// Patches the AWS SDK v3 client base class(es) so every request carries the
// solution token exactly once.
//
// `clientCtors` are sample client constructors used only to locate base classes;
// the base class of each distinct SDK-runtime copy is patched once. Pass one
// client per SDK copy present in the process. Defaults to BedrockRuntimeClient,
// which covers any process using only the pinned 3.1079 SDK copy.
//
// Idempotent per base class: patching the same base class again (from a second
// call or a second constructor sharing it) is a no-op.
export function installSolutionUserAgentHook(
  clientCtors: ClientCtor[] = [BedrockRuntimeClient as ClientCtor],
): void {
  const token = solutionUserAgent();
  const patched = solutionUserAgentPatchedBaseClasses();

  for (const ctor of clientCtors) {
    const clientBase = Object.getPrototypeOf(ctor) as {
      prototype: SendableClient;
    } | null;
    const proto = clientBase?.prototype;
    if (!proto || patched.has(proto)) continue;
    patched.add(proto);
    patchSend(proto, token);
  }
}

// Set of already-patched base-class prototypes, kept on globalThis so repeated
// calls (or a second SDK copy resolving to the same base) never double-patch.
function solutionUserAgentPatchedBaseClasses(): Set<object> {
  const key = Symbol.for(
    "agentic-ai-platform.solution-user-agent.patched-bases",
  );
  const g = globalThis as Record<symbol, unknown>;
  if (!g[key]) g[key] = new Set<object>();
  return g[key] as Set<object>;
}

function patchSend(proto: SendableClient, token: string): void {
  const originalSend = proto.send;

  proto.send = function patchedSend(this: SendableClient, ...args: unknown[]) {
    // Add the header-appending middleware once per client instance. The SDK
    // rebuilds the middleware stack for each request, so adding it here (rather
    // than in the constructor) also covers clients constructed at module load.
    if (!this[APPLIED]) {
      this[APPLIED] = true;
      this.middlewareStack.add(
        (next: (arg: unknown) => unknown) => (arg: unknown) => {
          const request = (arg as { request?: { headers?: Record<string, string> } })
            .request;
          const headers = request?.headers;
          if (headers) {
            // Node uses `user-agent`; browsers/edge use `x-amz-user-agent`.
            const key =
              headers["user-agent"] !== undefined
                ? "user-agent"
                : "x-amz-user-agent";
            const current = headers[key] ?? "";
            // Append as a space-delimited token, and only if absent — so
            // retries (which reuse the built request) never double it.
            if (!current.split(" ").includes(token)) {
              headers[key] = `${current} ${token}`.trim();
            }
          }
          return next(arg);
        },
        { step: "finalizeRequest", name: "solutionUserAgent" },
      );
    }
    return originalSend.apply(this, args);
  } as SendableClient["send"];
}
