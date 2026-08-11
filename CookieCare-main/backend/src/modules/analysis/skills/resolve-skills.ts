import type { AnalysisState } from "../models/analysis-state.js";
import { classifyDocumentFromText } from "../capabilities/act/classify-document.js";
import {
  buildSkillAmbiguityClarification,
  selectSkills,
} from "./select-skills.js";
import {
  mergeExpectedClauses,
  mergeRegimeRules,
  mergeSkillClauseTypes,
  mergeSkillRiskCategories,
} from "./registry.js";
import { buildActGraph } from "./build-act-graph.js";
import { loadSkillMarkdownForSkills } from "./load-skill-md.js";
import { getRuntimeTaxonomies } from "./registry.js";

/**
 * Resolve active skills in PLAN (Path A library id or Path B free text + docType).
 */
export async function resolveSkills(state: AnalysisState): Promise<AnalysisState> {
  const primaryDocId = state.request.documentIds[0];
  let docType = "unknown";

  if (primaryDocId) {
    const text =
      state.request.documentTexts[primaryDocId] ??
      state.workspace.documents.find((d) => d.docId === primaryDocId)?.fullText ??
      "";
    if (text) {
      docType = classifyDocumentFromText(text);
      const docs = state.workspace.documents.map((d) =>
        d.docId === primaryDocId ? { ...d, docType, role: "primary" as const, fullText: d.fullText || text } : d
      );
      if (!state.workspace.documents.some((d) => d.docId === primaryDocId) && text) {
        docs.push({
          docId: primaryDocId,
          fullText: text,
          segments: [],
          clauses: [],
          docType,
          role: "primary",
        });
      }
      state = { ...state, workspace: { ...state.workspace, documents: docs } };
    }
  }

  const selection = selectSkills({
    instruction: state.request.instruction,
    promptLibraryId: state.request.promptLibraryId,
    docType,
  });

  if (selection.ambiguous && selection.candidateSkillIds?.length) {
    const clarification = buildSkillAmbiguityClarification(selection.candidateSkillIds);
    return {
      ...state,
      activeSkills: selection.skills,
      activeSkillIds: selection.skills.map((s) => s.skillId),
      skillSelectionPath: selection.selectionPath,
      pendingSkillClarification: clarification,
    };
  }

  const skillMd = await loadSkillMarkdownForSkills(selection.skills);
  const runtime = getRuntimeTaxonomies();

  return {
    ...state,
    activeSkills: selection.skills,
    activeSkillIds: selection.skills.map((s) => s.skillId),
    mergedClauseTypes: mergeSkillClauseTypes(selection.skills),
    mergedRiskCategories: mergeSkillRiskCategories(selection.skills).map((r) => r.category),
    mergedExpectedClauses: mergeExpectedClauses(selection.skills),
    mergedRegimeRules: mergeRegimeRules(selection.skills),
    skillMarkdown: skillMd,
    skillSelectionPath: selection.selectionPath,
    metadata: {
      ...state.metadata,
      clauseTaxonomyVersion: runtime.clauseTaxonomyVersion,
      riskTaxonomyVersion: runtime.riskTaxonomyVersion,
      activeSkillVersions: Object.fromEntries(
        selection.skills.map((s) => [s.skillId, s.version])
      ),
    },
  };
}

export { buildActGraph };
