import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DraftState } from "../../../models/draft-state.js";
import type { StructuredFacts } from "../../../models/structured-facts.js";
import { canonicalizeFieldId } from "../../../models/draft-requirements.js";
import { resolveRequirements } from "../resolve-requirements.js";
import { resolveApplicablePacks } from "../../../packs/resolve-applicable-packs.js";
import { computeGapsAndConflicts } from "../compute-gaps.js";
import type { MissingFact } from "../../../models/draft-plan.js";
import { mustAskUser } from "../../../pac/policy.js";
import { initAgentRunState } from "../../../pac/types.js";

function baseState(facts: StructuredFacts, rawInstructions = "test"): DraftState {
  return {
    request: {
      intent: "CREATE",
      rawInstructions,
    },
    requirements: {
      contractType: "dpa",
      jurisdiction: typeof facts.governingLaw === "string" ? facts.governingLaw : "Not specified",
      industry: "General",
      parties: Array.isArray(facts.parties) ? facts.parties : [],
      requiredClauses: [],
      optionalClauses: [],
      language: "English",
      instructions: rawInstructions,
    },
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
    structuredFacts: {
      documentType: "dpa",
      ...facts,
    },
  };
}

function askFields(state: DraftState, detectHints: MissingFact[] = []): string[] {
  const resolved = resolveRequirements(state);
  const missing = computeGapsAndConflicts(resolved, detectHints);
  return missing.map((m) => m.field);
}

