/**
 * PHASE 5A + 5B — deterministic status calculation and factual explanation
 * assembly over the Phase 4B element matrix.
 *
 * Side-channel. Live rendering is untouched — this module produces the events
 * the plan §Phase 5 Required logs specify so a reviewer can compare a rule-
 * determined status against what today's assessment does before Phase 6 locks
 * anything in.
 */

import type {
  ElementSchema,
  RequirementElementSchema,
} from "./element-schemas.js";
import type {
  ElementVerdict,
  ElementVerdictState,
  RequirementMatrix,
} from "./phase4-verify.js";

export type RequirementStatus =
  | "present"
  | "partial"
  | "gap"
  | "cannot_determine"
  | "not_applicable"
  | "conflicting"
  | "judgment_required"
  | "verification_incomplete";

const RULE_VERSION = "0.1.0";

export interface AssessmentInput {
  requirementId: string;
  schema: RequirementElementSchema;
  matrix: RequirementMatrix;
  /** Was investigation completeness confirmed for the requirement's bundle? */
  investigationComplete: boolean;
  /** Bundle-level unresolved dependency count (Phase 3C). */
  unresolvedDependencyCount: number;
}

export interface AssessmentResult {
  requirementId: string;
  status: RequirementStatus;
  reasonCodes: string[];
  ruleVersion: string;
  elementStates: Record<string, ElementVerdictState>;
  completeness: {
    verificationComplete: boolean;
    investigationComplete: boolean;
    missingElementIds: string[];
    unresolvedDependencyCount: number;
  };
}

export interface ExplanationDraft {
  requirementId: string;
  status: RequirementStatus;
  whatTheDocumentProvides: string;
  whatIsMissingOrUnclear: string;
  whyItMatters: string;
  conclusion: string;
  recommendedAction: string;
  supportedElementIds: string[];
  missingElementIds: string[];
  evidenceSpanIds: string[];
  elementReferences: string[];
  ruleVersion: string;
}

/**
 * Rule-determinable status from a schema + verified matrix.
 * Never turns a retrieval/verification failure into a legal gap:
 * `verification_incomplete` / `cannot_determine` are separate terminal states.
 */
