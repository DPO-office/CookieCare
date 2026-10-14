import { getSkillRegistry } from "../catalog/registry.js";

export type InvestigationProfileQualityIssueKind =
  | "placeholder_proof_element"
  | "duplicate_proof_element_id"
  | "no_distinctive_evidence_hint";

export interface InvestigationProfileQualityIssue {
  skillId: string;
  ruleId: string;
  kind: InvestigationProfileQualityIssueKind;
  detail: string;
}

/**
 * Existing GDPR authoring debt is explicit and may only move down. All other
 * regime packs are expected to remain fully decomposed. A new regime cannot
 * silently ship generated `primary` placeholders by increasing this budget.
 */
const PLACEHOLDER_DEBT_BUDGET: Readonly<Record<string, number>> = {
  "regimes/data-protection/gdpr": 49,
};

export function auditInvestigationProfiles(): InvestigationProfileQualityIssue[] {
  const issues: InvestigationProfileQualityIssue[] = [];
  const regimes = Object.values(getSkillRegistry()).filter((skill) => skill.axis === "regime");

  for (const skill of regimes) {
    for (const rule of skill.regimeRules) {
      const profile = rule.investigation;
      if (!profile) continue; // Completeness is enforced by the parity lint.
      if (profile.proofElements.length === 1 && profile.proofElements[0]?.id === "primary") {
        issues.push({
          skillId: skill.skillId,
          ruleId: rule.ruleId,
          kind: "placeholder_proof_element",
          detail: "Replace the generated primary element with authored, independently provable legal elements.",
        });
      }
      const ids = profile.proofElements.map((element) => element.id);
      if (new Set(ids).size !== ids.length) {
        issues.push({
          skillId: skill.skillId,
          ruleId: rule.ruleId,
          kind: "duplicate_proof_element_id",
          detail: "Proof-element ids must be unique within an atomic rule.",
        });
      }
      if (!profile.evidenceHints.some((hint) => hint.trim().split(/\s+/).length >= 2)) {
        issues.push({
          skillId: skill.skillId,
          ruleId: rule.ruleId,
          kind: "no_distinctive_evidence_hint",
          detail: "Add at least one multi-word legal or operative anchor for exact retrieval.",
        });
      }
    }
  }
  return issues;
}

export function assertInvestigationProfileQualityBudget(): void {
  const issues = auditInvestigationProfiles();
  const hardIssues = issues.filter((issue) => issue.kind !== "placeholder_proof_element");
  const placeholdersBySkill = new Map<string, InvestigationProfileQualityIssue[]>();
  for (const issue of issues.filter((item) => item.kind === "placeholder_proof_element")) {
    const rows = placeholdersBySkill.get(issue.skillId) ?? [];
    rows.push(issue);
    placeholdersBySkill.set(issue.skillId, rows);
  }
  for (const [skillId, rows] of placeholdersBySkill) {
    const budget = PLACEHOLDER_DEBT_BUDGET[skillId] ?? 0;
    if (rows.length > budget) hardIssues.push(...rows.slice(budget));
  }
  if (hardIssues.length > 0) {
    throw new Error(
      `Investigation profile quality audit failed:\n${hardIssues
        .map((issue) => `${issue.skillId}/${issue.ruleId}: ${issue.detail}`)
        .join("\n")}`
    );
  }
}

export function investigationProfileQualitySummary(): Array<{
  skillId: string;
  ruleCount: number;
  placeholderCount: number;
  placeholderBudget: number;
}> {
  const issues = auditInvestigationProfiles();
  const registry = getSkillRegistry();
  return Object.values(registry)
    .filter((skill) => skill.axis === "regime")
    .map((skill) => ({
      skillId: skill.skillId,
      ruleCount: skill.regimeRules.length,
      placeholderCount: issues.filter(
        (issue) => issue.skillId === skill.skillId && issue.kind === "placeholder_proof_element"
      ).length,
      placeholderBudget: PLACEHOLDER_DEBT_BUDGET[skill.skillId] ?? 0,
    }));
}
