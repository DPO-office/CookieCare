import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  AnalysisPlan,
  AnalysisWorkUnit,
  InstructionFocus,
  IntentNormalization,
  MissingClarification,
  PlanAuditRecord,
  ResolutionSource,
} from "../../models/analysis-plan.js";
import {
  deriveSections,
  type IntentClassification,
  type ReportSpec,
} from "../../models/intent.js";
import {
  CLAUSE_TAXONOMY_VERSION,
} from "../../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { orderByDependency } from "../../utils/topo-batches.js";
import { resolveSkills } from "../../skills/runtime/selection/resolve-skills.js";
import {
  buildActGraphDetailed,
  resolveRelatedChecks,
} from "../../skills/runtime/graph/build-act-graph.js";
import { extractInstructionFocus } from "../../skills/runtime/focus/extract-instruction-focus.js";
import { requestsRiskAnalysis } from "./intent-heuristics.js";
import { applySensibleDefaults, fallbackReportType } from "./intent-sensible-defaults.js";
import { getSkillById } from "../../skills/runtime/catalog/registry.js";
import { pacLog } from "../../utils/pac-log.js";
import { logPlanInspect } from "./plan-inspect-log.js";
import { deriveReportOutline } from "./derive-report-outline.js";
import {
  buildFinalReportSpec,
  mergeAuthoredReportSections,
  reportTypeToOutputForm,
  resolveReportSpecFromPackages,
} from "./resolve-report-spec.js";
import { loadOrgMemory } from "../../memory/org-memory.js";
import { applyOrgRoutingDefaults } from "../../memory/resolve-org-defaults.js";
import { resolveDocumentRoles } from "./resolve-document-roles.js";
import { followUpKindForState, isMaterialTopicShift } from "./follow-up-intent.js";
import { buildOpenPlan } from "./build-open-plan.js";
import type { EvidencePackage } from "../../models/evidence-package.js";
import { replicateGraphForTargets } from "../../skills/runtime/graph/replicate-graph-for-targets.js";
import { injectAuthoredRequirements } from "./inject-authored-requirements.js";

