/**
 * Enterprise Report Template — Professional Consulting Grade
 *
 * Design reference: Deloitte / EY / PwC compliance report aesthetics.
 * Architecture: Fixed-height A4 pages (794 × 1123 px @ 96 dpi),
 * each captured independently by html2canvas — no mid-element page breaks.
 *
 * Branding: Lexify AI (primary platform) · Randstad Digital 
 */
import type { EnterpriseReportData, ReportFinding, ReportRecommendation } from "./reportTypes";
import {
  getLexifyLogoB64, getRandstadLogoB64,
  LEXIFY_SHIELD_SVG, RANDSTAD_WORDMARK_SVG,
  LEXIFY_INDIGO, RANDSTAD_BLUE,
} from "./brandAssets";

// ─── A4 page dimensions at 96 dpi ────────────────────────────────────────────
export const A4_W_PX   = 794;
export const A4_H_PX   = 1123;
const MARGIN            = 48;
const CONTENT_W         = A4_W_PX - MARGIN * 2;  // 698px
const HEADER_H          = 56;
const FOOTER_H          = 38;
const CONTENT_PAGE_H    = A4_H_PX - HEADER_H - FOOTER_H - MARGIN * 2;

// ─── Risk palette ─────────────────────────────────────────────────────────────
const RISK_COLOR: Record<string, string>  = { critical:"#B91C1C", high:"#C2410C", medium:"#B45309", low:"#047857" };
const RISK_BG: Record<string, string>     = { critical:"#FEF2F2", high:"#FFF7ED", medium:"#FFFBEB", low:"#F0FDF4" };
const RISK_BORDER: Record<string, string> = { critical:"#FECACA", high:"#FED7AA", medium:"#FDE68A", low:"#A7F3D0" };
const RISK_BADGE_TEXT: Record<string, string> = { critical:"#991B1B", high:"#9A3412", medium:"#92400E", low:"#065F46" };

function riskColor(r: string)  { return RISK_COLOR[r]  ?? "#64748B"; }
function riskBg(r: string)     { return RISK_BG[r]     ?? "#F8FAFC"; }
function riskBorder(r: string) { return RISK_BORDER[r] ?? "#E2E8F0"; }
function riskLabel(r: string)  { return r.charAt(0).toUpperCase() + r.slice(1); }

// ─── Logo helpers ─────────────────────────────────────────────────────────────
function lexifyLogoImg(width: number, height: number, style = ""): string {
  const src = getLexifyLogoB64() ?? LEXIFY_SHIELD_SVG;
  return `<img src="${src}" width="${width}" height="${height}" alt="Lexify AI"
               style="object-fit:contain;display:block;${style}"/>`;
}

function randstadLogoImg(width: number, height: number, style = ""): string {
  const src = getRandstadLogoB64() ?? RANDSTAD_WORDMARK_SVG;
  return `<img src="${src}" width="${width}" height="${height}" alt="Randstad"
               style="object-fit:contain;display:block;${style}"/>`;
}

// ─── Page shell ───────────────────────────────────────────────────────────────
function pageShell(content: string, pageNum: number, totalPages: number, isFirstPage = false): string {
  const headerHtml = isFirstPage ? "" : runningHeader();
  return `
<div style="width:${A4_W_PX}px;height:${A4_H_PX}px;background:#FFFFFF;position:relative;
            box-sizing:border-box;overflow:hidden;
            font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  ${headerHtml}
  <!-- Content area -->
  <div style="position:absolute;
              left:${MARGIN}px;right:${MARGIN}px;
              top:${isFirstPage ? 0 : HEADER_H}px;
              bottom:${FOOTER_H}px;
              overflow:hidden;">
    ${content}
  </div>
  <!-- Footer -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:${FOOTER_H}px;">
    ${pageFooter(pageNum, totalPages)}
  </div>
</div>`;
}

// ─── Running header (pages 2+) ────────────────────────────────────────────────
function runningHeader(): string {
  return `
  <div style="position:absolute;top:0;left:0;right:0;height:${HEADER_H}px;
              background:#FFFFFF;border-bottom:2px solid #E2E8F0;
              display:flex;align-items:center;justify-content:space-between;
              padding:0 ${MARGIN}px;box-sizing:border-box;">
    <!-- Left: Lexify logo + name -->
    <div style="display:flex;align-items:center;gap:9px;">
      ${lexifyLogoImg(28, 28, "border-radius:6px;")}
      <div style="line-height:1.1;">
        <div style="font-size:11px;font-weight:700;color:#0F172A;letter-spacing:-0.01em;">Lexify AI</div>
        <div style="font-size:8px;font-weight:500;color:#94A3B8;text-transform:uppercase;letter-spacing:0.12em;margin-top:1px;">AI Privacy &amp; Compliance Platform</div>
      </div>
    </div>
    <!-- Right:  Randstad -->
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="font-size:8px;font-weight:500;color:#94A3B8;text-transform:uppercase;letter-spacing:0.1em;"></span>
      <div style="width:1px;height:16px;background:#E2E8F0;"></div>
      ${randstadLogoImg(72, 22)}
    </div>
  </div>`;
}

