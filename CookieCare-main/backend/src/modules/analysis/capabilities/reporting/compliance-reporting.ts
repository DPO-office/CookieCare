import { reportOutcomeId, adaptPersistedSnapshot } from "../act/compliance/adapters/index.js";
import { executeJsonCompletion, LLMProvider, LLMTask, PROVIDER_TASK_PRESETS } from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  CompliancePresentationPlan, ComplianceReportDraft, ComplianceReportSnapshot, ComplianceReportValidation,
} from "../../models/compliance-report.js";
import { profileThinkingLevel } from "../../utils/profile-thinking.js";
import { pacLog } from "../../utils/pac-log.js";
import { complianceOutputHash } from "./compliance-release.js";
import { loadComplianceReportingGuidance } from "./guidance/index.js";
import type { ReportingGuidanceStage } from "./guidance/types.js";
import {
  defaultCompliancePresentationPlan, deterministicComplianceDraft, renderComplianceMarkdown,
  resolveCompliancePresentationMode, validateComplianceDraft, validateCompliancePresentationPlan,
} from "./compliance-presentation.js";

export type ComplianceCompletionStage = ReportingGuidanceStage;
export type ComplianceCompletion = (
  stage: ComplianceCompletionStage,
  payload: unknown,
  options?: { abortSignal?: AbortSignal },
) => Promise<unknown>;

const REPORT_RENDERER_VERSION = "compliance-markdown@2.4.0";

