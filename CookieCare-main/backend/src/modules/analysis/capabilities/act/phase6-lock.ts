/**
 * PHASE 6 — lock validation.
 *
 * Gates every assessment before it can reach rendering. All 12 gates from
 * §Phase 6 Required gates run per requirement; the first failure produces a
 * `LockRejected` outcome with reason codes and the assessment is NOT
 * promoted to a legal status — it becomes an explicit technical/incomplete
 * state so a reviewer can see exactly what blocked it.
 *
 * Side-channel: live rendering is untouched. Locked assessments are emitted
 * for review; Phase 7 (locked-only rendering) will consume them.
 */

import crypto from "crypto";
import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  ElementSchema,
  RequirementElementSchema,
} from "./element-schemas.js";
import type {
  ElementVerdict,
  RequirementMatrix,
} from "./phase4-verify.js";
import type {
  Phase3Bundle,
  Phase3BundleItem,
  Phase3ScopeVector,
} from "./phase3-investigate.js";
import type {
  AssessmentResult,
  ExplanationDraft,
} from "./phase5-assess.js";

export interface LockInput {
  state: AnalysisState;
  requirementId: string;
  canonicalKey: string;
  schema: RequirementElementSchema;
  matrix: RequirementMatrix;
  bundle: Phase3Bundle;
  assessment: AssessmentResult;
  explanation: ExplanationDraft;
  documentIds: string[];
  duplicateCanonicalKeys: Set<string>;
}

export type LockGateCode =
  | "CANONICAL_KEY_MISSING"
  | "SCHEMA_VERSION_MISSING"
  | "DUPLICATE_CANONICAL_ASSESSMENT"
  | "ELEMENT_STATE_INVALID"
  | "ELEMENT_STATE_MISSING"
  | "EVIDENCE_ID_NOT_IN_BUNDLE"
  | "QUOTE_NOT_VERIFIED"
  | "INCOMPATIBLE_SCOPE_JOINT_SUPPORT"
  | "UNRESOLVED_INTERNAL_REFERENCE"
  | "GAP_WITHOUT_COMPLETENESS_BASIS"
  | "STATUS_AGGREGATION_MISMATCH"
  | "EXPLANATION_STATUS_MISMATCH"
  | "EXPLANATION_SUPPORTED_MISMATCH"
  | "EXPLANATION_MISSING_MISMATCH"
  | "REMEDIATION_MISALIGNED"
  | "DOCUMENT_HASH_MISSING"
  | "RULE_VERSION_MISSING";

export type LockDecision =
  | { kind: "accepted"; lockedAssessmentId: string; assessmentHash: string; documentHash: string; ruleVersion: string; canonicalKey: string; status: AssessmentResult["status"] }
  | { kind: "rejected"; reasonCodes: LockGateCode[]; details: string[]; assessmentHash: string };

