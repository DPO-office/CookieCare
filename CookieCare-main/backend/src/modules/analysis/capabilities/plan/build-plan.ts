import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  AnalysisPlan,
  AnalysisWorkUnit,
  MissingClarification,
} from "../../models/analysis-plan.js";
import { INTENT_CONFIDENCE_THRESHOLD, type IntentClassification } from "../../models/intent.js";
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
import { getSkillById } from "../../skills/registry.js";
import { pacLog } from "../../utils/pac-log.js";
import { loadOrgMemory } from "../../memory/org-memory.js";
import { applyOrgRoutingDefaults } from "../../memory/resolve-org-defaults.js";
import { resolveDocumentRoles } from "./resolve-document-roles.js";

const SKILL_DRIVEN_OPERATIONS = new Set([
  "risk_flag",
  "compliance_check",
  "extract",
  "summarize",
]);

/**
 * Build AnalysisWorkUnit graph from resolved skills + intent.
 * Classification already asked on low operation/standard confidence.
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

  intent = applySensibleDefaults(intent);
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

  if (!state.activeSkills?.length) {
    state = await resolveSkills(state);
  }

  state = await applyOrgRoutingDefaults(state, state.orgMemory);

  if (state.pendingSkillClarification) {
    return {
      ...state,
      plan: emptyPlan(intent, [state.pendingSkillClarification]),
    };
  }

  const skills = state.activeSkills ?? [getSkillById("_global")!];
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

  const primaryDocId = roleResolution.targetDocId || docIds[0];
  const referenceDocId = roleResolution.referenceDocId;
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

  const focus = extractInstructionFocus(state.request.instruction, skills);
  const relatedChecks = resolveRelatedChecks(skills, state.request.instruction, focus);

  const graph = buildActGraphDetailed({
    docId: primaryDocId,
    instruction: state.request.instruction,
    skills,
    intent,
    focus,
    relatedChecks,
    unresolvedStandard: intent.unresolvedStandard,
    referenceDocId,
  });

  const workUnits: AnalysisWorkUnit[] = orderByDependency(graph.workUnits);

  if (state.agent) {
    state.agent.docCount = docIds.length;
  }

  const plan: AnalysisPlan = {
    intent,
    workUnits,
    missingClarifications: [],
    outputForm: intent.outputForm,
    rendererSchemaId: graph.rendererSchemaId,
    activeSkillIds: skills.map((s) => s.skillId),
    focus,
    pinnedVersions: {
      clauseTaxonomyVersion:
        state.metadata.clauseTaxonomyVersion ?? CLAUSE_TAXONOMY_VERSION,
      riskTaxonomyVersion:
        state.metadata.riskTaxonomyVersion ?? RISK_TAXONOMY_VERSION,
      modelTask: "STRUCTURAL_JSON",
    },
  };

  pacLog("PLAN graph", {
    skills: skills.map((s) => s.skillId).join(","),
    focus: focus ? "yes" : "no",
    compound: intent.compound ? "yes" : "no",
    subIntents: intent.subIntents.length,
    related: relatedChecks.length,
    web: intent.unresolvedStandard ? "yes" : "no",
    rules: focus?.ruleIds.join(",") || "(full)",
    matrix: focus?.matrixRowIds.length ?? 0,
    schema: graph.rendererSchemaId,
    units: workUnits.map((u) => u.tool).join(" → "),
  });

  return { ...state, plan, pendingSkillClarification: undefined, clarificationRequest: undefined };
}

function applySensibleDefaults(intent: IntentClassification): IntentClassification {
  const confidence = { ...intent.confidence };
  let scope = intent.scope;
  let outputForm = intent.outputForm;

  if (confidence.scope < INTENT_CONFIDENCE_THRESHOLD) {
    scope = "whole_document";
    confidence.scope = INTENT_CONFIDENCE_THRESHOLD;
  }
  if (confidence.outputForm < INTENT_CONFIDENCE_THRESHOLD) {
    outputForm =
      intent.operation === "extract"
        ? "table"
        : intent.operation === "summarize" || intent.operation === "explain_qa"
          ? "memo"
          : "checklist";
    confidence.outputForm = INTENT_CONFIDENCE_THRESHOLD;
  }

  return { ...intent, scope, outputForm, confidence };
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
    confidence: { scope: 0, operation: 0, standard: 0, outputForm: 0 },
  };
}
