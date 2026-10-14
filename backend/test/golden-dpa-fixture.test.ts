import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { documentTypeRegistry } from "../src/modules/drafting/packs/document-types/registry.js";
import { regimeRegistry } from "../src/modules/drafting/packs/regimes/registry.js";
import { jurisdictionRegistry } from "../src/modules/drafting/packs/jurisdictions/registry.js";
import { orderByDependency } from "../src/modules/drafting/utils/topo-batches.js";
import { resolveApplicablePacks } from "../src/modules/drafting/packs/resolve-applicable-packs.js";
import { loadSkillDocs } from "../src/modules/drafting/packs/load-skill-docs.js";
import {
  detectGaps,
  DetectGapsOutputSchema,
  type DetectGapsOutput,
} from "../src/modules/drafting/capabilities/plan/detect-gaps.js";
import type { DraftState } from "../src/modules/drafting/models/draft-state.js";
import { initAgentRunState } from "../src/modules/drafting/pac/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    path.join(__dirname, "../src/modules/drafting/eval/fixtures/omnihealth-dpa.json"),
    "utf8"
  )
);

function fixtureState(): DraftState {
  return {
    agent: initAgentRunState("CREATE"),
    structuredFacts: {
      documentType: fixture.documentType,
      governingLaw: fixture.governingLaw,
      parties: fixture.parties,
      phiInvolved: fixture.phiInvolved,
      dataTransfer: fixture.dataTransfer,
    },
    request: {
      intent: "CREATE",
      rawInstructions:
        "Draft a DPA between OmniHealth Ltd (controller, Ireland) and CyberShield Inc (processor, US). PHI involved. EEA to non-EEA transfers.",
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
  };
}

/** Deterministic mock output standing in for the LLM on CI. */
function cannedDetectGapsOutput(): DetectGapsOutput {
  return DetectGapsOutputSchema.parse({
    missingFacts: [
      {
        field: "sccModule",
        question:
          "Which SCC module applies to this transfer — Module 2 (controller-to-processor) or Module 3 (processor-to-processor)?",
        severity: "critical",
        reasonRequired:
          "The transfer mechanism clause cites a specific SCC module; drafting the wrong one misstates the parties' actual data-transfer relationship.",
      },
    ],
    checklist: [
      {
        id: "dpa-security-measures",
        source: "documentType",
        sourcePackId: "dpa",
        requirement: "Appropriate technical and organisational security measures are described",
        severity: "critical",
        sourceExcerpt: "The DPA must describe appropriate technical and organisational security measures",
        sectionTarget: "sec-security",
      },
      {
        id: "dpa-subprocessor-flowdown",
        source: "documentType",
        sourcePackId: "dpa",
        requirement: "Sub-processor engagement and flow-down obligations are addressed",
        severity: "critical",
        sourceExcerpt: "Sub-processor engagement and flow-down obligations must be addressed",
        sectionTarget: "sec-subprocessors",
      },
      {
        id: "gdpr-art28-subprocessor-flowdown",
        source: "regime",
        sourcePackId: "GDPR_ART28",
        requirement:
          "Any sub-processor is bound by data-protection obligations equivalent to those in the DPA",
        severity: "critical",
        sourceExcerpt:
          "any sub-processor must be bound by data-protection obligations equivalent to those in the DPA",
        sectionTarget: "sec-subprocessors",
      },
      {
        id: "gdpr-transfer-mechanism-specified",
        source: "regime",
        sourcePackId: "GDPR_ART28",
        requirement:
          "Document specifies the international transfer mechanism and, if SCCs, the applicable module",
        severity: "critical",
        sourceExcerpt:
          "the DPA must specify the transfer mechanism (e.g. Standard Contractual Clauses) and, if SCCs are used, identify the applicable SCC module",
        sectionTarget: "sec-transfers",
      },
      {
        id: "hipaa-ba-safeguards",
        source: "regime",
        sourcePackId: "HIPAA_BA",
        requirement: "HIPAA administrative, physical, and technical safeguards are required",
        severity: "critical",
        sourceExcerpt: "The BA must implement HIPAA administrative, physical, and technical safeguards",
        sectionTarget: "sec-hipaa-ba",
      },
      {
        id: "hipaa-ba-breach",
        source: "regime",
        sourcePackId: "HIPAA_BA",
        requirement: "Breach notification to the covered entity is required",
        severity: "critical",
        sourceExcerpt: "Breach notification to the covered entity is required under the HIPAA Breach Notification Rule",
        sectionTarget: "sec-breach",
      },
      {
        id: "ireland-governing-law",
        source: "jurisdiction",
        sourcePackId: "ireland",
        requirement: "Governing law and courts of Ireland are stated",
        severity: "critical",
        sourceExcerpt: "Governing law and courts of Ireland must be stated",
        sectionTarget: "sec-misc",
      },
      {
        id: "dpa-breach-notification",
        source: "documentType",
        sourcePackId: "dpa",
        requirement: "Personal data breach notification obligations are present",
        severity: "critical",
        sourceExcerpt: "Personal data breach notification obligations must be present",
        sectionTarget: "sec-breach",
      },
    ],
  });
}

test("golden DPA fixture resolves expected packs and exhibits", () => {
  const typePack = documentTypeRegistry.get(fixture.documentType);
  const facts = {
    documentType: fixture.documentType,
    governingLaw: fixture.governingLaw,
    parties: fixture.parties,
    phiInvolved: fixture.phiInvolved,
    dataTransfer: fixture.dataTransfer,
  };
  const regimes = regimeRegistry.all().filter((r) => r.triggerCondition(facts));
  const jurisdiction = jurisdictionRegistry.get(
    jurisdictionRegistry.resolveId(fixture.governingLaw)!
  );

  assert.equal(jurisdiction?.id, fixture.expectedJurisdiction);
  for (const id of fixture.expectedRegimes) {
    assert.ok(
      regimes.some((r) => r.id === id),
      `Expected regime ${id}`
    );
  }

  const workUnits = orderByDependency([
    ...typePack.skeleton,
    ...regimes.flatMap((r) => r.additionalWorkUnits),
  ]);
  for (const exhibitId of fixture.expectedExhibits) {
    assert.ok(
      workUnits.some((u) => u.id === exhibitId),
      `Expected exhibit work unit ${exhibitId}`
    );
  }
});

test("golden DPA loadSkillDocs returns document-type, regime, and jurisdiction skills", async () => {
  const applicable = resolveApplicablePacks(fixtureState());
  const docs = await loadSkillDocs(applicable);
  assert.ok(docs.some((d) => d.packType === "documentType" && d.packId === "dpa"));
  assert.ok(docs.some((d) => d.packType === "regime" && d.packId === "GDPR_ART28"));
  assert.ok(docs.some((d) => d.packType === "regime" && d.packId === "HIPAA_BA"));
  assert.ok(docs.some((d) => d.packType === "jurisdiction" && d.packId === "ireland"));
  for (const d of docs) {
    assert.ok(d.content.includes("#"), `skill.md for ${d.packId} should have content`);
  }
});

test("detectGaps on golden fixture (mocked LLM): critical SCC + checklist coverage + stable ids", async () => {
  const canned = cannedDetectGapsOutput();
  const llmCall = async () => canned;

  const first = await detectGaps(fixtureState(), { llmCall });
  const second = await detectGaps(fixtureState(), { llmCall });

  assert.ok(first.checklist.length >= fixture.minChecklistItems);
  for (const field of fixture.expectedCriticalMissingFields) {
    assert.ok(
      first.missingFacts.some((m) => m.field === field && m.severity === "critical"),
      `Expected critical missingFact ${field}`
    );
  }
  for (const needle of fixture.expectedChecklistIdSubstrings) {
    assert.ok(
      first.checklist.some((c) => c.id.toLowerCase().includes(String(needle).toLowerCase())),
      `Expected checklist id containing ${needle}`
    );
  }

  const firstIds = first.checklist.map((c) => c.id).sort();
  const secondIds = second.checklist.map((c) => c.id).sort();
  assert.deepEqual(firstIds, secondIds);

  const applicable = resolveApplicablePacks(fixtureState());
  const workUnitIds = new Set(
    orderByDependency([
      ...applicable.typePack.skeleton,
      ...applicable.regimes.flatMap((r) => r.additionalWorkUnits),
    ]).map((u) => u.id)
  );
  for (const item of first.checklist) {
    if (item.sectionTarget) {
      assert.ok(
        workUnitIds.has(item.sectionTarget),
        `Checklist ${item.id} targets missing workUnit ${item.sectionTarget}`
      );
    }
  }
});

const live = process.env.DETECT_GAPS_LIVE === "1";

test(
  "detectGaps live golden fixture: critical items + idempotent ids",
  { skip: !live },
  async () => {
    const first = await detectGaps(fixtureState());
    const second = await detectGaps(fixtureState());

    assert.ok(first.checklist.length >= fixture.minChecklistItems);
    assert.ok(
      first.missingFacts.some((m) => m.field === "sccModule" && m.severity === "critical") ||
        first.checklist.some((c) => /transfer|scc/i.test(c.id + c.requirement)),
      "Expected SCC/transfer gap or checklist item"
    );
    assert.ok(
      first.checklist.some((c) => /subprocessor/i.test(c.id + c.requirement)),
      "Expected subprocessor checklist item"
    );

    const firstIds = first.checklist.map((c) => c.id).sort();
    const secondIds = second.checklist.map((c) => c.id).sort();
    assert.deepEqual(firstIds, secondIds);
  }
);
