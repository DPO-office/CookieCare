import test from "node:test";
import assert from "node:assert/strict";
import { deriveSkeletonFromTemplate } from "../template-skeleton.js";
import { classifyTargetSections } from "../../act/section-refine.js";
import { documentTypeRegistry } from "../../../packs/document-types/registry.js";
import { resolveApplicablePacks } from "../../../packs/resolve-applicable-packs.js";
import { assembleDraftingContext } from "../assemble-drafting-context.js";
import { buildSectionContext } from "../../act/build-section-context.js";
import type { DraftSection } from "../../../models/draft-state.js";

test("deriveSkeletonFromTemplate parses headings into WorkUnits", () => {
  const sampleTemplate = `
# SaaS Subscription Agreement

1. Definitions and Interpretation
2. The Service and Access
3. Fees and Payment Terms
4. Customer Data and Privacy
5. Limitation of Liability
Schedule A: Details of Service
`;

  const units = deriveSkeletonFromTemplate(sampleTemplate);
  assert.ok(units);
  assert.ok(units.length >= 5);
  assert.equal(units[0].kind, "section");
  assert.ok(units.some((u) => u.kind === "exhibit"));
});

test("deriveSkeletonFromTemplate parses standard Master Services Agreement template", () => {
  const msaTemplate = `
MASTER SERVICES AGREEMENT
1. TERMS AND DEFINITIONS
2. SUBJECT MATTER OF AGREEMENT
3. RENDERING SERVICES
4. CONFIDENTIALITY
5. INTELLECTUAL PROPERTY RIGHTS
6. TERMINATION
7. REMUNERATION OF THE CONTRACTOR
8. ACCEPTANCE OF RENDERED SERVICES AND PAYMENT PROCEDURE
9. FORCE MAJEURE
10. AMENDMENTS
11. JURISDICTION
`;

  const units = deriveSkeletonFromTemplate(msaTemplate);
  assert.ok(units);
  assert.equal(units.length, 11);
  assert.equal(units[0].heading, "TERMS AND DEFINITIONS");
  assert.equal(units[1].heading, "SUBJECT MATTER OF AGREEMENT");
  assert.equal(units[2].heading, "RENDERING SERVICES");
  assert.equal(units[3].heading, "CONFIDENTIALITY");
  assert.equal(units[4].heading, "INTELLECTUAL PROPERTY RIGHTS");
  assert.equal(units[5].heading, "TERMINATION");
  assert.equal(units[6].heading, "REMUNERATION OF THE CONTRACTOR");
  assert.equal(units[7].heading, "ACCEPTANCE OF RENDERED SERVICES AND PAYMENT PROCEDURE");
  assert.equal(units[8].heading, "FORCE MAJEURE");
  assert.equal(units[9].heading, "AMENDMENTS");
  assert.equal(units[10].heading, "JURISDICTION");
});

test("deriveSkeletonFromTemplate parses Employee NDA (PIIA) template with Roman numerals", () => {
  const employeeNdaTemplate = `
EMPLOYEE NON-DISCLOSURE AGREEMENT
ARTICLE I: CONFIDENTIAL INFORMATION
ARTICLE II: INVENTIONS
ARTICLE III: NATURE OF RELATIONSHIP
ARTICLE IV: MISCELLANEOUS PROVISIONS
`;

  const units = deriveSkeletonFromTemplate(employeeNdaTemplate);
  assert.ok(units);
  assert.equal(units.length, 4);
  assert.equal(units[0].heading, "CONFIDENTIAL INFORMATION");
  assert.equal(units[1].heading, "INVENTIONS");
  assert.equal(units[2].heading, "NATURE OF RELATIONSHIP");
  assert.equal(units[3].heading, "MISCELLANEOUS PROVISIONS");
});

test("deriveSkeletonFromTemplate parses Independent Contractor NDA template with trailing periods", () => {
  const contractorNdaTemplate = `
INDEPENDENT CONTRACTOR NON-DISCLOSURE AGREEMENT
1. THE PARTIES.
2. STATUS.
3. CONFIDENTIAL INFORMATION.
4. INTELLECTUAL PROPERTY.
5. TRADEMARKS, COPYRIGHTS, & PATENTS.
6. TERM.
7. NON-SOLICITATION AND NON-COMPETE.
8. INJUNCTIVE RELIEF.
9. GOVERNING LAW.
10. SEVERABILITY.
`;

  const units = deriveSkeletonFromTemplate(contractorNdaTemplate);
  assert.ok(units);
  assert.equal(units.length, 10);
  assert.equal(units[0].heading, "THE PARTIES");
  assert.equal(units[1].heading, "STATUS");
  assert.equal(units[2].heading, "CONFIDENTIAL INFORMATION");
  assert.equal(units[3].heading, "INTELLECTUAL PROPERTY");
  assert.equal(units[4].heading, "TRADEMARKS, COPYRIGHTS, & PATENTS");
  assert.equal(units[5].heading, "TERM");
  assert.equal(units[6].heading, "NON-SOLICITATION AND NON-COMPETE");
  assert.equal(units[7].heading, "INJUNCTIVE RELIEF");
  assert.equal(units[8].heading, "GOVERNING LAW");
  assert.equal(units[9].heading, "SEVERABILITY");
});

