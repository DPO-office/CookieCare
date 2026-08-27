import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DraftState } from "../../../models/draft-state.js";
import type { StructuredFacts } from "../../../models/structured-facts.js";
import { resolveApplicablePacks } from "../../../packs/resolve-applicable-packs.js";
import { dpaSkillConfig } from "../../../packs/document-types/dpa/skill.config.js";
import { assembleDraftingContext, resolveConditionalWorkUnits, collectSkillConfigs } from "../assemble-drafting-context.js";
import { buildSectionContext } from "../../act/build-section-context.js";
import { findForeignPartyNames, buildDealIdentity } from "../../act/deal-identity.js";
import { runSkillValidationRules } from "../../critique/skill-validation.js";
import { resolveRequirements } from "../resolve-requirements.js";

function baseState(overrides: Partial<DraftState> = {}): DraftState {
  const facts: StructuredFacts = {
    documentType: "dpa",
    partyA: "Acme Controller Inc.",
    partyB: "Beta Processor Ltd.",
    parties: ["Acme Controller Inc.", "Beta Processor Ltd."],
    governingLaw: "Ireland",
    effectiveDate: "2026-01-01",
    processingPurpose: "cloud hosting",
    dataCategories: "contact data",
    dataSubjects: "customers",
    transferMechanism: "No international transfers",
    ...(overrides.structuredFacts ?? {}),
  };
  return {
    request: {
      intent: "CREATE",
      rawInstructions: "Draft a DPA",
      templateId: "tpl_test_1",
      vaultDocumentId: "tpl_test_1",
      playbookId: "pb_test_1",
      clauseIds: ["clause_a"],
      ...(overrides.request ?? {}),
    },
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
      matchedTemplate:
        "## Parties and Background\nThis DPA is between the parties.\n\n## Processing of Personal Data\nProcessor shall process only on documented instructions.",
      applicablePlaybookRules: [
        {
          id: "r1",
          topic: "subprocessors",
          standardPosition: "30 days prior written notice required",
          fallbackPositions: ["15 days notice"],
          walkAwayCondition: "No objection right",
        },
      ],
      fallbackClauses: [
        {
          id: "clause_a",
          text: "Approved sub-processor clause text.",
          clauseType: "subprocessors",
          jurisdiction: "Ireland",
          riskLevel: "Low",
          isApproved: true,
        },
      ],
      historicalReferences: [],
      templateId: "tpl_test_1",
      playbookId: "pb_test_1",
      ...(overrides.retrieval ?? {}),
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
    structuredFacts: facts,
    draftingContext: overrides.draftingContext,
    plan: overrides.plan,
    exhibits: overrides.exhibits,
  };
}

