/**
 * Reusable metadata extractor.
 *
 * Fetches a page and collects:
 *   - <title> and meta description
 *   - Open Graph tags
 *   - Security-relevant HTTP headers (CSP, HSTS, X-Frame-Options, …)
 *   - <html lang> attribute
 *   - Canonical URL
 *
 * Uses native fetch for the HTTP headers pass and Playwright for DOM metadata.
 * The two-step approach keeps Playwright usage minimal.
 */

import { browserManager } from "../../utils/browserManager.js";
import { validateUrl } from "./urlValidator.js";
import { PageMetadata } from "./types.js";
import { logger } from "../../utils/logger.js";
import { httpExtractPageMetadata } from "./httpCrawler.js";

const TAG = "[MetadataExtractor]";

/** Security and compliance-relevant HTTP response headers to capture. */
const RELEVANT_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "permissions-policy",
  "referrer-policy",
  "x-xss-protection",
  "server",
  "x-powered-by",
  "content-language",
];

/**
 * Fetch HTTP response headers for the given URL using native fetch.
 * Returns only the subset listed in RELEVANT_HEADERS.
 */
async function fetchRelevantHeaders(url: string): Promise<Record<string, string>> {
  const captured: Record<string, string> = {};

  try {
    const resp = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "CookieCare-Scanner/1.0" },
    });

    for (const name of RELEVANT_HEADERS) {
      const value = resp.headers.get(name);
      if (value) captured[name] = value;
    }
  } catch (err) {
    // If HEAD fails, try GET (some servers block HEAD)
    try {
      const resp = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "CookieCare-Scanner/1.0" },
      });

      for (const name of RELEVANT_HEADERS) {
        const value = resp.headers.get(name);
        if (value) captured[name] = value;
      }
    } catch (fallbackErr) {
      logger.debug(
        `${TAG} Header fetch failed for ${url}: ${(fallbackErr as Error).message}`
      );
    }
  }

  return captured;
}

/**
 * Extract DOM-based metadata (title, description, og tags, language, canonical)
 * using a lightweight Playwright page.
 */
async function extractDomMetadata(url: string): Promise<{
  title: string | null;
  description: string | null;
  openGraph: Record<string, string>;
  language: string | null;
  canonical: string | null;
}> {
  let context;
  try {
    context = await browserManager.newContext({ optimizeForScanning: true });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    } catch (navErr) {
      logger.debug(`${TAG} DOM metadata nav failed for ${url}: ${(navErr as Error).message}`);
      return { title: null, description: null, openGraph: {}, language: null, canonical: null };
    }

    // page.evaluate runs in the browser context. DOM types are not in this
    // project's tsconfig (lib: ES2022, no dom). We shadow 'document' with a
    // local declaration to satisfy the TypeScript compiler.
    const meta: {
      title: string | null;
      description: string | null;
      canonical: string | null;
      language: string | null;
      openGraph: Record<string, string>;
    } = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const document = globalThis.document as any;

      const title: string | null = document.title || null;

      const description: string | null =
        document.querySelector('meta[name="description"]')?.getAttribute("content") ??
        null;

      const canonical: string | null =
        document.querySelector('link[rel="canonical"]')?.href ?? null;

      const language: string | null =
        document.documentElement.getAttribute("lang") ??
        document.documentElement.getAttribute("xml:lang") ??
        null;

      const openGraph: Record<string, string> = {};
      document.querySelectorAll("meta[property], meta[name]").forEach((el: any) => {
        const key: string = el.getAttribute("property") || el.getAttribute("name") || "";
        const value: string = el.getAttribute("content") || "";
        if (
          value &&
          (key.startsWith("og:") ||
            key.startsWith("twitter:") ||
            key.startsWith("article:"))
        ) {
          openGraph[key] = value;
        }
      });

      return { title, description, canonical, language, openGraph };
    });

    return meta;
  } catch (err) {
    logger.warn(`${TAG} DOM metadata extraction failed for ${url}: ${(err as Error).message}`);
    return { title: null, description: null, openGraph: {}, language: null, canonical: null };
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

/**
 * Extract full metadata for a page.
 * Combines HTTP header inspection with DOM-level meta tag extraction.
 *
 * Strategy:
 *   1. Check whether Playwright is available.
 *   2. If yes → use native fetch for headers + Playwright for DOM metadata (unchanged).
 *   3. If no  → use httpExtractPageMetadata (fetch + regex) for both.
 */
export async function extractPageMetadata(url: string): Promise<PageMetadata> {
  const validation = validateUrl(url);
  if (!validation.valid) {
    logger.warn(`${TAG} Blocked metadata extraction for invalid URL: ${url}`);
    return {
      url,
      title: null,
      description: null,
      openGraph: {},
      headers: {},
      language: null,
      canonical: null,
      capturedAt: new Date().toISOString(),
    };
  }

  // ── Playwright availability check ──────────────────────────────────────────
  const playwrightOk = await browserManager.isAvailable();
  if (!playwrightOk) {
    logger.warn(`${TAG} [WebsiteScanner] Playwright unavailable. Falling back to HTTP crawler.`);
    return httpExtractPageMetadata(url);
  }

  logger.info(`${TAG} [WebsiteScanner] Using Playwright`);

  // ── Playwright path (unchanged) ────────────────────────────────────────────
  // Run HTTP header fetch and DOM extraction in parallel
  const [headers, domMeta] = await Promise.all([
    fetchRelevantHeaders(url),
    extractDomMetadata(url),
  ]);

  logger.debug(`${TAG} Metadata captured for ${url}`);

  return {
    url,
    title: domMeta.title,
    description: domMeta.description,
    openGraph: domMeta.openGraph,
    headers,
    language: domMeta.language,
    canonical: domMeta.canonical,
    capturedAt: new Date().toISOString(),
  };
}
