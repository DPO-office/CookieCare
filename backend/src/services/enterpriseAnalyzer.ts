/**
 * Enterprise Intelligence Layer for the Cookie / Privacy Scanner.
 *
 * Receives the raw scan evidence already collected by ScannerService and:
 *   1. Runs a deep enterprise AI analysis (evidence-grounded, no fabrication)
 *   2. Computes deterministic weighted risk scores
 *   3. Generates an executive summary
 *   4. Produces prioritised recommendations
 *   5. Enriches the final report structure
 *   6. Emits structured logs (never logs cookie values)
 *
 * IMPORTANT — this module MUST NOT:
 *   - Modify the browser scanning pipeline
 *   - Modify cookie collection
 *   - Modify technology detection
 *   - Modify consent analysis
 *   - Modify compliance evaluation
 *   - Modify the job queue or SSE
 */

import { openRouterComplete } from "./openRouterClient.js";
import type {
  ConsentBannerAnalysis,
  CMPDetectionResult,
  RegulationEvaluation,
  ConsentQuality,
  ConsentQualityFinding,
} from "./consentAnalyzer.js";
import type { DetectedTechnology } from "./technologyDetector.js";

// ─── Input / Output Types ────────────────────────────────────────────────────

export interface EnterpriseAnalysisInput {
  url: string;
  scanLevel: string;
  pagesScanned: number;
  cookiesDetected: any[];
  technologiesDetected: DetectedTechnology[];
  consentBannerAnalysis: ConsentBannerAnalysis;
  cmpDetection: CMPDetectionResult;
  complianceEvaluations: RegulationEvaluation[];
  consentQuality: ConsentQuality;
  privacyPolicyUrl: string | null;
  cookiePolicyUrl: string | null;
  hasConsentBanner: boolean;
  loadsBeforeConsent: boolean;
  totalCookiesCount: number;
  aiSummary: string | undefined;
  scannedAt: string;
  /** Cookie names captured before any consent interaction */
  preConsentCookieNames?: string[];
  /** Cookie names captured after user accepted consent */
  postAcceptCookieNames?: string[];
  /** Cookie names captured after user rejected consent */
  postRejectCookieNames?: string[];
}

export interface WeightedRiskScores {
  overallScore: number;
  privacyScore: number;
  consentScore: number;
  complianceScore: number;
  technologyScore: number;
  riskLevel: "Low" | "Medium" | "High" | "Critical";
  confidenceScore: number;
}

export interface EnterpriseRecommendation {
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  evidence: string;
  regulation?: string;
}

export interface EnterpriseAIAnalysis {
  privacyPosture: string;
  trackingBehaviour: string;
  thirdPartyExposure: string;
  highRiskCookies: string;
  technologyRisks: string;
  consentImplementationQuality: string;
  regulatoryRisks: string;
  businessImpact: string;
}

// ─── Consent Comparison ──────────────────────────────────────────────────────

export interface ConsentComparisonCookie {
  name: string;
  category: string;
  domain: string;
  severity: string;
  partyType: string;
}

export interface ConsentComparison {
  preConsentCount: number;
  acceptCount: number;
  rejectCount: number;
  addedAfterAccept: ConsentComparisonCookie[];
  removedAfterReject: ConsentComparisonCookie[];
  marketingEnabledAfterAccept: ConsentComparisonCookie[];
  analyticsEnabledAfterAccept: ConsentComparisonCookie[];
  stillPresentAfterReject: ConsentComparisonCookie[];
  complianceSummary: string;
}

export interface EnterpriseReport {
  executiveSummary: string;
  riskScores: WeightedRiskScores;
  aiAnalysis: EnterpriseAIAnalysis;
  consentComparison: ConsentComparison;
  cookieInventory: {
    total: number;
    firstParty: number;
    thirdParty: number;
    byCategory: Record<string, number>;
    highRisk: string[];
    preConsentCount: number;
  };
  technologyInventory: {
    total: number;
    highRisk: string[];
    byCategory: Record<string, number>;
  };
  consentAnalysisSummary: {
    bannerDetected: boolean;
    cmpName: string | null;
    cmpConfidence: number;
    hasRejectButton: boolean;
    hasCustomizeButton: boolean;
    cookiesBeforeConsent: boolean;
    defaultConsentState: string;
    equalProminence: boolean | "unknown";
    consentQualityScore: number;
  };
  complianceSummary: Array<{
    regulation: string;
    status: string;
    score: number;
    criticalFindings: number;
  }>;
  consentQualityFindings: ConsentQualityFinding[];
  keyFindings: string[];
  recommendations: {
    high: EnterpriseRecommendation[];
    medium: EnterpriseRecommendation[];
    low: EnterpriseRecommendation[];
  };
  immediateActions: string[];
  confidenceLevel: number;
  generatedAt: string;
}

// ─── Weighted Risk Engine ────────────────────────────────────────────────────
// Deterministic scoring — AI explanations do NOT influence numeric values.