// ─── Page footer ──────────────────────────────────────────────────────────────
function pageFooter(pageNum: number, totalPages: number): string {
  return `
  <div style="height:${FOOTER_H}px;background:#F8FAFC;border-top:1px solid #E2E8F0;
              display:flex;align-items:center;justify-content:space-between;
              padding:0 ${MARGIN}px;box-sizing:border-box;">
    <span style="font-size:7.5px;color:#94A3B8;letter-spacing:0.03em;">
      Confidential &nbsp;·&nbsp; Lexify AI Privacy &amp; Compliance Platform &nbsp;·&nbsp;
      Randstad Digital &nbsp;·&nbsp; ${new Date().getFullYear()}
    </span>
    <span style="font-size:8px;font-weight:600;color:#64748B;">
      ${pageNum} / ${totalPages}
    </span>
  </div>`;
}

// ─── Section heading ──────────────────────────────────────────────────────────
function sectionHeading(title: string): string {
  return `
  <div style="display:flex;align-items:center;gap:0;margin:18px 0 10px;">
    <span style="font-size:10px;font-weight:700;color:#0F172A;text-transform:uppercase;
                 letter-spacing:0.12em;">${title}</span>
    <div style="flex:1;height:1px;background:#E2E8F0;margin-left:10px;"></div>
  </div>`;
}

// ─── Divider line ─────────────────────────────────────────────────────────────
function divider(margin = "14px 0"): string {
  return `<div style="height:1px;background:#F1F5F9;margin:${margin};"></div>`;
}

// ─── Info table ───────────────────────────────────────────────────────────────
function infoTableRow(label: string, value: string, isLast = false): string {
  const border = isLast ? "" : "border-bottom:1px solid #F1F5F9;";
  return `
  <tr>
    <td style="font-size:8.5px;font-weight:700;color:#94A3B8;text-transform:uppercase;
               letter-spacing:0.08em;padding:6px 16px 6px 0;white-space:nowrap;
               ${border}vertical-align:top;width:36%;">${label}</td>
    <td style="font-size:10px;font-weight:500;color:#1E293B;padding:6px 0;
               ${border}line-height:1.5;">${value}</td>
  </tr>`;
}

