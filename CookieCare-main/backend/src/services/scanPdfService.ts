// pdfkit is a CommonJS module with a default export.
// Using `import * as` and then accessing `.default` ensures esbuild's
// CJS-interop does not lose the constructor when --packages=external is set.
import * as PDFKitModule from "pdfkit";
const PDFDocument = (PDFKitModule as any).default ?? PDFKitModule;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VulnFinding {
  name: string;
  vector: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  remediation: string;
}

export interface VulnAiReport {
  executiveSummary: string[];
  priorityActions: Array<{ title: string; priority: "High" | "Medium" | "Low"; reason: string }>;
  positiveFindings: string[];
  riskNarrative: string;
}

export interface VulnScanPdfData {
  url: string;
  scannedAt: string;
  securityScore: number;
  overallRisk: "HIGH" | "MEDIUM" | "LOW";
  findings: VulnFinding[];
  passedChecks?: number;
  failedChecks?: number;
  totalChecks?: number;
  aiReport?: VulnAiReport | null;
}

export interface CookieItem {
  name: string;
  category: string;
  domain: string;
  retention: string;
  severity: string;
}

export interface ComplianceGap {
  regulation: string;
  severity: string;
  issue: string;
  remediation: string;
}

export interface CookieScanPdfData {
  url: string;
  scannedAt: string;
  overallScore: number;
  riskLevel: string;
  hasConsentBanner: boolean;
  loadsBeforeConsent: boolean;
  totalCookiesCount: number;
  cookies: CookieItem[];
  complianceGaps: ComplianceGap[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const NAVY   = "#0F172A";
const INDIGO = "#4F46E5";
const SLATE  = "#64748B";
const LGRAY  = "#F8FAFC";
const BORDER = "#E2E8F0";
const DARK   = "#1E293B";

const RISK_COLOR: Record<string, string> = {
  HIGH: "#B91C1C", MEDIUM: "#B45309", LOW: "#047857",
  high: "#B91C1C", medium: "#B45309", low: "#047857",
  RED:  "#B91C1C", YELLOW: "#B45309", GREEN: "#047857",
};
const RISK_BG: Record<string, string> = {
  HIGH: "#FEF2F2", MEDIUM: "#FFFBEB", LOW: "#F0FDF4",
  high: "#FEF2F2", medium: "#FFFBEB", low: "#F0FDF4",
  RED:  "#FEF2F2", YELLOW: "#FFFBEB", GREEN: "#F0FDF4",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function collectBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

const ML = 48; // left margin

function pageWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - ML * 2;
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString("en-GB"); } catch { return iso; }
}

function coverHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string): void {
  const W = doc.page.width;
  doc.rect(0, 0, W, 148).fill(NAVY);
  doc.rect(0, 146, W, 3).fill(INDIGO);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8)
     .text("LEXIFY AI  ·  Privacy & Compliance Platform", ML, 22, { characterSpacing: 0.5 });
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(20)
     .text(title, ML, 46, { width: W - ML * 2 });
  doc.fillColor("#94A3B8").font("Helvetica").fontSize(10)
     .text(subtitle, ML, 78, { width: W - ML * 2 });
  doc.fillColor("#64748B").font("Helvetica").fontSize(8)
     .text("Generated " + new Date().toLocaleString("en-GB"), ML, 98, { width: W - ML * 2 });
  doc.y = 168;
}

function runHeader(doc: PDFKit.PDFDocument): void {
  const W = doc.page.width;
  doc.rect(0, 0, W, 36).fill("#FFFFFF");
  doc.rect(0, 35, W, 1).fill(BORDER);
  doc.fillColor(SLATE).font("Helvetica").fontSize(8)
     .text("LEXIFY AI  ·  Security & Compliance Report", ML, 13);
  doc.y = 50;
}

function footer(doc: PDFKit.PDFDocument, n: number): void {
  const W = doc.page.width;
  const H = doc.page.height;
  doc.rect(0, H - 28, W, 28).fill(LGRAY);
  doc.rect(0, H - 29, W, 1).fill(BORDER);
  doc.fillColor(SLATE).font("Helvetica").fontSize(7.5)
     .text("Confidential · Lexify AI · Randstad Digital · " + new Date().getFullYear(),
           ML, H - 19, { align: "left", width: W - ML * 2 })
     .text("Page " + n, ML, H - 19, { align: "right", width: W - ML * 2 });
}

function h2(doc: PDFKit.PDFDocument, text: string): void {
  doc.moveDown(0.45);
  doc.fillColor(DARK).font("Helvetica-Bold").fontSize(8.5)
     .text(text.toUpperCase(), ML, doc.y, { characterSpacing: 0.7, width: pageWidth(doc) });
  doc.moveDown(0.15);
  doc.rect(ML, doc.y, pageWidth(doc), 1).fill(BORDER);
  doc.moveDown(0.5);
}

