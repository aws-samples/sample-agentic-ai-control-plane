import { auth } from "@package/auth/server";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// Endpoints that must stay reachable WITHOUT a session:
//   /api/status    — ALB + container HEALTHCHECK probe it with no cookie;
//                    gating it behind auth returns 401 and the ECS task never
//                    becomes healthy (deploy fails with NotStabilized).
//   /api/auth/*     — Better Auth's own handler (sign-in, OAuth callback that
//                    CREATES the session). Gating it breaks the login flow.
function isPublicPath(pathname: string): boolean {
  return pathname === "/api/status" || pathname.startsWith("/api/auth");
}

// Paths that require an authenticated session. Everything else (e.g. /sign-in,
// the root, static-adjacent pages) still receives a CSP but is not auth-gated —
// gating /sign-in would cause a redirect loop.
function isProtectedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/rpc")
  );
}

// Builds the Content-Security-Policy for this request. A per-request nonce is
// generated so Next.js can tag its own inline hydration scripts; no other
// inline script executes (mitigates XSS — see security task BSC1).
function buildCsp(nonce: string): string {
  // React's DEV build uses eval() for debugging (stack traces, HMR). It never
  // uses eval() in production, and the security control forbids 'unsafe-eval'
  // there — so allow it only outside production.
  const devEval =
    process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : "";
  return [
    `default-src 'self'`,
    // 'strict-dynamic' + nonce is the Next.js-recommended pattern for allowing
    // framework scripts without 'unsafe-inline'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    // 'unsafe-inline' is permitted by the control for style-src ONLY; Next.js
    // and Tailwind emit inline styles.
    `style-src 'self' 'unsafe-inline'`,
    // dicebear serves avatar SVGs used by the editor plugin.
    `img-src 'self' data: https://api.dicebear.com`,
    `font-src 'self'`,
    `connect-src 'self'`,
    // The Cedar code editor (self-hosted Monaco — see lib/monaco-setup.ts) spawns
    // a same-origin web worker; some bundler outputs load it via a blob: URL.
    // Scoped to 'self'/blob: — far tighter than allowing a third-party CDN.
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

// Applies the CSP plus the standard defensive security headers (see security
// task BSC — X-Frame-Options / X-Content-Type-Options / HSTS / Cache-Control)
// and exposes the nonce via x-nonce.
function withSecurityHeaders(
  response: NextResponse,
  nonce: string,
): NextResponse {
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  response.headers.set("x-nonce", nonce);
  // Defense-in-depth headers required for every response.
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=47304000; includeSubDomains",
  );
  // Prevent caching of potentially sensitive authenticated responses.
  response.headers.set("Cache-Control", "no-store, no-cache");
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Propagate the nonce to the request so Next.js applies it to its inline
  // hydration scripts and Server Components can read it from headers().
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const forward = { request: { headers: requestHeaders } };

  // Non-protected paths (sign-in, root, etc.) and public endpoints get the CSP
  // but skip the session check.
  if (isPublicPath(pathname) || !isProtectedPath(pathname)) {
    return withSecurityHeaders(NextResponse.next(forward), nonce);
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    // API/RPC callers get a 401 (a browser redirect is not a real block for a
    // programmatic client); page routes get redirected to sign-in.
    if (pathname.startsWith("/rpc") || pathname.startsWith("/api")) {
      return withSecurityHeaders(
        NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
        nonce,
      );
    }
    return withSecurityHeaders(
      NextResponse.redirect(new URL("/sign-in", request.url)),
      nonce,
    );
  }

  return withSecurityHeaders(NextResponse.next(forward), nonce);
}

export const config = {
  // Apply to all routes so every HTML page carries a CSP (security task BSC1),
  // excluding Next.js static assets and the favicon. This also covers the
  // auth-gated /dashboard, /api, and /rpc surfaces handled above.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
