/**
 * WebsiteScannerService — reusable website intelligence facade.
 *
 * Composes the lower-level scanning modules into a single, convenient API.
 * Future features (Vendor Review, AI Ethics Review, Privacy Score) should
 * consume this service rather than reimplementing crawling logic.
 *
 * The Cookie Scanner (ScannerService) continues to use the individual
 * sub-modules (pageCrawler, urlValidator) directly for maximum control over
 * its 3-phase Playwright scan — its public API is completely unchanged.
 *
 * Usage example:
 *   const scanner = new WebsiteScannerService();
 *   const result  = await scanner.scan("https://example.com");
 */

import { discoverUrls } from "./pageCrawler.js";
import { extractPageContent } from "./contentExtractor.js";
import { extractPageMetadata } from "./metadataExtractor.js";
import {
  discoverCompliancePages,
  findFirst,
} from "./complianceDiscovery.js";
import { classifyPage } from "./pageClassifier.js";
import { validateUrl, normaliseUrl } from "./urlValidator.js";
import { WebsiteScanResult } from "./types.js";
import { logger } from "../../utils/logger.js";

const TAG = "[WebsiteScannerService]";

export interface ScanOptions {
  /**
   * Maximum number of internal pages to crawl.
   * @default 20
   */
  crawlLimit?: number;
  /**
   * When true, skip the Playwright link-crawl and use sitemap.xml only.
   * Faster but may discover fewer pages.
   * @default false
   */
  sitemapOnly?: boolean;
  /**
   * When true, skip homepage metadata extraction (title, OG tags, headers).
   * @default false
   */
  skipMetadata?: boolean;
}

export class WebsiteScannerService {
  /**
   * Perform a full website scan.
   *
   * Steps:
   *   1. Validate + normalise the URL
   *   2. Discover internal pages (sitemap + Playwright link crawl)
   *   3. Probe well-known compliance pages
   *   4. Extract homepage metadata (optional)
   *
   * Returns a structured WebsiteScanResult.  Only fields for pages that were
   * actually found are populated; missing pages are null.
   */
  async scan(rawUrl: string, options: ScanOptions = {}): Promise<WebsiteScanResult> {
    const { crawlLimit = 20, sitemapOnly = false, skipMetadata = false } = options;

    const homepageUrl = normaliseUrl(rawUrl);
    logger.info(`${TAG} Starting scan for ${homepageUrl}`);

    const validation = validateUrl(homepageUrl);
    if (!validation.valid) {
      logger.warn(`${TAG} URL blocked: ${validation.reason}`);
      return this.emptyResult(homepageUrl, `URL blocked: ${validation.reason}`);
    }

    // Run page discovery and compliance page probing in parallel
    const [crawlResult, compliancePages, metadata] = await Promise.all([
      discoverUrls(homepageUrl, { limit: crawlLimit, sitemapOnly }),
      discoverCompliancePages(homepageUrl),
      skipMetadata ? Promise.resolve(null) : extractPageMetadata(homepageUrl),
    ]);

    logger.info(
      `${TAG} Scan complete — ${crawlResult.urls.length} pages discovered, ` +
        `${compliancePages.length} compliance pages found`
    );

    return {
      homepage: homepageUrl,
      discoveredPages: crawlResult.urls,
      privacyPolicy:
        findFirst(compliancePages, "/privacy", "/privacy-policy") ?? null,
      cookiePolicy:
        findFirst(compliancePages, "/cookie-policy", "/cookies") ?? null,
      securityPage:
        findFirst(compliancePages, "/security", "/security-policy") ?? null,
      trustCenter:
        findFirst(compliancePages, "/trust", "/trust-center") ?? null,
      terms:
        findFirst(
          compliancePages,
          "/terms",
          "/terms-of-service",
          "/terms-and-conditions"
        ) ?? null,
      legal: findFirst(compliancePages, "/legal") ?? null,
      dpa: findFirst(compliancePages, "/dpa") ?? null,
      aiPolicy:
        findFirst(
          compliancePages,
          "/ai-policy",
          "/ai-principles",
          "/ai-safety",
          "/ai"
        ) ?? null,
      responsibleAI:
        findFirst(
          compliancePages,
          "/responsible-ai",
          "/responsible-ai-practices",
          "/ethics",
          "/governance"
        ) ?? null,
      safetyPage:
        findFirst(
          compliancePages,
          "/safety",
          "/about/safety"
        ) ?? null,
      policiesPage:
        findFirst(compliancePages, "/policies") ?? null,
      modelSpec:
        findFirst(compliancePages, "/model-spec", "/model-cards") ?? null,
      transparencyPage:
        findFirst(compliancePages, "/transparency") ?? null,
      charterPage:
        findFirst(compliancePages, "/charter") ?? null,
      metadata,
      scannedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract clean, AI-ready text from a single page.
   * Thin wrapper around the contentExtractor module.
   */
  extractContent = extractPageContent;

  /**
   * Classify the type of a page (privacy policy, cookie policy, etc.)
   * using URL patterns and optional title/text signals.
   */
  classifyPage = classifyPage;

  /**
   * Probe a set of compliance paths for the given homepage.
   * Useful when only the compliance discovery step is needed.
   */
  discoverCompliancePages = discoverCompliancePages;

  // ─── Private helpers ──────────────────────────────────────────────────────

  private emptyResult(homepage: string, _reason?: string): WebsiteScanResult {
    return {
      homepage,
      discoveredPages: [homepage],
      privacyPolicy: null,
      cookiePolicy: null,
      securityPage: null,
      trustCenter: null,
      terms: null,
      legal: null,
      dpa: null,
      aiPolicy: null,
      responsibleAI: null,
      safetyPage: null,
      policiesPage: null,
      modelSpec: null,
      transparencyPage: null,
      charterPage: null,
      metadata: null,
      scannedAt: new Date().toISOString(),
    };
  }
}

// Re-export all sub-modules and types for direct consumption by other features
export { discoverUrls } from "./pageCrawler.js";
export { extractPageContent, extractMultiplePages } from "./contentExtractor.js";
export { extractPageMetadata } from "./metadataExtractor.js";
export { discoverCompliancePages, findFirst } from "./complianceDiscovery.js";
export { classifyPage, classifyByUrl, classifyByContent, classifyPages } from "./pageClassifier.js";
export { validateUrl, normaliseUrl } from "./urlValidator.js";
export type {
  UrlValidationResult,
  CrawlOptions,
  CrawlResult,
  ExtractedContent,
  ExtractedPageContent,
  PageMetadata,
  PageType,
  ClassifiedPage,
  DiscoveredCompliancePage,
  WebsiteScanResult,
} from "./types.js";
