// Self-hosted Monaco setup — import this for its side effect before rendering
// any @monaco-editor/react <Editor>.
//
// By default @monaco-editor/react downloads the Monaco engine (loader, CSS,
// workers, source maps) from cdn.jsdelivr.net. Our hardened Content-Security-
// Policy (apps/web/proxy.ts) only allows 'self', so every one of those CDN
// requests is blocked and the editor renders in a broken, degraded state.
//
// Instead of loosening the CSP to trust a third-party CDN, we point the loader
// at the locally-installed `monaco-editor` package (already a dependency) so all
// assets are served same-origin. The only CSP addition needed is
// `worker-src 'self' blob:` for the editor web worker.
import { loader } from "@monaco-editor/react";
// Type-only import — erased at compile time, so it never runs on the server.
// The monaco RUNTIME touches `window`/`self` at module-eval, so it must NOT be
// imported at the top level: this file is imported by a "use client" component
// that Next.js still evaluates on the server for SSR, which threw
// "window is not defined" at the monaco import. The runtime is loaded lazily
// inside the browser-only guard below instead.
import type * as MonacoNs from "monaco-editor";

// Configure the editor's web workers to load from same-origin URLs (bundled by
// the app) rather than the CDN. The `new URL(…, import.meta.url)` form makes the
// bundler emit each worker as a same-origin asset under /_next, satisfying
// `worker-src 'self'`.
//
// Monaco requests a worker per language `label`. Cedar is a Monarch-only language
// (base editor worker suffices), but the registry schema editors use `json`
// (see schema-editor-panel.tsx), which needs the JSON language worker for
// validation, folding, colors, and document symbols. Returning the base worker
// for JSON is what caused "Missing requestHandler or method: doValidation /
// getFoldingRanges / findDocumentColors / findDocumentSymbols".
if (typeof window !== "undefined") {
  (self as unknown as { MonacoEnvironment?: MonacoNs.Environment }).MonacoEnvironment =
    {
      getWorker(_workerId: string, label: string) {
        if (label === "json") {
          return new Worker(
            new URL(
              "monaco-editor/esm/vs/language/json/json.worker.js",
              import.meta.url,
            ),
            { type: "module" },
          );
        }
        return new Worker(
          new URL(
            "monaco-editor/esm/vs/editor/editor.worker.js",
            import.meta.url,
          ),
          { type: "module" },
        );
      },
    };

  // Bundle Monaco from the local package (loaded lazily, browser-only) instead of
  // fetching it from the CDN.
  void import("monaco-editor").then((monaco) => {
    loader.config({ monaco });
  });
}
