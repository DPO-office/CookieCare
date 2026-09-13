import type { AnalysisState } from "../../../../models/analysis-state.js";
import type { ComplianceCheckOutcome, CompletionClient } from "../contracts/index.js";
import { runGraphNativeInvestigation, type InvestigationRunResult } from "../investigation/index.js";
import { checksFromState, contextFromState, bundleForCheck, investigationRequirementsForChecks } from "../adapters/index.js";
import { outcomesToSnapshot } from "../adapters/index.js";
import { lockOutcome } from "../assessment/index.js";
import { createVerificationClient } from "../verification/index.js";
import { createComplianceLogSink } from "../diagnostics/index.js";
import type { ComplianceEventSink } from "../diagnostics/index.js";
import { createRun } from "./create-run.js";
import { executeChecks } from "./execute-checks.js";
import { verificationMode, runLegacyVerification, type VerificationMode } from "./rollout.js";
import { dumpCompliancePreReport } from "../../../../temp/compliance-pre-report/dump-compliance-pre-report.js";
import { createVerificationDiagnosticRun, type VerificationDiagnosticRun } from "../../../../temp/compliance-verification/index.js";
export interface CompliancePipelineDependencies {
  complete?: CompletionClient;
  investigate?: typeof runGraphNativeInvestigation;
  emit?: ComplianceEventSink;
  mode?: VerificationMode;
  now?: () => number;
  legacy?: typeof runLegacyVerification;
  verificationDiagnostics?: VerificationDiagnosticRun;
}
export async function executeCompliancePipeline(state: AnalysisState, deps: CompliancePipelineDependencies = {}): Promise<AnalysisState> {
  const checks = checksFromState(state), context = contextFromState(state), mode = deps.mode ?? verificationMode(), now = deps.now ?? Date.now;
  const sink = deps.emit ?? createComplianceLogSink(), analysisId = state.request.sessionId ?? "unknown";
  const diagnosticRun = deps.verificationDiagnostics ?? createVerificationDiagnosticRun({
    sessionId: analysisId, mode, checks: checks.map(check => ({
      checkId: check.checkId, ruleId: check.ruleId, skillId: check.skillId, ruleHash: check.rule?.hash,
      ruleVersion: check.rule?.version, documents: check.documents, facetIds: check.facetIds,
    })),
  });
  const emit: ComplianceEventSink = event => {
    let diagnosticFile: string | undefined;
    try { diagnosticFile = diagnosticRun.record(structuredClone(event)); } catch { /* Observers cannot change decisions. */ }
    try {
      // Full contract text and model outputs belong in the opt-in diagnostic files.
      const detailed = /^compliance\.(shadow\.)?(verification\.(request|attempt\.|result|review\.|check\.|additional_investigation\.|cross_review\.)|lock\.audit)/.test(event.event);
      sink(structuredClone(detailed ? {
        event: event.event, analysisId: event.analysisId, timestamp: event.timestamp,
        checkId: event.checkId, requirementId: event.requirementId, phase: event.phase,
        round: event.round, attempt: event.attempt, diagnosticFile,
      } : event));
    }
    catch { /* A failed sink cannot suppress checks. */ }
  };
  const investigate = deps.investigate ?? runGraphNativeInvestigation;
  const log = (event: string, payload: Record<string, unknown>) => emit({ event, analysisId, timestamp: new Date(now()).toISOString(), ...payload });
  log("compliance.checks.expected", { mode, checkIds: checks.map(c => c.checkId), requirementIds: checks.map(c => c.ruleId) });
  const run = createRun({
    analysisId, checks, context, now, complete: deps.complete ?? createVerificationClient(tokens => {
      if (state.agent) state.agent.tokensUsed += tokens;
    }),
    emit: event => emit(mode === "shadow" ? { ...event, event: event.event.replace("compliance.", "compliance.shadow.") } : event),
  });
  const verificationExecution = {
    engine: mode === "legacy" ? "previous" : mode === "shadow" ? "previous_and_archived_multi_pass" : "archived_multi_pass",
    archivedMultiPassEnabled: mode !== "legacy",
    verificationEvidenceRetryLimit: mode === "legacy" ? 0 : 2,
    independentReviewEnabled: mode !== "legacy",
    concurrency: run.budget.concurrency,
    stageBudgetMs: run.budget.stageMs,
    timeBudgetDisabled: run.budget.stageMs === null,
  };
  log("compliance.verification.execution_policy", verificationExecution);
  let investigation: InvestigationRunResult;
  const requirements=investigationRequirementsForChecks(state,checks);
  try {
    investigation = await investigate(state, { userId: state.actorUserId, requirements, logger: log, reviewConcurrency: run.budget.concurrency,
      scheduleCall: (work, signal) => run.scheduleCall(work, signal, { stage: "investigation" }) });
  }
  catch (error) {
    log("compliance.investigation.failed", { error: String(error) });
    investigation = { bundlesByRequirement: new Map(), resolutionIssues: [], timings: { indexMs: 0, retrievalMs: 0, reviewMs: 0, expansionMs: 0, totalMs: 0 } };
  }
  const investigated = [...investigation.bundlesByRequirement.values()];
  const matches = new Map(checks.map(check=>[check.checkId,investigated.filter(b=>
    b.documentId===check.reviewScopeId && b.requirementId===check.ruleId && b.packageId===`rule:${check.skillId}`)]));
  const unexpected = investigated.filter(b=>!checks.some(c=>(matches.get(c.checkId)??[]).includes(b)));
  const investigationReconciliation = {
    expectedCheckIds:checks.map(c=>c.checkId),
    actualCheckIds:checks.filter(c=>matches.get(c.checkId)?.length).map(c=>c.checkId),
    missingCheckIds:checks.filter(c=>!matches.get(c.checkId)?.length).map(c=>c.checkId),
    duplicateCheckIds:checks.filter(c=>(matches.get(c.checkId)?.length??0)>1).map(c=>c.checkId),
    unexpectedBundleIds:unexpected.map(b=>b.bundleId),
  };
  log("compliance.investigation.reconciliation", investigationReconciliation);
  const bundle = (check: typeof checks[number]) => {
    const sources=matches.get(check.checkId)??[],source=sources[0];
    return bundleForCheck(state,check,source && sources.length>1 ? {...source,executionStatus:"incomplete",
      coverageReasons:[...(source.coverageReasons??[]),"duplicate_investigation_bundle"]} : source);
  };
  let legacy: AnalysisState["complianceReportSnapshot"];
  if (mode !== "canonical") {
    try {
      legacy = await (deps.legacy ?? runLegacyVerification)(state, investigation);
    }
    catch (error) {
      log("compliance.legacy.failed", { error: String(error) });
    }
  }
  let outcomes: ComplianceCheckOutcome[] = [];
  if (mode !== "legacy") {
    try {
    await executeChecks(run, {
      bundle, investigate: async (check, request, signal) => {
        signal.throwIfAborted();
        const selected = requirements.filter(r => r.requirementId === check.ruleId && r.documentId === check.reviewScopeId && r.packageId === `rule:${check.skillId}`);
        if (!selected.length)
          return bundle(check);
        const result = await investigate(state, { userId: state.actorUserId, requirements: selected, additionalQueries: request.queries,
          targetNodeIds: request.targetNodeIds, signal, reviewConcurrency: 1, logger: log,
          scheduleCall: (work, callSignal) => run.scheduleCall(work, callSignal, { stage: "additional_investigation", checkId: check.checkId, requirementId: check.ruleId }) });
        signal.throwIfAborted();
        return bundleForCheck(state, check, [...result.bundlesByRequirement.values()].find(b => b.requirementId === check.ruleId && b.documentId === check.reviewScopeId && b.packageId === `rule:${check.skillId}`));
      }
    });
    } catch (error) {
      log("compliance.verification.stage_failed", { error: String(error) });
      for (const check of checks) if (!run.ledger.outcomes.has(check.checkId)) {
        run.ledger.finish(lockOutcome({ check, context, bundle: bundleForCheck(state, check) },
          { kind: "incomplete", reason: "verification_stage_failed", errors: [String(error)], attempts: 0 }));
      }
    }
    outcomes = [...run.ledger.outcomes.values()];
  }
  if (mode === "canonical")
    state.complianceReportSnapshot = outcomesToSnapshot(state, outcomes);
  else {
    const fallback = checks.map(check => lockOutcome({ check, bundle: bundle(check), context }, { kind: "incomplete", reason: "legacy_check_incomplete", errors: [], attempts: 0 }));
    const snapshot = outcomesToSnapshot(state, fallback);
    // Legacy judgments use their own baseline; never attach the proposed matrix to them.
    snapshot.outcomes = undefined;
    snapshot.rows = snapshot.rows.map(row => {
      const check = checks.find(c => c.checkId === row.checkId)!;
      if (!check.rule || check.baselineError) return row;
      const match = legacy?.rows.find(r => (r.requirementId === check.ruleId || state.activeSkills?.some(s => s.skillId === check.skillId && s.regimeRules.some(rule => rule.ruleId === check.ruleId && rule.legacyRequirementId === r.requirementId))) && (r.reviewedDocumentIds?.includes(check.reviewScopeId) || checks.filter(c => c.ruleId === check.ruleId).length === 1));
      return match ? { ...match, checkId: row.checkId, outcomeId: row.outcomeId, outcomeKind: "assessment" as const, requirementId: check.ruleId } : row;
    });
    snapshot.limitations = [...(legacy?.limitations ?? []), ...snapshot.rows.filter(r => r.outcomeKind === "incomplete").map((r, i) => ({ id: "missing" + i, requirementIds: [r.requirementId], message: r.whatIsMissingOrUnclear }))];
    state.complianceReportSnapshot = snapshot;
    if (mode === "shadow")
      log("compliance.verification.comparison", { checks: checks.map(c => ({
        checkId: c.checkId, ruleId: c.ruleId,
        legacy: snapshot.rows.find(r => r.checkId === c.checkId)?.status,
        proposed: outcomes.find(o => o.check.checkId === c.checkId)?.status,
        ruleHash: c.rule?.hash, ruleVersion: c.rule?.version,
        legacyRuleVersion: snapshot.rows.find(r=>r.checkId===c.checkId)?.ruleVersion,
        baselineChanged: snapshot.rows.find(r=>r.checkId===c.checkId)?.ruleVersion !== c.rule?.version,
        bundleHash: bundle(c).hash, proposedBundleHash: outcomes.find(o=>o.check.checkId===c.checkId)?.bundle.hash,
        evidenceChanged: bundle(c).hash !== outcomes.find(o=>o.check.checkId===c.checkId)?.bundle.hash,
      })) });
  }
  state.compliancePresentationPlan = undefined;
  if(unexpected.length)state.complianceReportSnapshot!.limitations.push({
    id:"unexpected-evidence",requirementIds:[],message:"Investigation returned evidence outside the selected check scope; it was excluded from assessment.",
  });
  state.complianceReportValidation = undefined;
  for (const row of state.complianceReportSnapshot!.rows)
    log("compliance.outcome.rendered", { checkId: row.checkId, requirementId: row.requirementId, outcomeId: row.outcomeId, status: row.status, kind: row.outcomeKind, lockedAssessmentId: row.lockedAssessmentId, evidenceCount: row.evidence.length });
  log("compliance.outcome.reconciliation", { expectedCheckIds: checks.map(c => c.checkId), actualCheckIds: state.complianceReportSnapshot!.rows.map(r => r.checkId) });
  let verificationDiagnostics: ReturnType<VerificationDiagnosticRun["health"]>;
  try {
    diagnosticRun.finish();
    verificationDiagnostics = diagnosticRun.health();
  } catch (error) {
    verificationDiagnostics = { enabled: true, runDirectory: null, writeErrors: [String(error)] };
  }
  log("compliance.verification.diagnostic_files", verificationDiagnostics);

  const comparison = mode === "shadow"
    ? checks.map(c => ({
        checkId: c.checkId,
        ruleId: c.ruleId,
        reviewScopeId: c.reviewScopeId,
        legacyStatus: state.complianceReportSnapshot?.rows.find(r => r.checkId === c.checkId)?.status ?? null,
        proposedStatus: outcomes.find(o => o.check.checkId === c.checkId)?.status ?? null,
        proposedKind: outcomes.find(o => o.check.checkId === c.checkId)?.kind ?? null,
        ruleHash: c.rule?.hash ?? null,
        ruleVersion: c.rule?.version ?? null,
        baselineError: c.baselineError ?? null,
        bundleHash: bundle(c).hash,
        proposedBundleHash: outcomes.find(o => o.check.checkId === c.checkId)?.bundle.hash ?? null,
      }))
    : undefined;

  dumpCompliancePreReport({
    sessionId: analysisId,
    stage: "pre_report",
    payload: {
      mode,
      verificationExecution,
      verificationDiagnostics,
      instruction: state.request.instruction,
      /** What the refactored pipeline computed this run. */
      whatSystemDid: {
        checks: checks.map(c => ({
          checkId: c.checkId,
          skillId: c.skillId,
          ruleId: c.ruleId,
          reviewScopeId: c.reviewScopeId,
          facetIds: c.facetIds,
          selectionReasons: c.selectionReasons,
          documents: c.documents,
          baselineError: c.baselineError ?? null,
          rule: c.rule
            ? {
                ruleId: c.rule.ruleId,
                title: c.rule.title,
                citation: c.rule.citation,
                version: c.rule.version,
                hash: c.rule.hash,
                aggregation: c.rule.aggregation,
                elements: c.rule.elements,
              }
            : null,
        })),
        investigation: {
          reconciliation: investigationReconciliation,
          timings: investigation.timings,
          resolutionIssues: investigation.resolutionIssues,
          bundles: investigated.map(b => ({
            bundleId: b.bundleId,
            requirementId: b.requirementId,
            packageId: b.packageId,
            documentId: b.documentId,
            candidateCount: b.candidateCount,
            estimatedTokens: Math.ceil(
              b.passages.reduce((sum, p) => sum + p.rawText.length, 0) / 4
            ),
            executionStatus: b.executionStatus ?? null,
            investigationComplete: b.investigationComplete,
            incompleteReasons: b.incompleteReasons,
            coveredElementIds: b.coveredElementIds,
            unresolvedElementIds: b.unresolvedElementIds,
            retrievalChannelCounts: b.retrievalChannelCounts,
            passages: b.passages.map(p => ({
              nodeId: p.nodeId,
              unitId: p.unitId,
              role: p.role,
              confidence: p.confidence,
              structuralPath: p.structuralPath,
              sourceRange: p.sourceRange,
              contributesToElementIds: p.contributesToElementIds,
              rawText: p.rawText,
            })),
            exclusions: b.exclusions,
            dependencies: b.dependencies,
          })),
        },
        proposedOutcomes: outcomes,
        comparison,
        unresolvedPlanFacets: state.plan?.complianceRequirementResolution?.unresolved ?? [],
      },
      /** Exact snapshot handed to the reporting stage. */
      handedToReporting: state.complianceReportSnapshot,
    },
  });

  return state;
}
