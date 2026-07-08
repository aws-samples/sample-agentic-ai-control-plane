import { auth } from "@package/auth/server";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    // API/RPC callers get a 401 (a browser redirect is not a real block for a
    // programmatic client); page routes get redirected to sign-in.
    const { pathname } = request.nextUrl;
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
