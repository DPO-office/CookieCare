/**
 * vulnReportService.ts
 *
 * AI Executive Security Reporting for the Vulnerability Scanner.
 *
 * ARCHITECTURE PRINCIPLES:
 *   - Receives ONLY the structured output already produced by the deterministic scanner.
 *   - Never inspects the target URL, never fetches HTML, never runs any checks.
 *   - The AI SUMMARISES and EXPLAINS — it does not detect or invent.
 *   - If this service throws or times out, the caller must log and continue.
 *     The parent scan result is always returned regardless.
 *
 * JSON SCHEMA (returned by AI, validated here):
 *   {
 *     executiveSummary: string[],      // 2–4 paragraphs
 *     priorityActions: Array<{
 *       title: string,
 *       priority: "High" | "Medium" | "Low",
 *       reason: string
 *     }>,
 *     positiveFindings: string[],      // confirmed-good security practices
 *     riskNarrative: string            // one paragraph
 *   }
 */

import { openRouterComplete } from "./openRouterClient.js";

// ── Public types ─────────────────────────────────────────────────────────────

export interface VulnScanFinding {
  name: string;
  vector: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  remediation: string;
}

export interface VulnScanInput {
  url: string;
  securityScore: number;
  overallRisk: "HIGH" | "MEDIUM" | "LOW";
  findings: VulnScanFinding[];
  passedChecks: number;
  failedChecks: number;
  totalChecks: number;
}

export interface PriorityAction {
  title: string;
  priority: "High" | "Medium" | "Low";
  reason: string;
}

export interface AiSecurityReport {
  executiveSummary: string[];
  priorityActions: PriorityAction[];
  positiveFindings: string[];
  riskNarrative: string;
}

// ── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior application-security consultant writing an executive security report for a non-technical audience.

You have been given the structured output of a deterministic security scanner.
Your role is to summarise, explain, and prioritise the findings already detected.

STRICT RULES — you MUST follow all of these:
- Do NOT invent, fabricate, or speculate about vulnerabilities.
- Do NOT mention any vulnerability or risk that is not already present in the provided findings list.
- Do NOT contradict the scanner's findings.
- Do NOT inspect or fetch the target URL.
- If the findings list is empty, state that no issues were found. Do not suggest hypothetical problems.
- Base every statement exclusively on the provided structured data.
- Use plain, business-friendly language. Avoid jargon where possible.
- Be concise. Executive audiences read quickly.

You must respond with a valid JSON object matching this exact schema:
{
  "executiveSummary": ["<paragraph 1>", "<paragraph 2>"],
  "priorityActions": [
    { "title": "<short title>", "priority": "High|Medium|Low", "reason": "<1–2 sentences>" }
  ],
  "positiveFindings": ["<confirmed good practice 1>", "..."],
  "riskNarrative": "<single paragraph>"
}

Rules for each field:
- executiveSummary: 2 to 4 strings (each is one paragraph). Cover: overall posture, most important risks, any positives, business impact context.
- priorityActions: 3 to 5 items ordered by importance (High first). Only include actions for findings that were actually detected. If there are no findings, return an empty array.
- positiveFindings: Only list practices that are CONFIRMED present (e.g., HTTPS enabled is only listed when the URL is HTTPS and no HTTPS-not-enforced finding was detected). If nothing positive is confirmed, return an empty array.
- riskNarrative: One paragraph explaining what the score means in practical terms.`;

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Generate an executive AI security report from deterministic scanner output.
 *
 * Returns null if the AI call fails or times out — the caller must treat null
 * as "report unavailable" and continue returning the scan result normally.
 */
export async function generateVulnReport(
  input: VulnScanInput
): Promise<AiSecurityReport | null> {
  const userPrompt = buildUserPrompt(input);

  let rawText: string;
  try {
    rawText = await openRouterComplete(SYSTEM_PROMPT, userPrompt, {
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 1200,
    });
  } catch (aiErr: any) {
    console.warn(
      `[VulnReport] AI call failed — scan result unaffected. Reason: ${aiErr.message}`
    );
    return null;
  }

  return parseAndValidateReport(rawText);
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildUserPrompt(input: VulnScanInput): string {
  const { url, securityScore, overallRisk, findings, passedChecks, failedChecks, totalChecks } = input;

  const findingLines = findings.length === 0
    ? "  (none — the scan detected no vulnerabilities)"
    : findings
        .map((f, i) =>
          `  ${i + 1}. [${f.severity}] ${f.name}\n` +
          `     Vector: ${f.vector}\n` +
          `     Remediation: ${f.remediation}`
        )
        .join("\n\n");

  return `Please generate an executive security report for the following scan result.

TARGET URL: ${url}
SECURITY SCORE: ${securityScore}/100
OVERALL RISK: ${overallRisk}
CHECKS RUN: ${totalChecks} total — ${passedChecks} passed, ${failedChecks} failed

FINDINGS (${findings.length} total):
${findingLines}

Remember: only reference the findings listed above. Do not invent or speculate.`;
}

// ── Response parser / validator ───────────────────────────────────────────────

function parseAndValidateReport(raw: string): AiSecurityReport | null {
  let cleaned = raw.trim();

  // Strip markdown code fences if the model wrapped the JSON
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    console.warn("[VulnReport] Could not parse AI JSON response:", cleaned.substring(0, 300));
    return null;
  }

  // Validate required fields — return null rather than crashing if shape is wrong
  if (
    !Array.isArray(parsed.executiveSummary) ||
    !Array.isArray(parsed.priorityActions) ||
    !Array.isArray(parsed.positiveFindings) ||
    typeof parsed.riskNarrative !== "string"
  ) {
    console.warn("[VulnReport] AI response did not match expected schema:", JSON.stringify(parsed).substring(0, 300));
    return null;
  }

  // Sanitise: ensure executiveSummary contains only strings
  const executiveSummary: string[] = parsed.executiveSummary
    .filter((p: any) => typeof p === "string" && p.trim())
    .slice(0, 4);

  if (executiveSummary.length === 0) {
    console.warn("[VulnReport] executiveSummary contained no valid paragraphs.");
    return null;
  }

  // Sanitise priorityActions
  const VALID_PRIORITIES = new Set(["High", "Medium", "Low"]);
  const priorityActions: PriorityAction[] = parsed.priorityActions
    .filter(
      (a: any) =>
        typeof a.title === "string" &&
        typeof a.reason === "string" &&
        VALID_PRIORITIES.has(a.priority)
    )
    .slice(0, 5)
    .map((a: any) => ({
      title:    String(a.title).trim(),
      priority: a.priority as "High" | "Medium" | "Low",
      reason:   String(a.reason).trim(),
    }));

  // Sanitise positiveFindings
  const positiveFindings: string[] = parsed.positiveFindings
    .filter((s: any) => typeof s === "string" && s.trim())
    .slice(0, 8)
    .map((s: any) => String(s).trim());

  const riskNarrative = String(parsed.riskNarrative).trim();

  return {
    executiveSummary,
    priorityActions,
    positiveFindings,
    riskNarrative,
  };
}