export function computeWeightedRiskScores(input: EnterpriseAnalysisInput): WeightedRiskScores {
  const cookies = input.cookiesDetected;
  const banner = input.consentBannerAnalysis;
  const quality = input.consentQuality;
  const techs = input.technologiesDetected;
  const compliance = input.complianceEvaluations;

  // ── Privacy Score (0–100) ─────────────────────────────────────────────────
  let privacyScore = 100;
  const thirdPartyCookies = cookies.filter((c: any) => c.partyType === "third-party").length;
  const marketingCookies = cookies.filter((c: any) =>
    ["Marketing", "Advertising", "marketing", "advertising"].includes(c.category)
  ).length;
  const highRiskCookies = cookies.filter((c: any) => c.severity === "HIGH").length;

  privacyScore -= Math.min(thirdPartyCookies * 3, 25);   // up to -25 for 3rd party
  privacyScore -= Math.min(marketingCookies * 4, 20);    // up to -20 for marketing
  privacyScore -= Math.min(highRiskCookies * 3, 15);     // up to -15 for high-risk
  if (!input.privacyPolicyUrl) privacyScore -= 15;
  if (!input.cookiePolicyUrl)  privacyScore -= 10;
  privacyScore = Math.max(0, Math.min(100, privacyScore));

  // ── Consent Score (0–100) ─────────────────────────────────────────────────
  let consentScore = 100;
  const qf = quality?.findings ?? [];

  const cookiesBeforeConsent = qf.find(f => f.issue === "cookies_before_consent")?.detected ?? false;
  const thirdPartyBeforeConsent = qf.find(f => f.issue === "third_party_cookies_before_consent")?.detected ?? false;
  const marketingBeforeConsent = qf.find(f => f.issue === "marketing_cookies_before_consent")?.detected ?? false;
  const missingReject = qf.find(f => f.issue === "missing_reject_button")?.detected ?? false;
  const missingCustomize = qf.find(f => f.issue === "missing_customize_option")?.detected ?? false;
  const missingCookiePolicy = qf.find(f => f.issue === "missing_cookie_policy")?.detected ?? false;
  const missingPrivacyPolicy = qf.find(f => f.issue === "missing_privacy_policy")?.detected ?? false;

  if (cookiesBeforeConsent)    consentScore -= 25;
  if (thirdPartyBeforeConsent) consentScore -= 20;
  if (marketingBeforeConsent)  consentScore -= 20;
  if (missingReject)           consentScore -= 15;
  if (missingCustomize)        consentScore -= 10;
  if (missingCookiePolicy)     consentScore -= 5;
  if (missingPrivacyPolicy)    consentScore -= 10;
  if (!banner.bannerDetected)  consentScore -= 25;
  consentScore = Math.max(0, Math.min(100, consentScore));

  // ── Compliance Score (0–100) ──────────────────────────────────────────────
  let complianceScore = 0;
  if (compliance.length > 0) {
    complianceScore = Math.round(
      compliance.reduce((sum, r) => sum + r.score, 0) / compliance.length
    );
  }

  // ── Technology Score (0–100) ──────────────────────────────────────────────
  let technologyScore = 100;
  const HIGH_RISK_TECH_CATEGORIES = [
    "advertising", "tracking", "fingerprinting", "session-recording",
    "data-broker", "retargeting", "cross-site-tracking",
  ];
  const highRiskTechs = techs.filter((t: DetectedTechnology) =>
    HIGH_RISK_TECH_CATEGORIES.some(cat =>
      (t.category ?? "").toLowerCase().includes(cat)
    )
  );
  technologyScore -= Math.min(highRiskTechs.length * 8, 40);

  // Additional deduction for trackers loaded before consent
  if (input.loadsBeforeConsent) technologyScore -= 20;
  technologyScore = Math.max(0, Math.min(100, technologyScore));

  // ── Compliance finding deductions ─────────────────────────────────────────
  const allComplianceFindings = compliance.flatMap(r => r.findings);
  const criticalNonCompliant = allComplianceFindings.filter(
    f => f.severity === "critical" && f.status === "non_compliant"
  ).length;
  const highNonCompliant = allComplianceFindings.filter(
    f => f.severity === "high" && f.status === "non_compliant"
  ).length;

  // Weigh the four domain scores
  const overallScore = Math.round(
    privacyScore   * 0.25 +
    consentScore   * 0.30 +
    complianceScore * 0.30 +
    technologyScore * 0.15
  );

  // Deduct for critical non-compliant findings (capped at 15 pts)
  const adjustedOverall = Math.max(
    0,
    overallScore - Math.min(criticalNonCompliant * 5, 15) - Math.min(highNonCompliant * 2, 10)
  );

  const riskLevel: WeightedRiskScores["riskLevel"] =
    adjustedOverall >= 80 ? "Low"
    : adjustedOverall >= 55 ? "Medium"
    : adjustedOverall >= 30 ? "High"
    : "Critical";

  // Confidence: higher when more evidence is available
  const evidencePoints = [
    banner.bannerDetected,
    input.pagesScanned > 1,
    cookies.length > 0,
    techs.length > 0,
    compliance.length > 0,
    input.cmpDetection.detected,
  ].filter(Boolean).length;
  const confidenceScore = Math.round((evidencePoints / 6) * 100);

  return {
    overallScore: adjustedOverall,
    privacyScore,
    consentScore,
    complianceScore,
    technologyScore,
    riskLevel,
    confidenceScore,
  };
}

// ─── Evidence Summarizer ──────────────────────────────────────────────────────
// Builds a compact, token-efficient evidence brief for the AI prompt.
// Never includes cookie values — only names and metadata.

