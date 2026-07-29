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
import * as monaco from "monaco-editor";

// Configure the editor's web worker to load from a same-origin URL (bundled by
// the app) rather than the CDN. Cedar is a Monarch-only language with no
// language service, so only the base editor worker is required. The `new URL(…,
// import.meta.url)` form makes the bundler emit the worker as a same-origin
// asset under /_next, satisfying `worker-src 'self'`.
if (typeof window !== "undefined") {
  (self as unknown as { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment =
    {
      getWorker() {
        return new Worker(
          new URL(
            "monaco-editor/esm/vs/editor/editor.worker.js",
            import.meta.url,
          ),
          { type: "module" },
        );
      },
    };

  // Bundle Monaco from the local package instead of fetching it from the CDN.
  loader.config({ monaco });
}
