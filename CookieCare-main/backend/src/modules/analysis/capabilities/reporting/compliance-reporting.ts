import { reportOutcomeId, adaptPersistedSnapshot } from "../act/compliance/adapters/index.js";
import { executeJsonCompletion, LLMProvider, LLMTask } from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { CompliancePresentationPlan, ComplianceReportDraft, ComplianceReportSnapshot } from "../../models/compliance-report.js";
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
export type ComplianceCompletion = (stage: ComplianceCompletionStage, payload: unknown) => Promise<unknown>;

const PLAN_SCHEMA = {
  type: "object", properties: {
    // Gemini's responseSchema enum supports strings, not integer enums. Code
    // validates version === 1 after generation.
    version: { type: "integer" },
    mode: { type: "string", enum: ["layered", "short", "detailed", "narrative", "table_only"] },
    rationale: { type: "string" },
    sections: { type: "array", items: { type: "object", properties: {
      kind: { type: "string", enum: ["answer", "overview", "details", "limitations", "sources"] },
      heading: { type: "string" }, findingIds: { type: "array", items: { type: "string" } },
      columns: { type: "array", items: { type: "string", enum: [
        "Requirement", "Status", "Contract provision", "Assessment", "Gap or qualification", "Recommended action",
        "Parties and roles", "Transfer mechanism", "Destination", "Legal basis", "Timing",
      ] } },
      detailWords: { type: "integer" },
    }, required: ["kind", "heading", "findingIds", "columns", "detailWords"] } },
  }, required: ["version", "mode", "rationale", "sections"],
};
const DRAFT_SCHEMA = {
  type: "object", properties: {
    answer: { type: "string" },
    rows: { type: "array", items: { type: "object", properties: {
      findingId: { type: "string" }, assessment: { type: "string" }, explanation: { type: "string" },
    }, required: ["findingId", "assessment", "explanation"] } },
  }, required: ["answer", "rows"],
};
const CHECK_SCHEMA = {
  type: "object", properties: {
    passed: { type: "boolean" }, failures: { type: "array", items: { type: "string" } },
  }, required: ["passed", "failures"],
};

/** Uses the existing verifier/reporting provider and credentials. The user
 * explicitly approved these new planner/writer/check calls with verified
 * compliance findings, quotations and clause pointers to the existing Gemini provider. */
export function createComplianceCompletion(state: AnalysisState): ComplianceCompletion {
  const guidance = loadComplianceReportingGuidance(state.request.instruction, state.complianceReportSnapshot);
  return async (stage, payload) => {
    const task = LLMTask.STRUCTURAL_JSON_LITE;
    const tracker = { tokensUsed: 0 };
    const ids = (payload as { lockedData?: { rows?: Array<{ findingId: string }> } }).lockedData?.rows?.map(r => r.findingId) ?? [];
    const draftSchema = { ...DRAFT_SCHEMA, properties: { ...DRAFT_SCHEMA.properties,
      rows: { ...DRAFT_SCHEMA.properties.rows, minItems: ids.length, maxItems: ids.length,
        items: { ...DRAFT_SCHEMA.properties.rows.items,
          properties: { ...DRAFT_SCHEMA.properties.rows.items.properties,
            findingId: { type: "string", enum: ids } } } } } };
    try {
      return await executeJsonCompletion(
        JSON.stringify(payload), guidance.system[stage],
        stage === "outline" ? PLAN_SCHEMA : stage === "check" ? CHECK_SCHEMA : draftSchema,
        task, LLMProvider.GEMINI,
        { maxOutputTokens: stage === "outline" ? 4000 : stage === "check" ? 1600 : 12000,
          thinkingLevel: profileThinkingLevel(state, task), tracker }
      );
    } finally { if (state.agent) state.agent.tokensUsed += tracker.tokensUsed; }
  };
}

