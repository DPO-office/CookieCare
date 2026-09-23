import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DraftState } from "../../../models/draft-state.js";
import { assembleDocument } from "../assemble-document.js";
import { runAssemblyCheck } from "../assembly-check.js";
import { buildDealIdentity } from "../deal-identity.js";
import {
  parsePartyPairFromText,
  parseAddressFromText,
  parseSignatoriesFromText,
  parseConfidentialityTermFromText,
  isFactSatisfied,
} from "../../plan/core-deal-facts.js";
import { resolveApplicablePacks } from "../../../packs/resolve-applicable-packs.js";
import { ndaSkillConfig } from "../../../packs/document-types/nda/skill.config.js";
import { resolveConditionalWorkUnits } from "../../plan/assemble-drafting-context.js";

function stateWithSections(): DraftState {
  return {
    request: { intent: "CREATE", rawInstructions: "Draft a DPA" },
    requirements: {
      contractType: "dpa",
      jurisdiction: "Ireland",
      industry: "General",
      parties: ["Acme Controller Inc.", "Beta Processor Ltd."],
      requiredClauses: [],
      optionalClauses: [],
      language: "English",
      instructions: "Draft a DPA",
    },
    retrieval: {
      matchedTemplate: null,
      applicablePlaybookRules: [],
      fallbackClauses: [],
      historicalReferences: [],
    },
    context: null,
    validation: null,
    riskReview: null,
    metadata: {
      generationParameters: {},
      playbookVersion: "1.0.0",
      timestamp: new Date().toISOString(),
    },
    structuredFacts: {
      documentType: "dpa",
      partyA: "Acme Controller Inc.",
      partyB: "Beta Processor Ltd.",
      effectiveDate: "1 January 2026",
    },
    plan: {
      documentType: "dpa",
      packId: "dpa",
      title: "DPA",
      workUnits: [
        {
          id: "sec-parties",
          kind: "section",
          heading: "Parties and Background",
          dependsOn: [],
          clauseTypes: ["parties"],
          status: "drafted",
        },
        {
          id: "sec-definitions",
          kind: "section",
          heading: "Definitions",
          dependsOn: [],
          clauseTypes: ["definitions"],
          status: "drafted",
        },
        {
          id: "sec-processing",
          kind: "section",
          heading: "Processing of Personal Data",
          dependsOn: ["sec-definitions"],
          clauseTypes: ["processing"],
          status: "drafted",
        },
        {
          id: "sec-security",
          kind: "section",
          heading: "Security Measures",
          dependsOn: [],
          clauseTypes: ["security"],
          status: "drafted",
        },
        {
          id: "sec-subprocessors",
          kind: "section",
          heading: "Sub-processors",
          dependsOn: [],
          clauseTypes: ["subprocessors"],
          status: "drafted",
        },
        {
          id: "sec-breach",
          kind: "section",
          heading: "Personal Data Breach",
          dependsOn: [],
          clauseTypes: ["breach"],
          status: "drafted",
        },
      ],
      structuredFacts: {
        documentType: "dpa",
        partyA: "Acme Controller Inc.",
        partyB: "Beta Processor Ltd.",
        effectiveDate: "1 January 2026",
      },
      missingFacts: [],
      applicableRegimes: [],
      mandatoryChecklist: [],
      loadedSkillPaths: [],
      selectedClauseIds: [],
      negotiationPositions: [],
      glossary: {},
    },
    draft: {
      rawOutput: "",
      formattedDocument: "",
      version: 1,
      sections: [
        {
          id: "sec-parties",
          workUnitId: "sec-parties",
          heading: "Parties and Background",
          body: "## Parties and Background\n\nThis Agreement is entered into as of junk between Fake Co.\n\nWHEREAS the parties wish to process data.\n\nThe parties are Acme Controller Inc. and Beta Processor Ltd.",
        },
        {
          id: "sec-definitions",
          workUnitId: "sec-definitions",
          heading: "Definitions",
          body: "## Definitions\n\n\"Personal Data\" means personal data as defined in [[SEC:sec-definitions]].",
        },
        {
          id: "sec-definitions-dup",
          workUnitId: "sec-definitions",
          heading: "Definitions",
          body: "## Definitions\n\nDuplicate definitions block should be dropped.",
        },
        {
          id: "sec-processing",
          workUnitId: "sec-processing",
          heading: "Processing of Personal Data",
          body: "## Processing of Personal Data\n\nProcessor shall process only on documented instructions as defined in the Definitions section.",
        },
        {
          id: "sec-security",
          workUnitId: "sec-security",
          heading: "Security Measures",
          body: "## Security Measures\n\nAppropriate technical measures apply.",
        },
        {
          id: "sec-subprocessors",
          workUnitId: "sec-subprocessors",
          heading: "Sub-processors",
          body: "## Sub-processors\n\nPrior written authorisation is required.",
        },
        {
          id: "sec-breach",
          workUnitId: "sec-breach",
          heading: "Personal Data Breach",
          body: "## Personal Data Breach\n\nNotify without undue delay.",
        },
      ],
    },
    exhibits: [
      {
        workUnitId: "exhibit-processing",
        title: "Details of Processing",
        body: "Purpose: cloud hosting",
      },
    ],
    draftingContext: {
      documentType: "dpa",
      skillIds: ["document-types/dpa"],
      facts: {
        documentType: "dpa",
        partyA: "Acme Controller Inc.",
        partyB: "Beta Processor Ltd.",
      },
      userIntent: { rawInstructions: "Draft a DPA", exclusions: [], preferences: [] },
      conflicts: [],
      gaps: [],
      outline: [],
      provenance: { clauses: [] },
      clauses: [],
      sectionBriefs: {},
      exhibitBriefs: {},
      exhibitSpecs: [
        {
          id: "exhibit-processing",
          letter: "A",
          title: "Details of Processing",
          kind: "schedule",
          requiresFullText: false,
          parentSectionId: "sec-processing",
        },
      ],
      validationRules: [],
      skills: [],
    },
  };
}