export function assessRequirement(input: AssessmentInput): AssessmentResult {
  const { schema, matrix } = input;
  const elementStates: Record<string, ElementVerdictState> = {};
  for (const el of matrix.elements) elementStates[el.elementId] = el.state;

  const verificationComplete = matrix.missingElementIds.length === 0;
  const completeness = {
    verificationComplete,
    investigationComplete: input.investigationComplete,
    missingElementIds: matrix.missingElementIds,
    unresolvedDependencyCount: input.unresolvedDependencyCount,
  };
  const baseReasonCodes = reasonCodesFromMatrix(matrix.elements, schema.elements);

  if (!verificationComplete) {
    return {
      requirementId: input.requirementId,
      status: "verification_incomplete",
      reasonCodes: [
        "VERIFY_INCOMPLETE",
        ...matrix.missingElementIds.map((id) => `MISSING_ELEMENT_${id}`),
        ...baseReasonCodes,
      ],
      ruleVersion: RULE_VERSION,
      elementStates,
      completeness,
    };
  }

  // Applicability first: every conditional element that came back
  // not_applicable is skipped when deciding aggregation.
  const applicable = matrix.elements.filter(
    (e) => e.state !== "not_applicable"
  );

  // Nothing left to judge — every element (mandatory, conditional, or
  // alternative) came back not_applicable. Every `.every(...)` check below
  // is vacuously true on an empty array, so without this guard a fully
  // not-applicable schema would fall through to `present` under "AND" (and
  // similarly under OR/EXCEPTION) — confirmed live: GDPR Art 22's single E1
  // element correctly judged not_applicable ("no automated decision-making
  // described in this agreement") was being reported as the WHOLE
  // requirement being "Present," with zero supporting evidence, which is a
  // materially different and misleading claim. `not_applicable` already had
  // this exact guard for the "CONDITIONAL" aggregation rule below; this
  // makes it apply to every rule instead of just that one.
  if (applicable.length === 0) {
    return {
      requirementId: input.requirementId,
      status: "not_applicable",
      reasonCodes: ["ALL_ELEMENTS_NOT_APPLICABLE", ...baseReasonCodes],
      ruleVersion: RULE_VERSION,
      elementStates,
      completeness,
    };
  }

  // Conflicts win over everything except incompleteness.
  if (applicable.some((e) => e.state === "contradicted")) {
    return {
      requirementId: input.requirementId,
      status: "conflicting",
      reasonCodes: ["CONTRADICTED_ELEMENT_PRESENT", ...baseReasonCodes],
      ruleVersion: RULE_VERSION,
      elementStates,
      completeness,
    };
  }

  // A `conditional` element that reached here already passed the
  // `not_applicable` filter above — its own `applicabilityRule` matched this
  // bundle, so the obligation it describes genuinely applies to this
  // agreement. Treating it as anything less than mandatory-once-applicable
  // would silently drop a real, applicable gap from the status (confirmed
  // live: GDPR Art 28(3)(a)'s A2 proviso, correctly judged `not_located` by
  // the verifier, was being ignored here, so a requirement with one
  // satisfied mandatory element and one unmet applicable conditional element
  // was reported `present` instead of `partial`).
  const mandatory = applicable.filter((e) => {
    const kind = schemaKindFor(schema, e.elementId);
    return kind === "mandatory" || kind === "conditional";
  });
  const alternatives = applicable.filter(
    (e) => schemaKindFor(schema, e.elementId) === "alternative"
  );

  const mandatorySupported = mandatory.every((e) => e.state === "supported");
  const mandatoryAnyMissing = mandatory.some(
    (e) => e.state === "not_located" || e.state === "ambiguous"
  );
  const mandatoryUnresolvedDep = mandatory.some(
    (e) => e.state === "unresolved_dependency"
  );

  // Aggregation semantics per schema.aggregationRule.
  switch (schema.aggregationRule) {
    case "AND": {
      if (mandatorySupported) {
        return decide("present", baseReasonCodes);
      }
      if (mandatoryUnresolvedDep && !input.investigationComplete) {
        return decide("cannot_determine", ["INVESTIGATION_INCOMPLETE", ...baseReasonCodes]);
      }
      if (mandatoryAnyMissing) {
        return anyMandatorySupported(mandatory)
          ? decide("partial", baseReasonCodes)
          : decide("gap", ["ALL_MANDATORY_NOT_LOCATED", ...baseReasonCodes]);
      }
      return decide("cannot_determine", baseReasonCodes);
    }
    case "OR": {
      if (applicable.some((e) => e.state === "supported")) {
        return decide("present", baseReasonCodes);
      }
      if (applicable.some((e) => e.state === "unresolved_dependency")) {
        return decide("cannot_determine", baseReasonCodes);
      }
      return decide("gap", baseReasonCodes);
    }
    case "CHOICE": {
      // Chooser (marked mandatory) plus 2+ alternatives, plus the closing
      // proviso (marked mandatory). Bitrix deletion-only pattern:
      //   G1 (chooser) = not_located / contradicted → CONTROLLER_CHOICE_NOT_LOCATED
      //   G2 (delete)  = supported                    → DELETE_PRESENT
      //   G3 (return)  = not_located                  → RETURN_NOT_LOCATED
      //   G4 (proviso) = not_located                  → LEGAL_RETENTION_NOT_LOCATED
      // Rule: choice is `partial` when EITHER branch is supported but not both
      // AND the chooser is missing; `present` only when chooser present + at
      // least one branch supported + closing proviso present.
      const chooserSupported = mandatory
        .filter((e) => isChooserElement(schema, e.elementId))
        .every((e) => e.state === "supported");
      const provisoSupported = mandatory
        .filter((e) => isProvisoElement(schema, e.elementId))
        .every((e) => e.state === "supported");
      const branchSupported = alternatives.some((e) => e.state === "supported");
      const branchAllSupported = alternatives.every((e) => e.state === "supported");
      const codes = [...baseReasonCodes];
      if (chooserSupported && branchSupported && provisoSupported) {
        return decide("present", codes);
      }
      if (branchAllSupported && provisoSupported && !chooserSupported) {
        return decide("partial", ["CONTROLLER_CHOICE_NOT_LOCATED", ...codes]);
      }
      if (branchSupported) {
        return decide("partial", codes);
      }
      if (mandatoryUnresolvedDep) {
        return decide("cannot_determine", codes);
      }
      return decide("gap", codes);
    }
    case "EXCEPTION": {
      // Main-rule element must be supported; exception element applies only
      // if its applicabilityRule fires (already handled inside phase4-verify).
      if (mandatorySupported) return decide("present", baseReasonCodes);
      if (mandatoryAnyMissing) return decide("partial", baseReasonCodes);
      return decide("gap", baseReasonCodes);
    }
    case "CONDITIONAL": {
      if (applicable.length === 0) return decide("not_applicable", baseReasonCodes);
      return mandatorySupported
        ? decide("present", baseReasonCodes)
        : decide("partial", baseReasonCodes);
    }
  }

  function decide(status: RequirementStatus, reasonCodes: string[]): AssessmentResult {
    return {
      requirementId: input.requirementId,
      status,
      reasonCodes,
      ruleVersion: RULE_VERSION,
      elementStates,
      completeness,
    };
  }
}