function reportingInput(snapshot: ComplianceReportSnapshot) {
  return {
    scope: snapshot.scope,
    rows: snapshot.rows.map(row => ({
      findingId: reportOutcomeId(row), title: row.title, status: row.status,
      legalCitation: row.legalCitation, whatTheDocumentProvides: row.whatTheDocumentProvides,
      whatIsMissingOrUnclear: row.whatIsMissingOrUnclear, conclusion: row.conclusion,
      whyItMatters: row.whyItMatters, recommendedAction: row.recommendedAction,
      answers: (row.answers ?? []).map(answer => ({
        questionId: answer.questionId, question: answer.question, answer: answer.answer,
        elementIds: answer.elementIds, evidenceIds: answer.evidenceIds,
      })),
      evidence: row.evidence.map(e => ({ citationId: e.citationId, document: e.documentTitle, pointer: e.pointer, quote: e.quote })),
    })),
    outstandingChecks: snapshot.outstandingChecks, limitations: snapshot.limitations,
  };
}

async function checkDraft(complete: ComplianceCompletion, snapshot: ComplianceReportSnapshot, plan: CompliancePresentationPlan, raw: unknown): Promise<string[]> {
  const failures = validateComplianceDraft(raw, snapshot, plan);
  if (failures.length) return failures;
  try {
    const result = await complete("check", { lockedData: reportingInput(snapshot), plan, draft: raw });
    if (!result || typeof result !== "object") return ["Semantic check returned an invalid result."];
    const check = result as { passed?: unknown; failures?: unknown };
    if (check.passed === true && Array.isArray(check.failures) && check.failures.length === 0) return [];
    return Array.isArray(check.failures) && check.failures.length && check.failures.every(f => typeof f === "string")
      ? check.failures as string[] : ["Semantic conformance was not confirmed."];
  } catch { return ["Semantic conformance could not be checked."]; }
}

/** One planner, writer and check, at most one repair/recheck. No draft tokens. */
export async function renderComplianceReport(state: AnalysisState, complete: ComplianceCompletion = createComplianceCompletion(state)): Promise<AnalysisState> {
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
  await state.onProgress?.(86, "Organizing the verified compliance findings…");
  const mode = resolveCompliancePresentationMode(state);
  const fallbackPlan = defaultCompliancePresentationPlan(snapshot, mode);
  let plan = fallbackPlan;
  let plannerFallback = true;
  const failures: string[] = [];
  if (snapshot.rows.length) {
    try {
      const raw = await complete("outline", { userIntent: state.request.instruction, perspective: state.intent?.partyPerspective,
        mode, defaultPlan: fallbackPlan, lockedData: reportingInput(snapshot) });
      const errors = validateCompliancePresentationPlan(raw, snapshot, mode);
      if (!errors.length) { plan = raw as CompliancePresentationPlan; plannerFallback = false; }
      else failures.push(...errors);
    } catch { failures.push("Presentation planning failed; used the default outline."); }
  }
  let draft = deterministicComplianceDraft(snapshot, plan);
  let source: "validated_writer" | "deterministic" = "deterministic";
  let repairAttempts = 0;
  if (snapshot.rows.length) {
    await state.onProgress?.(89, "Preparing the report and checking its references…");
    try {
      let raw = await complete("write", { userIntent: state.request.instruction, plan, lockedData: reportingInput(snapshot) });
      let errors = await checkDraft(complete, snapshot, plan, raw);
      if (errors.length) {
        failures.push(...errors); repairAttempts = 1;
        raw = await complete("repair", { plan, lockedData: reportingInput(snapshot), draft: raw, failures: errors });
        errors = await checkDraft(complete, snapshot, plan, raw);
      }
      if (!errors.length) { draft = raw as ComplianceReportDraft; source = "validated_writer"; }
      else failures.push(...errors);
    } catch { failures.push("Report writing could not be validated; used verified source wording."); }
  }
  if (source === "deterministic") {
    // Unchecked planner headings cannot survive a failed semantic check.
    plan = fallbackPlan; draft = deterministicComplianceDraft(snapshot, plan);
  }
  const renderedOutput = renderComplianceMarkdown(snapshot, plan, draft);
  pacLog("COMPLIANCE report validated", { rows: snapshot.rows.length, outstanding: snapshot.outstandingChecks.length,
    mode, source, plannerFallback, repairAttempts, failures: failures.length, guidance: guidance.versions });
  return { ...state, renderedOutput, compliancePresentationPlan: plan, complianceReportValidation: {
    passed: true, source, failures, plannerFallback, repairAttempts, guidanceVersions: guidance.versions,
    outputHash: complianceOutputHash(renderedOutput),
  } };
}
