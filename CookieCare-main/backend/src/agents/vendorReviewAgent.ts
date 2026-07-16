/**
 * VendorReviewAgent
 *
 * Evaluates a vendor's privacy posture, security certifications, compliance
 * status, contractual risks, and overall onboarding risk from:
 *   - Uploaded vendor documents (PDF / DOCX / TXT)
 *   - Website intelligence from WebsiteScannerService
 *   - RAG chunks retrieved via searchHybrid()
 *
 * Follows the same pattern as DPAReviewAgent and AnalysisAgent.
 */

import { openRouterComplete } from "../services/openRouterClient.js";
import { searchHybrid } from "../RAG/ragService.js";
import { z } from "zod";
import type { WebsiteScanResult } from "../services/websiteScanner/types.js";

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const VendorFindingSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["passed", "warning", "missing", "high-risk"]),
  description: z.string(),
  evidence: z.string().optional(),
  recommendation: z.string(),
});

const VendorRecommendationSchema = z.object({
  category: z.string(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  items: z.array(z.string()),
});

const CertificationSchema = z.object({
  name: z.string(),
  status: z.enum(["confirmed", "claimed", "expired", "missing"]),
  details: z.string().optional(),
});

const ComplianceItemSchema = z.object({
  label: z.string(),
  status: z.enum(["compliant", "partial", "missing", "na"]),
  notes: z.string().optional(),
});

const ScoreBreakdownSchema = z.object({
  privacyPosture: z.number().min(0).max(100),
  securityPosture: z.number().min(0).max(100),
  gdprCompliance: z.number().min(0).max(100),
  ccpaCompliance: z.number().min(0).max(100),
  contractualRisk: z.number().min(0).max(100),
  vendorTransparency: z.number().min(0).max(100),
});

const VendorInfoSchema = z.object({
  name: z.string().optional(),
  industry: z.string().optional(),
  headquarters: z.string().optional(),
  dataRegions: z.string().optional(),
  primaryServices: z.string().optional(),
}).optional();

export const VendorReviewResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  overallRisk: z.enum(["low", "medium", "high", "critical"]),
  summary: z.string(),
  vendorInfo: VendorInfoSchema,
  findings: z.array(VendorFindingSchema),
  recommendations: z.array(VendorRecommendationSchema),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  certifications: z.array(CertificationSchema),
  compliance: z.array(ComplianceItemSchema),
  scoreBreakdown: ScoreBreakdownSchema,
});

export type VendorFinding = z.infer<typeof VendorFindingSchema>;
export type VendorRecommendation = z.infer<typeof VendorRecommendationSchema>;
export type VendorCertification = z.infer<typeof CertificationSchema>;
export type VendorComplianceItem = z.infer<typeof ComplianceItemSchema>;
export type VendorReviewResult = z.infer<typeof VendorReviewResultSchema>;

// ─── RAG retrieval query ──────────────────────────────────────────────────────

const VENDOR_RETRIEVAL_QUERY =
  "vendor privacy policy data processing GDPR CCPA compliance " +
  "ISO 27001 SOC 2 security certifications DPA subprocessors " +
  "data retention incident response international transfers trust center " +
  "cookie policy terms of service third-party risk onboarding";

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior Vendor Risk and Privacy Compliance Analyst specialising in third-party risk assessments, GDPR, CCPA, ISO 27001, SOC 2 and enterprise vendor onboarding.

Perform a comprehensive vendor risk assessment based on the provided context (uploaded documents and/or website intelligence). Evaluate ALL of the following dimensions:

