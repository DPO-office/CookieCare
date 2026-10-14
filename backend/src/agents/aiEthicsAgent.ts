/**
 * AIEthicsAgent
 *
 * Evaluates an AI company's responsible AI posture across 19 dimensions
 * spanning governance, transparency, fairness, accountability, privacy,
 * human oversight, explainability, and compliance with:
 *   - NIST AI Risk Management Framework (AI RMF)
 *   - ISO/IEC 42001 (AI Management System)
 *   - OECD AI Principles
 *   - EU AI Act (high-level alignment)
 *   - Google Responsible AI Principles
 *   - Microsoft Responsible AI Standard
 *
 * Follows the same pattern as DPAReviewAgent and VendorReviewAgent:
 *   1. RAG retrieval for grounding
 *   2. Context assembly (docs + website intelligence)
 *   3. OpenRouter call (jsonMode, temperature 0.2)
 *   4. Markdown fence stripping
 *   5. JSON.parse + normalisation
 *   6. Zod validation
 *   7. Heuristic fallback
 */

import { openRouterComplete } from "../services/openRouterClient.js";
import { searchHybrid } from "../RAG/ragService.js";
import { z } from "zod";
import type { WebsiteScanResult } from "../services/websiteScanner/types.js";

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const EthicsFindingSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["passed", "needs-improvement", "warning", "high-risk"]),
  evidenceConfidence: z.enum(["VERIFIED_PRESENT", "UNABLE_TO_VERIFY", "VERIFIED_MISSING"]).optional(),
  description: z.string(),
  evidence: z.string().optional(),
  recommendation: z.string(),
});

