import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  AnalysisPlan,
  AnalysisWorkUnit,
  InstructionFocus,
  MissingClarification,
  PlanAuditRecord,
  ResolutionSource,
} from "../../models/analysis-plan.js";
import {
  deriveSections,
  INTENT_CONFIDENCE_THRESHOLD,
  type IntentClassification,
  type ReportDepth,
  type ReportSpec,
  type ReportType,
} from "../../models/intent.js";
import {
  CLAUSE_TAXONOMY_VERSION,
} from "../../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { orderByDependency } from "../../utils/topo-batches.js";
import { resolveSkills } from "../../skills/resolve-skills.js";
import {
  buildActGraphDetailed,
  resolveRelatedChecks,
} from "../../skills/build-act-graph.js";
import { extractInstructionFocus } from "../../skills/extract-instruction-focus.js";
import { requestsRiskAnalysis, EXPLICIT_DEEP_DEPTH_RE } from "./intent-heuristics.js";
import { getSkillById } from "../../skills/registry.js";
import { pacLog } from "../../utils/pac-log.js";
import { logPlanInspect } from "./plan-inspect-log.js";
import { loadOrgMemory } from "../../memory/org-memory.js";
import { applyOrgRoutingDefaults } from "../../memory/resolve-org-defaults.js";
import { resolveDocumentRoles } from "./resolve-document-roles.js";

const SKILL_DRIVEN_OPERATIONS = new Set([
  "risk_flag",
  "compliance_check",
  "extract",
  "summarize",
  "compare",
]);

const SHALLOW_OUTPUT_SIGNAL = /\b(brief|concise|short answer|pass\/fail|just give me)\b/i;

/**
 * PLAN pipeline:
 * 1. document roles
 * 2. mandatory document-type floor (enforced in resolveSkills)
 * 3. active skills
 * 4. semantic instruction resolution
 * 5. report specification
 * 6. clarification
 * 7. ACT work graph
 * 8. audit record
 */
