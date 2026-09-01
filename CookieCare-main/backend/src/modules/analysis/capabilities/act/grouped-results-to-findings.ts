import crypto from "crypto";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type { EvidenceSpan } from "../../models/locator.js";
import type { RuleSourceTier } from "../../models/rule-source.js";
import type {
  EvidencePackageSourceMode,
  SharedEvidenceBundle,
} from "../../models/evidence-package.js";
import type {
  ComplianceStatus,
  EvidenceConfidence,
  EvidenceState,
  GroupedRequirementResult,
  MaterialityLevel,
  NliLabel,
  ReferenceBinding,
  RequirementJudgement,
  RequirementStatus,
} from "../../models/requirement-assessment.js";
import {
  statusFromJudgement,
  withRecommendationKind,
} from "../../models/requirement-assessment.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { REFERENCED_ELSEWHERE_CLAIM_RE } from "./requirement-status-policy.js";
import { canonicalRequirementId } from "../../shared/requirement-identity.js";

export const TIER_BY_SOURCE: Record<EvidencePackageSourceMode, RuleSourceTier> = {
  authored: "B",
  playbook_runtime: "P",
  web_runtime: "C",
};

export interface ConvertContext {
  unit: AnalysisWorkUnit;
  docId: string;
  packageId: string;
  sourceMode: EvidencePackageSourceMode;
  skillId?: string;
  /** Representative authored finding category for this package. */
  findingCategory: string;
  bundle?: SharedEvidenceBundle;
}

/**
 * Translate grouped per-requirement results into Findings.
 *
 * Compliance (not NLI) drives Finding.status. Axes are stamped on the finding
 * so aggregation can lock the judgement without re-asking the model.
 */
export function groupedResultsToFindings(
  results: GroupedRequirementResult[],
  ctx: ConvertContext
): Finding[] {
  const findings: Finding[] = [];
  for (const result of results) {
    findings.push(...findingsForResult(result, ctx));
  }
  return findings;
}

function findingsForResult(
  result: GroupedRequirementResult,
  ctx: ConvertContext
): Finding[] {
  const evidence = resolveEvidence(result.evidenceRefs, ctx);
  const judgement = judgementForResult(result, ctx);
  const tier = TIER_BY_SOURCE[ctx.sourceMode];
  const requirementId = canonicalRequirementId(result.requirementId);

  const base = {
    kind: "compliance" as const,
    category: ctx.findingCategory,
    evidence,
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: ctx.unit.workUnitId,
    skillId: ctx.skillId,
    packageId: ctx.packageId,
    visibility: "user_facing" as const,
    ruleSourceTier: tier,
    requirementId,
    unverified: ctx.sourceMode === "web_runtime" || undefined,
    judgement,
  };

  switch (judgement.compliance) {
    case "present":
      return [
        {
          ...base,
          findingId: id("cov", requirementId, ctx),
          status: "present",
          claim: result.rationale,
        },
      ];
    case "gap":
      return [
        {
          ...base,
          findingId: id("miss", requirementId, ctx),
          status: "absent_expected",
          claim: result.rationale,
          gap: result.gap ?? result.rationale,
        },
      ];
    case "partial":
      return [
        {
          ...base,
          findingId: id("part", requirementId, ctx),
          status: "present",
          claim: result.rationale,
        },
        {
          ...base,
          findingId: id("partgap", requirementId, ctx),
          status: "absent_expected",
          claim: result.gap ?? "Some required elements are absent or weak.",
          gap: result.gap ?? result.rationale,
        },
      ];
    case "insufficient_evidence":
      return [
        {
          ...base,
          findingId: id("cd", requirementId, ctx),
          status: "insufficient_evidence",
          claim: result.rationale,
        },
      ];
    case "not_applicable":
      return [
        {
          ...base,
          findingId: id("na", requirementId, ctx),
          status: "not_covered",
          claim: result.rationale,
        },
      ];
    default:
      return [];
  }
}