const EthicsRecommendationSchema = z.object({
  category: z.string(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  items: z.array(z.string()),
});

const EthicsScoreBreakdownSchema = z.object({
  aiGovernance:        z.number().min(0).max(100),
  transparency:        z.number().min(0).max(100),
  fairness:            z.number().min(0).max(100),
  accountability:      z.number().min(0).max(100),
  privacyProtection:   z.number().min(0).max(100),
  humanOversight:      z.number().min(0).max(100),
  explainability:      z.number().min(0).max(100),
  riskManagement:      z.number().min(0).max(100),
});

const EthicsDimensionSchema = z.object({
  dimension: z.string(),
  score: z.number().min(0).max(100),
  status: z.enum(["strong", "adequate", "weak", "absent"]),
  notes: z.string().optional(),
});

const StandardAlignmentSchema = z.object({
  standard: z.string(),
  alignment: z.enum(["strong", "partial", "weak", "absent"]),
  gaps: z.array(z.string()).optional(),
});

export const AIEthicsResultSchema = z.object({
  overallScore:     z.number().min(0).max(100),
  overallRisk:      z.enum(["low", "medium", "high", "critical"]),
  summary:          z.string(),
  findings:         z.array(EthicsFindingSchema),
  recommendations:  z.array(EthicsRecommendationSchema),
  strengths:        z.array(z.string()),
  concerns:         z.array(z.string()),
  scoreBreakdown:   EthicsScoreBreakdownSchema,
  ethicsDimensions: z.array(EthicsDimensionSchema),
  standardAlignment: z.array(StandardAlignmentSchema).optional(),
});

export type AIEthicsFinding       = z.infer<typeof EthicsFindingSchema>;
export type AIEthicsRecommendation = z.infer<typeof EthicsRecommendationSchema>;
export type AIEthicsDimension      = z.infer<typeof EthicsDimensionSchema>;
export type StandardAlignment      = z.infer<typeof StandardAlignmentSchema>;
export type AIEthicsResult         = z.infer<typeof AIEthicsResultSchema>;

// ─── RAG retrieval query ──────────────────────────────────────────────────────

const AI_ETHICS_RETRIEVAL_QUERY =
  "responsible AI policy AI governance framework ethical principles " +
  "fairness bias mitigation transparency explainability accountability " +
  "human oversight AI risk management NIST AI RMF ISO 42001 OECD AI " +
  "EU AI Act model monitoring data governance AI documentation " +
  "incident response privacy protection AI lifecycle";

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior Responsible AI and AI Ethics Compliance Analyst specialising in AI governance frameworks, ethical AI assessment, and regulatory alignment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL EPISTEMOLOGICAL RULES — READ BEFORE ANALYSING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Our scanner probes a finite set of well-known URL paths. It does NOT crawl every
page on a website. A policy, framework or page NOT found by the scanner may still
exist at a non-standard URL, in a PDF, in annual reports, or in product documentation.

You MUST apply one of exactly THREE evidence confidence levels to every finding:

  VERIFIED_PRESENT   — Page/document was found AND content was extracted confirming
                       the practice. Use this when extracted text directly evidences
                       the claim. Cite the specific URL and quote supporting text.

  UNABLE_TO_VERIFY   — The scanner did not locate this content, OR the scan
                       coverage was partial/low, OR the item may exist elsewhere.
                       This is the CORRECT label when absence of discovery ≠ absence
                       of policy. Use when: scan coverage is LOW/MEDIUM, when the
                       organisation is a large technology company (who typically do
                       publish such policies), or when you have no extracted content
                       to confirm or deny.

  VERIFIED_MISSING   — Only use this when you have HIGH confidence the item truly
                       does not exist. Requires: (a) HIGH scan coverage AND (b)
                       extracted page content from related pages that explicitly
                       contradicts existence, AND (c) the company is small/new where
                       absence is plausible. NEVER mark VERIFIED_MISSING for a major
                       AI company unless you have strong direct evidence of absence.

FORBIDDEN INFERENCES:
  ✗ DO NOT conclude a policy is missing because it was not at a standard URL path.
  ✗ DO NOT conclude a framework does not exist because a specific page was empty.
  ✗ DO NOT assign VERIFIED_MISSING when scan coverage is LOW or MEDIUM.
  ✗ DO NOT use words like "no evidence was found" to justify a "missing" status
    when the scan coverage quality was LOW or VERY LOW.

REQUIRED BEHAVIOUR:
  ✓ When scan coverage is HIGH and content was extracted: provide evidence-grounded findings.
  ✓ When scan coverage is MEDIUM: use UNABLE_TO_VERIFY for items without direct text evidence.
  ✓ When scan coverage is LOW or VERY LOW: default to UNABLE_TO_VERIFY for most findings.
  ✓ When extracted page content exists: quote it. Be specific. Cite the URL.
  ✓ Calibrate overallScore conservatively when coverage is limited.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Perform a comprehensive AI Ethics Review based on the provided context. Evaluate ALL 19 dimensions below:

1. AI Governance Framework (policies, committees, ownership, AI Officer)
2. Responsible AI Policy (formal policy, scope, enforcement)
3. Transparency (model cards, system cards, public documentation)
4. Explainability (XAI mechanisms, user-facing explanations, GDPR Art. 22)
5. Fairness (bias audits, protected attributes, fairness metrics)
6. Bias Mitigation (bias testing pipeline, monitoring, remediation)
7. Human Oversight (review checkpoints, override mechanisms, escalation)
8. Accountability (ownership, audit trails, incident register)
9. Privacy Protection (data minimisation, DPIA, consent, retention)
10. Security (adversarial robustness, red-teaming, model security)
11. Model Monitoring (drift detection, performance monitoring, alerting)
12. Risk Management (risk register, risk classification, impact assessment)
13. Data Governance (data lineage, quality, provenance, consent)
14. AI Documentation (technical docs, model cards, data cards)
15. Regulatory Readiness (GDPR, EU AI Act, sector-specific regs)
16. AI Lifecycle Management (versioning, deprecation, release governance)
17. Incident Response (AI incident plan, severity classification, SLAs)
18. Ethical Principles (published principles, training, culture)
19. Compliance with Responsible AI Standards (NIST AI RMF, ISO/IEC 42001, OECD, EU AI Act, Google RAI, Microsoft RAI Standard)

STANDARDS TO ASSESS:
- NIST AI Risk Management Framework (AI RMF): GOVERN, MAP, MEASURE, MANAGE functions
- ISO/IEC 42001: AI management system requirements, objectives, continual improvement
- OECD AI Principles: inclusive growth, human-centred values, transparency, robustness, accountability
- EU AI Act: risk classification (unacceptable/high/limited/minimal), conformity assessment, transparency obligations
- Google Responsible AI Principles: social benefit, safety, privacy, accountability, scientific excellence
- Microsoft Responsible AI Standard: fairness, reliability & safety, privacy & security, inclusiveness, transparency, accountability

SCORING GUIDANCE:
- When scan coverage is HIGH and evidence is strong: score on full 0–100 range
- When scan coverage is MEDIUM: compress scores toward centre (30–70 range) reflecting uncertainty
- When scan coverage is LOW: use 40–60 as baseline, adjust only when extracted content is decisive
- overallScore should reflect EVIDENCE QUALITY, not just presence of URL stubs

Return ONLY a valid JSON object — absolutely no markdown fences, no preamble, no commentary.

The JSON must exactly match this schema:
{
  "overallScore": <integer 0-100>,
  "overallRisk": "low" | "medium" | "high" | "critical",
  "summary": "<3-5 sentence executive summary. MUST state the scan coverage level, how many pages had content extracted, and explicitly note what could not be verified due to scanner limitations>",
  "findings": [
    {
      "id": "finding_1",
      "title": "<Short finding title>",
      "category": "<Category matching one of the 19 dimensions above>",
      "severity": "low" | "medium" | "high" | "critical",
      "status": "passed" | "needs-improvement" | "warning" | "high-risk",
      "evidenceConfidence": "VERIFIED_PRESENT" | "UNABLE_TO_VERIFY" | "VERIFIED_MISSING",
      "description": "<What was found. If VERIFIED_PRESENT: quote specific evidence. If UNABLE_TO_VERIFY: explain why — scanner limitation, partial coverage, or page not at standard path. If VERIFIED_MISSING: provide strong justification.>",
      "evidence": "<Direct quote or specific reference from extracted content, OR 'No content extracted from this page — cannot confirm or deny' if UNABLE_TO_VERIFY>",
      "recommendation": "<Concrete actionable recommendation>"
    }
  ],
  "recommendations": [
    {
      "category": "<Category name>",
      "priority": "critical" | "high" | "medium" | "low",
      "items": ["<Actionable item 1>", "<item 2>"]
    }
  ],
  "strengths": ["<Strength 1 — only list if VERIFIED_PRESENT>"],
  "concerns": ["<Concern 1 — use careful language; distinguish confirmed gaps from unverified items>"],
  "scoreBreakdown": {
    "aiGovernance":      <0-100>,
    "transparency":      <0-100>,
    "fairness":          <0-100>,
    "accountability":    <0-100>,
    "privacyProtection": <0-100>,
    "humanOversight":    <0-100>,
    "explainability":    <0-100>,
    "riskManagement":    <0-100>
  },
  "ethicsDimensions": [
    {
      "dimension": "<Dimension name>",
      "score": <0-100>,
      "status": "strong" | "adequate" | "weak" | "absent",
      "notes": "<Evidence-based note. State evidence confidence level.>"
    }
  ],
  "standardAlignment": [
    {
      "standard": "NIST AI RMF" | "ISO/IEC 42001" | "OECD AI Principles" | "EU AI Act" | "Google Responsible AI" | "Microsoft Responsible AI Standard",
      "alignment": "strong" | "partial" | "weak" | "absent",
      "gaps": ["<Gap 1 — only list as gap if VERIFIED_MISSING, otherwise list as 'Not verified by scanner'>"]
    }
  ]
}`;

// ─── Website Intelligence summariser (mirrors VendorReviewAgent) ──────────────

function summariseWebsiteIntelligence(scanResult: WebsiteScanResult): string {
  const lines: string[] = [
    `[WEBSITE INTELLIGENCE — SCAN COVERAGE REPORT]`,
    `Homepage: ${scanResult.homepage}`,
    `Scanned at: ${scanResult.scannedAt}`,
    `Discovered pages via crawl: ${scanResult.discoveredPages.length}`,
    ``,
    `IMPORTANT: This report reflects what our automated scanner found by probing`,
    `well-known URL paths. Pages NOT listed below may still exist at non-standard`,
    `paths. Absence from this report does NOT prove a policy does not exist.`,
    `Always apply the evidence confidence levels defined in the analysis instructions.`,
  ];

  if (scanResult.metadata) {
    const m = scanResult.metadata;
    if (m.title)       lines.push(``, `Site title: ${m.title}`);
    if (m.description) lines.push(`Meta description: ${m.description}`);
    if (m.language)    lines.push(`Language: ${m.language}`);
    const relevantHeaders = [
      "content-security-policy", "strict-transport-security",
      "x-frame-options", "x-content-type-options", "permissions-policy",
    ];
    const foundHeaders = relevantHeaders.filter((h) => h in (m.headers ?? {}));
    lines.push(
      foundHeaders.length > 0
        ? `Security headers present: ${foundHeaders.join(", ")}`
        : `Security headers: none detected by scanner`
    );
  }

  // ── AI governance and compliance pages ──────────────────────────────────────
  const allPages: Record<string, typeof scanResult.aiPolicy> = {
    "AI Policy":       scanResult.aiPolicy,
    "Responsible AI":  scanResult.responsibleAI,
    "Safety Page":     scanResult.safetyPage,
    "Policies Page":   scanResult.policiesPage,
    "Model Spec":      scanResult.modelSpec,
    "Transparency":    scanResult.transparencyPage,
    "Charter":         scanResult.charterPage,
    "Privacy Policy":  scanResult.privacyPolicy,
    "Trust Center":    scanResult.trustCenter,
    "Security Page":   scanResult.securityPage,
    "Legal":           scanResult.legal,
    "DPA":             scanResult.dpa,
    "Terms":           scanResult.terms,
    "Cookie Policy":   scanResult.cookiePolicy,
  };

  lines.push(``, `[PAGE DISCOVERY RESULTS]`);
  lines.push(`(✓ = reachable at standard path | ✗ = not found at standard path | ? = scan incomplete)`);
  for (const [name, page] of Object.entries(allPages)) {
    if (page?.reachable) {
      lines.push(`✓ ${name}: ${page.url} (HTTP ${page.statusCode}) — EVIDENCE AVAILABLE`);
    } else if (page && !page.reachable) {
      lines.push(`✗ ${name}: probed but unreachable at ${page.url} (HTTP ${page.statusCode})`);
    } else {
      lines.push(`✗ ${name}: not found at standard paths (may exist elsewhere)`);
    }
  }

  const reachableAIPages = [
    scanResult.aiPolicy, scanResult.responsibleAI, scanResult.safetyPage,
    scanResult.policiesPage, scanResult.modelSpec, scanResult.transparencyPage,
    scanResult.charterPage,
  ].filter((p) => p?.reachable).length;

  const reachableAllPages = Object.values(allPages).filter((p) => p?.reachable).length;

  lines.push(
    ``,
    `AI governance pages found: ${reachableAIPages} / 7`,
    `All compliance pages found: ${reachableAllPages} / ${Object.keys(allPages).length}`,
    ``,
    `SCAN COVERAGE QUALITY: ${
      reachableAllPages >= 6 ? "HIGH — substantial evidence available" :
      reachableAllPages >= 3 ? "MEDIUM — partial evidence, apply lower confidence to missing items" :
      reachableAllPages >= 1 ? "LOW — limited evidence, treat absences as Unable to Verify" :
      "VERY LOW — scanner found minimal pages; most findings should be Unable to Verify"
    }`
  );

  // ── Extracted page content ───────────────────────────────────────────────────
  // Include actual text from governance pages so the LLM can reason from
  // real evidence rather than just URL presence signals.
  if (scanResult.extractedPageContents && scanResult.extractedPageContents.length > 0) {
    lines.push(``, `[EXTRACTED PAGE CONTENT]`);
    lines.push(`The following pages were fetched and their content extracted for analysis:`);

    for (const page of scanResult.extractedPageContents) {
      lines.push(
        ``,
        `--- PAGE: ${page.title} ---`,
        `URL: ${page.url}`,
        `Content (${page.fullTextLength} chars total, showing first 3000):`,
        page.textSnippet,
        `--- END PAGE ---`
      );
    }

    lines.push(
      ``,
      `Total pages with extracted content: ${scanResult.extractedPageContents.length}`,
      `Total extracted characters: ${scanResult.extractedPageContents.reduce((s, p) => s + p.fullTextLength, 0)}`
    );
  } else {
    lines.push(
      ``,
      `[EXTRACTED PAGE CONTENT]`,
      `No page content was extracted (content extraction was not available or all pages were empty).`,
      `Analysis must rely solely on URL presence signals above — apply LOWER confidence to all findings.`
    );
  }

  return lines.join("\n");
}

// ─── Agent class ──────────────────────────────────────────────────────────────

export class AIEthicsAgent {
  /**
   * Review an AI company's responsible AI posture.
   *
   * @param params.documentText  Merged plaintext from uploaded documents (may be empty)
   * @param params.websiteScan   Structured website intelligence (may be null)
   * @param params.userId        User ID for scoped RAG retrieval
   * @param params.fileIds       Indexed file IDs for RAG retrieval scope
   */
  async reviewAIEthics(params: {
    documentText: string;
    websiteScan: WebsiteScanResult | null;
    userId: string;
    fileIds?: string[];
  }): Promise<AIEthicsResult> {
    const { documentText, websiteScan, userId, fileIds } = params;

    // ── DIAGNOSTIC: log all inputs before any processing ───────────────────
    console.log(`[AIEthicsAgent] ── INPUT DIAGNOSTIC ────────────────────────────────`);
    console.log(`[AIEthicsAgent] Received fileIds:      ${JSON.stringify(fileIds ?? [])}`);
    console.log(`[AIEthicsAgent] documentText length:   ${documentText.length} chars`);
    console.log(`[AIEthicsAgent] websiteScan:           ${websiteScan ? "yes" : "no"}`);
    console.log(`[AIEthicsAgent] ─────────────────────────────────────────────────────`);

    // ── 1. RAG retrieval ────────────────────────────────────────────────────
    // Only attempt RAG when specific fileIds are provided. Without them the
    // search spans the entire user knowledge base and the last-resort fallback
    // inside searchHybrid returns chunks from unrelated documents (e.g.
    // Playbook.pdf), which then replaces the actual uploaded document content.
    let ragContext = "";
    const hasFileIds = Array.isArray(fileIds) && fileIds.length > 0;

    console.log(
      `[AIEthicsAgent] RAG: ${hasFileIds ? `attempting with fileIds=${JSON.stringify(fileIds)}` : "SKIPPED — no fileIds provided (avoids cross-document contamination)"}`
    );

    if (hasFileIds) {
      try {
        const chunks = await searchHybrid(
          AI_ETHICS_RETRIEVAL_QUERY,
          userId,
          fileIds
        );

        // Guard: only accept chunks that actually belong to the requested files.
        // searchHybrid's last-resort fallback may return chunks from other
        // documents when the target file has no indexed content yet.
        const ownChunks     = chunks.filter((c) => fileIds!.includes(c.file_id));
        const foreignChunks = chunks.filter((c) => !fileIds!.includes(c.file_id));

        console.log(
          `[AIEthicsAgent] RAG result — total: ${chunks.length}, ` +
            `own: ${ownChunks.length}, foreign: ${foreignChunks.length}`
        );

        if (foreignChunks.length > 0) {
          console.warn(
            `[AIEthicsAgent] Discarding ${foreignChunks.length} chunk(s) from unrelated files: ` +
              foreignChunks.map((c) => c.title ?? c.file_id).join(", ")
          );
        }

        if (ownChunks.length > 0) {
          ragContext = ownChunks
            .map((c) => `[${c.title ?? "AI Documentation"}]\n${c.content}`)
            .join("\n\n");
          console.log(
            `[AIEthicsAgent] Using ${ownChunks.length} RAG chunk(s) from the uploaded file(s)`
          );
        } else {
          console.log(
            `[AIEthicsAgent] No indexed chunks found for provided fileIds — falling back to raw documentText`
          );
        }
      } catch (ragErr) {
        console.warn(
          "[AIEthicsAgent] RAG retrieval failed, continuing without it:",
          (ragErr as Error).message
        );
      }
    }

    // ── 2. Assemble context ─────────────────────────────────────────────────
    const contextParts: string[] = [];

    if (websiteScan) {
      const websiteSummary = summariseWebsiteIntelligence(websiteScan);
      contextParts.push(websiteSummary);
      console.log(
        `[AIEthicsAgent] Website scan — ` +
          `discoveredPages: ${websiteScan.discoveredPages.length}, ` +
          `aiPolicy: ${websiteScan.aiPolicy?.reachable ? "found" : "not found"}, ` +
          `responsibleAI: ${websiteScan.responsibleAI?.reachable ? "found" : "not found"}, ` +
          `safetyPage: ${websiteScan.safetyPage?.reachable ? "found" : "not found"}, ` +
          `policiesPage: ${websiteScan.policiesPage?.reachable ? "found" : "not found"}, ` +
          `modelSpec: ${websiteScan.modelSpec?.reachable ? "found" : "not found"}, ` +
          `extractedPageContents: ${websiteScan.extractedPageContents?.length ?? 0}`
      );
    }

    // Use RAG chunks only when they came from the specific uploaded files.
    // Otherwise always fall back to the full raw documentText (capped to avoid
    // token overflow). This is the critical fix: 45k+ chars of extracted text
    // must reach the LLM even when RAG is skipped or returns no own-chunks.
    const usingRag = ragContext.length > 0;
    const contextSource = usingRag ? "RAG chunks from uploaded file(s)" : documentText.length > 0 ? "raw documentText" : "website-only";

    if (usingRag) {
      contextParts.push(`[DOCUMENT CONTEXT (RAG — uploaded file)]\n${ragContext}`);
    } else if (documentText.length > 0) {
      // Cap to avoid token overflow; 12 000 chars ≈ 3 000 tokens
      contextParts.push(
        `[DOCUMENT CONTENT]\n${documentText.substring(0, 12000)}` +
          (documentText.length > 12000 ? "\n...[truncated]" : "")
      );
    }

    console.log(
      `[AIEthicsAgent] Context source: ${contextSource} — ` +
        `ragLen=${ragContext.length}, docTextLen=${documentText.length}`
    );

    const assembledContext = contextParts.join("\n\n");

    console.log(
      `[AIEthicsAgent] Context assembled — ` +
        `websiteScan=${websiteScan ? "yes" : "no"}, ` +
        `ragChunks=${ragContext.length > 0 ? "yes" : "no"}, ` +
        `rawDocLen=${documentText.length}, ` +
        `extractedPages=${websiteScan?.extractedPageContents?.length ?? 0}, ` +
        `totalContextLen=${assembledContext.length}`
    );

    // ── 2a. Content sufficiency check ───────────────────────────────────────
    // If there is genuinely nothing to analyse, refuse early rather than
    // generating a heuristic result that has no evidentiary basis.
    const hasWebsiteContent =
      websiteScan !== null &&
      (websiteScan.discoveredPages.length > 0 ||
        Object.values({
          p: websiteScan.privacyPolicy,
          c: websiteScan.cookiePolicy,
          s: websiteScan.securityPage,
          t: websiteScan.trustCenter,
          terms: websiteScan.terms,
          l: websiteScan.legal,
          d: websiteScan.dpa,
          a: websiteScan.aiPolicy,
          r: websiteScan.responsibleAI,
          safety: websiteScan.safetyPage,
          policies: websiteScan.policiesPage,
          modelSpec: websiteScan.modelSpec,
          transparency: websiteScan.transparencyPage,
          charter: websiteScan.charterPage,
        }).some((p: any) => p?.reachable));

    const hasDocumentContent = ragContext.length > 0 || documentText.length > 100;

    if (!hasWebsiteContent && !hasDocumentContent) {
      console.warn(
        "[AIEthicsAgent] No usable content retrieved — refusing heuristic analysis."
      );
      throw new Error(
        "We couldn't retrieve enough content from this website to perform an analysis. " +
          "Please try again later or upload supporting documents."
      );
    }

    // ── 3. Build user prompt ────────────────────────────────────────────────
    const userPrompt = `[AI ETHICS ASSESSMENT CONTEXT]
${assembledContext}

Perform a comprehensive AI Ethics Review based on the above context. Evaluate all 19 dimensions and all 6 responsible AI standards specified. Return only the structured JSON.`;

    // ── 3a. Debug context logging ───────────────────────────────────────────
    // Structured summary of all evidence available so pipeline issues are
    // diagnosable without reading the full prompt.
    const extractedCount = params.websiteScan?.extractedPageContents?.length ?? 0;
    const extractedUrls  = params.websiteScan?.extractedPageContents?.map((p) => p.url) ?? [];
    const reachablePages = params.websiteScan
      ? [
          params.websiteScan.aiPolicy, params.websiteScan.responsibleAI,
          params.websiteScan.safetyPage, params.websiteScan.policiesPage,
          params.websiteScan.modelSpec, params.websiteScan.transparencyPage,
          params.websiteScan.charterPage, params.websiteScan.privacyPolicy,
          params.websiteScan.trustCenter, params.websiteScan.securityPage,
        ].filter((p): p is NonNullable<typeof p> => p?.reachable === true)
          .map((p) => p.url)
      : [];

    // Compute the same scanCoverage label that summariseWebsiteIntelligence
    // writes into the prompt so we can verify it matches what the LLM sees.
    const allCompliancePageCount = params.websiteScan
      ? [
          params.websiteScan.aiPolicy, params.websiteScan.responsibleAI,
          params.websiteScan.safetyPage, params.websiteScan.policiesPage,
          params.websiteScan.modelSpec, params.websiteScan.transparencyPage,
          params.websiteScan.charterPage, params.websiteScan.privacyPolicy,
          params.websiteScan.trustCenter, params.websiteScan.securityPage,
          params.websiteScan.legal, params.websiteScan.dpa,
          params.websiteScan.terms, params.websiteScan.cookiePolicy,
        ].filter((p: any) => p?.reachable).length
      : 0;

    const scanCoverageLabel =
      allCompliancePageCount >= 6 ? "HIGH" :
      allCompliancePageCount >= 3 ? "MEDIUM" :
      allCompliancePageCount >= 1 ? "LOW" :
      "VERY LOW";

    console.log(`[AIEthicsAgent] ── CONTEXT DEBUG SUMMARY ──────────────────────────────`);
    console.log(`[AIEthicsAgent] Received fileIds:           ${JSON.stringify(fileIds ?? [])}`);
    console.log(`[AIEthicsAgent] RAG attempted:              ${hasFileIds ? "yes" : "no (no fileIds)"}`);
    console.log(`[AIEthicsAgent] RAG context source:         ${contextSource}`);
    console.log(`[AIEthicsAgent] Extracted document length:  ${documentText.length} chars`);
    console.log(`[AIEthicsAgent] Final context source:       ${contextSource}`);
    console.log(`[AIEthicsAgent] Total context size:         ${assembledContext.length} chars`);
    console.log(`[AIEthicsAgent] Website:                    ${params.websiteScan?.homepage ?? "none"}`);
    console.log(`[AIEthicsAgent] Discovered pages:           ${params.websiteScan?.discoveredPages.length ?? 0}`);
    console.log(`[AIEthicsAgent] scanCoverage inputs:        reachablePages=${allCompliancePageCount}/14 → label="${scanCoverageLabel}"`);
    console.log(`[AIEthicsAgent] Reachable compliance pages (${reachablePages.length}):`);
    reachablePages.forEach((u) => console.log(`[AIEthicsAgent]   ✓ ${u}`));
    console.log(`[AIEthicsAgent] Pages with extracted content (${extractedCount}):`);
    extractedUrls.forEach((u) => console.log(`[AIEthicsAgent]   📄 ${u}`));
    console.log(`[AIEthicsAgent] ────────────────────────────────────────────────────────`);

    // ── 4. Call OpenRouter ──────────────────────────────────────────────────
    let responseText: string;
    try {
      console.log(
        `[AIEthicsAgent] Calling OpenRouter — prompt length: ${userPrompt.length} chars`
      );
      responseText = await openRouterComplete(SYSTEM_PROMPT, userPrompt, {
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 4096,
      });
    } catch (llmErr) {
      console.error("[AIEthicsAgent] OpenRouter call failed:", llmErr);
      throw llmErr;
    }

    // ── 5. Parse + normalise ────────────────────────────────────────────────
    responseText = responseText.trim();

    console.log(
      `[AIEthicsAgent] Raw LLM response (${responseText.length} chars):\n` +
        responseText.substring(0, 3000) +
        (responseText.length > 3000
          ? `\n...[truncated, total ${responseText.length} chars]`
          : "")
    );

    // Strip accidental markdown fences
    if (responseText.startsWith("```")) {
      responseText = responseText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }

    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseErr) {
      console.warn(
        "[AIEthicsAgent] JSON parse failed. Falling back to heuristic analysis.\n",
        responseText.substring(0, 500)
      );
      // hasDocumentContent / hasWebsiteContent are guaranteed true here
      // (we already threw above when both were false).
      return this.heuristicFallback(documentText, websiteScan);
    }

    // Normalise arrays the model might omit
    parsed.findings         = Array.isArray(parsed.findings)         ? parsed.findings         : [];
    parsed.recommendations  = Array.isArray(parsed.recommendations)  ? parsed.recommendations  : [];
    parsed.strengths        = Array.isArray(parsed.strengths)        ? parsed.strengths        : [];
    parsed.concerns         = Array.isArray(parsed.concerns)         ? parsed.concerns         : [];
    parsed.ethicsDimensions = Array.isArray(parsed.ethicsDimensions) ? parsed.ethicsDimensions : [];
    parsed.standardAlignment = Array.isArray(parsed.standardAlignment) ? parsed.standardAlignment : [];

    parsed.scoreBreakdown = parsed.scoreBreakdown ?? {
      aiGovernance: 50, transparency: 50, fairness: 50, accountability: 50,
      privacyProtection: 50, humanOversight: 50, explainability: 50, riskManagement: 50,
    };

    // Normalise overallRisk
    if (!["low", "medium", "high", "critical"].includes(parsed.overallRisk)) {
      parsed.overallRisk = "medium";
    }

    // Normalise overallScore
    if (typeof parsed.overallScore !== "number") {
      parsed.overallScore = 50;
    }

    // Normalise findings
    const VALID_SEVERITY = ["low", "medium", "high", "critical"];
    const VALID_STATUS   = ["passed", "needs-improvement", "warning", "high-risk"];
    const VALID_CONFIDENCE = ["VERIFIED_PRESENT", "UNABLE_TO_VERIFY", "VERIFIED_MISSING"];
    parsed.findings = parsed.findings.map((f: any, i: number) => ({
      ...f,
      id:       f.id ?? `finding_${i + 1}`,
      severity: VALID_SEVERITY.includes(f.severity) ? f.severity : "medium",
      status:   VALID_STATUS.includes(f.status)     ? f.status   : "warning",
      // Default to UNABLE_TO_VERIFY if the model omits the field — safer than VERIFIED_MISSING
      evidenceConfidence: VALID_CONFIDENCE.includes(f.evidenceConfidence)
        ? f.evidenceConfidence
        : "UNABLE_TO_VERIFY",
    }));

    // Normalise recommendations
    parsed.recommendations = parsed.recommendations.map((r: any) => ({
      ...r,
      priority: ["critical", "high", "medium", "low"].includes(r.priority) ? r.priority : "medium",
      items:    Array.isArray(r.items) ? r.items : [],
    }));

    // Normalise ethicsDimensions
    const VALID_DIM_STATUS = ["strong", "adequate", "weak", "absent"];
    parsed.ethicsDimensions = parsed.ethicsDimensions.map((d: any) => ({
      ...d,
      score:  typeof d.score === "number" ? Math.max(0, Math.min(100, d.score)) : 50,
      status: VALID_DIM_STATUS.includes(d.status) ? d.status : "weak",
    }));

    // Normalise standardAlignment
    const VALID_ALIGNMENT = ["strong", "partial", "weak", "absent"];
    parsed.standardAlignment = parsed.standardAlignment.map((s: any) => ({
      ...s,
      alignment: VALID_ALIGNMENT.includes(s.alignment) ? s.alignment : "partial",
      gaps:      Array.isArray(s.gaps) ? s.gaps : [],
    }));

    // Clamp scoreBreakdown values
    for (const key of Object.keys(parsed.scoreBreakdown)) {
      const val = parsed.scoreBreakdown[key];
      parsed.scoreBreakdown[key] = typeof val === "number" ? Math.max(0, Math.min(100, val)) : 50;
    }

    console.log(
      "[AIEthicsAgent] Parsed+normalised object (pre-Zod):",
      JSON.stringify(parsed, null, 2).substring(0, 3000)
    );

    // ── 6. Zod validation ───────────────────────────────────────────────────
    try {
      return AIEthicsResultSchema.parse(parsed);
    } catch (validationErr) {
      console.warn(
        "[AIEthicsAgent] Zod validation failed. Falling back to heuristic.\n",
        JSON.stringify((validationErr as any)?.errors ?? validationErr, null, 2)
      );
      return this.heuristicFallback(documentText, websiteScan);
    }
  }

  // ── Heuristic fallback ────────────────────────────────────────────────────
  private heuristicFallback(
    content: string,
    websiteScan: WebsiteScanResult | null
  ): AIEthicsResult {
    const lower = content.toLowerCase();
    const findings: AIEthicsFinding[] = [];

    const hasAIPolicy       = websiteScan?.aiPolicy?.reachable       || lower.includes("ai policy");
    const hasResponsibleAI  = websiteScan?.responsibleAI?.reachable  || lower.includes("responsible ai");
    const hasPrivacyPolicy  = websiteScan?.privacyPolicy?.reachable  || lower.includes("privacy policy");
    const hasTrustCenter    = websiteScan?.trustCenter?.reachable    || lower.includes("trust center");
    const hasFairnessRef    = lower.includes("fairness") || lower.includes("bias");
    const hasTransparency   = lower.includes("transparency") || lower.includes("model card");
    const hasHumanOversight = lower.includes("human oversight") || lower.includes("human review");
    const hasGovernance     = lower.includes("governance") || lower.includes("ai committee");
    const hasExplainability = lower.includes("explainability") || lower.includes("xai") || lower.includes("shap") || lower.includes("lime");
    const hasRiskMgmt       = lower.includes("risk management") || lower.includes("risk register");

    findings.push({
      id: "h_1", title: "AI Governance Framework",
      category: "AI Governance Framework",
      severity: hasGovernance ? "low" : "high",
      status:   hasGovernance ? "passed" : "high-risk",
      description: hasGovernance
        ? "AI governance references detected in the provided context."
        : "No AI governance framework, committee, or AI Officer detected.",
      recommendation: hasGovernance
        ? "Verify governance structure includes a named AI Officer, ethics committee, and escalation path."
        : "Establish a formal AI governance framework with a named AI Officer and ethics committee.",
    });

    findings.push({
      id: "h_2", title: "Responsible AI Policy",
      category: "Responsible AI Policy",
      severity: hasAIPolicy || hasResponsibleAI ? "low" : "high",
      status:   hasAIPolicy || hasResponsibleAI ? "passed" : "high-risk",
      description: hasAIPolicy || hasResponsibleAI
        ? "Responsible AI or AI policy references found."
        : "No formal Responsible AI policy detected.",
      recommendation: "Publish and enforce a formal Responsible AI policy with scope, principles, and accountability.",
    });

    findings.push({
      id: "h_3", title: "Transparency & Model Documentation",
      category: "Transparency",
      severity: hasTransparency ? "medium" : "high",
      status:   hasTransparency ? "needs-improvement" : "high-risk",
      description: hasTransparency
        ? "Some transparency references found, but model cards or system cards not confirmed."
        : "No transparency documentation or model cards detected.",
      recommendation: "Publish model cards covering intended use, limitations, and subgroup performance.",
    });

    findings.push({
      id: "h_4", title: "Fairness & Bias Mitigation",
      category: "Fairness",
      severity: hasFairnessRef ? "medium" : "high",
      status:   hasFairnessRef ? "needs-improvement" : "high-risk",
      description: hasFairnessRef
        ? "Fairness references found. Formal bias audit results not confirmed."
        : "No fairness assessment or bias mitigation practices detected.",
      recommendation: "Commission independent bias audits covering all protected attributes and publish results.",
    });

    findings.push({
      id: "h_5", title: "Human Oversight",
      category: "Human Oversight",
      severity: hasHumanOversight ? "low" : "high",
      status:   hasHumanOversight ? "passed" : "warning",
      description: hasHumanOversight
        ? "Human oversight mechanisms referenced."
        : "No human oversight or override mechanisms detected.",
      recommendation: "Implement documented human review checkpoints and override mechanisms for high-stakes decisions.",
    });

    findings.push({
      id: "h_6", title: "Explainability",
      category: "Explainability",
      severity: hasExplainability ? "medium" : "high",
      status:   hasExplainability ? "needs-improvement" : "high-risk",
      description: hasExplainability
        ? "Explainability techniques referenced but user-facing mechanisms not confirmed."
        : "No explainability mechanisms detected. May conflict with GDPR Article 22.",
      recommendation: "Implement LIME/SHAP or rule-based explanations and provide affected individuals with meaningful decision explanations.",
    });

    findings.push({
      id: "h_7", title: "Privacy Protection",
      category: "Privacy Protection",
      severity: hasPrivacyPolicy ? "medium" : "high",
      status:   hasPrivacyPolicy ? "needs-improvement" : "warning",
      description: hasPrivacyPolicy
        ? "Privacy policy found. Training data privacy and DPIA status not confirmed."
        : "No privacy policy detected for AI data processing.",
      recommendation: "Complete a DPIA for AI processing activities and document training data consent and retention policies.",
    });

    findings.push({
      id: "h_8", title: "Risk Management",
      category: "Risk Management",
      severity: hasRiskMgmt ? "medium" : "high",
      status:   hasRiskMgmt ? "needs-improvement" : "warning",
      description: hasRiskMgmt
        ? "Risk management references found. Formal AI risk register not confirmed."
        : "No AI risk management framework or risk register detected.",
      recommendation: "Establish a formal AI risk register with severity classifications and link to model release cycle.",
    });

    const passedCount = findings.filter((f) => f.status === "passed").length;
    const overallScore = Math.round((passedCount / findings.length) * 65) + 10;

    return {
      overallScore,
      overallRisk: overallScore >= 70 ? "low" : overallScore >= 50 ? "medium" : overallScore >= 30 ? "high" : "critical",
      summary:
        "Heuristic analysis completed. A full AI-powered ethics review could not be generated. " +
        "The context was scanned for key responsible AI signals. Manual review against NIST AI RMF, " +
        "ISO/IEC 42001, and EU AI Act is strongly recommended.",
      findings,
      recommendations: [
        {
          category: "Immediate Actions",
          priority: "critical",
          items: [
            "Establish a formal AI governance framework with a named AI Officer.",
            "Publish a Responsible AI policy and model cards for all deployed systems.",
            "Commission an independent bias audit covering all protected attributes.",
            "Conduct a DPIA for all high-risk AI processing activities.",
          ],
        },
        {
          category: "Standards Alignment",
          priority: "high",
          items: [
            "Align with NIST AI RMF GOVERN, MAP, MEASURE, MANAGE functions.",
            "Begin ISO/IEC 42001 gap assessment for AI management system certification.",
            "Review EU AI Act risk classification for all deployed AI systems.",
          ],
        },
      ],
      strengths: findings.filter((f) => f.status === "passed").map((f) => f.title),
      concerns: findings.filter((f) => f.status !== "passed").map((f) => f.title),
      scoreBreakdown: {
        aiGovernance:      hasGovernance     ? 55 : 15,
        transparency:      hasTransparency   ? 50 : 15,
        fairness:          hasFairnessRef    ? 45 : 10,
        accountability:    hasGovernance     ? 50 : 20,
        privacyProtection: hasPrivacyPolicy  ? 55 : 20,
        humanOversight:    hasHumanOversight ? 60 : 15,
        explainability:    hasExplainability ? 45 : 10,
        riskManagement:    hasRiskMgmt       ? 50 : 15,
      },
      ethicsDimensions: [
        { dimension: "AI Governance",    score: hasGovernance     ? 55 : 15, status: hasGovernance     ? "adequate" : "absent" },
        { dimension: "Transparency",     score: hasTransparency   ? 50 : 15, status: hasTransparency   ? "adequate" : "absent" },
        { dimension: "Fairness",         score: hasFairnessRef    ? 45 : 10, status: hasFairnessRef    ? "weak"     : "absent" },
        { dimension: "Accountability",   score: hasGovernance     ? 50 : 20, status: hasGovernance     ? "adequate" : "weak"   },
        { dimension: "Privacy",          score: hasPrivacyPolicy  ? 55 : 20, status: hasPrivacyPolicy  ? "adequate" : "weak"   },
        { dimension: "Human Oversight",  score: hasHumanOversight ? 60 : 15, status: hasHumanOversight ? "adequate" : "absent" },
        { dimension: "Explainability",   score: hasExplainability ? 45 : 10, status: hasExplainability ? "weak"     : "absent" },
        { dimension: "Risk Management",  score: hasRiskMgmt       ? 50 : 15, status: hasRiskMgmt       ? "adequate" : "weak"   },
      ],
      standardAlignment: [
        { standard: "NIST AI RMF",                  alignment: "absent",  gaps: ["GOVERN function not evidenced", "MAP/MEASURE/MANAGE functions not confirmed"] },
        { standard: "ISO/IEC 42001",                alignment: "absent",  gaps: ["AI management system not confirmed", "Objectives and continual improvement not documented"] },
        { standard: "OECD AI Principles",           alignment: "partial", gaps: ["Human-centred values not explicitly referenced", "Accountability mechanisms not confirmed"] },
        { standard: "EU AI Act",                    alignment: "absent",  gaps: ["Risk classification not performed", "Conformity assessment not evidenced"] },
        { standard: "Google Responsible AI",        alignment: "partial", gaps: ["Social benefit assessment not confirmed", "Safety evaluation not evidenced"] },
        { standard: "Microsoft Responsible AI Standard", alignment: "absent", gaps: ["Fairness impact assessment not confirmed", "Reliability & safety not documented"] },
      ],
    };
  }
}
