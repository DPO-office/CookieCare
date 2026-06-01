import { Request, Response } from "express";
import { pool } from "../config/database.js";

export class ScannerService {
  async scanCookie(url: string, userId: string) {
    // Cookie scanning logic...
    const score = Math.floor(Math.random() * 100);
    const risk = score > 70 ? "Low" : score > 40 ? "Medium" : "High";

    await pool.query(
      "INSERT INTO website_scans (user_id, url, scan_type, overall_score, risk_level) VALUES ($1, $2, $3, $4, $5)",
      [userId, url, "cookie", score, risk]
    );
    return { url, score, risk };
  }

  async scanVulnerability(url: string, userId: string) {
    // Vulnerability scanning logic...
    const score = Math.floor(Math.random() * 100);
    const risk = score > 80 ? "Low" : score > 50 ? "Medium" : "High";

    await pool.query(
      "INSERT INTO website_scans (user_id, url, scan_type, overall_score, risk_level) VALUES ($1, $2, $3, $4, $5)",
      [userId, url, "vulnerability", score, risk]
    );
    return { url, score, risk };
  }
}