function positiveEnvironmentInteger(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const PLAN_SCHEMA = {
  type: "object", properties: {
    version: { type: "integer" },
    mode: { type: "string", enum: ["layered", "short", "detailed", "narrative", "table_only"] },
    paragraphLimit: { type: "integer", enum: [0, 3] },
    rationale: { type: "string" },
    sections: { type: "array", items: { type: "object", properties: {
      id: { type: "string" },
      requestItemIds: { type: "array", items: { type: "string", enum: ["request:primary"] } },
      questionIds: { type: "array", items: { type: "string" } },
      kind: { type: "string", enum: ["answer", "overview", "risks", "details", "actions", "conclusion", "limitations", "sources"] },
      heading: { type: "string" }, findingIds: { type: "array", items: { type: "string" } },
      columns: { type: "array", items: { type: "string", enum: [
        "Requirement", "Status", "Contract provision", "Assessment", "Gap or qualification", "Recommended action",
        "Parties and roles", "Transfer mechanism", "Destination", "Legal basis", "Timing",
      ] } },
      detailWords: { type: "integer" },
    }, required: ["id", "requestItemIds", "questionIds", "kind", "heading", "findingIds", "columns", "detailWords"] } },
  }, required: ["version", "mode", "paragraphLimit", "rationale", "sections"],
};
const DRAFT_SCHEMA = {
  type: "object", properties: {
    answer: { type: "string" },
    rows: { type: "array", items: { type: "object", properties: {
      findingId: { type: "string" }, assessment: { type: "string" }, explanation: { type: "string" }, recommendedAction: { type: "string" },
    }, required: ["findingId", "assessment", "explanation", "recommendedAction"] } },
  }, required: ["answer", "rows"],
};
const CHECK_SCHEMA = {
  type: "object", properties: {
    passed: { type: "boolean" }, failures: { type: "array", items: { type: "string" } },
  }, required: ["passed", "failures"],
};

function constrainedPlanSchema(ids: string[], questionIds: string[]) {
  return { ...PLAN_SCHEMA, properties: { ...PLAN_SCHEMA.properties,
    sections: { ...PLAN_SCHEMA.properties.sections, items: { ...PLAN_SCHEMA.properties.sections.items,
      properties: { ...PLAN_SCHEMA.properties.sections.items.properties,
        findingIds: { type: "array", items: { type: "string", enum: ids } },
        questionIds: { type: "array", items: questionIds.length
          ? { type: "string", enum: questionIds } : { type: "string" } },
      },
    } },
  } };
}

function constrainedDraftSchema(ids: string[]) {
  return { ...DRAFT_SCHEMA, properties: { ...DRAFT_SCHEMA.properties,
    rows: { ...DRAFT_SCHEMA.properties.rows, minItems: ids.length, maxItems: ids.length,
      items: { ...DRAFT_SCHEMA.properties.rows.items,
        properties: { ...DRAFT_SCHEMA.properties.rows.items.properties,
          findingId: { type: "string", enum: ids } } } } } };
}

/** Uses the existing verifier/reporting provider and credentials. */
export function createComplianceCompletion(state: AnalysisState): ComplianceCompletion {
  const guidance = loadComplianceReportingGuidance(state.request.instruction, state.complianceReportSnapshot);
  return async (stage, payload, options) => {
    const task = LLMTask.STRUCTURAL_JSON_LITE;
    const tracker = { tokensUsed: 0 };
    const ids = (payload as { lockedData?: { rows?: Array<{ findingId: string }> } }).lockedData?.rows?.map(r => r.findingId) ?? [];
    const questionIds = [...new Set((payload as { lockedData?: { rows?: Array<{ answers?: Array<{ questionId: string }> }> } })
      .lockedData?.rows?.flatMap(row => row.answers ?? []).map(answer => answer.questionId)
      .filter(id => id !== "user_request") ?? [])];
    const draftSchema = constrainedDraftSchema(ids);
    const composeSchema = { type: "object", properties: {
      plan: constrainedPlanSchema(ids, questionIds), draft: draftSchema,
    }, required: ["plan", "draft"] };
    try {
      return await executeJsonCompletion(
        JSON.stringify(payload), guidance.system[stage],
        stage === "compose" ? composeSchema : stage === "check" ? CHECK_SCHEMA : draftSchema,
        task, LLMProvider.GEMINI,
        { maxOutputTokens: stage === "compose" ? 16000 : stage === "check" ? 1600 : 12000,
          thinkingLevel: profileThinkingLevel(state, task), tracker, abortSignal: options?.abortSignal },
      );
    } finally { if (state.agent) state.agent.tokensUsed += tracker.tokensUsed; }
  };
}

/** Compact locked input: each distinct quotation is sent once and rows reference it. */
export function complianceReportingInput(snapshot: ComplianceReportSnapshot) {
  const sourceIds = new Map<string, string>();
  const standards = new Map((snapshot.outcomes ?? []).map(outcome => [outcome.outcomeId, outcome.check.rule?.proposition ?? ""]));
  const evidenceRegistry: Array<{ sourceId: string; citationId: string; document: string; pointer: string; quote: string }> = [];
  const source = (evidence: ComplianceReportSnapshot["rows"][number]["evidence"][number]) => {
    const key = JSON.stringify([evidence.documentId, evidence.pointer, evidence.quote, evidence.charRange]);
    let sourceId = sourceIds.get(key);
    if (!sourceId) {
      sourceId = `S${sourceIds.size + 1}`;
      sourceIds.set(key, sourceId);
      evidenceRegistry.push({ sourceId, citationId: evidence.citationId, document: evidence.documentTitle,
        pointer: evidence.pointer, quote: evidence.quote });
    }
    return { sourceId, citationId: evidence.citationId, use: evidence.use ?? "proof", contribution: evidence.contribution ?? "" };
  };
  return {
    scope: snapshot.scope,
    rows: snapshot.rows.map(row => ({
      findingId: reportOutcomeId(row), title: row.title, status: row.status,
      legalCitation: row.legalCitation, requirementStandard: row.requirementStandard ?? standards.get(reportOutcomeId(row)),
      whatTheDocumentProvides: row.whatTheDocumentProvides,
      whatIsMissingOrUnclear: row.whatIsMissingOrUnclear, conclusion: row.conclusion,
      whyItMatters: row.whyItMatters, recommendedAction: row.recommendedAction,
      answers: (row.answers ?? []).map(answer => ({
        questionId: answer.questionId, question: answer.question, answer: answer.answer,
        elementIds: answer.elementIds, evidenceIds: answer.evidenceIds,
      })),
      evidenceRefs: row.evidence.map(source),
    })),
    evidenceRegistry,
    outstandingChecks: snapshot.outstandingChecks,
    limitations: snapshot.limitations,
  };
}

async function semanticCheck(
  complete: ComplianceCompletion, plan: CompliancePresentationPlan,
  lockedData: ReturnType<typeof complianceReportingInput>, raw: unknown, signal: AbortSignal,
): Promise<string[]> {
  const result = await complete("check", { lockedData, plan, draft: raw }, { abortSignal: signal });
  if (!result || typeof result !== "object") return ["Semantic check returned an invalid result."];
  const check = result as { passed?: unknown; failures?: unknown };
  if (check.passed === true && Array.isArray(check.failures) && check.failures.length === 0) return [];
  return Array.isArray(check.failures) && check.failures.length && check.failures.every(f => typeof f === "string")
    ? check.failures as string[] : ["Semantic conformance was not confirmed."];
}

async function withinDeadline<T>(deadlineAt: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new Error("Reporting deadline reached.");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("Reporting deadline reached.")); }, remaining);
  });
  try { return await Promise.race([work(controller.signal), timeout]); }
  finally { if (timer) clearTimeout(timer); }
}

