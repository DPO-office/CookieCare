/**
 * routeMap.ts — Bidirectional mapping between legacy tab IDs and URL paths.
 *
 * This is the single source of truth used by:
 *   - navConfig.ts          (path field on each NavLeaf/NavItem)
 *   - AppLayout.tsx         (pathToTabId for sidebar active highlight)
 *   - dashboard constants   (JOB_TYPE_TABS values → paths via tabIdToPath)
 *   - any component calling useNavigate() with a legacy tab string
 */

/** tab-id → URL path */
export const TAB_TO_PATH: Record<string, string> = {
  dashboard:             "/dashboard",
  "legal-review":        "/analyze",
  "legal-draft":         "/drafting",
  "legal-ask-ai":        "/ask-lawyer",
  "legal-negotiate":     "/negotiate",
  "legal-compare":       "/compare",
  "legal-vault":         "/vault",
  "legal-queue":         "/queue",
  "LORA-ai":             "/workspace",
  "cookie-scanner":      "/cookie-scanner",
  "dpa-reviewer":        "/dpa-reviewer",
  "vendor-review":       "/vendor-review",
  "vulnerability-scanner": "/vulnerability-scanner",
  "ai-ethics":           "/ai-ethics",
  "ai-tools-inventory":  "/ai-tools-inventory",
  "admin-panel":         "/admin",
  settings:              "/settings",
};

/** URL path → tab-id (reverse of TAB_TO_PATH) */
const PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_TO_PATH).map(([tab, path]) => [path, tab])
);

/**
 * Convert a URL pathname to the legacy tab ID for sidebar highlight and
 * TopNav breadcrumb. Falls back to "dashboard" for unknown paths.
 */
export function pathToTabId(pathname: string): string {
  // Exact match first
  if (PATH_TO_TAB[pathname]) return PATH_TO_TAB[pathname];
  // Prefix match for nested routes (e.g. /drafting/123)
  const match = Object.entries(PATH_TO_TAB).find(([path]) =>
    pathname.startsWith(path + "/")
  );
  return match ? match[1] : "dashboard";
}

/**
 * Convert a legacy tab ID to its URL path.
 * Used wherever old code called setActiveTab(tabId) for navigation.
 */
export function tabIdToPath(tabId: string): string {
  return TAB_TO_PATH[tabId] ?? "/dashboard";
}
