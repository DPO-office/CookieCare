import { pool } from "../config/database.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      const dbPath = path.resolve(__dirname, "../config/open-cookie-database.json");
      const data = await fs.readFile(dbPath, "utf-8");
      this.cookieDb = JSON.parse(data);
      return this.cookieDb;
    } catch (err) {
      console.error("Failed to load cookie database:", err);
      return {};
    }
  }

  async scanCookie(url: string, userId: string, scanDepth: string = "Deep") {
    const db = await this.loadCookieDb();
    const matchedCookies: any[] = [];
    const allDefinitions: (CookieDefinition & { provider: string })[] = [];

    for (const [provider, cookies] of Object.entries(db)) {
      cookies.forEach(c => allDefinitions.push({ ...c, provider }));
    }

    let pageContent = "";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      pageContent = await response.text();
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.error(`Scan timeout reached for ${url}`);
      } else {
        console.error("Scraping failed:", err);
      }
      pageContent = "";
    } finally {
      clearTimeout(timeoutId);
    }

    const detectedTrackers = allDefinitions.filter(d => {
      if (d.cookie && pageContent.includes(d.cookie)) return true;
      if (d.domain && pageContent.includes(d.domain)) return true;
      return false;
    });

    for (const tracker of detectedTrackers) {
      matchedCookies.push({
        name: tracker.cookie,
        value: "detected",
        provider: tracker.provider,
        category: tracker.category,
        description: tracker.description,
        privacyLink: tracker.privacyLink,
        matchedBy: "content_match"
      });
    }

    const highRiskCount = matchedCookies.filter(c => c.category === "Marketing" || c.category === "Analytics").length;
    const score = Math.max(0, 100 - (highRiskCount * 15) - (matchedCookies.length * 2));
    const risk = score > 75 ? "Low" : score > 45 ? "Medium" : "High";

    const hasConsentBanner = pageContent.toLowerCase().includes("cookie") || pageContent.toLowerCase().includes("consent");

    const result = {
      scanSummary: {
        url,
        level: scanDepth,
        overallScore: score,
        riskLevel: risk,
        hasConsentBanner,
        loadsBeforeConsent: highRiskCount > 0,
        totalCookiesCount: matchedCookies.length,
        scannedAt: new Date().toISOString()
      },
      cookiesDetected: matchedCookies.map(c => ({
        name: c.name,
        category: c.category,
        domain: c.provider,
        retention: "1 year",
        severity: (c.category === "Marketing" || c.category === "Analytics") ? "HIGH" : "LOW",
        description: c.description
      })),
      complianceGaps: [
        {
          regulation: "GDPR",
          severity: highRiskCount > 0 ? "RED" : "GREEN",
          issue: highRiskCount > 0 ? "Potential marketing trackers detected." : "No critical GDPR gaps detected.",
          remediation: highRiskCount > 0 ? "Implement strict prior consent." : "Maintain current compliance."
        }
      ]
    };

    let client;
    try {
      client = await pool.connect();
      await client.query(
        "INSERT INTO website_scans (user_id, url, scan_type, overall_score, risk_level, payload) VALUES ($1, $2, $3, $4, $5, $6)",
        [userId, url, "cookie", score, risk, JSON.stringify(result)]
      );
    } catch (err) {
      console.error("Failed to save cookie scan results:", err);
    } finally {
      if (client) client.release();
    }

    return result;
  }

  async scanVulnerability(url: string, userId: string) {
    let pageContent = "";
    let headers: Headers = new Headers();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      pageContent = await response.text();
      headers = response.headers;
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.error(`Vulnerability scan timeout reached for ${url}`);
      } else {
        console.error("Vulnerability scraping failed:", err);
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const vulnerabilities = [];
    if (pageContent.includes("jquery/1.12.4")) {
      vulnerabilities.push({ name: "Outdated Library", severity: "Medium", description: "The site uses an outdated version of jQuery (1.12.4)." });
    }

    const hasCSP = Array.from(headers.entries()).some(([k]) => k.toLowerCase() === "content-security-policy");
    if (pageContent.includes("<script") && !hasCSP) {
      vulnerabilities.push({ name: "Missing CSP", severity: "High", description: "No Content Security Policy detected, increasing XSS risk." });
    }

    const score = Math.max(0, 100 - (vulnerabilities.length * 30));
    const risk = score > 80 ? "Low" : score > 50 ? "Medium" : "High";

    const result = {
      url,
      overallScore: score,
      riskLevel: risk,
      vulnerabilities: vulnerabilities.length > 0 ? vulnerabilities : [{ name: "No critical vulnerabilities", severity: "Low", description: "Initial scan found no major issues." }]
    };

    let client;
    try {
      client = await pool.connect();
      await client.query(
        "INSERT INTO website_scans (user_id, url, scan_type, overall_score, risk_level, payload) VALUES ($1, $2, $3, $4, $5, $6)",
        [userId, url, "vulnerability", score, risk, JSON.stringify(result)]
      );
    } catch (err) {
      console.error("Failed to save vulnerability scan results:", err);
    } finally {
      if (client) client.release();
    }
    return result;
  }
}