function buildEvidenceBrief(input: EnterpriseAnalysisInput): string {
  const cookies = input.cookiesDetected;
  const banner = input.consentBannerAnalysis;
  const cmp = input.cmpDetection;
  const quality = input.consentQuality;
  const techs = input.technologiesDetected;
  const compliance = input.complianceEvaluations;

  const thirdParty = cookies.filter((c: any) => c.partyType === "third-party");
  const marketing = cookies.filter((c: any) =>
    ["Marketing", "Advertising", "marketing", "advertising"].includes(c.category)
  );
  const highRisk = cookies.filter((c: any) => c.severity === "HIGH");
  const preConsentCount = quality?.findings?.find(f => f.issue === "cookies_before_consent")?.description ?? "";

  const byCategory: Record<string, number> = {};
  cookies.forEach((c: any) => {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
  });

  const lines: string[] = [
    `SCAN TARGET: ${input.url}`,
    `SCAN LEVEL: ${input.scanLevel} | PAGES SCANNED: ${input.pagesScanned} | SCANNED AT: ${input.scannedAt}`,
    "",
    "=== COOKIE INVENTORY ===",
    `Total cookies: ${cookies.length}`,
    `First-party: ${cookies.length - thirdParty.length} | Third-party: ${thirdParty.length}`,
    `Marketing/Advertising: ${marketing.length} | High-risk severity: ${highRisk.length}`,
    `By category: ${Object.entries(byCategory).map(([k, v]) => `${k}=${v}`).join(", ")}`,
    `High-risk cookie names (no values): ${highRisk.slice(0, 10).map((c: any) => c.name).join(", ") || "none"}`,
    `Third-party cookie names: ${thirdParty.slice(0, 10).map((c: any) => c.name).join(", ") || "none"}`,
    `Marketing cookie names: ${marketing.slice(0, 10).map((c: any) => c.name).join(", ") || "none"}`,
    "",
    "=== TECHNOLOGY INVENTORY ===",
    `Technologies detected: ${techs.length}`,
    ...techs.slice(0, 15).map((t: DetectedTechnology) =>
      `  - ${t.name} [${t.category ?? "unknown"}] confidence=${(t.confidence * 100).toFixed(0)}%`
    ),
    "",
    "=== CONSENT BANNER ===",
    `Banner detected: ${banner.bannerDetected}`,
    `Accept button: ${banner.acceptButtonFound} | Reject button: ${banner.rejectButtonFound}`,
    `Customize option: ${banner.customizeButtonFound} | Close button: ${banner.closeButtonFound}`,
    `Default consent state: ${banner.defaultConsentState}`,
    `Banner position: ${banner.bannerPosition}`,
    `Equal prominence (accept/reject): ${banner.equalProminence}`,
    `Cookies loaded before consent: ${banner.cookiesBeforeConsent}`,
    `Consent changes cookie behaviour: ${banner.consentChangesCookieBehaviour}`,
    `Banner evidence: ${(banner.evidence ?? []).slice(0, 5).join(" | ")}`,
  ];

  lines.push(
    "",
    "=== CMP DETECTION ===",
    `CMP detected: ${cmp.detected}`,
    `CMP name: ${cmp.name ?? "none"}`,
    `Detection confidence: ${(cmp.confidence * 100).toFixed(0)}%`,
    `Detection methods: ${(cmp.detectionMethod ?? []).join(", ") || "none"}`,
    `Evidence: ${(cmp.evidence ?? []).slice(0, 3).join(" | ")}`,
    "",
    "=== COMPLIANCE EVALUATIONS ===",
  );

  for (const reg of compliance) {
    const nonCompliant = reg.findings.filter(f => f.status === "non_compliant").length;
    const unverified = reg.findings.filter(f => f.status === "unable_to_verify").length;
    lines.push(
      `${reg.regulation}: status=${reg.overallStatus} score=${reg.score}/100 ` +
      `non_compliant=${nonCompliant} unverified=${unverified}`
    );
    reg.findings
      .filter(f => f.status === "non_compliant" || f.severity === "critical")
      .slice(0, 3)
      .forEach(f => lines.push(`  [${f.severity.toUpperCase()}] ${f.title}: ${f.finding.substring(0, 120)}`));
  }

  lines.push(
    "",
    "=== CONSENT QUALITY FINDINGS ===",
    `Consent quality score: ${quality?.overallScore ?? 0}/100`,
  );
  (quality?.findings ?? []).forEach(f =>
    lines.push(`  [${f.severity}] ${f.issue}: detected=${f.detected} — ${(f.description ?? "").substring(0, 100)}`)
  );

  lines.push(
    "",
    "=== COMPLIANCE PAGES ===",
    `Privacy policy: ${input.privacyPolicyUrl ?? "NOT FOUND"}`,
    `Cookie policy: ${input.cookiePolicyUrl ?? "NOT FOUND"}`,
  );

  return lines.join("\n");
}

// ─── Enterprise AI Analysis ───────────────────────────────────────────────────