test("deriveSkeletonFromTemplate parses 21-section production SaaS Subscription Agreement template", () => {
  const saasTemplate = `
SaaS Subscription Agreement
1. Definitions and interpretation
2. The Service
3. Account registration
4. Licence grant
5. Restrictions
6. Support
7. Service levels
8. Fees and payment
9. Data protection
10. Customer Data
11. Intellectual property
12. Confidentiality
13. Warranties
14. Limitation of liability
15. Indemnification
16. Term and termination
17. Effects of termination
18. Force majeure
19. Entire agreement
20. General provisions
21. Law and jurisdiction
`;

  const units = deriveSkeletonFromTemplate(saasTemplate);
  assert.ok(units);
  assert.equal(units.length, 21);
  assert.equal(units[0].heading, "Definitions and interpretation");
  assert.equal(units[1].heading, "The Service");
  assert.equal(units[2].heading, "Account registration");
  assert.equal(units[3].heading, "Licence grant");
  assert.equal(units[4].heading, "Restrictions");
  assert.equal(units[5].heading, "Support");
  assert.equal(units[6].heading, "Service levels");
  assert.equal(units[7].heading, "Fees and payment");
  assert.equal(units[8].heading, "Data protection");
  assert.equal(units[9].heading, "Customer Data");
  assert.equal(units[10].heading, "Intellectual property");
  assert.equal(units[11].heading, "Confidentiality");
  assert.equal(units[12].heading, "Warranties");
  assert.equal(units[13].heading, "Limitation of liability");
  assert.equal(units[14].heading, "Indemnification");
  assert.equal(units[15].heading, "Term and termination");
  assert.equal(units[16].heading, "Effects of termination");
  assert.equal(units[17].heading, "Force majeure");
  assert.equal(units[18].heading, "Entire agreement");
  assert.equal(units[19].heading, "General provisions");
  assert.equal(units[20].heading, "Law and jurisdiction");
});

test("deriveSkeletonFromTemplate parses Randstad / Tigersheet Mutual Nondisclosure Agreement template", () => {
  const mutualNdaTemplate = `
MUTUAL NONDISCLOSURE AGREEMENT
1. Affiliates; Confidential Information
2. Exclusions
3. Use of Confidential Information
4. Receiving Party Personnel; Affiliates
5. Disclosures to Governmental Entities
6. Ownership of Confidential Information
7. Notice of Unauthorized Use
8. Return of Confidential Information
9. Injunctive Relief
10. Scope; Termination
11. Independent Development
12. Miscellaneous
`;

  const units = deriveSkeletonFromTemplate(mutualNdaTemplate);
  assert.ok(units);
  assert.equal(units.length, 12);
  assert.equal(units[0].heading, "Affiliates; Confidential Information");
  assert.equal(units[1].heading, "Exclusions");
  assert.equal(units[2].heading, "Use of Confidential Information");
  assert.equal(units[3].heading, "Receiving Party Personnel; Affiliates");
  assert.equal(units[4].heading, "Disclosures to Governmental Entities");
  assert.equal(units[5].heading, "Ownership of Confidential Information");
  assert.equal(units[6].heading, "Notice of Unauthorized Use");
  assert.equal(units[7].heading, "Return of Confidential Information");
  assert.equal(units[8].heading, "Injunctive Relief");
  assert.equal(units[9].heading, "Scope; Termination");
  assert.equal(units[10].heading, "Independent Development");
  assert.equal(units[11].heading, "Miscellaneous");
});

test("documentTypeRegistry fallback behavior", () => {
  assert.equal(documentTypeRegistry.resolveId("saas subscription"), "saas");
  assert.equal(documentTypeRegistry.resolveId("employment contract"), "employment");
  assert.equal(documentTypeRegistry.resolveId("random unknown document type"), "generic");
  assert.equal(documentTypeRegistry.get("unknown").id, "generic");
});

