import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DraftState } from "../../../models/draft-state.js";
import { assembleDocument } from "../assemble-document.js";
import { runAssemblyCheck } from "../assembly-check.js";

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
    assert.match(doc, /## Table of Contents/);
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
});
