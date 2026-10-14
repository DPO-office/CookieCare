import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DraftState } from "../../../models/draft-state.js";
import {
  assignExhibitLetters,
  materializeExhibits,
} from "../materialize-exhibits.js";
import type { ExhibitSpec } from "../../../models/draft-exhibits.js";

function baseState(specs: ExhibitSpec[]): DraftState {
  return {
    request: { intent: "CREATE", rawInstructions: "DPA with SCC" },
    requirements: {
      contractType: "dpa",
      jurisdiction: "Ireland",
      industry: "General",
      parties: ["Acme Controller Inc.", "Beta Processor Ltd."],
      requiredClauses: [],
      optionalClauses: [],
      language: "English",
      instructions: "DPA",
    },
    retrieval: {
      matchedTemplate: null,
      applicablePlaybookRules: [],
      fallbackClauses: [],
      historicalReferences: [],
    },
    context: null,
    draft: {
      rawOutput: "",
      formattedDocument: "",
      version: 1,
      sections: [
        {
          id: "sec-transfers",
          workUnitId: "sec-transfers",
          heading: "International Transfers",
          body: "## International Transfers\n\nTransfers require a valid mechanism.",
        },
      ],
    },
    validation: null,
    riskReview: null,
    exhibits: [],
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
      transferMechanism: "EU SCCs Module 2 (C2P)",
    },
    plan: {
      documentType: "dpa",
      packId: "dpa",
      title: "DPA",
      workUnits: [
        {
          id: "sec-transfers",
          kind: "section",
          heading: "International Transfers",
          dependsOn: [],
          clauseTypes: ["transfers"],
          status: "drafted",
        },
        {
          id: "exhibit-scc",
          kind: "exhibit",
          heading: "EU SCCs Module 2",
          dependsOn: ["sec-transfers"],
          clauseTypes: ["scc"],
          status: "pending",
        },
      ],
      structuredFacts: {},
      missingFacts: [],
      applicableRegimes: [],
      mandatoryChecklist: [],
      loadedSkillPaths: [],
      selectedClauseIds: [],
      negotiationPositions: [],
      glossary: {},
    },
    draftingContext: {
      documentType: "dpa",
      skillIds: [],
      facts: {},
      userIntent: { rawInstructions: "", exclusions: [], preferences: [] },
      conflicts: [],
      gaps: [],
      outline: [],
      provenance: { clauses: [] },
      clauses: [],
      sectionBriefs: {},
      exhibitBriefs: {},
      exhibitSpecs: specs,
      validationRules: [],
      skills: [],
    },
  };
}

describe("exhibits first-class", () => {
  it("assigns letters A/B in work-unit order", () => {
    const specs: ExhibitSpec[] = [
      {
        id: "exhibit-security",
        title: "TOMs",
        kind: "toms",
        requiresFullText: false,
        parentSectionId: "sec-security",
      },
      {
        id: "exhibit-processing",
        title: "Processing",
        kind: "schedule",
        requiresFullText: false,
        parentSectionId: "sec-processing",
      },
    ];
    const ordered = assignExhibitLetters(specs, [
      "exhibit-processing",
      "exhibit-security",
    ]);
    assert.equal(ordered[0].id, "exhibit-processing");
    assert.equal(ordered[0].letter, "A");
    assert.equal(ordered[1].letter, "B");
  });

  it("materializes SCC full text and cross-refs parent section", async () => {
    const specs: ExhibitSpec[] = [
      {
        id: "exhibit-scc",
        title: "EU Standard Contractual Clauses (Module 2)",
        kind: "sccs",
        requiresFullText: true,
        parentSectionId: "sec-transfers",
        sourceFile: "scc-module-2.md",
        sourceText:
          "# Module 2 Body\n\nThe data exporter is the Controller. The data importer is the Processor.",
      },
    ];
    const next = await materializeExhibits(baseState(specs));
    const exhibit = next.exhibits?.find((e) => e.workUnitId === "exhibit-scc");
    assert.ok(exhibit);
    assert.match(exhibit!.body, /Module 2 Body/);
    assert.match(exhibit!.body, /Acme Controller Inc\./);
    const parent = next.draft?.sections?.find((s) => s.workUnitId === "sec-transfers");
    assert.match(parent?.body ?? "", /See Schedule A/);
    assert.equal(next.draftingContext?.exhibitSpecs?.[0]?.letter, "A");
  });
});
