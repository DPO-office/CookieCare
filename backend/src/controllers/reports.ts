import { Request, Response } from "express";
import { withTransaction } from "../utils/dbUtils.js";
import { sendEmail } from "../services/email/emailService.js";
import {
  buildCookieReportEmailHtml,
  buildCookieReportEmailText,
} from "../services/email/templates/cookieReportTemplate.js";
import { buildCookieScanPdf } from "../services/scanPdfService.js";
import { logger } from "../utils/logger.js";

/**
 * POST /api/reports/share-email
 *
 * Generates the Cookie Compliance PDF from the scan data provided in the
 * request body and delivers it as an email attachment to the recipient.
 *
 * Expected body:
 * {
 *   recipientEmail: string;
 *   reportTitle: string;      // used for audit log
 *   scanData: {
 *     url: string;
 *     scannedAt: string;
 *     overallScore: number;
 *     riskLevel: string;
 *     hasConsentBanner: boolean;
 *     loadsBeforeConsent: boolean;
 *     totalCookiesCount: number;
 *     cookies: Array<{ name; category; domain; retention; severity }>;
 *     complianceGaps: Array<{ regulation; severity; issue; remediation }>;
 *   }
 * }
 */
export const shareReportEmail = async (req: Request, res: Response) => {
  const { recipientEmail, reportTitle, scanData } = req.body;

  // ── Input validation ──────────────────────────────────────────────────────
  if (!recipientEmail || typeof recipientEmail !== "string") {
    return res.status(400).json({ error: "A valid recipient email address is required." });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    return res.status(400).json({ error: "Invalid recipient email address." });
  }

  if (!scanData || !scanData.url || typeof scanData.overallScore !== "number") {
    return res.status(400).json({ error: "Valid scan data is required to generate the report." });
  }

  try {
    // ── Generate the PDF (same service used by the download endpoint) ────────
    const pdfBuffer = await buildCookieScanPdf({
      url:                scanData.url,
      scannedAt:          scanData.scannedAt || new Date().toISOString(),
      overallScore:       scanData.overallScore,
      riskLevel:          scanData.riskLevel || "UNKNOWN",
      hasConsentBanner:   Boolean(scanData.hasConsentBanner),
      loadsBeforeConsent: Boolean(scanData.loadsBeforeConsent),
      totalCookiesCount:  scanData.totalCookiesCount || 0,
      cookies:            Array.isArray(scanData.cookies) ? scanData.cookies : [],
      complianceGaps:     Array.isArray(scanData.complianceGaps) ? scanData.complianceGaps : [],
    });

    // ── Build email content ───────────────────────────────────────────────────
    const emailHtml = buildCookieReportEmailHtml({ recipientEmail, websiteUrl: scanData.url });
    const emailText = buildCookieReportEmailText({ recipientEmail, websiteUrl: scanData.url });

    const subject = `Cookie Compliance Report – ${scanData.url}`;

    // ── Send the email with PDF attachment ────────────────────────────────────
    await sendEmail({
      to: recipientEmail,
      subject,
      html: emailHtml,
      text: emailText,
      attachments: [
        {
          filename: "Cookie_Compliance_Report.pdf",
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    // ── Audit log ─────────────────────────────────────────────────────────────
    try {
      await withTransaction(req.user!.id, req.user!.role, async (client) => {
        await client.query(
          `INSERT INTO compliance_audit_logs (user_id, action_type, metadata)
           VALUES ($1, $2, $3)`,
          [
            req.user!.id,
            "report_share",
            JSON.stringify({
              recipientEmail,
              reportTitle: reportTitle || "Cookie Compliance Report",
              websiteUrl: scanData.url,
            }),
          ]
        );
      });
    } catch (auditErr) {
      // Audit failure must never block the response
      logger.warn({ auditErr }, "[Reports] Audit log insert failed — non-critical.");
    }

    return res.json({ success: true, message: "Report shared successfully." });
  } catch (err: any) {
    logger.error({ err }, "[Reports] Failed to share report via email.");
    return res.status(500).json({ error: "Unable to send report." });
  }
};
