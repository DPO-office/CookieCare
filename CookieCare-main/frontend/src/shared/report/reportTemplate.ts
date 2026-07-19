/**
 * Enterprise Report Template — Premium Consulting Grade
 *
 * Design reference: Microsoft Purview · OneTrust · TrustArc · BigID aesthetics.
 * Architecture: Fixed-height A4 pages (794 × 1123 px @ 96 dpi),
 * each captured independently by html2canvas — no mid-element page breaks.
 *
 * Typography: Inter variable font loaded from /fonts/ for premium rendering.
 * Branding: Lexify AI (primary platform) · Randstad Digital (client logo asset)
 *
 * Report identity accents:
 *   DPA Review    → Indigo   (#4F46E5)
 *   Vendor Review → Blue     (#1D4ED8) / Amber (#D97706)
 *   AI Ethics     → Teal     (#0D9488)
 *   (others retain existing palette)
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CONTENT_W         = A4_W_PX - MARGIN * 2;  // 698px — available for future use
const HEADER_H          = 56;
const FOOTER_H          = 38;
const CONTENT_PAGE_H    = A4_H_PX - HEADER_H - FOOTER_H - MARGIN * 2;

// ─── Base font stack (Inter loaded from /public/fonts) ────────────────────────
const FONT = `'Inter','Segoe UI',Helvetica,Arial,sans-serif`;

// ─── Risk palette ─────────────────────────────────────────────────────────────
const RISK_COLOR: Record<string, string>  = { critical:"#B91C1C", high:"#C2410C", medium:"#B45309", low:"#047857" };
const RISK_BG: Record<string, string>     = { critical:"#FEF2F2", high:"#FFF7ED", medium:"#FFFBEB", low:"#F0FDF4" };
const RISK_BORDER: Record<string, string> = { critical:"#FECACA", high:"#FED7AA", medium:"#FDE68A", low:"#A7F3D0" };
const RISK_BADGE_BG: Record<string, string> = { critical:"#FEE2E2", high:"#FFEDD5", medium:"#FEF3C7", low:"#D1FAE5" };
const RISK_BADGE_TEXT: Record<string, string> = { critical:"#991B1B", high:"#9A3412", medium:"#92400E", low:"#065F46" };

function riskColor(r: string)     { return RISK_COLOR[r]      ?? "#64748B"; }
function riskBg(r: string)        { return RISK_BG[r]         ?? "#F8FAFC"; }
function riskBorder(r: string)    { return RISK_BORDER[r]     ?? "#E2E8F0"; }
function riskBadgeBg(r: string)   { return RISK_BADGE_BG[r]   ?? "#F1F5F9"; }
function riskBadgeText(r: string) { return RISK_BADGE_TEXT[r] ?? "#374151"; }
function riskLabel(r: string)     { return r.charAt(0).toUpperCase() + r.slice(1); }

// ─── Report identity accent (per report type) ─────────────────────────────────
function reportAccent(reportTitle: string): string {
  if (reportTitle.toLowerCase().includes("dpa"))    return "#4F46E5"; // Indigo
  if (reportTitle.toLowerCase().includes("vendor")) return "#1D4ED8"; // Blue
  if (reportTitle.toLowerCase().includes("ethics")) return "#0D9488"; // Teal
  return LEXIFY_INDIGO;
}

function reportAccentLight(reportTitle: string): string {
  if (reportTitle.toLowerCase().includes("dpa"))    return "#EEF2FF";
  if (reportTitle.toLowerCase().includes("vendor")) return "#EFF6FF";
  if (reportTitle.toLowerCase().includes("ethics")) return "#F0FDFA";
  return "#EEF2FF";
}

function reportAccentBorder(reportTitle: string): string {
  if (reportTitle.toLowerCase().includes("dpa"))    return "#C7D2FE";
  if (reportTitle.toLowerCase().includes("vendor")) return "#BFDBFE";
  if (reportTitle.toLowerCase().includes("ethics")) return "#99F6E4";
  return "#C7D2FE";
}

// ─── @font-face injection for Inter ───────────────────────────────────────────
const FONT_FACE_CSS = `
  @font-face {
    font-family: 'Inter';
    src: url('/fonts/Inter-VariableFont_slnt,wght.ttf') format('truetype');
    font-weight: 100 900;
    font-style: normal;
  }
`;

// ─── Logo helpers ─────────────────────────────────────────────────────────────
function lexifyLogoImg(width: number, height: number, style = ""): string {
  const src = getLexifyLogoB64() ?? LEXIFY_SHIELD_SVG;
  return `<img src="${src}" width="${width}" height="${height}" alt="Lexify AI"
               style="object-fit:contain;display:block;${style}"/>`;
}

function randstadLogoImg(width: number, height: number, style = ""): string {
  const src = getRandstadLogoB64() ?? RANDSTAD_WORDMARK_SVG;
  return `<img src="${src}" width="${width}" height="${height}" alt="Randstad Digital"
               style="object-fit:contain;display:block;${style}"/>`;
}

// ─── Page shell ───────────────────────────────────────────────────────────────
// Returns a self-contained div (not a full HTML document) so it can be safely
// injected via innerHTML into a container div for html2canvas capture.
// The @font-face <style> block is included inline so the browser loads Inter
// even inside an off-screen container.
function pageShell(content: string, pageNum: number, totalPages: number, reportTitle: string, isFirstPage = false): string {
  const accent = reportAccent(reportTitle);
  const headerHtml = isFirstPage ? "" : runningHeader(accent);
  return `
<style>${FONT_FACE_CSS}*{box-sizing:border-box;margin:0;padding:0;}</style>
<div style="width:${A4_W_PX}px;height:${A4_H_PX}px;background:#FFFFFF;position:relative;
            overflow:hidden;font-family:${FONT};">
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
function runningHeader(accent: string): string {
  return `
  <div style="position:absolute;top:0;left:0;right:0;height:${HEADER_H}px;
              background:#FFFFFF;border-bottom:2px solid #E8EDF4;
              display:flex;align-items:center;justify-content:space-between;
              padding:0 ${MARGIN}px;">
    <!-- Left: Lexify logo + wordmark -->
    <div style="display:flex;align-items:center;gap:10px;">
      ${lexifyLogoImg(28, 28, "border-radius:6px;flex-shrink:0;")}
      <div>
        <div style="font-size:11.5px;font-weight:700;color:#0F172A;letter-spacing:-0.02em;font-family:${FONT};">Lexify AI</div>
        <div style="font-size:7.5px;font-weight:500;color:#94A3B8;text-transform:uppercase;letter-spacing:0.12em;margin-top:1px;font-family:${FONT};">Privacy &amp; Compliance Platform</div>
      </div>
    </div>
    <!-- Center: accent line indicator -->
    <div style="width:3px;height:22px;background:${accent};border-radius:2px;opacity:0.7;"></div>
    <!-- Right: Randstad Digital logo -->
    <div style="display:flex;align-items:center;">
      ${randstadLogoImg(110, 28, "display:block;")}
    </div>
  </div>`;
}

// ─── Page footer ──────────────────────────────────────────────────────────────
function pageFooter(pageNum: number, totalPages: number): string {
  const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return `
  <div style="height:${FOOTER_H}px;background:#F8FAFC;border-top:1.5px solid #E2E8F0;
              display:flex;align-items:center;justify-content:space-between;
              padding:0 ${MARGIN}px;font-family:${FONT};">
    <!-- Left: Platform + Confidentiality -->
    <div style="display:flex;align-items:center;gap:12px;">
      <span style="font-size:8px;font-weight:600;color:#64748B;letter-spacing:0.01em;">Lexify AI Privacy &amp; Compliance Platform</span>
      <span style="width:3px;height:3px;border-radius:50%;background:#CBD5E1;display:inline-block;"></span>
      <span style="font-size:8px;font-weight:700;color:#94A3B8;letter-spacing:0.06em;text-transform:uppercase;
                   background:#F1F5F9;border:1px solid #E2E8F0;padding:1.5px 7px;border-radius:3px;">CONFIDENTIAL</span>
    </div>
    <!-- Right: Date + Page -->
    <div style="display:flex;align-items:center;gap:12px;">
      <span style="font-size:8px;color:#94A3B8;font-weight:500;">${date}</span>
      <span style="width:3px;height:3px;border-radius:50%;background:#CBD5E1;display:inline-block;"></span>
      <span style="font-size:8.5px;font-weight:700;color:#475569;letter-spacing:0.03em;
                   background:#EFF3F8;border:1px solid #DDE5EF;padding:1.5px 8px;border-radius:3px;">
        ${pageNum} / ${totalPages}
      </span>
    </div>
  </div>`;
}

// ─── Section heading ──────────────────────────────────────────────────────────
function sectionHeading(title: string, accent: string): string {
  return `
  <div style="display:flex;align-items:center;gap:10px;margin:22px 0 13px;">
    <div style="width:3px;height:16px;background:${accent};border-radius:2px;flex-shrink:0;"></div>
    <span style="font-size:10px;font-weight:800;color:#0F172A;text-transform:uppercase;
                 letter-spacing:0.16em;white-space:nowrap;font-family:${FONT};">${title}</span>
    <div style="flex:1;height:1px;background:linear-gradient(90deg,#CBD5E1 0%,#F1F5F9 100%);"></div>
  </div>`;
}

// ─── Info table ───────────────────────────────────────────────────────────────
function infoTableRow(label: string, value: string, isLast = false): string {
  const border = isLast ? "" : "border-bottom:1px solid #F1F5F9;";
  return `
  <tr>
    <td style="font-size:8px;font-weight:700;color:#94A3B8;text-transform:uppercase;
               letter-spacing:0.1em;padding:6px 16px 6px 0;white-space:nowrap;
               ${border}vertical-align:top;width:32%;font-family:${FONT};">${label}</td>
    <td style="font-size:10px;font-weight:500;color:#1E293B;padding:6px 0;
               ${border}line-height:1.55;font-family:${FONT};">${value}</td>
  </tr>`;
}

// ─── Score gauge SVG ──────────────────────────────────────────────────────────
function scoreGaugeSVG(score: number, risk: string, accent: string, size = 104): string {
  const col      = riskColor(risk);
  const r        = (size / 2) - 14;
  const circ     = 2 * Math.PI * r;
  const arcLen   = circ * 0.75;
  const fill     = (score / 100) * arcLen;
  const cx       = size / 2;
  const cy       = size / 2;
  const trackCol = risk === "critical" ? "#FEE2E2" : risk === "high" ? "#FFEDD5" : risk === "medium" ? "#FEF3C7" : "#D1FAE5";

  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <!-- Outer ring -->
    <circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="none" stroke="#F1F5F9" stroke-width="1.5"/>
    <!-- Track arc (75% of circle, starting from bottom-left) -->
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${trackCol}" stroke-width="11"
      stroke-dasharray="${arcLen.toFixed(1)} ${(circ - arcLen).toFixed(1)}"
      stroke-linecap="round"
      transform="rotate(135 ${cx} ${cy})"/>
    <!-- Progress arc -->
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="11"
      stroke-dasharray="${fill.toFixed(1)} ${(circ - fill).toFixed(1)}"
      stroke-linecap="round"
      transform="rotate(135 ${cx} ${cy})"/>
    <!-- Score text -->
    <text x="${cx}" y="${cy + 2}" text-anchor="middle"
          font-family="${FONT}"
          font-size="${Math.round(size * 0.25)}" font-weight="800" fill="#0F172A">${score}</text>
    <text x="${cx}" y="${cy + Math.round(size * 0.145)}" text-anchor="middle"
          font-family="${FONT}" font-size="${Math.round(size * 0.095)}" fill="#94A3B8" font-weight="600">/100</text>
  </svg>`;
}

// ─── Score table row ──────────────────────────────────────────────────────────
function scoreTableRow(label: string, score: number): string {
  const col     = score >= 70 ? "#047857" : score >= 50 ? "#B45309" : "#B91C1C";
  const bgBar   = score >= 70 ? "#D1FAE5" : score >= 50 ? "#FEF3C7" : "#FEE2E2";
  const fillBar = score >= 70 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444";
  return `
  <tr>
    <td style="font-size:9.5px;color:#374151;font-weight:500;padding:7px 14px 7px 0;
               border-bottom:1px solid #F9FAFB;vertical-align:middle;width:44%;font-family:${FONT};">${label}</td>
    <td style="padding:7px 10px 7px 0;border-bottom:1px solid #F9FAFB;vertical-align:middle;width:46%;">
      <div style="height:5px;background:${bgBar};border-radius:3px;overflow:hidden;">
        <div style="height:5px;width:${score}%;background:${fillBar};border-radius:3px;"></div>
      </div>
    </td>
    <td style="font-size:9.5px;font-weight:700;color:${col};text-align:right;
               padding:7px 0;border-bottom:1px solid #F9FAFB;vertical-align:middle;white-space:nowrap;width:10%;
               font-family:${FONT};">${score}</td>
  </tr>`;
}

// ─── Risk overview cards ──────────────────────────────────────────────────────
function overallScoreTable(data: EnterpriseReportData): string {
  const crit = data.findings.filter(f => f.severity === "critical").length;
  const high = data.findings.filter(f => f.severity === "high").length;
  const med  = data.findings.filter(f => f.severity === "medium").length;
  const low  = data.findings.filter(f => f.severity === "low").length;

  const cols = [
    { label: "Critical", count: crit, c: RISK_COLOR.critical, bg: RISK_BG.critical,  br: RISK_BORDER.critical  },
    { label: "High",     count: high, c: RISK_COLOR.high,     bg: RISK_BG.high,      br: RISK_BORDER.high      },
    { label: "Medium",   count: med,  c: RISK_COLOR.medium,   bg: RISK_BG.medium,    br: RISK_BORDER.medium    },
    { label: "Low",      count: low,  c: RISK_COLOR.low,      bg: RISK_BG.low,       br: RISK_BORDER.low       },
  ];

  return `
  <div style="display:flex;gap:10px;margin-bottom:0;">
    ${cols.map(c => `
      <div style="flex:1;background:${c.bg};border:1.5px solid ${c.br};border-radius:8px;
                  padding:14px 10px 12px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:${c.c};line-height:1;margin-bottom:5px;
                    letter-spacing:-0.03em;font-family:${FONT};">${c.count}</div>
        <div style="font-size:7.5px;font-weight:800;color:${c.c};text-transform:uppercase;
                    letter-spacing:0.12em;margin-bottom:2px;font-family:${FONT};">${c.label}</div>
        <div style="font-size:7px;color:${c.c};opacity:0.55;letter-spacing:0.02em;font-family:${FONT};">findings</div>
      </div>`).join("")}
  </div>`;
}

// ─── Finding row ──────────────────────────────────────────────────────────────
function findingRow(f: ReportFinding, index: number): string {
  const sev    = f.severity ?? "low";
  const col    = riskColor(sev);
  const bg     = riskBg(sev);
  const border = riskBorder(sev);
  const bBg    = riskBadgeBg(sev);
  const bText  = riskBadgeText(sev);
  const status = f.status.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return `
  <div style="border:1px solid ${border};border-left:4px solid ${col};
              border-radius:8px;margin-bottom:10px;overflow:hidden;background:#FFFFFF;">
    <!-- Header band -->
    <div style="background:${bg};padding:11px 14px 10px;
                display:flex;align-items:flex-start;gap:11px;">
      <!-- Index badge -->
      <div style="width:22px;height:22px;min-width:22px;background:${col};border-radius:5px;
                  display:flex;align-items:center;justify-content:center;margin-top:1px;flex-shrink:0;">
        <span style="font-size:9px;font-weight:800;color:white;line-height:1;font-family:${FONT};">${index + 1}</span>
      </div>
      <div style="flex:1;min-width:0;">
        <!-- Title + badges row -->
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
          <span style="font-size:11px;font-weight:700;color:#0F172A;line-height:1.3;font-family:${FONT};">${f.title}</span>
          ${f.articleReference ? `
            <span style="font-size:7.5px;font-weight:700;color:#4F46E5;
              background:#EEF2FF;border:1px solid #C7D2FE;padding:2px 6px;border-radius:4px;
              white-space:nowrap;font-family:${FONT};">${f.articleReference}</span>` : ""}
          <span style="font-size:7.5px;font-weight:800;color:${bText};background:${bBg};
                       border:1px solid ${border};padding:2px 7px;border-radius:4px;
                       text-transform:uppercase;letter-spacing:0.09em;white-space:nowrap;font-family:${FONT};">${riskLabel(sev)}</span>
          <span style="font-size:7.5px;color:#64748B;background:white;
                       border:1px solid #E2E8F0;padding:2px 7px;border-radius:4px;
                       white-space:nowrap;font-family:${FONT};">${status}</span>
        </div>
        <!-- Description -->
        <p style="font-size:9.5px;color:#374151;margin:0;line-height:1.75;font-family:${FONT};">${f.description}</p>
        ${f.evidence ? `
          <div style="margin-top:7px;padding:6px 10px;background:rgba(255,255,255,0.6);
                      border:1px solid ${border};border-radius:5px;">
            <span style="font-size:8px;font-weight:700;color:#475569;font-family:${FONT};">Evidence: </span>
            <span style="font-size:8.5px;color:#64748B;font-style:italic;line-height:1.65;font-family:${FONT};">${f.evidence}</span>
          </div>` : ""}
      </div>
    </div>
    <!-- Recommendation stripe -->
    <div style="background:#FAFBFC;border-top:1px solid ${border};padding:9px 14px 9px 47px;">
      <div style="display:flex;align-items:flex-start;gap:7px;">
        <span style="font-size:9px;font-weight:700;color:#475569;flex-shrink:0;margin-top:0.5px;font-family:${FONT};">Recommendation:</span>
        <p style="font-size:9.5px;color:#374151;margin:0;line-height:1.72;font-family:${FONT};">${f.recommendation}</p>
      </div>
    </div>
  </div>`;
}

// ─── Recommendation block ─────────────────────────────────────────────────────
function recommendationBlock(rec: ReportRecommendation, counter: number): string {
  const col    = riskColor(rec.priority);
  const border = riskBorder(rec.priority);
  const bBg    = riskBadgeBg(rec.priority);
  const bText  = riskBadgeText(rec.priority);
  const bg     = riskBg(rec.priority);

  return `
  <div style="border:1px solid #E2E8F0;border-radius:8px;margin-bottom:10px;overflow:hidden;background:#FFFFFF;">
    <div style="display:flex;align-items:center;gap:11px;padding:10px 14px;
                background:#F8FAFC;border-bottom:1px solid #E8EDF4;">
      <span style="font-size:9px;font-weight:800;color:#94A3B8;min-width:20px;flex-shrink:0;font-family:${FONT};">${counter}.</span>
      <span style="font-size:10.5px;font-weight:700;color:#0F172A;flex:1;line-height:1.3;font-family:${FONT};">${rec.category}</span>
      <span style="font-size:7.5px;font-weight:800;color:${bText};background:${bBg};
                   border:1px solid ${border};padding:2.5px 8px;border-radius:4px;
                   text-transform:uppercase;letter-spacing:0.09em;white-space:nowrap;font-family:${FONT};">${riskLabel(rec.priority)}</span>
    </div>
    <div style="padding:10px 14px 10px 45px;background:#FFFFFF;">
      ${rec.items.map(item => `
        <div style="display:flex;gap:8px;margin-bottom:5px;align-items:flex-start;">
          <span style="color:${col};font-size:11px;font-weight:700;flex-shrink:0;line-height:1.6;font-family:${FONT};">›</span>
          <p style="font-size:9.5px;color:#374151;margin:0;line-height:1.75;font-family:${FONT};">${item}</p>
        </div>`).join("")}
    </div>
  </div>`;
}

// ─── Strengths block ──────────────────────────────────────────────────────────
function strengthsBlock(strengths: string[]): string {
  return `
  <div style="background:#F0FDF4;border:1.5px solid #A7F3D0;border-radius:8px;
              padding:14px 16px 12px;margin-bottom:0;">
    ${strengths.map(s => `
      <div style="display:flex;gap:9px;margin-bottom:6px;align-items:flex-start;">
        <span style="color:#059669;font-weight:800;font-size:11px;flex-shrink:0;line-height:1.6;font-family:${FONT};">✓</span>
        <p style="font-size:9.5px;color:#065F46;margin:0;line-height:1.75;font-family:${FONT};">${s}</p>
      </div>`).join("")}
  </div>`;
}

// ─── COVER PAGE ───────────────────────────────────────────────────────────────
function buildCoverPage(data: EnterpriseReportData, total: number): string {
  const accent        = reportAccent(data.metadata.reportTitle);
  const accentLight   = reportAccentLight(data.metadata.reportTitle);
  const accentBorder  = reportAccentBorder(data.metadata.reportTitle);
  const riskCol  = riskColor(data.overallRisk);
  const riskBg0  = riskBg(data.overallRisk);
  const riskBrd  = riskBorder(data.overallRisk);
  const riskBBg  = riskBadgeBg(data.overallRisk);
  const riskBTxt = riskBadgeText(data.overallRisk);

  const infoRows = [
    { label: "Generated On",    value: data.metadata.generatedOn   },
    { label: "Generated By",    value: data.metadata.generatedBy   },
    { label: "Assessment Type", value: data.metadata.assessmentType },
    { label: "Document",        value: data.metadata.documentName   },
    ...(data.additionalInfo ?? []),
  ];

  const summaryText = data.executiveSummary.length > 520
    ? data.executiveSummary.slice(0, 520).replace(/\s\S*$/, "") + "…"
    : data.executiveSummary;

  const content = `
  <!-- ══ COVER HEADER ════════════════════════════════════════════════════ -->
  <div style="height:208px;background:linear-gradient(145deg,#06091A 0%,#0F172A 45%,#111827 100%);
              position:relative;overflow:hidden;margin:0 -${MARGIN}px;padding:0 ${MARGIN}px;">
    <!-- Subtle geometric accent shapes -->
    <div style="position:absolute;right:-60px;top:-90px;width:320px;height:320px;
                border-radius:50%;background:${accent};opacity:0.06;pointer-events:none;"></div>
    <div style="position:absolute;left:-40px;bottom:-70px;width:240px;height:240px;
                border-radius:50%;background:${RANDSTAD_BLUE};opacity:0.05;pointer-events:none;"></div>
    <!-- Bottom accent line -->
    <div style="position:absolute;bottom:0;left:0;right:0;height:3px;
                background:linear-gradient(90deg,${accent} 0%,${RANDSTAD_BLUE} 50%,transparent 100%);"></div>

    <!-- ── Top branding bar ── -->
    <div style="display:flex;align-items:flex-start;justify-content:space-between;padding-top:28px;">
      <!-- Lexify: icon + wordmark + tagline -->
      <div style="display:flex;align-items:center;gap:13px;">
        ${lexifyLogoImg(44, 44, "border-radius:10px;flex-shrink:0;")}
        <div>
          <div style="font-size:18px;font-weight:800;color:#FFFFFF;letter-spacing:-0.025em;font-family:${FONT};">Lexify AI</div>
          <div style="font-size:7.5px;font-weight:500;color:rgba(255,255,255,0.38);
                      text-transform:uppercase;letter-spacing:0.18em;margin-top:3px;font-family:${FONT};">
            AI Privacy &amp; Compliance Platform
          </div>
        </div>
      </div>
      <!-- Randstad Digital logo pill -->
      <div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);
                  border-radius:8px;padding:10px 16px;display:flex;align-items:center;
                  justify-content:center;margin-top:2px;">
        ${randstadLogoImg(120, 30, "display:block;")}
      </div>
    </div>

    <!-- ── Report identity ── -->
    <div style="margin-top:22px;">
      <div style="display:inline-block;font-size:8px;font-weight:700;color:${accent};opacity:0.85;
                  text-transform:uppercase;letter-spacing:0.22em;margin-bottom:8px;
                  background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
                  padding:3px 10px;border-radius:3px;font-family:${FONT};">
        ${data.metadata.assessmentType}
      </div>
      <div style="font-size:24px;font-weight:800;color:#FFFFFF;letter-spacing:-0.03em;line-height:1.15;font-family:${FONT};">
        ${data.metadata.reportTitle}
      </div>
      <div style="font-size:9px;color:rgba(255,255,255,0.30);margin-top:7px;letter-spacing:0.04em;font-family:${FONT};">
        ${data.metadata.generatedOn}
      </div>
    </div>
  </div>

  <!-- ══ REPORT INFO + SCORE GAUGE ════════════════════════════════════════ -->
  <div style="margin:0 -${MARGIN}px;padding:0 ${MARGIN}px;background:#FFFFFF;
              border-bottom:1.5px solid #E8EDF4;">
    <div style="display:flex;align-items:stretch;gap:0;padding:16px 0 14px;">
      <!-- Left: Info table -->
      <div style="flex:1;padding-right:24px;border-right:1.5px solid #F1F5F9;">
        <div style="font-size:7.5px;font-weight:800;color:#94A3B8;text-transform:uppercase;
                    letter-spacing:0.14em;margin-bottom:10px;font-family:${FONT};">Report Information</div>
        <table style="width:100%;border-collapse:collapse;">
          ${infoRows.map((r, i) => infoTableRow(r.label, r.value, i === infoRows.length - 1)).join("")}
        </table>
      </div>
      <!-- Right: Score gauge -->
      <div style="width:160px;flex-shrink:0;display:flex;flex-direction:column;
                  align-items:center;justify-content:center;gap:8px;padding-left:24px;">
        <div style="font-size:7.5px;font-weight:800;color:#94A3B8;text-transform:uppercase;
                    letter-spacing:0.14em;text-align:center;font-family:${FONT};">Compliance Score</div>
        ${scoreGaugeSVG(data.overallScore, data.overallRisk, accent, 96)}
        <div style="background:${riskBBg};border:1.5px solid ${riskBrd};border-radius:5px;
                    padding:4px 16px;text-align:center;margin-top:1px;">
          <span style="font-size:10.5px;font-weight:800;color:${riskBTxt};font-family:${FONT};">${riskLabel(data.overallRisk)} Risk</span>
        </div>
        <div style="font-size:8.5px;color:#64748B;font-weight:600;letter-spacing:0.02em;font-family:${FONT};">${data.overallScore} / 100</div>
      </div>
    </div>
  </div>

  <!-- ══ EXECUTIVE SUMMARY ════════════════════════════════════════════════ -->
  ${sectionHeading("Executive Summary", accent)}
  <div style="background:${accentLight};border-left:4px solid ${accent};
              border-radius:0 7px 7px 0;padding:14px 18px;margin-bottom:18px;
              border:1px solid ${accentBorder};border-left:4px solid ${accent};">
    <p style="font-size:10px;color:#1E293B;line-height:1.85;margin:0;font-family:${FONT};">${summaryText}</p>
  </div>

  <!-- ══ OVERALL RISK OVERVIEW ════════════════════════════════════════════ -->
  ${sectionHeading("Risk Overview", accent)}
  ${overallScoreTable(data)}`;

  return pageShell(content, 1, total, data.metadata.reportTitle, true);
}

// ─── Content block type ───────────────────────────────────────────────────────
interface ContentBlock {
  html: string;
  estimatedH: number;
}

// ─── Consent Impact Section (Enterprise cookie scanner only) ──────────────────
function buildConsentImpactBlocks(data: EnterpriseReportData, accent: string): ContentBlock[] {
  const cc = data.consentComparison;
  if (!cc) return [];

  const blocks: ContentBlock[] = [];
  const isPass = cc.complianceSummary.startsWith("PASS");
  const verdictColor  = isPass ? "#047857" : "#B91C1C";
  const verdictBg     = isPass ? "#F0FDF4"  : "#FEF2F2";
  const verdictBorder = isPass ? "#A7F3D0" : "#FECACA";
  const verdictLabel  = isPass ? "PASS" : "FAIL";

  const acceptDelta = cc.acceptCount - cc.preConsentCount;
  const rejectDelta = cc.rejectCount - cc.preConsentCount;
  const fmtDelta    = (d: number) => (d >= 0 ? `+${d}` : `${d}`);

  blocks.push({ html: sectionHeading("Consent Impact Analysis", accent), estimatedH: 34 });

  const metricCell = (label: string, value: string, sub = "", warn = false) => `
    <div style="background:#F8FAFC;border:1.5px solid #E8EDF4;border-radius:7px;padding:11px 13px;">
      <div style="font-size:8px;font-weight:700;color:#64748B;text-transform:uppercase;
                  letter-spacing:0.1em;margin-bottom:5px;font-family:${FONT};">${label}</div>
      <div style="font-size:17px;font-weight:800;color:${warn ? "#B45309" : "#0F172A"};line-height:1;
                  letter-spacing:-0.02em;font-family:${FONT};">${value}</div>
      ${sub ? `<div style="font-size:7.5px;color:#94A3B8;margin-top:3px;font-weight:500;font-family:${FONT};">${sub}</div>` : ""}
    </div>`;

  blocks.push({
    html: `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:12px;">
        ${metricCell("Before Consent",  `${cc.preConsentCount}`, "cookies")}
        ${metricCell("After Accept",    `${cc.acceptCount}`, `${fmtDelta(acceptDelta)} from baseline`, acceptDelta > 0)}
        ${metricCell("After Reject",    `${cc.rejectCount}`, `${fmtDelta(rejectDelta)} from baseline`)}
        ${metricCell("Added on Accept", `${cc.addedAfterAccept.length}`, "new cookies", cc.addedAfterAccept.length > 0)}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:12px;">
        ${metricCell("Marketing Enabled (Accept)", `${cc.marketingEnabledAfterAccept.length}`, "cookies", cc.marketingEnabledAfterAccept.length > 0)}
        ${metricCell("Analytics Enabled (Accept)", `${cc.analyticsEnabledAfterAccept.length}`, "cookies", cc.analyticsEnabledAfterAccept.length > 0)}
        ${metricCell("Persist after Reject", `${cc.stillPresentAfterReject.length}`, "non-essential", cc.stillPresentAfterReject.length > 0)}
      </div>`,
    estimatedH: 135,
  });

  blocks.push({
    html: `
      <div style="background:${verdictBg};border:1.5px solid ${verdictBorder};border-radius:7px;
                  padding:11px 15px;margin-bottom:12px;display:flex;align-items:flex-start;gap:12px;">
        <div style="background:${verdictColor};color:#fff;font-size:8.5px;font-weight:800;
                    padding:3.5px 10px;border-radius:4px;flex-shrink:0;margin-top:1px;
                    letter-spacing:0.05em;font-family:${FONT};">${verdictLabel}</div>
        <p style="font-size:9.5px;color:#1E293B;margin:0;line-height:1.78;font-family:${FONT};">${cc.complianceSummary}</p>
      </div>`,
    estimatedH: 58,
  });

  const miniTable = (title: string, items: typeof cc.addedAfterAccept, color: string) => {
    if (!items.length) return "";
    const rows = items.slice(0, 10).map(c =>
      `<tr>
        <td style="padding:4.5px 9px;font-size:8.5px;font-family:monospace;color:#0F172A;">${c.name}</td>
        <td style="padding:4.5px 9px;font-size:8px;color:#64748B;font-family:${FONT};">${c.category}</td>
        <td style="padding:4.5px 9px;font-size:8px;color:#64748B;font-family:${FONT};">${c.partyType}</td>
       </tr>`
    ).join("");
    const overflow = items.length > 10
      ? `<tr><td colspan="3" style="padding:4.5px 9px;font-size:8px;color:#94A3B8;text-align:center;font-family:${FONT};">+${items.length - 10} more</td></tr>`
      : "";
    return `
      <div style="margin-bottom:12px;">
        <div style="font-size:8px;font-weight:800;color:${color};text-transform:uppercase;
                    letter-spacing:0.1em;margin-bottom:6px;font-family:${FONT};">${title} (${items.length})</div>
        <div style="border:1.5px solid #E8EDF4;border-radius:6px;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#F8FAFC;">
                <th style="padding:5px 9px;text-align:left;font-size:7.5px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;font-family:${FONT};">Cookie</th>
                <th style="padding:5px 9px;text-align:left;font-size:7.5px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;font-family:${FONT};">Category</th>
                <th style="padding:5px 9px;text-align:left;font-size:7.5px;color:#94A3B8;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;font-family:${FONT};">Party</th>
              </tr>
            </thead>
            <tbody>${rows}${overflow}</tbody>
          </table>
        </div>
      </div>`;
  };

  const tables = [
    miniTable("Cookies added after Accept",         cc.addedAfterAccept,            "#B45309"),
    miniTable("Marketing enabled after Accept",     cc.marketingEnabledAfterAccept, "#9A3412"),
    miniTable("Analytics enabled after Accept",     cc.analyticsEnabledAfterAccept, "#1D4ED8"),
    miniTable("Non-essential cookies after Reject", cc.stillPresentAfterReject,     "#B91C1C"),
    miniTable("Blocked by Reject (removed)",        cc.removedAfterReject,          "#047857"),
  ].filter(Boolean).join("");

  if (tables) {
    blocks.push({
      html: `<div style="margin-bottom:14px;">${tables}</div>`,
      estimatedH: Math.min(
        (cc.addedAfterAccept.length + cc.marketingEnabledAfterAccept.length +
         cc.analyticsEnabledAfterAccept.length + cc.stillPresentAfterReject.length +
         cc.removedAfterReject.length) * 17 + 84,
        400
      ),
    });
  }

  return blocks;
}

// ─── Build all content blocks for pages 2+ ───────────────────────────────────
function buildContentBlocks(data: EnterpriseReportData): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const accent       = reportAccent(data.metadata.reportTitle);
  const accentLight  = reportAccentLight(data.metadata.reportTitle);
  const accentBorder = reportAccentBorder(data.metadata.reportTitle);

  // Full executive summary continued (if truncated on cover)
  if (data.executiveSummary.length > 520) {
    blocks.push({ html: sectionHeading("Executive Summary (continued)", accent), estimatedH: 34 });
    blocks.push({
      html: `<div style="background:${accentLight};border-left:4px solid ${accent};
                        border-radius:0 7px 7px 0;padding:14px 18px;margin-bottom:18px;
                        border:1px solid ${accentBorder};border-left:4px solid ${accent};">
               <p style="font-size:10px;color:#1E293B;line-height:1.85;margin:0;font-family:${FONT};">${data.executiveSummary}</p>
             </div>`,
      estimatedH: Math.max(64, Math.ceil(data.executiveSummary.length / 90) * 19 + 30),
    });
  }

  // Assessment Summary table
  if ((data.additionalInfo ?? []).length > 0) {
    blocks.push({ html: sectionHeading("Assessment Summary", accent), estimatedH: 34 });
    const rows = (data.additionalInfo ?? []).map((r, i, arr) =>
      infoTableRow(r.label, r.value, i === arr.length - 1)
    ).join("");
    blocks.push({
      html: `<div style="border:1.5px solid #E8EDF4;border-radius:8px;overflow:hidden;margin-bottom:18px;">
               <table style="width:100%;border-collapse:collapse;padding:4px 16px;">
                 <tbody style="padding:4px 16px;">${rows}</tbody>
               </table>
             </div>`,
      estimatedH: (data.additionalInfo!.length) * 30 + 26,
    });
  }

  // Green Flags / Strengths
  if (data.strengths.length > 0) {
    blocks.push({ html: sectionHeading("Positive Findings", accent), estimatedH: 34 });
    blocks.push({
      html: strengthsBlock(data.strengths) + `<div style="margin-bottom:18px;"></div>`,
      estimatedH: data.strengths.length * 24 + 38,
    });
  }

  // Score Breakdown
  if (data.scoreBreakdown.length > 0) {
    blocks.push({ html: sectionHeading("Score Breakdown", accent), estimatedH: 34 });
    const half  = Math.ceil(data.scoreBreakdown.length / 2);
    const left  = data.scoreBreakdown.slice(0, half);
    const right = data.scoreBreakdown.slice(half);
    blocks.push({
      html: `<div style="border:1.5px solid #E8EDF4;border-radius:8px;overflow:hidden;margin-bottom:18px;background:#FFFFFF;">
               <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 28px;padding:14px 18px;">
                 <table style="border-collapse:collapse;width:100%;">
                   <tbody>${left.map(i => scoreTableRow(i.label, i.score)).join("")}</tbody>
                 </table>
                 <table style="border-collapse:collapse;width:100%;">
                   <tbody>${right.map(i => scoreTableRow(i.label, i.score)).join("")}</tbody>
                 </table>
               </div>
             </div>`,
      estimatedH: half * 28 + 34,
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
      blocks.push({ html: sectionHeading("Risk Findings", accent), estimatedH: 34 });
      hasFindingsHeader = true;
    }

    // Sub-group label
    blocks.push({
      html: `<div style="display:flex;align-items:center;gap:8px;margin:10px 0 7px;">
               <div style="width:6px;height:6px;border-radius:50%;background:${riskColor(g.sev)};flex-shrink:0;"></div>
               <span style="font-size:9px;font-weight:800;color:${riskColor(g.sev)};
                            text-transform:uppercase;letter-spacing:0.1em;font-family:${FONT};">
                 ${g.label} (${items.length})
               </span>
               <div style="flex:1;height:1px;background:${riskBorder(g.sev)};opacity:0.7;margin-left:4px;"></div>
             </div>`,
      estimatedH: 28,
    });

    items.forEach((f, i) => {
      const descLines = Math.ceil(f.description.length / 90);
      const recLines  = Math.ceil(f.recommendation.length / 90);
      const evLines   = f.evidence ? Math.ceil(f.evidence.length / 105) : 0;
      blocks.push({
        html:        findingRow(f, i),
        estimatedH:  78 + (descLines + recLines + evLines) * 17,
      });
    });
  }

  // Recommendations
  if (data.recommendations.length > 0) {
    blocks.push({ html: sectionHeading("Recommendations", accent), estimatedH: 34 });
    const sorted = [...data.recommendations].sort((a, b) => {
      const o: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (o[a.priority] ?? 4) - (o[b.priority] ?? 4);
    });
    sorted.forEach((rec, idx) => {
      blocks.push({
        html:        recommendationBlock(rec, idx + 1),
        estimatedH:  rec.items.length * 24 + 50,
      });
    });
  }

  // Consent Impact Analysis (Enterprise cookie scanner only)
  if (data.consentComparison) {
    buildConsentImpactBlocks(data, accent).forEach(b => blocks.push(b));
  }

  // Conclusion
  const riskCol   = riskColor(data.overallRisk);
  const riskBg0   = riskBg(data.overallRisk);
  const riskBrd0  = riskBorder(data.overallRisk);
  const actionText =
    data.overallRisk === "critical"
      ? "Immediate remediation is required. All critical findings must be resolved before this system or agreement proceeds further."
      : data.overallRisk === "high"
      ? "Significant issues require prompt attention. A formal remediation plan should be established and actioned within 30 days."
      : data.overallRisk === "medium"
      ? "Moderate risk profile identified. Recommended improvements should be scheduled and tracked within 60–90 days."
      : "Low risk profile confirmed. Continue periodic monitoring and maintain current compliance standards.";

  blocks.push({ html: sectionHeading("Conclusion", accent), estimatedH: 34 });
  blocks.push({
    html: `
    <div style="background:${riskBg0};border:1.5px solid ${riskBrd0};border-radius:8px;
                padding:16px 18px;margin-bottom:14px;">
      <div style="display:flex;align-items:flex-start;gap:14px;">
        <div style="width:42px;height:42px;min-width:42px;background:${riskCol};border-radius:8px;
                    display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:14px;font-weight:800;color:white;letter-spacing:-0.02em;font-family:${FONT};">${data.overallScore}</span>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#0F172A;margin-bottom:6px;line-height:1.3;font-family:${FONT};">
            Overall Assessment: <span style="color:${riskCol};">${riskLabel(data.overallRisk)} Risk</span>
            &nbsp;·&nbsp; Score: ${data.overallScore} / 100
          </div>
          <p style="font-size:9.5px;color:#374151;margin:0;line-height:1.78;font-family:${FONT};">${actionText}</p>
        </div>
      </div>
    </div>
    <p style="font-size:8.5px;color:#94A3B8;margin:10px 0 0;font-style:italic;line-height:1.75;font-family:${FONT};">
      This report was automatically generated by Lexify AI Privacy &amp; Compliance Platform on behalf of Randstad Digital.
      All findings are based on AI analysis and must be reviewed by qualified compliance or legal personnel before
      any remediation action is taken.
    </p>`,
    estimatedH: 148,
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
          pageNum, total, data.metadata.reportTitle
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
        pageNum, total, data.metadata.reportTitle
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
