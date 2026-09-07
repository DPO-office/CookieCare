import type { SharedEvidenceItem } from "../../models/evidence-package.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import { pacLogBlock } from "../../utils/pac-log.js";
import { appendSection } from "./evidence-pool-log.js";
import type { VerifyPropositionResult } from "./verify-proposition.js";

/** One candidate + its VERIFY verdict, in the order they were checked. */
export interface VerifyCandidateOutcome {
  item: SharedEvidenceItem;
  result: VerifyPropositionResult;
}

function truncate(text: string | undefined, max: number): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * Prints, per requirement, every candidate the hybrid retriever surfaced and
 * exactly what VERIFY decided about each one — verdict, the passage it was
 * checking, the quote it claims proves/contradicts, whether that quote was
 * verified to actually exist in the passage, and any enrichment fields
 * (establishedBy / gapDescription / dependency / structuralNote / remediation)
 * the model populated. This is the ground truth for "did retrieval pick the
 * right clause, and did VERIFY reason about it correctly" — read this instead
 * of trusting the one-line summary that ends up in the final report.
 */
export function logVerifyCandidates(args: {
  requirementId: string;
  hypothesis: string;
  proofStandard: string;
  outcomes: VerifyCandidateOutcome[];
  winnerIndex?: number;
  winnerVerdict?: "proves" | "contradicts";
  partialIndex?: number;
  closestIndex?: number;
  mixedResolution?: "scope_dependent" | "conflicting";
  scopeDependentRefs?: string[];
  /**
   * When supplied, this trace is also appended to the persistent
   * logs/analysis/<sessionId>.log file (same file the extraction/retrieval
   * trace already writes to), not just stdout. Without this, the ONLY record
   * of what VERIFY actually saw and decided was ephemeral console output —
   * easy to lose across a restart and impossible to correlate to one session
   * after the fact. This was the missing half of the pipeline trace: the
   * extraction/retrieval steps were always durably logged, VERIFY's own
   * clause-in / verdict-out reasoning was not.
   */
  state?: AnalysisState;
}): void {
  const {
    requirementId,
    hypothesis,
    proofStandard,
    outcomes,
    winnerIndex,
    winnerVerdict,
    partialIndex,
    closestIndex,
    mixedResolution,
    scopeDependentRefs,
    state,
  } = args;

  const lines: string[] = [];
  lines.push(`REQUIREMENT: ${requirementId}`);
  lines.push(`HYPOTHESIS:  ${truncate(hypothesis, 140)}`);
  lines.push(`PROOF STD:   ${truncate(proofStandard, 200)}`);
  lines.push("");
  lines.push(`CANDIDATES CHECKED (${outcomes.length}) — ranked by the retriever, in this order:`);
  lines.push("");

  outcomes.forEach((outcome, i) => {
    const { item, result } = outcome;
    const n = i + 1;
    const marker =
      i === winnerIndex
        ? " ★ WINNER"
        : i === partialIndex
          ? " ★ PARTIAL"
          : i === closestIndex
            ? " → carried as closest"
            : "";
    const verdictTag = result.verdict.toUpperCase();
    lines.push(
      `  [${n}] ${item.ref}  ${item.clauseType}${item.structuralPath ? ` (${item.structuralPath})` : ""}  →  ${verdictTag}  quoteVerified=${result.quoteVerified}${marker}`
    );
    if (result.partialCoverage) {
      lines.push("      coverage: PARTIAL — a material portion is established");
    }
    lines.push(`      passage: "${truncate(item.quotedText, 160)}"`);
    if (result.quote?.trim()) {
      lines.push(`      quote:   "${truncate(result.quote, 160)}"`);
    }
    lines.push(`      why:     ${truncate(result.rationale, 180)}`);
    if (result.establishedBy) lines.push(`      established: ${truncate(result.establishedBy, 180)}`);
    if (result.gapDescription) lines.push(`      gap:     ${truncate(result.gapDescription, 180)}`);
    if (result.dependency) {
      lines.push(
        `      needs:   ${result.dependency.document} — ${truncate(result.dependency.whyNeeded, 140)}`
      );
    }
    if (result.structuralNote) lines.push(`      note:    ${truncate(result.structuralNote, 160)}`);
    if (result.remediation) lines.push(`      fix:     ${truncate(result.remediation, 160)}`);
    lines.push("");
  });

  if (scopeDependentRefs?.length) {
    lines.push(
      `RESULT: relevant evidence applies to distinct scopes - scope_dependent. Read together: ${scopeDependentRefs.join(", ")}.`
    );
  } else if (mixedResolution !== undefined) {
    const provingRefs = outcomes
      .filter(({ result }) => result.verdict === "proves" && result.quoteVerified)
      .map(({ item }) => item.ref)
      .join(", ");
    const contradictingRefs = outcomes
      .filter(({ result }) => result.verdict === "contradicts" && result.quoteVerified)
      .map(({ item }) => item.ref)
      .join(", ");
    lines.push(
      mixedResolution === "scope_dependent"
        ? `RESULT: decisive evidence applies to distinct scopes - scope_dependent. Proves: ${provingRefs}; contradicts: ${contradictingRefs}.`
        : `RESULT: decisive evidence overlaps or has unresolved scope - conflicting. Proves: ${provingRefs}; contradicts: ${contradictingRefs}.`
    );
  } else if (winnerIndex !== undefined) {
    lines.push(`RESULT: ${winnerVerdict} — ${outcomes[winnerIndex].item.ref} wins.`);
  } else if (partialIndex !== undefined) {
    lines.push(
      `RESULT: partial coverage — ${outcomes[partialIndex].item.ref} establishes a material portion of the proof standard.`
    );
  } else if (closestIndex !== undefined) {
    lines.push(
      `RESULT: no candidate proved/contradicted → insufficient_evidence. Closest carried: ${outcomes[closestIndex].item.ref} (${outcomes[closestIndex].result.verdict}).`
    );
  } else {
    lines.push("RESULT: no candidate proved/contradicted → insufficient_evidence. Nothing worth carrying forward.");
  }

  const title = `[VERIFY] candidate-by-candidate — ${requirementId}`;
  pacLogBlock(title, lines);
  if (state) appendSection(state, title, lines);
}
