export const EVALUATE_PACKAGE_SYSTEM_PROMPT = [
  "You are a precise legal/compliance analyst evaluating requirements against authored rule text and supplied document evidence.",
  "Evaluate each requirement independently. Never fabricate evidence or assume a compliant result when evidence is absent.",
  "Your job is to classify evidence state. Do not write the user-facing report.",
].join(" ");

export function buildEvaluatePackageUserPrompt(input: {
  instruction: string;
  depth: string;
  requirementIds: string[];
  authoredRuleText: string;
  evidenceLines: string[];
  previousFeedback?: string;
  /** Reference-only legal context — do not evaluate as standalone requirements. */
  contextRuleText?: string;
}): string {
  return [
    `User instruction: ${input.instruction}`,
    `Evaluation depth: ${input.depth}`,
    "",
    "Requirements to establish (return exactly one result per requirementId):",
    ...input.requirementIds.map((id) => `- ${id}`),
    "",
    "Authored legal rule text (evaluate only against this — do not invent law):",
    input.authoredRuleText,
    input.contextRuleText
      ? [
          "",
          "Reference legal context (background only — do NOT evaluate these as separate requirements):",
          input.contextRuleText,
        ].join("\n")
      : "",
    "",
    "Evidence extracted from the document (cite by ref in evidenceRefs):",
    input.evidenceLines.length > 0
      ? input.evidenceLines.join("\n")
      : "(no clause evidence was extracted for this package)",
    input.previousFeedback
      ? `\nPrior attempt feedback to address:\n${input.previousFeedback}`
      : "",
    "",
    "Status rules — follow these exactly:",
    "- covered: quoted evidence shows the required element with enough substance to verify it.",
    "- partial: some required elements are present and others are absent, incomplete, or too weak to verify adequacy.",
    "- missing: the relevant part of THIS document was reviewed and the obligation is affirmatively absent from that text. A gap must be a positive finding, not an extraction miss.",
    "- cannot_determine: evidence is missing, incomplete, conflicting, or the substance is pointed elsewhere. Use this when you cannot verify the requirement from the supplied materials.",
    "- not_applicable: the requirement is clearly outside this agreement or request.",
    "",
    "\"Not found in extracted evidence\" does NOT automatically mean missing.",
    "If evidence is marked status=not_found or status=insufficient_evidence, default to cannot_determine unless the reviewed text itself shows the obligation is absent from a section that should have contained it.",
    "If evidence is marked status=referenced_elsewhere, or the quote refers to an annex, schedule, SOW, appendix, exhibit, incorporated policy, or another agreement that is not in this evidence set, use cannot_determine (not missing) and name the referenced document in the rationale.",
    "Distinguish existence of an obligation from whether its adequacy can be verified. If the obligation is mentioned but the operative detail lives elsewhere, use cannot_determine or partial — not missing.",
    "If evidence is marked truncated=true or heading_only=true, you did not receive the complete logical clause. Do NOT use missing. Default to cannot_determine unless the visible text already proves the duty is absent from a section that would have contained it in the opening.",
    "Recommendations: never recommend amending the agreement from cannot_determine, truncated, or heading_only evidence. Use Obtain/Confirm/re-read instead. Recommend Amend only for missing or partial when the cited quote is complete (not truncated).",
    "Ground every conclusion in evidence refs. If you cannot cite a ref, do not claim coverage.",
  ].join("\n");
}