1. Privacy posture (privacy policy quality, data subject rights, GDPR/CCPA alignment)
2. Security posture (security documentation, certifications, encryption, incident response)
3. GDPR compliance (lawful basis, DPA availability, Art. 28 obligations, international transfers)
4. CCPA compliance (consumer rights, data sale disclosure, opt-out mechanisms)
5. Cookie practices (consent mechanisms, cookie categories, policy clarity)
6. Security headers and technical controls (HSTS, CSP, X-Frame-Options if detectable)
7. Trust Center maturity (dedicated trust page, compliance documentation, audit reports)
8. ISO 27001 (certification presence, scope, expiry)
9. SOC 2 (Type I vs Type II, audit period, coverage)
10. Other certifications (PCI DSS, HIPAA, FedRAMP, etc.)
11. Data retention policies (defined periods, deletion obligations)
12. Incident response (documented plan, GDPR 72h notification, SLA)
13. Data transfers (SCCs, adequacy decisions, BCRs)
14. Vendor transparency (sub-processor list, update frequency, notice periods)
15. DPA availability (formal DPA, Article 28 provisions)
16. Terms of Service (liability caps, indemnity, IP, termination)
17. Overall vendor risk (onboarding readiness, contractual gaps, due diligence completeness)

CRITICAL RULES:
- Ground every finding in evidence from the provided context
- If a dimension cannot be evaluated (no relevant content), mark it as "missing" with status "missing"
- Do NOT invent certifications, policies, or facts not present in the context
- Provide concrete, actionable recommendations for every finding
- Return ONLY a valid JSON object — absolutely no markdown fences, no preamble, no commentary