test("classifyTargetSections targets specific sections based on instructions", () => {
  const sections: DraftSection[] = [
    { id: "sec-1", heading: "1. Definitions", body: "Definitions here..." },
    { id: "sec-2", heading: "2. Scope of Services", body: "Services here..." },
    { id: "sec-3", heading: "3. Fees and Payment", body: "Fees here..." },
    { id: "sec-4", heading: "4. Limitation of Liability", body: "Liability cap here..." },
  ];

  const matchByNum = classifyTargetSections(sections, "In Section 3, change payment window to Net 15 days");
  assert.ok(matchByNum);
  assert.equal(matchByNum[0].id, "sec-3");

  const matchByTopic = classifyTargetSections(sections, "Cap liability at $100,000");
  assert.ok(matchByTopic);
  assert.equal(matchByTopic[0].id, "sec-4");

  const globalInstruction = classifyTargetSections(sections, "Rewrite the entire document in simple English");
  assert.equal(globalInstruction, null);
});

test("end-to-end: selected template drives plan skeleton, section slices, and ACT context", () => {
  const customTemplateText = `
MASTER SERVICES AGREEMENT
1. TERMS AND DEFINITIONS
Services shall mean the software testing and development services.

2. SUBJECT MATTER OF AGREEMENT
Contractor undertakes to provide Client with software testing services using remote computer systems.

3. RENDERING SERVICES
Rights and obligations arise directly between Contractor and Client. This Agreement does not create an employment relationship.

4. CONFIDENTIALITY
All information relating hereto shall remain strictly confidential.

5. INTELLECTUAL PROPERTY RIGHTS
All exclusive intellectual property rights to the Software created hereunder belong to Client.
`;

  // 1. Derive dynamic skeleton from the template
  const templateSkeleton = deriveSkeletonFromTemplate(customTemplateText);
  assert.ok(templateSkeleton);
  assert.equal(templateSkeleton.length, 5);
  assert.equal(templateSkeleton[0].heading, "TERMS AND DEFINITIONS");
  assert.equal(templateSkeleton[1].heading, "SUBJECT MATTER OF AGREEMENT");
  assert.equal(templateSkeleton[2].heading, "RENDERING SERVICES");
  assert.equal(templateSkeleton[3].heading, "CONFIDENTIALITY");
  assert.equal(templateSkeleton[4].heading, "INTELLECTUAL PROPERTY RIGHTS");

  const state: any = {
    request: {
      intent: "CREATE",
      rawInstructions: "Draft an MSA using selected template",
      templateId: "vault_tpl_msa_101",
      vaultDocumentId: "vault_tpl_msa_101",
    },
    requirements: {
      contractType: "msa",
      jurisdiction: "New York",
      parties: ["Alpha Client Corp", "Beta Contractor LLC"],
      instructions: "Follow selected template",
    },
    structuredFacts: {
      documentType: "msa",
      partyA: "Alpha Client Corp",
      partyB: "Beta Contractor LLC",
      parties: ["Alpha Client Corp", "Beta Contractor LLC"],
      governingLaw: "New York",
      effectiveDate: "2026-03-01",
      servicesDescription: "Software testing services using remote computer systems",
    },
    retrieval: {
      templateId: "vault_tpl_msa_101",
      matchedTemplate: customTemplateText,
      applicablePlaybookRules: [],
      fallbackClauses: [],
      historicalReferences: [],
    },
  };

  const applicable = resolveApplicablePacks(state);

  // 2. Assemble drafting context with the template-derived skeleton
  const draftingContext = assembleDraftingContext(state, applicable, templateSkeleton);
  assert.equal(draftingContext.template?.id, "vault_tpl_msa_101");

  // 3. Verify section slices were extracted for the units
  const slices = draftingContext.template?.sectionSlices ?? {};
  assert.ok(slices[templateSkeleton[0].id]?.includes("software testing and development"));
  assert.ok(slices[templateSkeleton[1].id]?.includes("remote computer systems"));
  assert.ok(slices[templateSkeleton[2].id]?.includes("does not create an employment relationship"));

  // 4. Verify ACT context for each section receives the exact template slice
  const stateWithContext = { ...state, draftingContext };
  const actContext = buildSectionContext(stateWithContext, templateSkeleton[1]);
  assert.ok(actContext.templateBlock.includes("BASELINE TEMPLATE SLICE (vault_tpl_msa_101)"));
  assert.ok(actContext.templateBlock.includes("remote computer systems"));
});