describe("document assembly", () => {
  it("produces one title, one preamble, numbered sections, TOC, signature", async () => {
    const assembled = await assembleDocument(stateWithSections());
    const doc = assembled.draft?.formattedDocument ?? "";
    assert.match(doc, /^# DATA PROCESSING AGREEMENT/m);
    const preambles = doc.match(/This Agreement is entered into/gi) || [];
    assert.equal(preambles.length, 1);
    assert.match(doc, /## 1\. Parties and Background/);
    assert.match(doc, /## 2\. Definitions/);
    assert.ok(!doc.includes("Table of Contents"));
    assert.match(doc, /Schedule A — Details of Processing/);
    assert.match(doc, /By: _{3,}/);
    assert.ok(!doc.includes("[[SEC:"));
    assert.ok(!/## Definitions\n\nDuplicate/i.test(doc));
  });

  it("assembly-check passes for coherent document", async () => {
    const assembled = await assembleDocument(stateWithSections());
    const check = runAssemblyCheck(assembled);
    assert.equal(check.ok, true, check.issues.join(" | "));
  });

  it("resolves Definitions section cross-ref to numbered section", async () => {
    const assembled = await assembleDocument(stateWithSections());
    const doc = assembled.draft?.formattedDocument ?? "";
    assert.match(doc, /Section 2 \(Definitions\)/);
  });

  it("parsePartyPairFromText extracts party names from user input strings", () => {
    const r1 = parsePartyPairFromText(
      "Party 1 (Client / Company A): Apex Technologies LLC Party 2 (Counterparty / Company B): Summit Data Solutions Inc."
    );
    assert.equal(r1?.partyA, "Apex Technologies LLC");
    assert.equal(r1?.partyB, "Summit Data Solutions Inc.");

    const r2 = parsePartyPairFromText("Apex Technologies LLC and Summit Data Solutions Inc.");
    assert.equal(r2?.partyA, "Apex Technologies LLC");
    assert.equal(r2?.partyB, "Summit Data Solutions Inc.");

    const r3 = parsePartyPairFromText("Apex Technologies LLC, Summit Data Solutions Inc.");
    assert.equal(r3?.partyA, "Apex Technologies LLC");
    assert.equal(r3?.partyB, "Summit Data Solutions Inc.");
  });

  it("buildDealIdentity anchors generic European Union governing law to Ireland", () => {
    const identity = buildDealIdentity(
      {
        partyA: "Apex Technologies LLC",
        partyB: "Summit Data Solutions Inc.",
        governingLaw: "European Union",
        instructionText: "Draft a mutual non-disclosure agreement",
      },
      "nda"
    );
    assert.ok(identity);
    assert.equal(identity.isMutual, true);
    assert.match(identity.governingLaw ?? "", /Republic of Ireland \(EU\)/);
  });

  it("assembleDocument produces clean mutual NDA preamble with addresses and balanced signature block", async () => {
    const base = stateWithSections();
    const mutualState: DraftState = {
      ...base,
      request: {
        intent: "CREATE",
        rawInstructions: "Draft a mutual non-disclosure agreement for commercial partnership",
      },
      structuredFacts: {
        documentType: "nda",
        parties:
          "Party 1 (Client / Company A): Apex Technologies LLC Party 2 (Counterparty / Company B): Summit Data Solutions Inc.",
        partyAAddress: "100 Innovation Way, Dublin, Ireland",
        partyBAddress: "500 Data Parkway, San Francisco, CA",
        effectiveDate: "15 Sept 2026",
        governingLaw: "European Union",
      },
      plan: {
        ...base.plan!,
        documentType: "nda",
        packId: "nda",
        title: "Mutual NDA",
        structuredFacts: {
          documentType: "nda",
          partyA: "Apex Technologies LLC",
          partyB: "Summit Data Solutions Inc.",
          effectiveDate: "15 Sept 2026",
          partyAAddress: "100 Innovation Way, Dublin, Ireland",
          partyBAddress: "500 Data Parkway, San Francisco, CA",
        },
      },
      draft: {
        ...base.draft!,
        sections: [
          {
            id: "sec-parties",
            workUnitId: "sec-parties",
            heading: "Parties",
            body: "## Parties\n\nThe parties are Apex Technologies LLC and Summit Data Solutions Inc.",
          },
          {
            id: "sec-definitions",
            workUnitId: "sec-definitions",
            heading: "Definitions",
            body: "## Definitions\n\nConfidential Information means proprietary technical and business data.",
          },
        ],
      },
    };

    const assembled = await assembleDocument(mutualState);
    const doc = assembled.draft?.formattedDocument ?? "";

    assert.match(doc, /^# MUTUAL NON-DISCLOSURE AGREEMENT/m);
    // Preamble contains registered addresses and mutual wording
    assert.match(doc, /having its registered office at 100 Innovation Way, Dublin, Ireland/);
    assert.match(doc, /having its registered office at 500 Data Parkway, San Francisco, CA/);
    assert.match(doc, /\(each a "Party" and collectively the "Parties"\)/);

    // Signature block contains legal names without (Client) or (Independent Contractor)
    assert.match(doc, /\*\*Apex Technologies LLC\*\*/);
    assert.match(doc, /\*\*Summit Data Solutions Inc\.\*\*/);
    assert.ok(!doc.includes("(Client)"));
    assert.ok(!doc.includes("(Independent Contractor)"));
  });

  it("resolveApplicablePacks does not attach GDPR_ART28 or SCC exhibits to a Mutual NDA under EU governing law", () => {
    const ndaState: DraftState = {
      ...stateWithSections(),
      request: {
        intent: "CREATE",
        rawInstructions: "Draft a mutual non-disclosure agreement for commercial partnership",
      },
      requirements: {
        ...stateWithSections().requirements!,
        contractType: "nda",
        jurisdiction: "Germany (EU)",
        instructions: "Draft a mutual non-disclosure agreement for commercial partnership",
      },
      structuredFacts: {
        documentType: "nda",
        governingLaw: "Germany (EU)",
        partyA: "Apex Technologies LLC",
        partyB: "Summit Data Solutions Inc.",
      },
    };

    const packs = resolveApplicablePacks(ndaState);
    assert.equal(packs.typePack.id, "nda");
    // GDPR Art 28 DPA regime must NOT be attached to an NDA
    assert.equal(packs.regimes.some((r) => r.id === "GDPR_ART28"), false);
    assert.equal(packs.regimes.some((r) => r.id === "UK_GDPR_IDTA"), false);
  });

  it("assembleDocument strips dangling bold section numbers like **4", async () => {
    const base = stateWithSections();
    const stateWithDanglingMarker: DraftState = {
      ...base,
      draft: {
        ...base.draft!,
        sections: [
          {
            id: "sec-confidentiality",
            workUnitId: "sec-confidentiality",
            heading: "Confidentiality Obligations",
            body: "## Confidentiality Obligations\n\nParties shall maintain strict confidentiality.\n\n**4",
          },
          {
            id: "sec-exclusions",
            workUnitId: "sec-exclusions",
            heading: "Exclusions",
            body: "**4\n\n4. Exclusions\n\nStandard exclusions apply.",
          },
        ],
      },
    };

    const assembled = await assembleDocument(stateWithDanglingMarker);
    const doc = assembled.draft?.formattedDocument ?? "";
    assert.ok(!doc.includes("**4\n"));
    assert.ok(!doc.includes("\n**4"));
    assert.match(doc, /## 2\. Exclusions\n\n(?:4\.\s+)?Exclusions\n\nStandard exclusions apply\./);
  });

  it("parseSignatoriesFromText parses multi-party signatory details", () => {
    const raw =
      "Apex Technologies LLC: Authorized Signatory Name: Jane Doe Title: Chief Executive Officer (CEO) Place of Signature: Wilmington, Delaware, USA Summit Data Solutions Inc.: Authorized Signatory Name: John Smith Title: Vice President of Business Development Place of Signature: Austin, Texas, USA";
    const parsed = parseSignatoriesFromText(raw);
    assert.ok(parsed.partyA);
    assert.equal(parsed.partyA?.name, "Jane Doe");
    assert.equal(parsed.partyA?.title, "Chief Executive Officer (CEO)");
    assert.match(parsed.partyA?.place ?? "", /Wilmington, Delaware, USA/);

    assert.ok(parsed.partyB);
    assert.equal(parsed.partyB?.name, "John Smith");
    assert.equal(parsed.partyB?.title, "Vice President of Business Development");
    assert.match(parsed.partyB?.place ?? "", /Austin, Texas, USA/);
  });

  it("parseAddressFromText extracts company name and street address", () => {
    const raw = "Legal Name: Apex Technologies LLC  Address: 100 Innovation Way, Suite 400, Wilmington, DE 19801, United States";
    const parsed = parseAddressFromText(raw);
    assert.equal(parsed.name, "Apex Technologies LLC");
    assert.equal(parsed.address, "100 Innovation Way, Suite 400, Wilmington, DE 19801, United States");
  });

  it("assembleDocument populates real signer names, titles, and places into signature block", async () => {
    const base = stateWithSections();
    const stateWithSigners: DraftState = {
      ...base,
      structuredFacts: {
        documentType: "nda",
        ndaType: "Independent Contractor NDA",
        partyA: "Apex Technologies LLC",
        partyB: "Summit Data Solutions Inc.",
        signatories:
          "Apex Technologies LLC: Authorized Signatory Name: Jane Doe Title: Chief Executive Officer (CEO) Place of Signature: Wilmington, Delaware, USA Summit Data Solutions Inc.: Authorized Signatory Name: John Smith Title: Vice President of Business Development Place of Signature: Austin, Texas, USA",
      },
      plan: {
        ...base.plan!,
        documentType: "nda",
        packId: "nda",
        title: "Independent Contractor NDA",
      },
      draft: {
        ...base.draft!,
        sections: [
          {
            id: "sec-confidentiality",
            workUnitId: "sec-confidentiality",
            heading: "Confidentiality Obligations",
            body: "## Confidentiality Obligations\n\nParties shall maintain strict confidentiality.",
          },
        ],
      },
    };

    const assembled = await assembleDocument(stateWithSigners);
    const doc = assembled.draft?.formattedDocument ?? "";

    // Checks dynamic title
    assert.match(doc, /^# INDEPENDENT CONTRACTOR NON-DISCLOSURE AGREEMENT/m);

    // Checks populated signature block
    assert.match(doc, /Name: Jane Doe/);
    assert.match(doc, /Title: Chief Executive Officer \(CEO\)/);
    assert.match(doc, /Place: Wilmington, Delaware, USA/);

    assert.match(doc, /Name: John Smith/);
    assert.match(doc, /Title: Vice President of Business Development/);
    assert.match(doc, /Place: Austin, Texas, USA/);
  });

  it("resolveConditionalWorkUnits activates sec-restrictive-covenants for contractor NDA or non-solicitation duration", () => {
    const units1 = resolveConditionalWorkUnits([ndaSkillConfig], {
      ndaType: "Independent Contractor NDA",
    });
    assert.ok(units1.some((u) => u.id === "sec-restrictive-covenants"));
    assert.ok(units1.some((u) => u.id === "sec-inventions"));

    const units2 = resolveConditionalWorkUnits([ndaSkillConfig], {
      nonSolicitationDuration: "12 month",
    });
    assert.ok(units2.some((u) => u.id === "sec-restrictive-covenants"));

    const units3 = resolveConditionalWorkUnits([ndaSkillConfig], {
      ndaType: "Mutual Commercial NDA",
    });
    assert.equal(units3.some((u) => u.id === "sec-restrictive-covenants"), false);
  });

  it("parseConfidentialityTermFromText extracts post-termination duration from user prompt variations", () => {
    assert.equal(
      parseConfidentialityTermFromText("the post termination is 5 year intead of 3"),
      "5 years post-termination"
    );
    assert.equal(
      parseConfidentialityTermFromText("The post termination confidentiality should be 5 years"),
      "5 years post-termination"
    );
    assert.equal(
      parseConfidentialityTermFromText("survival period is 5 years post-termination"),
      "5 years post-termination"
    );
    assert.equal(
      parseConfidentialityTermFromText("confidentiality duration of 3 years"),
      "3 years post-termination"
    );
    assert.equal(
      parseConfidentialityTermFromText("random prompt with no survival"),
      undefined
    );
  });

  it("isFactSatisfied recognizes confidentialityTermYears across various aliases", () => {
    assert.equal(
      isFactSatisfied({ confidentialityTermYears: "5 years" }, "confidentialityTermYears"),
      true
    );
    assert.equal(
      isFactSatisfied({ postTermination: "5 years post-termination" }, "confidentialityTermYears"),
      true
    );
    assert.equal(
      isFactSatisfied({ survivalPeriod: "5 years" }, "confidentialityTermYears"),
      true
    );
    assert.equal(
      isFactSatisfied({ confidentialityDuration: "5 years" }, "confidentialityTermYears"),
      true
    );
    assert.equal(
      isFactSatisfied({}, "confidentialityTermYears"),
      false
    );
  });
});

