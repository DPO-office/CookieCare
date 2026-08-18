/**
 * Deterministic coverage for the package-centric ACT path (ACT refactor):
 * package resolution, graph shape, and per-requirement aggregation. No LLM.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSkillById, resetSkillRegistryForTests } from "../../../skills/registry.js";
import { resolvePackages } from "../../../skills/resolve-packages.js";
import { buildActGraphDetailed } from "../../../skills/build-act-graph.js";
import { aggregateRequirements } from "../aggregate-requirements.js";
import type { InstructionFocus } from "../../../models/analysis-plan.js";
import type { IntentClassification } from "../../../models/intent.js";
import type { Finding, FindingStatus } from "../../../models/finding.js";
import type { AnalysisState } from "../../../models/analysis-state.js";

function gdprSkill() {
  resetSkillRegistryForTests();
  const skill = getSkillById("regimes/data-protection/gdpr");
  assert.ok(skill, "GDPR skill must be registered");
  return skill!;
}

function focus(partial: Partial<InstructionFocus>): InstructionFocus {
  return {
    ruleIds: [],
    matrixRowIds: [],
    riskCategoryIds: [],
    instructionText: "Review the DPA for GDPR Article 28 compliance.",
    ...partial,
  };
}

function intent(): IntentClassification {
  return {
    scope: "whole_document",
    operation: "compliance_check",
    standard: "regime_pack:gdpr",
    outputForm: "memo",
    compound: false,
    subIntents: [],
    requirements: [],
    confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
  };
}

describe("package resolution", () => {
  it("selects the Article 28(3) package when a member rule is in focus", () => {
    const resolution = resolvePackages(
      [gdprSkill()],
      focus({ ruleIds: ["gdpr.art28.3.a"] })
    );
    const ids = resolution.packages.map((p) => p.pkg.id);
    assert.ok(
      ids.includes("gdpr.art28.3.mandatory_clauses"),
      `expected mandatory-clauses package, got ${ids.join(", ")}`
    );
  });

  it("runs every authored package when the focus requests nothing specific", () => {
    const resolution = resolvePackages([gdprSkill()], focus({}));
    assert.ok(resolution.packages.length >= 3);
  });

  it("maps PLAN requirements to a package through requirement mappings", () => {
    const resolution = resolvePackages(
      [gdprSkill()],
      focus({
        requirementMappings: [
          {
            requirementId: "my_dsr_requirement",
            capabilityIds: ["gdpr.art28.3.e"],
            source: "phrase_map",
          },
        ],
      })
    );
    assert.equal(
      resolution.requirementToPackageId["my_dsr_requirement"],
      "gdpr.art28.3.mandatory_clauses"
    );
  });
});

describe("package graph shape", () => {
  it("emits shared-evidence, grouped eval, derive-risk and aggregate units", () => {
    const { workUnits } = buildActGraphDetailed({
      docId: "doc1",
      instruction: "Review the DPA for GDPR Article 28 compliance.",
      skills: [gdprSkill()],
      intent: intent(),
      focus: focus({ ruleIds: ["gdpr.art28.3.a", "gdpr.art28.3.e"] }),
    });
    const tools = new Set(workUnits.map((u) => u.tool));
    assert.ok(tools.has("extract_shared_evidence"));
    assert.ok(tools.has("evaluate_package"));
    assert.ok(tools.has("derive_risk"));
    assert.ok(tools.has("aggregate_requirements"));
    assert.ok(tools.has("render_output"));

    // render must run last (depends on aggregation).
    const render = workUnits.find((u) => u.tool === "render_output");
    assert.deepEqual(render?.dependsOn, ["wu-aggregate"]);
  });
});

describe("per-requirement aggregation", () => {
  function finding(requirementId: string, status: FindingStatus): Finding {
    return {
      findingId: `f_${requirementId}_${status}`,
      kind: "compliance",
      category: "processor_terms",
      status,
      claim: `${requirementId}:${status}`,
      evidence: [],
      taxonomyVersion: "test",
      requirementId,
    };
  }

  it("derives one assessment per requirement with deterministic status", () => {
    const findings: Finding[] = [
      finding("req_covered", "present"),
      finding("req_missing", "absent_expected"),
      finding("req_partial", "present"),
      finding("req_partial", "absent_expected"),
    ];
    const state = { findings } as unknown as AnalysisState;
    const result = aggregateRequirements(state, {} as never, findings);
    const byId = new Map(
      (result.state.requirementAssessments ?? []).map((a) => [a.requirementId, a])
    );
    assert.equal(byId.get("req_covered")?.status, "covered");
    assert.equal(byId.get("req_missing")?.status, "missing");
    assert.equal(byId.get("req_partial")?.status, "partial");
    assert.equal(byId.get("req_partial")?.supportingFindingIds.length, 2);
  });
});