function kv(doc: PDFKit.PDFDocument, label: string, value: string): void {
  const y = doc.y;
  doc.fillColor(SLATE).font("Helvetica-Bold").fontSize(8)
     .text(label, ML, y, { width: 134 });
  doc.fillColor(DARK).font("Helvetica").fontSize(9.5)
     .text(value, ML + 140, y, { width: pageWidth(doc) - 140 });
  doc.rect(ML, doc.y + 1, pageWidth(doc), 1).fill(BORDER);
  doc.moveDown(0.4);
}

function para(doc: PDFKit.PDFDocument, text: string): void {
  doc.fillColor(DARK).font("Helvetica").fontSize(9.5)
     .text(text, ML, doc.y, { width: pageWidth(doc), lineGap: 2 });
  doc.moveDown(0.4);
}

function bullet(doc: PDFKit.PDFDocument, text: string, color: string): void {
  const y = doc.y;
  doc.fillColor(color).font("Helvetica-Bold").fontSize(10).text("›", ML, y, { width: 12 });
  doc.fillColor(DARK).font("Helvetica").fontSize(9.5)
     .text(text, ML + 14, y, { width: pageWidth(doc) - 14, lineGap: 2 });
  doc.moveDown(0.25);
}

function countBox(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number, h: number,
  count: number, label: string, color: string, bg: string,
): void {
  doc.roundedRect(x, y, w, h, 6).fill(bg);
  doc.fillColor(color).font("Helvetica-Bold").fontSize(24)
     .text(String(count), x, y + 7, { width: w, align: "center" });
  doc.fillColor(color).font("Helvetica-Bold").fontSize(7.5)
     .text(label, x, y + h - 17, { width: w, align: "center" });
}

function needPage(doc: PDFKit.PDFDocument, minH: number): boolean {
  return doc.y > doc.page.height - minH;
}

// ── Vulnerability Scanner PDF ──────────────────────────────────────────────────

