/**
 * Critic gate (V2 Stage 3). Uses the strong Pro tier to VERIFY a small merged
 * candidate set: evidence real? in scope? market-standard trap? canonical
 * ruleId? corrected factors? keep | minor | drop.
 *
 * Safe degradation (invariants):
 *   - evidence is ALSO verified deterministically (verbatim in the document);
 *   - if the critic call fails/malformed → criticAvailable=false, candidates are
 *     kept as UNVERIFIED (verified=false) with no aggressive drops;
 *   - a must-catch candidate is NEVER dropped (a "drop" is coerced to "minor").
 */
import { executeJsonCompletion, LLMProvider, LLMTask } from "../../../llm/index.js";
import { CriticVerdict, SeverityFactors } from "./types.js";
import type { MergedCandidate } from "./merge.js";

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "verdict", "marketStandard", "inScope", "negotiable", "reason"],
        properties: {
          id: { type: "number" },
          verdict: { type: "string", enum: ["keep", "minor", "drop"] },
          marketStandard: { type: "boolean" },
          inScope: { type: "boolean" },
          negotiable: { type: "boolean" },
          canonicalRuleId: { type: ["string", "null"] },
          reason: { type: "string" },
          factors: {
            type: ["object", "null"], additionalProperties: true,
            description: "Optional corrected subset of the severity factors.",
          },
        },
      },
    },
  },
};

const SYSTEM = `You are a senior data-protection counsel VERIFYING draft negotiation findings on a Data Processing Agreement (DPA).
For each candidate decide:
  - verdict: "keep" (a real, negotiation-worthy issue), "minor" (valid but low value), or "drop" (not an issue).
  - marketStandard: true if the clause is standard/market language that should NOT be flagged (e.g. excluding unsuccessful/DoS attempts from a breach definition; standard click-wrap acceptance; standard no-admission-of-fault).
  - inScope: true if this is a genuine DPA negotiation point (data protection / commercial risk), false for out-of-scope contract-formation trivia.
  - negotiable: true if a counterparty could realistically move on it.
  - canonicalRuleId: an optional canonical id for the issue.
  - factors: OPTIONAL corrected subset of the boolean severity factors if the draft's are wrong.
Rules:
  1. DROP market-standard or out-of-scope items. Mark genuinely low-value items "minor".
  2. Do NOT invent issues. Base decisions on the provided evidence.
  3. If a candidate is marked mustCatch, you may set "minor" but you must NOT "drop" it.
  4. SEVERITY DISCIPLINE — when returning corrected \`factors\`, reserve the high-severity
     factors (uncappedOrBroadExposure, internationalTransferRisk, irreversibleOrHardToRemedy)
     for GENUINELY severe clauses: uncapped/unlimited liability, transfers to non-adequate or
     sanctioned countries, or irreversible disclosure/loss. Ordinary negotiable imbalances —
     short notice/objection windows, a missing fixed breach deadline, foreign governing law,
     present-but-weak terms — are YELLOW: set unilateralOrOneSidedRight only, and clear the
     high-severity factors. Do not inflate ordinary imbalances to RED.
Return ONLY the JSON object.`;

export interface CriticOutcome {
  criticAvailable: boolean;
  verdicts: Map<number, CriticVerdict>;
  llmCalls: number;
  warning?: string;
  criticTier?: "pro" | "flash";  // which tier actually produced the verdicts
}

/**
 * Try the critic call on a given task tier, returning parsed verdicts or null.
 * Isolated so the caller can retry / fall back without duplicating the prompt.
 */
async function tryCritic(userPrompt: string, task: LLMTask): Promise<{ verdicts: any[] } | null> {
  try {
    const raw = await executeJsonCompletion<{ verdicts: any[] }>(userPrompt, SYSTEM, SCHEMA, task, LLMProvider.GEMINI);
    return raw && Array.isArray(raw.verdicts) ? raw : null;
  } catch {
    return null;
  }
}

/** Deterministic evidence verification: keep only quotes present in the document. */
export function verifyEvidence(c: MergedCandidate, documentText: string): { ok: boolean; verifiedQuotes: number } {
  if (c.isAbsence) return { ok: true, verifiedQuotes: 0 }; // absence has no quote to verify
  const present = c.evidence.filter((e) => e.quote && documentText.includes(e.quote));
  return { ok: present.length > 0, verifiedQuotes: present.length };
}

export async function runCriticGate(candidates: MergedCandidate[], documentText: string): Promise<CriticOutcome> {
  if (candidates.length === 0) return { criticAvailable: true, verdicts: new Map(), llmCalls: 0 };

  const items = candidates.map((c, id) => ({
    id,
    issueTag: c.issueTag,
    ruleId: c.ruleId ?? null,
    isAbsence: c.isAbsence,
    mustCatch: !!c.mustCatchRule,
    reasoning: c.reasoning,
    evidence: c.evidence.slice(0, 2).map((e) => e.quote.slice(0, 240)),
    factors: c.factors,
  }));
  const userPrompt = `CANDIDATES:\n${JSON.stringify(items, null, 1)}\n\nReturn a verdict for every id.`;

  // Tiered critic with fallback (fixes the Pro rate-limit/timeout degradation on
  // large docs): try Pro (CRITIQUE_CHECKLIST) once, retry once, then fall back to
  // the faster Flash tier (STRUCTURAL_JSON) so the critic stays AVAILABLE — its
  // pruning + factor-normalization is what keeps severity/precision calibrated.
  let llmCalls = 0;
  let criticTier: "pro" | "flash" = "pro";
  let raw: { verdicts: any[] } | null = null;
  let warning: string | undefined;

  raw = await tryCritic(userPrompt, LLMTask.CRITIQUE_CHECKLIST); llmCalls++;
  if (!raw) { raw = await tryCritic(userPrompt, LLMTask.CRITIQUE_CHECKLIST); llmCalls++; }
  if (!raw) {
    warning = "Pro critic unavailable (rate-limit/timeout) — fell back to Flash critic";
    raw = await tryCritic(userPrompt, LLMTask.STRUCTURAL_JSON); llmCalls++;
    criticTier = "flash";
  }
  if (!raw || !Array.isArray(raw.verdicts)) {
    return { criticAvailable: false, verdicts: new Map(), llmCalls, warning: "critic unavailable (Pro + Flash fallback both failed)", criticTier: undefined };
  }

  const verdicts = new Map<number, CriticVerdict>();
  for (const v of raw.verdicts) {
    if (typeof v?.id !== "number") continue;
    const cand = candidates[v.id];
    let verdict: CriticVerdict["verdict"] = v.verdict === "keep" || v.verdict === "minor" || v.verdict === "drop" ? v.verdict : "keep";
    // Invariant: never drop a must-catch candidate.
    if (verdict === "drop" && cand?.mustCatchRule) verdict = "minor";
    verdicts.set(v.id, {
      verdict,
      marketStandard: !!v.marketStandard,
      inScope: v.inScope !== false,
      negotiable: v.negotiable !== false,
      canonicalRuleId: typeof v.canonicalRuleId === "string" ? v.canonicalRuleId : undefined,
      factors: (v.factors && typeof v.factors === "object") ? (v.factors as Partial<SeverityFactors>) : undefined,
      reason: String(v.reason ?? ""),
    });
  }
  return { criticAvailable: true, verdicts, llmCalls, warning, criticTier };
}
