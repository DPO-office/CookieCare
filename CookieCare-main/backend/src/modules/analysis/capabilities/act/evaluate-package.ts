import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type { EvidencePackageSourceMode } from "../../models/evidence-package.js";
import type { GroupedRequirementResult } from "../../models/requirement-assessment.js";
import { getSkillById } from "../../skills/registry.js";
import { loadSkillMdSection } from "../../skills/load-skill-md.js";
import { resolveRule } from "./check-against-rule.js";
import { insufficient } from "./act-utils.js";
import { groupedResultsToFindings } from "./grouped-results-to-findings.js";
import { pacLog } from "../../utils/pac-log.js";

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
  const findingCategory =
    briefs.find((b) => b.findingCategory)?.findingCategory ?? "other_known_risk";
  const bundle = state.sharedEvidence?.[packageId];
  const evidenceItems = bundle?.items ?? [];

  const previousFeedback = unit.input.previousAttemptFeedback
    ? String(unit.input.previousAttemptFeedback)
    : "";

  const prompt = [
    `User instruction: ${instruction}`,
    `Evaluation depth: ${depth}`,
    "",
    "Requirements to establish (return exactly one result per requirementId):",
    ...requirementIds.map((id) => `- ${id}`),
    "",
    "Authored legal rule text (evaluate only against this — do not invent law):",
    briefs.map((b) => `[${b.id}] ${b.text}`).join("\n").slice(0, MAX_BRIEF_CHARS),
    "",
    "Evidence extracted from the document (cite by ref in evidenceRefs):",
    evidenceItems.length
      ? evidenceItems
          .map((e) => `(${e.ref}) [${e.clauseType}] ${e.quotedText}`)
          .join("\n")
      : "(no clause evidence was extracted for this package)",
    previousFeedback
      ? `\nPrior attempt feedback to address:\n${previousFeedback}`
      : "",
    "",
    "For each requirement decide: covered, partial, missing, not_applicable, or",
    "cannot_determine. Ground every conclusion in the evidence refs; if evidence",
    "is absent, do not assume compliance.",
  ]
    .filter(Boolean)
    .join("\n");

  const briefJoined = briefs.map((b) => `[${b.id}] ${b.text}`).join("\n");
  const evidenceJoined = evidenceItems
    .map((e) => `(${e.ref}) [${e.clauseType}] ${e.quotedText}`)
    .join("\n");
  pacLog("evaluate_package prompt", {
    id: unit.workUnitId,
    packageId,
    requirements: requirementIds.length,
    capabilities: capabilityIds.length,
    evidence: evidenceItems.length,
    promptChars: prompt.length,
    briefChars: briefJoined.length,
    evidenceChars: evidenceJoined.length,
  });

  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        requirementId: { type: "string", enum: requirementIds },
        status: { type: "string", enum: REQUIREMENT_STATUS_ENUM },
        rationale: { type: "string" },
        gap: { type: "string" },
        evidenceRefs: { type: "array", items: { type: "string" } },
        recommendation: { type: "string" },
      },
      required: ["requirementId", "status", "rationale", "evidenceRefs"],
    },
  };

  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  let results: GroupedRequirementResult[] = [];
  const llmStart = Date.now();
  try {
    results = await executeJsonCompletion<GroupedRequirementResult[]>(
      prompt,
      "You are a precise legal/compliance analyst. Evaluate each requirement " +
        "independently against the authored rule text and the supplied evidence. " +
        "Never fabricate evidence or assume a compliant result when evidence is absent.",
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      tracker
    );
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

  const emitted = groupedResultsToFindings(normalize(results, requirementIds), {
    unit,
    docId,
    packageId,
    sourceMode,
    skillId: skillIds[0],
    findingCategory,
    bundle,
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
    bundle,
  });

  return { state, findings: [...findings, ...emitted, ...missingFindings] };
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
