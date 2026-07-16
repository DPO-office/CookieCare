/**
 * HTTP-based fallback crawler.
 *
 * Used automatically when Playwright browsers are unavailable (e.g. on managed
 * corporate laptops where browser installation is blocked by Group Policy).
 *
 * Implements the same interfaces as the Playwright-backed modules so callers
 * can swap between the two without any changes.
 *
 * Implementation notes:
 *   - Uses Node's built-in fetch (Node 18+) — no extra dependencies required.
 *   - HTML parsing is done with targeted regex patterns rather than a DOM
 *     parser, which keeps the dependency footprint at zero while being
 *     sufficient for metadata and link extraction.
 *   - Scripts, styles, navigation, footers, and tracking code are stripped
 *     before text extraction so the output is suitable for AI analysis.
 */

import { validateUrl } from "./urlValidator.js";
import { ExtractedContent, PageMetadata, CrawlResult } from "./types.js";
import { logger } from "../../utils/logger.js";

const TAG = "[HttpCrawler]";

const DEFAULT_UA = "CookieCare-Scanner/1.0";
const FETCH_TIMEOUT_MS = 20_000;

// ─── Internal HTML utilities ─────────────────────────────────────────────────

/**
 * Strip HTML tags from a string, returning only the text content.
 * Also collapses whitespace runs and trims the result.
 */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Remove entire tag blocks (opening tag, contents, closing tag) for the
 * given tag names.  Used to strip scripts, styles, navigation, etc.
 */
