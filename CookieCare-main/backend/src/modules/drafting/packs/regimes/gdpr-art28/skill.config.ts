import type { DraftingSkillConfig } from "../../skill-contract.js";

/** GDPR Art. 28 regime overlays — legal elements mapped to DPA section briefs. */
export const gdprArt28SkillConfig: DraftingSkillConfig = {
  skillId: "regimes/gdpr-art28",
  axis: "regime",
  label: "GDPR Article 28",
  version: "1.0.0",
  appliesToDocTypes: ["dpa"],
  draftingRules: [
    "Processor must process only on documented instructions including for transfers (Art. 28(3)(a)).",
    "Sub-processors require prior authorisation and equivalent obligations (Art. 28(2)/(4)).",
    "Deletion or return at end of services (Art. 28(3)(g)).",
    "Audit and information rights (Art. 28(3)(h)).",
  ],
  sectionBriefs: [
    {
      workUnitId: "sec-processing",
      title: "Processing of Personal Data (Art. 28)",
      purpose: "Implement Art. 28(3)(a)–(c) processing, confidentiality, and security stipulations.",
      requiredContent: [
        "Process only on documented instructions (including transfers)",
        "Confidentiality for authorised persons",
        "Article 32 security measures cross-reference",
      ],
      requiredLegalElements: [
        "Art.28(3)(a) documented instructions",
        "Art.28(3)(b) confidentiality",
        "Art.28(3)(c) security",
      ],
    },
    {
      workUnitId: "sec-subprocessors",
      title: "Sub-processors (Art. 28)",
      purpose: "Implement Art. 28(2)/(3)(d)/(4) sub-processor controls.",
      requiredContent: [
        "Prior specific or general written authorisation",
        "Notice of intended changes and Controller objection right",
        "Written flow-down; processor remains fully liable",
      ],
      requiredLegalElements: [
        "Art.28(2) authorisation",
        "Art.28(4) flow-down and liability",
      ],
    },
    {
      workUnitId: "sec-assistance",
      title: "Assistance (Art. 28)",
      purpose: "Art. 28(3)(e)–(f) DSR and compliance assistance.",
      requiredContent: [
        "Assist with data-subject rights requests",
        "Assist with Arts. 32–36 (security, breach, DPIA, prior consultation)",
      ],
      requiredLegalElements: ["Art.28(3)(e)", "Art.28(3)(f)"],
    },
    {
      workUnitId: "sec-return",
      title: "Return or Deletion (Art. 28)",
      purpose: "Art. 28(3)(g) deletion or return.",
      requiredContent: [
        "At Controller's choice delete or return personal data after services end",
        "Delete copies unless retention required by law",
      ],
      requiredLegalElements: ["Art.28(3)(g)"],
    },
    {
      workUnitId: "sec-misc",
      title: "Audit Rights (Art. 28)",
      purpose: "Art. 28(3)(h) information and audit rights.",
      requiredContent: [
        "Make available information necessary to demonstrate compliance",
        "Allow and contribute to audits / inspections",
      ],
      requiredLegalElements: ["Art.28(3)(h)"],
    },
  ],
  conditionalWorkUnits: [
    {
      id: "exhibit-scc-module2",
      when: (facts) => {
        const mech = String(
          facts.transferMechanism || facts.sccModule || ""
        ).toLowerCase();
        return (
          mech.includes("scc") &&
          (mech.includes("module 2") ||
            mech.includes("module2") ||
            mech.includes("c2p") ||
            mech.includes("controller to processor"))
        );
      },
      workUnit: {
        id: "exhibit-scc",
        kind: "exhibit",
        heading: "EU Standard Contractual Clauses (Module 2)",
        dependsOn: ["sec-transfers"],
        clauseTypes: ["scc", "transfers"],
        status: "pending",
      },
    },
  ],
  exhibitBriefs: [
    {
      workUnitId: "exhibit-scc",
      title: "EU SCCs Module 2",
      purpose: "Attach Module 2 SCCs when EU C2P transfers apply.",
      requiredContent: [
        "Identify Module 2 (controller to processor)",
        "Reference parties as data exporter / importer consistent with deal identity",
        "Incorporate or annex SCC operative clauses by reference if full text is not required inline",
      ],
      requiredFacts: ["transferMechanism", "parties"],
      relatedSections: ["sec-transfers"],
    },
  ],
  exhibitSpecs: [
    {
      id: "exhibit-scc",
      title: "EU Standard Contractual Clauses (Module 2)",
      kind: "sccs",
      requiresFullText: true,
      parentSectionId: "sec-transfers",
      sourceFile: "scc-module-2.md",
    },
  ],
  validationRules: [
    {
      id: "gdpr-instructions-phrase",
      requirement: "Documented instructions obligation must appear",
      severity: "critical",
      checkKind: "required_phrase",
      sectionTarget: "sec-processing",
      requiredPhrase: "documented instructions",
    },
    {
      id: "gdpr-scc-exhibit-when-module2",
      requirement: "SCC Module 2 exhibit required when transfer mechanism is Module 2",
      severity: "critical",
      checkKind: "conditional_exhibit",
      sectionTarget: "exhibit-scc",
      when: (facts) => {
        const mech = String(
          facts.transferMechanism || facts.sccModule || ""
        ).toLowerCase();
        return (
          mech.includes("scc") &&
          (mech.includes("module 2") ||
            mech.includes("module2") ||
            mech.includes("c2p"))
        );
      },
    },
  ],
};
