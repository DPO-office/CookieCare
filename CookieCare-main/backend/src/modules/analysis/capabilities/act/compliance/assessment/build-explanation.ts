import type { OutcomeExplanation, RequirementStatus, VerificationRequest, VerificationResult } from "../contracts/index.js";
export function buildExplanation(r: VerificationRequest, result: VerificationResult, status: RequirementStatus): OutcomeExplanation {
  const d = result.kind === "verified" ? result.decision : undefined;
  const facts = d?.elements.map(e => e.establishedFact).filter(Boolean) ?? (result.kind === "incomplete" ? result.validatedFacts ?? [] : []);
  const gaps = (d?.elements ?? (result.kind === "incomplete" ? result.validatedElements : undefined))?.map(e => e.missingProof).filter(Boolean) ?? [];
  if (result.kind === "incomplete") {
    const unverified = r.check.rule?.elements.filter(e => !result.validatedElements?.some(v => v.elementId === e.id)).map(e => e.id) ?? [];
    gaps.push("Verification did not finish for: " + (unverified.join(", ") || "the complete check") + ". This is not proof that those provisions are absent.");
  }
  gaps.push(...(d?.elements.flatMap(e=>[...e.limitations,...e.conflicts].filter(c=>c.materiality!=="immaterial").map(c=>c.description)) ?? []));
  const title = r.check.rule?.title ?? r.check.ruleId;
  const conclusions: Record<RequirementStatus, string> = {
    present: "The required applicable provisions are established within the reviewed scope.",
    partial: "The reviewed provisions establish part of the requirement; the identified shortfall remains.",
    gap: "The required provisions were not established after the completed review of this scope.",
    cannot_determine: "Available evidence does not support a complete conclusion; the identified limitations remain.",
    not_applicable: "The requirement does not apply on the stated, evidenced basis.",
    conflicting: "The reviewed provisions contain a material contradiction.",
    judgment_required: "Material interpretations remain unresolved and require legal review.",
    verification_incomplete: "This check did not complete verification; no contractual deficiency is inferred.",
  };
  return {
    whatTheDocumentProvides: facts.join(" ") || (r.bundle.passages.length ? "Related contract provisions were located; their sufficiency has not been established." : "No relevant passage is available in the current evidence bundle."),
    whatIsMissingOrUnclear: gaps.join(" ") || (status === "present" ? "No outstanding required proof." : status === "not_applicable" ? d!.applicability.basis : result.kind === "incomplete" ? result.reason : [...r.bundle.coverageReasons, ...(d?.reviewRequired ?? [])].join("; ") || "Material evidence or applicability remains unresolved."),
    whyItMatters: r.check.rule ? r.check.rule.citation + ": " + title : title,
    conclusion: conclusions[status],
    // Tie the action to the actual cause so the report does not repeat one
    // generic recommendation on every unsatisfied requirement.
    recommendedAction:
      status === "present" || status === "not_applicable" ? "No action indicated within the reviewed scope."
      : status === "verification_incomplete" ? "Complete or retry this check before relying on a conclusion."
      : status === "conflicting" || d?.elements.some(e => e.state === "contradicted") ? "Reconcile the conflicting provisions or obtain written clarification."
      : status === "judgment_required" ? "Obtain legal review of the unresolved interpretation."
      : d?.dependencies.some(dep => dep.materiality !== "immaterial") ? "Obtain and review the referenced material, then complete the assessment."
      : status === "cannot_determine" ? "Resolve the identified evidence or scope limitations before concluding."
      : status === "gap" ? "Add a provision satisfying the requirement, or confirm equivalent terms elsewhere in the agreement."
      : "Amend the reviewed provisions to close the identified shortfall.",
  };
}