The JSON must exactly match this schema:
{
  "overallScore": <integer 0-100, weighted average of all dimensions>,
  "overallRisk": "low" | "medium" | "high" | "critical",
  "summary": "<3-5 sentence executive summary of the vendor's overall risk picture>",
  "vendorInfo": {
    "name": "<company name if identifiable or null>",
    "industry": "<industry/sector if identifiable or null>",
    "headquarters": "<location if identifiable or null>",
    "dataRegions": "<data storage regions if identifiable or null>",
    "primaryServices": "<primary services/products if identifiable or null>"
  },
  "findings": [
    {
      "id": "finding_1",
      "title": "<Short finding title>",
      "category": "<Category: Privacy | Security | GDPR | CCPA | Certifications | Data Retention | Incident Response | Transfers | Subprocessors | DPA | Trust Center | Contractual | Cookie Practices>",
      "severity": "low" | "medium" | "high" | "critical",
      "status": "passed" | "warning" | "missing" | "high-risk",
      "description": "<What was found or not found>",
      "evidence": "<Specific evidence from context, quote or reference>",
      "recommendation": "<Concrete actionable recommendation>"
    }
  ],
  "recommendations": [
    {
      "category": "<Category name e.g. Missing Documentation | Suggested Improvements | Risk Mitigation | Compliance Recommendations>",
      "priority": "critical" | "high" | "medium" | "low",
      "items": ["<Actionable item 1>", "<item 2>"]
    }
  ],
  "strengths": ["<Strength 1>", "<Strength 2>"],
  "concerns": ["<Concern 1>", "<Concern 2>"],
  "certifications": [
    {
      "name": "<ISO 27001 | SOC 2 Type II | SOC 2 Type I | PCI DSS | HIPAA | FedRAMP | Other>",
      "status": "confirmed" | "claimed" | "expired" | "missing",
      "details": "<Scope, expiry, coverage or null>"
    }
  ],
  "compliance": [
    {
      "label": "<GDPR | CCPA | ISO 27001 | SOC 2 | HIPAA | PCI DSS | etc.>",
      "status": "compliant" | "partial" | "missing" | "na",
      "notes": "<Brief explanation>"
    }
  ],
  "scoreBreakdown": {
    "privacyPosture": <0-100>,
    "securityPosture": <0-100>,
    "gdprCompliance": <0-100>,
    "ccpaCompliance": <0-100>,
    "contractualRisk": <0-100>,
    "vendorTransparency": <0-100>
  }
}`;

// ─── Context assembly helpers ─────────────────────────────────────────────────

/**
 * Summarise a WebsiteScanResult into a compact, AI-readable string.
 * Avoids sending raw HTML or excessive crawl data.
 */
function summariseWebsiteIntelligence(scanResult: WebsiteScanResult): string {
  const lines: string[] = [
    `[WEBSITE INTELLIGENCE]`,
    `Homepage: ${scanResult.homepage}`,
    `Scanned at: ${scanResult.scannedAt}`,
    `Discovered pages: ${scanResult.discoveredPages.length}`,
  ];

  if (scanResult.metadata) {
    const m = scanResult.metadata;
    if (m.title)       lines.push(`Site title: ${m.title}`);
    if (m.description) lines.push(`Meta description: ${m.description}`);
    if (m.language)    lines.push(`Language: ${m.language}`);

    const relevantHeaders = ["content-security-policy", "strict-transport-security",
      "x-frame-options", "x-content-type-options", "permissions-policy",
      "referrer-policy", "x-xss-protection"];
    const foundHeaders = relevantHeaders.filter(h => h in (m.headers ?? {}));
    if (foundHeaders.length > 0) {
      lines.push(`Security headers present: ${foundHeaders.join(", ")}`);
    } else {
      lines.push(`Security headers: none detected`);
    }

    if (m.openGraph && Object.keys(m.openGraph).length > 0) {
      const ogTitle = m.openGraph["og:title"] || m.openGraph["title"];
      if (ogTitle) lines.push(`OG title: ${ogTitle}`);
    }
  }

  const compliancePages: Record<string, typeof scanResult.privacyPolicy> = {
    "Privacy Policy": scanResult.privacyPolicy,
    "Cookie Policy":  scanResult.cookiePolicy,
    "Security Page":  scanResult.securityPage,
    "Trust Center":   scanResult.trustCenter,
    "Terms":          scanResult.terms,
    "Legal":          scanResult.legal,
    "DPA":            scanResult.dpa,
    "AI Policy":      scanResult.aiPolicy,
    "Responsible AI": scanResult.responsibleAI,
  };

  lines.push(`\n[COMPLIANCE PAGES DISCOVERED]`);
  for (const [name, page] of Object.entries(compliancePages)) {
    if (page && page.reachable) {
      lines.push(`✓ ${name}: ${page.url} (HTTP ${page.statusCode})`);
    } else if (page && !page.reachable) {
      lines.push(`✗ ${name}: found but not reachable (HTTP ${page.statusCode})`);
    } else {
      lines.push(`✗ ${name}: not found`);
    }
  }

  const reachableCount = Object.values(compliancePages).filter(p => p?.reachable).length;
  lines.push(`\nCompliance pages reachable: ${reachableCount} / ${Object.keys(compliancePages).length}`);

  return lines.join("\n");
}

// ─── Agent class ──────────────────────────────────────────────────────────────

export class VendorReviewAgent {
  /**
   * Review a vendor using merged context from documents and/or website scan.
   *
   * @param params.documentText   Merged plaintext from uploaded documents (may be empty)
   * @param params.websiteScan    Structured website intelligence (may be null)
   * @param params.userId         User ID for scoped RAG retrieval
   * @param params.fileIds        Indexed file IDs for RAG retrieval scope
   */
  async reviewVendor(params: {
    documentText: string;
    websiteScan: WebsiteScanResult | null;
    userId: string;
    fileIds?: string[];
  }): Promise<VendorReviewResult> {
    const { documentText, websiteScan, userId, fileIds } = params;

    console.log(
      `[VendorReviewAgent] reviewVendor called — userId=${userId} ` +
        `fileIds=${fileIds && fileIds.length > 0 ? fileIds.join(", ") : "(none — ephemeral)"} ` +
        `documentText length=${documentText.length} websiteScan=${websiteScan ? "yes" : "no"}`
    );

    // ── 1. RAG retrieval ────────────────────────────────────────────────────
    // Only retrieve RAG chunks when specific fileIds are provided so we scope
    // the search to the uploaded files. Without fileIds the search spans the
    // entire user knowledge base and the last-resort fallback inside
    // searchHybrid returns unrelated documents (e.g. Playbook.pdf), which
    // then replace the actual uploaded content.
    let ragContext = "";
    if (fileIds && fileIds.length > 0) {
      try {
        const chunks = await searchHybrid(
          VENDOR_RETRIEVAL_QUERY,
          userId,
          fileIds
        );

        // Guard: discard any chunks that don't belong to one of the requested files.
        const ownChunks    = chunks.filter((c) => fileIds.includes(c.file_id));
        const foreignChunks = chunks.filter((c) => !fileIds.includes(c.file_id));

        if (foreignChunks.length > 0) {
          console.warn(
            `[VendorReviewAgent] Discarding ${foreignChunks.length} chunk(s) from unrelated files: ` +
              foreignChunks.map((c) => c.title ?? c.file_id).join(", ")
          );
        }

        if (ownChunks.length > 0) {
          ragContext = ownChunks
            .map((c) => `[${c.title ?? "Vendor Document"}]\n${c.content}`)
            .join("\n\n");
          console.log(
            `[VendorReviewAgent] Using ${ownChunks.length} RAG chunk(s) from the uploaded file(s) for context`
          );
        } else {
          console.log(
            `[VendorReviewAgent] No indexed chunks found for provided fileIds — falling back to raw document text`
          );
        }
      } catch (ragErr) {
        console.warn(
          "[VendorReviewAgent] RAG retrieval failed, continuing without it:",
          (ragErr as Error).message
        );
      }
    } else {
      console.log(
        "[VendorReviewAgent] No fileIds provided — skipping RAG to avoid returning chunks from unrelated documents"
      );
    }

    // ── 2. Assemble context ─────────────────────────────────────────────────
    const contextParts: string[] = [];

    if (websiteScan) {
      contextParts.push(summariseWebsiteIntelligence(websiteScan));
    }

    // Prefer RAG chunks (scoped to uploaded file); fall back to raw doc text (capped)
    if (ragContext.length > 0) {
      contextParts.push(`[DOCUMENT CONTEXT (RAG — uploaded file)]\n${ragContext}`);
    } else if (documentText.length > 0) {
      // Cap to avoid token overflow; 12 000 chars is ~3 000 tokens
      contextParts.push(
        `[DOCUMENT CONTENT]\n${documentText.substring(0, 12000)}` +
          (documentText.length > 12000 ? "\n...[truncated]" : "")
      );
    }

    const assembledContext = contextParts.join("\n\n");

    console.log(
      `[VendorReviewAgent] Context assembled — ` +
        `websiteScan=${websiteScan ? "yes" : "no"}, ` +
        `contextSource=${ragContext.length > 0 ? "RAG chunks from uploaded file(s)" : documentText.length > 0 ? "raw document text" : "website only"}, ` +
        `rawDocLen=${documentText.length}, ` +
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
        }).some((p: any) => p?.reachable));

    const hasDocumentContent = ragContext.length > 0 || documentText.length > 100;

    if (!hasWebsiteContent && !hasDocumentContent) {
      console.warn(
        "[VendorReviewAgent] No usable content retrieved — refusing heuristic analysis."
      );
      throw new Error(
        "We couldn't retrieve enough content from this website to perform an analysis. " +
          "Please try again later or upload supporting documents."
      );
    }

    // ── 3. Build user prompt ────────────────────────────────────────────────
    const userPrompt = `[VENDOR ASSESSMENT CONTEXT]
