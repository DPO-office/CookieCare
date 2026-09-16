import type { OutcomeExplanation, RequirementStatus, VerificationDecision, VerificationRequest, VerificationResult } from "../contracts/index.js";

function getCannotDetermineDetails(r: VerificationRequest, d?: VerificationDecision): { reason: string; action: string; conclusion: string } {
  const unresolvedDeps = d?.dependencies.filter(dep =>
    dep.materiality === "material" &&
    r.bundle.dependencies.find(x => x.id === dep.id)?.state !== "resolved_internal"
  );
  if (unresolvedDeps?.length) {
    const depNames = unresolvedDeps.map(dep => dep.id).join(", ");
    return {
      reason: `The requirement references external or secondary material (${depNames}) whose content remains unsupplied or unresolved in the reviewed bundle.`,
      conclusion: `Cannot determine compliance: dependent schedule or external exhibit (${depNames}) is unresolved.`,
      action: `Obtain and review the referenced material (${depNames}), then complete the assessment.`
    };
  }

  if (r.bundle.executionStatus !== "complete") {
    const coverageStr = r.bundle.coverageReasons.length ? r.bundle.coverageReasons.join("; ") : "unresolved section coverage";
    return {
      reason: `Evidence retrieval across the document scope did not complete (${coverageStr}).`,
      conclusion: `Cannot determine compliance: document retrieval coverage was incomplete.`,
      action: `Retry evidence retrieval for the complete document scope before concluding.`
    };
  }

  if (r.check.rule?.relationshipScopes.length && d?.elements.some(e =>
    e.actorScope.relationshipScope !== "unspecified" &&
    !r.check.rule!.relationshipScopes.includes(e.actorScope.relationshipScope)
  )) {
    const requiredScopes = r.check.rule.relationshipScopes.join(", ");
    return {
      reason: `The located contract provisions describe an actor relationship scope that does not match the required legal scope (${requiredScopes}).`,
      conclusion: `Cannot determine compliance: actor relationship scope mismatch (${requiredScopes} required).`,
      action: `Verify whether the contract scope covers the required (${requiredScopes}) relationship.`
    };
  }

  if (r.check.rule?.elements.length && d?.elements.every(e => e.applicability.state === "not_applicable")) {
    return {
      reason: `All required proof elements were marked not applicable without a rule-level exclusion basis.`,
      conclusion: `Cannot determine compliance: element-level exclusions leave no evaluateable proof elements.`,
      action: `Review whether the rule as a whole applies or provide rule-level exclusion grounds.`
    };
  }

  if (d?.applicability.state === "unknown") {
    return {
      reason: `Contract text and provided context facts are insufficient to establish whether this requirement applies.`,
      conclusion: `Cannot determine compliance: applicability scope is unknown.`,
      action: `Provide contract relationship context or factual inputs to confirm whether this requirement applies.`
    };
  }

  const materialConcerns = d?.elements.flatMap(e =>
    [...e.limitations, ...e.conflicts].filter(c => c.materiality === "material").map(c => c.description)
  );
  if (materialConcerns?.length) {
    const concernStr = materialConcerns.join("; ");
    return {
      reason: `The located provisions carry material or unverified limitations: ${concernStr}`,
      conclusion: `Cannot determine compliance: provisions carry unresolved material qualifications.`,
      action: `Review and resolve the identified contract qualifications (${concernStr}).`
    };
  }

  if (d?.reviewRequired?.length) {
    const reviewStr = d.reviewRequired.join(", ");
    return {
      reason: `Verification flagged material conditions requiring resolution (${reviewStr}).`,
      conclusion: `Cannot determine compliance: unresolved verification review conditions (${reviewStr}).`,
      action: `Resolve the flagged review conditions (${reviewStr}) before concluding.`
    };
  }

  return {
    reason: `Available evidence or scope facts do not support a complete determination; material limitations remain unresolved.`,
    conclusion: `Cannot determine compliance: available evidence is insufficient to establish a complete conclusion.`,
    action: `Obtain complete contract text or clarify scope limitations before concluding.`
  };
}