export async function buildPlan(state: AnalysisState): Promise<AnalysisState> {
  let intent = state.intent;
  if (!intent) {
    return {
      ...state,
      plan: emptyPlan(fallbackIntent(), [
        {
          field: "instruction",
          question: "What analysis should we run on the uploaded document(s)?",
          severity: "critical",
        },
      ]),
    };
  }
  intent = applySensibleDefaults(intent, state.request.instruction);
  state = { ...state, intent };

  if (!state.orgMemory) {
    const profile = await loadOrgMemory(state.organizationId);
    if (profile) state = { ...state, orgMemory: profile };
  }
  state = await applyOrgRoutingDefaults(state, state.orgMemory);
  intent = state.intent ?? intent;

  const missing: MissingClarification[] = [];
  if (state.clarificationRequest?.questions.length) {
    for (const q of state.clarificationRequest.questions) {
      missing.push({
        field: q.field,
        question: q.question,
        severity: "critical",
        options: q.options,
      });
    }
  }

  const docIds = state.request.documentIds;
  if (docIds.length === 0) {
    missing.push({
      field: "documentIds",
      question: "Which document should be analyzed? Please upload or select a file.",
      severity: "critical",
    });
  }

  if (
    intent.operation !== "out_of_scope" &&
    !SKILL_DRIVEN_OPERATIONS.has(intent.operation) &&
    missing.length === 0
  ) {
    missing.push({
      field: "operation",
      question:
        `Operation "${intent.operation}" is not fully supported in this release. ` +
        `Confirm to run a risk-flag analysis instead, or rephrase.`,
      severity: "critical",
      options: ["run_risk_flag", "cancel"],
    });
  }

  if (missing.length > 0) {
    pacLog("PLAN ask clarifications", {
      fields: missing.map((m) => m.field).join(","),
    });
    return {
      ...state,
      plan: emptyPlan(intent, missing),
    };
  }

  const roleResolution = resolveDocumentRoles(state);
  if (roleResolution.missing) {
    missing.push(roleResolution.missing);
    pacLog("PLAN ask document roles", { field: roleResolution.missing.field });
    return {
      ...state,
      request: {
        ...state.request,
        documentRoles: { ...state.request.documentRoles, ...roleResolution.roles },
      },
      plan: emptyPlan(intent, missing),
    };
  }

  state = {
    ...state,
    request: {
      ...state.request,
      documentRoles: { ...state.request.documentRoles, ...roleResolution.roles },
    },
    workspace: {
      ...state.workspace,
      documents: state.workspace.documents.map((d) => {
        const role = roleResolution.roles[d.docId];
        if (!role) return d;
        return { ...d, role: role === "reference" ? ("reference" as const) : ("target" as const) };
      }),
    },
  };

  const docTypeFloor = resolveDocTypeFloor(state);
  pacLog("PLAN doc-type floor", { docType: docTypeFloor });

  if (!state.activeSkills?.length) {
    const skillStarted = Date.now();
    state = await resolveSkills(state);
    pacLog("PLAN skill-selection", { ms: Date.now() - skillStarted, skills: state.activeSkillIds?.join(",") });
  }
  state = await applyOrgRoutingDefaults(state, state.orgMemory);
  intent = state.intent ?? intent;

  if (state.pendingSkillClarification) {
    return {
      ...state,
      plan: emptyPlan(intent, [state.pendingSkillClarification]),
    };
  }

  const skills = state.activeSkills ?? [getSkillById("_global")!];
  const riskAnalysisRequested = requestsRiskAnalysis(
    state.request.instruction,
    intent.operation,
    intent.subIntents
  );
  const catalogStarted = Date.now();
  const focus = await extractInstructionFocus(state.request.instruction, skills, {
    riskAnalysisRequested,
  });
  pacLog("PLAN catalog/focus", { ms: Date.now() - catalogStarted, reqs: focus?.requirements?.length ?? 0 });
  const reportSpec = buildReportSpec(intent);
  const relatedChecks = resolveRelatedChecks(skills, state.request.instruction, focus);
  const primaryDocId = roleResolution.targetDocId || docIds[0];
  const referenceDocId = roleResolution.referenceDocId;

  const graphStarted = Date.now();
  const graph = buildActGraphDetailed({
    docId: primaryDocId,
    instruction: state.request.instruction,
    skills,
    intent,
    focus,
    relatedChecks,
    unresolvedStandard: intent.unresolvedStandard,
    referenceDocId,
    reportSpec,
  });
  pacLog("PLAN act-graph", { ms: Date.now() - graphStarted, units: graph.workUnits.length });

  const workUnits: AnalysisWorkUnit[] = orderByDependency(graph.workUnits);

  if (state.agent) {
    state.agent.docCount = docIds.length;
  }

  const auditRecord = buildAuditRecord(skills.map((s) => s.skillId), focus, reportSpec);
  const plan: AnalysisPlan = {
    intent,
    workUnits,
    missingClarifications: [],
    outputForm: intent.outputForm,
    reportSpec,
    rendererSchemaId: graph.rendererSchemaId,
    activeSkillIds: skills.map((s) => s.skillId),
    focus,
    auditRecord,
    pinnedVersions: {
      clauseTaxonomyVersion:
        state.metadata.clauseTaxonomyVersion ?? CLAUSE_TAXONOMY_VERSION,
      riskTaxonomyVersion:
        state.metadata.riskTaxonomyVersion ?? RISK_TAXONOMY_VERSION,
      modelTask: "STRUCTURAL_JSON",
    },
  };

  logPlanInspect({
    instruction: state.request.instruction,
    intent,
    focus,
    auditRecord,
    workUnits,
    skillIds: skills.map((s) => s.skillId),
    rendererSchemaId: graph.rendererSchemaId,
    relatedCount: relatedChecks.length,
    docType: docTypeFloor,
  });

  return {
    ...state,
    plan,
    auditRecord,
    pendingSkillClarification: undefined,
    clarificationRequest: undefined,
  };
}

function applySensibleDefaults(intent: IntentClassification, instruction: string): IntentClassification {
  const confidence = { ...intent.confidence };
  let scope = intent.scope;
  const reportType = intent.reportType ?? fallbackReportType(intent.operation);
  let depth = intent.depth ?? fallbackDepth(instruction);
  if (depth === "deep" && !EXPLICIT_DEEP_DEPTH_RE.test(instruction)) {
    depth = "standard";
  }
  let outputForm = intent.outputForm;

  if (confidence.scope < INTENT_CONFIDENCE_THRESHOLD) {
    scope = "whole_document";
    confidence.scope = INTENT_CONFIDENCE_THRESHOLD;
  }

  if (confidence.outputForm < INTENT_CONFIDENCE_THRESHOLD) {
    outputForm = outputFormFromReportSpec(reportType, depth, intent.operation);
    confidence.outputForm = INTENT_CONFIDENCE_THRESHOLD;
  }

  return { ...intent, scope, outputForm, reportType, depth, confidence };
}

