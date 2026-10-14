import type { DraftingSkillConfig } from "../../skill-contract.js";

function mentionsChildren(facts: { [key: string]: unknown }): boolean {
  const text = JSON.stringify(facts).toLowerCase();
  return /\b(child|children|minor)\b/.test(text);
}

function mentionsSignificantFiduciary(facts: { [key: string]: unknown }): boolean {
  const text = JSON.stringify(facts).toLowerCase();
  return (
    text.includes("significant data fiduciary") ||
    /\bsdf\b/.test(text)
  );
}

/** DPDPA s.8 processor-contract overlays — legal elements mapped to DPA section briefs. */
export const dpdpaSkillConfig: DraftingSkillConfig = {
  skillId: "regimes/dpdpa",
  axis: "regime",
  label: "DPDPA (India)",
  version: "1.0.0",
  appliesToDocTypes: ["dpa"],
  draftingRules: [
    "Use Data Fiduciary, Data Processor, and Data Principal. Do not use controller, processor, or data subject unless the user also asked for GDPR.",
    "Data Processor processes only on the Data Fiduciary's documented instructions and specified purpose (s.8(2)).",
    "Reasonable security safeguards to prevent personal data breach (s.8(5)). Do not invent a statutory hour deadline for breach notice.",
    "Erase or return personal data when the purpose is served, consent is withdrawn, or the contract ends, unless law requires retention (s.8(7)).",
    "Cross-border transfer is permitted except to Central Government restricted countries (s.16). Do not attach EU SCCs or a UK IDTA.",
    "Children's-data (s.9) and Significant Data Fiduciary (s.10) clauses only if the user says they apply.",
  ],
  sectionBriefs: [
    {
      workUnitId: "sec-parties",
      title: "Parties (DPDPA)",
      purpose: "Identify the Data Fiduciary and the Data Processor under the DPDP Act, 2023.",
      requiredContent: [
        "Name the parties as Data Fiduciary and Data Processor",
        "State that the Data Processor processes personal data on behalf of the Data Fiduciary under a valid contract (s.8(2))",
      ],
      requiredLegalElements: ["s.8(2) valid contract", "Data Fiduciary", "Data Processor"],
      prohibitedContent: [
        "Labelling the parties only as Controller and Processor when this is a DPDPA-only engagement",
      ],
    },
    {
      workUnitId: "sec-definitions",
      title: "Definitions (DPDPA)",
      purpose: "Use DPDPA defined terms.",
      requiredContent: [
        "Define personal data, Data Fiduciary, Data Processor, Data Principal, and personal data breach by reference to the DPDP Act, 2023",
        "Define specified purpose consistently with the processing schedule",
      ],
      requiredLegalElements: ["DPDPA defined terms"],
      prohibitedContent: [
        "Defining the engagement solely with GDPR controller/processor/data-subject terms",
      ],
    },
    {
      workUnitId: "sec-processing",
      title: "Processing of Personal Data (DPDPA s.8)",
      purpose: "Implement s.8(2) documented instructions and purpose limitation.",
      requiredContent: [
        "Process personal data only on documented instructions of the Data Fiduciary",
        "Process only for the specified purpose of offering goods or services to Data Principals",
        "Do not process for the Data Processor's own purposes or determine purposes or means",
        "Confidentiality obligation for persons authorised to process",
      ],
      requiredLegalElements: [
        "s.8(2) documented instructions",
        "specified purpose",
        "no independent purpose",
      ],
    },
    {
      workUnitId: "sec-security",
      title: "Security Safeguards (DPDPA s.8(5))",
      purpose: "Contractual implementation of reasonable security safeguards.",
      requiredContent: [
        "Implement reasonable security safeguards to prevent personal data breach",
        "Describe safeguards as technical and organisational measures appropriate to the processing",
      ],
      requiredLegalElements: ["s.8(5) reasonable security safeguards"],
      prohibitedContent: [
        "Citing GDPR Article 32 as the statutory security duty for a DPDPA-only engagement",
      ],
    },
    {
      workUnitId: "sec-subprocessors",
      title: "Further processors (DPDPA)",
      purpose: "Contractual flow-down consistent with s.8(2), not a copied Art. 28(2) authorisation regime.",
      requiredContent: [
        "No further processor except under a written contract imposing equivalent obligations",
        "Data Fiduciary remains responsible to the Data Principal",
        "Notice of intended further processors where the user asked for approval or objection rights",
      ],
      requiredLegalElements: ["s.8(2) written flow-down", "Fiduciary remains responsible"],
      prohibitedContent: [
        "Stating that GDPR Article 28(2) prior written authorisation is a DPDPA statutory requirement",
      ],
    },
    {
      workUnitId: "sec-transfers",
      title: "Cross-border transfers (DPDPA s.16)",
      purpose: "Permit transfer outside India except to restricted countries.",
      requiredContent: [
        "Personal data may be transferred outside India except to a country or territory restricted by the Central Government",
        "Data Processor must not transfer to a restricted country",
        "No EU Standard Contractual Clauses or UK IDTA unless the user also asked for that transfer tool",
      ],
      requiredLegalElements: ["s.16 restricted-country transfer limit"],
      prohibitedContent: [
        "Attaching or incorporating EU SCCs as the DPDPA transfer mechanism",
      ],
    },
    {
      workUnitId: "sec-assistance",
      title: "Data Principal rights assistance (DPDPA ss.11–13)",
      purpose: "Processor assistance with access, correction, erasure, and grievance redressal.",
      requiredContent: [
        "Assist with access requests, including a summary and identities of Data Processors (s.11)",
        "Assist with correction, completion, updating, and erasure (s.12)",
        "Assist with grievance redressal (s.13)",
        "Notice and consent remain Data Fiduciary duties (ss.5–6)",
      ],
      requiredLegalElements: ["s.11 access", "s.12 correction and erasure", "s.13 grievance"],
    },
    {
      workUnitId: "sec-breach",
      title: "Personal data breach (DPDPA s.8(6))",
      purpose: "Processor notice so the Data Fiduciary can intimate the Board and affected Data Principals.",
      requiredContent: [
        "Notify the Data Fiduciary of a personal data breach without undue delay",
        "Provide information the Data Fiduciary needs to intimate the Board and each affected Data Principal",
        "Do not state a fixed hour count as a statutory obligation",
      ],
      requiredLegalElements: ["s.8(6) Board and Data Principal intimation assistance"],
    },
    {
      workUnitId: "sec-return",
      title: "Erasure or return (DPDPA s.8(7))",
      purpose: "Erase or return personal data when the purpose ends or consent is withdrawn.",
      requiredContent: [
        "At the Data Fiduciary's choice, erase or return personal data when the specified purpose is no longer served, consent is withdrawn, or services end",
        "Delete existing copies unless retention is required by law",
      ],
      requiredLegalElements: ["s.8(7) erasure or return"],
    },
    {
      workUnitId: "sec-dpdpa-children",
      title: "Children's personal data (DPDPA s.9)",
      purpose: "Additional processor restrictions only when children's data is in scope.",
      requiredContent: [
        "Process children's personal data only on documented instructions consistent with verifiable consent obtained by the Data Fiduciary",
        "No tracking, behavioural monitoring, or targeted advertising directed at children unless the user states an exemption applies",
        "No processing likely to cause a detrimental effect on the well-being of a child",
      ],
      requiredLegalElements: ["s.9 children's data"],
    },
    {
      workUnitId: "sec-dpdpa-sdf",
      title: "Significant Data Fiduciary assistance (DPDPA s.10)",
      purpose: "Assist SDF obligations only when the user says the Fiduciary is a Significant Data Fiduciary.",
      requiredContent: [
        "Assist the Data Fiduciary's Data Protection Officer, independent data audit, and data-protection impact assessment as instructed",
        "Do not appoint the Data Processor as the Significant Data Fiduciary",
      ],
      requiredLegalElements: ["s.10 Significant Data Fiduciary assistance"],
    },
  ],
  conditionalWorkUnits: [
    {
      id: "dpdpa-children",
      when: (facts) => mentionsChildren(facts),
      workUnit: {
        id: "sec-dpdpa-children",
        kind: "section",
        heading: "Children's Personal Data",
        dependsOn: ["sec-definitions"],
        clauseTypes: ["children", "dpdpa"],
        status: "pending",
      },
    },
    {
      id: "dpdpa-sdf",
      when: (facts) => mentionsSignificantFiduciary(facts),
      workUnit: {
        id: "sec-dpdpa-sdf",
        kind: "section",
        heading: "Significant Data Fiduciary Assistance",
        dependsOn: ["sec-definitions"],
        clauseTypes: ["sdf", "dpdpa"],
        status: "pending",
      },
    },
  ],
  validationRules: [
    {
      id: "dpdpa-instructions-phrase",
      requirement: "Documented instructions obligation must appear",
      severity: "critical",
      checkKind: "required_phrase",
      sectionTarget: "sec-processing",
      requiredPhrase: "documented instructions",
    },
    {
      id: "dpdpa-safeguards-phrase",
      requirement: "Reasonable security safeguards must appear",
      severity: "critical",
      checkKind: "required_phrase",
      sectionTarget: "sec-security",
      requiredPhrase: "reasonable security safeguards",
    },
  ],
};
