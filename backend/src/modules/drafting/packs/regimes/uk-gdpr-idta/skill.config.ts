import type { DraftingSkillConfig } from "../../skill-contract.js";

/**
 * UK GDPR / IDTA transfer overlays.
 * Adds IDTA exhibit when transfer mechanism or governing law warrants it.
 */
export const ukGdprIdtaSkillConfig: DraftingSkillConfig = {
  skillId: "regimes/uk-gdpr-idta",
  axis: "regime",
  label: "UK GDPR / IDTA Transfers",
  version: "1.0.0",
  appliesToDocTypes: ["dpa"],
  conditionalWorkUnits: [
    {
      id: "exhibit-idta",
      when: (facts) => {
        const mech = String(
          facts.transferMechanism || facts.sccModule || ""
        ).toLowerCase();
        const ukFlag = facts.ukIdta === true;
        return ukFlag || mech.includes("idta") || mech.includes("uk addendum");
      },
      workUnit: {
        id: "exhibit-idta",
        kind: "exhibit",
        heading: "UK International Data Transfer Agreement / Addendum",
        dependsOn: ["sec-transfers"],
        clauseTypes: ["idta", "transfers"],
        status: "pending",
      },
    },
  ],
  exhibitBriefs: [
    {
      workUnitId: "exhibit-idta",
      title: "UK IDTA / Addendum",
      purpose: "Attach UK IDTA or UK Addendum when UK transfers apply.",
      requiredContent: [
        "Identify UK IDTA or UK Addendum to EU SCCs as applicable",
        "Align exporter/importer with deal identity parties",
      ],
      requiredFacts: ["transferMechanism", "parties"],
      relatedSections: ["sec-transfers"],
    },
  ],
  exhibitSpecs: [
    {
      id: "exhibit-idta",
      title: "UK International Data Transfer Agreement / Addendum",
      kind: "idta",
      requiresFullText: true,
      parentSectionId: "sec-transfers",
      sourceFile: "uk-idta.md",
    },
  ],
  sectionBriefs: [
    {
      workUnitId: "sec-transfers",
      title: "International Transfers (UK)",
      purpose: "Ensure UK transfer tool is named when UK transfers apply.",
      requiredContent: [
        "Name UK IDTA or UK Addendum when selected as transfer mechanism",
        "Cross-reference transfer exhibit",
      ],
      requiredFacts: ["transferMechanism"],
      requiredLegalElements: ["UK transfer mechanism"],
      relatedExhibits: ["exhibit-idta"],
    },
  ],
  validationRules: [
    {
      id: "uk-idta-exhibit-when-selected",
      requirement: "IDTA exhibit required when transfer mechanism is UK IDTA",
      severity: "critical",
      checkKind: "conditional_exhibit",
      sectionTarget: "exhibit-idta",
      when: (facts) => {
        const mech = String(
          facts.transferMechanism || facts.sccModule || ""
        ).toLowerCase();
        return (
          facts.ukIdta === true ||
          mech.includes("idta") ||
          mech.includes("uk addendum")
        );
      },
    },
  ],
};
