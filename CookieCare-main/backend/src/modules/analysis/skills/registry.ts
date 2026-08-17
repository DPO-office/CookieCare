import type {
  AnalysisSkillConfig,
  ExpectedClauseCheck,
  SkillAxis,
  SkillRiskCategory,
} from "./types.js";
import { globalSkill } from "./_global/skill.config.js";
import { dpaDocTypeSkill } from "./doc-types/dpa/skill.config.js";
import { ndaDocTypeSkill } from "./doc-types/nda/skill.config.js";
import { msaDocTypeSkill } from "./doc-types/msa/skill.config.js";
import { employmentAgreementSkill } from "./doc-types/employment-agreement/skill.config.js";
import { vendorAgreementSkill } from "./doc-types/vendor-agreement/skill.config.js";
import { saasAgreementSkill } from "./doc-types/saas-agreement/skill.config.js";
import { commercialAgreementSkill } from "./doc-types/commercial-agreement/skill.config.js";
import { gdprRegimeSkill } from "./regimes/data-protection/gdpr/skill.config.js";
import { ukGdprIdtaSkill } from "./regimes/data-protection/uk-gdpr-idta/skill.config.js";
import { ccpaCpraSkill } from "./regimes/data-protection/ccpa-cpra/skill.config.js";
import { internationalTransfersSkill } from "./regimes/data-protection/international-transfers/skill.config.js";
import { euAiActSkill } from "./regimes/ai-governance/eu-ai-act/skill.config.js";
import { hipaaBaaSkill } from "./regimes/healthcare/hipaa-baa/skill.config.js";
import { cybersecurityIncidentSkill } from "./topics/cybersecurity-and-incident-response/skill.config.js";
import { vendorRiskDiligenceSkill } from "./topics/vendor-risk-and-diligence/skill.config.js";
import { delawareJurisdictionSkill } from "./jurisdictions/delaware/skill.config.js";
import { englandWalesJurisdictionSkill } from "./jurisdictions/england-wales/skill.config.js";
import { irelandJurisdictionSkill } from "./jurisdictions/ireland/skill.config.js";
import { californiaJurisdictionSkill } from "./jurisdictions/california/skill.config.js";
import { CLAUSE_TAXONOMY, CLAUSE_TAXONOMY_VERSION } from "../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY, RISK_TAXONOMY_VERSION } from "../taxonomies/index.js";

/** Legacy ids → current path-style ids (lookups only). */
const SKILL_ID_ALIASES: Record<string, string> = {
  "general-review": "_global",
  commercial: "doc-types/commercial-agreement",
  "privacy-gdpr-dpa": "regimes/data-protection/gdpr",
  privacy: "regimes/data-protection/gdpr",
  gdpr: "regimes/data-protection/gdpr",
  dpa: "doc-types/dpa",
  saas: "doc-types/saas-agreement",
  nda: "doc-types/nda",
  msa: "doc-types/msa",
  employment: "doc-types/employment-agreement",
  vendor: "doc-types/vendor-agreement",
  "uk-gdpr": "regimes/data-protection/uk-gdpr-idta",
  idta: "regimes/data-protection/uk-gdpr-idta",
  ccpa: "regimes/data-protection/ccpa-cpra",
  cpra: "regimes/data-protection/ccpa-cpra",
  sccs: "regimes/data-protection/international-transfers",
  hipaa: "regimes/healthcare/hipaa-baa",
  "ai-act": "regimes/ai-governance/eu-ai-act",
  england: "jurisdictions/england-wales",
  uk: "jurisdictions/england-wales",
  "united kingdom": "jurisdictions/england-wales",
};

/** Specific doc-types before commercial so first-match selection does not collapse into the commercial pack. */
const ALL_SKILLS: AnalysisSkillConfig[] = [
  globalSkill,
  dpaDocTypeSkill,
  ndaDocTypeSkill,
  msaDocTypeSkill,
  employmentAgreementSkill,
  vendorAgreementSkill,
  saasAgreementSkill,
  commercialAgreementSkill,
  gdprRegimeSkill,
  ukGdprIdtaSkill,
  ccpaCpraSkill,
  internationalTransfersSkill,
  euAiActSkill,
  hipaaBaaSkill,
  cybersecurityIncidentSkill,
  vendorRiskDiligenceSkill,
  delawareJurisdictionSkill,
  englandWalesJurisdictionSkill,
  irelandJurisdictionSkill,
  californiaJurisdictionSkill,
];

export interface RuntimeTaxonomies {
  clauseTypes: string[];
  riskCategories: string[];
  clauseTaxonomyVersion: string;
  riskTaxonomyVersion: string;
}

export interface SkillRegistryApi {
  get(skillId: string): AnalysisSkillConfig | undefined;
  getByAxis(axis: SkillAxis): AnalysisSkillConfig[];
  all(): AnalysisSkillConfig[];
}