const ENTERPRISE_AI_SYSTEM_PROMPT = `You are a Senior Privacy Counsel and Compliance Architect specialising in cookie law, GDPR, ePrivacy, CCPA, and digital privacy risk.

You will receive a structured evidence brief from an automated cookie and consent scanner. Your role is to reason deeply over the evidence and produce a comprehensive enterprise privacy assessment.

CRITICAL RULES:
1. Reason ONLY from the evidence provided. Do NOT fabricate cookies, technologies, or findings not present.
2. Every assertion must cite the specific evidence it is based on.
3. Explain WHY each finding is risky — business impact, regulatory consequence, and enforcement risk.
4. Return ONLY a valid JSON object — no markdown fences, no prose, no commentary.
5. If evidence is insufficient for a dimension, say so explicitly rather than guessing.

Return exactly this JSON schema:
{
  "privacyPosture": "2-4 sentence assessment of overall privacy posture grounded in cookie inventory and third-party exposure evidence",
  "trackingBehaviour": "Assessment of tracking behaviour: types of trackers found, their categories, and what they signal about data collection practices",
  "thirdPartyExposure": "Analysis of third-party cookie exposure: how many, which vendors, why each creates risk and who likely receives the data",
  "highRiskCookies": "Specific analysis of high-risk and marketing cookies detected: name each, explain why it is risky and what data it likely collects",
  "technologyRisks": "Analysis of tracking technologies detected: what they do, why they create privacy risk, and whether they appear to fire without consent",
  "consentImplementationQuality": "Evidence-based assessment of the consent implementation: banner quality, CMP presence, button configuration, pre-consent loading, and consent flow integrity",
  "regulatoryRisks": "Specific regulatory risks identified from the compliance evaluations: which regulations are most at risk, which findings are most severe, and what enforcement exposure exists",
  "businessImpact": "Business impact of identified issues: regulatory fines, reputational risk, operational remediation burden, and priority of action"
}`;