const SKILL_DRIVEN_OPERATIONS = new Set([
  "risk_flag",
  "compliance_check",
  "extract",
  "summarize",
  "compare",
  "explain_qa",
]);

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
  const rawIntent = state.intent;
  if (!rawIntent) {
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
  const { intent: normalizedIntent, normalizations: intentNormalizations } =
    applySensibleDefaults(rawIntent, state.request.instruction);
  let intent = normalizedIntent;
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

  const followUpKind = followUpKindForState(state);
  const topicShifted =
    Boolean(state.priorAnalysis?.intent && intent) &&
    isMaterialTopicShift(state.priorAnalysis!.intent!, intent);
  const effectiveFollowUpKind = topicShifted ? "new_analysis" : followUpKind;
  const canReusePrior =
    (effectiveFollowUpKind === "presentation_change" ||
      effectiveFollowUpKind === "conversational_qa") &&
    Boolean(
      (state.priorAnalysis?.findings.length ?? 0) > 0 ||
        (state.priorAnalysis?.requirementAssessments?.length ?? 0) > 0
    );

  if (canReusePrior && state.priorAnalysis) {
    const reusedSkills = (
      state.activeSkills?.length
        ? state.activeSkills
        : (state.priorAnalysis.activeSkillIds ?? [])
            .map((id) => getSkillById(id))
            .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))
    );
    const skills = reusedSkills.length ? reusedSkills : [getSkillById("_global")!];
    const reportSpec = await buildReportSpec(intent, state.request.instruction);
    const schemaId = rendererSchemaForIntent(intent);
    const plan: AnalysisPlan = {
      intent,
      workUnits: [
        {
          workUnitId: "wu-render",
          tool: "render_output",
          input: {
            schemaId,
            skillIds: skills.map((s) => s.skillId),
            instruction: state.request.instruction,
            followUpKind: effectiveFollowUpKind,
          },
          dependsOn: [],
          outputSchema: "string",
          status: "pending",
        },
      ],
      missingClarifications: [],
      outputForm: intent.outputForm,
      skipCritique: true,
      reportSpec,
      rendererSchemaId: schemaId,
      activeSkillIds: skills.map((s) => s.skillId),
      pinnedVersions: {
        clauseTaxonomyVersion:
          state.metadata.clauseTaxonomyVersion ?? CLAUSE_TAXONOMY_VERSION,
        riskTaxonomyVersion:
          state.metadata.riskTaxonomyVersion ?? RISK_TAXONOMY_VERSION,
        modelTask: "STRUCTURAL_JSON",
      },
    };
    pacLog("PLAN follow-up re-render", {
      kind: effectiveFollowUpKind,
      schemaId,
      findings: state.priorAnalysis.findings.length,
    });
    return {
      ...state,
      findings: state.priorAnalysis.findings,
      requirementAssessments: state.priorAnalysis.requirementAssessments,
      analysisArtifacts: state.priorAnalysis.analysisArtifacts,
      activeSkills: skills,
      activeSkillIds: skills.map((s) => s.skillId),
      plan,
      pendingSkillClarification: undefined,
      clarificationRequest: undefined,
    };
  }

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
  const primaryDocId = roleResolution.targetDocId || docIds[0];
  const referenceDocId = roleResolution.referenceDocId;

  // Lane router. Open/general asks (no regime standard, or a risk/QA/compare
  // operation) go through the document-first proposition brain: inventory the
  // document, generate propositions with proof standards for what is actually
  // in it, and run them through the same evaluate_package/VERIFY spine as an
  // authored package. Compliance asks (a regime_pack standard) keep the
  // authored-catalogue path. Flag-gated; off = current behavior.
  const openLaneEnabled = process.env.ANALYSIS_OPEN_PROPOSITIONS === "1";
  const isRegimeCompliance =
    typeof intent.standard === "string" && intent.standard.startsWith("regime_pack:");
  const preferOpenLane =
    openLaneEnabled &&
    !isRegimeCompliance &&
    (intent.standard === "none" ||
      intent.operation === "risk_flag" ||
      intent.operation === "explain_qa" ||
      intent.operation === "compare");

  let focus: InstructionFocus | undefined;
  let extraPackages: EvidencePackage[] | undefined;

  if (preferOpenLane) {
    const open = await buildOpenPlan(state, primaryDocId, referenceDocId);
    if (open.ambiguity && open.ambiguity.severity === "critical") {
      return { ...open.state, plan: emptyPlan(open.intent, [open.ambiguity]) };
    }
    if (open.hasPropositions) {
      state = open.state;
      intent = open.intent;
      extraPackages = open.extraPackages;
      focus = undefined;
      pacLog("PLAN open-analysis lane", {
        requirements: intent.requirements?.length ?? 0,
        packages: extraPackages?.length ?? 0,
      });
    }
  }

  if (!extraPackages) {
    // Compliance / catalogue lane (existing).
    const catalogStarted = Date.now();
    focus = await extractInstructionFocus(state.request.instruction, skills, {
      riskAnalysisRequested,
      intentRequirements: intent.requirements,
    });
    pacLog("PLAN catalog/focus", { ms: Date.now() - catalogStarted, reqs: focus?.requirements?.length ?? 0 });
    intent = injectAuthoredRequirements(intent, skills, focus);
    state = { ...state, intent };
  }

  const seedReportType = intent.reportType ?? fallbackReportType(intent.operation);
  const seedDepth = intent.depth ?? "standard";
  const seedReportSpec: ReportSpec = {
    reportType: seedReportType,
    depth: seedDepth,
    sections: deriveSections(seedReportType, seedDepth, intent.operation),
  };
  const relatedChecks = resolveRelatedChecks(skills, state.request.instruction, focus);
  const targetDocIds =
    roleResolution.targetDocIds.length > 0
      ? roleResolution.targetDocIds
      : [primaryDocId];

  const graphStarted = Date.now();
  const graphs = targetDocIds.map((docId) =>
    buildActGraphDetailed({
      docId,
      instruction: state.request.instruction,
      skills,
      intent,
      focus,
      relatedChecks,
      unresolvedStandard: intent.unresolvedStandard,
      referenceDocId,
      reportSpec: seedReportSpec,
      extraPackages,
    })
  );
  const graph = replicateGraphForTargets(graphs);
  const packageList =
    graph.packageResolution.reportPackages ??
    graph.packageResolution.packages.map((item) => item.pkg);
  const merged = resolveReportSpecFromPackages({
    intent,
    instruction: state.request.instruction,
    packages: packageList,
    fallbackReportType: seedReportType,
  });
  const reportSpec = buildFinalReportSpec({
    intent,
    reportType: merged.reportType,
    depth: seedDepth,
    sections: merged.sections,
    outlineExtras: merged.outlineExtras,
    instruction: state.request.instruction,
  });
  pacLog("PLAN act-graph", {
    ms: Date.now() - graphStarted,
    units: graph.workUnits.length,
    targets: targetDocIds.length,
  });

  const provenance = focus?.provenance ?? [];
  const scopeAudit = graph.packageResolution.scopeAudit ?? [];
  const droppedOutOfScope = scopeAudit.reduce(
    (total, entry) =>
      total + entry.droppedCapabilityIds.length + entry.droppedDependencyIds.length,
    0
  );
  pacLog("PLAN scope", {
    explicitArticles: focus?.explicitScope?.articles ?? [],
    catalogCandidates: provenance.length,
    required: provenance.filter((item) => item.required).length,
    supporting: provenance.filter((item) => !item.required).length,
    droppedOutOfScope,
  });

  const workUnits: AnalysisWorkUnit[] = orderByDependency(graph.workUnits);

  if (state.agent) {
    state.agent.docCount = docIds.length;
  }

  const auditRecord = buildAuditRecord(
    skills.map((s) => s.skillId),
    focus,
    reportSpec,
    graph.packageResolution,
    { rawIntent, intentNormalizations }
  );
  const plan: AnalysisPlan = {
    intent,
    workUnits,
    missingClarifications: [],
    outputForm: resolvePlanOutputForm(intent, reportSpec.reportType, state.request.answerStyle),
    // Pause CRITIQUE for all analysis types (ACT → DONE). See CRITIQUE_PAUSED.
    skipCritique: true,
    reportSpec,
    rendererSchemaId: graph.rendererSchemaId,
    activeSkillIds: skills.map((s) => s.skillId),
    focus,
    auditRecord,
    requirementExecutionPaths: graph.packageResolution.requirementPaths,
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

function resolveDocTypeFloor(state: AnalysisState): string {
  const docId = state.request.documentIds[0];
  if (!docId) return "unknown";
  return state.workspace.documents.find((d) => d.docId === docId)?.docType ?? "unknown";
}

async function buildReportSpec(
  intent: IntentClassification,
  instruction: string,
  packages: import("../../models/evidence-package.js").EvidencePackage[] = []
): Promise<ReportSpec> {
  const reportType = intent.reportType ?? fallbackReportType(intent.operation);
  const depth = intent.depth ?? "standard";
  const merged = mergeAuthoredReportSections({ reportType, depth, packages });
  return buildFinalReportSpec({
    intent,
    reportType: merged.reportType,
    depth,
    sections: merged.sections,
    outlineExtras: merged.outlineExtras,
    instruction,
  });
}

function buildAuditRecord(
  resolvedSkillIds: string[],
  focus: InstructionFocus | undefined,
  reportSpec: ReportSpec,
  packageResolution?: {
    packages: { pkg: { id: string } }[];
    requirementToPackageId: Record<string, string>;
    requirementPaths: PlanAuditRecord["requirementExecutionPaths"];
    scopeAudit?: PlanAuditRecord["scopeAudit"];
  },
  intentAudit?: {
    rawIntent: IntentClassification;
    intentNormalizations: IntentNormalization[];
  }
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
    resolvedPackageIds: packageResolution?.packages.map((item) => item.pkg.id) ?? [],
    requirementToPackageId: packageResolution?.requirementToPackageId ?? {},
    requirementExecutionPaths: packageResolution?.requirementPaths ?? [],
    rawIntent: intentAudit?.rawIntent,
    intentNormalizations: intentAudit?.intentNormalizations,
    scopeAudit: packageResolution?.scopeAudit,
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
    skipCritique: true,
    rendererSchemaId: "checklist",
    pinnedVersions: {
      clauseTaxonomyVersion: CLAUSE_TAXONOMY_VERSION,
      riskTaxonomyVersion: RISK_TAXONOMY_VERSION,
    },
  };
}

export function resolvePlanOutputForm(
  intent: IntentClassification,
  reportType: ReportSpec["reportType"],
  answerStyle: AnalysisState["request"]["answerStyle"]
): AnalysisPlan["outputForm"] {
  if (intent.outputForm === "table" || answerStyle === "tabular") return "table";
  if (intent.outputForm === "brief_summary") return "brief_summary";
  if (intent.outputForm === "qa_thread") return "qa_thread";
  return reportTypeToOutputForm(reportType);
}

function rendererSchemaForIntent(
  intent: IntentClassification
): AnalysisPlan["rendererSchemaId"] {
  if (intent.outputForm === "brief_summary") return "brief_summary";
  if (intent.outputForm === "table") return "table";
  if (intent.outputForm === "qa_thread") return "qa_thread";
  if (intent.outputForm === "memo") return "memo";
  if (intent.operation === "explain_qa") return "qa_thread";
  return "checklist";
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
