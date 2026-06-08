import { Router, Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { authenticateToken } from "../middleware/auth.js";
import { semanticSearch } from "../RAG/ragService.js";
import { pool } from "../config/database.js";

const router = Router();

async function getSystemSettings(key: string, client: any) {
  const { rows } = await client.query("SELECT value FROM system_settings WHERE key = $1", [key]);
  return rows.length > 0 ? rows[0].value : null;
}
const genAI = new GoogleGenAI({ apiKey: config.geminiApiKey || "dummy" });

function getVerifiedSources(jurisdictions: string[], query: string) {
  const sources = [];
  const queryLower = query.toLowerCase();

  const containsIndia = jurisdictions.some(j => j.toLowerCase().includes("india"));
  const containsUS = jurisdictions.some(j => j.toLowerCase().includes("us") || j.toLowerCase().includes("united states") || j.toLowerCase().includes("federal") || j.toLowerCase().includes("delaware"));

  if (containsIndia || (!containsUS && !containsIndia)) {
    sources.push({
      id: "source_in_1",
      title: "Section 143(3) of the Income Tax Act, 1961",
      citation: "1961 ACT / SEC.143(3)",
      jurisdiction: "India",
      documentType: "Statute",
      officialCopy: "Section 143 - Assessment..."
    });
  }

  if (containsUS || sources.length === 0) {
    sources.push({
      id: "source_us_1",
      title: "Delaware General Corporation Law (DGCL) § 141",
      citation: "8 Del. C. § 141",
      jurisdiction: "USA (Delaware)",
      documentType: "Statute",
      officialCopy: "The business and affairs of every corporation organized under this chapter shall be managed by or under the direction of a board of directors..."
    });
  }

  return sources;
}

router.post("/ask", authenticateToken, async (req: Request, res: Response) => {
  const {
    prompt,
    jurisdiction = [],
    outputFormat = "Brief Summary",
    documents = []
  } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "No query provided." });
  }

  try {
    const job = await addJobToQueue(req.user!.id, "document_analysis", {
      type: "legal_ask",
      prompt,
      jurisdiction,
      outputFormat,
      documents
    });

    res.status(202).json({ success: true, job_id: job.id });
  } catch (err: any) {
    console.error("Lawyer ask queue error:", err);
    res.status(500).json({ error: "Failed to queue legal inquiry." });
  }
});

export default router;
