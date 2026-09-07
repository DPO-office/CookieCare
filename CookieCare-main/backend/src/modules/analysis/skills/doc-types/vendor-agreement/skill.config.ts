import type { AnalysisSkillConfig, SkillRegimeRule } from "../../runtime/catalog/types.js";

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
    "vendor.freight_passthrough",
    "Freight and shipping passed through at cost",
    "Quotes should show freight/shipping as a line item. If charged, pass through at cost with no markup unless alternative shipping terms are expressly agreed.",
    "vendor_freight_markup",
    ["payment", "freight"],
    "TIPS Vendor Agreement — Freight."
  ),
  rule(
    "vendor.manufacturer_warranty",
    "Manufacturer's minimum standard warranty",
    "New supplies, equipment, and services should include the manufacturer's minimum standard warranty unless a different warranty is agreed in writing. Goods should be new unless clearly stated otherwise.",
    "vendor_warranty_gap",
    ["warranties"],
    "TIPS Vendor Agreement — Warranty Conditions."
  ),
  rule(
    "vendor.timely_support",
    "Timely and accurate customer support",
    "The vendor should provide timely and accurate customer support for orders, responding within a commercially reasonable time. If support is sold as a line item, the contracted support level applies.",
    "vendor_support_gap",
    ["customer_support"],
    "TIPS Vendor Agreement — Customer Support."
  ),
  rule(
    "vendor.po_parties",
    "Purchase orders bind vendor and customer, not the cooperative",
    "A purchase order or similar document processed through a cooperative purchasing vehicle is a contract between the customer and the vendor only. The cooperative is not a legal party to that order and is not responsible for identifying fraud or misrepresentation on the specific order.",
    "vendor_po_party_confusion",
    ["assignment"],
    "TIPS Vendor Agreement — Agreements / purchase-order parties."
  ),
  rule(
    "vendor.assignment_consent",
    "Assignment requires the counterparty's written agreement",
    "Flag silent or unilateral assignment of the vendor agreement. The TIPS source requires written agreement of both parties before assignment of the agreement.",
    "vendor_unilateral_assignment",
    ["assignment"],
    "TIPS Vendor Agreement — Assignments of Agreements."
  ),
];

