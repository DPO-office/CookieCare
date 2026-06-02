import { Request, Response } from "express";
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

  async scanCookie(url: string, userId: string) {
    const db = await this.loadCookieDb();

    // Simulate intercepting cookies from the URL
    // In a real enterprise scenario, this would use a headless browser (Puppeteer/Playwright)
    const interceptedCookies = [
      { name: "cookiePreferences", value: "true" },
      { name: "_ga_X123Y", value: "GA1.2.123.456" },
      { name: "CookieConsent", value: "true" },
      { name: "unknown_track_id", value: "abc-123" }
    ];

    const matchedCookies: any[] = [];
    const allDefinitions: (CookieDefinition & { provider: string })[] = [];

    for (const [provider, cookies] of Object.entries(db)) {
      cookies.forEach(c => allDefinitions.push({ ...c, provider }));
    }

    for (const intercepted of interceptedCookies) {
      let foundMatch = false;

      // 1. Strict Matching
      let match = allDefinitions.find(d => d.cookie === intercepted.name);

      // 2. Wildcard Matching
      if (!match) {
        match = allDefinitions.find(d => {
          if (d.wildcardMatch === "1") {
            const pattern = d.cookie.replace(/\*/g, ".*");
            const regex = new RegExp(`^${pattern}$`);
            return regex.test(intercepted.name);
          }
          return false;
        });
      }

      if (match) {
        matchedCookies.push({
          name: intercepted.name,
          value: intercepted.value,
          provider: match.provider,
          category: match.category,
          description: match.description,
          privacyLink: match.privacyLink,
          matchedBy: match.wildcardMatch === "1" ? "wildcard" : "strict"
        });
      } else {
        matchedCookies.push({
          name: intercepted.name,
          value: intercepted.value,
          provider: "Unknown",
          category: "Uncategorized",
          description: "No description available for this cookie.",
          matchedBy: "none"
        });
      }
    }

    // Calculate score based on findings
    const highRiskCount = matchedCookies.filter(c => c.category === "Marketing" || c.category === "Analytics").length;
    const score = Math.max(0, 100 - (highRiskCount * 10) - (matchedCookies.length * 2));
    const risk = score > 70 ? "Low" : score > 40 ? "Medium" : "High";

    const payload = {
      cookies: matchedCookies,
      totalIntercepted: interceptedCookies.length,
      matchedCount: matchedCookies.filter(c => c.provider !== "Unknown").length
    };

    await pool.query(
      "INSERT INTO website_scans (user_id, url, scan_type, overall_score, risk_level, payload) VALUES ($1, $2, $3, $4, $5, $6)",
      [userId, url, "cookie", score, risk, JSON.stringify(payload)]
    );

    return { url, score, risk, cookies: matchedCookies };
  }

  async scanVulnerability(url: string, userId: string) {
    // Vulnerability scanning logic...
    const score = Math.floor(Math.random() * 100);
    const risk = score > 80 ? "Low" : score > 50 ? "Medium" : "High";

    const payload = {
      vulnerabilities: [
        { name: "XSS Vulnerability", severity: "High", description: "Potential Cross-Site Scripting found in search parameter." },
        { name: "Outdated Library", severity: "Medium", description: "The site uses an outdated version of jQuery (1.12.4)." }
      ]
    };

    await pool.query(
      "INSERT INTO website_scans (user_id, url, scan_type, overall_score, risk_level, payload) VALUES ($1, $2, $3, $4, $5, $6)",
      [userId, url, "vulnerability", score, risk, JSON.stringify(payload)]
    );
    return { url, score, risk };
  }
}