export function lockAssessment(input: LockInput): LockDecision {
  const failures: { code: LockGateCode; detail: string }[] = [];
  const push = (code: LockGateCode, detail: string) => failures.push({ code, detail });

  // Gate 1: canonical requirement id valid and versioned.
  if (!input.canonicalKey || input.canonicalKey.trim().length === 0) {
    push("CANONICAL_KEY_MISSING", `no canonicalKey for ${input.requirementId}`);
  }
  if (!input.schema.version) {
    push("SCHEMA_VERSION_MISSING", `no schema.version for ${input.canonicalKey}`);
  }

  // Gate 2: exactly one assessment per canonical requirement.
  if (input.duplicateCanonicalKeys.has(input.canonicalKey)) {
    push("DUPLICATE_CANONICAL_ASSESSMENT", `canonicalKey ${input.canonicalKey} produced >1 assessment in this run`);
  }

  const bundleItemById = new Map(input.bundle.items.map((i) => [i.spanId, i]));
  const expectedIds = new Set(input.schema.elements.map((e) => e.elementId));
  const seenIds = new Set<string>();

  for (const el of input.matrix.elements) {
    if (!expectedIds.has(el.elementId)) {
      push("ELEMENT_STATE_INVALID", `verdict for unauthored elementId=${el.elementId}`);
      continue;
    }
    if (seenIds.has(el.elementId)) {
      push("ELEMENT_STATE_INVALID", `duplicate verdict for elementId=${el.elementId}`);
    }
    seenIds.add(el.elementId);

    // Gate 3 helper: each element must have a valid state (enum check is
    // structural; anything unknown lands here).
    if (
      !["supported", "contradicted", "not_located", "ambiguous", "unresolved_dependency", "not_applicable"].includes(el.state)
    ) {
      push("ELEMENT_STATE_INVALID", `elementId=${el.elementId} state=${el.state}`);
    }

    // Gate 4: every evidence id must exist in the bundle.
    for (const sid of el.evidenceSpanIds) {
      if (!bundleItemById.has(sid)) {
        push("EVIDENCE_ID_NOT_IN_BUNDLE", `elementId=${el.elementId} spanId=${sid}`);
      }
    }

    // Gate 5: all affirmative quotes verified (byte-exact substring).
    if (el.state === "supported") {
      for (const q of el.quotes) {
        const item = bundleItemById.get(q.spanId);
        if (!item || !item.quotedText.includes(q.quote)) {
          push("QUOTE_NOT_VERIFIED", `elementId=${el.elementId} spanId=${q.spanId}`);
        }
      }
    }

    // Gate 6: joint support may not mix incompatible scopes.
    if (el.state === "supported" && el.evidenceSpanIds.length > 1) {
      const scopes = el.evidenceSpanIds
        .map((sid) => bundleItemById.get(sid)?.scope)
        .filter((s): s is Phase3ScopeVector => Boolean(s));
      if (!allScopesCompatible(scopes)) {
        push("INCOMPATIBLE_SCOPE_JOINT_SUPPORT", `elementId=${el.elementId} scopes=${JSON.stringify(scopes)}`);
      }
    }
  }

  // Gate 3 (completeness): every expected element must appear exactly once.
  for (const eid of expectedIds) {
    if (!seenIds.has(eid)) {
      push("ELEMENT_STATE_MISSING", `expected elementId=${eid} not returned by matrix`);
    }
  }

  // Gate 7: internal references must be resolved or explicitly classified.
  const unresolvedInternal = input.bundle.dependencies.filter(
    (d) => d.state !== "resolved_internal" && d.state !== "unresolved_external" && d.state !== "ambiguous"
  );
  if (unresolvedInternal.length > 0) {
    push(
      "UNRESOLVED_INTERNAL_REFERENCE",
      `references without explicit classification: ${unresolvedInternal.map((d) => d.reference).join(",")}`
    );
  }

  // Gate 8: a `gap` status must have a completeness basis — investigation
  // AND verification must have completed. Retrieval failure never converts
  // silently to Gap.
  if (input.assessment.status === "gap") {
    if (!input.assessment.completeness.verificationComplete || !input.assessment.completeness.investigationComplete) {
      push(
        "GAP_WITHOUT_COMPLETENESS_BASIS",
        `verificationComplete=${input.assessment.completeness.verificationComplete} investigationComplete=${input.assessment.completeness.investigationComplete}`
      );
    }
  }

  // Gate 9: status follows the authored aggregation rule.
  const rederived = rederiveStatus(input.schema, input.matrix, input.assessment);
  if (rederived !== input.assessment.status) {
    push(
      "STATUS_AGGREGATION_MISMATCH",
      `aggregationRule=${input.schema.aggregationRule} rederived=${rederived} assessed=${input.assessment.status}`
    );
  }

  // Gate 10: explanation.status agrees with assessment.status.
  if (input.explanation.status !== input.assessment.status) {
    push(
      "EXPLANATION_STATUS_MISMATCH",
      `explanation.status=${input.explanation.status} assessment.status=${input.assessment.status}`
    );
  }
  // Explanation supported/missing must match the matrix element states.
  const supportedFromMatrix = input.matrix.elements
    .filter((e) => e.state === "supported")
    .map((e) => e.elementId)
    .sort();
  const supportedFromExplanation = [...input.explanation.supportedElementIds].sort();
  if (JSON.stringify(supportedFromMatrix) !== JSON.stringify(supportedFromExplanation)) {
    push(
      "EXPLANATION_SUPPORTED_MISMATCH",
      `matrix=${supportedFromMatrix.join(",")} explanation=${supportedFromExplanation.join(",")}`
    );
  }
  const missingFromMatrix = input.matrix.elements
    .filter((e) => e.state === "not_located" || e.state === "ambiguous" || e.state === "unresolved_dependency")
    .map((e) => e.elementId)
    .sort();
  const missingFromExplanation = [...input.explanation.missingElementIds].sort();
  if (JSON.stringify(missingFromMatrix) !== JSON.stringify(missingFromExplanation)) {
    push(
      "EXPLANATION_MISSING_MISMATCH",
      `matrix=${missingFromMatrix.join(",")} explanation=${missingFromExplanation.join(",")}`
    );
  }

  // Gate 11: remediation addresses actual gaps — for every missingElementId,
  // the explanation's recommendedAction must mention that element id.
  for (const eid of input.explanation.missingElementIds) {
    if (!input.explanation.recommendedAction.includes(eid)) {
      push("REMEDIATION_MISALIGNED", `missing elementId=${eid} not addressed in remediation`);
    }
  }

  // Gate 12: document hash + rule version recorded.
  const documentHash = deriveDocumentHash(input);
  if (!documentHash) {
    push("DOCUMENT_HASH_MISSING", `documentIds=${input.documentIds.join(",")}`);
  }
  if (!input.assessment.ruleVersion) {
    push("RULE_VERSION_MISSING", `no ruleVersion on assessment ${input.requirementId}`);
  }

  const assessmentHash = hashAssessment(input);
  if (failures.length > 0) {
    return {
      kind: "rejected",
      reasonCodes: dedupeReasons(failures.map((f) => f.code)),
      details: failures.map((f) => `${f.code}: ${f.detail}`),
      assessmentHash,
    };
  }

  return {
    kind: "accepted",
    lockedAssessmentId: `L-${input.canonicalKey}-${assessmentHash.slice(0, 10)}`,
    assessmentHash,
    documentHash: documentHash!,
    ruleVersion: input.assessment.ruleVersion,
    canonicalKey: input.canonicalKey,
    status: input.assessment.status,
  };
}