describe("P2/P3 drafting skills + assets", () => {
  it("DPA skill exposes requiredFacts and section briefs", () => {
    assert.ok((dpaSkillConfig.requiredFacts?.length ?? 0) >= 5);
    assert.ok(dpaSkillConfig.sectionBriefs?.some((b) => b.workUnitId === "sec-processing"));
    assert.ok(dpaSkillConfig.validationRules?.some((r) => r.id === "dpa-documented-instructions"));
  });

  it("selected templateId appears in section ACT context", () => {
    const state = baseState();
    const applicable = resolveApplicablePacks(state);
    const workUnits = applicable.typePack.skeleton;
    const draftingContext = assembleDraftingContext(state, applicable, workUnits);
    const withCtx = { ...state, draftingContext, plan: {
      documentType: "dpa",
      packId: "dpa",
      title: "DPA",
      workUnits,
      structuredFacts: state.structuredFacts!,
      missingFacts: [],
      applicableRegimes: [],
      mandatoryChecklist: [],
      loadedSkillPaths: [],
      selectedClauseIds: ["clause_a"],
      selectedTemplateId: "tpl_test_1",
      negotiationPositions: [],
      glossary: {},
    }};
    const unit = workUnits.find((u) => u.id === "sec-parties")!;
    const ctx = buildSectionContext(withCtx, unit);
    assert.equal(ctx.templateId, "tpl_test_1");
    assert.match(ctx.templateBlock, /BASELINE TEMPLATE/);
    assert.match(ctx.templateBlock, /Parties and Background|tpl_test_1/);
  });

  it("selected playbookId rule topic appears in matching section context", () => {
    const state = baseState();
    const applicable = resolveApplicablePacks(state);
    const workUnits = applicable.typePack.skeleton;
    const draftingContext = assembleDraftingContext(state, applicable, workUnits);
    assert.equal(draftingContext.playbook?.id, "pb_test_1");
    const withCtx = {
      ...state,
      draftingContext,
      plan: {
        documentType: "dpa",
        packId: "dpa",
        title: "DPA",
        workUnits,
        structuredFacts: state.structuredFacts!,
        missingFacts: [],
        applicableRegimes: [],
        mandatoryChecklist: [],
        loadedSkillPaths: [],
        selectedClauseIds: [],
        negotiationPositions: draftingContext.playbook?.rules ?? [],
        glossary: {},
      },
    };
    const unit = workUnits.find((u) => u.id === "sec-subprocessors")!;
    const ctx = buildSectionContext(withCtx, unit);
    assert.equal(ctx.playbookId, "pb_test_1");
    assert.match(ctx.playbookBlock, /subprocessors|30 days/i);
    assert.match(ctx.sectionBriefBlock, /SECTION BRIEF/i);
  });

  it("clauseIds prefer exact clauses in drafting context", () => {
    const state = baseState();
    const applicable = resolveApplicablePacks(state);
    const draftingContext = assembleDraftingContext(
      state,
      applicable,
      applicable.typePack.skeleton
    );
    assert.equal(draftingContext.clauses[0]?.id, "clause_a");
  });

  it("phiInvolved activates HIPAA work unit + brief", () => {
    const state = baseState({
      structuredFacts: { documentType: "dpa", phiInvolved: true },
    });
    const applicable = resolveApplicablePacks(state);
    assert.ok(applicable.regimes.some((r) => r.id === "HIPAA_BA"));
    const skills = collectSkillConfigs(applicable);
    const draftingContext = assembleDraftingContext(
      state,
      applicable,
      [
        ...applicable.typePack.skeleton,
        ...applicable.regimes.flatMap((r) => r.additionalWorkUnits),
      ]
    );
    assert.ok(skills.some((s) => s.skillId === "regimes/hipaa-ba"));
    assert.ok(draftingContext.sectionBriefs["sec-hipaa-ba"]);
  });

  it("SCC Module 2 transfer facts activate SCC exhibit", () => {
    const state = baseState({
      structuredFacts: {
        documentType: "dpa",
        transferMechanism: "EU SCCs Module 2 (C2P)",
        sccModule: "Module 2",
      },
    });
    const applicable = resolveApplicablePacks(state);
    const skills = collectSkillConfigs(applicable);
    const conditional = resolveConditionalWorkUnits(skills, state.structuredFacts!);
    assert.ok(conditional.some((u) => u.id === "exhibit-scc"));
  });

  it("UK IDTA transfer facts activate IDTA exhibit", () => {
    const state = baseState({
      structuredFacts: {
        documentType: "dpa",
        governingLaw: "England and Wales",
        transferMechanism: "UK IDTA",
        ukIdta: true,
      },
    });
    const applicable = resolveApplicablePacks(state);
    const skills = collectSkillConfigs(applicable);
    const conditional = resolveConditionalWorkUnits(skills, state.structuredFacts!);
    assert.ok(conditional.some((u) => u.id === "exhibit-idta"));
  });

  it("non-HIPAA / no-transfer do not add those units", () => {
    const state = baseState({
      structuredFacts: {
        documentType: "dpa",
        phiInvolved: false,
        transferMechanism: "No international transfers",
        governingLaw: "Ireland",
      },
    });
    const applicable = resolveApplicablePacks(state);
    assert.ok(
      !applicable.regimes.some((r) => r.id === "HIPAA_BA"),
      `unexpected regimes: ${applicable.regimes.map((r) => r.id).join(",")}`
    );
    const skills = collectSkillConfigs(applicable);
    const conditional = resolveConditionalWorkUnits(skills, state.structuredFacts!);
    assert.ok(!conditional.some((u) => u.id === "exhibit-scc"));
    assert.ok(!conditional.some((u) => u.id === "exhibit-idta"));
  });

  it("findForeignPartyNames ignores Analytics/Systems product terms", () => {
    const identity = buildDealIdentity(
      {
        partyA: "HealthTech Analytics Inc.",
        partyB: "CloudScale Servers Ltd.",
      },
      "dpa"
    );
    assert.ok(identity);
    const foreign = findForeignPartyNames(
      "The Processor may use Google Analytics and Cloud Systems for telemetry. Counterparty Evil Corp is forbidden.",
      identity
    );
    assert.ok(
      !foreign.some((f) => /Google Analytics|Cloud Systems/i.test(f)),
      `unexpected product false-positives: ${foreign.join(" | ")}`
    );
    assert.ok(
      foreign.some((f) => /Evil Corp/i.test(f)),
      `expected Evil Corp in ${foreign.join(" | ")}`
    );
  });

  it("skill validationRules fail/pass without LLM", () => {
    const state = baseState();
    const applicable = resolveApplicablePacks(state);
    const workUnits = applicable.typePack.skeleton;
    const draftingContext = assembleDraftingContext(state, applicable, workUnits);
    const emptyDraft: DraftState = {
      ...state,
      draftingContext,
      plan: {
        documentType: "dpa",
        packId: "dpa",
        title: "DPA",
        workUnits,
        structuredFacts: state.structuredFacts!,
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
        sections: [],
        version: 1,
      },
      exhibits: [],
    };
    const failed = runSkillValidationRules(emptyDraft);
    assert.ok(failed.results.some((r) => r.status === "missing" || r.status === "fail"));
    assert.ok(failed.fixItems.length > 0);
    assert.ok(failed.fixItems.every((f) => f.workUnitId));

    const filled: DraftState = {
      ...emptyDraft,
      draft: {
        rawOutput: "x",
        formattedDocument: workUnits
          .filter((u) => u.kind === "section")
          .map((u) => `## ${u.heading}\nProcessor shall process only on documented instructions.`)
          .join("\n\n"),
        sections: workUnits
          .filter((u) => u.kind === "section")
          .map((u) => ({
            id: u.id,
            heading: u.heading,
            body: `## ${u.heading}\nProcessor shall process only on documented instructions.`,
            workUnitId: u.id,
          })),
        version: 1,
      },
      exhibits: [
        {
          workUnitId: "exhibit-processing",
          title: "Details of Processing",
          body: "Purpose: cloud hosting",
        },
        {
          workUnitId: "exhibit-security",
          title: "TOMs",
          body: "Encryption and access controls",
        },
      ],
    };
    const passed = runSkillValidationRules(filled);
    const criticalFails = passed.results.filter(
      (r) => r.status === "fail" || r.status === "missing"
    );
    assert.equal(criticalFails.length, 0);
  });

  it("user fact not overwritten by safeDefault", () => {
    const state = baseState({
      structuredFacts: {
        documentType: "dpa",
        breachNotification: "24 hours of becoming aware",
      },
    });
    const resolved = resolveRequirements(state);
    assert.equal(
      resolved.structuredFacts?.breachNotification,
      "24 hours of becoming aware"
    );
  });

  it("miss path records metadata shape without inventing assets", () => {
    const state = baseState({
      retrieval: {
        matchedTemplate: null,
        applicablePlaybookRules: [],
        fallbackClauses: [],
        historicalReferences: [],
        misses: [
          { asset: "playbook", id: "pb_missing", reason: "playbook_id_not_found" },
        ],
      },
    });
    assert.equal(state.retrieval.misses?.[0]?.asset, "playbook");
    assert.equal(state.retrieval.applicablePlaybookRules.length, 0);
  });
});
