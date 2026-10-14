/**
 * Structural / absence pass (V2 Stage 1a).
 *
 * Drives the rubric: for each rule, judge present_adequate | present_inadequate
 * | absent using retrieved evidence. Fixed rule set ⇒ stable. Emits candidates
 * for inadequate/absent only. Must-catch rules are flagged so the pipeline never
 * drops them silently.
 */
import { executeJsonCompletion, LLMProvider, LLMTask } from "../../../llm/index.js";
import { Candidate, ClauseSegment, emptyFactors } from "./types.js";
import { RubricRule } from "./rubric.js";
import { RetrievalIndex } from "./retrieve.js";
import { locateQuote } from "./segment.js";

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["ruleId", "verdict", "rationale"],
        properties: {
          ruleId: { type: "string" },
          verdict: { type: "string", enum: ["present_adequate", "present_inadequate", "absent"] },
          evidenceClauseRef: { type: ["string", "null"] },
          quote: { type: ["string", "null"], description: "Verbatim snippet from the cited clause; null if absent." },
          rationale: { type: "string" },
        },
      },
    },
  },
};

const SYSTEM = `You are a data-protection contract reviewer performing a STRUCTURAL checklist review.
For each rule you are given the rule's question and the most relevant clauses retrieved from the document (each with a clauseRef).
Decide, for each rule:
  - "present_adequate": the document addresses it adequately.
  - "present_inadequate": it is addressed but weak/one-sided/illusory.
  - "absent": the document does not address it at all.
Rules:
  1. Base your verdict ONLY on the provided clauses and your knowledge of what the rule requires.
  2. For present_inadequate, cite the clauseRef and copy a short VERBATIM quote from that clause.
  3. For absent, set evidenceClauseRef and quote to null.
  4. Do NOT invent quotes. Do NOT mark something absent if a provided clause clearly covers it.
Return ONLY the JSON object.`;

export interface StructuralOutcome {
  candidates: Candidate[];
  llmCalls: number;
  raw: any;
}

export async function runStructuralPass(
  documentText: string,
  rules: RubricRule[],
  index: RetrievalIndex,
): Promise<StructuralOutcome> {
  // Build a compact per-rule evidence block.
  const ruleBlocks: string[] = [];
  const evidenceByRule = new Map<string, ClauseSegment[]>();
  for (const r of rules) {
    const ev = index.retrieveForRule(r, 3);
    evidenceByRule.set(r.ruleId, ev);
    const evText = ev.length
      ? ev.map((s) => `    [${s.clauseRef} — ${s.headingPath}] ${s.text.slice(0, 400).replace(/\s+/g, " ")}`).join("\n")
      : "    (no closely-matching clause retrieved)";
    ruleBlocks.push(`- ruleId: ${r.ruleId}\n  question: ${r.question}\n  clauses:\n${evText}`);
  }
  const userPrompt = `RULES AND RETRIEVED CLAUSES:\n${ruleBlocks.join("\n\n")}\n\nReturn a verdict for every ruleId.`;

  const raw = await executeJsonCompletion<{ results: any[] }>(
    userPrompt, SYSTEM, SCHEMA, LLMTask.STRUCTURAL_JSON, LLMProvider.GEMINI,
  );

  const ruleById = new Map(rules.map((r) => [r.ruleId, r]));
  const candidates: Candidate[] = [];
  for (const res of raw?.results ?? []) {
    const rule = ruleById.get(res.ruleId);
    if (!rule) continue;
    if (res.verdict === "present_adequate") continue;

    const isAbsence = res.verdict === "absent";
    const factors = emptyFactors();
    if (isAbsence) factors.absenceOfRequiredTerm = true;
    else factors.unilateralOrOneSidedRight = true;
    // Only HIGH-value categories carry regulatory weight (→ RED when absent).
    // A missing minor structural element (duration, nature/purpose, staff
    // confidentiality) stays YELLOW rather than RED.
    const highValue =
      rule.severityHintIfAbsent === "high" ||
      /liability|transfer|subprocessor/i.test(rule.ruleId) ||
      /missing_limitation_of_liability|dpa_subprocessor_gap|dpa_transfer_mechanism_gap|dpa_deletion_gap/.test(rule.findingCategory);
    if (highValue) factors.regulatoryMandatedTerm = true;
    if (/transfer/i.test(rule.ruleId)) factors.internationalTransferRisk = true;

    const quote = typeof res.quote === "string" ? res.quote : "";
    const off = quote ? locateQuote(quote, documentText) : -1;
    // Anti-hallucination: a present_inadequate must cite a quote that exists.
    if (!isAbsence && (!quote || off === -1)) {
      // Downgrade unverifiable "inadequate" to a soft absence-style flag only if must-catch;
      // otherwise skip (the critic would drop it anyway).
      if (!rule.mustCatch) continue;
    }
    const clauseRef = (typeof res.evidenceClauseRef === "string" && res.evidenceClauseRef) || (evidenceByRule.get(rule.ruleId)?.[0]?.clauseRef ?? "doc-level");

    // topic = the primary specific clause type (for cross-location structural
    // merge). Generic types are excluded from cross-merge in merge.ts.
    const topic = (rule.appliesToClauseTypes ?? []).find((t) => t !== "data_protection") ?? rule.appliesToClauseTypes?.[0];
    candidates.push({
      source: "structural",
      issueTag: rule.findingCategory,
      ruleId: rule.ruleId,
      topic,
      isAbsence,
      clauseRefs: [clauseRef],
      evidence: quote && off !== -1 ? [{ clauseRef, quote, charOffset: off }] : [],
      reasoning: res.rationale || rule.label,
      factors,
      mustCatchRule: rule.mustCatch,
    });
  }

  return { candidates, llmCalls: 1, raw };
}