export function buildExplanation(r: VerificationRequest, result: VerificationResult, status: RequirementStatus): OutcomeExplanation {
  const d = result.kind === "verified" ? result.decision : undefined;
  const facts = d?.elements.map(e => e.establishedFact).filter(Boolean) ?? (result.kind === "incomplete" ? result.validatedFacts ?? [] : []);
  const gaps = (d?.elements ?? (result.kind === "incomplete" ? result.validatedElements : undefined))?.map(e => e.missingProof).filter(Boolean) ?? [];
  if (result.kind === "incomplete") {
    const unverified = r.check.rule?.elements.filter(e => !result.validatedElements?.some(v => v.elementId === e.id)).map(e => e.id) ?? [];
    gaps.push("Verification did not finish for: " + (unverified.join(", ") || "the complete check") + ". This is not proof that those provisions are absent.");
  }
  gaps.push(...(d?.elements.flatMap(e=>[...e.limitations,...e.conflicts].filter(c=>c.materiality==="material").map(c=>c.description)) ?? []));
  const title = r.check.rule?.title ?? r.check.ruleId;
  const remediationByElement = new Map((r.check.rule?.elements ?? []).map(element => [element.id,
    element.remediationGuidance?.trim() || `Address this missing requirement: ${element.description.trim()}`]));
  const specificRemedies = [...new Set((d?.elements ?? [])
    .filter(element => !["supported", "not_applicable"].includes(element.state) && element.applicability.state !== "not_applicable")
    .map(element => remediationByElement.get(element.elementId)).filter((value): value is string => !!value))];
  const specificRemedy = specificRemedies.slice(0, 4).join(" ");
  const cannotDetails = status === "cannot_determine" ? getCannotDetermineDetails(r, d) : undefined;
  const conclusions: Record<RequirementStatus, string> = {
    present: "The required applicable provisions are established within the reviewed scope.",
    partial: "The reviewed provisions establish part of the requirement; the identified shortfall remains.",
    gap: "The required provisions were not established after the completed review of this scope.",
    cannot_determine: cannotDetails?.conclusion ?? "Available evidence does not support a complete conclusion; the identified limitations remain.",
    not_applicable: "The requirement does not apply on the stated, evidenced basis.",
    conflicting: "The reviewed provisions contain a material contradiction.",
    judgment_required: "Material interpretations remain unresolved and require legal review.",
    verification_incomplete: "This check did not complete verification; no contractual deficiency is inferred.",
  };
  return {
    whatTheDocumentProvides: facts.join(" ") || (r.bundle.passages.length ? "Related contract provisions were located; their sufficiency has not been established." : "No relevant passage is available in the current evidence bundle."),
    whatIsMissingOrUnclear: gaps.join(" ") || (status === "cannot_determine" ? cannotDetails!.reason : status === "present" ? "No outstanding required proof." : status === "not_applicable" ? d!.applicability.basis : result.kind === "incomplete" ? result.reason : [...r.bundle.coverageReasons, ...(d?.reviewRequired ?? [])].join("; ") || "Material evidence or applicability remains unresolved."),
    whyItMatters: r.check.rule ? r.check.rule.citation + ": " + title : title,
    conclusion: conclusions[status],
    // Tie the action to the actual cause so the report does not repeat one
    // generic recommendation on every unsatisfied requirement.
    recommendedAction:
      status === "present" || status === "not_applicable" ? "No action indicated within the reviewed scope."
      : status === "verification_incomplete" ? "Complete or retry this check before relying on a conclusion."
      : status === "conflicting" || d?.elements.some(e => e.state === "contradicted") ? "Reconcile the conflicting provisions or obtain written clarification."
      : status === "judgment_required" ? "Obtain legal review of the unresolved interpretation."
      : status === "cannot_determine" ? cannotDetails!.action
      : d?.dependencies.some(dep => dep.materiality === "material") ? "Obtain and review the referenced material, then complete the assessment."
      : status === "gap" ? specificRemedy || `Add an express provision addressing ${title.toLowerCase()}.`
      : specificRemedy || `Clarify the provision so it fully addresses ${title.toLowerCase()}.`,
  };
}