function canonicalizeId(skillId: string): string {
  const id = skillId.trim();
  return SKILL_ID_ALIASES[id.toLowerCase()] ?? id;
}

function mergeExpectedClauseLists(
  base: ExpectedClauseCheck[],
  overlay: ExpectedClauseCheck[]
): ExpectedClauseCheck[] {
  const byType = new Map<string, ExpectedClauseCheck>();
  for (const ec of base) byType.set(ec.clauseType, ec);
  for (const ec of overlay) byType.set(ec.clauseType, ec); // overlay wins
  return [...byType.values()];
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function dedupeRiskCategories(values: SkillRiskCategory[]): SkillRiskCategory[] {
  const byCat = new Map<string, SkillRiskCategory>();
  for (const rc of values) {
    if (!byCat.has(rc.category)) byCat.set(rc.category, rc);
  }
  return [...byCat.values()];
}

/**
 * Resolve doc-type inheritance chains. Recursive; cycles rejected at registry load.
 */
export function resolveDocTypeSkill(
  skillId: string,
  registry: Record<string, AnalysisSkillConfig> = getSkillRegistry()
): AnalysisSkillConfig {
  const seen = new Set<string>();
  const walk = (id: string): AnalysisSkillConfig => {
    const canon = canonicalizeId(id);
    if (seen.has(canon)) {
      throw new Error(`Doc-type inheritance cycle involving "${canon}"`);
    }
    seen.add(canon);
    const skill = registry[canon];
    if (!skill) {
      throw new Error(`Unknown skill "${id}" (canonical "${canon}")`);
    }
    if (!skill.extendsDocType) return skill;
    const base = walk(skill.extendsDocType);
    return {
      ...skill,
      clauseTypes: dedupeStrings([...base.clauseTypes, ...skill.clauseTypes]),
      clauseTypeDefinitions: {
        ...(base.clauseTypeDefinitions ?? {}),
        ...(skill.clauseTypeDefinitions ?? {}),
      },
      expectedClauses: mergeExpectedClauseLists(base.expectedClauses, skill.expectedClauses),
      riskCategories: dedupeRiskCategories([...base.riskCategories, ...skill.riskCategories]),
      relatedChecks: [...(base.relatedChecks ?? []), ...(skill.relatedChecks ?? [])],
      comparativeChecks: [
        ...(base.comparativeChecks ?? []),
        ...(skill.comparativeChecks ?? []),
      ],
    };
  };
  return walk(skillId);
}

function validateRegistry(skills: AnalysisSkillConfig[]): void {
  const byId = new Map(skills.map((s) => [s.skillId, s]));
  const clauseTypeDefs = new Map<string, { skillId: string; definition: string }>();
  const riskDefs = new Map<
    string,
    { skillId: string; displayLabel: string; guidance: string }
  >();

  for (const skill of skills) {
    if (skill.extendsDocType) {
      if (skill.axis !== "doc-type") {
        throw new Error(
          `Skill "${skill.skillId}" declares extendsDocType but axis is "${skill.axis}"`
        );
      }
      const baseId = canonicalizeId(skill.extendsDocType);
      if (!byId.has(baseId)) {
        throw new Error(
          `Skill "${skill.skillId}" extendsDocType "${skill.extendsDocType}" does not resolve`
        );
      }
      if (byId.get(baseId)!.axis !== "doc-type") {
        throw new Error(
          `Skill "${skill.skillId}" extendsDocType must reference a doc-type skill`
        );
      }
    }

    if (skill.family && skill.axis !== "regime") {
      throw new Error(`Skill "${skill.skillId}" declares family but axis is "${skill.axis}"`);
    }

    for (const ct of skill.clauseTypes) {
      const def = skill.clauseTypeDefinitions?.[ct] ?? "";
      const existing = clauseTypeDefs.get(ct);
      if (existing && existing.definition && def && existing.definition !== def) {
        throw new Error(
          `Clause type "${ct}" defined differently in ${existing.skillId} and ${skill.skillId}`
        );
      }
      if (def || !existing) {
        clauseTypeDefs.set(ct, {
          skillId: skill.skillId,
          definition: def || existing?.definition || "",
        });
      }
    }

    for (const rc of skill.riskCategories) {
      if (!rc.displayLabel?.trim()) {
        throw new Error(
          `Skill "${skill.skillId}" risk category "${rc.category}" has no displayLabel`
        );
      }
      const existing = riskDefs.get(rc.category);
      if (
        existing &&
        (existing.guidance !== rc.guidance || existing.displayLabel !== rc.displayLabel)
      ) {
        throw new Error(
          `Skill registry conflict: risk category "${rc.category}" defined differently in ` +
            `${existing.skillId} vs ${skill.skillId}`
        );
      }
      riskDefs.set(rc.category, {
        skillId: skill.skillId,
        displayLabel: rc.displayLabel,
        guidance: rc.guidance,
      });
    }

    for (const rule of skill.regimeRules) {
      if (!rule.findingCategory?.trim()) {
        throw new Error(
          `Skill "${skill.skillId}" rule "${rule.ruleId}" has no findingCategory`
        );
      }
      if (rule.ruleScope !== "per_clause" && rule.ruleScope !== "per_document") {
        throw new Error(
          `Skill "${skill.skillId}" rule "${rule.ruleId}" has invalid ruleScope`
        );
      }
    }
  }

  // Cycle check for all extendsDocType chains
  for (const skill of skills) {
    if (skill.extendsDocType) {
      resolveDocTypeSkill(
        skill.skillId,
        Object.fromEntries(skills.map((s) => [s.skillId, s]))
      );
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
    for (const rule of skill.regimeRules) riskSet.add(rule.findingCategory);
  }

  return {
    clauseTypes: [...clauseSet],
    riskCategories: [...riskSet],
    clauseTaxonomyVersion: CLAUSE_TAXONOMY_VERSION,
    riskTaxonomyVersion: RISK_TAXONOMY_VERSION,
  };
}

let _registry: Record<string, AnalysisSkillConfig> | null = null;
let _runtimeTaxonomies: RuntimeTaxonomies | null = null;

export function loadAllSkillConfigs(): Record<string, AnalysisSkillConfig> {
  if (_registry) return _registry;

  validateRegistry(ALL_SKILLS);
  _registry = Object.fromEntries(ALL_SKILLS.map((s) => [s.skillId, s]));
  _runtimeTaxonomies = buildRuntimeTaxonomies(ALL_SKILLS);
  return _registry;
}

export function getSkillRegistry(): Record<string, AnalysisSkillConfig> {
  return loadAllSkillConfigs();
}

export function getRegistryApi(): SkillRegistryApi {
  const registry = getSkillRegistry();
  return {
    get: (skillId) => registry[canonicalizeId(skillId)],
    getByAxis: (axis) => Object.values(registry).filter((s) => s.axis === axis),
    all: () => Object.values(registry),
  };
}

export function getRuntimeTaxonomies(): RuntimeTaxonomies {
  loadAllSkillConfigs();
  return _runtimeTaxonomies!;
}

export function getSkillById(skillId: string): AnalysisSkillConfig | undefined {
  return getSkillRegistry()[canonicalizeId(skillId)];
}

export function findSkillByPromptId(promptLibraryId: string): AnalysisSkillConfig | undefined {
  const id = promptLibraryId.trim().toLowerCase();
  const registry = getSkillRegistry();

  const aliased = SKILL_ID_ALIASES[id];
  if (aliased && registry[aliased]) return registry[aliased];
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
  const fromRules: SkillRiskCategory[] = skills.flatMap((s) =>
    s.regimeRules.map((rule) => ({
      category: rule.findingCategory,
      displayLabel: rule.label ?? humanizeCategory(rule.findingCategory),
      guidance: `Authored compliance category for ${rule.ruleId}.`,
    }))
  );
  return dedupeRiskCategories([
    ...skills.flatMap((s) => s.riskCategories),
    ...fromRules,
  ]);
}

function humanizeCategory(category: string): string {
  return category
    .replace(/^gdpr\.art[\w.-]+\./, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function mergeExpectedClauses(skills: AnalysisSkillConfig[]) {
  const byType = new Map<string, ExpectedClauseCheck>();
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

/** True if any skill declares this regime rule id. */
export function hasRegimeRule(ruleId: string): boolean {
  const id = ruleId.trim().toLowerCase();
  if (!id) return false;
  for (const skill of Object.values(getSkillRegistry())) {
    if (skill.skillId.toLowerCase() === id) return true;
    if (skill.skillId.toLowerCase().endsWith(`/${id}`)) return true;
    // "gdpr.art28" is authored as gdpr.art28.1, gdpr.art28.3.a, … Treating the
    // article prefix as unresolved fired a pointless Tier C web lookup.
    if (
      skill.regimeRules.some(
        (r) =>
          r.ruleId.toLowerCase() === id ||
          r.ruleId.toLowerCase().startsWith(`${id}.`)
      )
    )
      return true;
    if (skill.promptLibraryIds.some((p) => p.toLowerCase() === id)) return true;
  }
  return false;
}

/** Playbook rules are not yet registered in Analysis — always false until packs land. */
export function hasPlaybookRule(_ruleId: string): boolean {
  return false;
}

/** Reset for tests only. */
export function resetSkillRegistryForTests(): void {
  _registry = null;
  _runtimeTaxonomies = null;
}
