process.env.GOOGLE_CLOUD_PROJECT ??= "silence-heuristic-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { ClauseObject } from "../../../models/clause-object.js";
import type { SkillRiskCategory } from "../../../skills/types.js";
import { getSkillById, resetSkillRegistryForTests } from "../../../skills/registry.js";

const { evaluateSilencePatterns, findSilenceEvidence, heuristicRisks } = await import(
  "../flag-risk.js"
);

const locator = {
  docId: "doc1",
  structuralPath: "s1",
  charRange: [0, 120] as [number, number],
};

function unit(): AnalysisWorkUnit {
  return {
    workUnitId: "wu-risk",
    tool: "flag_risk",
    input: {},
    dependsOn: [],
    outputSchema: "Finding[]",
    status: "pending",
  };
}

function clause(
  clauseId: string,
  clauseType: string,
  text: string
): ClauseObject {
  return {
    clauseId,
    clauseType,
    text,
    locator,
    taxonomyVersion: "test",
  };
}

describe("authored silencePattern", () => {
  it("fires the GDPR cost-allocation silence detector on assistance without cost language", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr");
    const cat = gdpr?.riskCategories.find((c) => c.category === "cost_allocation_silent");
    assert.ok(cat?.silencePattern);

    const silent = clause(
      "assistance",
      "processor_assistance_obligation",
      "Processor shall assist Controller with data subject requests."
    );
    const findings = evaluateSilencePatterns(
      unit(),
      [silent],
      [cat!],
      new Set(["cost_allocation_silent"]),
      gdpr!.skillId,
      []
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0].category, "cost_allocation_silent");
    assert.equal(findings[0].status, "absent_expected");
    assert.equal(
      findings[0].claim,
      "The agreement creates a data-subject-rights assistance duty but does not allocate the cost of providing that assistance."
    );
    assert.equal(findings[0].severity, "medium");

    assert.equal(
      findSilenceEvidence(
        [
          clause(
            "assistance",
            "processor_assistance_obligation",
            "Processor shall assist Controller with data subject requests at no additional charge."
          ),
        ],
        cat!.silencePattern!
      ),
      null
    );
  });

  it("fires a synthetic non-GDPR silence pattern without any GDPR terms in the handler", () => {
    const ndaCat: SkillRiskCategory = {
      category: "return_duty_silent",
      displayLabel: "Silent on return of confidential information",
      guidance: "Return duty exists but no destruction/return mechanic.",
      silencePattern: {
        triggerClauseTypes: ["confidentiality"],
        satisfyRegex: "\\b(return|destroy|destruction)\\b",
        claim: "Confidentiality is imposed but the agreement is silent on return or destruction.",
        severity: "medium",
      },
    };
    const findings = evaluateSilencePatterns(
      unit(),
      [
        clause(
          "conf",
          "confidentiality",
          "Each party shall keep the other party's information confidential."
        ),
      ],
      [ndaCat],
      new Set(["return_duty_silent"]),
      "doc-types/nda",
      []
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0].category, "return_duty_silent");
    assert.match(findings[0].claim, /return or destruction/);
  });
});

describe("authored heuristic fallbacks", () => {
  it("reproduces the three previous category heuristics from authored metadata", () => {
    resetSkillRegistryForTests();
    const global = getSkillById("_global");
    const gdpr = getSkillById("regimes/data-protection/gdpr");
    assert.ok(global && gdpr);

    const cats = [
      ...global!.riskCategories.filter((c) =>
        ["uncapped_liability", "one_sided_indemnity"].includes(c.category)
      ),
      ...gdpr!.riskCategories.filter((c) => c.category === "dsr_generic_no_named_rights"),
    ];

    const raw = heuristicRisks(
      [
        clause(
          "lol",
          "limitation_of_liability",
          "Liability is unlimited and without limit of any kind."
        ),
        clause(
          "ind",
          "indemnity",
          "Customer shall indemnify Supplier against all claims."
        ),
        clause(
          "dsr",
          "data_protection",
          "The processor shall handle data subject requests in good faith."
        ),
      ],
      cats
    );

    const byCat = new Map(raw.map((r) => [r.category, r]));
    assert.equal(
      byCat.get("uncapped_liability")?.claim,
      "Limitation of liability appears uncapped or effectively unlimited."
    );
    assert.equal(byCat.get("uncapped_liability")?.severity, "high");
    assert.equal(
      byCat.get("one_sided_indemnity")?.claim,
      "Indemnity appears one-sided against the customer."
    );
    assert.equal(
      byCat.get("dsr_generic_no_named_rights")?.claim,
      "Data-subject request language is generic and does not name Chapter III rights."
    );
  });

  it("runs a synthetic non-GDPR heuristic from category metadata", () => {
    const cats: SkillRiskCategory[] = [
      {
        category: "perpetual_confidentiality",
        displayLabel: "Perpetual confidentiality",
        guidance: "Confidentiality has no term.",
        heuristic: [
          {
            clauseType: "confidentiality",
            regex: "in perpetuity|perpetual",
            claim: "Confidentiality appears perpetual.",
            severity: "medium",
          },
        ],
      },
    ];
    const raw = heuristicRisks(
      [clause("conf", "confidentiality", "Obligations survive in perpetuity.")],
      cats
    );
    assert.equal(raw.length, 1);
    assert.equal(raw[0].category, "perpetual_confidentiality");
  });
});