function anyMandatorySupported(elements: ElementVerdict[]): boolean {
  return elements.some((e) => e.state === "supported");
}

function schemaKindFor(schema: RequirementElementSchema, elementId: string): ElementSchema["kind"] | undefined {
  return schema.elements.find((e) => e.elementId === elementId)?.kind;
}

/** G1 is the chooser element in the Article 28(3)(g) schema. */
function isChooserElement(schema: RequirementElementSchema, elementId: string): boolean {
  if (schema.aggregationRule !== "CHOICE") return false;
  return elementId === "G1";
}

/** G4 is the closing proviso in the Article 28(3)(g) schema. */
function isProvisoElement(schema: RequirementElementSchema, elementId: string): boolean {
  if (schema.aggregationRule !== "CHOICE") return false;
  return elementId === "G4";
}

function reasonCodesFromMatrix(
  elements: ElementVerdict[],
  schemaElements: ElementSchema[]
): string[] {
  const codes: string[] = [];
  for (const el of elements) {
    const suffix = normalizeElementCodeSuffix(schemaElements, el.elementId);
    switch (el.state) {
      case "supported":
        codes.push(`${suffix}_PRESENT`);
        break;
      case "not_located":
        codes.push(`${suffix}_NOT_LOCATED`);
        break;
      case "contradicted":
        codes.push(`${suffix}_CONTRADICTED`);
        break;
      case "ambiguous":
        codes.push(`${suffix}_AMBIGUOUS`);
        break;
      case "unresolved_dependency":
        codes.push(`${suffix}_UNRESOLVED_DEPENDENCY`);
        break;
      case "not_applicable":
        // Not surfaced as a reason code — presence in elementStates is enough.
        break;
    }
  }
  return codes;
}

function normalizeElementCodeSuffix(
  schemaElements: ElementSchema[],
  elementId: string
): string {
  // Prefer a semantic slug derived from the element's proposition when
  // available — reason codes read as "DELETE_PRESENT" / "RETURN_NOT_LOCATED"
  // rather than "G2_PRESENT" / "G3_NOT_LOCATED".
  const el = schemaElements.find((e) => e.elementId === elementId);
  if (!el) return elementId;
  const semantic = semanticSlugFor(elementId, el.proposition);
  return semantic || elementId;
}