// ─── Score gauge SVG ──────────────────────────────────────────────────────────
function scoreGaugeSVG(score: number, risk: string, size = 90): string {
  const col  = riskColor(risk);
  const r    = (size / 2) - 10;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const cx   = size / 2;
  const cy   = size / 2;
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#F1F5F9" stroke-width="9"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="9"
      stroke-dasharray="${fill.toFixed(1)} ${(circ - fill).toFixed(1)}"
      stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy - 2}" text-anchor="middle"
          font-family="'Segoe UI',Arial,sans-serif"
          font-size="${Math.round(size * 0.22)}" font-weight="800" fill="#0F172A">${score}</text>
    <text x="${cx}" y="${cy + 11}" text-anchor="middle"
          font-family="Arial,sans-serif" font-size="${Math.round(size * 0.1)}" fill="#94A3B8">/100</text>
  </svg>`;
}

// ─── Score table (used in score breakdown section) ────────────────────────────
function scoreTableRow(label: string, score: number): string {
  const col      = score >= 70 ? "#047857" : score >= 50 ? "#B45309" : "#B91C1C";
  const bgBar    = score >= 70 ? "#D1FAE5" : score >= 50 ? "#FEF3C7" : "#FEE2E2";
  const fillBar  = score >= 70 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444";
  const pct      = `${score}%`;
  return `
  <tr>
    <td style="font-size:9.5px;color:#374151;font-weight:500;padding:6px 14px 6px 0;
               border-bottom:1px solid #F9FAFB;vertical-align:middle;width:45%;">${label}</td>
    <td style="padding:6px 10px 6px 0;border-bottom:1px solid #F9FAFB;vertical-align:middle;width:45%;">
      <div style="height:5px;background:${bgBar};border-radius:3px;overflow:hidden;">
        <div style="height:5px;width:${pct};background:${fillBar};border-radius:3px;"></div>
      </div>
    </td>
    <td style="font-size:9.5px;font-weight:700;color:${col};text-align:right;
               padding:6px 0;border-bottom:1px solid #F9FAFB;vertical-align:middle;white-space:nowrap;width:10%;">${score}</td>
  </tr>`;
}

// ─── Risk summary row table ───────────────────────────────────────────────────
function overallScoreTable(data: EnterpriseReportData): string {
  const crit = data.findings.filter(f => f.severity === "critical").length;
  const high = data.findings.filter(f => f.severity === "high").length;
  const med  = data.findings.filter(f => f.severity === "medium").length;
  const low  = data.findings.filter(f => f.severity === "low").length;

  const cols = [
    { label: "Critical", count: crit, c: RISK_COLOR.critical,  bg: RISK_BG.critical,  br: RISK_BORDER.critical  },
    { label: "High",     count: high, c: RISK_COLOR.high,      bg: RISK_BG.high,      br: RISK_BORDER.high      },
    { label: "Medium",   count: med,  c: RISK_COLOR.medium,    bg: RISK_BG.medium,    br: RISK_BORDER.medium    },
    { label: "Low",      count: low,  c: RISK_COLOR.low,       bg: RISK_BG.low,       br: RISK_BORDER.low       },
  ];

  return `
  <div style="display:flex;gap:8px;margin-bottom:0;">
    ${cols.map(c => `
      <div style="flex:1;background:${c.bg};border:1px solid ${c.br};border-radius:5px;
                  padding:10px 8px;text-align:center;">
        <div style="font-size:22px;font-weight:800;color:${c.c};line-height:1;margin-bottom:3px;">${c.count}</div>
        <div style="font-size:8px;font-weight:700;color:${c.c};text-transform:uppercase;letter-spacing:0.08em;">${c.label}</div>
        <div style="font-size:7.5px;color:${c.c};opacity:0.65;margin-top:2px;">findings</div>
      </div>`).join("")}
  </div>`;
}

// ─── Finding row ──────────────────────────────────────────────────────────────
function findingRow(f: ReportFinding, index: number): string {
  const sev    = f.severity ?? "low";
  const col    = riskColor(sev);
  const bg     = riskBg(sev);
  const border = riskBorder(sev);
  const badge  = RISK_BADGE_TEXT[sev] ?? "#374151";
  const status = f.status.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return `
  <div style="border:1px solid ${border};border-left:3px solid ${col};
              border-radius:5px;margin-bottom:8px;overflow:hidden;">
    <!-- Finding header -->
    <div style="background:${bg};padding:9px 13px 7px;
                display:flex;align-items:flex-start;gap:9px;">
      <!-- Index badge -->
      <div style="width:18px;height:18px;min-width:18px;background:${col};border-radius:3px;
                  display:flex;align-items:center;justify-content:center;margin-top:1px;flex-shrink:0;">
        <span style="font-size:8.5px;font-weight:800;color:white;">${index + 1}</span>
      </div>
      <div style="flex:1;min-width:0;">
        <!-- Title + badges -->
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin-bottom:4px;">
          <span style="font-size:11px;font-weight:700;color:#0F172A;">${f.title}</span>
          ${f.articleReference ? `<span style="font-size:8px;font-weight:700;color:${LEXIFY_INDIGO};
            background:#EEF2FF;border:1px solid #C7D2FE;padding:1px 5px;border-radius:3px;">
            ${f.articleReference}</span>` : ""}
          <span style="font-size:7.5px;font-weight:800;color:${badge};background:white;
                       border:1px solid ${border};padding:1px 6px;border-radius:3px;
                       text-transform:uppercase;letter-spacing:0.07em;">${riskLabel(sev)}</span>
          <span style="font-size:7.5px;color:#64748B;background:white;
                       border:1px solid #E2E8F0;padding:1px 6px;border-radius:3px;">${status}</span>
        </div>
        <!-- Description -->
        <p style="font-size:9.5px;color:#374151;margin:0;line-height:1.7;">${f.description}</p>
        ${f.evidence ? `<p style="font-size:8.5px;color:#64748B;font-style:italic;margin:4px 0 0;">
          <strong style="font-style:normal;color:#475569;">Evidence:</strong> ${f.evidence}</p>` : ""}
      </div>
    </div>
    <!-- Recommendation -->
    <div style="background:#FFFFFF;border-top:1px solid ${border};padding:7px 13px 7px 40px;">
      <p style="font-size:9.5px;color:#374151;margin:0;line-height:1.7;">
        <strong style="color:#475569;font-weight:600;">Recommendation:&nbsp;</strong>${f.recommendation}
      </p>
    </div>
  </div>`;
}

// ─── Recommendation block ─────────────────────────────────────────────────────
function recommendationBlock(rec: ReportRecommendation, counter: number): string {
  const col    = riskColor(rec.priority);
  const border = riskBorder(rec.priority);
  const badge  = RISK_BADGE_TEXT[rec.priority] ?? "#374151";
  const bg     = riskBg(rec.priority);

  return `
  <div style="border:1px solid #E2E8F0;border-radius:5px;margin-bottom:8px;overflow:hidden;">
    <div style="display:flex;align-items:center;gap:10px;padding:8px 13px;
                background:#F8FAFC;border-bottom:1px solid #E2E8F0;">
      <span style="font-size:9px;font-weight:700;color:#64748B;min-width:18px;">${counter}.</span>
      <span style="font-size:10.5px;font-weight:700;color:#0F172A;flex:1;">${rec.category}</span>
      <span style="font-size:7.5px;font-weight:800;color:${badge};background:${bg};
                   border:1px solid ${border};padding:2px 7px;border-radius:3px;
                   text-transform:uppercase;letter-spacing:0.07em;">${riskLabel(rec.priority)}</span>
    </div>
    <div style="padding:8px 13px 8px 40px;background:#FFFFFF;">
      ${rec.items.map(item => `
        <div style="display:flex;gap:8px;margin-bottom:4px;">
          <span style="color:${col};font-size:9px;font-weight:700;flex-shrink:0;margin-top:2px;">›</span>
          <p style="font-size:9.5px;color:#374151;margin:0;line-height:1.7;">${item}</p>
        </div>`).join("")}
    </div>
  </div>`;
}

// ─── Strengths / Green flags block ───────────────────────────────────────────
function strengthsBlock(strengths: string[]): string {
  return `
  <div style="background:#F0FDF4;border:1px solid #A7F3D0;border-radius:5px;
              padding:12px 14px;margin-bottom:0;">
    ${strengths.map(s => `
      <div style="display:flex;gap:8px;margin-bottom:4px;">
        <span style="color:#047857;font-weight:700;font-size:11px;flex-shrink:0;line-height:1.5;">✓</span>
        <p style="font-size:9.5px;color:#374151;margin:0;line-height:1.7;">${s}</p>
      </div>`).join("")}
  </div>`;
}

// ─── COVER PAGE ───────────────────────────────────────────────────────────────
function buildCoverPage(data: EnterpriseReportData, total: number): string {
  const riskCol = riskColor(data.overallRisk);
  const riskBg0 = riskBg(data.overallRisk);
  const riskBrd = riskBorder(data.overallRisk);

  const infoRows = [
    { label: "Generated On",    value: data.metadata.generatedOn  },
    { label: "Generated By",    value: data.metadata.generatedBy  },
    { label: "Assessment Type", value: data.metadata.assessmentType },
    { label: "Document",        value: data.metadata.documentName  },
    ...(data.additionalInfo ?? []),
  ];

  // Trim exec summary to keep cover well-balanced (~500 chars)
  const summaryText = data.executiveSummary.length > 480
    ? data.executiveSummary.slice(0, 480).replace(/\s\S*$/, "") + "…"
    : data.executiveSummary;

  const content = `
  <!-- ══ COVER HEADER ════════════════════════════════════════════════════ -->
  <div style="height:185px;background:linear-gradient(155deg,#0B1120 0%,#0F172A 45%,#162032 100%);
              position:relative;overflow:hidden;margin:0 -${MARGIN}px;padding:0 ${MARGIN}px;
              box-sizing:border-box;">
    <!-- Subtle texture circles -->
    <div style="position:absolute;right:-60px;top:-60px;width:260px;height:260px;
                border-radius:50%;background:rgba(79,70,229,0.06);pointer-events:none;"></div>
    <div style="position:absolute;left:-40px;bottom:-50px;width:180px;height:180px;
                border-radius:50%;background:rgba(33,117,217,0.05);pointer-events:none;"></div>
    <!-- Bottom rule -->
    <div style="position:absolute;bottom:0;left:0;right:0;height:2px;
                background:linear-gradient(90deg,${LEXIFY_INDIGO} 0%,${RANDSTAD_BLUE} 60%,transparent 100%);"></div>

    <!-- Branding bar -->
    <div style="display:flex;align-items:flex-start;justify-content:space-between;padding-top:24px;">
      <!-- Lexify: icon + wordmark + tagline -->
      <div style="display:flex;align-items:center;gap:11px;">
        ${lexifyLogoImg(42, 42, "border-radius:10px;")}
        <div style="line-height:1.1;">
          <div style="font-size:18px;font-weight:800;color:#FFFFFF;letter-spacing:-0.02em;">Lexify AI</div>
          <div style="font-size:8px;font-weight:500;color:rgba(255,255,255,0.4);
                      text-transform:uppercase;letter-spacing:0.16em;margin-top:2px;">
            AI Privacy &amp; Compliance Platform
          </div>
        </div>
      </div>
      <!--Randstad -->
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;padding-top:4px;">
        <span style="font-size:7.5px;font-weight:500;color:rgba(255,255,255,0.38);
                     text-transform:uppercase;letter-spacing:0.16em;"></span>
        <div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);
                    border-radius:6px;padding:8px 14px;display:flex;align-items:center;gap:0;">
          ${randstadLogoImg(88, 26)}
        </div>
      </div>
    </div>

    <!-- Report title block -->
    <div style="margin-top:18px;">
      <div style="font-size:8.5px;font-weight:700;color:rgba(165,180,252,0.8);
                  text-transform:uppercase;letter-spacing:0.18em;margin-bottom:6px;">
        ${data.metadata.assessmentType}
      </div>
      <div style="font-size:22px;font-weight:800;color:#FFFFFF;letter-spacing:-0.02em;line-height:1.15;">
        ${data.metadata.reportTitle}
      </div>
      <div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:5px;letter-spacing:0.03em;">
        ${data.metadata.generatedOn}
      </div>
    </div>
  </div>

  <!-- ══ REPORT INFORMATION + OVERALL RISK ════════════════════════════════ -->
  <div style="margin:0 -${MARGIN}px;padding:0 ${MARGIN}px;background:#FFFFFF;
              border-bottom:1px solid #E2E8F0;box-sizing:border-box;">
    <div style="display:flex;align-items:stretch;gap:0;padding:14px 0;">
      <!-- Info table -->
      <div style="flex:1;padding-right:18px;border-right:1px solid #F1F5F9;">
        <div style="font-size:8px;font-weight:700;color:#94A3B8;text-transform:uppercase;
                    letter-spacing:0.14em;margin-bottom:7px;">Report Information</div>
        <table style="width:100%;border-collapse:collapse;">
          ${infoRows.map((r, i) => infoTableRow(r.label, r.value, i === infoRows.length - 1)).join("")}
        </table>
      </div>
      <!-- Overall Risk gauge -->
      <div style="width:140px;flex-shrink:0;display:flex;flex-direction:column;
                  align-items:center;justify-content:center;gap:5px;padding-left:18px;">
        <div style="font-size:8px;font-weight:700;color:#94A3B8;text-transform:uppercase;
                    letter-spacing:0.14em;text-align:center;">Overall Risk</div>
        ${scoreGaugeSVG(data.overallScore, data.overallRisk, 82)}
        <div style="background:${riskBg0};border:1px solid ${riskBrd};border-radius:4px;
                    padding:3px 12px;text-align:center;">
          <span style="font-size:10px;font-weight:800;color:${riskCol};">${riskLabel(data.overallRisk)} Risk</span>
        </div>
        <div style="font-size:8.5px;color:#64748B;font-weight:500;">${data.overallScore} / 100</div>
      </div>
    </div>
  </div>

  <!-- ══ EXECUTIVE SUMMARY ════════════════════════════════════════════════ -->
  ${sectionHeading("Executive Summary")}
  <div style="background:#F8FAFC;border-left:3px solid ${LEXIFY_INDIGO};
              border-radius:0 4px 4px 0;padding:11px 14px;margin-bottom:14px;">
    <p style="font-size:10px;color:#334155;line-height:1.8;margin:0;">${summaryText}</p>
  </div>

  <!-- ══ OVERALL RISK OVERVIEW ════════════════════════════════════════════ -->
  ${sectionHeading("Overall Risk Overview")}
  ${overallScoreTable(data)}`;

  return pageShell(content, 1, total, true);
}

// ─── Content block type ───────────────────────────────────────────────────────
interface ContentBlock {
  html: string;
  estimatedH: number;
}

// ─── Build all content blocks for pages 2+ ───────────────────────────────────
// ─── Consent Impact Section (Enterprise cookie scanner) ──────────────────────

function buildConsentImpactBlocks(data: EnterpriseReportData): ContentBlock[] {
  const cc = data.consentComparison;
  if (!cc) return [];

  const blocks: ContentBlock[] = [];
  const isPass = cc.complianceSummary.startsWith("PASS");
  const verdictColor  = isPass ? "#047857" : "#B91C1C";
  const verdictBg     = isPass ? "#F0FDF4" : "#FEF2F2";
  const verdictBorder = isPass ? "#A7F3D0" : "#FECACA";
  const verdictLabel  = isPass ? "PASS" : "FAIL";

  const acceptDelta = cc.acceptCount - cc.preConsentCount;
  const rejectDelta = cc.rejectCount - cc.preConsentCount;
  const fmtDelta    = (d: number) => (d >= 0 ? `+${d}` : `${d}`);

  blocks.push({ html: sectionHeading("Consent Impact Analysis"), estimatedH: 32 });

  // ── Metrics grid ────────────────────────────────────────────────────────────
  const metricCell = (label: string, value: string, sub = "", warn = false) => `
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:5px;padding:10px 12px;">
      <div style="font-size:8.5px;font-weight:600;color:#64748B;text-transform:uppercase;
                  letter-spacing:0.09em;margin-bottom:5px;">${label}</div>
      <div style="font-size:16px;font-weight:800;color:${warn ? "#B45309" : "#0F172A"};line-height:1;">${value}</div>
      ${sub ? `<div style="font-size:8px;color:#94A3B8;margin-top:3px;">${sub}</div>` : ""}
    </div>`;

  blocks.push({
    html: `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;">
        ${metricCell("Before Consent",  `${cc.preConsentCount}`, "cookies")}
        ${metricCell("After Accept",    `${cc.acceptCount}`, `${fmtDelta(acceptDelta)} from baseline`, acceptDelta > 0)}
        ${metricCell("After Reject",    `${cc.rejectCount}`, `${fmtDelta(rejectDelta)} from baseline`)}
        ${metricCell("Added on Accept", `${cc.addedAfterAccept.length}`, "new cookies", cc.addedAfterAccept.length > 0)}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">
        ${metricCell("Marketing Enabled (Accept)", `${cc.marketingEnabledAfterAccept.length}`, "cookies", cc.marketingEnabledAfterAccept.length > 0)}
        ${metricCell("Analytics Enabled (Accept)", `${cc.analyticsEnabledAfterAccept.length}`, "cookies", cc.analyticsEnabledAfterAccept.length > 0)}
        ${metricCell("Persist after Reject", `${cc.stillPresentAfterReject.length}`, "non-essential", cc.stillPresentAfterReject.length > 0)}
      </div>`,
    estimatedH: 130,
  });

  // ── Compliance verdict ───────────────────────────────────────────────────────
  blocks.push({
    html: `
      <div style="background:${verdictBg};border:1px solid ${verdictBorder};border-radius:5px;
                  padding:10px 14px;margin-bottom:12px;display:flex;align-items:flex-start;gap:12px;">
        <div style="background:${verdictColor};color:#fff;font-size:9px;font-weight:800;
                    padding:3px 8px;border-radius:4px;flex-shrink:0;margin-top:1px;">${verdictLabel}</div>
        <p style="font-size:9.5px;color:#1E293B;margin:0;line-height:1.7;">${cc.complianceSummary}</p>
      </div>`,
    estimatedH: 56,
  });

  // ── Cookie tables ────────────────────────────────────────────────────────────
  const miniTable = (title: string, items: typeof cc.addedAfterAccept, color: string) => {
    if (!items.length) return "";
    const rows = items.slice(0, 10).map(c =>
      `<tr>
        <td style="padding:4px 8px;font-size:8.5px;font-family:monospace;color:#0F172A;">${c.name}</td>
        <td style="padding:4px 8px;font-size:8px;color:#64748B;">${c.category}</td>
        <td style="padding:4px 8px;font-size:8px;color:#64748B;">${c.partyType}</td>
       </tr>`
    ).join("");
    const overflow = items.length > 10
      ? `<tr><td colspan="3" style="padding:4px 8px;font-size:8px;color:#94A3B8;text-align:center;">+${items.length - 10} more</td></tr>`
      : "";
    return `
      <div style="margin-bottom:10px;">
        <div style="font-size:8.5px;font-weight:700;color:${color};text-transform:uppercase;
                    letter-spacing:0.09em;margin-bottom:5px;">${title} (${items.length})</div>
        <div style="border:1px solid #E2E8F0;border-radius:4px;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#F8FAFC;">
                <th style="padding:4px 8px;text-align:left;font-size:7.5px;color:#94A3B8;font-weight:600;text-transform:uppercase;">Cookie</th>
                <th style="padding:4px 8px;text-align:left;font-size:7.5px;color:#94A3B8;font-weight:600;text-transform:uppercase;">Category</th>
                <th style="padding:4px 8px;text-align:left;font-size:7.5px;color:#94A3B8;font-weight:600;text-transform:uppercase;">Party</th>
              </tr>
            </thead>
            <tbody>${rows}${overflow}</tbody>
          </table>
        </div>
      </div>`;
  };

  const tables = [
    miniTable("Cookies added after Accept",         cc.addedAfterAccept,              "#B45309"),
    miniTable("Marketing enabled after Accept",     cc.marketingEnabledAfterAccept,   "#9A3412"),
    miniTable("Analytics enabled after Accept",     cc.analyticsEnabledAfterAccept,   "#1D4ED8"),
    miniTable("Non-essential cookies after Reject", cc.stillPresentAfterReject,       "#B91C1C"),
    miniTable("Blocked by Reject (removed)",        cc.removedAfterReject,            "#047857"),
  ].filter(Boolean).join("");

  if (tables) {
    blocks.push({
      html: `<div style="margin-bottom:14px;">${tables}</div>`,
      estimatedH: Math.min(
        (cc.addedAfterAccept.length + cc.marketingEnabledAfterAccept.length +
         cc.analyticsEnabledAfterAccept.length + cc.stillPresentAfterReject.length +
         cc.removedAfterReject.length) * 16 + 80,
        400
      ),
    });
  }

  return blocks;
}

function buildContentBlocks(data: EnterpriseReportData): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Full executive summary (if truncated on cover)
  if (data.executiveSummary.length > 480) {
    blocks.push({ html: sectionHeading("Executive Summary (continued)"), estimatedH: 32 });
    blocks.push({
      html: `<div style="background:#F8FAFC;border-left:3px solid ${LEXIFY_INDIGO};
                        border-radius:0 4px 4px 0;padding:11px 14px;margin-bottom:14px;">
               <p style="font-size:10px;color:#334155;line-height:1.8;margin:0;">${data.executiveSummary}</p>
             </div>`,
      estimatedH: Math.max(60, Math.ceil(data.executiveSummary.length / 96) * 18 + 28),
    });
  }

  // Assessment Summary table (additional metadata)
  if ((data.additionalInfo ?? []).length > 0) {
    blocks.push({ html: sectionHeading("Assessment Summary"), estimatedH: 32 });
    const rows = (data.additionalInfo ?? []).map((r, i, arr) =>
      infoTableRow(r.label, r.value, i === arr.length - 1)
    ).join("");
    blocks.push({
      html: `<div style="border:1px solid #E2E8F0;border-radius:5px;overflow:hidden;margin-bottom:14px;">
               <table style="width:100%;border-collapse:collapse;padding:4px 14px;">
                 <tbody style="padding:4px 14px;">${rows}</tbody>
               </table>
             </div>`,
      estimatedH: (data.additionalInfo!.length) * 28 + 24,
    });
  }

  // Green Flags / Strengths
  if (data.strengths.length > 0) {
    blocks.push({ html: sectionHeading("Positive Findings"), estimatedH: 32 });
    blocks.push({
      html: strengthsBlock(data.strengths) + `<div style="margin-bottom:14px;"></div>`,
      estimatedH: data.strengths.length * 22 + 36,
    });
  }

  // Score Breakdown
  if (data.scoreBreakdown.length > 0) {
    blocks.push({ html: sectionHeading("Score Breakdown"), estimatedH: 32 });
    const half  = Math.ceil(data.scoreBreakdown.length / 2);
    const left  = data.scoreBreakdown.slice(0, half);
    const right = data.scoreBreakdown.slice(half);
    blocks.push({
      html: `<div style="border:1px solid #E2E8F0;border-radius:5px;overflow:hidden;margin-bottom:14px;background:#FFFFFF;">
               <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px;padding:12px 16px;">
                 <table style="border-collapse:collapse;width:100%;">
                   <tbody>${left.map(i => scoreTableRow(i.label, i.score)).join("")}</tbody>
                 </table>
                 <table style="border-collapse:collapse;width:100%;">
                   <tbody>${right.map(i => scoreTableRow(i.label, i.score)).join("")}</tbody>
                 </table>
               </div>
             </div>`,
      estimatedH: half * 26 + 32,
    });
  }

  // Findings by severity
  const severityGroups = [
    { sev: "critical", label: "Critical Risk Findings"   },
    { sev: "high",     label: "High Risk Findings"       },
    { sev: "medium",   label: "Medium Risk Findings"     },
    { sev: "low",      label: "Low Risk / Passed Checks" },
  ];

  let hasFindingsHeader = false;
  for (const g of severityGroups) {
    const items = data.findings.filter(f => (f.severity ?? "low") === g.sev);
    if (!items.length) continue;

    if (!hasFindingsHeader) {
      blocks.push({ html: sectionHeading("Risk Findings"), estimatedH: 32 });
      hasFindingsHeader = true;
    }

    // Sub-group label
    blocks.push({
      html: `<div style="display:flex;align-items:center;gap:7px;margin:6px 0 5px;">
               <div style="width:6px;height:6px;border-radius:50%;background:${riskColor(g.sev)};flex-shrink:0;"></div>
               <span style="font-size:9px;font-weight:700;color:${riskColor(g.sev)};
                            text-transform:uppercase;letter-spacing:0.09em;">
                 ${g.label} (${items.length})
               </span>
             </div>`,
      estimatedH: 24,
    });

    items.forEach((f, i) => {
      const descLines = Math.ceil(f.description.length / 96);
      const recLines  = Math.ceil(f.recommendation.length / 96);
      const evLines   = f.evidence ? Math.ceil(f.evidence.length / 110) : 0;
      blocks.push({
        html:        findingRow(f, i),
        estimatedH:  72 + (descLines + recLines + evLines) * 16,
      });
    });
  }

  // Recommendations
  if (data.recommendations.length > 0) {
    blocks.push({ html: sectionHeading("Recommendations"), estimatedH: 32 });
    const sorted = [...data.recommendations].sort((a, b) => {
      const o: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (o[a.priority] ?? 4) - (o[b.priority] ?? 4);
    });
    sorted.forEach((rec, idx) => {
      blocks.push({
        html:        recommendationBlock(rec, idx + 1),
        estimatedH:  rec.items.length * 22 + 46,
      });
    });
  }

  // Consent Impact Analysis (Enterprise cookie scanner only)
  if (data.consentComparison) {
    buildConsentImpactBlocks(data).forEach(b => blocks.push(b));
  }

  // Conclusion
  const riskCol    = riskColor(data.overallRisk);
  const riskBg0    = riskBg(data.overallRisk);
  const riskBrd0   = riskBorder(data.overallRisk);
  const actionText =
    data.overallRisk === "critical"
      ? "Immediate remediation is required. All critical findings must be resolved before this vendor or system proceeds to production."
      : data.overallRisk === "high"
      ? "Significant issues require prompt attention. A formal remediation plan should be established and actioned within 30 days."
      : data.overallRisk === "medium"
      ? "Moderate risk profile identified. Recommended improvements should be scheduled and tracked within 60–90 days."
      : "Low risk profile confirmed. Continue periodic monitoring and maintain current compliance standards.";

  blocks.push({ html: sectionHeading("Conclusion"), estimatedH: 32 });
  blocks.push({
    html: `
    <div style="background:${riskBg0};border:1px solid ${riskBrd0};border-radius:5px;
                padding:13px 15px;margin-bottom:10px;">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="width:36px;height:36px;min-width:36px;background:${riskCol};border-radius:6px;
                    display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:13px;font-weight:800;color:white;">${data.overallScore}</span>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#0F172A;margin-bottom:4px;">
            Overall Assessment: <span style="color:${riskCol};">${riskLabel(data.overallRisk)} Risk</span>
            &nbsp;·&nbsp; Score: ${data.overallScore} / 100
          </div>
          <p style="font-size:9.5px;color:#374151;margin:0;line-height:1.7;">${actionText}</p>
        </div>
      </div>
    </div>
    <p style="font-size:8.5px;color:#94A3B8;margin:8px 0 0;font-style:italic;line-height:1.7;">
      This report was automatically generated by Lexify AI Privacy &amp; Compliance Platform on behalf of Randstad Digital.
      All findings are based on AI analysis and must be reviewed by qualified compliance or legal personnel before
      any remediation action is taken.
    </p>`,
    estimatedH: 140,
  });

  return blocks;
}

// ─── Pagination engine ────────────────────────────────────────────────────────
function estimateTotalPages(blocks: ContentBlock[]): number {
  let pages = 1;
  let used  = 0;
  for (const block of blocks) {
    if (used + block.estimatedH > CONTENT_PAGE_H && used > 0) { pages++; used = 0; }
    used += block.estimatedH;
  }
  if (used > 0) pages++;
  return pages;
}

function paginateBlocks(
  data: EnterpriseReportData,
  blocks: ContentBlock[],
  total: number
): string[] {
  const pages: string[] = [];
  pages.push(buildCoverPage(data, total));

  let pageNum    = 2;
  let pageChunks: ContentBlock[] = [];
  let used       = 0;

  for (const block of blocks) {
    const fits = used + block.estimatedH <= CONTENT_PAGE_H;
    if (!fits && pageChunks.length > 0) {
      pages.push(
        pageShell(
          `<div style="padding-top:${MARGIN}px;">${pageChunks.map(b => b.html).join("")}</div>`,
          pageNum, total
        )
      );
      pageNum++;
      pageChunks = [];
      used = 0;
    }
    pageChunks.push(block);
    used += block.estimatedH;
  }
  if (pageChunks.length > 0) {
    pages.push(
      pageShell(
        `<div style="padding-top:${MARGIN}px;">${pageChunks.map(b => b.html).join("")}</div>`,
        pageNum, total
      )
    );
  }
  return pages;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export interface ReportPages {
  pages: string[];
  totalPages: number;
}

/**
 * Builds the complete enterprise report as an array of A4-page HTML strings.
 * Requires preloadLogos() to have been called first (done in generateEnterpriseReport).
 */
export function buildReportPages(data: EnterpriseReportData): ReportPages {
  const blocks     = buildContentBlocks(data);
  const totalPages = estimateTotalPages(blocks);
  const pages      = paginateBlocks(data, blocks, totalPages);
  return { pages, totalPages };
}
