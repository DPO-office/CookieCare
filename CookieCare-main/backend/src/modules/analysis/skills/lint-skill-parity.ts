import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authoredCapabilityIds, getSkillRegistry } from "./registry.js";
import { parseSkillMdContent } from "./load-skill-md.js";

const SKILLS_ROOT = path.dirname(fileURLToPath(import.meta.url));

function requiresReportSections(packageId: string): boolean {
  if (packageId.endsWith(".structural_review")) return true;
  if (packageId.includes("art28")) return true;
  if (packageId.includes("transfer_inventory")) return true;
  if (packageId.startsWith("ccpa.sp.")) return true;
  return false;
}

export interface SkillParityViolation {
  skillId: string;
  kind:
    | "missing_md_section"
    | "orphan_md_section"
    | "missing_skill_md"
    | "missing_finding_category"
    | "missing_display_label"
    | "missing_rule_scope"
    | "unresolved_package_capability"
    | "missing_inventory_artifact_shape"
    | "missing_report_sections";
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

    // Authored analysis packages: evaluation capabilityIds must resolve to a
    // real rule / matrix-row / risk-category id on some registered skill.
    // Inventory packages may have empty capabilityIds.
    if (skill.evidencePackages?.length) {
      const registryCapabilities = new Set<string>();
      const knownPackageIds = new Set<string>();
      for (const other of Object.values(registry)) {
        for (const id of authoredCapabilityIds(other)) registryCapabilities.add(id);
        for (const pkg of other.evidencePackages ?? []) knownPackageIds.add(pkg.id);
      }
      for (const pkg of skill.evidencePackages) {
        const kind = pkg.kind ?? "evaluation";
        for (const dep of pkg.requiresPackages ?? []) {
          if (!knownPackageIds.has(dep)) {
            violations.push({
              skillId: skill.skillId,
              kind: "unresolved_package_capability",
              detail: `analysis package ${pkg.id} requiresPackages "${dep}" which is not an authored package id`,
            });
          }
        }
        if (kind === "inventory") {
          const outputType = pkg.outputArtifactType ?? "inventory";
          const shape = pkg.config?.artifactShape;
          const shapeOk =
            shape &&
            typeof shape === "object" &&
            (shape.kind === "records" ||
              (shape.kind === "typed_records" && typeof shape.recordType === "string"));
          if (outputType !== "inventory" && !shapeOk) {
            violations.push({
              skillId: skill.skillId,
              kind: "missing_inventory_artifact_shape",
              detail: `inventory package ${pkg.id} has outputArtifactType "${outputType}" but no config.artifactShape`,
            });
          }
        }
        if (kind === "inventory" && pkg.capabilityIds.length === 0) {
          if (
            requiresReportSections(pkg.id) &&
            (!pkg.report?.sections?.length && !pkg.report?.sectionsByDepth)
          ) {
            violations.push({
              skillId: skill.skillId,
              kind: "missing_report_sections",
              detail: `package ${pkg.id} requires report.sections but none were authored`,
            });
          }
          continue;
        }
        if (requiresReportSections(pkg.id)) {
          const hasSections =
            (pkg.report?.sections?.length ?? 0) > 0 ||
            Boolean(pkg.report?.sectionsByDepth && Object.keys(pkg.report.sectionsByDepth).length);
          if (!hasSections) {
            violations.push({
              skillId: skill.skillId,
              kind: "missing_report_sections",
              detail: `package ${pkg.id} requires report.sections but none were authored`,
            });
          }
        }
        for (const capId of pkg.capabilityIds) {
          if (!registryCapabilities.has(capId)) {
            violations.push({
              skillId: skill.skillId,
              kind: "unresolved_package_capability",
              detail: `evidence package ${pkg.id} references capability "${capId}" which is not an authored rule/matrix-row/risk-category id`,
            });
          }
        }
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