export async function buildVulnScanPdf(data: VulnScanPdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true, bufferPages: true });
  const bufP = collectBuffer(doc);

  // Page 1 — cover
  coverHeader(doc, "Security Vulnerability Report", "Target: " + data.url);

  kv(doc, "Target URL",      data.url);
  kv(doc, "Scan Date",       fmtDate(data.scannedAt));
  kv(doc, "Security Score",  data.securityScore + " / 100");
  kv(doc, "Overall Risk",    data.overallRisk);
  kv(doc, "Total Checks",    String(data.totalChecks ?? "—"));
  kv(doc, "Passed / Failed", (data.passedChecks ?? "—") + " passed  /  " + (data.failedChecks ?? "—") + " failed");
  doc.moveDown(0.8);

  // Count boxes
  const high   = data.findings.filter(f => f.severity === "HIGH").length;
  const medium = data.findings.filter(f => f.severity === "MEDIUM").length;
  const low    = data.findings.filter(f => f.severity === "LOW").length;
  const bw = 82; const bh = 54; const bg = 10; const by = doc.y;
  countBox(doc, ML,                 by, bw, bh, high,   "HIGH",   RISK_COLOR.HIGH,   RISK_BG.HIGH);
  countBox(doc, ML + bw + bg,       by, bw, bh, medium, "MEDIUM", RISK_COLOR.MEDIUM, RISK_BG.MEDIUM);
  countBox(doc, ML + (bw + bg) * 2, by, bw, bh, low,    "LOW",    RISK_COLOR.LOW,    RISK_BG.LOW);
  doc.y = by + bh + 16;

  // Executive summary
  if (data.aiReport?.executiveSummary?.length) {
    h2(doc, "Executive Summary");
    for (const p of data.aiReport.executiveSummary) { para(doc, p); }
  }

  // Risk narrative
  if (data.aiReport?.riskNarrative) {
    h2(doc, "Risk Narrative");
    para(doc, data.aiReport.riskNarrative);
  }

  // Detailed findings
  if (data.findings.length > 0) {
    doc.addPage(); runHeader(doc);
    h2(doc, "Detailed Findings");

    data.findings.forEach((f, i) => {
      if (needPage(doc, 130)) { doc.addPage(); runHeader(doc); }
      const col = RISK_COLOR[f.severity] ?? SLATE;
      const y   = doc.y;

      // Left accent bar
      doc.rect(ML, y, 3, 10).fill(col);
      doc.fillColor(col).font("Helvetica-Bold").fontSize(9)
         .text((i + 1) + ".  [" + f.severity + "]  " + f.name, ML + 8, y, { width: pageWidth(doc) - 8 });
      doc.moveDown(0.2);
      doc.rect(ML, doc.y, pageWidth(doc), 1).fill(BORDER);
      doc.moveDown(0.25);

      doc.fillColor(SLATE).font("Helvetica-Bold").fontSize(8)
         .text("Vector:", ML + 4, doc.y, { continued: true, width: 60 });
      doc.fillColor(DARK).font("Helvetica").fontSize(9)
         .text("  " + f.vector, { width: pageWidth(doc) - 64 });
      doc.moveDown(0.2);

      doc.fillColor(SLATE).font("Helvetica-Bold").fontSize(8)
         .text("Remediation:", ML + 4, doc.y, { continued: true, width: 80 });
      doc.fillColor(DARK).font("Helvetica").fontSize(9)
         .text("  " + f.remediation, { width: pageWidth(doc) - 84 });
      doc.moveDown(0.65);
    });
  }

  // Priority actions
  if (data.aiReport?.priorityActions?.length) {
    if (needPage(doc, 180)) { doc.addPage(); runHeader(doc); }
    h2(doc, "Priority Actions");
    data.aiReport.priorityActions.forEach((a, i) => {
      if (needPage(doc, 80)) { doc.addPage(); runHeader(doc); }
      const col = RISK_COLOR[a.priority] ?? SLATE;
      doc.fillColor(col).font("Helvetica-Bold").fontSize(9)
         .text((i + 1) + ".  [" + a.priority + "]  " + a.title, ML, doc.y, { width: pageWidth(doc) });
      doc.fillColor(DARK).font("Helvetica").fontSize(9)
         .text(a.reason, ML + 12, doc.y, { width: pageWidth(doc) - 12, lineGap: 1 });
      doc.moveDown(0.5);
    });
  }

  // Positive findings
  if (data.aiReport?.positiveFindings?.length) {
    if (needPage(doc, 120)) { doc.addPage(); runHeader(doc); }
    h2(doc, "Positive Findings");
    for (const pf of data.aiReport.positiveFindings) { bullet(doc, pf, RISK_COLOR.LOW); }
  }

  // Appendix
  if (needPage(doc, 100)) { doc.addPage(); runHeader(doc); }
  h2(doc, "Appendix – Technical Details");
  para(doc,
    "This report was generated by the Lexify AI Vulnerability Scanner on " + fmtDate(data.scannedAt) + ". " +
    "The scanner performed a passive security audit covering SSL/TLS certificate validation, " +
    "HTTP security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy), " +
    "network port exposure, and DNS configuration. No active exploitation was performed."
  );

  // Stamp footers on all pages
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    footer(doc, i + 1);
  }

  doc.end();
  return bufP;
}

// ── Cookie Scanner PDF ─────────────────────────────────────────────────────────

