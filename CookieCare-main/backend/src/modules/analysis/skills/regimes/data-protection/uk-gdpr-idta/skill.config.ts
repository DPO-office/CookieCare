import type {
  AnalysisSkillConfig,
  RegimeCheckType,
  SkillRegimeRule,
} from "../../../types.js";
import { buildDataProtectionRightsMatrix } from "../_family-template.js";

function rule(
  ruleId: string,
  label: string,
  ruleText: string,
  findingCategory: string,
  appliesToClauseTypes: string[],
  legalHook: string,
  ruleScope: "per_clause" | "per_document" = "per_document",
  checkType: RegimeCheckType = "judgment"
): SkillRegimeRule {
  return {
    ruleId,
    label,
    ruleText,
    checkType,
    findingCategory,
    ruleScope,
    appliesToClauseTypes,
    legalHook,
  };
}

const RULES: SkillRegimeRule[] = [
  rule(
    "ukgdpr.idta_or_addendum",
    "UK restricted transfers need IDTA or UK Addendum",
    "Where UK GDPR restricted transfers apply, the contract must address the UK International Data Transfer Agreement or the UK Addendum to the EU SCCs. Do not treat EU SCCs alone as a completed UK transfer tool.",
    "uk_idta_missing",
    ["international_transfer_mechanism"],
    "UK GDPR Chapter V as retained; ICO IDTA / UK Addendum. Drafting pack: UK IDTA/Addendum must be addressed when UK transfers apply."
  ),
  rule(
    "ukgdpr.art27_uk_representative",
    "UK representative for non-UK controllers/processors",
    "A controller or processor not established in the UK that falls within UK GDPR extra-territorial processing should designate a UK representative in writing, distinct from any EU Article 27 representative.",
    "uk_representative_gap",
    ["data_protection"],
    "UK GDPR Article 27 (representative in the United Kingdom)."
  ),
  rule(
    "ukgdpr.ico_as_authority",
    "ICO is the UK supervisory authority path",
    "UK GDPR documents should point complaints, DPO contacts, and breach notification to the Information Commissioner, not only to an EU lead supervisory authority or the EDPB.",
    "uk_ico_authority_gap",
    ["data_protection"],
    "Data Protection Act 2018; UK GDPR references to the Commissioner."
  ),
  rule(
    "ukgdpr.art46_uk_mechanism",
    "UK Article 46 transfer tool must be a UK-recognised safeguard",
    "Appropriate safeguards for UK restricted transfers are the UK-recognised tools (IDTA, UK Addendum, UK-approved BCRs, or another UK Chapter V mechanism). An unmodified EU SCC pack without the UK Addendum is incomplete for UK transfers.",
    "uk_transfer_safeguard_gap",
    ["international_transfer_mechanism"],
    "UK GDPR Articles 44–46; ICO transfer tools."
  ),
];

const RIGHTS_MATRIX = buildDataProtectionRightsMatrix("uk-gdpr", [
  { rowId: "ukgdpr.right.access", localArticleOrSection: "15", label: "Access and copy (UK GDPR)" },
  {
    rowId: "ukgdpr.right.rectification",
    localArticleOrSection: "16",
    label: "Rectification (UK GDPR)",
  },
  { rowId: "ukgdpr.right.erasure", localArticleOrSection: "17", label: "Erasure (UK GDPR)" },
  {
    rowId: "ukgdpr.right.restriction",
    localArticleOrSection: "18",
    label: "Restriction (UK GDPR)",
  },
  {
    rowId: "ukgdpr.right.portability",
    localArticleOrSection: "20",
    label: "Portability (UK GDPR)",
  },
  { rowId: "ukgdpr.right.object", localArticleOrSection: "21", label: "Objection (UK GDPR)" },
]);

export const ukGdprIdtaSkill: AnalysisSkillConfig = {
  skillId: "regimes/data-protection/uk-gdpr-idta",
  axis: "regime",
  family: "data-protection",
  label: "UK GDPR / IDTA",
  version: "0.1.0",
  appliesToDocTypes: [],
  appliesToJurisdictions: ["england-wales"],
  triggerPhrases: [
    "uk gdpr",
    "uk-gdpr",
    "idta",
    "uk addendum",
    "uk international data transfer",
    "dpa 2018",
    "information commissioner",
  ],
  promptLibraryIds: ["uk-gdpr", "idta", "uk-gdpr-idta"],
  clauseTypes: ["data_protection", "international_transfer_mechanism"],
  clauseTypeDefinitions: {
    data_protection: "Core processing subject-matter, roles, and processor obligations annex.",
    international_transfer_mechanism: "Mechanism for cross-border transfers (structural).",
  },
  expectedClauses: [
    {
      clauseType: "international_transfer_mechanism",
      severityIfMissing: "high",
      findingCategory: "uk_idta_missing",
      textSynonyms: ["idta", "uk addendum", "international data transfer"],
    },
  ],
  riskCategories: [
    {
      category: "uk_idta_missing",
      displayLabel: "UK IDTA or Addendum not addressed",
      guidance: "UK restricted transfers are not tied to the IDTA or UK Addendum.",
    },
    {
      category: "uk_representative_gap",
      displayLabel: "Missing UK GDPR representative",
      guidance: "No UK representative is designated where UK extra-territorial processing applies.",
    },
    {
      category: "uk_ico_authority_gap",
      displayLabel: "No ICO / Commissioner path",
      guidance: "The document points only to an EU authority and omits the Information Commissioner.",
    },
    {
      category: "uk_transfer_safeguard_gap",
      displayLabel: "EU SCCs used without UK Addendum",
      guidance: "UK transfers rely on unmodified EU SCCs without a UK-recognised safeguard.",
    },
    {
      category: "other_known_risk",
      displayLabel: "Other material contractual risk",
      guidance: "Other material contractual risk.",
    },
  ],
  regimeRules: RULES,
  regimeRuleIds: RULES.map((r) => r.ruleId),
  rightsMatrixRows: RIGHTS_MATRIX,
  instructionFocusMap: [
    {
      triggerPhrases: ["idta", "uk addendum", "uk international data transfer"],
      focus: {
        ruleIds: ["ukgdpr.idta_or_addendum", "ukgdpr.art46_uk_mechanism"],
        riskCategoryIds: ["uk_idta_missing", "uk_transfer_safeguard_gap"],
      },
    },
    {
      triggerPhrases: ["uk representative", "article 27"],
      focus: {
        ruleIds: ["ukgdpr.art27_uk_representative"],
        riskCategoryIds: ["uk_representative_gap"],
      },
    },
  ],
  relatedChecks: [
    {
      primary: "international_transfer_mechanism",
      related: ["data_protection"],
      note: "UK IDTA review does not replace EU GDPR Chapter V; run the EU GDPR pack for EU restricted transfers.",
    },
  ],
  defaultOperation: "compliance_check",
};
