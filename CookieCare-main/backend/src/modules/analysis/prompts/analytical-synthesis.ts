import type { RequirementAssessment } from "../models/requirement-assessment.js";
import { displayRequirementStatus } from "../models/requirement-assessment.js";
import { humanizeRequirementId } from "../shared/group-assessments.js";

export const ANALYTICAL_SYNTHESIS_SYSTEM_PROMPT = [
  "You interpret validated requirement findings for counsel.",
  "You may explain what the findings mean, how they relate, what is material, and what remains uncertain.",
  "You must not change any status, invent a new gap, invent evidence, introduce a new recommendation, or reinterpret a clause against the locked judgement.",
  "Every claim must cite requirement ids from the supplied locked rows.",
  "NLI is not compliance. Do not treat entailed as present or not_mentioned as a gap.",
  "Some rows carry enrichment lines (establishedBy / gapDescription / dependency",
  "/ structuralNote / remediation) written by the verifier who actually read",
  "the evidence — this is locked, verifier-authored content, not your own",
  "inference, so you may weave that specific language into your prose freely.",
  "Never manufacture any of these for a row that doesn't carry them, and never",
  "extend a row's dependency/remediation to a different row.",
].join(" ");

export function buildAnalyticalSynthesisUserPrompt(input: {
  instruction: string;
  legalFramework: string;
  factRollup: string;
  rows: RequirementAssessment[];
  /** ACT-Phase 10 — Lite asks for tighter prose; Deep for full counsel-grade depth. Scope of prose, not rigor of any claim. */
  thinkingMode?: "lite" | "deep";
}): string {
  const rowLines = input.rows.map((row) => {
    const judgement = row.judgement;
    const axes = judgement
      ? `compliance=${judgement.compliance}; evidenceState=${judgement.evidenceState}; binding=${judgement.referenceBinding}; nli=${judgement.nli ?? "n/a"}; rec=${judgement.recommendationKind}; materiality=${judgement.materiality}`
      : `status=${row.status}`;
    const enrichment = [
      row.establishedBy ? `establishedBy: ${row.establishedBy}` : "",
      row.gapDescription ? `gapDescription: ${row.gapDescription}` : "",
      row.dependency
        ? `dependency: requires ${row.dependency.document} — ${row.dependency.whyNeeded}`
        : "",
      row.baselineComparison
        ? `baselineComparison: ${row.baselineComparison.comparison} the stated standard — ${row.baselineComparison.reason}`
        : "",
      row.structuralNote ? `structuralNote: ${row.structuralNote}` : "",
      row.remediation ? `remediation: ${row.remediation}` : "",
    ]
      .filter(Boolean)
      .map((line) => `\n  ${line}`)
      .join("");
    return `- ${row.requirementId} [${displayRequirementStatus(row)}] ${axes}\n  ${row.summary}${enrichment}`;
  });
  return [
    "USER QUESTION",
    input.instruction.slice(0, 800),
    "",
    "LEGAL FRAMEWORK (short — do not lecture the statute)",
    input.legalFramework,
    "",
    "DETERMINISTIC FACTS (do not contradict these counts or labels)",
    input.factRollup,
    "",
    "LOCKED REQUIREMENT FINDINGS",
    rowLines.join("\n") || "(none)",
    "",
    "Produce overallAssessment, keyThemes, substantiveVsDrafting, materialRisks, residualUncertainty, and citedRequirementIds.",
    "materialRisks may only include requirement ids whose locked compliance is partial, gap, or insufficient_evidence.",
    "residualUncertainty may only describe evidenceState / insufficient_evidence issues already on the rows.",
    input.thinkingMode === "lite"
      ? "LENGTH: keep this tight — 1-2 sentences per theme/risk, at most 4 keyThemes and 5 materialRisks, no restating the fact rollup. This is a scope instruction only: every claim must still be exactly as accurate and as fully grounded in the locked rows as a Deep run — never soften, hedge, or drop a real risk just to save words."
      : "LENGTH: full counsel-grade depth — up to 8 keyThemes and 8 materialRisks, each with enough context for a reader who has not seen the raw evidence.",
  ].join("\n");
}

export function deterministicFactRollup(assessments: RequirementAssessment[]): string {
  const counts = {
    present: 0,
    partial: 0,
    gap: 0,
    insufficient: 0,
    na: 0,
  };
  for (const row of assessments) {
    const compliance = row.judgement?.compliance;
    if (compliance === "present") counts.present += 1;
    else if (compliance === "partial") counts.partial += 1;
    else if (compliance === "gap") counts.gap += 1;
    else if (compliance === "not_applicable") counts.na += 1;
    else counts.insufficient += 1;
  }
  const residual = assessments
    .filter((row) => {
      const c = row.judgement?.compliance;
      return c === "partial" || c === "gap" || c === "insufficient_evidence";
    })
    .map(
      (row) =>
        `- ${humanizeRequirementId(row.requirementId)}: ${displayRequirementStatus(row)}${
          row.judgement?.recommendationKind && row.judgement.recommendationKind !== "none"
            ? ` (${row.judgement.recommendationKind})`
            : ""
        }`
    );
  return [
    `Counts: ${counts.present} Present, ${counts.partial} Partial, ${counts.gap} Gap, ${counts.insufficient} Insufficient evidence, ${counts.na} Not applicable.`,
    residual.length > 0
      ? `Material residual items:\n${residual.join("\n")}`
      : "Material residual items: none.",
  ].join("\n");
}
