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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    // API/RPC callers get a 401 (a browser redirect is not a real block for a
    // programmatic client); page routes get redirected to sign-in.
    if (pathname.startsWith("/rpc") || pathname.startsWith("/api")) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Protect the dashboard pages and BOTH API surfaces. The oRPC API is mounted
  // at /rpc — it must be covered or every mutating procedure is reachable
  // unauthenticated. Trailing :path* ensures nested routes are matched too.
  matcher: ["/dashboard/:path*", "/api/:path*", "/rpc/:path*"],
};
