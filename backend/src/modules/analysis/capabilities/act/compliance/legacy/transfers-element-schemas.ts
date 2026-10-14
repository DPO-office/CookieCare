/**
 * International-transfers graded element schemas (Chapter V / SCC / Schrems).
 *
 * Each requirement is split into discrete legal limbs so Phase 5 can report
 * Partial when only one limb is met — matching the near-miss language in
 * `international-transfers` skill.config.ts `requirementEvidence` blocks.
 * Aliases include package-native ids (`transfer_mechanism_identification`,
 * `schrems_supplementary_measures`, …).
 *
 * NOT LEGALLY REVIEWED YET — `reviewStatus: "authored"`.
 *
 * Types are duplicated structurally (not imported) to avoid a circular
 * runtime import with `element-schemas.ts`, which merges this registry.
 */

type ElementKind = "mandatory" | "conditional" | "alternative";
type AggregationRule = "AND" | "OR" | "CHOICE" | "EXCEPTION" | "CONDITIONAL";

interface ElementSchema {
  elementId: string;
  proposition: string;
  kind: ElementKind;
  proofGuidance: string;
  nonProofTraps: string[];
  applicabilityRule?: string;
  remediationGuidance: string;
  version: string;
  distinctiveTokens?: string[];
  requiredTokenGroups?: string[][];
}

interface RequirementElementSchema {
  requirementUid: string;
  canonicalKey: string;
  legalCitation: string;
  title: string;
  aggregationRule: AggregationRule;
  elements: ElementSchema[];
  version: string;
  reviewStatus: "authored" | "legal_reviewed" | "auto_derived";
  aliases?: string[];
}

const ELEMENT_VERSION = "0.1.0";

export const TRANSFERS_ELEMENT_REGISTRY: RequirementElementSchema[] = [
  {
    requirementUid: "transfers.mechanism_identification",
    canonicalKey: "transfers.mechanism_identification",
    legalCitation:
      "GDPR Chapter V (Arts 44–49); Commission Implementing Decision (EU) 2021/914",
    title: "Lawful transfer mechanism identified",
    aggregationRule: "AND",
    aliases: [
      "transfer_mechanism_identification",
      "international_transfer_mechanism",
      "transfer_mechanism",
      "gdpr.chapter5.transfer_mechanism",
    ],
    elements: [
      {
        elementId: "TM1",
        proposition:
          "The agreement identifies the lawful transfer mechanism relied upon — Standard Contractual Clauses (SCCs), adequacy decision, Binding Corporate Rules (BCRs), or another Chapter V tool.",
        kind: "mandatory",
        proofGuidance:
          "Named mechanism — 'Standard Contractual Clauses', 'adequacy decision', 'BCR', or a specific derogation under Article 49. A generic 'international transfers permitted' statement without naming the tool is not enough.",
        nonProofTraps: [
          "A generic cross-border transfer permission with no named mechanism.",
          "A destination-country list with no lawful transfer tool identified.",
          "An unsigned or blank SCC annex presented as the completed mechanism.",
        ],
        remediationGuidance:
          "Identify the lawful transfer mechanism (SCCs, adequacy, BCR, or applicable derogation).",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "standard contractual clauses",
          "scc",
          "adequacy",
          "binding corporate rules",
          "bcr",
          "article 46",
          "article 45",
          "article 49",
        ],
      },
      {
        elementId: "TM2",
        proposition:
          "Where SCCs are claimed, the correct 2021 SCC module is selected and docking/accession mechanics are usable (modules, annexes, and party roles completed).",
        kind: "conditional",
        applicabilityRule:
          "Applies when the agreement relies on Standard Contractual Clauses (Decision (EU) 2021/914) as the transfer mechanism.",
        proofGuidance:
          "Module selection (1 C2C, 2 C2P, 3 P2P, 4 P2C) plus completed annexes and, where relevant, usable Clause 7 docking. An unsigned or unmoduled SCC annex is not full proof.",
        nonProofTraps: [
          "Referencing 'EU SCCs' with no module identified.",
          "An SCC annex template with blank module/annex fields.",
          "SCCs attached but party roles or annex particulars incomplete.",
        ],
        remediationGuidance:
          "Complete the SCC module selection, annexes, and docking mechanics for the claimed transfer relationship.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "module",
          "module one",
          "module two",
          "module three",
          "module four",
          "controller to processor",
          "processor to processor",
          "docking",
          "clause 7",
          "annex",
          "2021/914",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
  {
    requirementUid: "transfers.schrems_supplementary_measures",
    canonicalKey: "transfers.schrems_supplementary_measures",
    legalCitation:
      "EDPB Recommendations 01/2020 and 02/2020 (Schrems II follow-up)",
    title: "Transfer impact assessment and supplementary measures",
    aggregationRule: "AND",
    aliases: [
      "schrems_supplementary_measures",
      "transfers.tia_documented",
      "transfers.supplementary_measures",
      "schrems_ii",
    ],
    elements: [
      {
        elementId: "SM1",
        proposition:
          "A transfer impact assessment (TIA) of the destination country's law and practice is documented before relying on SCCs or another transfer tool.",
        kind: "mandatory",
        proofGuidance:
          "TIA / transfer impact assessment language — documenting assessment of destination law, government access, and whether the tool can be complied with in practice.",
        nonProofTraps: [
          "SCCs incorporated with no TIA or transfer-impact assessment mentioned.",
          "A generic Schrems reference with no documented assessment obligation.",
        ],
        remediationGuidance:
          "Document a transfer impact assessment of destination-country law and practice before relying on the transfer tool.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "transfer impact assessment",
          "tia",
          "impact assessment",
          "destination country",
          "government access",
          "schrems",
        ],
      },
      {
        elementId: "SM2",
        proposition:
          "Supplementary technical, contractual, or organisational measures are addressed where destination law or practice would otherwise prevent compliance with the transfer tool.",
        kind: "mandatory",
        proofGuidance:
          "Supplementary measures commitment — encryption, access controls, contractual safeguards, or organisational measures adopted where the TIA shows risk. SCCs alone are not self-sufficient where local law undermines them.",
        nonProofTraps: [
          "SCCs treated as self-sufficient with no supplementary-measures language.",
          "A TIA reference with no commitment to adopt measures where needed.",
        ],
        remediationGuidance:
          "Address supplementary measures where the TIA shows destination law prevents SCC compliance.",
        version: ELEMENT_VERSION,
        distinctiveTokens: [
          "supplementary measures",
          "supplementary technical",
          "supplementary contractual",
          "supplementary organisational",
          "additional safeguards",
          "schrems ii",
        ],
      },
    ],
    version: ELEMENT_VERSION,
    reviewStatus: "authored",
  },
];
