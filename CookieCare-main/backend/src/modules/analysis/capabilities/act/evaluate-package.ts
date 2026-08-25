import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type { EvidencePackageSourceMode, SharedEvidenceBundle, SharedEvidenceItem } from "../../models/evidence-package.js";
import type { GroupedRequirementResult } from "../../models/requirement-assessment.js";
import type { SegmentedDocument } from "../../models/document-workspace.js";
import { getSkillById } from "../../skills/runtime/catalog/registry.js";
import { loadSkillMdSection } from "../../skills/runtime/catalog/load-skill-md.js";
import { resolveRule } from "./check-against-rule.js";
import { insufficient } from "./act-utils.js";
import { groupedResultsToFindings } from "./grouped-results-to-findings.js";
import { pacLog } from "../../utils/pac-log.js";
import { profileThinkingLevel } from "../../utils/profile-thinking.js";
import {
  EVALUATE_PACKAGE_SYSTEM_PROMPT,
  buildEvaluatePackageUserPrompt,
} from "../../prompts/evaluate-package.js";
import {
  expandSharedEvidenceItem,
  isHeadingOnlyMatch,
} from "./locate-evidence.js";

const MAX_BRIEF_CHARS = 4000;

const REQUIREMENT_STATUS_ENUM = [
  "covered",
  "partial",
  "missing",
  "not_applicable",
  "cannot_determine",
];

interface CapabilityBrief {
  id: string;
  kind: "rule" | "matrix_row" | "risk_category";
  text: string;
  findingCategory?: string;
}

/**
 * Grouped legal evaluation (ACT refactor doc §6-7). ONE LLM call evaluates every
 * requirement in the package against shared evidence and authored rule text, and
 * returns an independently-identifiable result per requirement. Results are then
 * translated into the existing Finding model — the grouped call is never the
 * persisted source of truth.
 */
