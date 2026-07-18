import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { addJobToQueue } from "../services/jobQueue.js";
import { buildVulnScanPdf, buildCookieScanPdf } from "../services/scanPdfService.js";

const router = Router();

router.post("/scan-cookie", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { url, scanDepth } = req.body;
  
    const job = await addJobToQueue(req.user!.id, "privacy_scanning", { url, scanDepth });
    
    res.status(202).json({ success: true, job_id: job.id });
  } catch (error) {
    console.error("Cookie scan queueing failed:", error);
    res.status(500).json({ success: false, error: "Failed to queue cookie scan" });
  }
});

router.post("/scan-vulnerability", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
  
    const job = await addJobToQueue(req.user!.id, "vulnerability_scanning", { url });
    
    res.status(202).json({ success: true, job_id: job.id });
  } catch (error) {
    console.error("Vulnerability scan queueing failed:", error);
    res.status(500).json({ success: false, error: "Failed to queue vulnerability scan" });
  }
});


// ── PDF report endpoints ───────────────────────────────────────────────────────

/**
 * POST /api/vulnerabilities/scan-vulnerability/report
 * Body: the full VulnScanPdfData JSON (scan result from the frontend).
 * Returns: application/pdf binary.
 */
router.post("/scan-vulnerability/report", authenticateToken, async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!data?.url || typeof data.securityScore !== "number") {
      return res.status(400).json({ error: "Invalid scan data payload." });
    }
    const pdf = await buildVulnScanPdf(data);
    const filename = `vulnerability-report-${Date.now()}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdf.length);
    res.end(pdf);
  } catch (err: any) {
    console.error("[PDF] Vulnerability report generation failed:", err);
    res.status(500).json({ error: "Failed to generate vulnerability report." });
  }
});

/**
 * POST /api/vulnerabilities/scan-cookie/report
 * Body: the full CookieScanPdfData JSON (scan result from the frontend).
 * Returns: application/pdf binary.
 */
router.post("/scan-cookie/report", authenticateToken, async (req: Request, res: Response) => {
  try {
    const data = req.body;
    if (!data?.url || typeof data.overallScore !== "number") {
      return res.status(400).json({ error: "Invalid scan data payload." });
    }
    const pdf = await buildCookieScanPdf(data);
    const filename = `cookie-compliance-report-${Date.now()}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdf.length);
    res.end(pdf);
  } catch (err: any) {
    console.error("[PDF] Cookie report generation failed:", err);
    res.status(500).json({ error: "Failed to generate cookie report." });
  }
});

export default router;