function reportCoverage(snapshot: ComplianceReportSnapshot, plan: CompliancePresentationPlan): NonNullable<ComplianceReportValidation["coverage"]> {
  const mappedSections = (itemId: string) => plan.sections
    .map((section, index) => ({ section, id: section.id ?? `S${index + 1}` }))
    .filter(({ section }) => itemId === "request:primary"
      ? section.requestItemIds?.includes(itemId) ?? (section.kind === "answer" || (plan.mode === "table_only" && section.kind === "overview"))
      : section.questionIds?.includes(itemId))
    .map(({ id }) => id);
  const questionIds = [...new Set(snapshot.rows.flatMap(row => (row.answers ?? [])
    .filter(answer => answer.questionId !== "user_request").map(answer => answer.questionId)))];
  return ["request:primary", ...questionIds].map(itemId => {
    const sectionIds = mappedSections(itemId);
    const relevantRows = itemId === "request:primary" ? snapshot.rows : snapshot.rows.filter(row =>
      (row.answers ?? []).some(answer => answer.questionId === itemId));
    const limited = snapshot.limitations.length > 0 || snapshot.outstandingChecks.length > 0 ||
      relevantRows.some(row => row.status !== "present" && row.status !== "not_applicable");
    return { itemId, sectionIds, disposition: !sectionIds.length ? "unresolved" as const
      : limited ? "answered_with_limitation" as const : "answered" as const };
  });
}