export async function evaluatePackage(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const packageId = String(unit.input.packageId ?? "");
  const docId = String(unit.input.docId ?? "");
  const instruction = String(
    unit.input.instruction ?? state.request.instruction ?? ""
  );
  const capabilityIds = (unit.input.capabilityIds as string[]) ?? [];
  const contextCapabilityIds = (unit.input.contextCapabilityIds as string[]) ?? [];
  const packageRequirementIds = (unit.input.requirementIds as string[]) ?? [];
  const retryRequirementIds = Array.isArray(unit.input.retryRequirementIds)
    ? (unit.input.retryRequirementIds as string[])
    : [];
  const requirementIds =
    retryRequirementIds.length > 0
      ? packageRequirementIds.filter((id) => retryRequirementIds.includes(id))
      : packageRequirementIds;
  const sourceMode =
    (unit.input.sourceMode as EvidencePackageSourceMode) ?? "authored";
  const depth = String(unit.input.depth ?? "standard");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];

  if (requirementIds.length === 0) {
    return {
      state,
      findings: [
        ...findings,
        insufficient(unit, `Package ${packageId} resolved no requirements`),
      ],
    };
  }

  const briefs = await buildCapabilityBriefs(skillIds, capabilityIds);
  const contextBriefs =
    contextCapabilityIds.length > 0
      ? await buildCapabilityBriefs(skillIds, contextCapabilityIds)
      : [];
  const findingCategory =
    briefs.find((b) => b.findingCategory)?.findingCategory ?? "other_known_risk";
  const bundle = state.sharedEvidence?.[packageId];
  const evidenceItems = bundle?.items ?? [];
  const inputArtifactIds = (unit.input.inputArtifactIds as string[]) ?? [];
  const artifactLines = inputArtifactIds.flatMap((artifactId) => {
    const artifact = state.analysisArtifacts?.[artifactId];
    if (!artifact) return [];
    const serialized = JSON.stringify(artifact.data).slice(0, 5000);
    return [`Structured ${artifact.type} records:`, serialized];
  });

  const previousFeedback = unit.input.previousAttemptFeedback
    ? String(unit.input.previousAttemptFeedback)
    : "";

  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  let nextState = state;
  let workingBundle = bundle;
  let workingItems = evidenceItems;

  const runEval = async (
    reqIds: string[],
    items: SharedEvidenceItem[],
    extraFeedback?: string
  ): Promise<GroupedRequirementResult[]> => {
    const evidenceLines = items.map((e) => formatEvidenceLine(e));
    const prompt = buildEvaluatePackageUserPrompt({
      instruction,
      depth,
      requirementIds: reqIds,
      authoredRuleText: briefs
        .map((b) => `[${b.id}] ${b.text}`)
        .join("\n")
        .slice(0, MAX_BRIEF_CHARS),
      evidenceLines: [...evidenceLines, ...artifactLines],
      previousFeedback: extraFeedback || previousFeedback || undefined,
      contextRuleText:
        contextBriefs.length > 0
          ? contextBriefs
              .map((b) => `[${b.id}] ${b.text}`)
              .join("\n")
              .slice(0, MAX_BRIEF_CHARS)
          : undefined,
    });
    const briefJoined = briefs.map((b) => `[${b.id}] ${b.text}`).join("\n");
    const evidenceJoined = items
      .map((e) => `(${e.ref}) [${e.clauseType}] ${e.quotedText}`)
      .join("\n");
    pacLog("evaluate_package prompt", {
      id: unit.workUnitId,
      packageId,
      requirements: reqIds.length,
      capabilities: capabilityIds.length,
      contextCapabilities: contextCapabilityIds.length,
      evidence: items.length,
      promptChars: prompt.length,
      briefChars: briefJoined.length,
      evidenceChars: evidenceJoined.length,
      expansion: Boolean(extraFeedback),
    });

    const schema = {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirementId: { type: "string", enum: reqIds },
          status: { type: "string", enum: REQUIREMENT_STATUS_ENUM },
          rationale: { type: "string" },
          gap: { type: "string" },
          evidenceRefs: { type: "array", items: { type: "string" } },
          recommendation: { type: "string" },
        },
        required: ["requirementId", "status", "rationale", "evidenceRefs"],
      },
    };

    return executeJsonCompletion<GroupedRequirementResult[]>(
      prompt,
      EVALUATE_PACKAGE_SYSTEM_PROMPT,
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      { tracker, thinkingLevel: profileThinkingLevel(state, LLMTask.STRUCTURAL_JSON) }
    );
  };

  let results: GroupedRequirementResult[] = [];
  const llmStart = Date.now();
  try {
    results = await runEval(requirementIds, workingItems);
  } catch (err) {
    return {
      state,
      findings: [
        ...findings,
        insufficient(
          unit,
          `Grouped evaluation failed for package ${packageId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        ),
      ],
    };
  }
  if (tracker && state.agent) state.agent.tokensUsed = tracker.tokensUsed;
  pacLog("evaluate_package llm", {
    id: unit.workUnitId,
    packageId,
    ms: Date.now() - llmStart,
  });

  const alreadyExpanded = unit.input.evidenceExpansionDone === true;
  if (!alreadyExpanded && workingBundle) {
    const retryIds = requirementsNeedingEvidenceExpansion(results, workingBundle);
    if (retryIds.length > 0) {
      const doc = state.workspace.documents.find((d) => d.docId === docId);
      const expanded = doc
        ? expandBundleItems(doc, workingBundle, retryIds, results)
        : null;
      if (expanded && expanded.changed) {
        workingBundle = expanded.bundle;
        workingItems = expanded.bundle.items;
        const expandStart = Date.now();
        try {
          const retryResults = await runEval(
            retryIds,
            workingItems,
            "Re-evaluate using the expanded complete clause text. Do not treat a previous prefix as the whole provision."
          );
          results = mergeRequirementResults(results, retryResults);
          pacLog("evaluate_package expansion", {
            id: unit.workUnitId,
            packageId,
            retry: retryIds.length,
            ms: Date.now() - expandStart,
          });
        } catch (err) {
          pacLog("evaluate_package expansion failed", {
            id: unit.workUnitId,
            packageId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        if (tracker && nextState.agent) nextState.agent.tokensUsed = tracker.tokensUsed;
        nextState = {
          ...nextState,
          sharedEvidence: {
            ...(nextState.sharedEvidence ?? {}),
            [packageId]: workingBundle,
          },
        };
      }
    }
  }

  const emitted = groupedResultsToFindings(normalize(results, requirementIds), {
    unit,
    docId,
    packageId,
    sourceMode,
    skillId: skillIds[0],
    findingCategory,
    bundle: workingBundle,
  });

  // Requirements the model silently dropped are surfaced as indeterminate so
  // CRITIQUE completeness catches them rather than assuming coverage.
  const answered = new Set(results.map((r) => r.requirementId));
  const missingResults: GroupedRequirementResult[] = requirementIds
    .filter((id) => !answered.has(id))
    .map((id) => ({
      requirementId: id,
      status: "cannot_determine",
      rationale: "The grouped evaluation returned no result for this requirement.",
      evidenceRefs: [],
    }));
  const missingFindings = groupedResultsToFindings(missingResults, {
    unit,
    docId,
    packageId,
    sourceMode,
    skillId: skillIds[0],
    findingCategory,
    bundle: workingBundle,
  });

  return { state: nextState, findings: [...findings, ...emitted, ...missingFindings] };
}

function normalize(
  results: GroupedRequirementResult[],
  requirementIds: string[]
): GroupedRequirementResult[] {
  const allowed = new Set(requirementIds);
  const seen = new Set<string>();
  const out: GroupedRequirementResult[] = [];
  for (const r of results) {
    if (!r || !allowed.has(r.requirementId) || seen.has(r.requirementId)) continue;
    seen.add(r.requirementId);
    out.push({
      requirementId: r.requirementId,
      status: r.status,
      rationale: r.rationale ?? "",
      gap: r.gap,
      evidenceRefs: Array.isArray(r.evidenceRefs) ? r.evidenceRefs : [],
      recommendation: r.recommendation,
    });
  }
  return out;
}

function formatEvidenceLine(e: SharedEvidenceItem): string {
  const flags = [
    e.evidenceStatus ? `status=${e.evidenceStatus}` : "",
    e.truncated ? "truncated=true" : "",
    isHeadingOnlyMatch(e.matchReason) ? "heading_only=true" : "",
    e.referencedDocuments && e.referencedDocuments.length > 0
      ? `referenced=${e.referencedDocuments.join(" | ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const tag = flags ? ` ${flags}` : "";
  return `(${e.ref}) [${e.clauseType}${tag}] ${e.quotedText}`;
}

function citedItems(
  result: GroupedRequirementResult,
  bundle: SharedEvidenceBundle
): SharedEvidenceItem[] {
  if (result.evidenceRefs.length === 0) return bundle.items;
  const wanted = new Set(result.evidenceRefs);
  const hit = bundle.items.filter((item) => wanted.has(item.ref));
  return hit.length > 0 ? hit : bundle.items;
}

function evidenceIsIncomplete(
  result: GroupedRequirementResult,
  bundle: SharedEvidenceBundle
): boolean {
  const items = citedItems(result, bundle);
  return items.some(
    (item) => item.truncated || isHeadingOnlyMatch(item.matchReason)
  );
}

function requirementsNeedingEvidenceExpansion(
  results: GroupedRequirementResult[],
  bundle: SharedEvidenceBundle
): string[] {
  return results
    .filter(
      (r) =>
        (r.status === "cannot_determine" || r.status === "partial") &&
        evidenceIsIncomplete(r, bundle)
    )
    .map((r) => r.requirementId);
}

function expandBundleItems(
  doc: SegmentedDocument,
  bundle: SharedEvidenceBundle,
  retryIds: string[],
  results: GroupedRequirementResult[]
): { bundle: SharedEvidenceBundle; changed: boolean } {
  const retry = new Set(retryIds);
  const refsToExpand = new Set<string>();
  for (const result of results) {
    if (!retry.has(result.requirementId)) continue;
    for (const item of citedItems(result, bundle)) {
      if (item.truncated || isHeadingOnlyMatch(item.matchReason)) {
        refsToExpand.add(item.ref);
      }
    }
  }
  if (refsToExpand.size === 0) {
    for (const item of bundle.items) {
      if (item.truncated || isHeadingOnlyMatch(item.matchReason)) {
        refsToExpand.add(item.ref);
      }
    }
  }
  let changed = false;
  const items = bundle.items.map((item) => {
    if (!refsToExpand.has(item.ref)) return item;
    const expanded = expandSharedEvidenceItem(doc, item);
    if (!expanded) return item;
    changed = true;
    return expanded;
  });
  return { bundle: { ...bundle, items }, changed };
}

function mergeRequirementResults(
  original: GroupedRequirementResult[],
  retry: GroupedRequirementResult[]
): GroupedRequirementResult[] {
  const byId = new Map(original.map((r) => [r.requirementId, r]));
  for (const next of retry) {
    byId.set(next.requirementId, next);
  }
  return [...byId.values()];
}

async function buildCapabilityBriefs(
  skillIds: string[],
  capabilityIds: string[]
): Promise<CapabilityBrief[]> {
  const briefs: CapabilityBrief[] = [];
  for (const capId of capabilityIds) {
    const rule = resolveRule(skillIds, capId);
    if (rule) {
      const section = await loadSkillMdSection(rule.skillId, `rule:${capId}`);
      briefs.push({
        id: capId,
        kind: "rule",
        text: rule.rule.ruleText || section || rule.rule.label || capId,
        findingCategory: rule.rule.findingCategory,
      });
      continue;
    }
    const fromSkill = resolveNonRuleCapability(skillIds, capId);
    if (fromSkill) briefs.push(fromSkill);
  }
  return briefs;
}

function resolveNonRuleCapability(
  skillIds: string[],
  capId: string
): CapabilityBrief | null {
  for (const skillId of skillIds) {
    const skill = getSkillById(skillId);
    if (!skill) continue;
    const row = skill.rightsMatrixRows?.find((r) => r.rowId === capId);
    if (row) {
      return {
        id: capId,
        kind: "matrix_row",
        text: `${row.label} (Article ${row.article})`,
      };
    }
    const risk = skill.riskCategories.find((r) => r.category === capId);
    if (risk) {
      return {
        id: capId,
        kind: "risk_category",
        text: `${risk.displayLabel}: ${risk.guidance}`,
        findingCategory: risk.category,
      };
    }
  }
  return null;
}
