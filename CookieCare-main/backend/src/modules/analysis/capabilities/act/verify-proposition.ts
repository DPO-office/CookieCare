import { executeJsonCompletion, LLMProvider, LLMTask } from "../../../../llm/index.js";
import {
  VERIFY_PROPOSITION_SCHEMA,
  VERIFY_PROPOSITION_SYSTEM_PROMPT,
  buildVerifyPropositionUserPrompt,
} from "../../prompts/verify-proposition.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { FindingApplicabilityScope } from "../../models/finding.js";
import { profileThinkingLevel } from "../../utils/profile-thinking.js";

export type VerifyVerdict = "proves" | "contradicts" | "related_not_proof" | "irrelevant";

export interface VerifyPropositionInput {
  hypothesis: string;
  proofStandard: string;
  candidatePassage: string;
  /** Optional locator shown to the model for context in its rationale only. */
  candidateLocator?: string;
  /** Nearest enclosing heading: scope context, not quotable evidence. */
  candidateContext?: string;
}

export interface VerifyPropositionCandidateInput {
  ref: string;
  passage: string;
  locator?: string;
  context?: string;
}

export interface VerifyPropositionCandidatesInput {
  hypothesis: string;
  proofStandard: string;
  candidates: VerifyPropositionCandidateInput[];
}

export interface VerifyCallOptions {
  abortSignal?: AbortSignal;
}

export interface VerifyDependency {
  document: string;
  whyNeeded: string;
}

export interface VerifyPropositionResult {
  verdict: VerifyVerdict;
  /**
   * Compliance-batch signal: the passage itself establishes a material part
   * of a multi-part proof standard, but not all of it. This is deliberately
   * separate from related_not_proof so a heading, definition, or merely
   * topical clause cannot become partial coverage.
   */
  partialCoverage?: boolean;
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
   * Populated selectively depending on the verdict — including residual
   * limitations on a `proves` verdict when `partialCoverage` is true.
   */
  establishedBy?: string;
  gapDescription?: string;
  dependency?: VerifyDependency;
  structuralNote?: string;
  remediation?: string;
  applicabilityScope?: FindingApplicabilityScope;
  scopeRole?: "main_rule" | "exception" | "unspecified";
}

