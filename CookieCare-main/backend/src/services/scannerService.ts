import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { browserManager } from "../utils/browserManager.js";
import { Page } from "playwright";
import { openRouterComplete } from "./openRouterClient.js";
import { withTransaction } from "../utils/dbUtils.js";

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

export class ScannerService {
  private cookieDb: CookieDatabase | null = null;

  private async loadCookieDb() {
    if (this.cookieDb) return this.cookieDb;
    try {
      const isProd = process.env.NODE_ENV === "production";
      const dbPath = isProd
        ? path.resolve(process.cwd(), "dist/backend/src/config/open-cookie-database.json")
        : path.resolve(__dirname, "../config/open-cookie-database.json");

      const data = await fs.readFile(dbPath, "utf-8");
      this.cookieDb = JSON.parse(data);
      return this.cookieDb;
    } catch (err) {
      console.error("Failed to load cookie database:", err);
      return {};
    }
  }

  private validateUrl(url: string): { valid: boolean; reason?: string } {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      const blockedHosts = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '169.254.169.254',
        '::1',
        '::ffff:127.0.0.1',
        'localhost.localdomain',
      ];

      if (blockedHosts.includes(hostname)) {
        return { valid: false, reason: `Blocked hostname: ${hostname}` };
      }

      const privateIPPatterns = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[01])\./,
        /^192\.168\./,
        /^127\./,
        /^169\.254\./,
        /^fc[0-9a-f]{2}:/i,
        /^fe[89ab][0-9a-f]:/i,
      ];

      for (const pattern of privateIPPatterns) {
        if (pattern.test(hostname)) {
          return { valid: false, reason: `Private IP range blocked: ${hostname}` };
        }
      }

      const blockedPorts = ['25', '587', '465'];
      if (blockedPorts.includes(parsed.port)) {
        return { valid: false, reason: `Blocked port: ${parsed.port}` };
      }

      return { valid: true };
    } catch (err: any) {
      return { valid: false, reason: `Invalid URL format: ${err.message}` };
    }
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
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
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

  private async discoverUrls(rootUrl: string, limit: number = 20): Promise<string[]> {
    const urls = new Set<string>([rootUrl]);
    const domain = new URL(rootUrl).hostname;

    const sitemapUrl = new URL('/sitemap.xml', rootUrl).toString();
    if (this.validateUrl(sitemapUrl).valid) {
      try {
        const resp = await fetch(sitemapUrl, { signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
          const text = await resp.text();
          const matches = text.match(/<loc>(.*?)<\/loc>/g);
          if (matches) {
            for (const m of matches) {
              const loc = m.replace(/<\/?loc>/g, '').trim();
              if (loc && urls.size < limit) {
                try {
                  const u = new URL(loc);
                  if (u.hostname === domain) urls.add(loc);
                } catch (e) {}
              }
            }
          }
        }
      } catch (e) {}
    }

    if (urls.size >= limit) return Array.from(urls).slice(0, limit);

    let context;
    try {
      context = await browserManager.newContext({ optimizeForScanning: true });
      const page = await context.newPage();
      try {
        await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const links = await page.evaluate((domain) => {
          return Array.from(document.querySelectorAll('a'))
            .map(a => a.href)
            .filter(href => {
              try {
                const u = new URL(href);
                return u.hostname === domain && (u.protocol === 'http:' || u.protocol === 'https:') && !u.hash;
              } catch (e) { return false; }
            });
        }, domain);

        for (const link of links) {
          if (urls.size >= limit) break;
          if (this.validateUrl(link).valid) {
            urls.add(link);
          }
        }
      } catch (e) {
        console.warn('[Scanner] discoverUrls page navigation failed, continuing with root URL only:', (e as Error).message);
      } finally {
        await page.close().catch(() => {});
      }
    } catch (e) {
      console.warn('[Scanner] discoverUrls browser context failed, continuing with root URL only:', (e as Error).message);
    } finally {
      if (context) await context.close().catch(() => {});
    }

    return Array.from(urls).slice(0, limit);
  }

  private async analyzeTrackersWithAI(trackers: any[], url: string) {
    const trackerSummary = trackers.map(t => ({
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

  async scanCookie(url: string, userId: string, scanDepth: string = "Deep") {
    try {
      const targetUrl = url.startsWith('http') ? url : `https://${url}`;

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

      const depthLimit = scanDepth === "Lite" ? 1 : scanDepth === "Medium" ? 5 : scanDepth === "Enterprise" ? 15 : 10;
      const urlsToScan = scanDepth === "Lite"
        ? [targetUrl]
        : await this.discoverUrls(targetUrl, depthLimit);

      const globalAggregatedCookies = new Map();
      const globalAggregatedStorage: any = { localStorage: {}, sessionStorage: {} };
      let hasConsentBannerGlobal = false;
      const preConsentCookiesGlobal = new Map();

      // ── Phase 1: Pre-consent capture ──────────────────────────────────────
      for (const currentUrl of urlsToScan) {
        let preContext;
        try {
          preContext = await browserManager.newContext({ optimizeForScanning: true });
          const prePage = await preContext.newPage();
          try {
            await prePage.goto(currentUrl, { waitUntil: 'networkidle', timeout: 30000 });
            const preState = await this.capturePageState(prePage);
            preState.cookies.forEach((c: any) => {
              preConsentCookiesGlobal.set(c.name, c);
              globalAggregatedCookies.set(c.name, c);
            });
            Object.assign(globalAggregatedStorage.localStorage, preState.storage.localStorage);
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
      for (let i = 0; i < urlsToScan.length; i++) {
        const currentUrl = urlsToScan[i];
        const isRoot = i === 0;

        // Reject flow
        let rejectContext;
        try {
          rejectContext = await browserManager.newContext({ optimizeForScanning: true });
          const rejectPage = await rejectContext.newPage();
          try {
            await rejectPage.goto(currentUrl, { waitUntil: 'networkidle', timeout: 30000 });
            if (isRoot) {
              const rejected = await this.handleConsentBanner(rejectPage, 'reject');
              if (rejected) hasConsentBannerGlobal = true;
            }
            const postRejectState = await this.capturePageState(rejectPage);
            postRejectState.cookies.forEach((c: any) => globalAggregatedCookies.set(c.name, c));
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
            await acceptPage.goto(currentUrl, { waitUntil: 'networkidle', timeout: 30000 });
            if (isRoot) {
              const accepted = await this.handleConsentBanner(acceptPage, 'accept');
              if (accepted) hasConsentBannerGlobal = true;
            }
            const postAcceptState = await this.capturePageState(acceptPage);
            postAcceptState.cookies.forEach((c: any) => globalAggregatedCookies.set(c.name, c));
            Object.assign(globalAggregatedStorage.localStorage, postAcceptState.storage.localStorage);
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
      const db = await this.loadCookieDb();
      const detectedCookies: any[] = [];

      for (const cookie of allCookies) {
        let matched = false;
        for (const [provider, cookies] of Object.entries(db)) {
          const match = cookies.find(c => c.cookie?.toLowerCase() === cookie.name.toLowerCase());
          if (match) {
            detectedCookies.push({
              name: cookie.name,
              category: match.category,
              domain: provider,
              description: match.description,
              retention: match.retentionPeriod || "Persistent",
              severity: (match.category === "Marketing" || match.category === "Analytics") ? "HIGH" : "LOW"
            });
            matched = true;
            break;
          }
        }

        if (!matched) {
          detectedCookies.push({
            name: cookie.name,
            category: "Unclassified",
            domain: cookie.domain,
            description: "Dynamic JavaScript-set tracker detected via CDP.",
            retention: "Session",
            severity: "MEDIUM"
          });
        }
      }

      const aiAnalysis = await this.analyzeTrackersWithAI(detectedCookies, targetUrl);
      if (aiAnalysis) {
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

      const highRiskCount = detectedCookies.filter(c => c.severity === "HIGH").length;
      const baseScore = aiAnalysis ? (aiAnalysis.overallComplianceRating === 'A' ? 95 : aiAnalysis.overallComplianceRating === 'B' ? 80 : aiAnalysis.overallComplianceRating === 'C' ? 60 : 40) : 100;
      const score = Math.max(0, baseScore - (highRiskCount * 5) - (detectedCookies.length * 1));
      const risk = score > 75 ? "Low" : score > 45 ? "Medium" : "High";

      const result = {
        scanSummary: {
          url: targetUrl,
          level: scanDepth,
          overallScore: score,
          riskLevel: risk,
          hasConsentBanner: hasConsentBannerGlobal,
          loadsBeforeConsent: preConsentCookiesGlobal.size > 0,
          totalCookiesCount: detectedCookies.length,
          scannedAt: new Date().toISOString(),
          pagesScanned: urlsToScan.length,
          aiSummary: aiAnalysis?.summary,
          storageDetected: globalAggregatedStorage
        },
        cookiesDetected: detectedCookies,
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
          }
        ]
      };

      await this.saveScanResult(userId, url, "cookie", score, risk, result);
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

  async scanVulnerability(url: string, userId: string) {
    const findings: Array<{
      name: string;
      vector: string;
      severity: "HIGH" | "MEDIUM" | "LOW";
      remediation: string;
    }> = [];
    try {
      const targetUrl = url.startsWith('http') ? url : `https://${url}`;

      const urlValidation = this.validateUrl(targetUrl);
      if (!urlValidation.valid) {
        return {
          overallRisk: "HIGH" as const,
          securityScore: 0,
          findings: [
            {
              name: "SSRF Protection",
              vector: `Blocked target: ${urlValidation.reason}`,
              severity: "HIGH" as const,
              remediation: "Scan a publicly accessible HTTP or HTTPS URL."
            }
          ]
        };
      }

      const response = await fetch(targetUrl, { method: 'GET' });
      const headers = response.headers;

      if (!headers.get('content-security-policy')) {
        findings.push({
          name: "Missing Content-Security-Policy",
          vector: "HTTP response headers",
          severity: "HIGH",
          remediation: "Add a Content-Security-Policy response header that only permits trusted content sources."
        });
      }
      if (!headers.get('strict-transport-security')) {
        findings.push({
          name: "Missing Strict-Transport-Security",
          vector: "HTTPS response headers",
          severity: "MEDIUM",
          remediation: "Add Strict-Transport-Security with an appropriate max-age and includeSubDomains policy."
        });
      }
      if (!headers.get('x-content-type-options') || headers.get('x-content-type-options')?.toLowerCase() !== 'nosniff') {
        findings.push({
          name: "Missing X-Content-Type-Options",
          vector: "HTTP response headers",
          severity: "LOW",
          remediation: "Set the X-Content-Type-Options response header to nosniff."
        });
      }

      const score = Math.max(0, 100 - (findings.length * 20));
      const risk: "LOW" | "MEDIUM" | "HIGH" = score > 80 ? "LOW" : score > 50 ? "MEDIUM" : "HIGH";

      const result = {
        overallRisk: risk,
        securityScore: score,
        findings
      };

      await this.saveScanResult(userId, url, "vulnerability", score, risk, result);
      return result;

    } catch (err: any) {
      console.error("Vulnerability endpoint scan failed:", err);
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
