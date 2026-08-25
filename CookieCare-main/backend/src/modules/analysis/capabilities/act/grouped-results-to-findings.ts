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
  GroupedRequirementResult,
  RequirementStatus,
} from "../../models/requirement-assessment.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { REFERENCED_ELSEWHERE_CLAIM_RE } from "./requirement-status-policy.js";

const TIER_BY_SOURCE: Record<EvidencePackageSourceMode, RuleSourceTier> = {
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
 * Translate grouped per-requirement results into the existing Finding model
 * (ACT refactor doc §8). Each result yields findings whose statuses reproduce
 * the requirement verdict under the deterministic status policy:
 *
 *   strong/adequate/covered -> one `present` finding
 *   gap/missing             -> one `absent_expected` finding
 *   conditional/partial     -> a `present` finding + an `absent_expected` gap finding
 *   cannot_determine        -> one `insufficient_evidence` finding
 *   not_applicable          -> one `not_covered` finding
 *
 * Annex/SOW pointers with a cited quote are remapped to conditional (not
 * cannot_determine): the obligation exists here; particulars live in a schedule.
 * Truncated unread extracts stay cannot_determine.
 * Every finding is tagged with `requirementId` so aggregation can group them.
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
  const tier = TIER_BY_SOURCE[ctx.sourceMode];

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
    requirementId: result.requirementId,
    unverified: ctx.sourceMode === "web_runtime" || undefined,
  };

  const status = effectiveResultStatus(result, ctx);

  switch (status) {
    case "strong":
    case "adequate":
    case "covered":
      return [
        {
          ...base,
          findingId: id("cov", result.requirementId, ctx),
          status: "present",
          claim: result.rationale,
        },
      ];
    case "gap":
    case "missing": {
      return [
        {
          ...base,
          findingId: id("miss", result.requirementId, ctx),
          status: "absent_expected",
          claim: result.rationale,
          gap: result.gap ?? result.rationale,
        },
      ];
    }
    case "conditional":
    case "partial":
      return [
        {
          ...base,
          findingId: id("part", result.requirementId, ctx),
          status: "present",
          claim: result.rationale,
        },
        {
          ...base,
          findingId: id("partgap", result.requirementId, ctx),
          status: "absent_expected",
          claim: result.gap ?? "Some required elements are absent or weak.",
          gap: result.gap ?? result.rationale,
        },
      ];
    case "cannot_determine":
      return [
        {
          ...base,
          findingId: id("cd", result.requirementId, ctx),
          status: "insufficient_evidence",
          claim: result.rationale,
        },
      ];
    case "not_applicable":
      return [
        {
          ...base,
          findingId: id("na", result.requirementId, ctx),
          status: "not_covered",
          claim: result.rationale,
        },
      ];
    default:
      return [];
  }
}

function effectiveResultStatus(
  result: GroupedRequirementResult,
  ctx: ConvertContext
): RequirementStatus {
  if (citedEvidenceTruncated(result, ctx)) {
    if (
      result.status === "gap" ||
      result.status === "missing" ||
      result.status === "cannot_determine"
    ) {
      return "cannot_determine";
    }
  }
  if (isAnnexPointerResult(result, ctx)) {
    if (
      result.status === "gap" ||
      result.status === "missing" ||
      result.status === "cannot_determine"
    ) {
      return "conditional";
    }
  }
  if (
    result.status === "cannot_determine" &&
    resolveEvidence(result.evidenceRefs, ctx).some((e) => e.quotedText?.trim())
  ) {
    return "conditional";
  }
  return result.status;
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