interface RawVerifyOutput {
  verdict: VerifyVerdict;
  partialCoverage?: boolean;
  coverage?: "full" | "partial" | "none" | "contradicted";
  quote: string;
  rationale: string;
  establishedBy?: string;
  gapDescription?: string;
  dependency?: VerifyDependency;
  structuralNote?: string;
  remediation?: string;
  applicabilityScope?: FindingApplicabilityScope;
  scopeRole?: "main_rule" | "exception" | "unspecified";
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

function enrichmentFields(raw: RawVerifyOutput, candidateContext?: string) {
  const cleanList = (values: string[] | undefined) =>
    values?.map((value) => value.trim()).filter(Boolean);
  const context = candidateContext?.trim();
  const conditions = cleanList(raw.applicabilityScope?.conditions) ?? [];
  if (context && !conditions.some((value) => normalize(value) === normalize(context))) {
    conditions.push(context);
  }
  const applicabilityScope = raw.applicabilityScope
    ? {
        parties: cleanList(raw.applicabilityScope.parties),
        jurisdictions: cleanList(raw.applicabilityScope.jurisdictions),
        timePeriods: cleanList(raw.applicabilityScope.timePeriods),
        conditions,
      }
    : context
      ? { conditions: [context] }
      : undefined;
  return {
    partialCoverage:
      raw.partialCoverage === true || raw.coverage === "partial"
        ? true
        : undefined,
    establishedBy: raw.establishedBy?.trim() || undefined,
    gapDescription: raw.gapDescription?.trim() || undefined,
    dependency:
      raw.dependency?.document?.trim() && raw.dependency?.whyNeeded?.trim()
        ? { document: raw.dependency.document.trim(), whyNeeded: raw.dependency.whyNeeded.trim() }
        : undefined,
    structuralNote: raw.structuralNote?.trim() || undefined,
    remediation: raw.remediation?.trim() || undefined,
    applicabilityScope,
    scopeRole: raw.scopeRole,
  };
}

function normalizeVerifyOutput(
  raw: RawVerifyOutput,
  candidatePassage: string,
  candidateContext?: string
): VerifyPropositionResult {
  if (raw.verdict === "irrelevant" || !raw.quote.trim()) {
    return {
      verdict: raw.verdict,
      quote: raw.quote,
      rationale: raw.rationale,
      quoteVerified: raw.quote.trim().length === 0,
      ...enrichmentFields(raw, candidateContext),
    };
  }

  const quoteVerified = quoteAppearsIn(raw.quote, candidatePassage);
  if (!quoteVerified && (raw.verdict === "proves" || raw.verdict === "contradicts")) {
    return {
      verdict: "related_not_proof",
      quote: raw.quote,
      rationale: `Downgraded from "${raw.verdict}" - claimed quote does not appear verbatim in the candidate passage. Original rationale: ${raw.rationale}`,
      quoteVerified: false,
      ...enrichmentFields(raw, candidateContext),
    };
  }

  return {
    verdict: raw.verdict,
    quote: raw.quote,
    rationale: raw.rationale,
    quoteVerified,
    ...enrichmentFields(raw, candidateContext),
  };
}

interface RawCandidateVerifyOutput extends RawVerifyOutput {
  candidateRef: string;
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
  input: VerifyPropositionInput,
  state?: AnalysisState,
  options: VerifyCallOptions = {}
): Promise<VerifyPropositionResult> {
  const prompt = buildVerifyPropositionUserPrompt(input);

  // Single-passage entailment is simpler than evaluate_package's grouped
  // judgment (6-9 requirements against ~40 evidence items in one call),
  // which already runs on this same tier successfully. CRITIQUE_CHECKLIST
  // (Pro, thinking=high) was the wrong tier for a per-candidate check called
  // up to verifyCandidateCap times per requirement — see evaluate-package.ts.
  // thinkingLevel mirrors the grouped path's own STRUCTURAL_JSON tier
  // (low/medium by profile) rather than falling to the bare "minimal" base
  // default, so this doesn't quietly cut VERIFY's rigor below what the old
  // grouped-LLM path already used successfully for a harder judgment call.
  const raw = await executeJsonCompletion<RawVerifyOutput>(
    prompt,
    VERIFY_PROPOSITION_SYSTEM_PROMPT,
    VERIFY_PROPOSITION_SCHEMA,
    LLMTask.STRUCTURAL_JSON,
    LLMProvider.GEMINI,
    state
      ? {
          thinkingLevel: profileThinkingLevel(state, LLMTask.STRUCTURAL_JSON),
          abortSignal: options.abortSignal,
        }
      : { abortSignal: options.abortSignal }
  );
  return normalizeVerifyOutput(raw, input.candidatePassage, input.candidateContext);
}

const VERIFY_CANDIDATES_SYSTEM_PROMPT = [
  VERIFY_PROPOSITION_SYSTEM_PROMPT,
  "",
  "You will receive several candidate passages for the SAME proposition.",
  "Evaluate every candidate independently and return exactly one row for each",
  "candidateRef. Do not combine text from different candidates into one quote.",
  "For each row, separately classify coverage as full, partial, none, or",
  "contradicted. Keep it consistent with verdict, with one exception for",
  "residual limitations: full=proves (complete satisfaction);",
  "contradicted=contradicts; none=irrelevant or a merely topical",
  "related_not_proof; and coverage=partial is used in two distinct cases —",
  "(1) verdict=proves when the passage satisfies the CORE of the proof",
  "standard but misses a named sub-element of a compound or choice-based",
  "standard (e.g. \"A or B, at X's choice\" where only A is offered);",
  "(2) verdict=related_not_proof when the passage does not establish the",
  "core at all and only touches part of the topic. Do not use case (2) for",
  "a passage that satisfies the core proposition.",
  "",
  "Use coverage=partial only when the quoted passage affirmatively establishes",
  "a material portion of the proof standard but falls short of the complete",
  "standard. Generic examples: (1) the standard requires A and B and the quote",
  "expressly establishes A but not B; (2) the quote imposes the required type",
  "of obligation, but with a narrower trigger, scope, or condition than the",
  "standard requires; or (3) the quote expressly says that the exact required",
  "particular is specified in an identified incorporated annex, schedule, or",
  "statement of work that is not among the supplied passages. For case (3),",
  "also populate dependency with the named material and why it must be checked.",
  "For case (1) when the core still holds, pair coverage=partial with",
  "verdict=proves (not related_not_proof).",
  "",
  "When coverage=partial, populate establishedBy with the material portion the",
  "quote establishes and gapDescription + remediation with the SAME rigor",
  "required for a failure verdict: name the specific unaddressed part and the",
  "concrete action that would close it. Do not use partial for a heading,",
  "definition, generic topic mention, generic cross-reference, or a",
  "proof-standard trap that establishes none of the proposition's substantive",
  "elements.",
].join("\n");

function buildVerifyCandidatesSchema(candidateRefs: string[]) {
  return {
    type: "array",
    items: {
      type: "object",
      properties: {
        candidateRef: { type: "string", enum: candidateRefs },
        ...VERIFY_PROPOSITION_SCHEMA.properties,
        coverage: {
          type: "string",
          enum: ["full", "partial", "none", "contradicted"],
          description:
            "Independent coverage classification. Use partial only for a quoted, material portion of the proof standard.",
        },
        establishedBy: {
          type: "string",
          description:
            "When coverage is full or partial, state exactly what material proposition the quoted passage establishes. Otherwise return an empty string.",
        },
        gapDescription: {
          type: "string",
          description:
            "When coverage is partial (including verdict=proves with a residual limitation), or verdict is related_not_proof/contradicts, state the specific remaining delta. Otherwise return an empty string.",
        },
        remediation: {
          type: "string",
          description:
            "When coverage is partial (including verdict=proves with a residual limitation), or verdict is related_not_proof/contradicts, the specific action that would close the gap. Otherwise return an empty string.",
        },
      },
      required: [
        "candidateRef",
        ...VERIFY_PROPOSITION_SCHEMA.required,
        "coverage",
        "establishedBy",
        "gapDescription",
      ],
    },
  };
}

/**
 * Compliance hot path: verify a small requirement-specific candidate set in
 * one bounded call. Independent verdicts and verbatim validation are retained,
 * while the request scheduler handles one call per requirement rather than one
 * call per passage.
 */
export async function verifyPropositionCandidates(
  input: VerifyPropositionCandidatesInput,
  state?: AnalysisState,
  options: VerifyCallOptions = {}
): Promise<Array<{ ref: string; result: VerifyPropositionResult }>> {
  if (input.candidates.length === 0) return [];
  const candidateRefs = input.candidates.map((candidate) => candidate.ref);
  const passages = input.candidates
    .map((candidate) => {
      const location = candidate.locator ? ` from ${candidate.locator}` : "";
      return [
        `--- CANDIDATE ${candidate.ref}${location} ---`,
        candidate.passage,
        `--- END ${candidate.ref} ---`,
      ].join("\n");
    })
    .join("\n\n");
  const prompt = [
    `Proposition (hypothesis): ${input.hypothesis}`,
    "",
    `Proof standard: ${input.proofStandard}`,
    "",
    passages,
    "",
    "Return one independent verdict row for every candidateRef. Quotes must be",
    "verbatim substrings of that same candidate passage. Classify coverage",
    "independently for each row using the strict rules in the system instruction.",
  ].join("\n");

  const raw = await executeJsonCompletion<RawCandidateVerifyOutput[]>(
    prompt,
    VERIFY_CANDIDATES_SYSTEM_PROMPT,
    buildVerifyCandidatesSchema(candidateRefs),
    LLMTask.STRUCTURAL_JSON,
    LLMProvider.GEMINI,
    state
      ? {
          thinkingLevel: profileThinkingLevel(state, LLMTask.STRUCTURAL_JSON),
          abortSignal: options.abortSignal,
        }
      : { abortSignal: options.abortSignal }
  );

  const byRef = new Map(input.candidates.map((candidate) => [candidate.ref, candidate]));
  const seen = new Set<string>();
  const results: Array<{ ref: string; result: VerifyPropositionResult }> = [];
  for (const row of Array.isArray(raw) ? raw : []) {
    if (!row || seen.has(row.candidateRef)) continue;
    const candidate = byRef.get(row.candidateRef);
    if (!candidate) continue;
    seen.add(row.candidateRef);
    results.push({
      ref: row.candidateRef,
      result: normalizeVerifyOutput(row, candidate.passage, candidate.context),
    });
  }
  return results;
}
