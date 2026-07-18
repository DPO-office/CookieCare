/**
 * Reusable page crawler.
 *
 * Discovers internal URLs for a given domain using:
 *   1. /sitemap.xml parsing
 *   2. Playwright <a> link crawl (when sitemapOnly is false)
 *
 * The Cookie Scanner's discoverUrls() logic is preserved verbatim here;
 * ScannerService will delegate to this module so both code-paths stay in sync.
 */

import { browserManager } from "../../utils/browserManager.js";
import { validateUrl } from "./urlValidator.js";
import { CrawlOptions, CrawlResult } from "./types.js";
import { logger } from "../../utils/logger.js";
import { httpCrawlLinks } from "./httpCrawler.js";

const TAG = "[PageCrawler]";

/**
 * Fetch and parse /sitemap.xml for the given root URL.
 * Returns an array of same-domain URLs found in <loc> elements.
 */
async function fetchSitemapUrls(
  rootUrl: string,
  domain: string,
  limit: number
): Promise<{ urls: string[]; found: boolean }> {
  const sitemapUrl = new URL("/sitemap.xml", rootUrl).toString();

  if (!validateUrl(sitemapUrl).valid) {
    return { urls: [], found: false };
  }

  try {
    const resp = await fetch(sitemapUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "CookieCare-Scanner/1.0" },
    });

    if (!resp.ok) return { urls: [], found: false };

    const text = await resp.text();
    const matches = text.match(/<loc>(.*?)<\/loc>/g) ?? [];
    const urls: string[] = [];

    for (const m of matches) {
      if (urls.length >= limit) break;
      const loc = m.replace(/<\/?loc>/g, "").trim();
      try {
        const u = new URL(loc);
        if (u.hostname === domain && validateUrl(loc).valid) {
          urls.push(loc);
        }
      } catch {
        // Malformed <loc> — skip silently
      }
    }

    logger.debug(`${TAG} sitemap found at ${sitemapUrl} — ${urls.length} URLs`);
    return { urls, found: urls.length > 0 };
  } catch (err) {
    logger.debug(`${TAG} sitemap fetch failed for ${sitemapUrl}: ${(err as Error).message}`);
    return { urls: [], found: false };
  }
}

/**
 * Extract same-domain <a href> links from a single page URL via Playwright.
 * Returns the raw href strings that pass origin + protocol + no-fragment checks.
 * Does not modify any shared state — purely reads one page and returns links.
 */
async function extractLinksFromPage(
  pageUrl: string,
  domain: string
): Promise<string[]> {
  let context;
  try {
    context = await browserManager.newContext({ optimizeForScanning: true });
    const page = await context.newPage();
    try {
      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      const links: string[] = await page.evaluate((d: string) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const document = globalThis.document as any;
        return Array.from(document.querySelectorAll("a"))
          .map((a: any) => a.href as string)
          .filter((href: string) => {
            try {
              const u = new URL(href);
              return (
                u.hostname === d &&
                (u.protocol === "http:" || u.protocol === "https:") &&
                !u.hash
              );
            } catch {
              return false;
            }
          });
      }, domain);
      return links;
    } catch (err) {
      logger.warn(`${TAG} Link extraction failed for ${pageUrl}: ${(err as Error).message}`);
      return [];
    } finally {
      await page.close().catch(() => {});
    }
  } catch (err) {
    logger.warn(`${TAG} Browser context failed for ${pageUrl}: ${(err as Error).message}`);
    return [];
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

/**
 * BFS recursive crawl of same-domain pages via Playwright.
 * Visits pages level-by-level; stops as soon as `existingUrls` reaches `limit`.
 *
 * When Playwright is unavailable the function falls back to the HTTP crawler
 * which only processes the root URL (existing behaviour).
 */
async function crawlLinksFromPage(
  rootUrl: string,
  domain: string,
  limit: number,
  existingUrls: Set<string>
): Promise<number> {
  // ── Playwright availability check ──────────────────────────────────────────
  const playwrightOk = await browserManager.isAvailable();
  if (!playwrightOk) {
    logger.warn(`${TAG} [WebsiteScanner] Playwright unavailable. Falling back to HTTP crawler.`);
    return httpCrawlLinks(rootUrl, domain, limit, existingUrls);
  }

  logger.info(`${TAG} [WebsiteScanner] Using Playwright (BFS crawl)`);

  // ── BFS queue — seeded with the root URL ───────────────────────────────────
  // `existingUrls` already contains rootUrl (added by caller), so we track
  // visited pages separately to avoid re-visiting pages already in the set
  // that were contributed by the sitemap step.
  const visited = new Set<string>();
  const queue: string[] = [rootUrl];
  let added = 0;

  while (queue.length > 0 && existingUrls.size < limit) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const links = await extractLinksFromPage(current, domain);

    for (const link of links) {
      if (existingUrls.size >= limit) break;
      // Normalise: strip trailing slash for dedup, but keep the original href
      const normalised = link.replace(/\/$/, "");
      if (!existingUrls.has(normalised) && !existingUrls.has(link) && validateUrl(link).valid) {
        existingUrls.add(link);
        added++;
        // Enqueue for further crawling only if not already visited
        if (!visited.has(link)) {
          queue.push(link);
        }
      }
    }

    logger.debug(
      `${TAG} BFS visited ${current} — queue=${queue.length} total=${existingUrls.size}/${limit}`
    );
  }

  return added;
}

/**
 * Discover internal URLs for the given root URL.
 *
 * Behaviour is identical to ScannerService.discoverUrls() so the Cookie
 * Scanner produces the exact same results when it delegates here.
 */
export async function discoverUrls(
  rootUrl: string,
  options: CrawlOptions = {}
): Promise<CrawlResult> {
  const { limit = 20, sitemapOnly = false } = options;

  let domain: string;
  try {
    domain = new URL(rootUrl).hostname;
  } catch {
    return { urls: [rootUrl], sitemapFound: false, linksCrawled: 0 };
  }

  const urlSet = new Set<string>([rootUrl]);

  // Step 1 — sitemap
  const { urls: sitemapUrls, found: sitemapFound } = await fetchSitemapUrls(
    rootUrl,
    domain,
    limit
  );

  for (const u of sitemapUrls) {
    if (urlSet.size >= limit) break;
    urlSet.add(u);
  }

  if (urlSet.size >= limit || sitemapOnly) {
    return {
      urls: Array.from(urlSet).slice(0, limit),
      sitemapFound,
      linksCrawled: 0,
    };
  }

  // Step 2 — link crawl
  const linksCrawled = await crawlLinksFromPage(rootUrl, domain, limit, urlSet);

  return {
    urls: Array.from(urlSet).slice(0, limit),
    sitemapFound,
    linksCrawled,
  };
}
