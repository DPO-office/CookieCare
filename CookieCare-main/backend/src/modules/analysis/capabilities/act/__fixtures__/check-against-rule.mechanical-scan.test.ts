process.env.GOOGLE_CLOUD_PROJECT ??= "mechanical-scan-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { ClauseObject } from "../../../models/clause-object.js";
import type { SkillRegimeRule } from "../../../skills/runtime/catalog/types.js";
import { getSkillById, resetSkillRegistryForTests } from "../../../skills/runtime/catalog/registry.js";

const { runMechanicalScan } = await import("../check-against-rule.js");

const locator = {
  docId: "doc1",
  structuralPath: "s1",
  charRange: [0, 80] as [number, number],
};

function unit(): AnalysisWorkUnit {
  return {
    workUnitId: "wu1",
    tool: "check_against_rule",
    input: {},
    dependsOn: [],
    outputSchema: "Finding[]",
    status: "pending",
  };
}

function clause(text: string, clauseType = "data_subject_request_handling"): ClauseObject {
  return {
    clauseId: "c1",
    clauseType,
    text,
    locator,
    taxonomyVersion: "test",
  };
}

const SYNTHETIC: SkillRegimeRule = {
  ruleId: "synth.timeframe",
  ruleText: "Respond within a numeric period.",
  checkType: "pattern_then_llm_judgment",
  findingCategory: "synth_timeframe_gap",
  ruleScope: "per_document",
  mechanicalScan: {
    kind: "numeric_pattern_expected",
    pattern: "\\b(\\d+)\\s*(hour|hours|day|days|week|weeks|month|months|business days?)\\b",
    vaguePattern:
      "\\b(promptly|reasonably|as soon as (reasonably )?practicable|without (undue )?delay|timely)\\b",
    presentClaim: "Numeric window ({match}) found.",
    vagueClaim: 'Only vague timing ("{match}").',
    absentClaim: "No numeric window found.",
    vagueGap: "Vague timing is insufficient.",
    absentGap: "Clock is unaddressed.",
    severityPresent: "low",
    severityVague: "high",
    severityAbsent: "high",
  },
};

describe("runMechanicalScan", () => {
  it("returns the three authored outcomes for a synthetic rule", () => {
    const numeric = runMechanicalScan(
      unit(),
      SYNTHETIC,
      [clause("The processor shall respond within 30 days of a request.")],
      "skill/synth",
      "1.0.0"
    );
    assert.equal(numeric?.status, "present");
    assert.equal(numeric?.severity, "low");
    assert.match(numeric!.claim, /30 days/);
    assert.equal(numeric?.findingId, "f_compliance_synth.timeframe_wu1");

    const vague = runMechanicalScan(
      unit(),
      SYNTHETIC,
      [clause("Assistance shall be provided promptly.")],
      "skill/synth",
      "1.0.0"
    );
    assert.equal(vague?.status, "absent_expected");
    assert.equal(vague?.severity, "high");
    assert.match(vague!.claim, /promptly/);
    assert.equal(vague?.gap, "Vague timing is insufficient.");

    const absent = runMechanicalScan(
      unit(),
      SYNTHETIC,
      [clause("The processor shall assist with requests.")],
      "skill/synth",
      "1.0.0"
    );
    assert.equal(absent?.status, "absent_expected");
    assert.equal(absent?.claim, "No numeric window found.");
    assert.equal(absent?.gap, "Clock is unaddressed.");
  });

  it("preserves authored GDPR Art 12(3) copy for the same three outcomes", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr");
    const rule = gdpr?.regimeRules.find((r) => r.ruleId === "gdpr.art12.3");
    assert.ok(rule?.mechanicalScan);

    const numeric = runMechanicalScan(
      unit(),
      rule!,
      [clause("Controller shall respond within 30 days.")],
      gdpr!.skillId,
      gdpr!.version
    );
    assert.equal(numeric?.status, "present");
    assert.equal(
      numeric?.claim,
      "A numeric response timeframe (30 days) appears in the DSR/assistance clauses."
    );
    assert.equal(numeric?.severity, "low");
    assert.equal(numeric?.category, "dsr_no_response_timeframe");
    assert.equal(numeric?.findingId, "f_compliance_gdpr.art12.3_wu1");

    const vague = runMechanicalScan(
      unit(),
      rule!,
      [clause("The processor shall assist reasonably.")],
      gdpr!.skillId,
      gdpr!.version
    );
    assert.equal(vague?.status, "absent_expected");
    assert.equal(
      vague?.claim,
      'Art 12(3) requires a one-month (extendable) clock; the agreement only uses vague timing ("reasonably").'
    );
    assert.equal(
      vague?.gap,
      "No numeric Art 12(3) timeframe; 'promptly' / 'reasonably' alone is insufficient."
    );

    const absent = runMechanicalScan(
      unit(),
      rule!,
      [clause("The processor shall assist the controller.")],
      gdpr!.skillId,
      gdpr!.version
    );
    assert.equal(
      absent?.claim,
      "No response timeframe for data-subject requests was found in the extracted DSR/assistance clauses."
    );
    assert.equal(absent?.gap, "Art 12(3) one-month clock is unaddressed.");
  });

  it("does nothing when a rule did not opt into mechanicalScan", () => {
    const result = runMechanicalScan(
      unit(),
      {
        ruleId: "synth.plain",
        ruleText: "x",
        checkType: "judgment",
        findingCategory: "x",
        ruleScope: "per_document",
      },
      [clause("30 days")],
      "s",
      "1"
    );
    assert.equal(result, null);
  });
});
