import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  CritiqueIssue,
  CritiqueTarget,
  DeepCritiqueResult,
  FixItem,
} from "../../models/critique-report.js";
import type { Finding } from "../../models/finding.js";
import { dedupeFixes } from "../../shared/dedupe.js";
import { resolveRule } from "../act/check-against-rule.js";

export interface DeepCritiqueRun {
  results: DeepCritiqueResult[];
  issues: CritiqueIssue[];
  fixPlan: FixItem[];
  llmCalls: number;
}

/**
 * One bounded semantic call over only the selected targets. The full analysis
 * transcript and unrelated Findings are deliberately excluded.
 */
export async function runDeepCritique(
  state: AnalysisState,
  targets: CritiqueTarget[]
): Promise<DeepCritiqueRun> {
  if (targets.length === 0) {
    return { results: [], issues: [], fixPlan: [], llmCalls: 0 };
  }

  const contexts = targets.map((target) => buildTargetContext(state, target));
  const allowedIds = contexts.map((context) => context.targetId);
  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        targetId: { type: "string", enum: allowedIds },
        verdict: {
          type: "string",
          enum: [
            "supported",
            "unsupported",
            "partially_supported",
            "insufficient_evidence",
          ],
        },
        explanation: { type: "string" },
        conflictingEvidence: {
          type: "array",
          items: { type: "string" },
        },
        recommendedAction: {
          type: "string",
          enum: [
            "keep",
            "retry_evidence",
            "retry_evaluation",
            "mark_uncertain",
          ],
        },
      },
      required: [
        "targetId",
        "verdict",
        "explanation",
        "recommendedAction",
      ],
    },
  };
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;

  try {
    const raw = await executeJsonCompletion<DeepCritiqueResult[]>(
      [
        "Verify only the targeted claim/requirement contexts below.",
        "For each target decide whether its conclusion follows from its quoted evidence and applicable authored rule/capability.",
        "Do not create findings, broaden scope, or evaluate unrelated requirements.",
        JSON.stringify(contexts),
      ].join("\n\n"),
      "You are a targeted legal-evidence verifier. Check entailment only. Never invent evidence, law, or a replacement legal conclusion.",
      schema,
      LLMTask.CRITIQUE_CHECKLIST,
      LLMProvider.GEMINI,
      tracker
    );
    if (state.agent && tracker) state.agent.tokensUsed = tracker.tokensUsed;
    return materializeResults(state, targets, normalize(raw, allowedIds), 1);
  } catch (error) {
    console.warn(
      "[runDeepCritique] targeted verification unavailable; preserving findings as uncertain:",
      error
    );
    const results: DeepCritiqueResult[] = targets.map((target) => ({
      targetId: targetId(target),
      verdict: "insufficient_evidence",
      explanation: "Targeted semantic verification was unavailable.",
      recommendedAction: "mark_uncertain",
    }));
    return materializeResults(state, targets, results, 1);
  }
}

function buildTargetContext(state: AnalysisState, target: CritiqueTarget) {
  const findings = findingsForTarget(state, target);
  const ruleIds = [...new Set(findings.map((finding) => finding.ruleId).filter(Boolean))];
  const rules = ruleIds.map((ruleId) => {
    const resolved = resolveRule(state.activeSkillIds ?? [], ruleId!);
    return {
      ruleId,
      ruleText: resolved?.rule.ruleText,
      legalHook: resolved?.rule.legalHook,
    };
  });
  const assessment = state.requirementAssessments?.find(
    (candidate) => candidate.requirementId === target.requirementId
  );
  const workUnit = state.plan?.workUnits.find(
    (candidate) => candidate.workUnitId === target.workUnitId
  );
  return {
    targetId: targetId(target),
    reason: target.reason,
    instruction: target.instruction,
    requirement: assessment
      ? {
          requirementId: assessment.requirementId,
          status: assessment.status,
          summary: assessment.summary,
        }
      : target.requirementId
        ? { requirementId: target.requirementId }
        : undefined,
    findings: findings.map((finding) => ({
      findingId: finding.findingId,
      kind: finding.kind,
      status: finding.status,
      claim: finding.claim,
      gap: finding.gap,
      severity: finding.severity,
      evidence: finding.evidence.map((evidence) => ({
        quotedText: evidence.quotedText,
        sourceRole: evidence.sourceRole,
        structuralPath: evidence.locator.structuralPath,
      })),
    })),
    applicableRules: rules,
    capabilityIds: Array.isArray(workUnit?.input.capabilityIds)
      ? workUnit.input.capabilityIds
      : undefined,
    priorEvaluation: workUnit?.input.previousAttemptFeedback,
  };
}

