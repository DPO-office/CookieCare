/**
 * Compliance page discovery.
 *
 * For a given homepage URL, probes well-known compliance page paths
 * (e.g. /privacy, /cookie-policy, /dpa, /responsible-ai) and returns
 * which ones are reachable.
 *
 * Uses native fetch (HEAD then GET fallback) — no Playwright needed here.
 * Failures are swallowed gracefully; an unreachable path simply produces
 * { reachable: false }.
 */

import { validateUrl } from "./urlValidator.js";
import {
  COMPLIANCE_PATHS,
  CompliancePath,
  DiscoveredCompliancePage,
} from "./types.js";
import { logger } from "../../utils/logger.js";

const TAG = "[ComplianceDiscovery]";

/** Milliseconds to wait for each probe request. */
const PROBE_TIMEOUT_MS = 8000;

/**
 * Probe a single URL.
 * Returns the HTTP status code and whether the page is reachable (2xx/3xx).
 */
async function probePage(
  url: string
): Promise<{ statusCode: number; reachable: boolean }> {
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const resp = await fetch(url, {
        method,
        redirect: "follow",
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        headers: { "User-Agent": "CookieCare-Scanner/1.0" },
      });

      const reachable = resp.status >= 200 && resp.status < 400;
      return { statusCode: resp.status, reachable };
    } catch {
      if (method === "HEAD") continue; // Try GET fallback
    }
  }

  return { statusCode: 0, reachable: false };
}

/**
 * Discover compliance pages for the given homepage URL.
 *
 * Only entries where the probe was reachable (2xx) are returned by default;
 * pass `includeUnreachable: true` to get all probed results.
 */
export async function discoverCompliancePages(
  homepageUrl: string,
  options: { includeUnreachable?: boolean; concurrency?: number } = {}
): Promise<DiscoveredCompliancePage[]> {
  const { includeUnreachable = false, concurrency = 5 } = options;

  let origin: string;
  try {
    origin = new URL(homepageUrl).origin;
  } catch {
    logger.warn(`${TAG} Cannot parse origin from: ${homepageUrl}`);
    return [];
  }

  const results: DiscoveredCompliancePage[] = [];

  // Probe in batches to respect the concurrency limit
  for (let i = 0; i < COMPLIANCE_PATHS.length; i += concurrency) {
    const batch = COMPLIANCE_PATHS.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (path) => {
        const url = `${origin}${path}`;

        if (!validateUrl(url).valid) {
          return null;
        }

        const { statusCode, reachable } = await probePage(url);

        logger.debug(`${TAG} ${url} → ${statusCode} (reachable: ${reachable})`);

        return {
          path,
          url,
          statusCode,
          reachable,
        } satisfies DiscoveredCompliancePage;
      })
    );

    for (const entry of batchResults) {
      if (entry && (entry.reachable || includeUnreachable)) {
        results.push(entry);
      }
    }
  }

  logger.debug(
    `${TAG} ${results.filter((r) => r.reachable).length} compliance pages found for ${homepageUrl}`
  );

  return results;
}

/**
 * Convenience: pick the first reachable page matching any of the given paths.
 */
export function findFirst(
  pages: DiscoveredCompliancePage[],
  ...paths: CompliancePath[]
): DiscoveredCompliancePage | null {
  return (
    pages.find((p) => paths.includes(p.path as CompliancePath) && p.reachable) ??
    null
  );
}