function removeTagBlocks(html: string, ...tags: string[]): string {
  let result = html;
  for (const tag of tags) {
    // Remove self-closing variants first, then block variants
    result = result.replace(
      new RegExp(`<${tag}[^>]*/\\s*>`, "gi"),
      ""
    );
    result = result.replace(
      new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}\\s*>`, "gi"),
      ""
    );
  }
  return result;
}

/**
 * Remove elements that match attribute patterns (e.g. role="navigation").
 * This is a best-effort regex approach — sufficient for noise removal.
 */
function removeByAttribute(html: string, attr: string, value: string): string {
  const pattern = new RegExp(
    `<[a-z][^>]*${attr}\\s*=\\s*["']?${value}["']?[^>]*>[\\s\\S]*?<\\/[a-z]+>`,
    "gi"
  );
  return html.replace(pattern, "");
}

/**
 * Strip noisy boilerplate from raw HTML to get clean content text.
 *
 * Removal order:
 *   1. <script>, <style>, <noscript>, <iframe>, <object>, <embed>
 *   2. <nav>, <header>, <footer>, <aside>
 *   3. Elements with role="navigation|banner|contentinfo"
 *   4. Common tracking/ad id/class patterns
 *   5. Remaining tags → plain text
 */
function extractCleanText(html: string): string {
  let cleaned = html;

  // Step 1 — remove scripting and media blocks
  cleaned = removeTagBlocks(cleaned, "script", "style", "noscript", "iframe", "object", "embed", "svg");

  // Step 2 — remove layout/navigation blocks
  cleaned = removeTagBlocks(cleaned, "nav", "header", "footer", "aside");

  // Step 3 — remove ARIA landmark regions
  cleaned = removeByAttribute(cleaned, "role", "navigation");
  cleaned = removeByAttribute(cleaned, "role", "banner");
  cleaned = removeByAttribute(cleaned, "role", "contentinfo");

  // Step 4 — remove common tracking / ad wrappers by id/class pattern
  cleaned = cleaned.replace(
    /<[a-z][^>]*(?:id|class)\s*=\s*["'][^"']*(?:cookie-banner|cookie-notice|consent-banner|advertisement|tracking|onetrust|cybot|CookieConsent|sidebar|widget|popup|modal|social-share)[^"']*["'][^>]*>[\s\S]*?<\/[a-z]+>/gi,
    ""
  );

  // Step 5 — prefer <main> or <article> if present
  const mainMatch =
    /<main[\s>][\s\S]*?<\/main\s*>/i.exec(cleaned) ??
    /<article[\s>][\s\S]*?<\/article\s*>/i.exec(cleaned);
  const source = mainMatch ? mainMatch[0] : cleaned;

  // Step 6 — strip remaining tags and normalise whitespace
  return source
    .split(/\n/)
    .map((line) => stripTags(line).trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

// ─── Meta / link extraction helpers ─────────────────────────────────────────

function extractTitle(html: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  return m ? stripTags(m[1]).trim() : "";
}

function extractMetaContent(html: string, name: string): string | null {
  // Matches both name= and property= variants
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${name}["'][^>]+content\\s*=\\s*["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)"[^>]+(?:name|property)\\s*=\\s*["']${name}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(html);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function extractCanonical(html: string): string | null {
  const m = /<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']*)["']/i.exec(html);
  return m?.[1]?.trim() ?? null;
}

function extractLanguage(html: string): string | null {
  const m = /<html[^>]+lang\s*=\s*["']([^"']+)["']/i.exec(html);
  return m?.[1]?.trim() ?? null;
}

function extractOpenGraph(html: string): Record<string, string> {
  const og: Record<string, string> = {};
  const pattern = /<meta[^>]+(?:property|name)\s*=\s*["']((?:og:|twitter:|article:)[^"']*)["'][^>]+content\s*=\s*["']([^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    if (m[1] && m[2]) og[m[1]] = m[2].trim();
  }
  return og;
}

/**
 * Extract all <a href="..."> links from raw HTML.
 * Returns absolute URLs resolved against the base URL.
 */
function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const pattern = /<a[^>]+href\s*=\s*["']([^"'#][^"']*)["']/gi;
  let m: RegExpExecArray | null;
  const base = new URL(baseUrl);

  while ((m = pattern.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith("javascript:") || raw.startsWith("mailto:")) continue;
    try {
      const resolved = new URL(raw, base).toString();
      links.push(resolved);
    } catch {
      // Ignore unparseable hrefs
    }
  }

  return links;
}

// ─── Security headers ────────────────────────────────────────────────────────

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

function captureSecurityHeaders(headers: Headers): Record<string, string> {
  const captured: Record<string, string> = {};
  for (const name of RELEVANT_HEADERS) {
    const value = headers.get(name);
    if (value) captured[name] = value;
  }
  return captured;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch a URL and return its raw HTML body along with response metadata.
 * Returns null if the fetch fails or the URL is not safe.
 */
async function fetchHtml(
  url: string
): Promise<{ html: string; statusCode: number; headers: Headers } | null> {
  const validation = validateUrl(url);
  if (!validation.valid) {
    logger.warn(`${TAG} Blocked fetch for invalid URL: ${url} — ${validation.reason}`);
    return null;
  }

  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": DEFAULT_UA, "Accept": "text/html,application/xhtml+xml,*/*" },
    });

    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      logger.debug(`${TAG} Skipping non-HTML response for ${url} (${contentType})`);
      return { html: "", statusCode: resp.status, headers: resp.headers };
    }

    const html = await resp.text();
    return { html, statusCode: resp.status, headers: resp.headers };
  } catch (err) {
    logger.warn(`${TAG} Fetch failed for ${url}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * HTTP-based equivalent of `extractPageContent` from contentExtractor.ts.
 *
 * Returns the same `ExtractedContent` interface so callers can use it as a
 * drop-in replacement when Playwright is unavailable.
 */
export async function httpExtractPageContent(url: string): Promise<ExtractedContent> {
  const validation = validateUrl(url);
  if (!validation.valid) {
    return {
      url, text: "", title: "", description: null,
      statusCode: 0, ok: false,
      error: `URL validation failed: ${validation.reason}`,
    };
  }

  const fetched = await fetchHtml(url);
  if (!fetched) {
    return {
      url, text: "", title: "", description: null,
      statusCode: 0, ok: false,
      error: "HTTP fetch failed",
    };
  }

  const { html, statusCode } = fetched;
  const ok = statusCode >= 200 && statusCode < 400;

  if (!html) {
    return { url, text: "", title: "", description: null, statusCode, ok };
  }

  const title = extractTitle(html);
  const description =
    extractMetaContent(html, "description") ??
    extractMetaContent(html, "og:description");
  const text = extractCleanText(html);

  logger.debug(`${TAG} Extracted ${text.length} chars from ${url} (HTTP ${statusCode})`);

  return { url, text, title, description, statusCode, ok };
}

/**
 * HTTP-based equivalent of `extractDomMetadata` from metadataExtractor.ts.
 *
 * Fetches headers via HEAD (or GET fallback) and DOM metadata via a GET
 * request, then assembles a `PageMetadata` object.
 */
export async function httpExtractPageMetadata(url: string): Promise<PageMetadata> {
  const validation = validateUrl(url);
  if (!validation.valid) {
    return {
      url, title: null, description: null, openGraph: {},
      headers: {}, language: null, canonical: null,
      capturedAt: new Date().toISOString(),
    };
  }

  // Fetch security headers via HEAD (fall back to GET)
  let securityHeaders: Record<string, string> = {};
  try {
    const headResp = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": DEFAULT_UA },
    });
    securityHeaders = captureSecurityHeaders(headResp.headers);
  } catch {
    // HEAD failed — headers will come from the GET fetch below
  }

  const fetched = await fetchHtml(url);
  if (!fetched) {
    return {
      url, title: null, description: null, openGraph: {},
      headers: securityHeaders, language: null, canonical: null,
      capturedAt: new Date().toISOString(),
    };
  }

  const { html, headers } = fetched;

  // Fill in headers from GET response if HEAD fetch was skipped
  if (Object.keys(securityHeaders).length === 0) {
    securityHeaders = captureSecurityHeaders(headers);
  }

  const title = extractTitle(html) || null;
  const description =
    extractMetaContent(html, "description") ??
    extractMetaContent(html, "og:description") ??
    null;
  const openGraph = extractOpenGraph(html);
  const language = extractLanguage(html);
  const canonical = extractCanonical(html);

  logger.debug(`${TAG} Metadata captured for ${url} (HTTP fallback)`);

  return {
    url,
    title,
    description,
    openGraph,
    headers: securityHeaders,
    language,
    canonical,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * HTTP-based equivalent of the Playwright link crawl in pageCrawler.ts.
 *
 * Downloads the homepage HTML, extracts all same-domain <a href> links, and
 * adds them to the provided URL set.
 *
 * Returns the number of new URLs added.
 */
export async function httpCrawlLinks(
  rootUrl: string,
  domain: string,
  limit: number,
  existingUrls: Set<string>
): Promise<number> {
  const fetched = await fetchHtml(rootUrl);
  if (!fetched || !fetched.html) return 0;

  const rawLinks = extractLinks(fetched.html, rootUrl);
  let added = 0;

  for (const link of rawLinks) {
    if (existingUrls.size >= limit) break;
    try {
      const u = new URL(link);
      if (
        u.hostname === domain &&
        (u.protocol === "http:" || u.protocol === "https:") &&
        !u.hash &&
        validateUrl(link).valid &&
        !existingUrls.has(link)
      ) {
        existingUrls.add(link);
        added++;
      }
    } catch {
      // Skip malformed URLs
    }
  }

  logger.debug(`${TAG} HTTP link crawl found ${added} new URLs on ${rootUrl}`);
  return added;
}

/**
 * Perform a full HTTP-based URL discovery pass — sitemap first, then link
 * extraction if needed.  Same return shape as discoverUrls() in pageCrawler.ts.
 */
export async function httpDiscoverUrls(
  rootUrl: string,
  options: { limit?: number } = {}
): Promise<CrawlResult> {
  const { limit = 20 } = options;
  let domain: string;
  try {
    domain = new URL(rootUrl).hostname;
  } catch {
    return { urls: [rootUrl], sitemapFound: false, linksCrawled: 0 };
  }

  const urlSet = new Set<string>([rootUrl]);

  // Step 1 — try sitemap.xml (same logic as pageCrawler.ts, already HTTP-based)
  try {
    const sitemapUrl = new URL("/sitemap.xml", rootUrl).toString();
    const resp = await fetch(sitemapUrl, {
      signal: AbortSignal.timeout(5_000),
      headers: { "User-Agent": DEFAULT_UA },
    });
    if (resp.ok) {
      const text = await resp.text();
      const matches = text.match(/<loc>(.*?)<\/loc>/g) ?? [];
      for (const m of matches) {
        if (urlSet.size >= limit) break;
        const loc = m.replace(/<\/?loc>/g, "").trim();
        try {
          const u = new URL(loc);
          if (u.hostname === domain && validateUrl(loc).valid) urlSet.add(loc);
        } catch { /* skip */ }
      }
    }
  } catch { /* sitemap unavailable — continue */ }

  const sitemapFound = urlSet.size > 1;

  if (urlSet.size < limit) {
    const added = await httpCrawlLinks(rootUrl, domain, limit, urlSet);
    return {
      urls: Array.from(urlSet).slice(0, limit),
      sitemapFound,
      linksCrawled: added,
    };
  }

  return { urls: Array.from(urlSet).slice(0, limit), sitemapFound, linksCrawled: 0 };
}