export function judgementForResult(
  result: GroupedRequirementResult,
  ctx: ConvertContext
): RequirementJudgement {
  const truncated = citedEvidenceTruncated(result, ctx);
  const annex = isAnnexPointerResult(result, ctx);
  const quotes = resolveEvidence(result.evidenceRefs, ctx)
    .map((item) => item.quotedText ?? "")
    .join(" ");
  const substance = quoteHasMaterialSubstance(quotes);
  const hasQuote = quotes.trim().length > 0;
  const emptyRefs = result.evidenceRefs.length === 0;

  let compliance = normalizeCompliance(result);
  let evidenceState = normalizeEvidenceState(result, truncated, annex, emptyRefs);
  let referenceBinding = normalizeBinding(result, annex);
  const nli = normalizeNli(result);
  let draftingQuality = result.draftingQuality;
  const materiality = normalizeMateriality(result, compliance);
  const evidenceConfidence = normalizeConfidence(result, hasQuote, truncated);

  if (truncated && (compliance === "gap" || emptyRefs || compliance === "insufficient_evidence")) {
    compliance = "insufficient_evidence";
    evidenceState = "truncated";
  } else if (annex) {
    if (referenceBinding === "none") {
      referenceBinding = hasBindingLanguage(result, quotes) ? "binding" : "floating";
    }
    if (substance) {
      if (compliance === "gap" || compliance === "insufficient_evidence") {
        compliance = "present";
      }
      if (hasBindingLanguage(result, quotes)) {
        referenceBinding = "binding";
        if (evidenceState === "direct" || evidenceState === "not_found") {
          evidenceState = "incorporated";
        }
      } else if (referenceBinding === "floating") {
        referenceBinding = "none";
        if (evidenceState === "not_found") evidenceState = "direct";
      }
    } else {
      if (compliance === "gap") {
        compliance =
          referenceBinding === "binding" ? "present" : "insufficient_evidence";
      }
      if (compliance === "insufficient_evidence" && referenceBinding === "binding") {
        compliance = "present";
      }
      if (evidenceState === "direct" || evidenceState === "not_found") {
        evidenceState = "incorporated";
      }
      if (referenceBinding === "floating" && compliance === "present") {
        compliance = "insufficient_evidence";
      }
    }
  } else if (substance && compliance === "insufficient_evidence" && hasQuote) {
    compliance = "present";
    if (evidenceState === "not_found") evidenceState = "direct";
  }

  if (nli === "not_mentioned" && emptyRefs && compliance === "gap") {
    compliance = "insufficient_evidence";
    evidenceState = evidenceState === "direct" ? "not_found" : evidenceState;
  }

  // Model contradiction: claims coverage while stating the extracts do not speak
  // to the hypothesis, or marks evidence unavailable/not_found.
  if (
    (compliance === "present" || compliance === "partial") &&
    (evidenceState === "unavailable" ||
      evidenceState === "not_found" ||
      rationaleDeniesCoverage(result))
  ) {
    compliance = "insufficient_evidence";
    if (evidenceState === "direct") evidenceState = "not_found";
  }

  if (!draftingQuality && (compliance === "present" || compliance === "partial")) {
    draftingQuality = "clean";
  }

  return withRecommendationKind({
    compliance,
    evidenceState,
    referenceBinding,
    evidenceConfidence,
    draftingQuality,
    materiality,
    nli,
  });
}

function normalizeCompliance(result: GroupedRequirementResult): ComplianceStatus {
  if (result.compliance) return result.compliance;
  const status = result.status;
  if (status === "strong" || status === "adequate" || status === "covered") {
    return "present";
  }
  if (status === "conditional" || status === "partial") return "partial";
  if (status === "gap" || status === "missing") return "gap";
  if (status === "not_applicable") return "not_applicable";
  return "insufficient_evidence";
}

function normalizeEvidenceState(
  result: GroupedRequirementResult,
  truncated: boolean,
  annex: boolean,
  emptyRefs: boolean
): EvidenceState {
  if (result.evidenceState) return result.evidenceState;
  if (truncated) return "truncated";
  if (annex) return "incorporated";
  if (emptyRefs) return "not_found";
  return "direct";
}

function normalizeBinding(
  result: GroupedRequirementResult,
  annex: boolean
): ReferenceBinding {
  if (result.referenceBinding) return result.referenceBinding;
  if (!annex) return "none";
  return hasBindingLanguage(result) ? "binding" : "floating";
}

function hasBindingLanguage(result: GroupedRequirementResult, extra = ""): boolean {
  return /\b(incorporated by reference|shall (?:apply|form part)|as (?:specified|set forth) in)\b/i.test(
    `${result.rationale} ${result.gap ?? ""} ${extra}`
  );
}

