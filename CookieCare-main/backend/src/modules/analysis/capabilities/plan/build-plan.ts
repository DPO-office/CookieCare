import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  AnalysisPlan,
  AnalysisWorkUnit,
  MissingClarification,
} from "../../models/analysis-plan.js";
import {
  INTENT_CONFIDENCE_THRESHOLD,
  type IntentClassification,
} from "../../models/intent.js";
import {
  CLAUSE_TAXONOMY_VERSION,
} from "../../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { orderByDependency } from "../../utils/topo-batches.js";
import { resolveSkills } from "../../skills/resolve-skills.js";
import { buildActGraphDetailed } from "../../skills/build-act-graph.js";
import { extractInstructionFocus } from "../../skills/extract-instruction-focus.js";
import { getSkillById } from "../../skills/registry.js";
import { pacLog } from "../../utils/pac-log.js";

const SKILL_DRIVEN_OPERATIONS = new Set([
  "risk_flag",
  "compliance_check",
  "extract",
  "summarize",
]);

/**
 * Build AnalysisWorkUnit graph from resolved skills + intent.
 * Low confidence on any axis → critical clarification (ASK), not a guess.
 */
export async function buildPlan(state: AnalysisState): Promise<AnalysisState> {
  const intent = state.intent;
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

  const missing = collectLowConfidence(intent);
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
    return {
      ...state,
      plan: emptyPlan(intent, missing),
    };
  }

  // If user answered skill ambiguity ASK, activeSkills are already pinned in applyUserAnswers.
  if (!state.activeSkills?.length) {
    state = await resolveSkills(state);
  }

  if (state.pendingSkillClarification) {
    return {
      ...state,
      plan: emptyPlan(intent, [state.pendingSkillClarification]),
    };
  }

  const skills = state.activeSkills ?? [getSkillById("general-review")!];
  const primaryDocId = docIds[0];
  const focus = extractInstructionFocus(state.request.instruction, skills);

  const graph = buildActGraphDetailed({
    docId: primaryDocId,
    instruction: state.request.instruction,
    skills,
    intent,
    focus,
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
    rules: focus?.ruleIds.join(",") || "(full)",
    matrix: focus?.matrixRowIds.length ?? 0,
    schema: graph.rendererSchemaId,
    units: workUnits.map((u) => u.tool).join(" → "),
  });

  return { ...state, plan, pendingSkillClarification: undefined };
}

function collectLowConfidence(intent: IntentClassification): MissingClarification[] {
  const missing: MissingClarification[] = [];
  const c = intent.confidence;
  if (c.scope < INTENT_CONFIDENCE_THRESHOLD) {
    missing.push({
      field: "scope",
      question: "Should this analysis cover the whole document, a named section, or multiple documents?",
      severity: "critical",
      options: ["whole_document", "named_section", "cross_document"],
    });
  }
  if (c.operation < INTENT_CONFIDENCE_THRESHOLD) {
    missing.push({
      field: "operation",
      question: "What should we do: flag risks, check compliance, extract clauses, summarize, or compare?",
      severity: "critical",
      options: ["risk_flag", "compliance_check", "extract", "summarize", "compare"],
    });
  }
  if (c.standard < INTENT_CONFIDENCE_THRESHOLD) {
    missing.push({
      field: "standard",
      question: "Which standard should we use (none, a regime pack, or a playbook rule)?",
      severity: "optional",
    });
  }
  if (c.outputForm < INTENT_CONFIDENCE_THRESHOLD) {
    missing.push({
      field: "outputForm",
      question: "Preferred output form: checklist, memo, or table?",
      severity: "optional",
      options: ["checklist", "memo", "table"],
    });
  }
  return missing;
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
