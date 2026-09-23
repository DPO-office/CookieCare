import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DraftState } from "../../../models/draft-state.js";
import { assembleDocument } from "../assemble-document.js";
import { runAssemblyCheck } from "../assembly-check.js";
import { buildDealIdentity } from "../deal-identity.js";
import { parsePartyPairFromText } from "../../plan/core-deal-facts.js";
import { resolveApplicablePacks } from "../../../packs/resolve-applicable-packs.js";

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
});
