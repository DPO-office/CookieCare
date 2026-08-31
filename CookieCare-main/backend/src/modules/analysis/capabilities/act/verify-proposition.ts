import { executeJsonCompletion, LLMProvider, LLMTask } from "../../../../llm/index.js";
import {
  VERIFY_PROPOSITION_SCHEMA,
  VERIFY_PROPOSITION_SYSTEM_PROMPT,
  buildVerifyPropositionUserPrompt,
} from "../../prompts/verify-proposition.js";

export type VerifyVerdict = "proves" | "contradicts" | "related_not_proof" | "irrelevant";

export interface VerifyPropositionInput {
  hypothesis: string;
  proofStandard: string;
  candidatePassage: string;
  /** Optional locator shown to the model for context in its rationale only. */
  candidateLocator?: string;
}

export interface VerifyDependency {
  document: string;
  whyNeeded: string;
}

export interface VerifyPropositionResult {
  verdict: VerifyVerdict;
  /** The model's claimed supporting quote — see `quoteVerified` before trusting it. */
  quote: string;
  rationale: string;
  /**
   * Deterministic check that `quote` actually appears verbatim (whitespace-
   * normalized) in the candidate passage. When false, the verdict is
   * downgraded — a claimed `proves`/`contradicts` with a fabricated quote is
   * never trustworthy, regardless of what the model said.
   */
  quoteVerified: boolean;
  /**
   * ACT-Phase 7 enrichment — VERIFY is the only stage that ever reads the
   * evidence, so these capture the rich reasoning behind the verdict as
   * structured data instead of discarding it once a verdict is picked.
   * Populated selectively depending on the verdict; see the system prompt.
   */
  establishedBy?: string;
  gapDescription?: string;
  dependency?: VerifyDependency;
  structuralNote?: string;
  remediation?: string;
}

interface RawVerifyOutput {
  verdict: VerifyVerdict;
  quote: string;
  rationale: string;
  establishedBy?: string;
  gapDescription?: string;
  dependency?: VerifyDependency;
  structuralNote?: string;
  remediation?: string;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Deterministic verbatim check — same discipline as the Drafting module's
 * `run-critique.ts` (`evidenceVerified`) and PLAN's `findVerbatimSpan`: a
 * quote only counts if it is actually a substring of the passage it claims
 * to come from, whitespace-normalized. Never trust a model's self-report.
 */
function quoteAppearsIn(quote: string, passage: string): boolean {
  const q = normalize(quote);
  if (!q) return false;
  return normalize(passage).includes(q);
}

function enrichmentFields(raw: RawVerifyOutput) {
  return {
    establishedBy: raw.establishedBy?.trim() || undefined,
    gapDescription: raw.gapDescription?.trim() || undefined,
    dependency:
      raw.dependency?.document?.trim() && raw.dependency?.whyNeeded?.trim()
        ? { document: raw.dependency.document.trim(), whyNeeded: raw.dependency.whyNeeded.trim() }
        : undefined,
    structuralNote: raw.structuralNote?.trim() || undefined,
    remediation: raw.remediation?.trim() || undefined,
  };
}

/**
 * ACT-Phase 4 — the VERIFY primitive (research doc §2.1 stage 2). Given one
 * candidate passage and one proposition with an explicit proof standard,
 * decide proves / contradicts / related_not_proof / irrelevant — with a
 * verbatim, deterministically-checked quote. This is the single function
 * that replaces keyword/hint similarity scoring with actual entailment
 * judgment; identical for any regime, doc type, or ad-hoc PLAN-authored
 * proposition — only the proofStandard string varies per call.
 *
 * ACT-Phase 7 extends the output with enrichment fields (establishedBy,
 * gapDescription, dependency, structuralNote, remediation) — VERIFY is the
 * only stage that ever reads the evidence, so it captures the rich
 * reasoning behind its verdict as structured data rather than discarding it.
 */
export async function verifyProposition(
  input: VerifyPropositionInput
): Promise<VerifyPropositionResult> {
  const prompt = buildVerifyPropositionUserPrompt(input);

  const raw = await executeJsonCompletion<RawVerifyOutput>(
    prompt,
    VERIFY_PROPOSITION_SYSTEM_PROMPT,
    VERIFY_PROPOSITION_SCHEMA,
    LLMTask.CRITIQUE_CHECKLIST,
    LLMProvider.GEMINI
  );

  if (raw.verdict === "irrelevant" || !raw.quote.trim()) {
    return {
      verdict: raw.verdict,
      quote: raw.quote,
      rationale: raw.rationale,
      quoteVerified: raw.quote.trim().length === 0,
      ...enrichmentFields(raw),
    };
  }

  const quoteVerified = quoteAppearsIn(raw.quote, input.candidatePassage);

  if (!quoteVerified && (raw.verdict === "proves" || raw.verdict === "contradicts")) {
    return {
      verdict: "related_not_proof",
      quote: raw.quote,
      rationale: `Downgraded from "${raw.verdict}" — claimed quote does not appear verbatim in the candidate passage. Original rationale: ${raw.rationale}`,
      quoteVerified: false,
      ...enrichmentFields(raw),
    };
  }

  return {
    verdict: raw.verdict,
    quote: raw.quote,
    rationale: raw.rationale,
    quoteVerified,
    ...enrichmentFields(raw),
  };
}
