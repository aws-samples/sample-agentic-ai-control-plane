/**
 * Route group mappings for sidebar navigation.
 * Maps path prefixes to their parent nav item URL so that
 * sub-routes (e.g. /dashboard/agent/123) highlight the
 * correct sidebar entry (e.g. /dashboard/agents).
 */
const ROUTE_GROUPS: Record<string, string> = {
  "/dashboard/agent/": "/dashboard/agents",
};

export function isNavActive(pathname: string, navUrl: string): boolean {
  if (navUrl === "#") return false;

  if (navUrl === "/dashboard") {
    return pathname === "/dashboard";
  }

  for (const [prefix, parentUrl] of Object.entries(ROUTE_GROUPS)) {
    if (pathname.startsWith(prefix) && navUrl === parentUrl) {
      return true;
    }
  }

  return pathname.startsWith(navUrl);
}
