import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildActGraph } from "../src/modules/analysis/skills/runtime/graph/build-act-graph.js";
import { getSkillById } from "../src/modules/analysis/skills/runtime/catalog/registry.js";
import type { IntentClassification } from "../src/modules/analysis/models/intent.js";

const baseIntent: IntentClassification = {
  scope: "whole_document",
  operation: "risk_flag",
  standard: "none",
  outputForm: "checklist",
  compound: false,
  subIntents: [],
  requirements: [],
  confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
};

describe("buildActGraph", () => {
  it("schedules extract → evaluate/flag → render for general-review alias", () => {
    const skill = getSkillById("general-review")!;
    assert.ok(skill);
    const units = buildActGraph({
      docId: "doc-1",
      instruction: "Flag risks",
      skills: [skill],
      intent: baseIntent,
    });
    const tools = units.map((u) => u.tool);
    assert.ok(tools.includes("extract_clauses") || tools.includes("flag_risk"));
    assert.ok(tools.includes("render_output"));
    assert.ok(units.length >= 2);
  });

  it("schedules GDPR regime work for privacy-gdpr-dpa alias", () => {
    const skill = getSkillById("privacy-gdpr-dpa")!;
    assert.ok(skill);
    const units = buildActGraph({
      docId: "doc-1",
      instruction: "Check Article 28 compliance",
      skills: [skill],
      intent: { ...baseIntent, operation: "compliance_check" },
    });
    assert.deepEqual(units.map((unit) => unit.tool), ["run_compliance_pipeline", "render_output"]);
  });
});
