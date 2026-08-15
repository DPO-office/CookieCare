import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSkillRegistry } from "./registry.js";
import { parseSkillMdContent } from "./load-skill-md.js";

const SKILLS_ROOT = path.dirname(fileURLToPath(import.meta.url));

export interface SkillParityViolation {
  skillId: string;
  kind:
    | "missing_md_section"
    | "orphan_md_section"
    | "missing_skill_md"
    | "missing_finding_category"
    | "missing_display_label"
    | "missing_rule_scope";
  detail: string;
}

/**
 * Build-time / CI check: every skill.config.ts id must have a matching
 * ## rule:|risk:|clause: section in SKILL.md (and vice versa for those prefixes).
 */
export function lintSkillParity(): SkillParityViolation[] {
  const violations: SkillParityViolation[] = [];
  const registry = getSkillRegistry();

  for (const skill of Object.values(registry)) {
    const mdPath = path.join(SKILLS_ROOT, skill.skillId, "SKILL.md");
    if (!existsSync(mdPath)) {
      violations.push({
        skillId: skill.skillId,
        kind: "missing_skill_md",
        detail: `Missing SKILL.md at ${mdPath}`,
      });
      continue;
    }

    const raw = readFileSync(mdPath, "utf8");
    const parsed = parseSkillMdContent(skill.skillId, raw);
    const mdKeys = new Set(Object.keys(parsed.sections));

    const expected = new Set<string>();
    for (const rule of skill.regimeRules) {
      expected.add(`rule:${rule.ruleId}`);
      if (!rule.findingCategory?.trim()) {
        violations.push({
          skillId: skill.skillId,
          kind: "missing_finding_category",
          detail: `regime rule ${rule.ruleId} has no findingCategory`,
        });
      }
      if (rule.ruleScope !== "per_clause" && rule.ruleScope !== "per_document") {
        violations.push({
          skillId: skill.skillId,
          kind: "missing_rule_scope",
          detail: `regime rule ${rule.ruleId} has no valid ruleScope`,
        });
      }
    }
    for (const rc of skill.riskCategories) {
      expected.add(`risk:${rc.category}`);
      if (!rc.displayLabel?.trim()) {
        violations.push({
          skillId: skill.skillId,
          kind: "missing_display_label",
          detail: `risk category ${rc.category} has no displayLabel`,
        });
      }
    }
    for (const ct of Object.keys(skill.clauseTypeDefinitions ?? {})) {
      expected.add(`clause:${ct}`);
    }
    // Also expect sections for expectedClauses clause types that have definitions
    for (const ec of skill.expectedClauses) {
      if (skill.clauseTypeDefinitions?.[ec.clauseType]) {
        expected.add(`clause:${ec.clauseType}`);
      }
    }

    for (const key of expected) {
      if (!mdKeys.has(key)) {
        violations.push({
          skillId: skill.skillId,
          kind: "missing_md_section",
          detail: `skill.config declares ${key} but SKILL.md has no matching ## section`,
        });
      }
    }

    for (const key of mdKeys) {
      if (!expected.has(key)) {
        // Orphans are allowed only when they are narrative extras — still flag for discipline
        violations.push({
          skillId: skill.skillId,
          kind: "orphan_md_section",
          detail: `SKILL.md has ## ${key} with no matching skill.config id`,
        });
      }
    }
  }

  return violations;
}

export function assertSkillParity(): void {
  const violations = lintSkillParity().filter((v) => v.kind !== "orphan_md_section");
  if (violations.length > 0) {
    const msg = violations.map((v) => `${v.skillId}: ${v.detail}`).join("\n");
    throw new Error(`Skill parity lint failed:\n${msg}`);
  }
}
