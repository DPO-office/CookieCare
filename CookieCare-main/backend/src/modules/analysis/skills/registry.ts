import { generalReviewSkill } from "./general-review/skill.config.js";
import { commercialSkill } from "./commercial/skill.config.js";
import { privacyGdprDpaSkill } from "./privacy-gdpr-dpa/skill.config.js";
import type { AnalysisSkillConfig, SkillRiskCategory } from "./types.js";
import { CLAUSE_TAXONOMY } from "../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY } from "../taxonomies/index.js";

const ALL_SKILLS: AnalysisSkillConfig[] = [
  generalReviewSkill,
  commercialSkill,
  privacyGdprDpaSkill,
];

export interface RuntimeTaxonomies {
  clauseTypes: string[];
  riskCategories: string[];
  clauseTaxonomyVersion: string;
  riskTaxonomyVersion: string;
}

function validateNoConflicts(skills: AnalysisSkillConfig[]): void {
  const riskDefs = new Map<string, { skillId: string; guidance: string }>();

  for (const skill of skills) {
    for (const rc of skill.riskCategories) {
      const existing = riskDefs.get(rc.category);
      if (existing && existing.guidance !== rc.guidance) {
        throw new Error(
          `Skill registry conflict: risk category "${rc.category}" defined differently in ` +
            `${existing.skillId} vs ${skill.skillId}`
        );
      }
      riskDefs.set(rc.category, { skillId: skill.skillId, guidance: rc.guidance });
    }
  }
}

export function buildRuntimeTaxonomies(skills: AnalysisSkillConfig[]): RuntimeTaxonomies {
  const clauseSet = new Set<string>(CLAUSE_TAXONOMY);
  const riskSet = new Set<string>(RISK_TAXONOMY);

  for (const skill of skills) {
    for (const ct of skill.clauseTypes) clauseSet.add(ct);
    for (const rc of skill.riskCategories) riskSet.add(rc.category);
    for (const ec of skill.expectedClauses) riskSet.add(ec.findingCategory);
  }

  return {
    clauseTypes: [...clauseSet],
    riskCategories: [...riskSet],
    clauseTaxonomyVersion: "1.0.0",
    riskTaxonomyVersion: "1.0.0",
  };
}

let _registry: Record<string, AnalysisSkillConfig> | null = null;
let _runtimeTaxonomies: RuntimeTaxonomies | null = null;

export function loadAllSkillConfigs(): Record<string, AnalysisSkillConfig> {
  if (_registry) return _registry;

  validateNoConflicts(ALL_SKILLS);
  _registry = Object.fromEntries(ALL_SKILLS.map((s) => [s.skillId, s]));
  _runtimeTaxonomies = buildRuntimeTaxonomies(ALL_SKILLS);
  return _registry;
}

export function getSkillRegistry(): Record<string, AnalysisSkillConfig> {
  return loadAllSkillConfigs();
}

export function getRuntimeTaxonomies(): RuntimeTaxonomies {
  loadAllSkillConfigs();
  return _runtimeTaxonomies!;
}

export function getSkillById(skillId: string): AnalysisSkillConfig | undefined {
  return getSkillRegistry()[skillId];
}

export function findSkillByPromptId(promptLibraryId: string): AnalysisSkillConfig | undefined {
  const id = promptLibraryId.trim().toLowerCase();
  const registry = getSkillRegistry();

  if (registry[id]) return registry[id];

  for (const skill of Object.values(registry)) {
    if (skill.skillId === id) return skill;
    if (skill.promptLibraryIds.some((p) => p.toLowerCase() === id)) return skill;
  }
  return undefined;
}

export function mergeSkillClauseTypes(skills: AnalysisSkillConfig[]): string[] {
  const set = new Set<string>();
  for (const s of skills) {
    for (const ct of s.clauseTypes) set.add(ct);
  }
  return [...set];
}

export function mergeSkillRiskCategories(skills: AnalysisSkillConfig[]): SkillRiskCategory[] {
  const byCat = new Map<string, SkillRiskCategory>();
  for (const s of skills) {
    for (const rc of s.riskCategories) {
      if (!byCat.has(rc.category)) byCat.set(rc.category, rc);
    }
  }
  return [...byCat.values()];
}

export function mergeExpectedClauses(skills: AnalysisSkillConfig[]) {
  const byType = new Map<string, (typeof skills)[0]["expectedClauses"][0]>();
  for (const s of skills) {
    for (const ec of s.expectedClauses) {
      if (!byType.has(ec.clauseType)) byType.set(ec.clauseType, ec);
    }
  }
  return [...byType.values()];
}

export function mergeRegimeRules(skills: AnalysisSkillConfig[]) {
  const byId = new Map<string, (typeof skills)[0]["regimeRules"][0]>();
  for (const s of skills) {
    for (const rule of s.regimeRules) {
      if (!byId.has(rule.ruleId)) byId.set(rule.ruleId, rule);
    }
  }
  return [...byId.values()];
}

export function isKnownRiskCategory(value: string): boolean {
  if ((RISK_TAXONOMY as readonly string[]).includes(value)) return true;
  return getRuntimeTaxonomies().riskCategories.includes(value);
}

/** Reset for tests only. */
export function resetSkillRegistryForTests(): void {
  _registry = null;
  _runtimeTaxonomies = null;
}