function resolveDocTypeFloor(state: AnalysisState): string {
  const docId = state.request.documentIds[0];
  if (!docId) return "unknown";
  return state.workspace.documents.find((d) => d.docId === docId)?.docType ?? "unknown";
}

function fallbackReportType(operation: IntentClassification["operation"]): ReportType {
  switch (operation) {
    case "extract":
      return "extraction_table";
    case "risk_flag":
    case "compare":
      return "risk_audit";
    case "compliance_check":
      return "regime_compliance_memo";
    case "summarize":
    case "explain_qa":
    case "out_of_scope":
    case "draft_suggestion":
    default:
      return "qa_answer";
  }
}

function fallbackDepth(instruction: string): ReportDepth {
  if (EXPLICIT_DEEP_DEPTH_RE.test(instruction)) return "deep";
  if (SHALLOW_OUTPUT_SIGNAL.test(instruction)) return "narrow";
  return "standard";
}

function outputFormFromReportSpec(
  reportType: ReportType,
  depth: ReportDepth,
  operation: IntentClassification["operation"]
): IntentClassification["outputForm"] {
  switch (reportType) {
    case "extraction_table":
      return "table";
    case "qa_answer":
      return depth === "narrow" ? "brief_summary" : "memo";
    case "risk_audit":
      return operation === "compare" ? "redline_diff" : "checklist";
    case "rights_matrix":
    case "regime_compliance_memo":
    default:
      return "memo";
  }
}

function buildReportSpec(intent: IntentClassification): ReportSpec {
  const reportType = intent.reportType ?? fallbackReportType(intent.operation);
  const depth = intent.depth ?? "standard";
  return {
    reportType,
    depth,
    sections: deriveSections(reportType, depth),
  };
}

function buildAuditRecord(
  resolvedSkillIds: string[],
  focus: InstructionFocus | undefined,
  reportSpec: ReportSpec
): PlanAuditRecord {
  const resolutionSources = [
    ...new Set((focus?.provenance ?? []).map((item) => item.source)),
  ] as ResolutionSource[];

  return {
    resolvedSkillIds,
    resolvedRuleIds: focus?.ruleIds ?? [],
    resolvedMatrixRowIds: focus?.matrixRowIds ?? [],
    resolvedRiskCategoryIds: focus?.riskCategoryIds ?? [],
    reportSpec,
    resolutionSources,
    droppedCandidateIds: focus?.droppedCandidateIds ?? [],
    requirements: focus?.requirements ?? [],
    requiredCapabilities: focus?.requiredCapabilities ?? focus?.requiredIds ?? [],
    supportingCapabilities: focus?.supportingCapabilities ?? focus?.supportingIds ?? [],
    requirementMappings: focus?.requirementMappings ?? [],
    completenessCheck: focus?.completenessCheck ?? [],
    unresolvedNeeds: focus?.unresolvedNeedDetails ?? [],
    provenance: focus?.provenance,
  };
}

function emptyPlan(
  intent: IntentClassification,
  missing: MissingClarification[]
): AnalysisPlan {
  return {
    intent,
    workUnits: [],
    missingClarifications: missing,
    outputForm: intent.outputForm,
    rendererSchemaId: "checklist",
    pinnedVersions: {
      clauseTaxonomyVersion: CLAUSE_TAXONOMY_VERSION,
      riskTaxonomyVersion: RISK_TAXONOMY_VERSION,
    },
  };
}

function fallbackIntent(): IntentClassification {
  return {
    scope: "whole_document",
    operation: "risk_flag",
    standard: "none",
    outputForm: "checklist",
    compound: false,
    subIntents: [],
    requirements: [],
    unresolvedNeeds: [],
    confidence: { scope: 0, operation: 0, standard: 0, outputForm: 0 },
  };
}