export async function buildCookieScanPdf(data: CookieScanPdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true, bufferPages: true });
  const bufP = collectBuffer(doc);

  const riskUp = data.riskLevel.toUpperCase();

  // Page 1 — cover
  coverHeader(doc, "Cookie & Privacy Compliance Report", "Target: " + data.url);

  kv(doc, "Target URL",       data.url);
  kv(doc, "Scan Date",        fmtDate(data.scannedAt));
  kv(doc, "Compliance Score", data.overallScore + " / 100");
  kv(doc, "Risk Level",       riskUp);
  kv(doc, "Total Cookies",    String(data.totalCookiesCount));
  kv(doc, "Consent Banner",   data.hasConsentBanner ? "Detected" : "Not detected (gap)");
  kv(doc, "Pre-consent Load", data.loadsBeforeConsent ? "Yes — trackers fire before consent (gap)" : "No — compliant");
  doc.moveDown(0.8);

  // Count boxes
  const red    = data.complianceGaps.filter(g => g.severity === "RED").length;
  const yellow = data.complianceGaps.filter(g => g.severity === "YELLOW").length;
  const green  = data.complianceGaps.filter(g => g.severity === "GREEN").length;
  const bw = 82; const bh = 54; const bg = 10; const by = doc.y;
  countBox(doc, ML,                 by, bw, bh, red,    "CRITICAL", RISK_COLOR.RED,    RISK_BG.RED);
  countBox(doc, ML + bw + bg,       by, bw, bh, yellow, "WARNINGS", RISK_COLOR.YELLOW, RISK_BG.YELLOW);
  countBox(doc, ML + (bw + bg) * 2, by, bw, bh, green,  "PASSED",   RISK_COLOR.GREEN,  RISK_BG.GREEN);
  doc.y = by + bh + 16;

  // Executive summary
  h2(doc, "Executive Summary");
  const bannerTxt = data.hasConsentBanner
    ? "A consent banner was detected."
    : "No consent banner was detected — a critical GDPR compliance gap.";
  const preTxt = data.loadsBeforeConsent
    ? "Trackers were observed loading before user consent, violating privacy regulations."
    : "Cookies load after consent approval — compliant behaviour.";
  para(doc,
    "Cookie compliance audit completed for " + data.url + " on " + fmtDate(data.scannedAt) + ". " +
    data.totalCookiesCount + " cookie(s) detected. " +
    data.complianceGaps.filter(g => g.severity === "RED").length + " critical gap(s) identified. " +
    bannerTxt + " " + preTxt + " " +
    "Overall compliance score: " + data.overallScore + "/100 (" + riskUp + " risk)."
  );

  // Compliance gaps
  if (data.complianceGaps.length > 0) {
    if (needPage(doc, 160)) { doc.addPage(); runHeader(doc); }
    h2(doc, "Compliance Gaps");
    data.complianceGaps.forEach((gap, i) => {
      if (needPage(doc, 120)) { doc.addPage(); runHeader(doc); }
      const col = RISK_COLOR[gap.severity] ?? SLATE;
      const y   = doc.y;
      doc.rect(ML, y, 3, 10).fill(col);
      doc.fillColor(col).font("Helvetica-Bold").fontSize(9)
         .text("[" + gap.severity + "]  " + gap.regulation + "  —  " + gap.issue,
               ML + 8, y, { width: pageWidth(doc) - 8 });
      doc.moveDown(0.2);
      doc.fillColor(SLATE).font("Helvetica-Bold").fontSize(8)
         .text("Remediation:", ML + 8, doc.y, { continued: true, width: 82 });
      doc.fillColor(DARK).font("Helvetica").fontSize(9)
         .text("  " + gap.remediation, { width: pageWidth(doc) - 90 });
      doc.moveDown(0.6);
    });
  }

  // Cookie registry table
  if (data.cookies.length > 0) {
    if (needPage(doc, 140)) { doc.addPage(); runHeader(doc); }
    h2(doc, "Cookie Registry");

    const colW = [172, 88, 128, 76, 56];
    const hdrs = ["Name", "Category", "Domain", "Retention", "Risk"];
    const rowH = 16;

    // Header row
    const thY = doc.y;
    doc.rect(ML, thY, pageWidth(doc), rowH).fill(LGRAY);
    let cx = ML;
    hdrs.forEach((h, ci) => {
      doc.fillColor(SLATE).font("Helvetica-Bold").fontSize(7.5)
         .text(h.toUpperCase(), cx + 3, thY + 4, { width: colW[ci] - 4 });
      cx += colW[ci];
    });
    doc.y = thY + rowH;
    doc.rect(ML, doc.y, pageWidth(doc), 1).fill(BORDER);
    doc.y += 1;

    // Data rows (cap at 60 to keep file manageable)
    data.cookies.slice(0, 60).forEach((c) => {
      if (needPage(doc, 50)) { doc.addPage(); runHeader(doc); }
      const ry    = doc.y;
      const cells = [c.name, c.category, c.domain, c.retention, c.severity];
      let dcx     = ML;
      cells.forEach((cell, ci) => {
        const isSev = ci === 4;
        doc.fillColor(isSev ? (RISK_COLOR[cell] ?? DARK) : DARK)
           .font(isSev ? "Helvetica-Bold" : "Helvetica")
           .fontSize(8)
           .text(cell, dcx + 3, ry + 3, { width: colW[ci] - 4, ellipsis: true, lineBreak: false });
        dcx += colW[ci];
      });
      doc.rect(ML, ry + rowH - 1, pageWidth(doc), 1).fill(BORDER);
      doc.y = ry + rowH;
    });

    if (data.cookies.length > 60) {
      doc.moveDown(0.3);
      para(doc, "… and " + (data.cookies.length - 60) + " additional cookies omitted for brevity.");
    }
  }

  // Appendix
  if (needPage(doc, 100)) { doc.addPage(); runHeader(doc); }
  h2(doc, "Appendix – Technical Details");
  para(doc,
    "This report was generated by the Lexify AI Cookie Scanner on " + fmtDate(data.scannedAt) + ". " +
    "The scanner launched an isolated Chromium browser instance, visited the target URL, " +
    "captured all network cookies via Chrome DevTools Protocol (CDP), enriched them against " +
    "the Open Cookie Database, and checked for consent banner presence and pre-consent loading " +
    "behaviour. Compliance gaps are evaluated against GDPR, CCPA, and DPDP regulations."
  );

  // Stamp footers on all pages
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    footer(doc, i + 1);
  }

  doc.end();
  return bufP;
}