/** True when the model itself says the candidate extracts do not support the ask. */
export function rationaleDeniesCoverage(result: GroupedRequirementResult): boolean {
  const text = `${result.rationale ?? ""} ${result.gap ?? ""}`.toLowerCase();
  if (!text.trim()) return false;
  return (
    /\bdoes not (?:contain|state|mention|address|speak to|incorporate|include)\b/.test(text) ||
    /\bdo not (?:contain|state|mention|address|speak to|incorporate|include)\b/.test(text) ||
    /\bno (?:information|evidence|mention|language) (?:regarding|about|on|of)\b/.test(text) ||
    /\bcandidate extracts? (?:provided )?(?:do not|does not|do not speak)\b/.test(text)
  );
}

const POINTER_ONLY_RE =
  /^(see|refer(?:red)? to)\b|\b(see (?:the )?(?:annex|schedule|appendix|exhibit|sow|offer disclosure)|incorporated by reference|particulars (?:are|set out) in)\b/i;

export function quoteHasMaterialSubstance(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return false;
  const hasOperativeLanguage =
    /\b(shall|must|will|agrees|remains in force|duration|term of|obligations?|rights?|process(?:es|ing)?|assist|delete|return|confidential|notice|object|authoris|authoriz|minimi[sz]e|lawful|implement)\b/i.test(
      trimmed
    );
  if (hasOperativeLanguage && trimmed.length >= 40 && !isPointerOnlyText(trimmed)) {
    return true;
  }
  return trimmed.length >= 80 && hasOperativeLanguage;
}

function isPointerOnlyText(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return true;
  if (/\b(shall|must|will|agrees)\b/i.test(trimmed) && trimmed.length >= 40) return false;
  return trimmed.length < 90 && POINTER_ONLY_RE.test(trimmed);
}

function normalizeNli(result: GroupedRequirementResult): NliLabel | undefined {
  if (result.nli) return result.nli;
  return undefined;
}

function normalizeMateriality(
  result: GroupedRequirementResult,
  compliance: ComplianceStatus
): MaterialityLevel {
  if (result.materiality) return result.materiality;
  if (compliance === "gap") return "high";
  if (compliance === "partial") return "medium";
  return "low";
}

function normalizeConfidence(
  result: GroupedRequirementResult,
  hasQuote: boolean,
  truncated: boolean
): EvidenceConfidence {
  if (result.evidenceConfidence) return result.evidenceConfidence;
  if (truncated || !hasQuote) return "low";
  return result.status === "strong" ? "high" : "medium";
}

function isAnnexPointerResult(
  result: GroupedRequirementResult,
  ctx: ConvertContext
): boolean {
  const text = `${result.rationale} ${result.gap ?? ""}`;
  if (REFERENCED_ELSEWHERE_CLAIM_RE.test(text)) return true;
  return bundleHasReferencedElsewhere(result.evidenceRefs, ctx);
}

function citedEvidenceTruncated(
  result: GroupedRequirementResult,
  ctx: ConvertContext
): boolean {
  if (!ctx.bundle) return false;
  const items =
    result.evidenceRefs.length > 0
      ? ctx.bundle.items.filter((item) => result.evidenceRefs.includes(item.ref))
      : ctx.bundle.items;
  return items.some((item) => item.truncated);
}

function bundleHasReferencedElsewhere(
  refs: string[],
  ctx: ConvertContext
): boolean {
  if (!ctx.bundle) return false;
  const items =
    refs.length > 0
      ? ctx.bundle.items.filter((item) => refs.includes(item.ref))
      : ctx.bundle.items;
  if (items.length === 0) return false;
  return items.some((item) => item.evidenceStatus === "referenced_elsewhere");
}

function resolveEvidence(
  refs: string[],
  ctx: ConvertContext
): EvidenceSpan[] {
  if (!ctx.bundle || refs.length === 0) return [];
  const byRef = new Map(ctx.bundle.items.map((item) => [item.ref, item]));
  const spans: EvidenceSpan[] = [];
  for (const ref of refs) {
    const item = byRef.get(ref);
    if (!item) continue;
    spans.push({
      locator: {
        docId: ctx.docId,
        structuralPath: item.structuralPath,
        charRange: item.charRange,
      },
      quotedText: item.quotedText,
      sourceRole: "target",
    });
  }
  return spans;
}

function id(
  tag: string,
  requirementId: string,
  ctx: ConvertContext
): string {
  const slug = requirementId.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `f_pkg_${tag}_${slug}_${ctx.unit.workUnitId}_${crypto
    .randomUUID()
    .slice(0, 6)}`;
}

/** @internal exported for tests that still inspect the projected status. */
export function projectedStatusForResult(
  result: GroupedRequirementResult,
  ctx: ConvertContext
): RequirementStatus {
  return statusFromJudgement(judgementForResult(result, ctx));
}
