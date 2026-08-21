import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { CritiqueResult, FixItem } from "../../models/critique-report.js";
import type { Finding } from "../../models/finding.js";
import type {
  AttemptRecord,
  WorkUnitOutcome,
} from "../../models/work-unit-outcome.js";
import { logAuthoringBacklog } from "./log-authoring-backlog.js";
import {
  buildNotCoveredFinding,
  classifyFailureReason,
  fireTierCOnce,
  formatFeedback,
  hashFindingsForUnit,
  targetIdForUnit,
} from "./work-unit-resolution.js";
import { pacLog } from "../../utils/pac-log.js";

/** One targeted retry after the first attempt (2 total ACT runs max per unit). */
export const MAX_TIER2_ATTEMPTS = 1;

export interface ResolveWorkUnitsResult {
  outcomes: WorkUnitOutcome[];
  fixPlan: FixItem[];
  allUnitsTerminal: boolean;
  skeletonMismatch: boolean;
  replanAttemptedThisRun: boolean;
  findings: Finding[];
  workUnitOutcomes: Record<string, WorkUnitOutcome>;
}

function unitHasOpenFailure(
  unit: AnalysisWorkUnit,
  results: CritiqueResult[],
  rawFixPlan: FixItem[]
): CritiqueResult[] {
  const byId = results.filter(
    (r) =>
      r.workUnitId === unit.workUnitId &&
      (r.status === "fail" || r.status === "missing")
  );
  if (byId.length > 0) return byId;

  if (rawFixPlan.some((f) => f.workUnitId === unit.workUnitId)) {
    return [
      {
        itemId: `fixplan:${unit.workUnitId}`,
        status: "missing",
        evidenceVerified: false,
        workUnitId: unit.workUnitId,
        detail: "Work unit listed in critique fix plan",
      },
    ];
  }
  return [];
}

function mergeOutcome(
  unit: AnalysisWorkUnit,
  existing: WorkUnitOutcome | undefined,
  patch: Partial<WorkUnitOutcome>
): WorkUnitOutcome {
  return {
    workUnitId: unit.workUnitId,
    attempts: existing?.attempts ?? [],
    ...existing,
    ...patch,
  };
}

