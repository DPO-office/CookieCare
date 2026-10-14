/**
 * Issue-spotting pass (V2 Stage 1b) with ADAPTIVE self-consistency.
 *
 * Emits severity FACTORS (booleans), never a color. Runs K samples; retention
 * protects recall:
 *   keep iff  majority(>=ceil(K/2))  OR  (high-severity factors AND >=1 vote)
 * single-vote high-severity survivors are marked provisional (critic prunes).
 * clauseRef is resolved deterministically from the verbatim quote's offset.
 */
import { executeJsonCompletion, LLMProvider, LLMTask } from "../../../llm/index.js";
import { Candidate, ClauseSegment, SeverityFactors, emptyFactors } from "./types.js";
import { locateQuote } from "./segment.js";

const CHUNK = 14000, OVERLAP = 1500;

const FACTOR_KEYS: (keyof SeverityFactors)[] = [
  "regulatoryMandatedTerm", "uncappedOrBroadExposure", "unilateralOrOneSidedRight",
  "internationalTransferRisk", "specialCategoryData", "absenceOfRequiredTerm",
  "irreversibleOrHardToRemedy", "marketStandardLanguage", "outOfScopeForDocType", "purelyCosmetic",
];

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["quote", "issueTag", "reasoning", "factors"],
        properties: {
          quote: { type: "string", description: "EXACT verbatim clause text copied from the chunk." },
          issueTag: { type: "string", description: "snake_case canonical issue label, e.g. breach_notice_no_deadline." },
          reasoning: { type: "string" },
          factors: {
            type: "object", additionalProperties: false,
            required: FACTOR_KEYS as unknown as string[],
            properties: Object.fromEntries(FACTOR_KEYS.map((k) => [k, { type: "boolean" }])),
          },
        },
      },
    },
  },
};

const SYSTEM = `You are a data-protection contract negotiator spotting negotiation-worthy clauses in a contract SECTION.
For each such clause return:
  - quote: the EXACT verbatim text copied character-for-character from the section (no paraphrase).
  - issueTag: a short snake_case label for the issue.
  - reasoning: one sentence on the negotiation risk.
  - factors: booleans describing the clause (these drive severity — do NOT output a risk colour):
      regulatoryMandatedTerm, uncappedOrBroadExposure, unilateralOrOneSidedRight,
      internationalTransferRisk, specialCategoryData, absenceOfRequiredTerm,
      irreversibleOrHardToRemedy, marketStandardLanguage (true if the clause is standard/market language),
      outOfScopeForDocType, purelyCosmetic.
Only flag clauses worth negotiating. Mark market-standard language with marketStandardLanguage=true (it will be de-prioritised).
Return ONLY the JSON object.`;

function chunk(text: string): string[] {
  if (text.length <= CHUNK) return [text];
  const out: string[] = []; let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK, text.length);
    out.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - OVERLAP;
  }
  return out;
}

function normKey(quote: string): string {
  return quote.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 100);
}

/** A candidate whose factors indicate high severity — protected on a single vote. */
function highSeverity(f: SeverityFactors): boolean {
  return (f.uncappedOrBroadExposure || f.internationalTransferRisk || f.absenceOfRequiredTerm || f.irreversibleOrHardToRemedy)
    && !f.marketStandardLanguage;
}

/** Adaptive K based on document size. */
export function adaptiveK(textLength: number, override?: number): number {
  if (override && override > 0) return override;
  return textLength > CHUNK ? 3 : 2;
}

export interface SpottingOutcome {
  candidates: Candidate[];
  llmCalls: number;
  K: number;
}

export async function runSpottingPass(
  documentText: string,
  segments: ClauseSegment[],
  kOverride?: number,
): Promise<SpottingOutcome> {
  const chunks = chunk(documentText);
  const K = adaptiveK(documentText.length, kOverride);
  let llmCalls = 0;

  // key -> { count, sample }
  const tally = new Map<string, { count: number; sample: any; factors: SeverityFactors }>();

  for (let run = 0; run < K; run++) {
    for (let ci = 0; ci < chunks.length; ci++) {
      const userPrompt = `[CONTRACT SECTION ${ci + 1}/${chunks.length}]\n${chunks[ci]}`;
      let parsed: { findings: any[] } | null = null;
      try {
        parsed = await executeJsonCompletion<{ findings: any[] }>(userPrompt, SYSTEM, SCHEMA, LLMTask.STRUCTURAL_JSON, LLMProvider.GEMINI);
      } catch { parsed = null; }
      llmCalls++;
      for (const f of parsed?.findings ?? []) {
        if (typeof f?.quote !== "string" || f.quote.trim().length < 15) continue;
        const key = normKey(f.quote);
        const factors = { ...emptyFactors(), ...(f.factors || {}) };
        const existing = tally.get(key);
        if (existing) existing.count++;
        else tally.set(key, { count: 1, sample: f, factors });
      }
    }
  }

  const need = Math.ceil(K / 2);
  const candidates: Candidate[] = [];
  for (const [, v] of tally) {
    // Retention: keep a candidate on a MAJORITY vote, OR on a single vote when it
    // is high-severity (recall-protection for the issues that matter most). This
    // balances recall against precision — keeping ALL single-vote candidates was
    // measured to add noise (precision down) without recovering the specific
    // missed issues, so it is deliberately NOT done. Single-vote high-severity
    // survivors are marked provisional so the critic still prunes them.
    const hs = highSeverity(v.factors);
    if (!(v.count >= need || (hs && v.count >= 1))) continue;
    const quote = v.sample.quote as string;
    const off = locateQuote(quote, documentText);
    if (off === -1) continue; // hallucination guard — must be verbatim in the doc
    const seg = segments.find((s) => off >= s.charStart && off < s.charEnd);
    const clauseRef = seg?.clauseRef ?? "unmatched";
    candidates.push({
      source: "spotting",
      issueTag: String(v.sample.issueTag || "other"),
      isAbsence: false,
      clauseRefs: [clauseRef],
      evidence: [{ clauseRef, quote, charOffset: off }],
      reasoning: String(v.sample.reasoning || ""),
      factors: v.factors,
      votes: v.count,
      ofRuns: K,
      provisional: v.count < need,
    });
  }

  return { candidates, llmCalls, K };
}
