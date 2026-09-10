import type { AnalysisState } from "../../../models/analysis-state.js";
import { classifyDocumentFromText } from "./classify-document.js";
import {
  buildSkillAmbiguityClarification,
  selectSkills,
} from "./select-skills.js";
import {
  getRegistryApi,
  resolveDocTypeSkill,
} from "../catalog/registry.js";
import type { AnalysisSkillConfig } from "../catalog/types.js";
import { buildActGraph } from "../graph/build-act-graph.js";
import { hydrateActiveSkills } from "../catalog/hydrate-active-skills.js";

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

  const hintedDocType =
    state.intent?.docTypeHint ??
    state.workspace.documents.find((d) => d.docId === primaryDocId)?.docType;
  if (docType === "unknown" && hintedDocType && hintedDocType !== "unknown") {
    docType = hintedDocType;
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

  const skills = ensureDocTypeSkillIncluded(selection.skills, docType, hintedDocType);

  if (selection.ambiguous && selection.candidateSkillIds?.length) {
    const clarification = buildSkillAmbiguityClarification(selection.candidateSkillIds);
    return {
      ...state,
      activeSkills: skills,
      activeSkillIds: skills.map((s) => s.skillId),
      skillSelectionPath: selection.selectionPath,
      pendingSkillClarification: clarification,
      partialCoverageWarning: selection.partialCoverageWarning,
    };
  }

  return hydrateActiveSkills(state, skills, {
    skillSelectionPath: selection.selectionPath,
    partialCoverageWarning: selection.partialCoverageWarning,
  });
}

/** When classify-intent already identified a doc-type, always attach its structural skill. */
function ensureDocTypeSkillIncluded(
  skills: AnalysisSkillConfig[],
  docType: string,
  hintedDocType?: string
): AnalysisSkillConfig[] {
  const floor = [docType, hintedDocType]
    .filter((value): value is string => Boolean(value && value !== "unknown"))
    .map((value) => value.toLowerCase());

  if (floor.length === 0) return skills;

  const registry = getRegistryApi();
  for (const type of floor) {
    const raw = registry
      .getByAxis("doc-type")
      .find((skill) => skill.appliesToDocTypes.includes(type));
    if (!raw) continue;
    const resolved = resolveDocTypeSkill(raw.skillId);
    if (skills.some((skill) => skill.skillId === resolved.skillId)) continue;
    const globalIdx = skills.findIndex((skill) => skill.skillId === "_global");
    if (globalIdx >= 0) {
      return [
        ...skills.slice(0, globalIdx + 1),
        resolved,
        ...skills.slice(globalIdx + 1),
      ];
    }
    return [resolved, ...skills];
  }
  return skills;
}

function inferJurisdictionFromInstruction(instruction: string): string | undefined {
  const lower = instruction.toLowerCase();
  if (/\bcalifornia\b|\bcal\.\s*bus\b/.test(lower)) return "california";
  if (/\bdelaware\b/.test(lower)) return "delaware";
  if (/\bireland\b|\birish law\b/.test(lower)) return "ireland";
  if (/\bengland and wales\b|\benglish law\b|\blaws of england\b|\bengland\b|\bunited kingdom\b|\buk law\b/.test(lower))
    return "england-wales";
  return undefined;
}

export { buildActGraph };