/** One bounded plan+compose call and one semantic check, with at most one repair/recheck. */
export async function renderComplianceReport(
  state: AnalysisState, complete: ComplianceCompletion = createComplianceCompletion(state),
): Promise<AnalysisState> {
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const reportingBudgetMs = positiveEnvironmentInteger("ANALYSIS_REPORTING_DEADLINE_MS", 300_000);
  const totalRunBudgetMs = positiveEnvironmentInteger("ANALYSIS_TOTAL_DEADLINE_MS", 600_000);
  const maxInputChars = positiveEnvironmentInteger("ANALYSIS_REPORTING_MAX_INPUT_CHARS", 1_000_000);
  const recordedRunStart = Date.parse(String(state.metadata?.runStartedAt ?? state.metadata?.timestamp ?? ""));
  const runDeadlineAt = Number.isFinite(recordedRunStart) && recordedRunStart <= startedMs
    ? recordedRunStart + totalRunBudgetMs : Number.POSITIVE_INFINITY;
  // Reporting gets its own dedicated window: earlier analysis stages running long must not eat into
  // it and force the deterministic fallback before the checked-composition path even gets a chance.
  const reportingDeadlineAt = startedMs + reportingBudgetMs;
  const deadlineAt = Number.isFinite(runDeadlineAt) ? Math.max(reportingDeadlineAt, runDeadlineAt) : reportingDeadlineAt;
  const deadlineMs = Math.max(0, deadlineAt - startedMs);
  pacLog("COMPLIANCE report deadline computed", {
    startedAt, reportingBudgetMs, totalRunBudgetMs, deadlineMs,
    runAlreadyElapsedMs: Number.isFinite(recordedRunStart) ? startedMs - recordedRunStart : null,
    runBudgetOverrun: runDeadlineAt < reportingDeadlineAt,
  });
  const tokenStart = state.agent?.tokensUsed ?? 0;
  let modelCalls = 0;
  state = { ...state, streamRenderOutput: false, complianceReportValidation: undefined };
  const snapshot = state.complianceReportSnapshot && adaptPersistedSnapshot(state.complianceReportSnapshot);
  if (snapshot) state.complianceReportSnapshot = snapshot;
  if (!snapshot) {
    const renderedOutput = "## Compliance report unavailable\n\nThe saved analysis does not contain the verified results and source references needed to produce this report. The earlier report remains available in history. Run a fresh compliance check to generate a report with verified clause references.";
    return { ...state, renderedOutput, complianceReportValidation: {
      passed: true, source: "snapshot_unavailable", failures: [], plannerFallback: true,
      repairAttempts: 0, outputHash: complianceOutputHash(renderedOutput),
    } };
  }

  const guidance = loadComplianceReportingGuidance(state.request.instruction, snapshot);
  const lockedData = complianceReportingInput(snapshot);
  const inputChars = JSON.stringify(lockedData).length;
  const evidenceCount = snapshot.rows.reduce((sum, row) => sum + row.evidence.length, 0);
  const uniqueEvidenceCount = lockedData.evidenceRegistry.length;
  const assessmentSnapshotId = complianceOutputHash(JSON.stringify({ version: snapshot.version,
    documents: snapshot.documents.map(document => [document.documentId, document.contentHash, document.role]),
    outcomes: snapshot.rows.map(row => [reportOutcomeId(row), row.status, row.ruleVersion, row.documentHash]),
    outstanding: snapshot.outstandingChecks.map(check => [check.requirementId, check.kind]),
  }));
  const reportId = `${state.request.sessionId}:compliance:${assessmentSnapshotId.slice(0, 12)}`;
  let outputChars = 0;
  const task = LLMTask.STRUCTURAL_JSON_LITE;
  const preset = PROVIDER_TASK_PRESETS[LLMProvider.GEMINI][task];
  const model = preset.model;
  type FallbackReason = NonNullable<NonNullable<ComplianceReportValidation["generation"]>["fallbackReason"]>;
  const generation = (fallbackReason?: FallbackReason) => ({
    schemaVersion: "1.0" as const, reportId, assessmentSnapshotId, pipeline: "compliance" as const,
    rendererVersion: REPORT_RENDERER_VERSION, provider: LLMProvider.GEMINI,
    model, task, settings: { temperature: preset.temperature, thinkingLevel: profileThinkingLevel(state, task),
      maxOutputTokens: { compose: 16000, check: 1600, repair: 12000 } },
    startedAt, completedAt: new Date().toISOString(), elapsedMs: Date.now() - startedMs,
    deadlineMs, totalRunBudgetMs, inputChars, outputChars, maxInputChars, evidenceCount, uniqueEvidenceCount, modelCalls,
    tokenDelta: Math.max(0, (state.agent?.tokensUsed ?? tokenStart) - tokenStart),
    ...(fallbackReason ? { fallbackReason } : {}),
  });
  pacLog("COMPLIANCE report context built", { rows: snapshot.rows.length, inputChars, evidenceCount,
    uniqueEvidenceCount, dynamicAnswers: lockedData.rows.reduce((sum, row) => sum + row.answers.length, 0),
    outstanding: snapshot.outstandingChecks.length, limitations: snapshot.limitations.length });
  pacLog("COMPLIANCE report guidance loaded", guidance.versions);

  await state.onProgress?.(86, "Organizing the verified compliance findings.");
  const mode = resolveCompliancePresentationMode(state);
  const fallbackPlan = defaultCompliancePresentationPlan(snapshot, mode);
  let plan = fallbackPlan;
  let plannerFallback = true;
  const failures: string[] = [];
  let rawDraft: unknown;
  let fallbackReason: FallbackReason | undefined;
  const adaptiveEnabled = process.env.COMPLIANCE_REPORTING_ADAPTIVE !== "0";
  const remainingTokens = state.agent ? Math.max(0, state.agent.tokenBudget - state.agent.tokensUsed) : Number.POSITIVE_INFINITY;
  const estimatedMinimumTokens = Math.ceil(inputChars / 4) + 18_000;

  if (!adaptiveEnabled) {
    fallbackReason = "adaptive_disabled";
    failures.push("Adaptive report composition is disabled by configuration.");
  } else if (deadlineMs < 5_000) {
    fallbackReason = "deadline";
    failures.push("Less than five seconds remained in the end-to-end run budget for checked composition.");
  } else if (inputChars > maxInputChars) {
    fallbackReason = "context_limit";
    failures.push(`Reporting context exceeds the configured ${maxInputChars}-character limit.`);
  } else if (remainingTokens < estimatedMinimumTokens) {
    fallbackReason = "token_budget";
    failures.push("Remaining token budget is below the checked-composition reserve.");
  } else if (snapshot.rows.length) {
    try {
      modelCalls++;
      pacLog("COMPLIANCE report compose starting", { deadlineMs, remainingMs: deadlineAt - Date.now(), inputChars });
      const raw = await withinDeadline(deadlineAt, signal => complete("compose", {
        userIntent: state.request.instruction, perspective: state.intent?.partyPerspective,
        mode, defaultPlan: fallbackPlan, lockedData,
      }, { abortSignal: signal }));
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("plan" in raw) || !("draft" in raw)) {
        failures.push("Composition returned an invalid envelope.");
        fallbackReason = "validation_failed";
      } else {
        const composed = raw as { plan: unknown; draft: unknown };
        const planErrors = validateCompliancePresentationPlan(composed.plan, snapshot, mode);
        if (!planErrors.length) { plan = composed.plan as CompliancePresentationPlan; plannerFallback = false; }
        else failures.push(...planErrors);
        rawDraft = composed.draft;
        pacLog("COMPLIANCE report draft completed", { planAccepted: !planErrors.length,
          sections: !planErrors.length ? plan.sections.length : fallbackPlan.sections.length,
          outputChars: JSON.stringify(composed.draft).length });
      }
    } catch (error) {
      failures.push("Report composition failed; used the deterministic presentation.");
      fallbackReason = "composition_failed";
      pacLog("COMPLIANCE report compose failed", {
        remainingMs: deadlineAt - Date.now(), error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let draft = deterministicComplianceDraft(snapshot, plan);
  let source: ComplianceReportValidation["source"] = "deterministic";
  let repairAttempts = 0;
  if (snapshot.rows.length && rawDraft !== undefined) {
    await state.onProgress?.(89, "Preparing the report and checking its references.");
    try {
      let raw = rawDraft;
      let errors = validateComplianceDraft(raw, snapshot, plan);
      if (!errors.length) {
        modelCalls++;
        errors = await withinDeadline(deadlineAt, signal => semanticCheck(complete, plan, lockedData, raw, signal));
        pacLog("COMPLIANCE report validation completed", { passed: !errors.length, failures: errors.length });
      }
      if (errors.length) {
        failures.push(...errors);
        repairAttempts = 1;
        modelCalls++;
        raw = await withinDeadline(deadlineAt, signal => complete("repair", {
          userIntent: state.request.instruction, perspective: state.intent?.partyPerspective,
          plan, lockedData, draft: raw, failures: errors,
        }, { abortSignal: signal }));
        errors = validateComplianceDraft(raw, snapshot, plan);
        if (!errors.length) {
          modelCalls++;
          errors = await withinDeadline(deadlineAt, signal => semanticCheck(complete, plan, lockedData, raw, signal));
        }
        pacLog("COMPLIANCE report repair completed", { passed: !errors.length, failures: errors.length });
      }
      if (!errors.length) { draft = raw as ComplianceReportDraft; source = "validated_writer"; }
      else { failures.push(...errors); fallbackReason = "validation_failed"; }
    } catch (error) {
      failures.push("Report writing could not be validated; used verified source wording.");
      fallbackReason = "validation_failed";
      pacLog("COMPLIANCE report validation/repair failed", {
        remainingMs: deadlineAt - Date.now(), error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (source === "deterministic") {
    plan = fallbackPlan;
    draft = deterministicComplianceDraft(snapshot, plan);
  }
  if (fallbackReason) pacLog("COMPLIANCE report fallback used", { reason: fallbackReason, failures: failures.length });
  const renderedOutput = renderComplianceMarkdown(snapshot, plan, draft);
  outputChars = renderedOutput.length;
  pacLog("COMPLIANCE report validated", {
    rows: snapshot.rows.length, outstanding: snapshot.outstandingChecks.length, mode, source, plannerFallback,
    repairAttempts, failures: failures.length, guidance: guidance.versions,
    reporting: { inputChars, evidenceCount, uniqueEvidenceCount, modelCalls, elapsedMs: Date.now() - startedMs },
  });
  return { ...state, renderedOutput, compliancePresentationPlan: plan, complianceReportValidation: {
    passed: true, source, failures, plannerFallback, repairAttempts, guidanceVersions: guidance.versions,
    generation: generation(fallbackReason), coverage: reportCoverage(snapshot, plan),
    outputHash: complianceOutputHash(renderedOutput),
  } };
}
