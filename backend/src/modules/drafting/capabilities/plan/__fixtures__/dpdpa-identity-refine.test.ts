import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPlaceholderString,
  isFactSatisfied,
} from "../core-deal-facts.js";
import {
  buildDealIdentity,
  formatDealIdentityLock,
} from "../../act/deal-identity.js";
import { assembleDocument } from "../../act/assemble-document.js";
import { hipaaBaPack } from "../../../packs/regimes/hipaa-ba/pack.js";
import { resolveApplicablePacks } from "../../../packs/resolve-applicable-packs.js";
import {
  extractFactOverrides,
  applyPartyNameToSections,
  applyFixPlan,
  syncBreachHoursInExhibits,
} from "../../act/apply-fix-plan.js";
import {
  classifyTargetSections,
  planHumanRefine,
} from "../../act/section-refine.js";
import type { DraftState, DraftSection } from "../../../models/draft-state.js";

describe("DPDPA identity resolution and refinement fixes", () => {
  it("treats Data Fiduciary and Data Processor as placeholders, not real corporate legal names", () => {
    assert.equal(isPlaceholderString("Data Fiduciary"), true);
    assert.equal(isPlaceholderString("Data Processor"), true);
    assert.equal(isPlaceholderString("the data fiduciary"), true);
    assert.equal(isPlaceholderString("the data processor"), true);
    assert.equal(isPlaceholderString("Controller"), true);
    assert.equal(isPlaceholderString("Processor"), true);
    assert.equal(isPlaceholderString("Google LTD"), false);
    assert.equal(isPlaceholderString("Randstad Digital LTD"), false);

    // Initial prompt where party names were just roles:
    const initialFacts: Record<string, unknown> = {
      partyA: "Data Fiduciary",
      partyB: "Data Processor",
      parties: ["Data Fiduciary", "Data Processor"],
    };
    assert.equal(isFactSatisfied(initialFacts, "parties"), false);

    // After user provides real legal names:
    const answeredFacts: Record<string, unknown> = {
      ...initialFacts,
      dataFiduciaryLegalName: "Google LTD",
      dataProcessorLegalName: "Randstad Digital LTD",
    };
    assert.equal(isFactSatisfied(answeredFacts, "parties"), true);
  });

  it("buildDealIdentity resolves DPDPA statutory roles and real corporate names without GDPR labels", () => {
    const facts = {
      documentType: "dpa",
      privacyRegime: "DPDPA",
      governingLaw: "India",
      dataFiduciaryLegalName: "Google LTD",
      dataProcessorLegalName: "Randstad Digital LTD",
      dataFiduciaryCin: "U72900KA2003PTC033028",
      dataProcessorCin: "223423411243",
      effectiveDate: "2026-09-08",
    };

    const identity = buildDealIdentity(facts, "dpa");
    assert.ok(identity);
    assert.equal(identity.partyA, "Google LTD");
    assert.equal(identity.partyB, "Randstad Digital LTD");
    assert.equal(identity.roleA, "Data Fiduciary");
    assert.equal(identity.roleB, "Data Processor");

    const lock = formatDealIdentityLock(identity);
    assert.match(lock, /Data Fiduciary \/ Party A legal name: Google LTD/);
    assert.match(lock, /Data Processor \/ Party B legal name: Randstad Digital LTD/);
    assert.match(lock, /Do NOT use GDPR labels "Controller", "Processor", or "Data Subject"/);
    assert.doesNotMatch(lock, /Controller \/ Party A/);
  });

  it("assembleDocument produces a clean DPDPA preamble without Controller/Processor labels", async () => {
    const state: DraftState = {
      request: {
        intent: "CREATE",
        rawInstructions: "Draft DPA",
      },
      structuredFacts: {
        documentType: "dpa",
        privacyRegime: "DPDPA",
        governingLaw: "Delhi, India",
        effectiveDate: "2026-09-08",
        dataFiduciaryLegalName: "Google LTD",
        dataProcessorLegalName: "Randstad Digital LTD",
        dataFiduciaryAddress:
          "No 3, RMZ Infinity - Tower E, Old Madras Road, 4th & 5th Floors, Bengaluru, Karnataka, 560016, India",
        dataProcessorAddress: "450 Capability Green, Luton, United Kingdom, LU1 3LU",
        dataFiduciaryCin: "U72900KA2003PTC033028",
        dataProcessorCin: "223423411243",
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
        ],
        structuredFacts: {},
        missingFacts: [],
        applicableRegimes: ["DPDPA"],
        mandatoryChecklist: [],
        loadedSkillPaths: [],
        selectedClauseIds: [],
        negotiationPositions: [],
        glossary: {},
      },
      draft: {
        rawOutput: "",
        formattedDocument: "",
        sections: [
          {
            id: "sec-parties",
            heading: "Parties and Background",
            body: "The Parties agree to this DPA.",
          },
        ],
        version: 1,
      },
      requirements: null,
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
    };

    const assembled = await assembleDocument(state);
    const doc = assembled.draft!.formattedDocument;

    // Check that preamble does not use Controller / Processor
    assert.doesNotMatch(doc, /between.*\(the\s*["“]Controller["”]\)/i);
    assert.doesNotMatch(doc, /between.*\(the\s*["“]Processor["”]\)/i);
    // Check that Google LTD and Randstad Digital LTD are in the preamble
    assert.match(doc, /Google LTD/);
    assert.match(doc, /Randstad Digital LTD/);
    assert.match(doc, /Data Fiduciary/);
    assert.match(doc, /Data Processor/);
  });

  it("does NOT trigger HIPAA BA pack on Indian DPDPA agreements when health data is listed", () => {
    const dpdpaFacts = {
      documentType: "dpa",
      privacyRegime: "DPDPA",
      governingLaw: "Delhi, India",
      dataCategories: "contact data, health data etc",
      processingPurpose: "cloud hosting",
      dataSubjects: "employee",
    };

    assert.equal(hipaaBaPack.triggerCondition(dpdpaFacts), false);

    const applicable = resolveApplicablePacks({
      structuredFacts: dpdpaFacts,
      request: {
        rawInstructions: "Draft a DPDPA agreement with health data",
      },
      requirements: null,
      retrieval: {
        matchedTemplate: null,
        applicablePlaybookRules: [],
        fallbackClauses: [],
        historicalReferences: [],
      },
      context: null,
      draft: null,
      validation: null,
      riskReview: null,
      metadata: {
        generationParameters: {},
        playbookVersion: "1.0.0",
        timestamp: new Date().toISOString(),
      },
    } as any);

    const regimeIds = applicable.regimes.map((r) => r.id);
    assert.ok(regimeIds.includes("DPDPA"));
    assert.equal(regimeIds.includes("HIPAA_BA"), false);
  });

  it("handles follow-up refinement: swaps Data Fiduciary to Randstad Digital LTD and Data Processor to Google LTD", async () => {
    const instruction =
      "in this draft Data Fiduciary = Randstad Digital LTD and Data Processor= Google LTD\n\ncan you changes it everywhere";

    const overrides = extractFactOverrides(instruction);
    assert.equal(overrides.dataFiduciaryLegalName, "Randstad Digital LTD");
    assert.equal(overrides.dataProcessorLegalName, "Google LTD");
    assert.equal(overrides.partyA, "Randstad Digital LTD");
    assert.equal(overrides.partyB, "Google LTD");

    // Existing draft that had Data Fiduciary and Data Processor
    const priorState: DraftState = {
      structuredFacts: {
        documentType: "dpa",
        privacyRegime: "DPDPA",
        governingLaw: "Delhi, India",
        dataFiduciaryLegalName: "Google LTD",
        dataProcessorLegalName: "Randstad Digital LTD",
        effectiveDate: "2026-09-08",
      },
      request: {
        intent: "REFINEMENT",
        rawInstructions: instruction,
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
        ],
        structuredFacts: {},
        missingFacts: [],
        applicableRegimes: ["DPDPA"],
        mandatoryChecklist: [],
        loadedSkillPaths: [],
        selectedClauseIds: [],
        negotiationPositions: [],
        glossary: {},
      },
      draft: {
        rawOutput: "",
        formattedDocument: "",
        sections: [
          {
            id: "sec-parties",
            heading: "Parties and Background",
            body: `Google LTD (hereinafter referred to as the “Data Fiduciary”); and\n\nRandstad Digital LTD (hereinafter referred to as the “Data Processor”).`,
          },
          {
            id: "sec-definitions",
            heading: "Definitions",
            body: `“Data Fiduciary” means Google LTD, being the entity...\n\n“Data Processor” means Randstad Digital LTD, being any person...`,
          },
        ],
        version: 1,
      },
      requirements: null,
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
    };

    const refined = await applyFixPlan(priorState);

    assert.equal(refined.structuredFacts?.dataFiduciaryLegalName, "Randstad Digital LTD");
    assert.equal(refined.structuredFacts?.dataProcessorLegalName, "Google LTD");
    assert.equal(refined.structuredFacts?.partyA, "Randstad Digital LTD");
    assert.equal(refined.structuredFacts?.partyB, "Google LTD");

    const formatted = refined.draft!.formattedDocument;
    // Check that Preamble reflects the swapped parties
    assert.match(formatted, /between Randstad Digital LTD \(the "Data Fiduciary"\) and Google LTD \(the "Data Processor"\)/);

    // Check that Section 1 Parties reflects the swapped parties
    const secParties = refined.draft!.sections.find((s) => s.id === "sec-parties");
    assert.ok(secParties);
    assert.match(secParties.body, /Randstad Digital LTD \(hereinafter referred to as the “Data Fiduciary”\)/);
    assert.match(secParties.body, /Google LTD \(hereinafter referred to as the “Data Processor”\)/);

    // Check that Section 2 Definitions reflects the swapped parties
    const secDefs = refined.draft!.sections.find((s) => s.id === "sec-definitions");
    assert.ok(secDefs);
    assert.match(secDefs.body, /“Data Fiduciary” means Randstad Digital LTD,/);
    assert.match(secDefs.body, /“Data Processor” means Google LTD,/);

    // Check signature block
    assert.match(formatted, /\*\*Randstad Digital LTD \(Data Fiduciary\)\*\*/);
    assert.match(formatted, /\*\*Google LTD \(Data Processor\)\*\*/);
  });

  it("handles complex real-world swap prompt with trailing 'everywhere', HIPAA removal, and exhibits update", async () => {
    const prompt =
      'In this draft, swap the parties so Data Fiduciary = Randstad Digital LTD and Data Processor = Google LTD everywhere, remove any HIPAA clauses, and ensure no GDPR "Controller" labels appear.';

    const overrides = extractFactOverrides(prompt);
    assert.equal(overrides.dataFiduciaryLegalName, "Randstad Digital LTD");
    assert.equal(overrides.dataProcessorLegalName, "Google LTD");

    const state: DraftState = {
      structuredFacts: {
        documentType: "dpa",
        privacyRegime: "DPDPA",
        governingLaw: "India",
        dataFiduciaryLegalName: "Google LTD",
        dataProcessorLegalName: "Randstad Digital LTD",
        dataFiduciaryCin: "123423423",
        dataProcessorCin: "123324243",
        effectiveDate: "2026-09-17",
      },
      request: {
        intent: "REFINEMENT",
        rawInstructions: prompt,
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
            id: "sec-misc",
            kind: "section",
            heading: "Miscellaneous",
            dependsOn: [],
            clauseTypes: ["misc"],
            status: "drafted",
          },
          {
            id: "sec-hipaa-ba",
            kind: "section",
            heading: "HIPAA Business Associate Provisions",
            dependsOn: [],
            clauseTypes: ["compliance"],
            status: "drafted",
          },
        ],
        structuredFacts: {},
        missingFacts: [],
        applicableRegimes: ["DPDPA"],
        mandatoryChecklist: [],
        loadedSkillPaths: [],
        selectedClauseIds: [],
        negotiationPositions: [],
        glossary: {},
      },
      exhibits: [
        {
          workUnitId: "exhibit-processing",
          title: "Details of Processing",
          body: `Google LTD and 123423423 (the "Data Processor") shall process personal data on behalf of Randstad Digital LTD and 123324243 (the "Data Fiduciary") solely for cloud hosting. The Data Controller shall give instructions.`,
        },
        {
          workUnitId: "exhibit-security",
          title: "Technical and Organisational Measures",
          body: `Technical measures that the Data Processor (Google LTD and 123423423) shall implement on behalf of the Data Fiduciary (Randstad Digital LTD and 123324243).`,
        },
      ],
      draft: {
        rawOutput: "",
        formattedDocument: "",
        sections: [
          {
            id: "sec-parties",
            heading: "Parties and Background",
            body: `1. **Google LTD and 123423423**, acting as the data fiduciary (hereinafter referred to as the "Data Fiduciary"); and\n2. **Randstad Digital LTD and 123324243**, acting as the data processor (hereinafter referred to as the "Data Processor").`,
          },
          {
            id: "sec-misc",
            heading: "Miscellaneous",
            body: `During the term, Google LTD and 123423423 shall not solicit employees of Randstad Digital LTD and 123324243. The Data Controller and Data Processor agree to these terms.`,
          },
          {
            id: "sec-hipaa-ba",
            heading: "HIPAA Business Associate Provisions",
            body: `The parties shall comply with HIPAA standards for protected health information.`,
          },
        ],
        version: 1,
      },
      requirements: null,
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
    };

    const refined = await applyFixPlan(state);

    assert.equal(refined.structuredFacts?.dataFiduciaryLegalName, "Randstad Digital LTD");
    assert.equal(refined.structuredFacts?.dataProcessorLegalName, "Google LTD");
    // CINs should have swapped as well:
    assert.equal(refined.structuredFacts?.dataFiduciaryCin, "123324243");
    assert.equal(refined.structuredFacts?.dataProcessorCin, "123423423");

    const doc = refined.draft!.formattedDocument;
    // 1. Preamble check
    assert.match(doc, /Randstad Digital LTD/);
    assert.match(doc, /Google LTD/);
    assert.doesNotMatch(doc, /Google LTD everywhere/);
    assert.doesNotMatch(doc, /Randstad Digital LTD everywhere/);

    // 2. Section 1 check
    const secParties = refined.draft!.sections.find((s) => s.id === "sec-parties");
    assert.ok(secParties);
    assert.match(secParties.body, /1\.\s*\*\*Randstad Digital LTD\*\*,\s*acting as the data fiduciary/);
    assert.match(secParties.body, /2\.\s*\*\*Google LTD\*\*,\s*acting as the data processor/);

    // 3. Section 10 / Misc check
    const secMisc = refined.draft!.sections.find((s) => s.id === "sec-misc");
    assert.ok(secMisc);
    assert.match(secMisc.body, /Randstad Digital LTD shall not solicit employees of Google LTD/);
    assert.doesNotMatch(secMisc.body, /Data Controller/);
    assert.match(secMisc.body, /Data Fiduciary/);

    // 4. Exhibits check
    const exhA = refined.exhibits!.find((e) => e.workUnitId === "exhibit-processing");
    assert.ok(exhA);
    assert.match(exhA.body, /Google LTD \(the "Data Processor"\) shall process personal data on behalf of Randstad Digital LTD \(the "Data Fiduciary"\)/);
    assert.doesNotMatch(exhA.body, /Data Controller/);

    const exhB = refined.exhibits!.find((e) => e.workUnitId === "exhibit-security");
    assert.ok(exhB);
    assert.match(exhB.body, /Data Processor \(Google LTD\)/);
    assert.match(exhB.body, /Data Fiduciary \(Randstad Digital LTD\)/);

    // 5. HIPAA removal check
    const hipaaSec = refined.draft!.sections.find((s) => s.id === "sec-hipaa-ba");
    assert.equal(hipaaSec, undefined);
    assert.doesNotMatch(doc, /HIPAA Business Associate Provisions/);

    // 6. Controller label check
    assert.doesNotMatch(doc, /"Controller"/);
    assert.doesNotMatch(doc, /Data Controller/);

    // 7. Signature block check
    assert.match(doc, /\*\*Randstad Digital LTD \(Data Fiduciary\)\*\*/);
    assert.match(doc, /\*\*Google LTD \(Data Processor\)\*\*/);
  });

  it("accurately targets breach and indemnity sections for breach window & indemnity prompt", () => {
    const sections: DraftSection[] = [
      { id: "sec-parties", heading: "Parties and Background", body: "This Agreement is entered into by..." },
      { id: "sec-definitions", heading: "Definitions", body: "Personal Data means any data about an individual..." },
      { id: "sec-processing", heading: "Processing of Personal Data", body: "The Data Processor shall process Personal Data..." },
      { id: "sec-security", heading: "Security Measures", body: "Technical and organisational measures..." },
      { id: "sec-subprocessors", heading: "Sub-processors", body: "The Data Processor may engage sub-processors..." },
      { id: "sec-transfers", heading: "Cross-Border Transfers", body: "Transfers outside India..." },
      { id: "sec-assistance", heading: "Data Principal Rights and Assistance", body: "Assistance with rights..." },
      { id: "sec-breach", heading: "Personal Data Breach Notification", body: "The Data Processor shall notify within 48 hours..." },
      { id: "sec-return", heading: "Return or Deletion of Personal Data", body: "Upon termination, erase or return..." },
      { id: "sec-misc", heading: "Miscellaneous", body: "1. Governing Law\n2. Liability and Indemnification: The Data Processor shall..." },
    ];

    const prompt =
      "Shorten the personal data breach notification window to 24 hours (instead of 48 or 72 hours), and add a strict indemnity clause in favor of the Data Fiduciary for processor negligence.";

    const targets = classifyTargetSections(sections, prompt);
    assert.ok(targets);
    assert.ok(targets.length >= 2);

    const targetIds = targets.map((t) => t.id);
    // Must target Breach (Section 8) and Miscellaneous (Section 10 where indemnity lives)
    assert.ok(targetIds.includes("sec-breach"), "Must include sec-breach");
    assert.ok(targetIds.includes("sec-misc"), "Must include sec-misc");

    // Must NOT falsely match Definitions or Processing due to "clause in"
    assert.equal(targetIds.includes("sec-definitions"), false, "Must not falsely match definitions");
    assert.equal(targetIds.includes("sec-processing"), false, "Must not falsely match processing");
  });

  it("syncBreachHoursInExhibits synchronizes Schedule B SLA hours from 48 to 24 hours", () => {
    const state: DraftState = {
      request: {
        intent: "REFINEMENT",
        rawInstructions: "Shorten the personal data breach notification window to 24 hours (instead of 48 or 72 hours)",
      },
      exhibits: [
        {
          workUnitId: "exhibit-processing",
          title: "Details of Processing",
          body: "Categories of personal data and processing purposes.",
        },
        {
          workUnitId: "exhibit-security",
          title: "Technical and Organisational Measures and Breach SLA",
          body: "The Data Processor shall notify the Data Fiduciary in writing within 48 hours of becoming aware of any Personal Data Breach.",
        },
      ],
      draft: {
        rawOutput: "",
        formattedDocument: "",
        sections: [],
        version: 1,
      },
      structuredFacts: {},
      requirements: null,
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
    };

    const synced = syncBreachHoursInExhibits(state, state.request.rawInstructions);
    assert.ok(synced.exhibits);
    const secExhibit = synced.exhibits.find((e) => e.workUnitId === "exhibit-security");
    assert.ok(secExhibit);
    assert.match(secExhibit.body, /within 24 hours/);
    assert.doesNotMatch(secExhibit.body, /within 48 hours/);
  });
});
