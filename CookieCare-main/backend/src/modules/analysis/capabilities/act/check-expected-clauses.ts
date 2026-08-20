import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type { SegmentedDocument } from "../../models/document-workspace.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getSkillById } from "../../skills/registry.js";
import {
  fullTextLikelyHasClause,
  insufficient,
  stampFindingsByCapability,
} from "./act-utils.js";

/**
 * Skill-scoped deterministic expected-clause checks (replaces hardcoded 4-type loop).
 */
export function checkExpectedClauses(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): { state: AnalysisState; findings: Finding[] } {
  const result = _checkExpectedClausesImpl(state, unit, findings);
  return {
    state: result.state,
    findings: stampFindingsByCapability(unit, findings, result.findings, (f) => [
      f.category,
    ]),
  };
}

function _checkExpectedClausesImpl(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): { state: AnalysisState; findings: Finding[] } {
  const docId = String(unit.input.docId ?? "");
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? ["_global"];

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

  return { state, findings: [...findings, ...newFindings, ...orgOverrideFindings(state, unit, doc, skillIds)] };
}

function orgOverrideFindings(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  doc: SegmentedDocument,
  skillIds: string[]
): Finding[] {
  const overrides = state.orgMemory?.playbookOverrides ?? [];
  if (!overrides.length) return [];
  const out: Finding[] = [];
  for (const rule of overrides) {
    if (rule.appliesToSkillIds.length && !rule.appliesToSkillIds.some((id) => skillIds.includes(id))) {
      continue;
    }
    const clause = (doc.clauses ?? []).find((c) => c.clauseType === rule.clauseType);
    out.push({
      findingId: `f_org_${rule.ruleId}_${unit.workUnitId}`,
      kind: "risk",
      category: "other_known_risk",
      status: clause ? "present" : "absent_expected",
      claim: `Org playbook: ${rule.overrideNote}`,
      evidence: clause
        ? [{ locator: clause.locator, quotedText: clause.text.slice(0, 400), sourceRole: "target" }]
        : [],
      severity: rule.overrideSeverity ?? "medium",
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
      visibility: "user_facing",
      orgPlaybook: true,
      orgPlaybookNote: rule.overrideNote,
    });
  }
  return out;
}