function materializeResults(
  state: AnalysisState,
  targets: CritiqueTarget[],
  results: DeepCritiqueResult[],
  llmCalls: number
): DeepCritiqueRun {
  const normalizedResults = results.map(normalizeRecommendedAction);
  const byId = new Map(
    normalizedResults.map((result) => [result.targetId, result])
  );
  const issues: CritiqueIssue[] = [];
  const fixPlan: FixItem[] = [];

  for (const target of targets) {
    const id = targetId(target);
    const result =
      byId.get(id) ??
      ({
        targetId: id,
        verdict: "insufficient_evidence",
        explanation: "Deep Critique returned no result for this target.",
        recommendedAction: "mark_uncertain",
      } satisfies DeepCritiqueResult);
    const supported = result.verdict === "supported";
    const retryRequested =
      result.recommendedAction === "retry_evidence" ||
      result.recommendedAction === "retry_evaluation";
    issues.push({
      itemId: `deep:${id}`,
      status: supported
        ? "pass"
        : retryRequested
          ? "fail"
          : "ambiguous",
      evidenceVerified: supported,
      findingId: target.findingId,
      workUnitId: target.workUnitId,
      detail: result.explanation,
    });

    if (
      result.recommendedAction === "retry_evidence" ||
      result.recommendedAction === "retry_evaluation"
    ) {
      const evidenceUnitId =
        result.recommendedAction === "retry_evidence"
          ? evidenceUnitForTarget(state, target)
          : undefined;
      if (evidenceUnitId) {
        fixPlan.push({
          workUnitId: evidenceUnitId,
          instruction: `Re-extract evidence for targeted verification ${id}`,
          sourceItemId: `${id}:evidence`,
          requirementId: target.requirementId,
          findingId: target.findingId,
        });
      }
      fixPlan.push({
        workUnitId: target.workUnitId,
        instruction:
          target.instruction ??
          `Targeted retry for ${id}: ${result.explanation}`,
        sourceItemId: id,
        requirementId: target.requirementId,
        findingId: target.findingId,
      });
    }
  }

  return {
    results: targets.map(
      (target) =>
        byId.get(targetId(target)) ?? {
          targetId: targetId(target),
          verdict: "insufficient_evidence",
          explanation: "Deep Critique returned no result for this target.",
          recommendedAction: "mark_uncertain",
        }
    ),
    issues,
    fixPlan: dedupeFixes(fixPlan),
    llmCalls,
  };
}

function normalizeRecommendedAction(
  result: DeepCritiqueResult
): DeepCritiqueResult {
  if (result.verdict === "supported") {
    return { ...result, recommendedAction: "keep" };
  }
  if (
    result.recommendedAction === "retry_evidence" ||
    result.recommendedAction === "retry_evaluation" ||
    result.recommendedAction === "mark_uncertain"
  ) {
    return result;
  }
  return {
    ...result,
    recommendedAction:
      result.verdict === "unsupported"
        ? "retry_evaluation"
        : "mark_uncertain",
  };
}

function findingsForTarget(
  state: AnalysisState,
  target: CritiqueTarget
): Finding[] {
  if (target.requirementId) {
    const assessment = state.requirementAssessments?.find(
      (candidate) => candidate.requirementId === target.requirementId
    );
    if (assessment) {
      const ids = new Set(assessment.supportingFindingIds);
      return state.findings.filter((finding) => ids.has(finding.findingId));
    }
  }
  if (target.findingId) {
    return state.findings.filter(
      (finding) => finding.findingId === target.findingId
    );
  }
  return state.findings.filter(
    (finding) => finding.workUnitId === target.workUnitId
  );
}

function evidenceUnitForTarget(
  state: AnalysisState,
  target: CritiqueTarget
): string | undefined {
  const evaluation = state.plan?.workUnits.find(
    (unit) => unit.workUnitId === target.workUnitId
  );
  return evaluation?.dependsOn.find((dependencyId) =>
    state.plan?.workUnits.some(
      (unit) =>
        unit.workUnitId === dependencyId &&
        unit.tool === "extract_shared_evidence"
    )
  );
}

function normalize(
  raw: DeepCritiqueResult[],
  allowedIds: string[]
): DeepCritiqueResult[] {
  const allowed = new Set(allowedIds);
  const seen = new Set<string>();
  return raw.filter((result) => {
    if (!allowed.has(result.targetId) || seen.has(result.targetId)) return false;
    seen.add(result.targetId);
    return true;
  });
}

function targetId(target: CritiqueTarget): string {
  return (
    target.requirementId ??
    target.findingId ??
    `${target.workUnitId}:${target.reason}`
  );
}
