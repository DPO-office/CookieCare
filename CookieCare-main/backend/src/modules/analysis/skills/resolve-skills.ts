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
 * Resolve active skills in PLAN (multi-axis composition + optional jurisdiction).
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
        d.docId === primaryDocId
          ? { ...d, docType, role: "primary" as const, fullText: d.fullText || text }
          : d
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

  const jurisdiction =
    state.orgMemory?.defaultJurisdiction ??
    inferJurisdictionFromInstruction(state.request.instruction);

  const selection = selectSkills({
    instruction: state.request.instruction,
    promptLibraryId: state.request.promptLibraryId,
    docType,
    jurisdiction,
  });

  if (selection.ambiguous && selection.candidateSkillIds?.length) {
    const clarification = buildSkillAmbiguityClarification(selection.candidateSkillIds);
    return {
      ...state,
      activeSkills: selection.skills,
      activeSkillIds: selection.skills.map((s) => s.skillId),
      skillSelectionPath: selection.selectionPath,
      pendingSkillClarification: clarification,
      partialCoverageWarning: selection.partialCoverageWarning,
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
    partialCoverageWarning: selection.partialCoverageWarning,
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

function inferJurisdictionFromInstruction(instruction: string): string | undefined {
  const lower = instruction.toLowerCase();
  if (/\bcalifornia\b|\bcal\.\s*bus\b/.test(lower)) return "california";
  if (/\bdelaware\b/.test(lower)) return "delaware";
  if (/\bireland\b|\birish law\b/.test(lower)) return "ireland";
  if (/\bengland and wales\b|\benglish law\b/.test(lower)) return "england-wales";
  return undefined;
}

export { buildActGraph };