function dedupeReasons(codes: LockGateCode[]): LockGateCode[] {
  return Array.from(new Set(codes));
}

function allScopesCompatible(scopes: Phase3ScopeVector[]): boolean {
  const nonEmpty = scopes.filter(
    (s) => s.relationship && s.relationship !== "unspecified"
  );
  if (nonEmpty.length < 2) return true;
  const first = nonEmpty[0].relationship!;
  return nonEmpty.every((s) => s.relationship === first);
}

/**
 * Re-derive what the status SHOULD be from the raw matrix + schema, purely
 * to check the recorded assessment hasn't drifted. Uses the same simple
 * aggregation rules as phase5-assess.ts, kept independent so any bug there
 * fails a gate here rather than silently unlocking.
 */
function rederiveStatus(
  schema: RequirementElementSchema,
  matrix: RequirementMatrix,
  assessment: AssessmentResult
): AssessmentResult["status"] {
  if (!assessment.completeness.verificationComplete) return "verification_incomplete";
  const applicable = matrix.elements.filter((e) => e.state !== "not_applicable");
  if (applicable.some((e) => e.state === "contradicted")) return "conflicting";
  const mandatory = applicable.filter((e) => kindFor(schema, e.elementId) === "mandatory");
  const alternatives = applicable.filter((e) => kindFor(schema, e.elementId) === "alternative");
  const supportedCount = applicable.filter((e) => e.state === "supported").length;
  const anyUnresolvedDep = applicable.some((e) => e.state === "unresolved_dependency");
  switch (schema.aggregationRule) {
    case "AND": {
      if (mandatory.every((e) => e.state === "supported")) return "present";
      if (anyUnresolvedDep && !assessment.completeness.investigationComplete) return "cannot_determine";
      if (supportedCount > 0) return "partial";
      return "gap";
    }
    case "OR": {
      if (supportedCount > 0) return "present";
      if (anyUnresolvedDep) return "cannot_determine";
      return "gap";
    }
    case "CHOICE": {
      const chooser = mandatory.find((e) => e.elementId === "G1");
      const proviso = mandatory.find((e) => e.elementId === "G4");
      const branchSupported = alternatives.some((e) => e.state === "supported");
      if (chooser?.state === "supported" && branchSupported && proviso?.state === "supported") return "present";
      if (branchSupported) return "partial";
      if (anyUnresolvedDep) return "cannot_determine";
      return "gap";
    }
    case "EXCEPTION": {
      if (mandatory.every((e) => e.state === "supported")) return "present";
      if (supportedCount > 0) return "partial";
      return "gap";
    }
    case "CONDITIONAL": {
      if (applicable.length === 0) return "not_applicable";
      return mandatory.every((e) => e.state === "supported") ? "present" : "partial";
    }
  }
}

function kindFor(schema: RequirementElementSchema, elementId: string): ElementSchema["kind"] | undefined {
  return schema.elements.find((e) => e.elementId === elementId)?.kind;
}

function deriveDocumentHash(input: LockInput): string | undefined {
  const docs = input.state.workspace?.documents ?? [];
  const primary = docs.filter((d) => input.documentIds.includes(d.docId));
  if (primary.length === 0) return undefined;
  const h = crypto.createHash("sha1");
  for (const d of primary) {
    h.update(d.docId);
    h.update("\0");
    h.update(d.fullText ?? "");
    h.update("\0");
  }
  return h.digest("hex").slice(0, 16);
}

function hashAssessment(input: LockInput): string {
  const payload = {
    canonicalKey: input.canonicalKey,
    schemaVersion: input.schema.version,
    ruleVersion: input.assessment.ruleVersion,
    status: input.assessment.status,
    reasonCodes: [...input.assessment.reasonCodes].sort(),
    elementStates: input.matrix.elements
      .slice()
      .sort((a, b) => a.elementId.localeCompare(b.elementId))
      .map((e) => ({
        elementId: e.elementId,
        state: e.state,
        evidenceSpanIds: [...e.evidenceSpanIds].sort(),
      })),
  };
  return crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

/**
 * Given a run's list of (requirementId → canonicalKey) pairs, return the set
 * of canonicalKeys that occur more than once. Used by Gate 2.
 */
export function duplicateCanonicalKeys(pairs: Array<{ canonicalKey: string }>): Set<string> {
  const counts = new Map<string, number>();
  for (const p of pairs) counts.set(p.canonicalKey, (counts.get(p.canonicalKey) ?? 0) + 1);
  const out = new Set<string>();
  for (const [k, n] of counts) if (n > 1) out.add(k);
  return out;
}
