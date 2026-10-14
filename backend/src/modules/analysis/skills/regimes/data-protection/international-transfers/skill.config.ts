import type { AnalysisSkillConfig, SkillRegimeRule } from "../../../runtime/catalog/types.js";
import { DEFAULT_TRANSFER_MECHANISM_ALIASES } from "../../../../models/transfer-inventory.js";
import { finalizeRegimeRuleContracts } from "../../../runtime/catalog/rule-contract-helpers.js";


const RULES: SkillRegimeRule[] = [
  {
    "ruleId": "transfers.scc_module_selection",
    "label": "Select the correct 2021 SCC module",
    "ruleText": "EU Standard Contractual Clauses (Decision (EU) 2021/914) must identify the applicable module (1 controller-to-controller, 2 controller-to-processor, 3 processor-to-processor, or 4 processor-to-controller). Do not treat an unsigned or unmoduled SCC annex as a completed transfer tool. This overlay does not re-state GDPR Articles 44–49.",
    "checkType": "judgment",
    "findingCategory": "scc_module_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "international_transfer_mechanism"
    ],
    "legalHook": "Commission Implementing Decision (EU) 2021/914 — Modules One to Four.",
    "authority": {
      "instrument": "EU SCCs (Decision 2021/914) / EDPB Schrems II guidance",
      "citation": "Commission Implementing Decision (EU) 2021/914 — Modules One to Four.",
      "provisionPath": [
        "transfers.scc_module_selection"
      ],
      "citationAliases": [
        "transfers.scc_module_selection",
        "Commission Implementing Decision (EU) 2021/914 — Modules One to Four."
      ]
    },
    "selection": {
      "aliases": [
        "select the correct 2021 scc module",
        "scc",
        "standard contractual clauses",
        "adequacy",
        "bcr"
      ],
      "concepts": [
        "select",
        "correct",
        "2021",
        "module",
        "standard",
        "contractual",
        "clauses",
        "decision",
        "identify",
        "applicable",
        "controller-to-controller",
        "controller-to-processor",
        "processor-to-processor",
        "processor-to-controller",
        "treat",
        "unsigned",
        "unmoduled",
        "annex",
        "completed",
        "transfer",
        "tool",
        "overlay",
        "re-state",
        "gdpr",
        "adequacy"
      ],
      "actors": [
        "processor",
        "controller"
      ],
      "actions": [
        "transfer"
      ],
      "objects": []
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "The agreement identifies the lawful transfer mechanism, including Standard Contractual Clauses (SCCs), adequacy, or Binding Corporate Rules.",
      "evidenceHints": [
        "SCC",
        "standard contractual clauses",
        "adequacy",
        "BCR"
      ],
      "proofStandard": "Proven only by text that substantively addresses: EU Standard Contractual Clauses (Decision (EU) 2021/914) must identify the applicable module (1 controller-to-controller, 2 controller-to-processor, 3 processor-to-processor, or 4 processor-to-controller). Do not treat an unsigned or unmoduled SCC annex as a completed transfer tool. This overlay does not re-state GDPR Articles 44–49.",
      "proofElements": [
        {
          "id": "scc_2021_914",
          "description": "The 2021 EU SCCs are the incorporated transfer tool",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "correct_module",
          "description": "The module matches the parties' controller/processor roles",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "completed_instrument",
          "description": "The selected SCCs and annexes are completed and operative",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "international_transfer_mechanism"
      ],
      "extractionTargets": [
        "transfer_mechanism",
        "adequacy",
        "scc",
        "bcr",
        "tia",
        "supplementary_measures"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": [
        "Non-proof distinction (not an additional obligation): A generic cross-border transfer permission with no named mechanism. A destination-country list with no lawful transfer tool identified. An unsigned or blank SCC annex presented as the completed mechanism.",
        "Non-proof distinction (not an additional obligation): Referencing 'EU SCCs' with no module identified. An SCC annex template with blank module/annex fields. SCCs attached but party roles or annex particulars incomplete."
      ]
    },
    "legacyRequirementId": "transfer_mechanism_identification"
  },
  {
    "ruleId": "transfers.scc_docking",
    "label": "Docking / accession mechanics for additional parties",
    "ruleText": "Where additional exporters or importers may join, the SCCs' docking clause should be usable without rewriting the clauses except to select modules or complete annexes.",
    "checkType": "judgment",
    "findingCategory": "scc_docking_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "international_transfer_mechanism"
    ],
    "legalHook": "Decision (EU) 2021/914 — docking / Clause 7 mechanics.",
    "authority": {
      "instrument": "EU SCCs (Decision 2021/914) / EDPB Schrems II guidance",
      "citation": "Decision (EU) 2021/914 — docking / Clause 7 mechanics.",
      "provisionPath": [
        "transfers.scc_docking"
      ],
      "citationAliases": [
        "transfers.scc_docking",
        "Decision (EU) 2021/914 — docking / Clause 7 mechanics."
      ]
    },
    "selection": {
      "aliases": [
        "docking / accession mechanics for additional parties",
        "scc",
        "standard contractual clauses",
        "adequacy",
        "bcr"
      ],
      "concepts": [
        "docking",
        "accession",
        "mechanics",
        "additional",
        "parties",
        "exporters",
        "importers",
        "join",
        "sccs",
        "clause",
        "should",
        "usable",
        "rewriting",
        "clauses",
        "except",
        "select",
        "modules",
        "complete",
        "annexes",
        "standard",
        "contractual",
        "adequacy"
      ],
      "actors": [
        "importer"
      ],
      "actions": [],
      "objects": []
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "The agreement identifies the lawful transfer mechanism, including Standard Contractual Clauses (SCCs), adequacy, or Binding Corporate Rules.",
      "evidenceHints": [
        "SCC",
        "standard contractual clauses",
        "adequacy",
        "BCR"
      ],
      "proofStandard": "Proven only by text that substantively addresses: Where additional exporters or importers may join, the SCCs' docking clause should be usable without rewriting the clauses except to select modules or complete annexes.",
      "proofElements": [
        {
          "id": "accession_mechanism",
          "description": "Additional exporters or importers can accede through the docking mechanism",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "clauses_preserved",
          "description": "Accession does not rewrite the SCCs beyond permitted module and annex completion",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "international_transfer_mechanism"
      ],
      "extractionTargets": [
        "transfer_mechanism",
        "adequacy",
        "scc",
        "bcr",
        "tia",
        "supplementary_measures"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": [
        "Non-proof distinction (not an additional obligation): A generic cross-border transfer permission with no named mechanism. A destination-country list with no lawful transfer tool identified. An unsigned or blank SCC annex presented as the completed mechanism.",
        "Non-proof distinction (not an additional obligation): Referencing 'EU SCCs' with no module identified. An SCC annex template with blank module/annex fields. SCCs attached but party roles or annex particulars incomplete."
      ]
    },
    "legacyRequirementId": "transfer_mechanism_identification"
  },
  {
    "ruleId": "transfers.tia_documented",
    "label": "Transfer impact assessment before relying on SCCs",
    "ruleText": "Before relying on SCCs for a restricted transfer, the exporter should document a transfer impact assessment of the destination country's law and practice, including whether the clauses can be complied with in practice.",
    "checkType": "judgment",
    "findingCategory": "tia_missing",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "international_transfer_mechanism"
    ],
    "legalHook": "EDPB Recommendations 01/2020 on measures that supplement transfer tools after Schrems II.",
    "authority": {
      "instrument": "EU SCCs (Decision 2021/914) / EDPB Schrems II guidance",
      "citation": "EDPB Recommendations 01/2020 on measures that supplement transfer tools after Schrems II.",
      "provisionPath": [
        "transfers.tia_documented"
      ],
      "citationAliases": [
        "transfers.tia_documented",
        "EDPB Recommendations 01/2020 on measures that supplement transfer tools after Schrems II."
      ]
    },
    "selection": {
      "aliases": [
        "transfer impact assessment before relying on sccs",
        "supplementary measures",
        "schrems",
        "transfer impact assessment",
        "tia"
      ],
      "concepts": [
        "transfer",
        "impact",
        "assessment",
        "relying",
        "sccs",
        "restricted",
        "exporter",
        "should",
        "document",
        "destination",
        "country",
        "practice",
        "whether",
        "clauses",
        "complied",
        "supplementary",
        "measures",
        "schrems"
      ],
      "actors": [],
      "actions": [
        "transfer",
        "restrict"
      ],
      "objects": []
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "The agreement addresses Schrems II supplementary measures and transfer impact assessments.",
      "evidenceHints": [
        "supplementary measures",
        "Schrems",
        "transfer impact assessment",
        "TIA"
      ],
      "proofStandard": "Proven only by text that substantively addresses: Before relying on SCCs for a restricted transfer, the exporter should document a transfer impact assessment of the destination country's law and practice, including whether the clauses can be complied with in practice.",
      "proofElements": [
        {
          "id": "pre_transfer_assessment",
          "description": "A transfer impact assessment is documented before reliance on the SCCs",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "law_and_practice",
          "description": "The assessment examines destination-country law and practice",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "practical_compliance",
          "description": "The assessment determines whether the SCCs can be complied with in practice",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "international_transfer_mechanism"
      ],
      "extractionTargets": [
        "transfer_mechanism",
        "adequacy",
        "scc",
        "bcr",
        "tia",
        "supplementary_measures"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": [
        "Non-proof distinction (not an additional obligation): SCCs incorporated with no TIA or transfer-impact assessment mentioned. A generic Schrems reference with no documented assessment obligation.",
        "Non-proof distinction (not an additional obligation): SCCs treated as self-sufficient with no supplementary-measures language. A TIA reference with no commitment to adopt measures where needed."
      ]
    },
    "legacyRequirementId": "schrems_supplementary_measures"
  },
  {
    "ruleId": "transfers.supplementary_measures",
    "label": "Supplementary measures where local law undermines SCCs",
    "ruleText": "If the TIA shows that destination-country law or practice prevents the importer from complying with the SCCs, the parties must adopt supplementary technical, contractual, or organisational measures, or not transfer. Do not treat SCCs as self-sufficient in that case.",
    "checkType": "judgment",
    "findingCategory": "supplementary_measures_gap",
    "ruleScope": "per_document",
    "appliesToClauseTypes": [
      "international_transfer_mechanism"
    ],
    "legalHook": "EDPB Recommendations 01/2020 and 02/2020 (Schrems II follow-up).",
    "authority": {
      "instrument": "EU SCCs (Decision 2021/914) / EDPB Schrems II guidance",
      "citation": "EDPB Recommendations 01/2020 and 02/2020 (Schrems II follow-up).",
      "provisionPath": [
        "transfers.supplementary_measures"
      ],
      "citationAliases": [
        "transfers.supplementary_measures",
        "EDPB Recommendations 01/2020 and 02/2020 (Schrems II follow-up)."
      ]
    },
    "selection": {
      "aliases": [
        "supplementary measures where local law undermines sccs",
        "supplementary measures",
        "schrems",
        "transfer impact assessment",
        "tia"
      ],
      "concepts": [
        "supplementary",
        "measures",
        "local",
        "undermines",
        "sccs",
        "shows",
        "destination-country",
        "practice",
        "prevents",
        "importer",
        "complying",
        "parties",
        "adopt",
        "technical",
        "contractual",
        "organisational",
        "transfer",
        "treat",
        "self-sufficient",
        "case",
        "schrems",
        "impact",
        "assessment"
      ],
      "actors": [
        "importer"
      ],
      "actions": [
        "transfer"
      ],
      "objects": []
    },
    "applicability": {
      "documentTypes": []
    },
    "investigation": {
      "hypothesis": "The agreement addresses Schrems II supplementary measures and transfer impact assessments.",
      "evidenceHints": [
        "supplementary measures",
        "Schrems",
        "transfer impact assessment",
        "TIA"
      ],
      "proofStandard": "Proven only by text that substantively addresses: If the TIA shows that destination-country law or practice prevents the importer from complying with the SCCs, the parties must adopt supplementary technical, contractual, or organisational measures, or not transfer. Do not treat SCCs as self-sufficient in that case.",
      "proofElements": [
        {
          "id": "adverse_tia_trigger",
          "description": "Supplementary action is triggered when the TIA identifies an SCC compliance impediment",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "effective_measures",
          "description": "Technical, contractual, or organisational supplementary measures address the impediment",
          "required": true,
          "kind": "mandatory"
        },
        {
          "id": "no_transfer_fallback",
          "description": "The transfer does not proceed where effective supplementary measures are unavailable",
          "required": true,
          "kind": "mandatory"
        }
      ],
      "clauseTypeHints": [
        "international_transfer_mechanism"
      ],
      "extractionTargets": [
        "transfer_mechanism",
        "adequacy",
        "scc",
        "bcr",
        "tia",
        "supplementary_measures"
      ]
    },
    "verification": {
      "version": "1.1.0",
      "reviewStatus": "authored",
      "guidance": [
        "Non-proof distinction (not an additional obligation): SCCs incorporated with no TIA or transfer-impact assessment mentioned. A generic Schrems reference with no documented assessment obligation.",
        "Non-proof distinction (not an additional obligation): SCCs treated as self-sufficient with no supplementary-measures language. A TIA reference with no commitment to adopt measures where needed."
      ]
    },
    "legacyRequirementId": "schrems_supplementary_measures"
  }
];