function semanticSlugFor(elementId: string, proposition: string): string {
  const map: Record<string, string> = {
    G1: "CONTROLLER_CHOICE",
    G2: "DELETE",
    G3: "RETURN",
    G4: "LEGAL_RETENTION",
    F1: "SECURITY_ASSISTANCE",
    F2: "BREACH_NOTIFICATION_ASSISTANCE",
    F3: "DPIA_ASSISTANCE",
    A1: "DOCUMENTED_INSTRUCTIONS",
    A2: "INSTRUCTION_LAW_PROVISO",
    SM1: "SUBJECT_MATTER",
    DU1: "DURATION",
    NP1: "PROCESSING_NATURE",
    NP2: "PROCESSING_PURPOSE",
    CD1: "CATEGORIES_OF_DATA",
    DS1: "CATEGORIES_OF_DATA_SUBJECTS",
  };
  if (map[elementId]) return map[elementId];
  // Fallback: first three tokens of the proposition, uppercased.
  return proposition
    .toUpperCase()
    .replace(/[^A-Z0-9\s]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join("_")
    .slice(0, 40);
}

/**
 * PHASE 5B — assemble a factual explanation from the verified matrix and the
 * assessed status. Nothing here calls an LLM. `whatTheDocumentProvides` and
 * `whatIsMissingOrUnclear` cite elements + evidence span ids, so a reviewer
 * can trace every prose statement back to a verified source.
 */
export function draftExplanation(
  assessment: AssessmentResult,
  matrix: RequirementMatrix,
  schema: RequirementElementSchema
): ExplanationDraft {
  const supported = matrix.elements.filter((e) => e.state === "supported");
  const missing = matrix.elements.filter(
    (e) => e.state === "not_located" || e.state === "ambiguous" || e.state === "unresolved_dependency"
  );
  const provided = supported
    .map((e) => `${e.elementId}: ${e.establishedFact}`)
    .join(" ");
  const gaps = missing
    .map(
      (e) =>
        `${e.elementId}: ${e.gapDescription || schemaMissingHint(schema, e.elementId)}`
    )
    .join(" ");
  const rec = missing
    .map((e) => `${e.elementId}: ${schemaRemediation(schema, e.elementId)}`)
    .join(" ");
  const conclusion = concludeFromStatus(assessment.status, schema, supported, missing);
  return {
    requirementId: assessment.requirementId,
    status: assessment.status,
    whatTheDocumentProvides: provided || "No mandatory elements are supported by the current evidence bundle.",
    whatIsMissingOrUnclear: gaps || "No unresolved elements.",
    whyItMatters: `${schema.legalCitation}: ${schema.title}.`,
    conclusion,
    recommendedAction: rec || "No remedial action indicated by the current matrix.",
    supportedElementIds: supported.map((e) => e.elementId),
    missingElementIds: missing.map((e) => e.elementId),
    evidenceSpanIds: Array.from(
      new Set(supported.flatMap((e) => e.evidenceSpanIds))
    ),
    elementReferences: matrix.elements.map((e) => `${e.elementId}:${e.state}`),
    ruleVersion: assessment.ruleVersion,
  };
}

function schemaMissingHint(schema: RequirementElementSchema, elementId: string): string {
  const el = schema.elements.find((e) => e.elementId === elementId);
  return el ? `Proof guidance not met: ${el.proofGuidance}` : "Element not located.";
}

function schemaRemediation(schema: RequirementElementSchema, elementId: string): string {
  const el = schema.elements.find((e) => e.elementId === elementId);
  return el?.remediationGuidance ?? "Add or clarify the underlying clause.";
}

function concludeFromStatus(
  status: RequirementStatus,
  schema: RequirementElementSchema,
  supported: ElementVerdict[],
  missing: ElementVerdict[]
): string {
  switch (status) {
    case "present":
      return `${schema.title} is present — every mandatory element is supported by scope-compatible evidence.`;
    case "partial":
      return `${schema.title} is partial — ${supported.length} of ${schema.elements.length} mandatory elements supported; ${missing.length} outstanding.`;
    case "gap":
      return `${schema.title} is a gap — the required elements are not supported after completeness gates.`;
    case "cannot_determine":
      return `${schema.title} cannot be determined — bundle carries an unresolved dependency material to the assessment.`;
    case "not_applicable":
      return `${schema.title} is not applicable to the reviewed scope.`;
    case "conflicting":
      return `${schema.title} shows conflicting evidence within compatible scope.`;
    case "judgment_required":
      return `${schema.title} requires legal judgment beyond deterministic aggregation.`;
    case "verification_incomplete":
      return `${schema.title} could not be assessed — verification did not return the full element matrix.`;
  }
}
