import type { AnalysisSkillConfig, SkillRegimeRule } from "../../../types.js";

function rule(
  ruleId: string,
  label: string,
  ruleText: string,
  findingCategory: string,
  appliesToClauseTypes: string[],
  legalHook: string
): SkillRegimeRule {
  return {
    ruleId,
    label,
    ruleText,
    checkType: "judgment",
    findingCategory,
    ruleScope: "per_document",
    appliesToClauseTypes,
    legalHook,
  };
}

const RULES: SkillRegimeRule[] = [
  rule(
    "transfers.scc_module_selection",
    "Select the correct 2021 SCC module",
    "EU Standard Contractual Clauses (Decision (EU) 2021/914) must identify the applicable module (1 controller-to-controller, 2 controller-to-processor, 3 processor-to-processor, or 4 processor-to-controller). Do not treat an unsigned or unmoduled SCC annex as a completed transfer tool. This overlay does not re-state GDPR Articles 44–49.",
    "scc_module_gap",
    ["international_transfer_mechanism"],
    "Commission Implementing Decision (EU) 2021/914 — Modules One to Four."
  ),
  
  rule(
    "transfers.scc_docking",
    "Docking / accession mechanics for additional parties",
    "Where additional exporters or importers may join, the SCCs' docking clause should be usable without rewriting the clauses except to select modules or complete annexes.",
    "scc_docking_gap",
    ["international_transfer_mechanism"],
    "Decision (EU) 2021/914 — docking / Clause 7 mechanics."
  ),
  rule(
    "transfers.tia_documented",
    "Transfer impact assessment before relying on SCCs",
    "Before relying on SCCs for a restricted transfer, the exporter should document a transfer impact assessment of the destination country's law and practice, including whether the clauses can be complied with in practice.",
    "tia_missing",
    ["international_transfer_mechanism"],
    "EDPB Recommendations 01/2020 on measures that supplement transfer tools after Schrems II."
  ),
  rule(
    "transfers.supplementary_measures",
    "Supplementary measures where local law undermines SCCs",
    "If the TIA shows that destination-country law or practice prevents the importer from complying with the SCCs, the parties must adopt supplementary technical, contractual, or organisational measures, or not transfer. Do not treat SCCs as self-sufficient in that case.",
    "supplementary_measures_gap",
    ["international_transfer_mechanism"],
    "EDPB Recommendations 01/2020 and 02/2020 (Schrems II follow-up)."
  ),
];

export const internationalTransfersSkill: AnalysisSkillConfig = {
  skillId: "regimes/data-protection/international-transfers",
  axis: "regime",
  family: "data-protection",
  label: "EU SCCs / Schrems II operational overlay",
  version: "0.1.0",
  appliesToDocTypes: [],
  triggerPhrases: [
    "standard contractual clauses",
    "sccs",
    "scc module",
    "schrems",
    "transfer impact assessment",
    "supplementary measures",
    "2021/914",
  ],
  promptLibraryIds: ["sccs", "schrems", "international-transfers"],
  clauseTypes: ["international_transfer_mechanism"],
  clauseTypeDefinitions: {
    international_transfer_mechanism: "Mechanism for cross-border transfers (structural).",
  },
  expectedClauses: [
    {
      clauseType: "international_transfer_mechanism",
      severityIfMissing: "high",
      findingCategory: "scc_module_gap",
      textSynonyms: ["standard contractual clauses", "scc", "module"],
    },
  ],
  riskCategories: [
    {
      category: "scc_module_gap",
      displayLabel: "SCC module not selected",
      guidance: "EU SCCs are present without a selected module or completed annexes.",
    },
    {
      category: "scc_docking_gap",
      displayLabel: "SCC docking mechanics missing",
      guidance: "Additional parties cannot join the SCCs through the docking clause.",
    },
    {
      category: "tia_missing",
      displayLabel: "No transfer impact assessment",
      guidance: "SCCs are relied on without a documented transfer impact assessment.",
    },
    {
      category: "supplementary_measures_gap",
      displayLabel: "Missing Schrems II supplementary measures",
      guidance: "Destination-country law may undermine the SCCs and no supplementary measures are documented.",
    },
    {
      category: "other_known_risk",
      displayLabel: "Other material contractual risk",
      guidance: "Other material contractual risk.",
    },
  ],
  regimeRules: RULES,
  regimeRuleIds: RULES.map((r) => r.ruleId),
  instructionFocusMap: [
    {
      triggerPhrases: ["scc", "standard contractual clauses", "2021/914", "module"],
      focus: {
        ruleIds: ["transfers.scc_module_selection", "transfers.scc_docking"],
        riskCategoryIds: ["scc_module_gap", "scc_docking_gap"],
      },
    },
    {
      triggerPhrases: ["schrems", "tia", "transfer impact", "supplementary measures"],
      focus: {
        ruleIds: ["transfers.tia_documented", "transfers.supplementary_measures"],
        riskCategoryIds: ["tia_missing", "supplementary_measures_gap"],
      },
    },
  ],
  relatedChecks: [
    {
      primary: "international_transfer_mechanism",
      related: ["data_protection"],
      note: "This overlay operationalises SCCs and Schrems II; GDPR Chapter V (Arts 44–49) stays in the GDPR skill.",
    },
  ],
  defaultOperation: "compliance_check",
};
