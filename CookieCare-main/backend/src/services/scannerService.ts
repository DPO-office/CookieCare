import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { browserManager } from "../utils/browserManager.js";
import { Page } from "playwright";
import { openRouterComplete } from "./openRouterClient.js";
import { generateVulnReport } from "./vulnReportService.js";
import { withTransaction } from "../utils/dbUtils.js";
// Reusable scanning infrastructure — Cookie Scanner delegates here so all
// scanning features share a single implementation of URL validation, crawling,
// compliance page discovery, and metadata extraction.
import { validateUrl as sharedValidateUrl, normaliseUrl } from "./websiteScanner/urlValidator.js";
import { discoverUrls as sharedDiscoverUrls } from "./websiteScanner/pageCrawler.js";
import { discoverCompliancePages, findFirst } from "./websiteScanner/complianceDiscovery.js";
import { extractPageMetadata } from "./websiteScanner/metadataExtractor.js";
import type { DiscoveredCompliancePage, PageMetadata } from "./websiteScanner/types.js";
import {
  detectTechnologies,
  mergeSignals,
  type PageSignals,
  type DetectedTechnology,
} from "./technologyDetector.js";
import {
  analyzeConsentBanner,
  detectCMP,
  evaluateCompliance,
  evaluateConsentQuality,
  type ConsentAnalysisInput,
  type DomConsentSignals,
  type EnrichedCookieSnapshot,
  type ConsentBannerAnalysis,
  type CMPDetectionResult,
  type RegulationEvaluation,
  type ConsentQuality,
} from "./consentAnalyzer.js";
import {
  analyzeEnterprise,
  type EnterpriseAnalysisInput,
  type EnterpriseReport,
} from "./enterpriseAnalyzer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CookieDefinition {
  id: string;
  category: string;
  cookie: string;
  domain: string;
  description: string;
  retentionPeriod: string;
  dataController: string;
  privacyLink: string;
  wildcardMatch: string;
}

interface CookieDatabase {
  [provider: string]: CookieDefinition[];
}

/**
 * Enriched cookie attributes collected from the browser via CDP.
 * All fields beyond `name` and `value` are optional — they depend on whether
 * the browser exposes them and whether a DB match was found.
 */
interface EnrichedCookie {
  // ── Core identity ──────────────────────────────────────────────────────────
  name: string;
  /** Provider name (DB match) or raw cookie domain (unmatched) */
  domain: string;
  /** Full raw cookie domain as set by the browser */
  rawDomain: string;
  /** Cookie path attribute */
  path: string;

  // ── Temporal attributes ────────────────────────────────────────────────────
  /** Human-readable retention period from DB, or derived from expires */
  retention: string;
  /** Unix timestamp (seconds) of cookie expiry; -1 = session cookie */
  expires: number;
  /** true when expires is -1 or not set (session cookie) */
  isSession: boolean;

  // ── Security attributes ────────────────────────────────────────────────────
  secure: boolean;
  httpOnly: boolean;
  /** SameSite value: "Strict" | "Lax" | "None" | "Unspecified" */
  sameSite: string;

  // ── Size ──────────────────────────────────────────────────────────────────
  /** Approximate cookie size in bytes (name + "=" + value length) */
  size: number;

  // ── Classification ────────────────────────────────────────────────────────
  category: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  description: string;
  remediation?: string;

  // ── First/Third-party ─────────────────────────────────────────────────────
  /** true when the cookie domain matches or is a subdomain of the scanned site */
  isFirstParty: boolean;
  /** "first-party" | "third-party" */
  partyType: "first-party" | "third-party";

  // ── DB match metadata ─────────────────────────────────────────────────────
  /** Name of the vendor/provider that owns this cookie (from DB) */
  vendor?: string;
  /** Whether the match was exact or wildcard */
  matchType?: "exact" | "wildcard" | "none";
}

export class ScannerService {
  private cookieDb: CookieDatabase | null = null;

  private async loadCookieDb() {
    if (this.cookieDb) return this.cookieDb;
    try {
      // ── Path resolution ───────────────────────────────────────────────────
      // esbuild bundles everything into a single JS file.  The output path
      // differs between the two npm scripts:
      //
      //   npm run dev   → backend/server.js          (__dir = backend/)
      //   npm run build → backend/dist/server.js     (__dir = backend/dist/)
      //   tsx (source)  → backend/src/services/...   (__dir = backend/src/services/)
      //
      // The JSON asset is never moved by esbuild — it always lives at:
      //   backend/src/config/open-cookie-database.json
      //
      // We resolve the backend root from __dir for each case and then build
      // the path from there, so the file is found regardless of launch mode.
      const __filename = fileURLToPath(import.meta.url);
      const __dir = path.dirname(__filename);

      console.log("[ScannerService] module location (__dir):", __dir);
      console.log("[ScannerService] process.cwd():", process.cwd());

      const candidates = [
        // dev bundle: backend/server.js → __dir is backend/ itself
        path.resolve(__dir, "src/config/open-cookie-database.json"),
        // production build: backend/dist/server.js → go up one level to backend/
        path.resolve(__dir, "../src/config/open-cookie-database.json"),
        // tsx/ts-node source: backend/src/services/scannerService.ts → go up two levels
        path.resolve(__dir, "../../config/open-cookie-database.json"),
        // absolute fallback: resolve from cwd (works when cwd = backend/)
        path.resolve(process.cwd(), "src/config/open-cookie-database.json"),
      ];

      console.log("[ScannerService] candidate paths:");
      candidates.forEach((c) => console.log("  →", c));

      let data: string | null = null;
      let loadedFrom: string | null = null;
      for (const candidate of candidates) {
        try {
          data = await fs.readFile(candidate, "utf-8");
          loadedFrom = candidate;
          break;
        } catch {
          // try next candidate
        }
      }

      if (data === null) {
        console.warn(
          "[ScannerService] open-cookie-database.json not found in any expected location. " +
          "Cookie lookup will be skipped. Searched:\n" +
          candidates.map((c) => `  ${c}`).join("\n")
        );
        this.cookieDb = {};
        return this.cookieDb;
      }

      console.log("[ScannerService] cookie database loaded successfully from:", loadedFrom);
      this.cookieDb = JSON.parse(data);
      return this.cookieDb;
    } catch (err) {
      console.error("Failed to load cookie database:", err);
      return {};
    }
  }

  // ── Cookie Engine Utilities ──────────────────────────────────────────────

  /**
   * Look up a cookie name in the database.
   *
   * Lookup order:
   *   1. Exact matches across all providers (any wildcardMatch value)
   *   2. Wildcard (prefix) matches across all providers
   *
   * Returns the matching entry and its provider name, or null if no match.
   */
  private lookupCookie(
    cookieName: string,
    db: CookieDatabase
  ): { entry: CookieDefinition; provider: string; matchType: "exact" | "wildcard" } | null {
    const name = cookieName.toLowerCase();

    let wildcardResult: { entry: CookieDefinition; provider: string } | null = null;

    for (const [provider, entries] of Object.entries(db)) {
      for (const entry of entries) {
        const pattern = entry.cookie.toLowerCase();

        // Pass 1 — exact match (highest priority, return immediately)
        if (name === pattern) {
          return { entry, provider, matchType: "exact" };
        }

        // Pass 2 — wildcard/prefix match (keep the first found, continue scanning for exact)
        if (
          wildcardResult === null &&
          entry.wildcardMatch === "1" &&
          name.startsWith(pattern)
        ) {
          wildcardResult = { entry, provider };
        }
      }
    }

    if (wildcardResult) {
      return { ...wildcardResult, matchType: "wildcard" };
    }

    return null;
  }

  /**
   * Determine whether a cookie is first-party or third-party.
   *
   * A cookie is first-party when its domain (as set by the browser) matches
   * or is a subdomain of the scanned site's eTLD+1 (registered domain).
   *
   * The comparison is done on the raw cookie `domain` field from CDP, which
   * can be:
   *   - ".example.com"  → subdomain-inclusive (leading dot)
   *   - "example.com"   → exact domain
   *   - "analytics.google.com" → third-party sub-domain
   *
   * No heuristics: we only rely on the actual domain values.
   */
  private classifyParty(
    cookieDomain: string,
    scannedHostname: string
  ): { isFirstParty: boolean; partyType: "first-party" | "third-party" } {
    if (!cookieDomain) {
      // No domain attribute — browser-scoped, treat as first-party
      return { isFirstParty: true, partyType: "first-party" };
    }

    // Normalise: strip leading dot, lowercase both sides
    const normalised = cookieDomain.replace(/^\./, "").toLowerCase();
    const scanned = scannedHostname.toLowerCase();

    // Direct match or subdomain of scanned host
    const isFirstParty =
      normalised === scanned ||
      scanned.endsWith(`.${normalised}`) ||
      normalised.endsWith(`.${scanned}`);

    return {
      isFirstParty,
      partyType: isFirstParty ? "first-party" : "third-party",
    };
  }

  /**
   * Compute a human-readable cookie size estimate.
   * Size = length of name + 1 (for "=") + length of value.
   */
  private computeCookieSize(name: string, value: string | undefined): number {
    return (name?.length ?? 0) + 1 + (value?.length ?? 0);
  }

  /**
   * Derive retention label and session/persistent flag from the raw CDP cookie.
   *
   * CDP `expires` is a Unix timestamp in seconds; -1 means session cookie.
   * If a DB retention period is available, prefer that for the label.
   */
  private deriveRetention(
    rawCookie: any,
    dbRetention?: string
  ): { retention: string; expires: number; isSession: boolean } {
    const expires: number = rawCookie.expires ?? -1;
    const isSession = expires === -1 || expires === 0;

    // Prefer the DB-provided human-readable retention label
    if (dbRetention && dbRetention.trim()) {
      return { retention: dbRetention, expires, isSession };
    }

    if (isSession) {
      return { retention: "Session", expires, isSession: true };
    }

    // Derive a rough label from the expiry timestamp
    const now = Math.floor(Date.now() / 1000);
    const secondsLeft = expires - now;
    const days = Math.round(secondsLeft / 86400);

    let retention: string;
    if (days <= 1) retention = "1 day";
    else if (days <= 7) retention = `${days} days`;
    else if (days <= 31) retention = `${Math.round(days / 7)} weeks`;
    else if (days <= 365) retention = `${Math.round(days / 30)} months`;
    else retention = `${Math.round(days / 365)} years`;

    return { retention, expires, isSession: false };
  }

