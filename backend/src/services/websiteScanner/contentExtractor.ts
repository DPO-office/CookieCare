/**
 * Reusable content extractor.
 *
 * Fetches a page with Playwright and returns clean, readable text — stripping
 * navigation, footer, scripts, styles, ads, and tracking elements.
 * The result is suitable for AI analysis (e.g. privacy policy review).
 */

import { browserManager } from "../../utils/browserManager.js";
import { validateUrl } from "./urlValidator.js";
import { ExtractedContent } from "./types.js";
import { logger } from "../../utils/logger.js";
import { httpExtractPageContent } from "./httpCrawler.js";

const TAG = "[ContentExtractor]";

/**
 * CSS selectors for boilerplate elements that should be removed before text
 * extraction.  Covers navigation, footers, cookie banners, ads, scripts, and
 * common analytics/tracking containers.
 */
const NOISE_SELECTORS = [
  "nav",
  "header",
  "footer",
  "aside",
  "script",
  "style",
  "noscript",
  "iframe",
  "object",
  "embed",
  // Cookie/consent banners
  "#onetrust-consent-sdk",
  "#CybotCookiebotDialog",
  ".cookie-banner",
  ".cookie-notice",
  ".consent-banner",
  // Ads & tracking
  '[class*="advertisement"]',
  '[class*="tracking"]',
  '[id*="ad-"]',
  '[id*="ads-"]',
  ".ad",
  ".ads",
  // Common navigation wrappers
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  // Social share / sidebar widgets
  ".social-share",
  ".sidebar",
  ".widget",
  ".popup",
  ".modal",
].join(", ");

/**
 * Extract clean readable text from a single page URL.
 *
 * Strategy:
 *   1. Check whether Playwright is available.
 *   2. If yes  → use the existing Playwright-based extraction (unchanged).
 *   3. If no   → fall back to the HTTP-based extractor (httpCrawler.ts).
 *
 * Falls back gracefully in both paths:
 *   - Playwright: navigation failure → { ok: false, text: "" }
 *   - HTTP:       fetch failure      → { ok: false, text: "" }
 */
export async function extractPageContent(url: string): Promise<ExtractedContent> {
  const validation = validateUrl(url);
  if (!validation.valid) {
    return {
      url,
      text: "",
      title: "",
      description: null,
      statusCode: 0,
      ok: false,
      error: `URL validation failed: ${validation.reason}`,
    };
  }

  // ── Playwright availability check ──────────────────────────────────────────
  const playwrightOk = await browserManager.isAvailable();
  if (!playwrightOk) {
    logger.warn(`${TAG} [WebsiteScanner] Playwright unavailable. Falling back to HTTP crawler.`);
    return httpExtractPageContent(url);
  }

  logger.info(`${TAG} [WebsiteScanner] Using Playwright`);

  // ── Playwright path (unchanged) ────────────────────────────────────────────
  let context;
  try {
    context = await browserManager.newContext({ optimizeForScanning: true });
    const page = await context.newPage();

    let statusCode = 0;
    page.on("response", (resp) => {
      if (resp.url() === url || resp.url().startsWith(url)) {
        statusCode = resp.status();
      }
    });

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    } catch (navErr) {
      logger.warn(`${TAG} Navigation failed for ${url}: ${(navErr as Error).message}`);
      return {
        url,
        text: "",
        title: "",
        description: null,
        statusCode,
        ok: false,
        error: (navErr as Error).message,
      };
    }

    // page.evaluate runs in the browser context. DOM types are not in this
    // project's tsconfig (lib: ES2022, no dom). We shadow 'document' with a
    // local declaration to satisfy the TypeScript compiler; at runtime inside
    // the browser, this assignment is never reached — the real browser
    // document is used instead.
    const { title, description, text } = await page.evaluate(
      (noiseSelectors: string) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const document = globalThis.document as {
          querySelectorAll: (s: string) => { forEach: (fn: (el: any) => void) => void };
          title: string;
          querySelector: (s: string) => { getAttribute: (k: string) => string | null; innerText?: string } | null;
          body: { innerText: string };
        };
        document.querySelectorAll(noiseSelectors).forEach((el: any) => el.remove());

        const title = document.title ?? "";
        const descMeta =
          document.querySelector('meta[name="description"]') ??
          document.querySelector('meta[property="og:description"]');
        const description = descMeta?.getAttribute("content") ?? null;

        const mainEl: any =
          document.querySelector("main") ??
          document.querySelector('[role="main"]') ??
          document.querySelector("article") ??
          document.body;

        const rawText: string = mainEl?.innerText ?? "";

        const text = rawText
          .split(/\n+/)
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0)
          .join("\n");

        return { title, description, text };
      },
      NOISE_SELECTORS
    );

    const ok = statusCode >= 200 && statusCode < 400;
    logger.debug(`${TAG} Extracted ${text.length} chars from ${url} (status ${statusCode})`);

    return { url, text, title, description, statusCode, ok };
  } catch (err) {
    logger.error(`${TAG} Unexpected error extracting ${url}: ${(err as Error).message}`);
    return {
      url,
      text: "",
      title: "",
      description: null,
      statusCode: 0,
      ok: false,
      error: (err as Error).message,
    };
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

/**
 * Batch-extract content from multiple URLs, returning results in order.
 * Failed URLs produce an { ok: false } entry rather than throwing.
 */
export async function extractMultiplePages(
  urls: string[]
): Promise<ExtractedContent[]> {
  const results: ExtractedContent[] = [];
  for (const url of urls) {
    const result = await extractPageContent(url);
    results.push(result);
  }
  return results;
}
