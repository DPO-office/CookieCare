import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  CritiqueReport,
  CritiqueResult,
  FixItem,
} from "../../models/critique-report.js";
import type { Finding } from "../../models/finding.js";
import { isKnownRiskCategory } from "../../skills/registry.js";
import { resolveRule } from "../act/check-against-rule.js";
import { getSpanFromState } from "../act/execute-act-plan.js";
import { pacLog } from "../../utils/pac-log.js";
import { getEntailmentCandidates } from "./entailment-candidates.js";
import { resolveWorkUnits } from "./resolve-work-unit.js";

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * CRITIQUE — stricter than Drafting:
 * 1) locator existence 2) entailment 3) taxonomy 4) completeness 5) two-branch fix
 */
export async function runCritique(state: AnalysisState): Promise<AnalysisState> {
  const results: CritiqueResult[] = [];
  const fixPlan: FixItem[] = [];
  const findings = state.findings;
  const workUnits = state.plan?.workUnits ?? [];
  pacLog("CRITIQUE start", {
    findings: findings.length,
    units: workUnits.length,
    iter: (state.critique?.iteration ?? 0) + 1,
  });

  // 1+2 Existence + substring gate (quotedText must appear in resolved span or doc)
  for (const f of findings) {
    if (f.unverified || f.orgPlaybook) {
      results.push({
        itemId: `status:${f.findingId}`,
        status: "pass",
        evidenceVerified: true,
        findingId: f.findingId,
        workUnitId: f.workUnitId,
        detail: f.unverified
          ? "Tier C unverified finding is not quote-gated"
          : "Org playbook finding is attributed config, not quote-gated",
      });
      continue;
    }
    if (
      f.status === "absent_expected" ||
      f.status === "insufficient_evidence" ||
      f.status === "not_covered"
    ) {
      results.push({
        itemId: `status:${f.findingId}`,
        status: "pass",
        evidenceVerified: true,
        findingId: f.findingId,
        workUnitId: f.workUnitId,
        detail: `Explicit ${f.status} is a valid first-class state`,
      });
      continue;
    }

    if (
      !f.evidence.length &&
      (f.kind === "risk" || f.kind === "compliance") &&
      f.status === "present"
    ) {
      results.push({
        itemId: `evidence-missing:${f.findingId}`,
        status: "fail",
        evidenceVerified: false,
        findingId: f.findingId,
        workUnitId: f.workUnitId,
        detail: "Present risk/compliance finding lacks EvidenceSpan",
      });
      if (f.workUnitId) {
        fixPlan.push({
          workUnitId: f.workUnitId,
          instruction: `Re-extract evidence for finding ${f.findingId}`,
          sourceItemId: f.findingId,
        });
      }
      continue;
    }

    for (const ev of f.evidence) {
      const resolved = getSpanFromState(state, ev.locator);
      const exists = resolved !== null;
      const quoteInSpan =
        exists &&
        (normalize(resolved!).includes(normalize(ev.quotedText)) ||
          normalize(ev.quotedText).includes(normalize(resolved!.slice(0, 80))));
      const doc = state.workspace.documents.find((d) => d.docId === ev.locator.docId);
      const quoteInDoc =
        doc && normalize(doc.fullText).includes(normalize(ev.quotedText));

      const verified = Boolean(exists && (quoteInSpan || quoteInDoc));
      results.push({
        itemId: `locator:${f.findingId}:${ev.locator.structuralPath}`,
        status: verified ? "pass" : "fail",
        evidenceQuote: ev.quotedText,
        evidenceVerified: verified,
        findingId: f.findingId,
        workUnitId: f.workUnitId,
        detail: !exists
          ? "Locator does not resolve"
          : !verified
            ? "quotedText not found in document"
            : undefined,
      });

      if (!verified && f.workUnitId) {
        fixPlan.push({
          workUnitId: f.workUnitId,
          instruction: `Fix evidence for ${f.findingId}: locator/quote mismatch`,
          sourceItemId: f.findingId,
        });
      }
    }
  }

  // 3 Taxonomy conformance (active skill scope)
  const allowedCategories = new Set(
    state.mergedRiskCategories ??
      state.activeSkills?.flatMap((s) => s.riskCategories.map((r) => r.category)) ??
      []
  );

  for (const f of findings) {
    if (f.unverified) {
      results.push({
        itemId: `taxonomy:${f.findingId}`,
        status: "pass",
        evidenceVerified: true,
        findingId: f.findingId,
        workUnitId: f.workUnitId,
        detail: "Tier C unverified finding is outside authored taxonomy",
      });
      continue;
    }
    if (f.kind === "risk" || f.kind === "compliance") {
      const ok =
        f.orgPlaybook ||
        (allowedCategories.size === 0
          ? isKnownRiskCategory(f.category)
          : allowedCategories.has(f.category) || isKnownRiskCategory(f.category));
      results.push({
        itemId: `taxonomy:${f.findingId}`,
        status: ok ? "pass" : "fail",
        evidenceVerified: ok,
        findingId: f.findingId,
        workUnitId: f.workUnitId,
        detail: ok ? undefined : `Unknown category ${f.category} for active skill(s)`,
      });
      if (!ok && f.workUnitId) {
        fixPlan.push({
          workUnitId: f.workUnitId,
          instruction: `Reclassify finding ${f.findingId} into skill risk taxonomy`,
          sourceItemId: f.findingId,
        });
      }
    }
  }

  // 3b Compliance rule citation — ruleId must resolve to configured rule text
  for (const f of findings.filter((x) => x.kind === "compliance" && x.ruleId && !x.unverified)) {
    const resolved = resolveRule(state.activeSkillIds ?? [], f.ruleId!);
    const ok = Boolean(resolved?.rule.ruleText);
    results.push({
      itemId: `rule-cite:${f.findingId}`,
      status: ok ? "pass" : "fail",
      evidenceVerified: ok,
      findingId: f.findingId,
      workUnitId: f.workUnitId,
      detail: ok ? undefined : `ruleId ${f.ruleId} not found in skill configuration`,
    });
    if (!ok && f.workUnitId) {
      fixPlan.push({
        workUnitId: f.workUnitId,
        instruction: `Re-run compliance check for unknown rule ${f.ruleId}`,
        sourceItemId: f.findingId,
      });
    }
  }

  // 3c Expected-clause completeness — skipped when instruction focus is set
  // (instruction-coverage gate below is the user's question, not the full skill tour).
  const expectedClauses = state.plan?.focus ? [] : (state.mergedExpectedClauses ?? []);
  const primaryDocId = state.request.documentIds[0];
  const doc = state.workspace.documents.find((d) => d.docId === primaryDocId);
  const extractedTypes = new Set((doc?.clauses ?? []).map((c) => c.clauseType));

  for (const expected of expectedClauses) {
    if (extractedTypes.has(expected.clauseType)) {
      results.push({
        itemId: `expected-present:${expected.clauseType}`,
        status: "pass",
        evidenceVerified: true,
        detail: `Clause type ${expected.clauseType} extracted`,
      });
      continue;
    }

    const covered = findings.some(
      (f) =>
        f.category === expected.findingCategory &&
        (f.status === "absent_expected" || f.status === "insufficient_evidence") &&
        f.claim.includes(expected.clauseType)
    );
    results.push({
      itemId: `expected:${expected.clauseType}`,
      status: covered ? "pass" : "missing",
      evidenceVerified: covered,
      detail: covered
        ? undefined
        : `No finding for missing expected clause ${expected.clauseType}`,
    });
    if (!covered) {
      fixPlan.push({
        workUnitId: "wu-check-expected",
        instruction: `Emit absent/insufficient finding for expected clause ${expected.clauseType}`,
        sourceItemId: `expected:${expected.clauseType}`,
      });
    }
  }

  // 3d Regime rule completeness — only rules that were scheduled on the plan
  const scheduledRuleIds = new Set(
    workUnits
      .filter((wu) => wu.tool === "check_against_rule")
      .map((wu) => String(wu.input.ruleId ?? ""))
      .filter(Boolean)
  );
  const rulesToCover = (state.plan?.focus?.ruleIds?.length
    ? (state.mergedRegimeRules ?? []).filter((r) => state.plan!.focus!.ruleIds.includes(r.ruleId))
    : state.mergedRegimeRules ?? []
  ).filter((r) => scheduledRuleIds.size === 0 || scheduledRuleIds.has(r.ruleId));

  for (const rule of rulesToCover) {
    const covered = findings.some((f) => f.kind === "compliance" && f.ruleId === rule.ruleId);
    results.push({
      itemId: `regime:${rule.ruleId}`,
      status: covered ? "pass" : "missing",
      evidenceVerified: covered,
      detail: covered ? undefined : `No compliance finding for rule ${rule.ruleId}`,
    });
    if (!covered) {
      fixPlan.push({
        workUnitId: `wu-rule-${rule.ruleId.replace(/\./g, "-")}`,
        instruction: `Evaluate rule ${rule.ruleId}`,
        sourceItemId: `regime:${rule.ruleId}`,
      });
    }
  }

  // 3e Instruction coverage — every focused rule / matrix row has a Finding
  const focus = state.plan?.focus;
  if (focus) {
    for (const ruleId of focus.ruleIds) {
      const covered = findings.some((f) => f.ruleId === ruleId);
      results.push({
        itemId: `focus-rule:${ruleId}`,
        status: covered ? "pass" : "missing",
        evidenceVerified: covered,
        detail: covered ? undefined : `Instruction focus rule ${ruleId} has no finding`,
      });
      if (!covered) {
        fixPlan.push({
          workUnitId: `wu-rule-${ruleId.replace(/\./g, "-")}`,
          instruction: `Evaluate in-focus rule ${ruleId}`,
          sourceItemId: `focus-rule:${ruleId}`,
        });
      }
    }
    for (const rowId of focus.matrixRowIds) {
      const covered = findings.some((f) => f.matrixRowId === rowId);
      results.push({
        itemId: `focus-matrix:${rowId}`,
        status: covered ? "pass" : "missing",
        evidenceVerified: covered,
        detail: covered ? undefined : `Instruction focus matrix row ${rowId} has no finding`,
      });
      if (!covered) {
        fixPlan.push({
          workUnitId: `wu-matrix-${rowId.replace(/\./g, "-")}`,
          instruction: `Evaluate matrix row ${rowId}`,
          sourceItemId: `focus-matrix:${rowId}`,
        });
      }
    }
  }

  // 4 Completeness — every scheduled unit reached a terminal status (Finding count is not the proxy)
  for (const wu of workUnits) {
    const terminal = wu.status === "done" || wu.status === "failed" || wu.status === "skipped";
    results.push({
      itemId: `complete:${wu.workUnitId}`,
      status: terminal ? "pass" : "missing",
      evidenceVerified: terminal,
      workUnitId: wu.workUnitId,
      detail: terminal
        ? wu.completionNote
        : "Work unit did not reach a terminal status",
    });
    if (!terminal) {
      fixPlan.push({
        workUnitId: wu.workUnitId,
        instruction: `Re-run ${wu.tool}; unit did not complete`,
        sourceItemId: `complete:${wu.workUnitId}`,
      });
    }
  }

  // 5 Entailment check (LLM) for present risk/compliance claims with evidence
  const entailCandidates = getEntailmentCandidates(findings);
  if (entailCandidates.length > 0) {
    pacLog("CRITIQUE entailment ▶ LLM", { candidates: entailCandidates.length });
    const entailResults = await runEntailment(state, entailCandidates);
    for (const r of entailResults) {
      results.push(r.result);
      if (r.fix) fixPlan.push(r.fix);
    }
  }

  // skeletonMismatch = intent/plan structure wrong (majority of work units missing findings)
  const completenessFails = results.filter(
    (r) => r.itemId.startsWith("complete:") && r.status === "missing"
  ).length;
  const structuralSkeletonMismatch =
    workUnits.length > 0 &&
    completenessFails > Math.max(1, Math.floor(workUnits.length / 2));

  const uniqueFixes = dedupeFixes(fixPlan);

  const { state: resolvedState, resolved } = await resolveWorkUnits(
    state,
    results,
    uniqueFixes
  );

  const skeletonMismatch =
    structuralSkeletonMismatch || resolved.skeletonMismatch;

  const materialDsrInsufficient = resolvedState.findings.some(
    (f) =>
      f.status === "insufficient_evidence" &&
      f.visibility !== "internal" &&
      (f.ruleId === "gdpr.art28.3.e" ||
        f.matrixRowId === "gdpr.right.access" ||
        f.category === "dsr_generic_no_named_rights")
  );

  const report: CritiqueReport = {
    isGreen: resolved.allUnitsTerminal && !skeletonMismatch,
    iteration: (state.critique?.iteration ?? 0) + 1,
    results,
    fixPlan:
      resolved.allUnitsTerminal || skeletonMismatch
        ? []
        : dedupeFixes(resolved.fixPlan),
    skeletonMismatch,
    criticalFactSurfaced: materialDsrInsufficient,
    outcomes: resolved.outcomes,
    allUnitsTerminal: resolved.allUnitsTerminal,
  };

  return {
    ...resolvedState,
    critique: report,
  };
}