  /**
   * Enrich a raw CDP cookie with all additional attributes:
   * - DB lookup (exact then wildcard)
   * - First/third-party classification
   * - Temporal attributes (expires, session flag, retention)
   * - Security attributes (secure, httpOnly, sameSite)
   * - Size estimate
   */
  private enrichCookie(
    rawCookie: any,
    scannedHostname: string,
    db: CookieDatabase
  ): EnrichedCookie {
    const dbMatch = this.lookupCookie(rawCookie.name, db);

    const partyInfo = this.classifyParty(rawCookie.domain ?? "", scannedHostname);
    const { retention, expires, isSession } = this.deriveRetention(
      rawCookie,
      dbMatch?.entry.retentionPeriod
    );

    const size = this.computeCookieSize(rawCookie.name, rawCookie.value);

    const sameSite: string = rawCookie.sameSite ?? "Unspecified";

    if (dbMatch) {
      const { entry, provider, matchType } = dbMatch;
      const category = entry.category;
      const severity: "HIGH" | "MEDIUM" | "LOW" =
        category === "Marketing" || category === "Analytics" ? "HIGH" : "LOW";

      return {
        name: rawCookie.name,
        domain: provider,
        rawDomain: rawCookie.domain ?? "",
        path: rawCookie.path ?? "/",
        retention,
        expires,
        isSession,
        secure: rawCookie.secure ?? false,
        httpOnly: rawCookie.httpOnly ?? false,
        sameSite,
        size,
        category,
        severity,
        description: entry.description,
        isFirstParty: partyInfo.isFirstParty,
        partyType: partyInfo.partyType,
        vendor: provider,
        matchType,
      };
    }

    // No DB match — use raw attributes only
    return {
      name: rawCookie.name,
      domain: rawCookie.domain ?? "",
      rawDomain: rawCookie.domain ?? "",
      path: rawCookie.path ?? "/",
      retention,
      expires,
      isSession,
      secure: rawCookie.secure ?? false,
      httpOnly: rawCookie.httpOnly ?? false,
      sameSite,
      size,
      category: "Unclassified",
      severity: "MEDIUM",
      description: "Dynamic JavaScript-set tracker detected via CDP.",
      isFirstParty: partyInfo.isFirstParty,
      partyType: partyInfo.partyType,
      vendor: undefined,
      matchType: "none",
    };
  }

  /**
   * Delegates to the shared urlValidator module.
   * Preserved as a private wrapper so no call-sites inside this class need
   * to change — the Cookie Scanner behaviour is identical to before.
   */
  private validateUrl(url: string): { valid: boolean; reason?: string } {
    return sharedValidateUrl(url);
  }