${assembledContext}

Perform a comprehensive vendor risk assessment based on the above context. Evaluate all dimensions as specified. Return only the structured JSON.`;

    // ── 4. Call OpenRouter ──────────────────────────────────────────────────
    let responseText: string;
    try {
      console.log(
        `[VendorReviewAgent] Calling OpenRouter — prompt length: ${userPrompt.length} chars`
      );
      responseText = await openRouterComplete(SYSTEM_PROMPT, userPrompt, {
        jsonMode: true,
        temperature: 0.2,
        maxTokens: 4096,
      });
    } catch (llmErr) {
      console.error("[VendorReviewAgent] OpenRouter call failed:", llmErr);
      throw llmErr;
    }

    // ── 5. Parse and validate ───────────────────────────────────────────────
    responseText = responseText.trim();

    console.log(
      `[VendorReviewAgent] Raw LLM response (${responseText.length} chars):\n` +
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
        "[VendorReviewAgent] JSON parse failed. Falling back to heuristic analysis.\n",
        responseText.substring(0, 500)
      );
      // hasDocumentContent / hasWebsiteContent are guaranteed true here
      // (we already threw above when both were false).
      return this.heuristicFallback(documentText, websiteScan);
    }

    // ── 6. Normalise fields the model may omit or return as null ───────────
    let normalizationApplied = false;

    const ensureArray = (val: any, key: string): any[] => {
      if (!Array.isArray(val)) { normalizationApplied = true; return []; }
      return val;
    };

    parsed.findings        = ensureArray(parsed.findings,        "findings");
    parsed.recommendations = ensureArray(parsed.recommendations, "recommendations");
    parsed.strengths       = ensureArray(parsed.strengths,       "strengths");
    parsed.concerns        = ensureArray(parsed.concerns,        "concerns");
    parsed.certifications  = ensureArray(parsed.certifications,  "certifications");
    parsed.compliance      = ensureArray(parsed.compliance,      "compliance");

    // vendorInfo: coerce the whole field and each nullable string to a safe default
    if (!parsed.vendorInfo || typeof parsed.vendorInfo !== "object") {
      parsed.vendorInfo = {};
      normalizationApplied = true;
    }
    const vi = parsed.vendorInfo;
    const nullToUndefined = (v: any) => (v === null || v === undefined ? undefined : String(v));
    vi.name             = nullToUndefined(vi.name);
    vi.industry         = nullToUndefined(vi.industry);
    vi.headquarters     = nullToUndefined(vi.headquarters);
    vi.dataRegions      = nullToUndefined(vi.dataRegions);
    vi.primaryServices  = nullToUndefined(vi.primaryServices);
    // If the model set any of these to null, we've now removed them — flag it
    if (Object.values(vi).some((v) => v === null)) normalizationApplied = true;

    if (!parsed.scoreBreakdown || typeof parsed.scoreBreakdown !== "object") {
      parsed.scoreBreakdown = {
        privacyPosture:    50,
        securityPosture:   50,
        gdprCompliance:    50,
        ccpaCompliance:    50,
        contractualRisk:   50,
        vendorTransparency:50,
      };
      normalizationApplied = true;
    } else {
      // Fill missing sub-keys and clamp values
      const sbDefaults: Record<string, number> = {
        privacyPosture: 50, securityPosture: 50, gdprCompliance: 50,
        ccpaCompliance: 50, contractualRisk: 50, vendorTransparency: 50,
      };
      for (const key of Object.keys(sbDefaults)) {
        const val = parsed.scoreBreakdown[key];
        if (typeof val !== "number") {
          parsed.scoreBreakdown[key] = sbDefaults[key];
          normalizationApplied = true;
        } else {
          parsed.scoreBreakdown[key] = Math.max(0, Math.min(100, val));
        }
      }
    }

    // Normalise finding severity and status
    parsed.findings = parsed.findings.map((f: any, i: number) => ({
      ...f,
      id:       f.id ?? `finding_${i + 1}`,
      severity: ["low","medium","high","critical"].includes(f.severity) ? f.severity : "medium",
      status:   ["passed","warning","missing","high-risk"].includes(f.status)  ? f.status  : "warning",
    }));

    // Normalise recommendation priority and items
    parsed.recommendations = parsed.recommendations.map((r: any) => ({
      ...r,
      priority: ["critical","high","medium","low"].includes(r.priority) ? r.priority : "medium",
      items:    Array.isArray(r.items) ? r.items : [],
    }));

    // Normalise certifications — status enum + null details → undefined
    parsed.certifications = parsed.certifications.map((c: any) => {
      const cert: any = {
        name:   c.name ?? "Unknown",
        status: ["confirmed","claimed","expired","missing"].includes(c.status) ? c.status : "missing",
      };
      // details is optional — convert null to undefined so Zod's .optional() accepts it
      if (c.details !== null && c.details !== undefined) {
        cert.details = String(c.details);
      }
      if (c.details === null) normalizationApplied = true;
      return cert;
    });

    // Normalise compliance — status enum + null notes → undefined
    parsed.compliance = parsed.compliance.map((c: any) => {
      const item: any = {
        label:  c.label ?? "Unknown",
        status: ["compliant","partial","missing","na"].includes(c.status) ? c.status : "missing",
      };
      if (c.notes !== null && c.notes !== undefined) {
        item.notes = String(c.notes);
      }
      if (c.notes === null) normalizationApplied = true;
      return item;
    });

    // Normalise overallRisk
    if (!["low","medium","high","critical"].includes(parsed.overallRisk)) {
      parsed.overallRisk = "medium";
      normalizationApplied = true;
    }

    // Normalise overallScore
    if (typeof parsed.overallScore !== "number") {
      parsed.overallScore = 50;
      normalizationApplied = true;
    }

    if (normalizationApplied) {
      console.log(
        "[VendorReviewAgent] Normalization applied — LLM used a non-standard or partial shape. " +
          "Keys present in raw response: " + Object.keys(parsed).join(", ")
      );
    } else {
      console.log("[VendorReviewAgent] No normalization needed — LLM output matched expected schema");
    }

    console.log(
      "[VendorReviewAgent] Normalized object (pre-Zod):",
      JSON.stringify(parsed, null, 2).substring(0, 3000)
    );

    // ── 7. Zod validation ───────────────────────────────────────────────────
    try {
      return VendorReviewResultSchema.parse(parsed);
    } catch (validationErr) {
      console.warn(
        "[VendorReviewAgent] Zod validation failed after normalization. Falling back to heuristic.\n",
        JSON.stringify((validationErr as any)?.errors ?? validationErr, null, 2)
      );
      return this.heuristicFallback(documentText, websiteScan);
    }
  }

  // ── Heuristic fallback ────────────────────────────────────────────────────
  private heuristicFallback(
    content: string,
    websiteScan: WebsiteScanResult | null
  ): VendorReviewResult {
    const lower = content.toLowerCase();
    const findings: VendorFinding[] = [];

    // Privacy policy check
    const hasPrivacyPolicy = websiteScan?.privacyPolicy?.reachable || lower.includes("privacy policy");
    findings.push({
      id: "h_1",
      title: "Privacy Policy",
      category: "Privacy",
      severity: hasPrivacyPolicy ? "low" : "high",
      status:   hasPrivacyPolicy ? "passed" : "missing",
      description: hasPrivacyPolicy
        ? "A privacy policy was identified in the provided context."
        : "No privacy policy was detected in the provided context.",
      recommendation: hasPrivacyPolicy
        ? "Review the privacy policy for GDPR lawful basis, data subject rights, and retention periods."
        : "Request a formal privacy policy before onboarding.",
    });

    // DPA check
    const hasDPA = websiteScan?.dpa?.reachable || lower.includes("data processing agreement") || lower.includes(" dpa ");
    findings.push({
      id: "h_2",
      title: "DPA Availability",
      category: "GDPR",
      severity: hasDPA ? "low" : "high",
      status:   hasDPA ? "passed" : "missing",
      description: hasDPA
        ? "A Data Processing Agreement reference was detected."
        : "No Data Processing Agreement was identified.",
      recommendation: hasDPA
        ? "Ensure the DPA covers all GDPR Article 28 mandatory provisions."
        : "Require a signed DPA before any personal data processing begins.",
    });

    // ISO 27001
    const hasISO = lower.includes("iso 27001") || lower.includes("iso27001");
    findings.push({
      id: "h_3",
      title: "ISO 27001 Certification",
      category: "Certifications",
      severity: hasISO ? "low" : "medium",
      status:   hasISO ? "passed" : "warning",
      description: hasISO
        ? "ISO 27001 reference detected in provided documentation."
        : "No ISO 27001 certification evidence found.",
      recommendation: hasISO
        ? "Verify the certificate is current and its scope covers the services in use."
        : "Request a current ISO 27001 certificate with audit scope.",
    });

    // SOC 2
    const hasSOC2 = lower.includes("soc 2") || lower.includes("soc2");
    findings.push({
      id: "h_4",
      title: "SOC 2 Report",
      category: "Certifications",
      severity: hasSOC2 ? "low" : "medium",
      status:   hasSOC2 ? "warning" : "missing",
      description: hasSOC2
        ? "SOC 2 reference detected. Verify whether Type II (preferred) is available."
        : "No SOC 2 report evidence found.",
      recommendation: "Request a current SOC 2 Type II report covering at least 6 months.",
    });

    // Website compliance pages
    if (websiteScan) {
      const trustCenter = websiteScan.trustCenter?.reachable;
      findings.push({
        id: "h_5",
        title: "Trust Center",
        category: "Trust Center",
        severity: trustCenter ? "low" : "medium",
        status:   trustCenter ? "passed" : "missing",
        description: trustCenter
          ? `Trust Center page found at ${websiteScan.trustCenter!.url}`
          : "No dedicated Trust Center page was found on the vendor website.",
        recommendation: trustCenter
          ? "Review the Trust Center for current certifications, audit reports, and sub-processor list."
          : "Request that the vendor publish a Trust Center with compliance documentation.",
      });
    }

    const passedCount = findings.filter(f => f.status === "passed").length;
    const overallScore = Math.round((passedCount / findings.length) * 70) + 10;

    return {
      overallScore,
      overallRisk: overallScore >= 70 ? "low" : overallScore >= 50 ? "medium" : "high",
      summary:
        "Heuristic analysis completed. A full AI-powered review could not be generated. " +
        "The context was scanned for key compliance signals. Manual review is strongly recommended.",
      vendorInfo: {
        name: undefined,
        industry: undefined,
        headquarters: undefined,
        dataRegions: undefined,
        primaryServices: undefined,
      },
      findings,
      recommendations: [
        {
          category: "Immediate Actions",
          priority: "critical",
          items: [
            "Conduct a manual vendor due diligence review.",
            "Request DPA, privacy policy, and current security certifications.",
            "Verify sub-processor list and international transfer mechanisms.",
          ],
        },
      ],
      strengths: findings.filter(f => f.status === "passed").map(f => f.title),
      concerns:  findings.filter(f => f.status !== "passed").map(f => f.title),
      certifications: [
        { name: "ISO 27001",    status: lower.includes("iso 27001") ? "claimed" : "missing" },
        { name: "SOC 2 Type II", status: lower.includes("soc 2")   ? "claimed" : "missing" },
      ],
      compliance: [
        { label: "GDPR",      status: hasDPA ? "partial" : "missing", notes: "DPA availability check" },
        { label: "CCPA",      status: "missing", notes: "No CCPA evidence in context" },
        { label: "ISO 27001", status: hasISO  ? "partial" : "missing" },
        { label: "SOC 2",     status: hasSOC2 ? "partial" : "missing" },
      ],
      scoreBreakdown: {
        privacyPosture:     hasPrivacyPolicy ? 60 : 20,
        securityPosture:    hasISO ? 65 : 25,
        gdprCompliance:     hasDPA ? 55 : 15,
        ccpaCompliance:     20,
        contractualRisk:    40,
        vendorTransparency: websiteScan?.trustCenter?.reachable ? 60 : 20,
      },
    };
  }
}