export const vendorAgreementSkill: AnalysisSkillConfig = {
  skillId: "doc-types/vendor-agreement",
  axis: "doc-type",
  label: "Vendor / procurement agreement",
  version: "0.1.0",
  docTypeClassifiers: [
    {
      docTypeId: "vendor-agreement",
      priority: 75,
      patterns: [
        "\\bvendor agreement\\b",
        "\\bsupplier agreement\\b",
        "\\bprocurement\\b",
        "\\bthird.?party risk",
      ],
    },
    {
      docTypeId: "ai-vendor-agreement",
      priority: 70,
      patterns: ["\\bai system\\b", "\\bartificial intelligence\\b", "\\bautomated decision"],
    },
  ],
  extendsDocType: "doc-types/commercial-agreement",
  appliesToDocTypes: ["vendor-agreement"],
  triggerPhrases: [
    "vendor agreement",
    "supplier agreement",
    "procurement contract",
    "tips vendor",
    "cooperative purchasing",
  ],
  promptLibraryIds: ["vendor"],
  clauseTypes: ["freight", "warranties", "customer_support", "assignment", "payment"],
  clauseTypeDefinitions: {
    freight: "Shipping, delivery, and freight pass-through mechanics.",
    customer_support: "Order support, training, and response timing for the buying entity.",
    limitation_of_liability: "Cap or exclusion of liability between the parties.",
  },
  expectedClauses: [
    {
      clauseType: "warranties",
      severityIfMissing: "medium",
      findingCategory: "vendor_warranty_gap",
      textSynonyms: ["warranty", "manufacturer"],
    },
    {
      clauseType: "customer_support",
      severityIfMissing: "medium",
      findingCategory: "vendor_support_gap",
      textSynonyms: ["customer support", "support request"],
    },
  ],
  riskCategories: [
    {
      category: "vendor_freight_markup",
      displayLabel: "Freight markup on pass-through shipping",
      guidance: "Shipping or freight is marked up rather than passed through at cost.",
    },
    {
      category: "vendor_warranty_gap",
      displayLabel: "Missing manufacturer warranty",
      guidance: "No manufacturer minimum warranty, or used goods are not clearly disclosed.",
    },
    {
      category: "vendor_support_gap",
      displayLabel: "Missing vendor support commitment",
      guidance: "No timely customer-support commitment for orders.",
    },
    {
      category: "vendor_po_party_confusion",
      displayLabel: "Cooperative treated as a party to the PO",
      guidance: "The purchasing cooperative is treated as a party to the customer's purchase order.",
    },
    {
      category: "vendor_unilateral_assignment",
      displayLabel: "Unilateral vendor assignment",
      guidance: "The vendor may assign the agreement without written counterparty consent.",
    },
    {
      category: "other_known_risk",
      displayLabel: "Other material contractual risk",
      guidance: "Other material contractual risk.",
    },
  ],
  regimeRules: RULES,
  regimeRuleIds: RULES.map((r) => r.ruleId),
  evidencePackages: [
    {
      // "vendor.timely_support" deliberately excluded: its own ruleText
      // benchmark is "commercially reasonable time" with no numeric or
      // otherwise crisp anchor, so any proofStandard drafted for it would
      // just restate that vagueness as a hollow test rather than a real
      // one. Left on the judgment-only path.
      id: "vendor.structural_review",
      requirementIds: [
        "vendor.freight_passthrough",
        "vendor.manufacturer_warranty",
        "vendor.po_parties",
        "vendor.assignment_consent",
      ],
      capabilityIds: [
        "vendor.freight_passthrough",
        "vendor.manufacturer_warranty",
        "vendor.po_parties",
        "vendor.assignment_consent",
      ],
      clauseTypes: ["freight", "warranties", "assignment", "payment"],
      extractionTargets: ["freight_terms", "warranty_terms", "po_party_language", "assignment_clause"],
      requirementEvidence: {
        "vendor.freight_passthrough": {
          hypothesis:
            "Freight and shipping charges are passed through to the customer at cost, with no vendor markup, unless alternative shipping terms are expressly agreed.",
          evidenceHints: ["freight", "shipping", "at cost", "no markup", "pass-through"],
          proofStandard:
            "Proven only by text stating freight/shipping is charged at cost or " +
            "passed through with no markup (or is itemized as a distinct line item " +
            "tied to actual carrier cost). Contradicted by text permitting the " +
            "vendor to charge a marked-up or undefined shipping fee with no cost " +
            "linkage. Silence on freight/shipping pricing entirely is a gap, not " +
            "proof, unless the agreement expressly and clearly agrees alternative " +
            "shipping terms in writing (which satisfies the stated carve-out).",
        },
        "vendor.manufacturer_warranty": {
          hypothesis:
            "New supplies, equipment, and services carry the manufacturer's minimum standard warranty unless a different warranty is agreed in writing, and goods are represented as new unless clearly stated otherwise.",
          evidenceHints: ["manufacturer warranty", "standard warranty", "new goods", "as-is", "refurbished"],
          proofStandard:
            "Proven only by text stating that goods/equipment/services carry at least " +
            "the manufacturer's standard warranty, or an equivalent stated warranty " +
            "term, AND that goods are new unless the contract clearly discloses " +
            "otherwise (e.g. refurbished, used, or 'as-is'). A blanket 'as-is, no " +
            "warranty' disclaimer with no manufacturer-warranty pass-through, or " +
            "silence on whether goods are new, is a gap, not proof.",
        },
        "vendor.po_parties": {
          hypothesis:
            "A purchase order processed through the cooperative purchasing vehicle is a contract solely between the customer and the vendor; the cooperative is not a legal party to that order and is not responsible for fraud or misrepresentation on the specific order.",
          evidenceHints: ["purchase order", "cooperative", "not a party", "between customer and vendor"],
          proofStandard:
            "Proven only by text that expressly identifies the purchase order as a " +
            "contract between the customer and the vendor, with the cooperative " +
            "excluded as a party (e.g. 'purchase orders are agreements solely " +
            "between the ordering entity and the vendor'). Contradicted by text that " +
            "names the cooperative as a party, guarantor, or approver of individual " +
            "purchase orders, or that assigns the cooperative responsibility for " +
            "order-level fraud or misrepresentation. Silence on the cooperative's " +
            "role in individual orders is not proof either way.",
        },
        "vendor.assignment_consent": {
          hypothesis:
            "The agreement may not be assigned by either party without the other party's prior written consent.",
          evidenceHints: ["assignment", "written consent", "may not assign", "prior written agreement"],
          proofStandard:
            "Proven only by text requiring the WRITTEN CONSENT of the other party " +
            "before assignment of the agreement. Contradicted by text permitting " +
            "either party (particularly the vendor) to assign unilaterally, without " +
            "consent, or with only notice rather than consent. A consent requirement " +
            "that applies to only one party's assignment (e.g. vendor needs consent " +
            "but customer does not) is partial, not full proof of a mutual consent " +
            "requirement — note this distinction rather than treating it as full " +
            "proof.",
        },
      },
      sourceMode: "authored",
      packageVersion: "1.0.0",
      label: "Vendor agreement structural review",
      orchestration: {
        role: "structural_review",
        suppressWhenMatrixFocus: true,
      },
      report: {
        sections: ["executive_summary", "key_findings", "material_gaps", "recommendations", "conclusion"],
      },
    },
  ],
  instructionFocusMap: [
    {
      triggerPhrases: ["freight", "shipping", "markup"],
      focus: {
        ruleIds: ["vendor.freight_passthrough"],
        riskCategoryIds: ["vendor_freight_markup"],
      },
    },
    {
      triggerPhrases: ["warranty", "manufacturer"],
      focus: {
        ruleIds: ["vendor.manufacturer_warranty"],
        riskCategoryIds: ["vendor_warranty_gap"],
      },
    },
  ],
  defaultOperation: "risk_flag",
};