describe("ASK resolution P0", () => {
  it("canonicalizeFieldId collapses transfer aliases", () => {
    assert.equal(canonicalizeFieldId("sccModule"), "transferMechanism");
    assert.equal(canonicalizeFieldId("SCC module"), "transferMechanism");
    assert.equal(canonicalizeFieldId("phiCategories"), "dataCategories");
    assert.equal(canonicalizeFieldId("msaDate"), "principalAgreementDate");
  });

  it("rich DPA facts → ASK count 0", () => {
    const fields = askFields(
      baseState({
        parties: ["HealthTech Analytics Inc.", "CloudScale Servers Ltd."],
        partyA: "HealthTech Analytics Inc.",
        partyB: "CloudScale Servers Ltd.",
        governingLaw: "England and Wales",
        privacyRegime: "GDPR",
        effectiveDate: "October 1, 2026",
        principalAgreementDate: "August 1, 2026",
        processingPurpose:
          "cloud hosting, automated backups, disaster recovery, network infrastructure",
        dataCategories:
          "contact details, account credentials, device telemetry, health analytics, PHI",
        dataSubjects:
          "patients, end users, platform account holders, healthcare providers, employees",
        phiInvolved: true,
        transferMechanism: "EU SCCs Module 2 (C2P)",
        sccModule: "Module 2",
        ukIdta: true,
        breachNotification: "24 hours",
        subprocessorNotice: "30 days",
        auditNotice: "14 days",
        deletionReturn: "30 days",
      })
    );
    assert.deepEqual(fields, []);
  });

  it("sparse DPA facts → targeted ASK, not a blind full questionnaire dump of satisfied fields", () => {
    const fields = askFields(
      baseState({
        parties: ["HealthTech Analytics Inc.", "CloudScale Servers Ltd."],
        processingPurpose: "hosting patient data",
      })
    );

    // Parties + purpose satisfied → must not re-ask them
    assert.ok(!fields.includes("parties"));
    assert.ok(!fields.includes("processingPurpose"));

    // No named privacy regime — ask only that choice, not the rest of the form.
    assert.deepEqual(fields, ["privacyRegime"]);
  });

  it("bare DPA asks privacyRegime and does not load GDPR", () => {
    const state = baseState({}, "Draft a DPA");
    const fields = askFields(state);
    assert.deepEqual(fields, ["privacyRegime"]);
    const applicable = resolveApplicablePacks(state);
    assert.ok(!applicable.regimes.some((r) => r.id === "GDPR_ART28"));
  });

  it("named GDPR with parties skips regime and parties", () => {
    const fields = askFields(
      baseState(
        {
          parties: ["Acme Controller Inc.", "Beta Processor Ltd."],
          partyA: "Acme Controller Inc.",
          partyB: "Beta Processor Ltd.",
        },
        "Draft a GDPR DPA. Parties are Acme and Beta."
      )
    );
    assert.ok(!fields.includes("privacyRegime"));
    assert.ok(!fields.includes("parties"));
    assert.ok(fields.includes("transferMechanism"));
    assert.ok(fields.includes("governingLaw"));
  });

  it("DPDPA-only ask does not include the EU transfer question", () => {
    const fields = askFields(
      baseState(
        { governingLaw: "India" },
        "Draft a DPDPA processor agreement. We are the Data Fiduciary."
      )
    );
    assert.ok(!fields.includes("privacyRegime"));
    assert.ok(!fields.includes("transferMechanism"));
  });

  it("alias collapse: sccModule + transferMechanism → one ASK id max", () => {
    const resolved = resolveRequirements(
      baseState({
        parties: ["A Inc.", "B Ltd."],
        governingLaw: "England and Wales",
        effectiveDate: "2026-10-01",
        processingPurpose: "hosting",
        dataCategories: "contact data",
        dataSubjects: "customers",
        transferMechanism: "EU SCCs Module 2 (C2P)",
        sccModule: "Module 2",
      })
    );
    const missing = computeGapsAndConflicts(resolved, [
      {
        field: "sccModule",
        question: "Which SCC module?",
        severity: "critical",
        reasonRequired: "need module",
      },
      {
        field: "transferMechanism",
        question: "Which transfer mechanism?",
        severity: "critical",
        reasonRequired: "need mechanism",
      },
    ]);

    const transferAsks = missing.filter((m) => m.field === "transferMechanism");
    assert.equal(transferAsks.length, 0);
    assert.equal(missing.filter((m) => m.field === "sccModule").length, 0);
  });

  it("detect-gaps=0 cannot be overridden into hardcoded asks when facts are satisfied", () => {
    const fields = askFields(
      baseState({
        parties: ["HealthTech Analytics Inc.", "CloudScale Servers Ltd."],
        governingLaw: "England and Wales",
        effectiveDate: "October 1, 2026",
        processingPurpose: "cloud hosting",
        dataCategories: "PHI and contact data",
        dataSubjects: "patients and end users",
        transferMechanism: "EU SCCs Module 2 and UK IDTA",
      }),
      [] // detect-gaps missingFacts=0
    );
    assert.deepEqual(fields, []);
  });

  it("detect-gaps hints for already-satisfied fields are dropped", () => {
    const fields = askFields(
      baseState({
        parties: ["A Inc.", "B Ltd."],
        governingLaw: "Ireland",
        effectiveDate: "2026-01-01",
        processingPurpose: "SaaS",
        dataCategories: "account IDs",
        dataSubjects: "customers",
        transferMechanism: "No international transfers",
      }),
      [
        {
          field: "processingPurpose",
          question: "What is the purpose?",
          severity: "critical",
          reasonRequired: "needed",
        },
        {
          field: "dataCategories",
          question: "Which categories of PHI?",
          severity: "critical",
          reasonRequired: "needed",
        },
      ]
    );
    assert.deepEqual(fields, []);
  });

  it("effectiveDate covers principalAgreementDate as assumed (no separate ASK)", () => {
    const resolved = resolveRequirements(
      baseState({
        parties: ["A Inc.", "B Ltd."],
        governingLaw: "England and Wales",
        effectiveDate: "October 1, 2026",
        processingPurpose: "hosting",
        dataCategories: "logs",
        dataSubjects: "users",
        transferMechanism: "Adequacy decision only",
      })
    );
    const principal = resolved.draftRequirements?.byId.principalAgreementDate;
    assert.ok(principal);
    assert.equal(principal!.status, "assumed");
    const fields = computeGapsAndConflicts(resolved, []).map((m) => m.field);
    assert.ok(!fields.includes("principalAgreementDate"));
  });

  it("canonicalizeFieldId collapses governing law, party and SLA variations", () => {
    assert.equal(canonicalizeFieldId("governing_jurisdiction"), "governingLaw");
    assert.equal(canonicalizeFieldId("applicable_law"), "governingLaw");
    assert.equal(canonicalizeFieldId("choiceOfLaw"), "governingLaw");
    assert.equal(canonicalizeFieldId("the_governing_law"), "governingLaw");
    assert.equal(canonicalizeFieldId("venue"), "governingLaw");
    assert.equal(canonicalizeFieldId("disclosingParty"), "partyA");
    assert.equal(canonicalizeFieldId("receivingParty"), "partyB");
    assert.equal(canonicalizeFieldId("breach_notification_period"), "breachNotification");
  });

  it("deduplicates LLM-emitted governing_jurisdiction with catalog governingLaw into 1 question", () => {
    const state = baseState(
      {
        parties: ["A Corp", "B Corp"],
        privacyRegime: "GDPR",
      },
      "Draft GDPR DPA"
    );
    const resolved = resolveRequirements(state);
    // Catalog has governingLaw missing. LLM emits governing_jurisdiction.
    const missing = computeGapsAndConflicts(resolved, [
      {
        field: "governing_jurisdiction",
        question: "What is the governing jurisdiction for this contract?",
        severity: "critical",
        reasonRequired: "Required to establish dispute forum",
      },
    ]);

    const governingLawQuestions = missing.filter((m) => m.field === "governingLaw");
    assert.equal(governingLawQuestions.length, 1);
    assert.equal(missing.filter((m) => m.field === "governing_jurisdiction").length, 0);
  });

  it("single-ask guarantee: previously asked fields in agent.askedFieldIds are never re-asked", () => {
    const state = baseState(
      {
        parties: ["A Corp", "B Corp"],
        privacyRegime: "GDPR",
      },
      "Draft GDPR DPA"
    );
    // Simulate Round 1 having already asked governingLaw
    state.agent = initAgentRunState("CREATE", {
      askRounds: 1,
      askedFieldIds: ["governingLaw"],
    });

    const resolved = resolveRequirements(state);
    const missing = computeGapsAndConflicts(resolved, [
      {
        field: "governing_jurisdiction",
        question: "What is the governing law?",
        severity: "critical",
        reasonRequired: "Required",
      },
    ]);

    // governingLaw was already asked in Round 1 -> must NOT be asked again in Round 2
    assert.ok(!missing.some((m) => m.field === "governingLaw"));
    assert.ok(!missing.some((m) => m.field === "governing_jurisdiction"));
  });

  it("max 2-round cap: mustAskUser returns false when askRounds >= 2", () => {
    const state = baseState(
      {
        parties: ["A Corp", "B Corp"],
      },
      "Draft DPA"
    );
    state.agent = initAgentRunState("CREATE", {
      askRounds: 2,
      maxAskRounds: 2,
      askedFieldIds: ["privacyRegime", "governingLaw"],
    });
    state.plan = {
      missingFacts: [
        {
          field: "breachNotification",
          question: "What is the breach SLA?",
          severity: "critical",
          reasonRequired: "Needed",
        },
      ],
    } as any;

    // Even though a critical fact exists, 2 rounds were exhausted -> must not ask again!
    assert.equal(mustAskUser(state), false);
  });
});