export async function resolveWorkUnits(
  state: AnalysisState,
  results: CritiqueResult[],
  rawFixPlan: FixItem[]
): Promise<{ state: AnalysisState; resolved: ResolveWorkUnitsResult }> {
  const skills = state.activeSkills ?? [];
  const workUnits = state.plan?.workUnits ?? [];
  const priorOutcomes = { ...(state.workUnitOutcomes ?? {}) };
  let findings = [...state.findings];
  let nextState = state;
  let replanAttemptedThisRun = state.replanAttemptedThisRun ?? false;
  let skeletonMismatch = false;
  const fixPlan: FixItem[] = [];
  const outcomes: WorkUnitOutcome[] = [];

  for (const unit of workUnits) {
    const existing = priorOutcomes[unit.workUnitId];
    if (existing?.terminalStatus) {
      outcomes.push(existing);
      continue;
    }

    const unitFails = unitHasOpenFailure(unit, results, rawFixPlan);
    if (unitFails.length === 0) {
      const verified = mergeOutcome(unit, existing, {
        terminalStatus: "verified",
        attempts: existing?.attempts ?? [],
      });
      priorOutcomes[unit.workUnitId] = verified;
      outcomes.push(verified);
      continue;
    }

    const reason = classifyFailureReason({
      unit,
      unitResults: unitFails,
      skills,
    });
    const outputHash = hashFindingsForUnit(findings, unit.workUnitId);
    const attemptNumber = (existing?.attempts.length ?? 0) + 1;
    const rejectionReason =
      unitFails.find((r) => r.detail)?.detail ?? reason.kind;
    const attemptRecord: AttemptRecord = {
      attemptNumber,
      outcome: "rejected",
      rejectionReason,
      outputHash,
      findingId: unitFails.find((r) => r.findingId)?.findingId,
    };
    const attempts = [...(existing?.attempts ?? []), attemptRecord];
    const unitFixes = rawFixPlan.filter((f) => f.workUnitId === unit.workUnitId);
    const baseFix: FixItem = unitFixes[0] ?? {
      workUnitId: unit.workUnitId,
      instruction: `Re-run ${unit.tool}`,
      sourceItemId: unit.workUnitId,
    };

    switch (reason.kind) {
      case "not_authored": {
        const tier = await fireTierCOnce(nextState, unit);
        nextState = tier.state;
        const targetId = targetIdForUnit(unit) ?? unit.workUnitId;
        const notCovered = buildNotCoveredFinding(unit, targetId, reason.details);
        findings = [
          ...findings.filter(
            (f) =>
              !(
                f.workUnitId === unit.workUnitId &&
                (f.status === "not_covered" || f.findingId.startsWith("f_not_covered_"))
              )
          ),
          notCovered,
        ];
        await logAuthoringBacklog({
          orgId: nextState.organizationId,
          sessionId: nextState.request.sessionId,
          target: targetId,
          reason: "not_authored",
          workUnitId: unit.workUnitId,
        });
        const terminal = mergeOutcome(unit, existing, {
          terminalStatus: "not_covered",
          attempts,
          failureReason: reason,
        });
        priorOutcomes[unit.workUnitId] = terminal;
        outcomes.push(terminal);
        pacLog("resolve not_authored", {
          unit: unit.workUnitId,
          target: targetId,
        });
        break;
      }

      case "tool_execution_error":
      case "verification_rejected": {
        const maxAttempts = 1 + MAX_TIER2_ATTEMPTS;
        const lastHash = existing?.attempts.at(-1)?.outputHash;
        const sameOutput =
          lastHash !== undefined &&
          lastHash === outputHash &&
          attemptNumber >= 2;

        if (sameOutput || attemptNumber >= maxAttempts) {
          const terminal = mergeOutcome(unit, existing, {
            terminalStatus: "retries_exhausted",
            attempts,
            failureReason: reason,
          });
          priorOutcomes[unit.workUnitId] = terminal;
          outcomes.push(terminal);
          pacLog("resolve retries_exhausted", {
            unit: unit.workUnitId,
            sameOutput,
            attemptNumber,
          });
          break;
        }

        fixPlan.push({
          ...baseFix,
          previousAttemptFeedback: formatFeedback(reason, attemptRecord),
          attemptNumber,
        });
        const open = mergeOutcome(unit, existing, {
          attempts,
          failureReason: reason,
        });
        priorOutcomes[unit.workUnitId] = open;
        outcomes.push(open);
        break;
      }

      case "intent_mismatch": {
        if (replanAttemptedThisRun) {
          const terminal = mergeOutcome(unit, existing, {
            terminalStatus: "retries_exhausted",
            attempts,
            failureReason: reason,
          });
          priorOutcomes[unit.workUnitId] = terminal;
          outcomes.push(terminal);
        } else {
          replanAttemptedThisRun = true;
          skeletonMismatch = true;
          const replan = mergeOutcome(unit, existing, {
            terminalStatus: "needs_replan",
            attempts,
            failureReason: reason,
          });
          priorOutcomes[unit.workUnitId] = replan;
          outcomes.push(replan);
        }
        break;
      }

      default:
        break;
    }
  }

  const allUnitsTerminal = outcomes.every((o) => Boolean(o.terminalStatus));

  return {
    state: {
      ...nextState,
      findings,
      workUnitOutcomes: priorOutcomes,
      replanAttemptedThisRun,
    },
    resolved: {
      outcomes,
      fixPlan,
      allUnitsTerminal,
      skeletonMismatch,
      replanAttemptedThisRun,
      findings,
      workUnitOutcomes: priorOutcomes,
    },
  };
}

/** Mark any non-terminal units as retries_exhausted when budget/turn ceiling hits. */
export function markBudgetExhaustedOutcomes(
  state: AnalysisState
): AnalysisState {
  const workUnits = state.plan?.workUnits ?? [];
  const outcomes = { ...(state.workUnitOutcomes ?? {}) };
  let changed = false;

  for (const unit of workUnits) {
    const existing = outcomes[unit.workUnitId];
    if (existing?.terminalStatus) continue;
    outcomes[unit.workUnitId] = {
      workUnitId: unit.workUnitId,
      attempts: existing?.attempts ?? [],
      terminalStatus: "retries_exhausted",
      failureReason: {
        kind: "tool_execution_error",
        error: "budget_exceeded",
      },
    };
    changed = true;
  }

  if (!changed) return state;
  return { ...state, workUnitOutcomes: outcomes };
}
