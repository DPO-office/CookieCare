import type { DraftingSkillConfig } from "../../skill-contract.js";

export const ndaSkillConfig: DraftingSkillConfig = {
  skillId: "document-types/nda",
  axis: "documentType",
  label: "Non-Disclosure Agreement",
  version: "1.2.0",
  appliesToDocTypes: ["nda"],
  requiredFacts: [
    {
      id: "businessPurpose",
      priority: "critical",
      blocking: true,
      question: "What is the business purpose or engagement for sharing confidential information (e.g. employment, independent contractor services, commercial evaluation)?",
      reasonRequired: "Confidentiality and non-use covenants must specify the permitted business purpose or engagement scope.",
      placeholder: "e.g. Evaluating commercial partnership and sharing confidential technical documentation",
      aliases: ["purpose", "engagementType"],
    },
    {
      id: "confidentialityTermYears",
      priority: "critical",
      blocking: true,
      question: "How long should confidentiality obligations last (e.g. 2 years, 3 years, 5 years, or perpetual for trade secrets)?",
      reasonRequired: "Term and survival provisions require a specific duration for confidentiality.",
      options: ["2 years", "3 years", "5 years", "Perpetual (trade secrets)", "Other (specify)"],
      placeholder: "e.g. 3 years",
      aliases: ["ndaTerm", "duration"],
    },
    {
      id: "ndaType",
      priority: "critical",
      blocking: true,
      question: "What type of NDA is this (e.g. Mutual Commercial, Employee PIIA, or Independent Contractor)?",
      reasonRequired: "Worker status, invention assignment, and moral rights waivers differ between commercial, employee, and contractor NDAs.",
      options: ["Mutual Commercial NDA", "One-Way Commercial NDA", "Employee NDA / PIIA", "Independent Contractor NDA"],
      placeholder: "Select an NDA type",
      aliases: ["agreementType", "relationshipType"],
    },
  ],
  safeDefaults: {
    confidentialityTermYears: "3 years post-termination, perpetual for trade secrets",
    markingRequirement: "All proprietary business and technical data whether or not marked",
    remedyInjunctiveRelief: "Right to injunctive relief without proof of actual damages",
    moralRightsWaiver: "Full waiver of moral rights for contractor work product",
  },
  sectionBriefs: [
    {
      workUnitId: "sec-parties",
      title: "Parties and Recitals",
      purpose: "Identify the contracting parties (or Disclosing and Receiving Parties), stating registered addresses, effective date, and engagement context.",
      requiredContent: [
        "Full legal name and registered office address of Party A / Disclosing Party",
        "Full legal name and registered office address of Party B / Receiving Party",
        "Effective date of agreement",
        "Recitals stating the context of engagement/commercial evaluation and necessity of protecting confidential proprietary information",
      ],
      requiredFacts: ["parties", "effectiveDate", "governingLaw", "partyAAddress", "partyBAddress"],
      requiredLegalElements: ["party-identification", "effective-date", "recitals"],
      prohibitedContent: [
        "Square-bracket placeholders",
        "Invented third parties",
        "Labeling commercial partners as Client/Contractor or Employer/Employee unless explicitly requested",
      ],
    },
    {
      workUnitId: "sec-status",
      title: "Nature of Relationship and Worker Status",
      purpose: "Define the legal relationship between the parties: affirming independent contractor status under 'work made for hire' (17 U.S.C. § 201(b)) with no employment or agency authority, or affirming at-will employment without guarantee of continued tenure.",
      requiredContent: [
        "Clear definition of relationship: independent contractor work-for-hire or at-will employment",
        "Disclaimer of unintended relationships (no partnership, joint venture, or agency authority to bind)",
        "At-will clarification: either party may terminate with or without cause or prior notice where applicable",
      ],
      requiredLegalElements: ["worker-status", "no-agency-authority", "relationship-clarification"],
    },
    {
      workUnitId: "sec-definitions",
      title: "Confidential Information and Proprietary Data",
      purpose: "Define Confidential Information and Proprietary Data comprehensively, encompassing technical, financial, customer, algorithm, software, and trade secret information.",
      requiredContent: [
        "Broad definition of Confidential Information and Proprietary Data (software, algorithms, customer lists, pricing, technical data)",
        "Trade secret acknowledgment: information constitutes trade secrets for which reasonable protective steps are taken",
        "Inclusion of all compilations, work products, and derived materials",
      ],
      requiredLegalElements: ["confidential-information-definition", "trade-secret-acknowledgment"],
    },
    {
      workUnitId: "sec-confidentiality",
      title: "Confidentiality and Non-Use Obligations",
      purpose: "Set strict non-disclosure and non-use covenants, limiting use strictly to the authorized engagement or agreed business purpose and requiring return of all physical/electronic repositories upon termination.",
      requiredContent: [
        "Duty to maintain strict confidentiality and not disclose to third parties without prior written consent",
        "Restriction on use strictly to the authorized business purpose or commercial evaluation",
        "Standard of care (no less than reasonable care / degree of care used for own confidential materials)",
        "Return or destruction of confidential materials upon request or termination",
        "Survival of obligations during and following termination of engagement matching facts.confidentialityTermYears (e.g. 5 years post-termination if specified, default 3 years)",
      ],
      requiredFacts: ["businessPurpose", "confidentialityTermYears"],
      requiredLegalElements: ["non-disclosure-covenant", "non-use-covenant", "return-of-materials"],
      prohibitedContent: [
        "Do not include standard exceptions or exclusions (public domain, prior knowledge, independent development, compelled disclosure) in this section — they belong exclusively in the dedicated Exclusions section.",
      ],
    },
    {
      workUnitId: "sec-inventions",
      title: "Inventions and Intellectual Property Assignment",
      purpose: "Govern ownership of inventions and work product: assigning all right, title, and interest to Employer/Client as 'work made for hire', moral rights waiver, and statutory labor code carve-outs for employee-owned inventions.",
      requiredContent: [
        "Prompt written disclosure of all inventions, ideas, and discoveries made during engagement",
        "Full assignment of all right, title, and interest in inventions and work product to Employer / Client",
        "Statutory exception notice (e.g. Labor Code § 2870): carveout for inventions created on employee's own time without company equipment/trade secrets and unrelated to company business",
        "Moral rights waiver (waiver of authorship attribution and modification rights)",
        "Prior inventions disclosure reservation (Exhibit A)",
      ],
      requiredLegalElements: ["inventions-assignment", "statutory-carveout-notice", "moral-rights-waiver"],
    },
    {
      workUnitId: "sec-exclusions",
      title: "Exclusions and Exceptions",
      purpose: "Specify standard legal carveouts from confidentiality duties.",
      requiredContent: [
        "Public domain information not through recipient breach",
        "Prior knowledge without confidentiality restriction",
        "Independent development without reference to confidential information",
        "Legally compelled disclosure exception with prompt advance written notice",
      ],
      requiredLegalElements: ["standard-exclusions", "compelled-disclosure-notice"],
    },
    {
      workUnitId: "sec-restrictive-covenants",
      title: "Non-Solicitation and Restrictive Covenants",
      purpose: "Prevent solicitation or hiring away of Client/Employer employees and diversion of customers during engagement and post-termination.",
      requiredContent: [
        "Non-solicitation of employees, contractors, and personnel",
        "Non-solicitation of clients and customers",
        "Specific post-termination duration as defined in runtime facts (e.g. facts.nonSolicitationDuration, default 12 months if unspecified)",
        "Reasonable geographic scope and standard carveout for open public advertisements",
      ],
      requiredFacts: ["nonSolicitationDuration"],
      requiredLegalElements: ["employee-non-solicitation", "customer-non-solicitation"],
    },
    {
      workUnitId: "sec-term",
      title: "Term and Termination",
      purpose: "Define agreement duration and survival of confidentiality and trade secret covenants.",
      requiredContent: [
        "Agreement active term commencing on Effective Date",
        "Perpetual survival of confidentiality for trade secrets and proprietary data",
        "Specific survival term for standard confidential business information matching facts.confidentialityTermYears (e.g. 5 years post-termination if specified, default 3 years)",
      ],
      requiredFacts: ["effectiveDate", "confidentialityTermYears"],
      requiredLegalElements: ["effective-date", "trade-secret-survival"],
    },
    {
      workUnitId: "sec-misc",
      title: "Injunctive Relief and Miscellaneous",
      purpose: "Equitable remedies, severability, prevailing party attorney's fees, written amendments, and governing law.",
      requiredContent: [
        "Irreparable harm acknowledgment and entitlement to injunctive relief without waiving damages",
        "Prevailing party attorney's fees recovery in dispute enforcement",
        "Severability and judicial modification of overbroad covenants",
        "Amendments binding only in writing signed by authorized representative",
        "Governing law and jurisdiction",
      ],
      requiredLegalElements: ["injunctive-relief", "attorney-fees-clause", "governing-law", "written-amendments-only"],
    },
    // Granular aliases matching user templates directly
    {
      workUnitId: "sec-inventions-article",
      title: "ARTICLE II: INVENTIONS",
      purpose: "Invention disclosure, assignment of rights, statutory labor code notice, and prior inventions list.",
      requiredContent: ["Prompt disclosure of inventions", "Full assignment to Employer", "Statutory carveout notice", "Prior inventions Exhibit A"],
    },
    {
      workUnitId: "sec-nature-of-relationship",
      title: "ARTICLE III: NATURE OF RELATIONSHIP",
      purpose: "Clarify at-will employment relationship without guarantee of continuing employment.",
      requiredContent: ["At-will relationship confirmation", "No continuing employment guarantee"],
    },
    {
      workUnitId: "sec-intellectual-property",
      title: "4. INTELLECTUAL PROPERTY",
      purpose: "Work made for hire, Client sole ownership, moral rights waiver, and further assistance.",
      requiredContent: ["Work made for hire under 17 U.S.C. § 201(b)", "Client sole ownership", "Moral rights waiver", "Further assistance"],
    },
    {
      workUnitId: "sec-non-solicitation",
      title: "7. NON-SOLICITATION AND NON-COMPETE",
      purpose: "Non-solicitation of employees and customers.",
      requiredContent: ["No solicitation of employees", "No solicitation or diversion of customers"],
    },
    {
      workUnitId: "sec-injunctive-relief",
      title: "8. INJUNCTIVE RELIEF",
      purpose: "Entitlement to injunctive and equitable relief without waiving other legal remedies.",
      requiredContent: ["Irreparable harm acknowledgment", "Injunctive relief entitlement", "Remedies cumulative"],
    },
  ],
  validationRules: [
    {
      id: "nda-parties-present",
      requirement: "Agreement must identify both Disclosing and Receiving parties.",
      severity: "critical",
      checkKind: "section_present",
    },
    {
      id: "nda-confidentiality-present",
      requirement: "Agreement must define Confidential Information and set non-disclosure obligations.",
      severity: "critical",
      checkKind: "section_present",
    },
    {
      id: "nda-injunctive-relief-present",
      requirement: "Agreement must include entitlement to injunctive relief for breach.",
      severity: "critical",
      checkKind: "section_present",
    },
    {
      id: "nda-governing-law-present",
      requirement: "Agreement must designate governing law and jurisdiction.",
      severity: "critical",
      checkKind: "section_present",
    },
  ],
  conditionalWorkUnits: [
    {
      id: "unit-restrictive-covenants",
      workUnit: {
        id: "sec-restrictive-covenants",
        kind: "section",
        heading: "Non-Solicitation and Restrictive Covenants",
        dependsOn: ["sec-definitions"],
        clauseTypes: ["restrictive-covenants", "non-solicit"],
        status: "pending",
      },
      when: (facts) => {
        const ndaType = typeof facts.ndaType === "string" ? facts.ndaType.toLowerCase() : "";
        const contractType = typeof facts.contractType === "string" ? facts.contractType.toLowerCase() : "";
        return Boolean(
          facts.nonSolicitationDuration ||
          facts.nonSolicit ||
          facts.nonSolicitationScope ||
          ndaType.includes("contractor") ||
          ndaType.includes("employee") ||
          contractType.includes("contractor") ||
          contractType.includes("employee")
        );
      },
    },
    {
      id: "unit-inventions",
      workUnit: {
        id: "sec-inventions",
        kind: "section",
        heading: "Inventions and Intellectual Property Assignment",
        dependsOn: ["sec-definitions"],
        clauseTypes: ["inventions", "ip-assignment"],
        status: "pending",
      },
      when: (facts) => {
        const ndaType = typeof facts.ndaType === "string" ? facts.ndaType.toLowerCase() : "";
        const contractType = typeof facts.contractType === "string" ? facts.contractType.toLowerCase() : "";
        return Boolean(
          facts.moralRightsWaiver ||
          facts.ipAssignment ||
          ndaType.includes("contractor") ||
          ndaType.includes("employee") ||
          contractType.includes("contractor") ||
          contractType.includes("employee")
        );
      },
    },
  ],
};

