/**
 * Shared TypeScript types for the reusable Website Scanner service.
 *
 * These types are consumed by:
 *   - WebsiteScannerService (the public facade)
 *   - ScannerService (Cookie Scanner — internal delegation only)
 *   - Future features: Vendor Review, AI Ethics Review, Privacy Score
 */

// ─── URL Validation ──────────────────────────────────────────────────────────

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
}

// ─── Crawling ────────────────────────────────────────────────────────────────

export interface CrawlOptions {
  /** Maximum number of URLs to return (default: 20). */
  limit?: number;
  /**
   * When true the crawler only fetches the sitemap and does NOT spin up a
   * Playwright browser for link discovery. Useful for lightweight passes.
   */
  sitemapOnly?: boolean;
}

export interface CrawlResult {
  urls: string[];
  /** true if sitemap.xml was found and parsed */
  sitemapFound: boolean;
  /** How many additional URLs were found via <a> link crawl */
  linksCrawled: number;
}

// ─── Content Extraction ──────────────────────────────────────────────────────

export interface ExtractedContent {
  url: string;
  /** Plain readable text — navigation/footer/ads stripped. */
  text: string;
  /** Page <title> */
  title: string;
  /** Meta description if present */
  description: string | null;
  /** HTTP status code */
  statusCode: number;
  /** true if the page loaded successfully */
  ok: boolean;
  error?: string;
}

// ─── Metadata Extraction ─────────────────────────────────────────────────────

export interface PageMetadata {
  url: string;
  title: string | null;
  description: string | null;
  /** Open Graph data (og:title, og:description, og:image, …) */
  openGraph: Record<string, string>;
  /** Relevant HTTP response headers (CSP, HSTS, X-Frame-Options, …) */
  headers: Record<string, string>;
  /** <html lang="…"> value */
  language: string | null;
  /** Canonical URL if present */
  canonical: string | null;
  /** ISO timestamp of when metadata was captured */
  capturedAt: string;
}

// ─── Page Classification ─────────────────────────────────────────────────────

export type PageType =
  | "homepage"
  | "privacy_policy"
  | "cookie_policy"
  | "terms"
  | "legal"
  | "security"
  | "trust_center"
  | "dpa"
  | "ai_policy"
  | "responsible_ai"
  | "ethics"
  | "governance"
  | "other";

export interface ClassifiedPage {
  url: string;
  pageType: PageType;
  /** 0–1 confidence score for the classification */
  confidence: number;
}

// ─── Compliance Page Discovery ───────────────────────────────────────────────

/** Well-known compliance page path slugs to probe. */
export const COMPLIANCE_PATHS = [
  "/privacy",
  "/privacy-policy",
  "/cookie-policy",
  "/cookies",
  "/security",
  "/security-policy",
  "/trust",
  "/trust-center",
  "/legal",
  "/terms",
  "/terms-of-service",
  "/terms-and-conditions",
  "/dpa",
  "/responsible-ai",
  "/responsible-ai-practices",
  "/ai",
  "/ai-policy",
  "/ai-principles",
  "/ai-safety",
  "/ethics",
  "/governance",
  "/safety",
  "/policies",
  "/model-spec",
  "/model-cards",
  "/transparency",
  "/charter",
  "/research",
  "/research/overview",
  "/about/safety",
  "/blog/tags/safety",
  "/product/core-views",
] as const;

export type CompliancePath = (typeof COMPLIANCE_PATHS)[number];

export interface DiscoveredCompliancePage {
  path: CompliancePath;
  url: string;
  /** HTTP status code returned when probing the page */
  statusCode: number;
  /** Whether the page was reachable (2xx) */
  reachable: boolean;
}

// ─── Full Website Scan Result ─────────────────────────────────────────────────

/**
 * The structured output returned by WebsiteScannerService.scan().
 * Only fields for reachable / discovered pages are populated.
 */
export interface WebsiteScanResult {
  /** Canonical homepage URL that was scanned */
  homepage: string;
  /** All internal URLs discovered (sitemap + crawl) */
  discoveredPages: string[];
  /** Structured compliance pages — only populated if found */
  privacyPolicy: DiscoveredCompliancePage | null;
  cookiePolicy: DiscoveredCompliancePage | null;
  securityPage: DiscoveredCompliancePage | null;
  trustCenter: DiscoveredCompliancePage | null;
  terms: DiscoveredCompliancePage | null;
  legal: DiscoveredCompliancePage | null;
  dpa: DiscoveredCompliancePage | null;
  aiPolicy: DiscoveredCompliancePage | null;
  responsibleAI: DiscoveredCompliancePage | null;
  /** AI-specific governance pages */
  safetyPage: DiscoveredCompliancePage | null;
  policiesPage: DiscoveredCompliancePage | null;
  modelSpec: DiscoveredCompliancePage | null;
  transparencyPage: DiscoveredCompliancePage | null;
  charterPage: DiscoveredCompliancePage | null;
  /** Extracted text content from key AI governance pages (populated by AI Ethics job) */
  extractedPageContents?: ExtractedPageContent[];
  /** Page metadata for the homepage */
  metadata: PageMetadata | null;
  /** ISO timestamp */
  scannedAt: string;
}

/** Plain-text content extracted from a single compliance page */
export interface ExtractedPageContent {
  url: string;
  title: string;
  /** First N chars of clean text extracted from the page */
  textSnippet: string;
  /** Character count of the full extracted text */
  fullTextLength: number;
}