  private async handleConsentBanner(page: Page, action: 'accept' | 'reject') {
    const acceptSelectors = [
      '#onetrust-accept-btn-handler',
      '#wt-cli-accept-all-btn',
      '#accept-cookies',
      'button:has-text("Accept All")',
      'button:has-text("Allow All")',
      'button:has-text("I Accept")',
      'button:has-text("Agree")',
      '[aria-label*="Accept all"]',
      '.js-accept-all'
    ];

    const rejectSelectors = [
      '#onetrust-reject-all-handler',
      '#wt-cli-reject-all-btn',
      'button:has-text("Reject All")',
      'button:has-text("Decline All")',
      'button:has-text("Only Necessary")',
      'button:has-text("Dismiss")',
      '[aria-label*="Reject all"]',
      '.js-reject-all'
    ];

    const selectors = action === 'accept' ? acceptSelectors : rejectSelectors;

    for (const selector of selectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 2000 })) {
          await button.click();
          await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
          return true;
        }
      } catch (e) {}
    }
    return false;
  }

  private async capturePageState(page: Page) {
    const cdp = await page.context().newCDPSession(page);
    const { cookies } = await cdp.send('Network.getAllCookies');
    await cdp.detach();

    const storage = await page.evaluate(() => {
      return {
        localStorage: { ...localStorage },
        sessionStorage: { ...sessionStorage }
      };
    });

    return { cookies, storage };
  }

  /**
   * Capture technology detection signals from a loaded Playwright page.
   *
   * Runs inside the existing page visit — no extra navigation.
   * Collects: script src URLs, global JS variable names, and head HTML.
   * Network URLs are collected separately via page event listeners.
   */
  private async capturePageSignals(page: any): Promise<Omit<PageSignals, "networkUrls" | "cookieNames">> {
    try {
      const { scriptUrls, globalVars, headHtml } = await page.evaluate(() => {
        const document = globalThis.document as any;
        const window = globalThis as any;

        // All <script src="..."> tags
        const scriptUrls: string[] = Array.from(
          document.querySelectorAll("script[src]")
        ).map((el: any) => el.src as string).filter(Boolean);

        // Top-level window property names (filter to non-trivial ones only)
        const builtins = new Set([
          "undefined", "NaN", "Infinity", "Object", "Array", "String",
          "Number", "Boolean", "Symbol", "Function", "Date", "RegExp",
          "Error", "Math", "JSON", "Promise", "Map", "Set", "WeakMap",
          "WeakSet", "Proxy", "Reflect", "globalThis", "self", "window",
          "document", "location", "history", "navigator", "screen",
          "performance", "console", "alert", "confirm", "prompt",
          "setTimeout", "clearTimeout", "setInterval", "clearInterval",
          "requestAnimationFrame", "cancelAnimationFrame", "fetch",
          "XMLHttpRequest", "WebSocket", "Worker", "localStorage",
          "sessionStorage", "indexedDB", "crypto", "CSS", "customElements",
          "devicePixelRatio", "innerHeight", "innerWidth", "outerHeight",
          "outerWidth", "pageXOffset", "pageYOffset", "scrollX", "scrollY",
          "frames", "length", "name", "opener", "parent", "top", "origin",
        ]);
        const globalVars: string[] = Object.keys(window).filter(
          (k) => !builtins.has(k) && !k.startsWith("__reactFiber") && !k.startsWith("__reactProps")
        );

        // Head HTML (capped at 50 KB — enough for all meta/script tags)
        const head = document.head;
        const headHtml: string = head ? (head.innerHTML || "").slice(0, 51200) : "";

        return { scriptUrls, globalVars, headHtml };
      });

      return { scriptUrls, globalVars, headHtml };
    } catch {
      return { scriptUrls: [], globalVars: [], headHtml: "" };
    }
  }

  /**
   * Delegates to the shared pageCrawler module.
   * Preserved as a private wrapper so no call-sites inside this class need
   * to change — the Cookie Scanner behaviour is identical to before.
   */
  /**
   * Capture rich DOM signals from the consent banner for the Consent Intelligence engine.
   * Called during Phase 1 (pre-consent) on the root page only.
   * Never throws — returns null on any failure.
   */
  private async captureDomConsentSignals(page: Page): Promise<DomConsentSignals | null> {
    try {
      // page.evaluate runs inside the browser — all DOM APIs are available there.
      // We cast the return as `any` and then narrow at the call-site to avoid
      // TypeScript errors caused by the lib not including "dom".
      const result = await page.evaluate(() => {
        const w = globalThis as any;
        const doc = w.document as any;

        function qs(selectors: string[]): any | null {
          for (const s of selectors) {
            try { const el = doc.querySelector(s); if (el) return el; } catch {}
          }
          return null;
        }
        function btnInfo(el: any): { found: boolean; text: string; selector: string } | null {
          if (!el) return null;
          return {
            found: true,
            text: (el.textContent || "").trim().slice(0, 80),
            selector: (el.tagName || "").toLowerCase() + (el.id ? `#${el.id}` : ""),
          };
        }

        const BANNER_SELECTORS = [
          "#onetrust-banner-sdk", "#CybotCookiebotDialog", "#uc-banner",
          "[id*='cookie-banner']", "[id*='consent-banner']", "[class*='cookie-banner']",
          "[class*='consent-banner']", "[class*='cookie-notice']", "[class*='cookie-popup']",
          "[id*='gdpr']", "[class*='gdpr']", "[data-cookieconsent]",
          ".cky-consent-container", ".cc-window", "#didomi-popup",
          "[class*='cookiebot']", "[id*='cookiebot']", ".osano-cm-window",
        ];
        const ACCEPT_SELECTORS = [
          "#onetrust-accept-btn-handler", "#wt-cli-accept-all-btn", "#accept-cookies",
          "#CybotCookiebotDialogBodyButtonAccept", "[id*='accept-all']", "[id*='acceptAll']",
          "[class*='accept-all']", "[class*='acceptAll']", "[aria-label*='Accept all']",
          ".js-accept-all", "#didomi-notice-agree-button",
        ];
        const REJECT_SELECTORS = [
          "#onetrust-reject-all-handler", "#wt-cli-reject-all-btn",
          "#CybotCookiebotDialogBodyButtonDecline", "[id*='reject-all']", "[id*='rejectAll']",
          "[class*='reject-all']", "[class*='rejectAll']", "[aria-label*='Reject all']",
          ".js-reject-all", "#didomi-notice-disagree-button", "[id*='decline-all']",
        ];
        const CUSTOMIZE_SELECTORS = [
          "#onetrust-pc-btn-handler", "[id*='manage-preferences']", "[id*='managePref']",
          "[class*='manage-pref']", "[aria-label*='Manage preferences']",
          "#CybotCookiebotDialogBodyButtonDetails", "[id*='customize']", "[class*='customize']",
          "#didomi-notice-learn-more-button",
        ];
        const CLOSE_SELECTORS = [
          "[class*='cookie-close']", "[aria-label*='Close']", "[id*='close-btn']",
          ".cc-dismiss", ".cc-btn.cc-dismiss",
        ];

        const bannerEl = qs(BANNER_SELECTORS);
        const bannerHtml: string = bannerEl ? (bannerEl.outerHTML || "").slice(0, 8192) : "";
        const acceptEl = qs(ACCEPT_SELECTORS);
        const rejectEl = qs(REJECT_SELECTORS);
        const customizeEl = qs(CUSTOMIZE_SELECTORS);
        const closeEl = qs(CLOSE_SELECTORS);

        // ── Banner position ──────────────────────────────────────────────────
        let position = "unknown";
        if (bannerEl) {
          try {
            const rect = bannerEl.getBoundingClientRect();
            const style = w.getComputedStyle(bannerEl);
            const isFixed = style.position === "fixed" || style.position === "sticky";
            if (isFixed) {
              if (rect.top < 100) position = "top";
              else if (rect.bottom > (w.innerHeight || 768) - 100) position = "bottom";
              else position = "popup";
            } else if (style.display === "flex" || bannerEl.offsetHeight > 200) {
              position = "modal";
            } else {
              position = "popup";
            }
          } catch {}
        }

        // ── Checkbox state ───────────────────────────────────────────────────
        let preCheckedBoxes = false;
        let allUnchecked = false;
        try {
          const checkboxes: any[] = Array.from(
            doc.querySelectorAll("[class*='cookie'] input[type=checkbox], [id*='consent'] input[type=checkbox]")
          );
          if (checkboxes.length > 0) {
            preCheckedBoxes = checkboxes.some((cb: any) => cb.checked && !cb.disabled);
            allUnchecked = checkboxes.every((cb: any) => !cb.checked);
          }
        } catch {}

        // ── CMP data attributes ──────────────────────────────────────────────
        const cmpAttrs: string[] = [];
        const cmpAttrSelectors = ["[data-onetrust]", "[data-cookieconsent]", "[data-usercentrics]",
          "[data-cky]", "[data-trustarc]", "[data-qchoice]", "[data-didomi]", "[data-osano]"];
        for (const sel of cmpAttrSelectors) {
          try {
            if (doc.querySelector(sel)) {
              cmpAttrs.push(sel.replace(/[\[\]]/g, "").split("=")[0]);
            }
          } catch {}
        }

        return {
          bannerHtml,
          acceptButton: btnInfo(acceptEl),
          rejectButton: btnInfo(rejectEl),
          customizeButton: btnInfo(customizeEl),
          closeButton: btnInfo(closeEl),
          position,
          preCheckedBoxes,
          allUnchecked,
          cmpAttributes: cmpAttrs,
        };
      });

      return result as DomConsentSignals;
    } catch (err) {
      console.warn("[Scanner] captureDomConsentSignals failed:", (err as Error).message);
      return null;
    }
  }

  private async discoverUrls(rootUrl: string, limit: number = 20): Promise<string[]> {
    const result = await sharedDiscoverUrls(rootUrl, { limit });
    return result.urls;
  }

  /**
   * Selects the subset of cookies that genuinely need AI enrichment.
   *
   * Cookies already classified with high confidence by the local Cookie DB
   * (exact or wildcard match, low-risk category) are excluded — the AI would
   * add nothing useful and would bloat the prompt significantly.
   *
   * Priority order for the capped list:
   *   1. HIGH severity
   *   2. Unclassified / no DB match
   *   3. Marketing
   *   4. Analytics
   *
   * @param cookies  Full enriched cookie list (never mutated)
   * @param cap      Maximum number of cookies to send to the AI (default 50)
   * @returns        Filtered + ranked subset for AI analysis
   */
  private selectCookiesForAI(cookies: any[], cap = 50): any[] {
    // Categories that the local DB already handles with high confidence.
    // AI re-classification of these adds no value and wastes tokens.
    const CONFIDENT_LOW_RISK_CATEGORIES = new Set([
      "Necessary",
      "Functional",
      "Strictly Necessary",
      "Essential",
      "strictly necessary",
      "necessary",
      "functional",
      "essential",
    ]);

    // Categories that always need AI review regardless of DB match.
    const AI_PRIORITY_CATEGORIES = new Set([
      "Marketing",
      "Advertising",
      "Analytics",
      "Statistics",
      "marketing",
      "advertising",
      "analytics",
      "statistics",
    ]);

    const needsAI = (c: any): boolean => {
      const matchType: string = c.matchType ?? "none";
      const category: string = c.category ?? "Unclassified";

      // No DB match at all → always include
      if (matchType === "none") return true;

      // Unclassified regardless of match → include
      if (category === "Unclassified") return true;

      // Marketing / Analytics → always include (high risk, AI adds context)
      if (AI_PRIORITY_CATEGORIES.has(category)) return true;

      // High severity → include even if DB matched
      if ((c.severity ?? "").toUpperCase() === "HIGH") return true;

      // Confident low-risk DB match (exact or wildcard) → skip
      if (
        (matchType === "exact" || matchType === "wildcard") &&
        CONFIDENT_LOW_RISK_CATEGORIES.has(category)
      ) {
        return false;
      }

      // Everything else (wildcard matches with ambiguous categories, etc.) → include
      return true;
    };

    const candidates = cookies.filter(needsAI);

    if (candidates.length <= cap) return candidates;

    // Rank to keep the most impactful cookies within the cap.
    const rank = (c: any): number => {
      let score = 0;
      const severity: string = (c.severity ?? "").toUpperCase();
      const category: string = c.category ?? "Unclassified";
      const matchType: string = c.matchType ?? "none";

      if (severity === "HIGH")                          score += 40;
      if (matchType === "none")                         score += 30;
      if (category === "Unclassified")                  score += 20;
      if (AI_PRIORITY_CATEGORIES.has(category)) {
        if (category.toLowerCase().startsWith("market")) score += 15;
        else                                              score += 10;
      }
      if (severity === "MEDIUM")                        score += 5;

      return score;
    };

    return candidates
      .slice()
      .sort((a, b) => rank(b) - rank(a))
      .slice(0, cap);
  }

  private async analyzeTrackersWithAI(trackers: any[], url: string) {
    // ── AI Payload Optimisation ──────────────────────────────────────────────
    // Only send cookies that genuinely need AI enrichment.  Cookies already
    // classified with high confidence by the local Cookie DB are excluded.
    // This can cut prompt size by 70-90 % on large enterprise scans.
    const aiCandidates = this.selectCookiesForAI(trackers);

    console.log(
      `[Scanner/AI] Payload optimisation: ${trackers.length} total cookies → ` +
        `${aiCandidates.length} sent to AI ` +
        `(${trackers.length - aiCandidates.length} skipped — already classified locally)`
    );

    // Nothing to enrich — return a minimal valid response so the caller's
    // merge loop runs cleanly but produces no changes.
    if (aiCandidates.length === 0) {
      return { categorizedTrackers: [], overallComplianceRating: "A", summary: "" };
    }

    const trackerSummary = aiCandidates.map(t => ({
      name: t.name,
      domain: t.domain,
      description: t.description,
      currentCategory: t.category
    }));

    const systemPrompt = `You are a Privacy Engineer. Analyze the provided trackers and categorize them into: 'Necessary', 'Functional', 'Analytics', or 'Marketing'.
Also identify potential compliance risks and provide remediation steps.

CRITICAL: Return ONLY a valid JSON object — no markdown fences, no commentary — matching this exact schema:
{
  "categorizedTrackers": [
    {
      "name": "string",
      "category": "Necessary | Functional | Analytics | Marketing",
      "riskLevel": "LOW | MEDIUM | HIGH",
      "explanation": "string",
      "remediation": "string"
    }
  ],
  "overallComplianceRating": "A | B | C | D | F",
  "summary": "string"
}`;

    const userPrompt = `Trackers detected on ${url}:\n${JSON.stringify(trackerSummary, null, 2)}`;

    try {
      let responseText = await openRouterComplete(systemPrompt, userPrompt, { jsonMode: true });
      responseText = responseText.trim();
      if (responseText.startsWith("```")) {
        responseText = responseText
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();
      }
      return JSON.parse(responseText);
    } catch (err) {
      console.error("[Scanner] AI analysis failed:", err);
      return null;
    }
  }

  async scanCookie(
    url: string,
    userId: string,
    scanDepth: string = "Deep",
    onProgress?: (pct: number, message: string) => Promise<void>
  ) {
    // Helper — fire progress without blocking the scan
    const emit = async (pct: number, message: string) => {
      if (onProgress) {
        try { await onProgress(pct, message); } catch { /* never block the scan */ }
      }
    };

    try {
      await emit(0, "Initializing scan");
      const targetUrl = normaliseUrl(url);

      const urlValidation = this.validateUrl(targetUrl);
      if (!urlValidation.valid) {
        return {
          scanSummary: {
            url: targetUrl,
            level: scanDepth,
            overallScore: 0,
            riskLevel: "ERROR",
            error: `URL validation failed: ${urlValidation.reason}`,
            scannedAt: new Date().toISOString()
          },
          cookiesDetected: [],
          complianceGaps: [
            {
              regulation: "SSRF_PROTECTION",
              severity: "RED",
              issue: `Blocked attempt to scan internal/private domain: ${urlValidation.reason}`,
              remediation: "Only scan public URLs (e.g., https://example.com)."
            }
          ]
        };
      }

      const depthLimit = scanDepth === "Lite" ? 1 : scanDepth === "Medium" ? 5 : scanDepth === "Deep" ? 20 : 50; // Enterprise=50

      await emit(10, "Launching browser");

      // Run URL discovery, compliance page probing, and homepage metadata
      // extraction in parallel. Compliance discovery is a set of lightweight
      // HTTP HEAD probes against well-known paths — not a crawl — so it adds
      // no duplicate page visits on top of the browser-based cookie scan.
      const [urlsToScan, compliancePages, siteMetadata] = await Promise.all([
        scanDepth === "Lite"
          ? Promise.resolve([targetUrl])
          : this.discoverUrls(targetUrl, depthLimit),
        discoverCompliancePages(targetUrl),
        extractPageMetadata(targetUrl),
      ]);

      // Extract well-known compliance page URLs from the probe results
      const privacyPage: DiscoveredCompliancePage | null =
        findFirst(compliancePages, "/privacy", "/privacy-policy") ?? null;
      const cookiePolicyPage: DiscoveredCompliancePage | null =
        findFirst(compliancePages, "/cookie-policy", "/cookies") ?? null;

      await emit(20, "Discovering pages");

      const globalAggregatedCookies = new Map();
      const globalAggregatedStorage: any = { localStorage: {}, sessionStorage: {} };
      let hasConsentBannerGlobal = false;
      const preConsentCookiesGlobal = new Map();
      const postAcceptCookiesGlobal = new Map();
      const postRejectCookiesGlobal = new Map();

      // Technology detection signal accumulator — populated during Phase 1
      const techPageSignals: PageSignals[] = [];

      // DOM consent signals — captured from root page during Phase 1
      let domConsentSignals: DomConsentSignals | null = null;

      // ── Phase 1: Pre-consent capture ──────────────────────────────────────
      await emit(35, "Collecting cookies");
      for (const currentUrl of urlsToScan) {
        const isRootPage = currentUrl === urlsToScan[0];
        let preContext;
        try {
          preContext = await browserManager.newContext({ optimizeForScanning: true });
          const prePage = await preContext.newPage();

          // Intercept network requests for technology detection
          const networkUrls: string[] = [];
          prePage.on("request", (req: any) => {
            const u: string = req.url();
            if (u && (u.startsWith("http://") || u.startsWith("https://"))) {
              networkUrls.push(u);
            }
          });
          try {
            await prePage.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const preState = await this.capturePageState(prePage);
            preState.cookies.forEach((c: any) => {
              preConsentCookiesGlobal.set(c.name, c);
              globalAggregatedCookies.set(c.name, c);
            });
            Object.assign(globalAggregatedStorage.localStorage, preState.storage.localStorage);

            // Collect technology detection signals from this page visit
            const domSignals = await this.capturePageSignals(prePage);
            techPageSignals.push({
              ...domSignals,
              networkUrls,
              cookieNames: preState.cookies.map((c: any) => c.name as string),
            });

            // Capture rich DOM consent signals from root page only
            if (isRootPage && domConsentSignals === null) {
              domConsentSignals = await this.captureDomConsentSignals(prePage);
            }
          } catch (e) {
            console.error(`[Scanner] Pre-consent capture failed for ${currentUrl}:`, (e as Error).message);
          } finally {
            await prePage.close().catch(() => {});
          }
        } catch (e) {
          console.error(`[Scanner] Pre-consent context failed for ${currentUrl}:`, (e as Error).message);
        } finally {
          if (preContext) await preContext.close().catch(() => {});
        }
      }

      // ── Phase 2: Reject + Accept consent flows (one page at a time) ───────
      await emit(50, "Detecting tracking technologies");
      // Track accept/reject click outcomes for Consent Intelligence engine
      let acceptClickSucceeded = false;
      let rejectClickSucceeded = false;
      let cookieCountAfterAccept = 0;

      for (let i = 0; i < urlsToScan.length; i++) {
        const currentUrl = urlsToScan[i];
        const isRoot = i === 0;

        // Reject flow
        let rejectContext;
        try {
          rejectContext = await browserManager.newContext({ optimizeForScanning: true });
          const rejectPage = await rejectContext.newPage();
          try {
            await rejectPage.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            if (isRoot) {
              const rejected = await this.handleConsentBanner(rejectPage, 'reject');
              if (rejected) { hasConsentBannerGlobal = true; rejectClickSucceeded = true; }
            }
            const postRejectState = await this.capturePageState(rejectPage);
            postRejectState.cookies.forEach((c: any) => {
              globalAggregatedCookies.set(c.name, c);
              postRejectCookiesGlobal.set(c.name, c);
            });
          } catch (e) {
            console.error(`[Scanner] Reject flow failed for ${currentUrl}:`, (e as Error).message);
          } finally {
            await rejectPage.close().catch(() => {});
          }
        } catch (e) {
          console.error(`[Scanner] Reject context failed for ${currentUrl}:`, (e as Error).message);
        } finally {
          if (rejectContext) await rejectContext.close().catch(() => {});
        }

        // Accept flow
        let acceptContext;
        try {
          acceptContext = await browserManager.newContext({ optimizeForScanning: true });
          const acceptPage = await acceptContext.newPage();
          try {
            await acceptPage.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            if (isRoot) {
              const accepted = await this.handleConsentBanner(acceptPage, 'accept');
              if (accepted) { hasConsentBannerGlobal = true; acceptClickSucceeded = true; }
            }
            const postAcceptState = await this.capturePageState(acceptPage);
            postAcceptState.cookies.forEach((c: any) => {
              globalAggregatedCookies.set(c.name, c);
              postAcceptCookiesGlobal.set(c.name, c);
            });
            Object.assign(globalAggregatedStorage.localStorage, postAcceptState.storage.localStorage);
            if (isRoot) cookieCountAfterAccept = postAcceptState.cookies.length;
          } catch (e) {
            console.error(`[Scanner] Accept flow failed for ${currentUrl}:`, (e as Error).message);
          } finally {
            await acceptPage.close().catch(() => {});
          }
        } catch (e) {
          console.error(`[Scanner] Accept context failed for ${currentUrl}:`, (e as Error).message);
        } finally {
          if (acceptContext) await acceptContext.close().catch(() => {});
        }
      }

      const allCookies = Array.from(globalAggregatedCookies.values());
      await emit(65, "Collecting cookie attributes");
      const db = await this.loadCookieDb();
      const detectedCookies: any[] = [];

      // Extract the scanned site's hostname for first/third-party classification
      let scannedHostname: string;
      try {
        scannedHostname = new URL(targetUrl).hostname;
      } catch {
        scannedHostname = targetUrl;
      }

      for (const cookie of allCookies) {
        const enriched = this.enrichCookie(cookie, scannedHostname, db);

        // Build the output object — preserve all existing fields for backward
        // compatibility and append new enriched attributes
        detectedCookies.push({
          // ── Existing fields (unchanged shape) ───────────────────────────
          name: enriched.name,
          category: enriched.category,
          domain: enriched.domain,
          description: enriched.description,
          retention: enriched.retention,
          severity: enriched.severity,

          // ── New enriched attributes ──────────────────────────────────────
          path: enriched.path,
          expires: enriched.expires,
          isSession: enriched.isSession,
          secure: enriched.secure,
          httpOnly: enriched.httpOnly,
          sameSite: enriched.sameSite,
          size: enriched.size,
          rawDomain: enriched.rawDomain,
          isFirstParty: enriched.isFirstParty,
          partyType: enriched.partyType,
          vendor: enriched.vendor,
          matchType: enriched.matchType,
        });
      }

      await emit(75, "Running AI categorization");
      // Lite: no AI categorization; Medium+: full AI categorization
      const aiAnalysis = scanDepth !== "Lite"
        ? await this.analyzeTrackersWithAI(detectedCookies, targetUrl)
        : null;
      if (aiAnalysis && Array.isArray(aiAnalysis.categorizedTrackers)) {
        detectedCookies.forEach(cookie => {
          const aiMatch = aiAnalysis.categorizedTrackers.find((t: any) => t.name === cookie.name);
          if (aiMatch) {
            cookie.category = aiMatch.category;
            cookie.severity = aiMatch.riskLevel;
            cookie.description = aiMatch.explanation;
            cookie.remediation = aiMatch.remediation;
          }
        });
      }

      // ── Technology Detection ───────────────────────────────────────────────
      await emit(85, "Running compliance analysis");
      // Merge signals from all Phase 1 page visits and add final cookie names
      // so cookie-based signals can cross-reference the full collected set.
      const allCookieNames = Array.from(globalAggregatedCookies.keys()) as string[];

      // If browser automation failed entirely (no pages loaded), skip technology
      // detection rather than running it on empty signals and returning misleading
      // zero-results. Mark the scan so downstream consumers know confidence is reduced.
      const browserAutomationFailed = techPageSignals.length === 0;

      // Always build mergedSignals — it's also used by the consent analyzer.
      // When automation failed, all DOM signal fields are empty but cookieNames
      // still carry the cookie-name signals collected from HTTP responses.
      const mergedSignals = mergeSignals(
        techPageSignals.length > 0
          ? techPageSignals.map((s) => ({ ...s, cookieNames: allCookieNames }))
          : [{ scriptUrls: [], networkUrls: [], headHtml: "", globalVars: [], cookieNames: allCookieNames }]
      );

      let technologiesDetected: DetectedTechnology[] = [];
      if (!browserAutomationFailed && (scanDepth === "Deep" || scanDepth === "Enterprise")) {
        technologiesDetected = detectTechnologies(mergedSignals);
      } else if (browserAutomationFailed) {
        console.warn("[Scanner] Browser automation produced no page signals — technology detection skipped.");
      }

      // ── Consent Intelligence Engine ───────────────────────────────────────
      // Build the input snapshot for the consent analyzer using evidence
      // already collected during the scan — no extra page visits.
      const enrichedSnapshots: EnrichedCookieSnapshot[] = detectedCookies.map((c: any) => ({
        name: c.name,
        category: c.category ?? "Unclassified",
        isFirstParty: c.isFirstParty ?? true,
        partyType: c.partyType ?? "first-party",
        isSession: c.isSession ?? false,
      }));

      const consentAnalysisInput: ConsentAnalysisInput = {
        preConsentDomSignals: domConsentSignals,
        preConsentCookieNames: Array.from(preConsentCookiesGlobal.keys()) as string[],
        allCookieNames,
        allCookies: enrichedSnapshots,
        acceptClickSucceeded,
        rejectClickSucceeded,
        cookieCountBeforeConsent: preConsentCookiesGlobal.size,
        cookieCountAfterAccept,
        scriptUrls: mergedSignals.scriptUrls,
        networkUrls: mergedSignals.networkUrls,
        headHtmlAll: mergedSignals.headHtml,
        globalVars: mergedSignals.globalVars,
        hasPrivacyPolicy: !!privacyPage?.reachable,
        hasCookiePolicy: !!cookiePolicyPage?.reachable,
        privacyPolicyUrl: privacyPage?.url ?? null,
        cookiePolicyUrl: cookiePolicyPage?.url ?? null,
      };

      const consentBannerAnalysis: ConsentBannerAnalysis = analyzeConsentBanner(consentAnalysisInput);
      const cmpDetection: CMPDetectionResult = detectCMP(consentAnalysisInput);
      const complianceEvaluations: RegulationEvaluation[] = scanDepth !== "Lite"
        ? evaluateCompliance(consentAnalysisInput, consentBannerAnalysis, cmpDetection)
        : [];
      const consentQuality: ConsentQuality = evaluateConsentQuality(consentAnalysisInput, consentBannerAnalysis);

      const highRiskCount = detectedCookies.filter(c => c.severity === "HIGH").length;
      const baseScore = aiAnalysis ? (aiAnalysis.overallComplianceRating === 'A' ? 95 : aiAnalysis.overallComplianceRating === 'B' ? 80 : aiAnalysis.overallComplianceRating === 'C' ? 60 : 40) : 100;
      const score = Math.max(0, baseScore - (highRiskCount * 5) - (detectedCookies.length * 1));
      const risk = score > 75 ? "Low" : score > 45 ? "Medium" : "High";

      const scannedAt = new Date().toISOString();

      // ── Enterprise Intelligence Layer ─────────────────────────────────────
      await emit(95, "Building enterprise report");
      // Runs after all scanning is complete — never modifies scan evidence.
      const enterpriseInput: EnterpriseAnalysisInput = {
        url: targetUrl,
        scanLevel: scanDepth,
        pagesScanned: urlsToScan.length,
        cookiesDetected: detectedCookies,
        technologiesDetected,
        consentBannerAnalysis,
        cmpDetection,
        complianceEvaluations,
        consentQuality,
        privacyPolicyUrl: privacyPage?.url ?? null,
        cookiePolicyUrl: cookiePolicyPage?.url ?? null,
        hasConsentBanner: hasConsentBannerGlobal,
        loadsBeforeConsent: preConsentCookiesGlobal.size > 0,
        totalCookiesCount: detectedCookies.length,
        aiSummary: aiAnalysis?.summary,
        scannedAt,
        preConsentCookieNames: Array.from(preConsentCookiesGlobal.keys()) as string[],
        postAcceptCookieNames: Array.from(postAcceptCookiesGlobal.keys()) as string[],
        postRejectCookieNames: Array.from(postRejectCookiesGlobal.keys()) as string[],
      };

      // analyzeEnterprise never throws — it returns a degraded report on error.
      // Only run for Deep and Enterprise; Lite and Medium get a null report.
      const enterpriseReport: EnterpriseReport | null =
        (scanDepth === "Deep" || scanDepth === "Enterprise")
          ? await analyzeEnterprise(enterpriseInput)
          : null;

      // Use enterprise overall score when available, otherwise fall back to legacy score
      const finalScore = (enterpriseReport && enterpriseReport.riskScores.overallScore > 0)
        ? enterpriseReport.riskScores.overallScore
        : score;
      const finalRisk = (enterpriseReport && (enterpriseReport.riskScores.riskLevel !== "Critical" || score === 0))
        ? enterpriseReport.riskScores.riskLevel
        : risk;

      const result = {
        scanSummary: {
          url: targetUrl,
          level: scanDepth,
          overallScore: finalScore,
          riskLevel: finalRisk,
          hasConsentBanner: hasConsentBannerGlobal,
          loadsBeforeConsent: preConsentCookiesGlobal.size > 0,
          totalCookiesCount: detectedCookies.length,
          scannedAt,
          pagesScanned: urlsToScan.length,
          aiSummary: aiAnalysis?.summary,
          storageDetected: globalAggregatedStorage,
          // Compliance page discovery results (from shared WebsiteScannerService module)
          privacyPolicyUrl: privacyPage?.url ?? null,
          cookiePolicyUrl: cookiePolicyPage?.url ?? null,
          // Homepage metadata (from shared WebsiteScannerService module)
          siteTitle: (siteMetadata as PageMetadata | null)?.title ?? null,
          siteLanguage: (siteMetadata as PageMetadata | null)?.language ?? null,
          // Browser automation health — when false, technology detection was
          // skipped and scan confidence is reduced.
          browserAutomationFailed,
          scanConfidence: browserAutomationFailed ? "reduced" : "full",
        },
        cookiesDetected: detectedCookies,
        technologiesDetected,
        // ── Consent Intelligence ────────────────────────────────────────────
        consentBannerAnalysis,
        cmpDetection,
        complianceEvaluations,
        consentQuality,
        // ── Enterprise Intelligence Layer (new) ─────────────────────────────
        enterpriseReport,
        // ── Legacy compliance gaps (unchanged for backward compatibility) ───
        complianceGaps: [
          {
            regulation: "GDPR",
            severity: preConsentCookiesGlobal.size > 0 ? "RED" : "GREEN",
            issue: "Trackers firing before user consent across scanned pages.",
            remediation: "Implement a strict 'hold-back' mechanism for all non-essential scripts until explicit consent is given."
          },
          {
            regulation: "Cookie Law",
            severity: !hasConsentBannerGlobal ? "RED" : "GREEN",
            issue: !hasConsentBannerGlobal ? "No visible cookie consent banner detected." : "Consent banner present.",
            remediation: "Deploy a compliant CMP (Consent Management Platform) to manage user preferences."
          },
          {
            regulation: "Privacy Policy",
            severity: !privacyPage ? "AMBER" : "GREEN",
            issue: !privacyPage
              ? "No publicly reachable privacy policy page was found on this domain."
              : `Privacy policy found at ${privacyPage.url}.`,
            remediation: !privacyPage
              ? "Publish a privacy policy at a well-known path (e.g. /privacy-policy) to satisfy GDPR Article 13/14 transparency obligations."
              : "Privacy policy is accessible. Review its contents for completeness.",
          },
          {
            regulation: "Cookie Policy",
            severity: !cookiePolicyPage ? "AMBER" : "GREEN",
            issue: !cookiePolicyPage
              ? "No publicly reachable cookie policy page was found on this domain."
              : `Cookie policy found at ${cookiePolicyPage.url}.`,
            remediation: !cookiePolicyPage
              ? "Publish a dedicated cookie policy page listing all cookies used, their purpose, and retention period."
              : "Cookie policy is accessible. Ensure it reflects the cookies detected in this scan.",
          },
        ]
      };

      await this.saveScanResult(userId, url, "cookie", finalScore, finalRisk, result);
      await emit(100, "Scan complete");
      return result;

    } catch (err: any) {
      console.error("3-Stage Cookie scan failed:", err);
      return {
        scanSummary: { url, level: scanDepth, overallScore: 0, riskLevel: "ERROR", error: err.message },
        cookiesDetected: [],
        complianceGaps: [{ regulation: "SCAN_ERROR", severity: "RED", issue: err.message, remediation: "Check destination endpoint." }]
      };
    }
  }

  // ── Vulnerability Scanner ────────────────────────────────────────────────────

  /**
   * Per-finding score deductions.
   *
   * Design principles:
   *   CRITICAL   — Direct transport/injection risk with no mitigation possible.
   *                Only two findings ever reach this tier:
   *                  • HTTPS not enforced (the site is plaintext)
   *                  • Missing CSP (XSS is entirely unrestricted)
   *
   *   HIGH       — Directly exploitable weakness: HSTS missing, clickjacking
   *                unprotected, MIME-sniffing enabled, insecure cookies,
   *                dangerous CSP directives, mixed-content scripts.
   *
   *   HARDENING  — Recommended best practice that reduces attack surface but
   *                has no direct, standalone exploit path (Permissions-Policy).
   *                Weighted the same as MEDIUM so it can never dominate.
   *
   *   MEDIUM     — Information disclosure, weak transport policy, moderate
   *                cookie hygiene, referrer leakage, redirect issues.
   *
   *   LOW        — Modern isolation headers (COEP / COOP / CORP), minor
   *                information disclosure, cache policy, redirect hops.
   *                Three LOW findings together cost less than one MEDIUM.
   *
   *   INFO       — Purely observational; zero score impact.
   *
   * Calibration targets (assuming UA-fix gives correct header reads):
   *   • Perfectly hardened site (no findings)         → 100
   *   • Enterprise HTTPS+HSTS, missing isolation hdrs → 85–95
   *   • Missing CSP + isolation headers               → 65–80
   *   • Missing HSTS + several medium issues          → 40–60
   *   • HTTP-only site                                → ≤ 30
   */
  private readonly VULN_SEVERITY_WEIGHTS: Record<string, number> = {
    CRITICAL:  18,   // HTTPS not enforced, Missing CSP
    HIGH:      10,   // HSTS missing, XFO missing, XCTO missing, unsafe CSP, cookies, mixed-content scripts
    HARDENING:  5,   // Permissions-Policy (best practice, not directly exploitable)
    MEDIUM:     5,   // Referrer-Policy, HttpOnly/SameSite cookies, HSTS short, redirect missing
    LOW:        2,   // COEP, COOP, CORP, includeSubDomains, Server version, XPB, Cache-Control
    INFO:       0,   // Cache-Control public caching — purely observational
  };

  /**
   * Map an internal severity tier to the three-value enum the frontend expects.
   * CRITICAL / HIGH / HARDENING → "HIGH"  (all displayed as high-impact in the UI)
   * MEDIUM                      → "MEDIUM"
   * LOW / INFO                  → "LOW"
   *
   * The frontend type contract { "HIGH" | "MEDIUM" | "LOW" } is unchanged.
   */
  private mapSeverityToFinding(internal: string): "HIGH" | "MEDIUM" | "LOW" {
    if (internal === "CRITICAL" || internal === "HIGH" || internal === "HARDENING") return "HIGH";
    if (internal === "MEDIUM") return "MEDIUM";
    return "LOW";
  }

  /**
   * Derive "HIGH" | "MEDIUM" | "LOW" overall risk from the final numeric score.
   *
   * Thresholds align with the new scoring targets:
   *   ≥ 75 → LOW risk    (enterprise-grade, minor hardening gaps only)
   *   ≥ 45 → MEDIUM risk (notable gaps but foundational protections present)
   *   < 45 → HIGH risk   (critical protections missing)
   */
  private deriveOverallRisk(score: number): "HIGH" | "MEDIUM" | "LOW" {
    if (score >= 75) return "LOW";
    if (score >= 45) return "MEDIUM";
    return "HIGH";
  }

  /**
   * Compute the security score (0–100).
   *
   * Algorithm: start at 100, subtract the per-finding weights defined in
   * VULN_SEVERITY_WEIGHTS, clamp to [0, 100].
   *
   * The weights are calibrated so that:
   *   • Missing only modern hardening headers (COEP/COOP/CORP/Permissions-Policy)
   *     costs at most ~11 points → floor of ~89 for otherwise well-configured sites.
   *   • Missing the foundational trio (HTTPS, HSTS, CSP) costs 46 points alone.
   *   • A fully unconfigured HTTP site (HTTPS not enforced + all headers absent)
   *     deducts well over 100 points and clamps to 0.
   */
  private computeVulnScore(
    internalFindings: Array<{ name?: string; internalSeverity: string }>
  ): number {
    // ── DEBUG: weight audit ───────────────────────────────────────────────────
    console.log("[VulnScore] VULN_SEVERITY_WEIGHTS in use:", JSON.stringify(this.VULN_SEVERITY_WEIGHTS));
    console.log(`[VulnScore] ${internalFindings.length} finding(s) to score:`);
    let runningDeduction = 0;
    for (const f of internalFindings) {
      const weight = this.VULN_SEVERITY_WEIGHTS[f.internalSeverity] ?? 2;
      runningDeduction += weight;
      console.log(
        `[VulnScore]   finding="${f.name ?? "(unnamed)"}"` +
        `  severity=${f.internalSeverity}` +
        `  weight=${weight}` +
        `  runningDeduction=${runningDeduction}`
      );
    }
    const finalScore = Math.max(0, Math.min(100, 100 - runningDeduction));
    console.log(`[VulnScore] Final deduction=${runningDeduction}  Final score=${finalScore}`);
    // ── END DEBUG ─────────────────────────────────────────────────────────────
    return finalScore;
  }

  /**
   * Content-Security-Policy: presence check + warn on obviously dangerous directives.
   *
   * Parsing approach — directive-aware, not string-search:
   *   1. Split the policy on ";" to get individual directives.
   *   2. For each directive, the first token is the directive name; the rest
   *      are its source-list tokens.
   *   3. Checks are applied only to the tokens of the relevant directive,
   *      never to the raw full-policy string.
   *
   * This prevents false positives such as:
   *   • 'unsafe-inline' in style-src triggering a script-src finding.
   *   • A hostname containing "*" (e.g. *.cdn.example.com) in an unrelated
   *     directive triggering the wildcard finding.
   *   • 'unsafe-eval' in a worker-src triggering script-src findings.
   */
  private evaluateCSP(
    value: string | null
  ): Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> {
    const results: Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> = [];

    if (!value) {
      results.push({
        name: "Missing Content-Security-Policy",
        vector: "HTTP response header — Content-Security-Policy absent",
        internalSeverity: "CRITICAL",
        remediation:
          "Add a Content-Security-Policy header. At minimum use: " +
          "\"default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self';\". " +
          "Avoid 'unsafe-inline' and 'unsafe-eval' in script-src.",
      });
      return results;
    }

    // ── Parse directives into a map: directiveName → token[] ─────────────────
    // Each semicolon-delimited segment is one directive. The first whitespace-
    // delimited token is the directive name (lowercased); the remainder are
    // source-list tokens (lowercased for keyword comparisons).
    const directiveMap: Map<string, string[]> = new Map();
    for (const segment of value.split(";")) {
      const tokens = segment.trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;
      const name = tokens[0].toLowerCase();
      const sources = tokens.slice(1).map((t) => t.toLowerCase());
      directiveMap.set(name, sources);
    }

    // Helper: returns the source tokens for `directive`, falling back to
    // `default-src` when the specific directive is absent (per CSP spec).
    const getSources = (directive: string): string[] | null => {
      if (directiveMap.has(directive)) return directiveMap.get(directive)!;
      if (directiveMap.has("default-src")) return directiveMap.get("default-src")!;
      return null;
    };

    // ── Check 1: 'unsafe-inline' in script execution context ─────────────────
    // Only triggered when 'unsafe-inline' appears in the source list that
    // actually governs script execution (script-src, or default-src fallback).
    // 'unsafe-inline' in style-src, img-src, etc. does NOT affect this check.
    const scriptSources = getSources("script-src");
    if (scriptSources && scriptSources.includes("'unsafe-inline'")) {
      results.push({
        name: "CSP allows unsafe-inline scripts",
        vector: "Content-Security-Policy: script-src 'unsafe-inline'",
        internalSeverity: "HIGH",
        remediation:
          "Remove 'unsafe-inline' from script-src. Use nonces or hashes instead: " +
          "\"script-src 'nonce-{random}';\"",
      });
    }

    // ── Check 2: 'unsafe-eval' in script execution context ───────────────────
    // Same scoping rule: only relevant in script-src / default-src fallback.
    if (scriptSources && scriptSources.includes("'unsafe-eval'")) {
      results.push({
        name: "CSP allows unsafe-eval",
        vector: "Content-Security-Policy: 'unsafe-eval' detected",
        internalSeverity: "HIGH",
        remediation:
          "Remove 'unsafe-eval' from your CSP. Refactor any code that relies on " +
          "eval(), new Function(), or similar dynamic execution.",
      });
    }

    // ── Check 3: bare wildcard (*) in script execution context ───────────────
    // A bare "*" token (not "*.example.com") in script-src / default-src
    // allows scripts from any origin, defeating XSS protection entirely.
    // Subdomains wildcards like "*.cdn.example.com" are intentionally allowed —
    // only the standalone "*" token is flagged.
    if (scriptSources && scriptSources.includes("*")) {
      results.push({
        name: "CSP uses wildcard source in script-src",
        vector: "Content-Security-Policy: wildcard (*) in script or default directive",
        internalSeverity: "HIGH",
        remediation:
          "Replace the wildcard (*) in script-src or default-src with explicit trusted origins. " +
          "A wildcard negates the XSS protection provided by CSP.",
      });
    }

    return results;
  }

  /**
   * Strict-Transport-Security: presence, max-age adequacy, and directive completeness.
   */
  private evaluateHSTS(
    value: string | null,
    isHttps: boolean
  ): Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> {
    const results: Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> = [];

    if (!isHttps) {
      // HSTS cannot be meaningfully served over HTTP — skip check
      results.push({
        name: "HTTPS not enforced",
        vector: "Transport layer — target URL uses HTTP",
        internalSeverity: "CRITICAL",
        remediation:
          "Redirect all HTTP traffic to HTTPS. Obtain a valid TLS certificate and configure " +
          "your server to respond on port 443.",
      });
      return results;
    }

    if (!value) {
      results.push({
        name: "Missing Strict-Transport-Security (HSTS)",
        vector: "HTTPS response header — Strict-Transport-Security absent",
        internalSeverity: "HIGH",
        remediation:
          "Add Strict-Transport-Security with a long max-age: " +
          "\"Strict-Transport-Security: max-age=31536000; includeSubDomains; preload\"",
      });
      return results;
    }

    // max-age check — OWASP recommends at least 1 year (31 536 000 s)
    const maxAgeMatch = value.match(/max-age\s*=\s*(\d+)/i);
    if (maxAgeMatch) {
      const maxAge = parseInt(maxAgeMatch[1], 10);
      if (maxAge < 31536000) {
        results.push({
          name: "HSTS max-age too short",
          vector: `Strict-Transport-Security: max-age=${maxAge} (minimum recommended: 31536000)`,
          internalSeverity: "MEDIUM",
          remediation:
            "Increase max-age to at least 31536000 (one year): " +
            "\"Strict-Transport-Security: max-age=31536000; includeSubDomains\"",
        });
      }
    }

    if (!value.toLowerCase().includes("includesubdomains")) {
      results.push({
        name: "HSTS missing includeSubDomains",
        vector: "Strict-Transport-Security: includeSubDomains directive absent",
        internalSeverity: "LOW",
        remediation:
          "Add includeSubDomains to protect all sub-domains from downgrade attacks: " +
          "\"Strict-Transport-Security: max-age=31536000; includeSubDomains\"",
      });
    }

    return results;
  }

  /**
   * X-Frame-Options: presence and valid value check.
   */
  private evaluateXFrameOptions(
    value: string | null,
    cspValue: string | null
  ): Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> {
    const results: Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> = [];

    // Modern alternative: CSP frame-ancestors satisfies this if present
    const cspCoversFraming =
      cspValue ? cspValue.toLowerCase().includes("frame-ancestors") : false;

    if (!value && !cspCoversFraming) {
      results.push({
        name: "Missing X-Frame-Options / CSP frame-ancestors",
        vector: "HTTP response headers — clickjacking protection absent",
        internalSeverity: "HIGH",
        remediation:
          "Add \"X-Frame-Options: DENY\" or \"X-Frame-Options: SAMEORIGIN\". " +
          "Alternatively (or additionally) use CSP: \"frame-ancestors 'none';\" for modern browsers.",
      });
    } else if (value) {
      const upper = value.trim().toUpperCase();
      if (upper !== "DENY" && upper !== "SAMEORIGIN" && !upper.startsWith("ALLOW-FROM")) {
        results.push({
          name: "X-Frame-Options has invalid or deprecated value",
          vector: `X-Frame-Options: ${value}`,
          internalSeverity: "MEDIUM",
          remediation:
            "Use \"X-Frame-Options: DENY\" or \"SAMEORIGIN\". " +
            "ALLOW-FROM is deprecated and not supported in modern browsers.",
        });
      }
    }

    return results;
  }

  /**
   * Permissions-Policy (formerly Feature-Policy): presence check.
   * Classified as HARDENING — restricting browser feature APIs is a recommended
   * best practice but has no standalone, direct exploit path.
   */
  private evaluatePermissionsPolicy(
    value: string | null
  ): Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> {
    const results: Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> = [];

    if (!value) {
      results.push({
        name: "Missing Permissions-Policy",
        vector: "HTTP response header — Permissions-Policy absent",
        internalSeverity: "HARDENING",
        remediation:
          "Add a Permissions-Policy header to restrict access to sensitive browser APIs. " +
          "Example: \"Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()\"",
      });
    }

    return results;
  }

  /**
   * Referrer-Policy: presence and value adequacy.
   */
  private evaluateReferrerPolicy(
    value: string | null
  ): Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> {
    const results: Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> = [];

    // Values that leak full URLs to third parties
    const LEAKY_VALUES = new Set([
      "unsafe-url",
      "no-referrer-when-downgrade",
      "", // empty string is equivalent to browser default, which can leak
    ]);

    if (!value) {
      results.push({
        name: "Missing Referrer-Policy",
        vector: "HTTP response header — Referrer-Policy absent",
        internalSeverity: "MEDIUM",
        remediation:
          "Add a Referrer-Policy header. Recommended value: " +
          "\"Referrer-Policy: strict-origin-when-cross-origin\" or \"no-referrer\"",
      });
      return results;
    }

    if (LEAKY_VALUES.has(value.toLowerCase().trim())) {
      results.push({
        name: "Referrer-Policy leaks full URL to third parties",
        vector: `Referrer-Policy: ${value}`,
        internalSeverity: "MEDIUM",
        remediation:
          "Replace the current value with \"strict-origin-when-cross-origin\" or \"no-referrer\" " +
          "to prevent leaking sensitive path and query information to external origins.",
      });
    }

    return results;
  }

  /**
   * X-Content-Type-Options: must be exactly "nosniff".
   */
  private evaluateXContentTypeOptions(
    value: string | null
  ): Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> {
    const results: Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> = [];

    if (!value || value.toLowerCase().trim() !== "nosniff") {
      results.push({
        name: "Missing or incorrect X-Content-Type-Options",
        vector: value
          ? `X-Content-Type-Options: ${value} (expected: nosniff)`
          : "HTTP response header — X-Content-Type-Options absent",
        internalSeverity: "MEDIUM",
        remediation:
          "Set \"X-Content-Type-Options: nosniff\" to prevent browsers from MIME-sniffing " +
          "responses away from the declared content-type.",
      });
    }

    return results;
  }

  /**
   * Cross-Origin-Embedder-Policy (COEP): presence check.
   */
  private evaluateCOEP(
    value: string | null
  ): Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> {
    if (!value) {
      return [{
        name: "Missing Cross-Origin-Embedder-Policy (COEP)",
        vector: "HTTP response header — COEP absent",
        internalSeverity: "LOW",
        remediation:
          "Add \"Cross-Origin-Embedder-Policy: require-corp\" to enable cross-origin isolation, " +
          "which is a prerequisite for APIs like SharedArrayBuffer.",
      }];
    }
    return [];
  }

  /**
   * Cross-Origin-Opener-Policy (COOP): presence check.
   */
  private evaluateCOOP(
    value: string | null
  ): Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> {
    if (!value) {
      return [{
        name: "Missing Cross-Origin-Opener-Policy (COOP)",
        vector: "HTTP response header — COOP absent",
        internalSeverity: "LOW",
        remediation:
          "Add \"Cross-Origin-Opener-Policy: same-origin\" to isolate the browsing context " +
          "group and prevent cross-origin window attacks.",
      }];
    }
    return [];
  }

  /**
   * Cross-Origin-Resource-Policy (CORP): presence check.
   */
  private evaluateCORP(
    value: string | null
  ): Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> {
    if (!value) {
      return [{
        name: "Missing Cross-Origin-Resource-Policy (CORP)",
        vector: "HTTP response header — CORP absent",
        internalSeverity: "LOW",
        remediation:
          "Add \"Cross-Origin-Resource-Policy: same-origin\" to prevent other origins from " +
          "embedding your resources via <img>, <script>, etc.",
      }];
    }
    return [];
  }

  /**
   * Server header: check for version disclosure.
   */
  private evaluateServerHeader(
    value: string | null
  ): Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> {
    if (!value) return [];

    // Flag if the value looks like it contains a version number
    const VERSION_PATTERN = /[\d.]{3,}|\/\d/;
    if (VERSION_PATTERN.test(value)) {
      return [{
        name: "Server header discloses software version",
        vector: `Server: ${value}`,
        internalSeverity: "LOW",
        remediation:
          "Configure your web server to suppress the Server header or remove version " +
          "information. In nginx: \"server_tokens off;\". In Apache: \"ServerTokens Prod\".",
      }];
    }

    return [];
  }

  /**
   * X-Powered-By: any presence of this header is an information leak.
   */
  private evaluateXPoweredBy(
    value: string | null
  ): Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> {
    if (!value) return [];

    return [{
      name: "X-Powered-By header discloses technology stack",
      vector: `X-Powered-By: ${value}`,
      internalSeverity: "LOW",
      remediation:
        "Remove the X-Powered-By header entirely. In Express.js: \"app.disable('x-powered-by');\". " +
        "In nginx: \"proxy_hide_header X-Powered-By;\"",
    }];
  }

  /**
   * Cache-Control: flag absence on likely-sensitive responses, or permissive caching.
   */
  private evaluateCacheControl(
    value: string | null
  ): Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> {
    const results: Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> = [];

    if (!value) {
      results.push({
        name: "Missing Cache-Control header",
        vector: "HTTP response header — Cache-Control absent",
        internalSeverity: "LOW",
        remediation:
          "Add a Cache-Control header. For pages with authenticated or sensitive content use: " +
          "\"Cache-Control: no-store, no-cache, must-revalidate, private\"",
      });
      return results;
    }

    const lower = value.toLowerCase();

    // Flag if page is publicly cacheable but lacks validation directives
    if (lower.includes("public") && !lower.includes("no-store") && !lower.includes("must-revalidate")) {
      results.push({
        name: "Cache-Control allows public caching without revalidation",
        vector: `Cache-Control: ${value}`,
        internalSeverity: "INFO",
        remediation:
          "If the response may contain user-specific data, add \"private\" and \"no-store\" " +
          "to prevent intermediate proxies from caching sensitive content.",
      });
    }

    return results;
  }

  /**
   * Run all header evaluators against the fetched response headers.
   * Returns an array of raw internal findings (before severity mapping).
   */
  private runHeaderChecks(
    headers: Headers,
    isHttps: boolean
  ): Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> {
    const h = (name: string) => headers.get(name);

    const cspValue = h("content-security-policy");

    return [
      // Critical
      ...this.evaluateCSP(cspValue),
      ...this.evaluateHSTS(h("strict-transport-security"), isHttps),
      // High
      ...this.evaluateXFrameOptions(h("x-frame-options"), cspValue),
      ...this.evaluatePermissionsPolicy(h("permissions-policy")),
      // Medium
      ...this.evaluateReferrerPolicy(h("referrer-policy")),
      ...this.evaluateXContentTypeOptions(h("x-content-type-options")),
      // Low / Informational
      ...this.evaluateCOEP(h("cross-origin-embedder-policy")),
      ...this.evaluateCOOP(h("cross-origin-opener-policy")),
      ...this.evaluateCORP(h("cross-origin-resource-policy")),
      ...this.evaluateServerHeader(h("server")),
      ...this.evaluateXPoweredBy(h("x-powered-by")),
      ...this.evaluateCacheControl(h("cache-control")),
    ];
  }

  /**
   * Comprehensive security header analyzer.
   *
   * Architecture:
   *   1. Validate URL (SSRF protection)               → 10%
   *   2. Fetch target via HTTP GET                     → 20%
   *   3. Run all header evaluators                     → 35%
   *   4. Evaluate security policy quality              → 55%
   *   5. Compute weighted score                        → 75%
   *   6. Build result object                           → 90%
   *   7. Persist + emit completion                     → 100%
   *
   * Return shape is identical to the previous implementation so the frontend
   * and job queue need zero changes.
   */
  // ── Browser-based helpers ────────────────────────────────────────────────────

  /**
   * Audit cookie security flags using the same CDP capture already used by
   * the Cookie Scanner (`capturePageState`). Produces at most three aggregated
   * findings — one per missing flag — rather than one finding per cookie.
   */
  private auditCookieSecurity(
    cookies: any[]
  ): Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> {
    if (!cookies.length) return [];

    const results: Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> = [];

    const missingSecure   = cookies.filter((c) => !c.secure).map((c) => c.name as string);
    const missingHttpOnly = cookies.filter((c) => !c.httpOnly).map((c) => c.name as string);
    const missingSameSite = cookies.filter(
      (c) => !c.sameSite || c.sameSite === "None" || c.sameSite === "Unspecified"
    ).map((c) => c.name as string);

    const fmt = (names: string[]) =>
      names.length <= 5
        ? names.join(", ")
        : `${names.slice(0, 5).join(", ")} … (+${names.length - 5} more)`;

    if (missingSecure.length) {
      results.push({
        name: `${missingSecure.length} cookie(s) missing Secure flag`,
        vector: `Browser cookie audit — affected: ${fmt(missingSecure)}`,
        internalSeverity: "HIGH",
        remediation:
          "Set the Secure attribute on all cookies so they are only transmitted over HTTPS. " +
          `Affected cookies: ${fmt(missingSecure)}.`,
      });
    }

    if (missingHttpOnly.length) {
      results.push({
        name: `${missingHttpOnly.length} cookie(s) missing HttpOnly flag`,
        vector: `Browser cookie audit — affected: ${fmt(missingHttpOnly)}`,
        internalSeverity: "MEDIUM",
        remediation:
          "Set the HttpOnly attribute on session and authentication cookies to prevent " +
          `JavaScript access and reduce XSS risk. Affected: ${fmt(missingHttpOnly)}.`,
      });
    }

    if (missingSameSite.length) {
      results.push({
        name: `${missingSameSite.length} cookie(s) missing or weak SameSite attribute`,
        vector: `Browser cookie audit — affected: ${fmt(missingSameSite)}`,
        internalSeverity: "MEDIUM",
        remediation:
          "Set SameSite=Strict or SameSite=Lax on all cookies to mitigate CSRF attacks. " +
          `Affected: ${fmt(missingSameSite)}.`,
      });
    }

    return results;
  }

  /**
   * Check whether an HTTP URL redirects to HTTPS by issuing a plain `fetch`
   * that follows redirects and inspecting the final URL.
   * Never throws — returns findings array (empty = no issues found).
   */
  private async analyzeRedirects(
    httpsUrl: string
  ): Promise<Array<{ name: string; vector: string; internalSeverity: string; remediation: string }>> {
    const results: Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> = [];

    // Build the HTTP equivalent of the target URL
    const httpUrl = httpsUrl.replace(/^https:\/\//i, "http://");
    // If the target is already HTTP, nothing to check for upgrade redirect
    if (httpUrl === httpsUrl) return results;

    try {
      // Use a manual redirect chain so we can count hops.
      // IMPORTANT: include a realistic browser UA — CDNs block or error on
      // missing/bot UAs, which would produce a false-positive "redirect missing"
      // finding when the real reason is a WAF block, not a missing redirect rule.
      const REDIRECT_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

      let current = httpUrl;
      let hops = 0;
      const MAX_HOPS = 10;
      let finalUrl = httpUrl;
      let upgradedToHttps = false;
      let inconclusive = false;

      while (hops < MAX_HOPS) {
        const resp = await fetch(current, {
          method: "HEAD",
          redirect: "manual",
          headers: { "User-Agent": REDIRECT_UA },
          signal: AbortSignal.timeout(8000),
        });

        const status = resp.status;
        console.log(`[VulnScanner/redirect] ${current} → status ${status}`);

        if (status >= 300 && status < 400) {
          const location = resp.headers.get("location") ?? "";
          if (!location) break;
          // Resolve relative redirects
          const next = location.startsWith("http")
            ? location
            : new URL(location, current).href;
          if (next.toLowerCase().startsWith("https://")) upgradedToHttps = true;
          finalUrl = next;
          current  = next;
          hops++;
        } else if (status >= 200 && status < 300) {
          // 2xx on HTTP — HTTPS upgrade was NOT enforced
          finalUrl = current;
          break;
        } else {
          // 4xx / 5xx / network error on the HTTP endpoint.
          // This means the HTTP endpoint is blocked, firewalled, or only the
          // HTTPS endpoint is publicly reachable.  We cannot determine whether
          // a redirect exists — mark inconclusive and skip the finding.
          console.warn(
            `[VulnScanner/redirect] HTTP endpoint returned ${status} for ${current}. ` +
            "Cannot determine redirect behaviour — skipping redirect finding."
          );
          inconclusive = true;
          break;
        }
      }

      if (!inconclusive && !upgradedToHttps) {
        results.push({
          name: "HTTP to HTTPS redirect not enforced",
          vector: `Redirect chain from ${httpUrl} — HTTPS upgrade not detected (final: ${finalUrl})`,
          internalSeverity: "HIGH",
          remediation:
            "Configure your server to issue a 301 permanent redirect from HTTP to HTTPS for all requests. " +
            "In nginx: `return 301 https://$host$request_uri;`  In Apache: `RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]`",
        });
      } else if (!inconclusive && upgradedToHttps && hops > 2) {
        results.push({
          name: "Excessive redirect hops to HTTPS",
          vector: `${hops} redirect(s) observed from ${httpUrl} to ${finalUrl}`,
          internalSeverity: "LOW",
          remediation:
            "Reduce the redirect chain to a single 301 hop from HTTP to HTTPS. " +
            "Multiple redirects add latency and may confuse HSTS preload mechanisms.",
        });
      }
    } catch (err: any) {
      // HTTP endpoint unreachable (connection refused, DNS failure, timeout).
      // Unreachable HTTP ≠ missing redirect — skip the finding.
      console.warn(
        `[VulnScanner/redirect] Could not probe HTTP redirect for ${httpUrl}: ${err.message} — skipping finding.`
      );
    }

    return results;
  }

  /**
   * Detect mixed-content requests (HTTP resources on an HTTPS page) by
   * listening to page request events via BrowserManager.
   * Aggregates by resource type to avoid one finding per resource URL.
   * Never throws — returns findings array (empty = no mixed content).
   */
  private async detectMixedContent(
    httpsUrl: string
  ): Promise<Array<{ name: string; vector: string; internalSeverity: string; remediation: string }>> {
    const results: Array<{ name: string; vector: string; internalSeverity: string; remediation: string }> = [];

    // Only meaningful on HTTPS pages
    if (!httpsUrl.toLowerCase().startsWith("https://")) return results;

    // Group insecure requests by resource type
    const insecure: Record<string, string[]> = {};

    let context: any = null;
    try {
      context = await browserManager.newContext({ optimizeForScanning: true });
      const page = await context.newPage();

      page.on("request", (req: any) => {
        const reqUrl: string = req.url();
        if (reqUrl.startsWith("http://")) {
          const type: string = req.resourceType() ?? "other";
          if (!insecure[type]) insecure[type] = [];
          // Cap per-type to avoid enormous finding strings
          if (insecure[type].length < 6) insecure[type].push(reqUrl);
        }
      });

      try {
        await page.goto(httpsUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
      } catch {
        // Partial load is fine — we still capture what was requested
      } finally {
        await page.close().catch(() => {});
      }
    } catch (err: any) {
      console.warn("[VulnScanner/mixedContent] Browser context failed:", err.message);
    } finally {
      if (context) await context.close().catch(() => {});
    }

    const SEVERITY_BY_TYPE: Record<string, string> = {
      script:     "HIGH",
      stylesheet: "MEDIUM",
      iframe:     "HIGH",
      image:      "LOW",
    };

    for (const [type, urls] of Object.entries(insecure)) {
      const sev  = SEVERITY_BY_TYPE[type] ?? "MEDIUM";
      const display = urls.length > 3
        ? `${urls.slice(0, 3).join(", ")} … (+${urls.length - 3} more)`
        : urls.join(", ");
      results.push({
        name: `Mixed content — insecure ${type} resource(s) on HTTPS page`,
        vector: `HTTP ${type} loaded on HTTPS page: ${display}`,
        internalSeverity: sev,
        remediation:
          `Update all ${type} resource URLs to use HTTPS. ` +
          "Consider a CSP upgrade-insecure-requests directive as a temporary mitigation: " +
          "\"Content-Security-Policy: upgrade-insecure-requests\"",
      });
    }

    return results;
  }

  /**
   * Full vulnerability scan: HTTP header analysis + browser-based checks.
   *
   * Progress stages:
   *   5%   Starting (emitted by jobQueue)
   *   10%  Validating URL
   *   20%  Fetching headers
   *   35%  Analyzing headers
   *   50%  Launching browser
   *   65%  Auditing cookies
   *   75%  Checking redirects
   *   85%  Checking mixed content
   *   95%  Calculating score
   *   100% Complete
   */
  async scanVulnerability(
    url: string,
    userId: string,
    onProgress?: (pct: number, message: string) => Promise<void>
  ) {
    const emit = async (pct: number, message: string) => {
      if (onProgress) {
        try { await onProgress(pct, message); } catch { /* never block the scan */ }
      }
    };

    try {
      // ── Stage 1: URL validation ─────────────────────────────────────────
      await emit(10, "Validating target URL...");
      const targetUrl = normaliseUrl(url);

      const urlValidation = this.validateUrl(targetUrl);
      if (!urlValidation.valid) {
        return {
          overallRisk:   "HIGH" as const,
          securityScore: 0,
          findings: [
            {
              name:        "SSRF Protection",
              vector:      `Blocked target: ${urlValidation.reason}`,
              severity:    "HIGH" as const,
              remediation: "Scan a publicly accessible HTTP or HTTPS URL.",
            },
          ],
        };
      }

      const isHttps = targetUrl.toLowerCase().startsWith("https://");

      // ── Stage 2: Fetch headers ──────────────────────────────────────────
      await emit(20, "Fetching target headers...");
      let responseHeaders: Headers;
      let finalResponseUrl: string = targetUrl;
      try {
        const response = await fetch(targetUrl, {
          method:   "GET",
          redirect: "follow",
          headers: {
            // Use a realistic browser UA — bot-identified strings cause CDNs
            // (Akamai, Cloudflare, etc.) to serve challenge pages or stripped
            // responses that genuinely lack security headers, producing false
            // positives.  A browser UA gets the same response as Chrome would.
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
              "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
          signal: AbortSignal.timeout(15000),
        });
        responseHeaders = response.headers;
        finalResponseUrl = response.url || targetUrl;

        // ── Diagnostic log — visible in server logs for false-positive investigation ──
        console.log(
          `[VulnScanner] fetch() final URL: ${finalResponseUrl} ` +
          `(status ${response.status})`
        );
        const receivedHeaders: Record<string, string> = {};
        response.headers.forEach((value, name) => { receivedHeaders[name] = value; });
        console.log("[VulnScanner] fetch() received headers:", JSON.stringify(receivedHeaders, null, 2));
      } catch (fetchErr: any) {
        console.error(`[VulnScanner] Fetch failed for ${targetUrl}:`, fetchErr.message);
        throw new Error(
          `Unable to reach ${targetUrl}: ${fetchErr.message}. ` +
          "Ensure the target is publicly accessible."
        );
      }

      // ── Stage 3: Header analysis ────────────────────────────────────────
      await emit(35, "Analyzing security headers...");
      const internalFindings = this.runHeaderChecks(responseHeaders, isHttps);

      // ── Stage 4: Browser launch ─────────────────────────────────────────
      await emit(50, "Launching browser...");
      let browserCookies: any[] = [];
      const browserAvailable = await browserManager.isAvailable().catch(() => false);

      if (browserAvailable) {
        // Reuse same CDP cookie capture pattern as the Cookie Scanner
        let ctx: any = null;
        try {
          ctx = await browserManager.newContext({ optimizeForScanning: true });
          const page = await ctx.newPage();
          try {
            await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
            const state = await this.capturePageState(page);
            browserCookies = state.cookies ?? [];
          } catch (navErr: any) {
            console.warn("[VulnScanner] Browser page load failed:", navErr.message);
          } finally {
            await page.close().catch(() => {});
          }
        } catch (ctxErr: any) {
          console.warn("[VulnScanner] Browser context failed:", (ctxErr as Error).message);
        } finally {
          if (ctx) await ctx.close().catch(() => {});
        }
      } else {
        console.warn("[VulnScanner] Browser not available — skipping browser-based checks.");
      }

      // ── Stage 5: Cookie security audit ─────────────────────────────────
      await emit(65, "Auditing cookie security...");
      const cookieFindings = browserAvailable
        ? this.auditCookieSecurity(browserCookies)
        : [];

      // ── Stage 6: Redirect analysis ──────────────────────────────────────
      await emit(75, "Checking HTTPS redirects...");
      const redirectFindings = isHttps
        ? await this.analyzeRedirects(targetUrl)
        : [];

      // ── Stage 7: Mixed-content detection ───────────────────────────────
      await emit(85, "Checking mixed content...");
      const mixedContentFindings = browserAvailable && isHttps
        ? await this.detectMixedContent(targetUrl)
        : [];

      // ── Stage 8: Score + result ─────────────────────────────────────────
      await emit(95, "Calculating security score...");

      const allInternalFindings = [
        ...internalFindings,
        ...cookieFindings,
        ...redirectFindings,
        ...mixedContentFindings,
      ];

      // 12 header evaluator groups are always run.
      // 3 browser-based check groups (cookies, redirects, mixed-content) are
      // only counted when the browser is actually available and/or applicable.
      const headerCheckCount = 12;
      const browserCheckCount =
        (browserAvailable ? 1 : 0) +          // cookie audit
        (isHttps ? 1 : 0) +                    // redirect check (HTTP→HTTPS)
        (browserAvailable && isHttps ? 1 : 0); // mixed-content detection
      const totalChecks  = headerCheckCount + browserCheckCount;
      const failedChecks = allInternalFindings.length;
      const passedChecks = Math.max(0, totalChecks - failedChecks);

      console.log(
        `[VulnScanner] ${targetUrl} — ` +
        `header findings: ${internalFindings.length}, ` +
        `cookie findings: ${cookieFindings.length}, ` +
        `redirect findings: ${redirectFindings.length}, ` +
        `mixed-content findings: ${mixedContentFindings.length}`
      );

      const securityScore = this.computeVulnScore(allInternalFindings);
      const overallRisk   = this.deriveOverallRisk(securityScore);

      const findings = allInternalFindings.map((f) => ({
        name:        f.name,
        vector:      f.vector,
        severity:    this.mapSeverityToFinding(f.internalSeverity),
        remediation: f.remediation,
      }));

      const result = {
        overallRisk,
        securityScore,
        findings,
        passedChecks,
        failedChecks,
        totalChecks,
        scannedAt: new Date().toISOString(),
      };

      await this.saveScanResult(userId, url, "vulnerability", securityScore, overallRisk, result);

      // ── AI Executive Report (optional enhancement) ──────────────────────
      // Runs AFTER the deterministic scan is complete and persisted.
      // Passes only the structured findings — never the raw page or headers.
      // emit(100) fires AFTER the AI resolves so the progress bar reflects
      // the true completion state. While the AI is running, progress stays
      // at 95% (already emitted above) so the overlay shows a meaningful
      // in-progress state rather than "100% — still waiting".
      await emit(97, "Generating executive report...");
      const aiReport = await generateVulnReport({
        url,
        securityScore,
        overallRisk,
        findings,
        passedChecks,
        failedChecks,
        totalChecks,
      }).catch((unexpectedErr: any) => {
        // generateVulnReport already catches internally; this is belt-and-suspenders
        console.warn("[VulnScanner] Unexpected error from generateVulnReport:", unexpectedErr?.message);
        return null;
      });

      await emit(100, "Security audit complete");
      return aiReport ? { ...result, aiReport } : result;

    } catch (err: any) {
      console.error("[VulnScanner] Scan failed:", err);
      throw err;
    }
  }

  private async saveScanResult(userId: string, url: string, type: string, score: number, risk: string, payload: any) {
    await withTransaction(userId, 'USER', async (client) => {
      await client.query(
        "INSERT INTO website_scans (user_id, url, scan_type, overall_score, risk_level, payload) VALUES ($1, $2, $3, $4, $5, $6)",
        [userId, url, type, score, risk, JSON.stringify(payload)]
      );
    });
  }
}
