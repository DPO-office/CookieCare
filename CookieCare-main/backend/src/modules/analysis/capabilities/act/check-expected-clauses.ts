import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById } from "../../skills/registry.js";
import { fullTextLikelyHasClause, insufficient } from "./act-utils.js";

/**
 * Skill-scoped deterministic expected-clause checks (replaces hardcoded 4-type loop).
 */
export function checkExpectedClauses(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): { state: AnalysisState; findings: Finding[] } {
  const docId = String(unit.input.docId ?? "");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? ["general-review"];

  const doc = state.workspace.documents.find((d) => d.docId === docId);
  if (!doc) {
    return {
      state,
      findings: [...findings, insufficient(unit, `Document ${docId} missing for expected clause check`)],
    };
  }

  const clauses = doc.clauses ?? [];
  const newFindings: Finding[] = [];

  for (const skillId of skillIds) {
    const skill = getSkillById(skillId);
    if (!skill) continue;

    for (const expected of skill.expectedClauses) {
      const hasClause = clauses.some((c) => c.clauseType === expected.clauseType);

      if (hasClause) continue;

      const likelyPresent = fullTextLikelyHasClause(
        doc.fullText,
        expected.textSynonyms ?? []
      );

      if (likelyPresent) {
        newFindings.push({
          findingId: `f_insuff_extract_${expected.clauseType}_${unit.workUnitId}`,
          kind: "risk",
          category: expected.findingCategory,
          status: "insufficient_evidence",
          claim:
            `Clause type "${expected.clauseType}" may be present but was not extracted with sufficient confidence.`,
          evidence: [],
          severity: expected.severityIfMissing,
          taxonomyVersion: RISK_TAXONOMY_VERSION,
          workUnitId: unit.workUnitId,
          skillId,
          visibility: "user_facing",
        });
        continue;
      }

      newFindings.push({
        findingId: `f_absent_${expected.clauseType}_${skillId}_${unit.workUnitId}`,
        kind: "risk",
        category: expected.findingCategory,
        status: "absent_expected",
        claim: `Expected clause type "${expected.clauseType}" was not found (${skill.label}).`,
        evidence: [],
        severity: expected.severityIfMissing,
        taxonomyVersion: RISK_TAXONOMY_VERSION,
        workUnitId: unit.workUnitId,
        skillId,
        visibility: "user_facing",
      });
    }
  }

  return { state, findings: [...findings, ...newFindings] };
}