const internationalTransfersSkillConfig: AnalysisSkillConfig = {
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
    "international transfer",
    "international data transfer",
    "cross-border transfer",
    "third country",
    "adequacy decision",
    "binding corporate rules",
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
      textSynonyms: [
        "standard contractual clauses",
        "scc",
        "module",
        "international data transfer",
        "cross-border",
        "adequacy",
        "binding corporate rules",
        "uk addendum",
      ],
    },
  ],
  clauseRetrieval: {
    international_transfer_mechanism: {
      headings: [
        "International Data Transfers",
        "International Transfers",
        "Cross-Border Transfers",
        "Restricted Transfers",
        "Standard Contractual Clauses",
        "Adequacy",
        "UK Transfers",
      ],
      aliases: [
        "international transfer",
        "cross-border transfer",
        "third country",
        "standard contractual clauses",
        "scc",
        "binding corporate rules",
        "adequacy decision",
        "uk addendum",
        "schrems",
      ],
      anchorTerms: [
        "transfer",
        "adequacy",
        "scc",
        "bcr",
        "addendum",
        "supplementary measures",
        "third country",
      ],
    },
  },
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
      triggerPhrases: [
        "international transfer",
        "international data transfer",
        "cross-border",
        "third country",
        "adequacy",
        "binding corporate rules",
      ],
      focus: {
        ruleIds: [
          "gdpr.art44",
          "gdpr.art45.1",
          "gdpr.art46",
          "gdpr.art47",
          "gdpr.art48",
          "gdpr.art49",
        ],
        riskCategoryIds: ["transfer_mechanism_or_derogation_gap"],
      },
    },
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
  evidencePackages: [
    {
      id: "international_transfer_inventory",
      kind: "inventory",
      label: "International transfer inventory",
      description:
        "Find and structure every international data transfer provision, mechanism, destination, and cross-reference. Does not decide Chapter V compliance.",
      requirementIds: ["international_data_transfer", "transfer_inventory"],
      requirementKinds: ["extraction", "coverage"],
      semanticTopics: [
        "international_data_transfer",
        "cross_border_transfer",
        "third_country_transfer",
        "transfer_mechanism",
        "scc",
        "bcr",
        "adequacy",
        "schrems",
      ],
      capabilityIds: [],
      clauseTypes: ["international_transfer_mechanism"],
      extractionTargets: [
        "transfer_provision",
        "destination",
        "transfer_mechanism",
        "legal_basis",
        "supplementary_measures",
        "cross_reference",
      ],
      sourceMode: "authored",
      packageVersion: "1.0.0",
      outputArtifactType: "transfer_inventory",
      report: {
        reportType: "regime_compliance_memo",
        sections: [
          "executive_summary",
          "key_findings",
          "material_gaps",
          "recommendations",
          "conclusion",
        ],
        outlineExtras: [
          {
            heading: "International transfer provisions",
            sectionId: "key_findings",
            requirementTags: [
              "international_data_transfer",
              "transfer_inventory",
            ],
            artifactTypes: ["transfer_inventory"],
          },
        ],
      },
      config: {
        recordSchema: "transfer_inventory",
        mechanismAliases: DEFAULT_TRANSFER_MECHANISM_ALIASES,
        artifactShape: {
          kind: "typed_records",
          recordType: "TransferRecord",
          recordsKey: "transfers",
          mechanismAliases: DEFAULT_TRANSFER_MECHANISM_ALIASES,
          claimMechanismAggregate: "mechanisms",
          fieldSpec: [
            { name: "id", source: "_id" },
            { name: "evidenceIds", source: "_evidenceIds", defaultValue: [] },
            { name: "sectionIds", source: "_sectionIds" },
            { name: "sourceJurisdiction", source: "sourceJurisdiction" },
            { name: "destinationJurisdiction", source: "destinationJurisdiction" },
            { name: "mechanism", source: "mechanism", normalizeAliases: true },
            { name: "legalBasis", source: "legalBasis" },
            { name: "supplementaryMeasures", source: "supplementaryMeasures" },
            { name: "references", source: "references" },
            { name: "applicability", source: "applicability" },
            { name: "quotedText", source: "quotedText" },
          ],
          derivedAggregates: [
            { name: "mechanisms", from: "mechanism", unique: true, exclude: ["unspecified"] },
            {
              name: "jurisdictions",
              fromFields: ["sourceJurisdiction", "destinationJurisdiction"],
              unique: true,
            },
            { name: "referencedTransferDocuments", from: "references", unique: true, flatMap: true },
            { name: "unresolvedReferences", constant: [] },
          ],
          emptyClaim:
            "No international transfer provisions were identified in the retrieved sections.",
          presentClaim:
            "Identified {count} international transfer provision(s){mechanisms}.",
        },
      },
    },
    {
      id: "international_transfer_evaluation",
      kind: "evaluation",
      label: "International transfer evaluation",
      description:
        "Evaluate inventoried transfer records against GDPR Chapter V (Arts 44–49) and the SCC/Schrems overlay.",
      requirementIds: [
        "transfer_mechanism_identification",
        "schrems_supplementary_measures",
        "international_data_transfer",
      ],
      // Author the semantic ownership explicitly because this package has more
      // capabilities than native requirements. Without this map, request/native
      // binding has to guess from generated wording and must fail closed when
      // two transfer concepts score too closely.
      requirementBindings: {
        transfer_mechanism_identification: [
          "gdpr.art44",
          "gdpr.art45.1",
          "gdpr.art46",
          "gdpr.art47",
          "gdpr.art48",
          "gdpr.art49",
          "transfers.scc_module_selection",
          "transfers.scc_docking",
        ],
        schrems_supplementary_measures: [
          "transfers.tia_documented",
          "transfers.supplementary_measures",
        ],
        international_data_transfer: ["international_transfer_inventory"],
      },
      requirementEvidence: {},
      requirementKinds: ["verification", "adequacy"],
      semanticTopics: [
        "international_data_transfer",
        "cross_border_transfer",
        "third_country_transfer",
        "transfer_mechanism",
        "scc",
        "bcr",
        "adequacy",
        "schrems",
        "supplementary_measures",
      ],
      capabilityIds: [
        "gdpr.art44",
        "gdpr.art45.1",
        "gdpr.art46",
        "gdpr.art47",
        "gdpr.art48",
        "gdpr.art49",
        "transfers.scc_module_selection",
        "transfers.scc_docking",
        "transfers.tia_documented",
        "transfers.supplementary_measures",
      ],
      clauseTypes: ["international_transfer_mechanism"],
      extractionTargets: [
        "transfer_mechanism",
        "adequacy",
        "scc",
        "bcr",
        "tia",
        "supplementary_measures",
      ],
      sourceMode: "authored",
      packageVersion: "1.0.0",
      requiresPackages: ["international_transfer_inventory"],
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

export const internationalTransfersSkill = finalizeRegimeRuleContracts(
  internationalTransfersSkillConfig,
  {
    instrument: "EU SCCs (Decision 2021/914) / EDPB Schrems II guidance",
  }
);
