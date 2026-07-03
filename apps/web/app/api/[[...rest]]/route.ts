import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { onError } from "@orpc/server";
import { CORSPlugin } from "@orpc/server/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { router } from "@packages/api";

const openAPIHandler = new OpenAPIHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
  plugins: [
    new CORSPlugin({
      origin:
        process.env.CORS_ALLOWED_ORIGIN ||
        process.env.NEXT_PUBLIC_APP_URL ||
        undefined,
      credentials: true,
    }),
  ],
});

const openAPIGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

async function handleRequest(request: Request) {
  const url = new URL(request.url);

  // Serve OpenAPI specification
  if (url.pathname === "/api/spec.json") {
    const spec = await openAPIGenerator.generate(router, {
      info: {
        title: "Agent Management Platform",
        description: "Agent Management Platform API",
        version: "0.1.0",
      },
      servers: [{ url: "/api" }],
      components: {},
    });

    return new Response(JSON.stringify(spec), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Serve Scalar API reference UI
  if (url.pathname === "/api" || url.pathname === "/api/") {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>Agent Management Platform API Reference</title>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" type="image/svg+xml" href="/favicon.ico" />
          <style>
            :root {
              --scalar-custom-header-height: 50px;
            }
            b {
              font-weight: 500;
            }
            .custom-header {
              height: var(--scalar-custom-header-height);
              background-color: var(--scalar-background-1);
              box-shadow: inset 0 -1px 0 var(--scalar-border-color);
              color: var(--scalar-color-1);
              font-size: var(--scalar-font-size-2);
              padding: 0 18px;
              position: sticky;
              justify-content: space-between;
              top: 0;
              z-index: 100;
            }
            .custom-header,
            .custom-header nav {
              display: flex;
              align-items: center;
              gap: 18px;
            }
            .custom-header a:hover {
              color: var(--scalar-color-2);
            }
          </style>
        </head>
        <body>
        <header class="custom-header scalar-app">
            <div style="display: flex; align-items: center; gap: 10px;">
            <img src="/aws-logo.png" alt="Logo" style="height: 18px; width: auto;" />
            <b>Agent Platform</b>
            </div>
        </header>
          <div id="app"></div>

          <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
          <script>
            Scalar.createApiReference('#app', {
              url: '/api/spec.json',
              showSidebar: true,
              showToolbar: "never",
              hideClientButton: true,
            })
          </script>
        </body>
      </html>
    `;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }

  // Handle API requests with OpenAPIHandler
  const { response } = await openAPIHandler.handle(request, {
    prefix: "/api",
    context: { headers: request.headers },
  });

  return response ?? new Response("Not found", { status: 404 });
}

export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