async function runEnterpriseAIAnalysis(
  evidenceBrief: string
): Promise<EnterpriseAIAnalysis> {
  const userPrompt = `[SCAN EVIDENCE BRIEF]\n${evidenceBrief}\n\nAnalyse the above evidence and return the structured enterprise privacy assessment JSON.`;

  let responseText: string;
  try {
    responseText = await openRouterComplete(ENTERPRISE_AI_SYSTEM_PROMPT, userPrompt, {
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 2048,
    });
  } catch (err) {
    console.error("[EnterpriseAnalyzer] AI analysis failed:", (err as Error).message);
    return buildFallbackAIAnalysis();
  }

  responseText = responseText.trim();
  if (responseText.startsWith("```")) {
    responseText = responseText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  try {
    const parsed = JSON.parse(responseText);
    return {
      privacyPosture:               String(parsed.privacyPosture ?? ""),
      trackingBehaviour:            String(parsed.trackingBehaviour ?? ""),
      thirdPartyExposure:           String(parsed.thirdPartyExposure ?? ""),
      highRiskCookies:              String(parsed.highRiskCookies ?? ""),
      technologyRisks:              String(parsed.technologyRisks ?? ""),
      consentImplementationQuality: String(parsed.consentImplementationQuality ?? ""),
      regulatoryRisks:              String(parsed.regulatoryRisks ?? ""),
      businessImpact:               String(parsed.businessImpact ?? ""),
    };
  } catch {
    console.warn("[EnterpriseAnalyzer] Failed to parse AI JSON — using fallback.");
    return buildFallbackAIAnalysis();
  }
}

function buildFallbackAIAnalysis(): EnterpriseAIAnalysis {
  return {
    privacyPosture: "AI analysis could not be completed. Manual review is recommended.",
    trackingBehaviour: "Unable to generate AI-powered tracking analysis. Refer to cookie inventory.",
    thirdPartyExposure: "Unable to generate AI-powered third-party analysis. Refer to cookie inventory.",
    highRiskCookies: "Unable to generate AI-powered cookie analysis. Refer to cookie inventory.",
    technologyRisks: "Unable to generate AI-powered technology analysis. Refer to technology inventory.",
    consentImplementationQuality: "Unable to generate AI-powered consent analysis. Refer to consent findings.",
    regulatoryRisks: "Unable to generate AI-powered compliance analysis. Refer to compliance evaluations.",
    businessImpact: "Unable to generate AI-powered business impact assessment. Manual review is recommended.",
  };
}

// ─── Inventory Builders ───────────────────────────────────────────────────────

function buildCookieInventory(input: EnterpriseAnalysisInput): EnterpriseReport["cookieInventory"] {
  const cookies = input.cookiesDetected;
  const firstParty = cookies.filter((c: any) => c.partyType === "first-party").length;
  const thirdParty = cookies.filter((c: any) => c.partyType === "third-party").length;

  const byCategory: Record<string, number> = {};
  cookies.forEach((c: any) => {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
  });

  const highRisk: string[] = cookies
    .filter((c: any) => c.severity === "HIGH")
    .slice(0, 20)
    .map((c: any) => c.name as string);

  // Pre-consent count from quality findings
  const preConsentFinding = (input.consentQuality?.findings ?? []).find(
    (f) => f.issue === "cookies_before_consent"
  );
  const preConsentCount = preConsentFinding?.detected
    ? (input.consentQuality?.findings ?? [])
        .filter((f) => f.issue === "cookies_before_consent" || f.issue === "third_party_cookies_before_consent")
        .length  // rough proxy — actual value is tracked in scannerService
    : 0;

  return {
    total: cookies.length,
    firstParty,
    thirdParty,
    byCategory,
    highRisk,
    preConsentCount,
  };
}

function buildTechnologyInventory(
  techs: DetectedTechnology[]
): EnterpriseReport["technologyInventory"] {
  const HIGH_RISK_CATEGORIES = new Set([
    "advertising", "tracking", "fingerprinting", "session-recording",
    "data-broker", "retargeting", "cross-site-tracking",
  ]);

  const byCategory: Record<string, number> = {};
  techs.forEach((t) => {
    const cat = t.category ?? "Unknown";
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  });

  const highRisk: string[] = techs
    .filter((t) =>
      HIGH_RISK_CATEGORIES.has((t.category ?? "").toLowerCase())
    )
    .map((t) => t.name);

  return { total: techs.length, highRisk, byCategory };
}

function buildConsentSummary(
  input: EnterpriseAnalysisInput
): EnterpriseReport["consentAnalysisSummary"] {
  const banner = input.consentBannerAnalysis;
  const cmp = input.cmpDetection;
  const quality = input.consentQuality;

  return {
    bannerDetected: banner.bannerDetected,
    cmpName: cmp.name ?? null,
    cmpConfidence: cmp.confidence,
    hasRejectButton: banner.rejectButtonFound,
    hasCustomizeButton: banner.customizeButtonFound,
    cookiesBeforeConsent: banner.cookiesBeforeConsent,
    defaultConsentState: banner.defaultConsentState,
    equalProminence: banner.equalProminence,
    consentQualityScore: quality?.overallScore ?? 0,
  };
}

function buildComplianceSummary(
  evaluations: import("./consentAnalyzer.js").RegulationEvaluation[]
): EnterpriseReport["complianceSummary"] {
  return evaluations.map((reg) => ({
    regulation: reg.regulation,
    status: reg.overallStatus,
    score: reg.score,
    criticalFindings: reg.findings.filter(
      (f) => f.severity === "critical" && f.status === "non_compliant"
    ).length,
  }));
}

// ─── Consent Comparison Builder ───────────────────────────────────────────────
// Pure comparison — uses cookies already collected by the scanner.
// No AI calls, no extra scans.

function buildConsentComparison(input: EnterpriseAnalysisInput): ConsentComparison {
  const allCookies: any[] = input.cookiesDetected;

  const preNames  = new Set(input.preConsentCookieNames  ?? []);
  const postAcceptNames = new Set(input.postAcceptCookieNames ?? []);
  const postRejectNames = new Set(input.postRejectCookieNames ?? []);

  // Helper: look up enriched cookie by name (first match wins)
  const byName = (name: string): ConsentComparisonCookie => {
    const c = allCookies.find((x: any) => x.name === name);
    return c
      ? { name: c.name, category: c.category ?? "Unclassified", domain: c.domain ?? "", severity: c.severity ?? "MEDIUM", partyType: c.partyType ?? "first-party" }
      : { name, category: "Unclassified", domain: "", severity: "MEDIUM", partyType: "first-party" };
  };

  const preConsentCount = preNames.size;
  const acceptCount     = postAcceptNames.size > 0 ? postAcceptNames.size : allCookies.length;
  const rejectCount     = postRejectNames.size > 0 ? postRejectNames.size : preNames.size;

  // Cookies added after accept (present post-accept, not pre-consent)
  const addedAfterAccept: ConsentComparisonCookie[] = [...postAcceptNames]
    .filter(n => !preNames.has(n))
    .map(byName);

  // Cookies removed after reject (present pre-consent, absent post-reject)
  const removedAfterReject: ConsentComparisonCookie[] = [...preNames]
    .filter(n => postRejectNames.size > 0 && !postRejectNames.has(n))
    .map(byName);

  const MARKETING_CATS = new Set(["Marketing", "Advertising", "marketing", "advertising"]);
  const ANALYTICS_CATS = new Set(["Analytics", "analytics", "Statistics", "statistics"]);

  // Marketing cookies enabled after accept (added after accept AND in marketing category)
  const marketingEnabledAfterAccept = addedAfterAccept
    .filter(c => MARKETING_CATS.has(c.category));

  // Analytics cookies enabled after accept
  const analyticsEnabledAfterAccept = addedAfterAccept
    .filter(c => ANALYTICS_CATS.has(c.category));

  // Cookies still present after reject (were pre-consent OR are non-essential, but appear post-reject)
  const stillPresentAfterReject: ConsentComparisonCookie[] = [...postRejectNames]
    .filter(n => {
      const c = allCookies.find((x: any) => x.name === n);
      if (!c) return false;
      const cat = (c.category ?? "").toLowerCase();
      return !["necessary", "functional", "essential"].includes(cat);
    })
    .map(byName);

  // Compliance verdict
  const marketingRespected = marketingEnabledAfterAccept.length === 0
    || postAcceptNames.size > 0; // only loaded after accept is acceptable
  const rejectLeaks = stillPresentAfterReject.length;
  const pass = rejectLeaks === 0 && (removedAfterReject.length > 0 || postRejectNames.size === 0);

  const complianceSummary = pass
    ? `PASS — Consent controls appear effective. ${addedAfterAccept.length} cookie(s) added after accept; ` +
      `${removedAfterReject.length} removed after reject; no non-essential cookies detected post-reject.`
    : `FAIL — ${rejectLeaks} non-essential cookie(s) still present after rejection. ` +
      `${marketingEnabledAfterAccept.length} marketing cookie(s) enabled after accept. ` +
      `Consent controls may not be functioning correctly.`;

  return {
    preConsentCount,
    acceptCount,
    rejectCount,
    addedAfterAccept,
    removedAfterReject,
    marketingEnabledAfterAccept,
    analyticsEnabledAfterAccept,
    stillPresentAfterReject,
    complianceSummary,
  };
}

// ─── Recommendation Engine ────────────────────────────────────────────────────
// All recommendations are derived from deterministic evidence — never invented.

function buildRecommendations(
  input: EnterpriseAnalysisInput,
  scores: WeightedRiskScores
): EnterpriseReport["recommendations"] {
  const high: EnterpriseRecommendation[] = [];
  const medium: EnterpriseRecommendation[] = [];
  const low: EnterpriseRecommendation[] = [];

  const qf = input.consentQuality?.findings ?? [];
  const banner = input.consentBannerAnalysis;
  const compliance = input.complianceEvaluations;

  // ── Consent-based recommendations ────────────────────────────────────────
  if (qf.find((f) => f.issue === "cookies_before_consent" && f.detected)) {
    high.push({
      priority: "high",
      title: "Implement Cookie Hold-Back Before Consent",
      description:
        "Non-essential cookies are being set before the user provides consent. " +
        "Implement a hold-back mechanism to block all non-essential scripts and cookies until explicit opt-in consent is received.",
      evidence: "Cookies detected in pre-consent browser session before any banner interaction.",
      regulation: "GDPR Art. 7 / ePrivacy Directive",
    });
  }

  if (!banner.bannerDetected) {
    high.push({
      priority: "high",
      title: "Deploy a Cookie Consent Banner",
      description:
        "No cookie consent banner was detected. A compliant consent banner is mandatory under GDPR and ePrivacy where non-essential cookies are used.",
      evidence: "No consent banner HTML, CMP scripts, or consent API signatures detected.",
      regulation: "GDPR Art. 6 / ePrivacy Directive Art. 5(3)",
    });
  }

  if (qf.find((f) => f.issue === "missing_reject_button" && f.detected)) {
    high.push({
      priority: "high",
      title: "Add an Equally Prominent Reject / Decline Button",
      description:
        "The consent banner does not expose a clearly accessible reject button at the same level as the accept button. " +
        "Regulators require that refusing consent be as easy as granting it.",
      evidence: "Reject/decline button not found in banner DOM or hidden behind secondary UI.",
      regulation: "GDPR Art. 7(3) / EDPB Guidelines 03/2022",
    });
  }

  if (qf.find((f) => f.issue === "third_party_cookies_before_consent" && f.detected)) {
    high.push({
      priority: "high",
      title: "Block Third-Party Trackers Until Consent",
      description:
        "Third-party tracking cookies are being set before user consent. These cookies send data to external vendors without a legal basis.",
      evidence: "Third-party cookies observed in pre-consent capture phase.",
      regulation: "GDPR Art. 6 / ePrivacy Directive",
    });
  }

  if (qf.find((f) => f.issue === "marketing_cookies_before_consent" && f.detected)) {
    high.push({
      priority: "high",
      title: "Block Marketing/Advertising Cookies Until Consent",
      description:
        "Marketing and advertising cookies are being set before consent. These represent the highest regulatory exposure category.",
      evidence: "Marketing/Advertising category cookies found in pre-consent session.",
      regulation: "GDPR Art. 6(1)(a) / IAB TCF",
    });
  }

  // ── Policy page recommendations ──────────────────────────────────────────
  if (!input.privacyPolicyUrl) {
    medium.push({
      priority: "medium",
      title: "Publish a Privacy Policy",
      description:
        "No publicly reachable privacy policy was found. GDPR requires controllers to provide a clear transparency notice.",
      evidence: "Privacy policy URL not reachable at standard paths (/privacy, /privacy-policy).",
      regulation: "GDPR Art. 13/14",
    });
  }

  if (!input.cookiePolicyUrl) {
    medium.push({
      priority: "medium",
      title: "Publish a Dedicated Cookie Policy",
      description:
        "No cookie policy page was found. A cookie policy is required to disclose all cookies, their purpose, and retention periods.",
      evidence: "Cookie policy URL not reachable at standard paths (/cookies, /cookie-policy).",
      regulation: "ePrivacy Directive / GDPR Art. 13",
    });
  }

  // ── Compliance-driven recommendations ────────────────────────────────────
  for (const reg of compliance) {
    const criticals = reg.findings.filter(
      (f) => f.severity === "critical" && f.status === "non_compliant"
    );
    for (const f of criticals.slice(0, 3)) {
      high.push({
        priority: "high",
        title: `[${reg.regulation}] ${f.title ?? "Compliance Issue"}`,
        // ComplianceFinding uses `recommendation`, not `remediation` — guard both
        description: (f as any).remediation ?? f.recommendation ?? f.finding ?? "Review compliance finding.",
        evidence: (f.finding ?? "").substring(0, 200),
        regulation: reg.regulation,
      });
    }

    const highs = reg.findings.filter(
      (f) => f.severity === "high" && f.status === "non_compliant"
    );
    for (const f of highs.slice(0, 2)) {
      medium.push({
        priority: "medium",
        title: `[${reg.regulation}] ${f.title ?? "Compliance Issue"}`,
        // ComplianceFinding uses `recommendation`, not `remediation` — guard both
        description: (f as any).remediation ?? f.recommendation ?? f.finding ?? "Review compliance finding.",
        evidence: (f.finding ?? "").substring(0, 200),
        regulation: reg.regulation,
      });
    }
  }

  // ── CMP recommendation ────────────────────────────────────────────────────
  if (!input.cmpDetection.detected) {
    medium.push({
      priority: "medium",
      title: "Deploy a Consent Management Platform (CMP)",
      description:
        "No recognised CMP was detected. A CMP provides audit trails, granular consent categories, and regulatory defensibility.",
      evidence: `No CMP API signatures or known CMP scripts detected. Confidence: ${(input.cmpDetection.confidence * 100).toFixed(0)}%.`,
    });
  }

  // ── Customise option ─────────────────────────────────────────────────────
  if (qf.find((f) => f.issue === "missing_customize_option" && f.detected)) {
    medium.push({
      priority: "medium",
      title: "Add Granular Cookie Preference Controls",
      description:
        "Users cannot selectively accept or reject cookie categories. Granular controls are expected by regulators and improve user trust.",
      evidence: "No customise/manage preferences button found in banner DOM.",
      regulation: "EDPB Guidelines 03/2022",
    });
  }

  // ── Low-priority security / best-practice recommendations ────────────────
  const insecureCookies = input.cookiesDetected.filter(
    (c: any) => !c.secure && c.partyType === "first-party"
  );
  if (insecureCookies.length > 0) {
    low.push({
      priority: "low",
      title: "Set Secure Flag on First-Party Cookies",
      description:
        `${insecureCookies.length} first-party cookie(s) are missing the Secure attribute, making them transmittable over HTTP.`,
      evidence: `Cookies without Secure flag: ${insecureCookies.slice(0, 5).map((c: any) => c.name).join(", ")}.`,
    });
  }

  const noneWithoutSecure = input.cookiesDetected.filter(
    (c: any) => c.sameSite === "None" && !c.secure
  );
  if (noneWithoutSecure.length > 0) {
    low.push({
      priority: "low",
      title: "SameSite=None Cookies Must Have Secure Flag",
      description:
        "Cookies with SameSite=None must also have the Secure attribute per RFC 6265bis; browsers will reject them otherwise.",
      evidence: `Affected cookies: ${noneWithoutSecure.slice(0, 5).map((c: any) => c.name).join(", ")}.`,
    });
  }

  return { high, medium, low };
}

// ─── Immediate Actions ────────────────────────────────────────────────────────

function buildImmediateActions(
  recommendations: EnterpriseReport["recommendations"],
  scores: WeightedRiskScores
): string[] {
  const actions: string[] = [];

  if (scores.riskLevel === "Critical" || scores.riskLevel === "High") {
    actions.push("Engage your Data Protection Officer (DPO) immediately for an internal compliance review.");
  }

  recommendations.high.slice(0, 5).forEach((r) => {
    actions.push(`${r.title}: ${(r.description ?? "").split(".")[0]}.`);
  });

  if (actions.length === 0) {
    actions.push("Review medium-priority recommendations and schedule remediation within 30 days.");
  }

  return actions;
}

// ─── Key Findings ─────────────────────────────────────────────────────────────

function buildKeyFindings(
  input: EnterpriseAnalysisInput,
  scores: WeightedRiskScores
): string[] {
  const findings: string[] = [];
  const cookies = input.cookiesDetected;
  const thirdParty = cookies.filter((c: any) => c.partyType === "third-party").length;
  const marketing = cookies.filter((c: any) =>
    ["Marketing", "Advertising", "marketing", "advertising"].includes(c.category)
  ).length;

  findings.push(
    `${cookies.length} cookie${cookies.length !== 1 ? "s" : ""} detected across ${input.pagesScanned} page${input.pagesScanned !== 1 ? "s" : ""} (${thirdParty} third-party, ${marketing} marketing/advertising).`
  );

  if (input.loadsBeforeConsent) {
    findings.push("Cookies and/or trackers are firing BEFORE user consent is obtained — highest regulatory exposure.");
  }

  findings.push(
    `Consent banner: ${input.consentBannerAnalysis.bannerDetected ? "detected" : "NOT detected"}. ` +
    `CMP: ${input.cmpDetection.detected ? (input.cmpDetection.name ?? "detected") : "not detected"}.`
  );

  const nonCompliantRegs = input.complianceEvaluations
    .filter((r) => r.overallStatus === "non_compliant")
    .map((r) => r.regulation);
  if (nonCompliantRegs.length > 0) {
    findings.push(`Non-compliant with: ${nonCompliantRegs.join(", ")}.`);
  }

  findings.push(
    `Risk scores — Overall: ${scores.overallScore}/100, Privacy: ${scores.privacyScore}/100, ` +
    `Consent: ${scores.consentScore}/100, Compliance: ${scores.complianceScore}/100. ` +
    `Risk level: ${scores.riskLevel}.`
  );

  if (!input.privacyPolicyUrl) findings.push("No publicly reachable privacy policy found.");
  if (!input.cookiePolicyUrl)  findings.push("No publicly reachable cookie policy found.");

  return findings;
}

// ─── Executive Summary ────────────────────────────────────────────────────────

function buildExecutiveSummary(
  input: EnterpriseAnalysisInput,
  scores: WeightedRiskScores,
  keyFindings: string[]
): string {
  const riskEmoji: Record<WeightedRiskScores["riskLevel"], string> = {
    Low: "🟢", Medium: "🟡", High: "🔴", Critical: "⛔",
  };

  const icon = riskEmoji[scores.riskLevel];
  const domain = (() => {
    try { return new URL(input.url).hostname; } catch { return input.url; }
  })();

  const lines: string[] = [
    `${icon} ${domain} — Overall Privacy Risk: ${scores.riskLevel} (Score: ${scores.overallScore}/100)`,
    "",
    `This enterprise analysis scanned ${input.pagesScanned} page(s) and detected ${input.totalCookiesCount} cookie(s). ` +
    `The weighted risk assessment assigns a Privacy Score of ${scores.privacyScore}/100, ` +
    `Consent Score of ${scores.consentScore}/100, ` +
    `Compliance Score of ${scores.complianceScore}/100, ` +
    `and Technology Score of ${scores.technologyScore}/100.`,
    "",
    "Key findings:",
    ...keyFindings.map((f) => `• ${f}`),
  ];

  return lines.join("\n");
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Run the full Enterprise Intelligence Layer on a completed scan result.
 *
 * This is the only exported function — call it once after ScannerService
 * finishes its scan and attach the returned EnterpriseReport to the result.
 *
 * Never throws: on any error it returns a gracefully degraded report.
 */
export async function analyzeEnterprise(
  input: EnterpriseAnalysisInput
): Promise<EnterpriseReport> {
  console.log(`[EnterpriseAnalyzer] Starting analysis for ${input.url}`);

  try {
    // 1. Deterministic weighted risk scores (no AI dependency)
    const riskScores = computeWeightedRiskScores(input);

    // 2. Build inventory summaries
    const cookieInventory = buildCookieInventory(input);
    const technologyInventory = buildTechnologyInventory(input.technologiesDetected);
    const consentAnalysisSummary = buildConsentSummary(input);
    const complianceSummary = buildComplianceSummary(input.complianceEvaluations);
    const consentComparison = buildConsentComparison(input);

    // 3. Recommendations (deterministic, evidence-grounded)
    const recommendations = buildRecommendations(input, riskScores);
    const immediateActions = buildImmediateActions(recommendations, riskScores);
    const keyFindings = buildKeyFindings(input, riskScores);
    const executiveSummary = buildExecutiveSummary(input, riskScores, keyFindings);

    // 4. AI deep-dive analysis (runs in parallel with no blocking path)
    const evidenceBrief = buildEvidenceBrief(input);
    const aiAnalysis = await runEnterpriseAIAnalysis(evidenceBrief);

    const report: EnterpriseReport = {
      executiveSummary,
      riskScores,
      aiAnalysis,
      consentComparison,
      cookieInventory,
      technologyInventory,
      consentAnalysisSummary,
      complianceSummary,
      consentQualityFindings: input.consentQuality?.findings ?? [],
      keyFindings,
      recommendations,
      immediateActions,
      confidenceLevel: riskScores.confidenceScore,
      generatedAt: new Date().toISOString(),
    };

    console.log(
      `[EnterpriseAnalyzer] Complete — risk=${riskScores.riskLevel} score=${riskScores.overallScore} ` +
      `confidence=${riskScores.confidenceScore}%`
    );

    return report;
  } catch (err) {
    console.error("[EnterpriseAnalyzer] Unexpected error:", (err as Error).message);

    // Return a gracefully degraded report — never propagate exceptions to the caller
    return {
      executiveSummary: "Enterprise analysis could not be completed due to an internal error. Manual review recommended.",
      riskScores: {
        overallScore: 0,
        privacyScore: 0,
        consentScore: 0,
        complianceScore: 0,
        technologyScore: 0,
        riskLevel: "Critical",
        confidenceScore: 0,
      },
      aiAnalysis: buildFallbackAIAnalysis(),
      consentComparison: {
        preConsentCount: 0,
        acceptCount: 0,
        rejectCount: 0,
        addedAfterAccept: [],
        removedAfterReject: [],
        marketingEnabledAfterAccept: [],
        analyticsEnabledAfterAccept: [],
        stillPresentAfterReject: [],
        complianceSummary: "Analysis unavailable — enterprise layer failed.",
      },
      cookieInventory: {
        total: input.cookiesDetected.length,
        firstParty: 0,
        thirdParty: 0,
        byCategory: {},
        highRisk: [],
        preConsentCount: 0,
      },
      technologyInventory: { total: 0, highRisk: [], byCategory: {} },
      consentAnalysisSummary: {
        bannerDetected: false,
        cmpName: null,
        cmpConfidence: 0,
        hasRejectButton: false,
        hasCustomizeButton: false,
        cookiesBeforeConsent: false,
        defaultConsentState: "unknown",
        equalProminence: "unknown",
        consentQualityScore: 0,
      },
      complianceSummary: [],
      consentQualityFindings: [],
      keyFindings: ["Enterprise analysis failed — refer to base scan results."],
      recommendations: { high: [], medium: [], low: [] },
      immediateActions: ["Review scan results manually. Enterprise intelligence layer failed."],
      confidenceLevel: 0,
      generatedAt: new Date().toISOString(),
    };
  }
}