async function runEntailment(
  state: AnalysisState,
  findings: Finding[]
): Promise<Array<{ result: CritiqueResult; fix?: FixItem }>> {
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        findingId: { type: "string" },
        entails: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["findingId", "entails"],
    },
  };

  try {
    const raw = await executeJsonCompletion<
      Array<{ findingId: string; entails: boolean; reason?: string }>
    >(
      [
        "For each finding, does the quoted evidence actually support (entail) the claim?",
        "Return entails=false if the quote is unrelated, contradictory, or insufficient.",
        JSON.stringify(
          findings.map((f) => ({
            findingId: f.findingId,
            claim: f.claim,
            quotedEvidence: f.evidence.map((ev) => ({
              sourceRole: ev.sourceRole,
              quotedText: ev.quotedText,
            })),
          }))
        ),
      ].join("\n\n"),
      "You verify entailment only. Do not invent new claims.",
      schema,
      LLMTask.CRITIQUE_CHECKLIST,
      LLMProvider.GEMINI,
      tracker
    );

    if (state.agent && tracker) {
      state.agent.tokensUsed = tracker.tokensUsed;
    }

    return raw.map((r) => {
      const f = findings.find((x) => x.findingId === r.findingId);
      const result: CritiqueResult = {
        itemId: `entail:${r.findingId}`,
        status: r.entails ? "pass" : "fail",
        evidenceVerified: r.entails,
        findingId: r.findingId,
        workUnitId: f?.workUnitId,
        detail: r.reason,
      };
      const fix =
        !r.entails && f?.workUnitId
          ? {
              workUnitId: f.workUnitId,
              instruction: `Evidence does not entail claim for ${r.findingId}; re-flag with supporting quote`,
              sourceItemId: r.findingId,
            }
          : undefined;
      return { result, fix };
    });
  } catch (err) {
    console.warn("[runCritique] entailment LLM failed; treating present claims as unverified:", err);
    return findings.map((f) => {
      const result: CritiqueResult = {
        itemId: `entail:${f.findingId}`,
        status: "fail",
        evidenceVerified: false,
        findingId: f.findingId,
        workUnitId: f.workUnitId,
        detail: "Entailment check failed (LLM unavailable); present claim not verified",
      };
      const fix = f.workUnitId
        ? {
            workUnitId: f.workUnitId,
            instruction: `Re-verify entailment for ${f.findingId}; prior entailment LLM call failed`,
            sourceItemId: f.findingId,
          }
        : undefined;
      return { result, fix };
    });
  }
}

function dedupeFixes(fixes: FixItem[]): FixItem[] {
  const seen = new Set<string>();
  const out: FixItem[] = [];
  for (const f of fixes) {
    const key = `${f.workUnitId}:${f.sourceItemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
