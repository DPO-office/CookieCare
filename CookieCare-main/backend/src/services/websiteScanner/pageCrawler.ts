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
 * Use Playwright to crawl <a> links from the root page.
 * Only same-domain, same-protocol links without fragment identifiers are kept.
 *
 * When Playwright is unavailable (missing browser, Group Policy restriction,
 * etc.) the function automatically falls back to an HTTP-based link crawler.
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

  logger.info(`${TAG} [WebsiteScanner] Using Playwright`);

  // ── Playwright path (unchanged) ────────────────────────────────────────────
  let context;
  let added = 0;

  try {
    context = await browserManager.newContext({ optimizeForScanning: true });
    const page = await context.newPage();

    try {
      await page.goto(rootUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

      // page.evaluate runs in the browser — DOM types are not available in the
    // Node.js tsconfig (lib: ES2022, no dom).  Cast the callback to any so
    // page.evaluate runs in the browser context. DOM types are not in this
    // project's tsconfig (lib: ES2022, no dom). We shadow 'document' with a
    // local declaration to satisfy the TypeScript compiler.
    const links: string[] = await page.evaluate((domain: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const document = globalThis.document as any;
      return Array.from(document.querySelectorAll("a"))
        .map((a: any) => a.href as string)
        .filter((href: string) => {
          try {
            const u = new URL(href);
            return (
              u.hostname === domain &&
              (u.protocol === "http:" || u.protocol === "https:") &&
              !u.hash
            );
          } catch {
            return false;
          }
        });
    }, domain);

      for (const link of links) {
        if (existingUrls.size >= limit) break;
        if (validateUrl(link).valid && !existingUrls.has(link)) {
          existingUrls.add(link);
          added++;
        }
      }
    } catch (err) {
      logger.warn(
        `${TAG} Link crawl navigation failed for ${rootUrl}: ${(err as Error).message}`
      );
    } finally {
      await page.close().catch(() => {});
    }
  } catch (err) {
    logger.warn(
      `${TAG} Link crawl browser context failed: ${(err as Error).message}`
    );
  } finally {
    if (context) await context.close().catch(() => {});
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
