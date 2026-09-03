export const EVALUATE_PACKAGE_SYSTEM_PROMPT = [
  "You are a precise legal/compliance analyst evaluating requirements against authored rule text and supplied document evidence.",
  "Evaluate each requirement independently against its own hypothesis and its own candidate evidence. Never fabricate evidence.",
  "Your job is to classify axes. Do not write the user-facing report.",
  "NLI is not compliance: entailed may still be partial; not_mentioned is not automatically a gap.",
  "For each requirement answer: (1) Does supporting evidence address the hypothesis? (2) What exact proposition does it establish? (3) Is coverage complete or partial? (4) What is only contextual or an external dependency? (5) What evidence would be required to conclude the rest?",
  "Contextual evidence alone cannot make compliance=present. Retention is not duration. Security measures are not confidentiality.",
].join(" ");

export interface EvaluatePackageRequirementPrompt {
  requirementId: string;
  hypothesis: string;
  /** Authored, domain-specific definition of what is sufficient proof. */
  proofStandard?: string;
  candidateEvidenceRefs: string[];
  /** Packet for this requirement only — never sibling extracts. */
  evidenceLines?: string[];
  packetRoles?: {
    supporting: string[];
    contextual: string[];
  };
}

export function buildEvaluatePackageUserPrompt(input: {
  instruction: string;
  depth: string;
  requirements: EvaluatePackageRequirementPrompt[];
  authoredRuleText: string;
  /**
   * Shared extras (structured artifacts, or legacy single-requirement tests).
   * Must not include sibling requirement clause extracts when packets are present.
   */
  evidenceLines: string[];
  previousFeedback?: string;
  /** Reference-only legal context — do not evaluate as standalone requirements. */
  contextRuleText?: string;
}): string {
  const partitioned = input.requirements.some(
    (req) => (req.evidenceLines?.length ?? 0) > 0
  );
  const requirementBlock = input.requirements
    .map((req) => {
      const refs =
        req.candidateEvidenceRefs.length > 0
          ? req.candidateEvidenceRefs.join(", ")
          : "(none — do not cite extracts assigned to a sibling requirement)";
      const lines = [
        `- ${req.requirementId}`,
        `  hypothesis: ${req.hypothesis}`,
        ...(req.proofStandard ? [`  proofStandard: ${req.proofStandard}`] : []),
        `  candidateEvidenceRefs: ${refs}`,
      ];
      if (req.packetRoles) {
        lines.push(
          `  supportingRefs: ${
            req.packetRoles.supporting.length
              ? req.packetRoles.supporting.join(", ")
              : "(none)"
          }`
        );
        lines.push(
          `  contextualRefs: ${
            req.packetRoles.contextual.length
              ? req.packetRoles.contextual.join(", ")
              : "(none)"
          }`
        );
      }
      if (partitioned) {
        const packet =
          req.evidenceLines && req.evidenceLines.length > 0
            ? req.evidenceLines.map((line) => `    ${line}`).join("\n")
            : "    (none — do not cite extracts assigned to a sibling requirement)";
        lines.push("  evidence:");
        lines.push(packet);
      }
      return lines.join("\n");
    })
    .join("\n");

  const sharedEvidenceHeader = partitioned
    ? "Shared structured records (not clause evidence for a sibling requirement):"
    : "Evidence extracted from the document (cite by ref in evidenceRefs; only use refs listed as candidates for THAT requirement):";

  return [
    `User instruction: ${input.instruction}`,
    `Evaluation depth: ${input.depth}`,
    "",
    "Requirements to establish (return exactly one result per requirementId).",
    "Judge the hypothesis against that row's candidateEvidenceRefs and the evidence listed under THAT requirement only.",
    "When a proofStandard is supplied, apply it exactly; a related clause is not sufficient unless it meets that standard.",
    "Do not use another requirement's evidence packet.",
    "Evidence tagged candidates=supporting may prove the hypothesis. Evidence tagged candidates=contextual is related but does not by itself prove the hypothesis.",
    "If only contextual refs are available, compliance must be insufficient_evidence or partial — never present.",
    requirementBlock,
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
    sharedEvidenceHeader,
    input.evidenceLines.length > 0
      ? input.evidenceLines.join("\n")
      : partitioned
        ? "(no additional structured records)"
        : "(no clause evidence was extracted for this package)",
    input.previousFeedback
      ? `\nPrior attempt feedback to address:\n${input.previousFeedback}`
      : "",
    "",
    "Return separate axes. Do not derive compliance from nli.",
    "",
    "nli — does THIS requirement's hypothesis follow from its supporting extracts?",
    "- entailed: the cited supporting text supports the hypothesis.",
    "- contradicted: the cited text is inconsistent with the hypothesis.",
    "- not_mentioned: the candidate extracts do not speak to the hypothesis.",
    "not_mentioned is not a gap. A gap requires the reviewed text that should have contained the obligation to be complete and silent.",
    "not_mentioned applies only when THIS requirement's candidate extracts do not speak to the hypothesis. If a supporting candidate states the obligation, nli is entailed even if particulars are elsewhere.",
    "",
    "compliance — does the contract satisfy the legal requirement adequately?",
    "- present: supporting evidence substantively meets the hypothesis (contextual-only is never present).",
    "- partial: some but not all of the requirement is met.",
    "- gap: the relevant complete text was reviewed and the obligation is affirmatively absent.",
    "- insufficient_evidence: cannot judge adequacy — empty extract, unread truncated text, contextual-only packet, or a non-binding/floating pointer to a schedule that was not supplied.",
    "- not_applicable: outside this agreement or request.",
    "Baseline contractual substance in this instrument is present even if a granular list or particulars live in a named agreement, schedule, or disclosure. Do not mark gap merely because a list is not enumerated here.",
    "Missing granular particulars in a referenced disclosure are Obtain/Confirm, not Gap and not Amend.",
    "Legacy status aliases: strong/adequate → present; conditional/partial → partial; missing → gap; cannot_determine → insufficient_evidence.",
    "",
    "evidenceState: direct | incorporated | truncated | unavailable | conflicting | not_found",
    "referenceBinding: binding | floating | none",
    "- binding: the main instrument incorporates a named schedule with enough contractual substance that the requirement is materially covered, even if particulars live in the schedule.",
    "- floating: a mere 'see Schedule X' / annex pointer without enough contractual substance. This is insufficient_evidence or partial — not present, not a drafting gap, not Amend.",
    "Do not mark present merely because a pointer exists.",
    "",
    "draftingQuality (only if compliance is present or partial): clean | could_be_clearer | operational_weakness",
    "materiality: low | medium | high",
    "evidenceConfidence: high | medium | low",
    "",
    "If evidence is marked truncated=true or heading_only=true, you did not receive the complete logical clause. Do NOT use gap. Default to insufficient_evidence / evidenceState=truncated.",
    "Recommendations: never recommend amending the agreement from insufficient_evidence, truncated, heading_only, floating pointers, or unavailable annexes. Use Obtain/Confirm. Recommend Amend only for gap or partial when the cited quote is complete and the defect is in this instrument.",
    "Ground every conclusion in evidence refs from THAT requirement's candidate list. If you cannot cite a valid candidate ref, do not claim coverage.",
    "Evaluate each requirementId independently. Do not copy another requirement's rationale, gap, or evidenceRefs unless that quote independently substantiates THIS hypothesis.",
    "An extract that matches a sibling hypothesis does not prove this one. Cite none and use nli=not_mentioned with compliance=insufficient_evidence when the candidate extracts do not speak to this hypothesis.",
  ].join("\n");
}
