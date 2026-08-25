/**
 * Deterministic coverage for the package-centric ACT path (ACT refactor):
 * package resolution, graph shape, and per-requirement aggregation. No LLM.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePackages } from "../../../skills/runtime/graph/resolve-packages.js";
import { buildActGraphDetailed } from "../../../skills/runtime/graph/build-act-graph.js";
import { aggregateRequirements } from "../aggregate-requirements.js";
import type { Finding, FindingStatus } from "../../../models/finding.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import {
  focus,
  gdprSkill,
  intent,
} from "../../../__test-helpers__/package-graph-fixtures.js";

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
    assert.equal(byId.get("req_covered")?.status, "adequate");
    assert.equal(byId.get("req_missing")?.status, "gap");
    assert.equal(byId.get("req_partial")?.status, "conditional");
    assert.equal(byId.get("req_partial")?.supportingFindingIds.length, 2);
  });

  it("links rule findings via Finding.requirementId (no capability guessing)", () => {
    // Post-refactor: the handler stamps requirementId onto the finding
    // itself using AnalysisWorkUnit.requirementIds. Aggregation is a pure
    // direct match — no bridge from capabilityIds anymore.
    const ruleFinding: Finding = {
      findingId: "f_rule_ci",
      kind: "compliance",
      category: "processor_terms",
      status: "present",
      claim: "Confidential information is broadly defined.",
      evidence: [],
      taxonomyVersion: "test",
      ruleId: "nda.ci_definition",
      skillId: "doc-types/nda",
      requirementId: "nda.confidentiality.scope_of_information",
    };
    const findings = [ruleFinding];
    const state = {
      findings,
      intent: {
        requirements: [
          {
            id: "nda.confidentiality.scope_of_information",
            description: "Scope",
            type: "extraction",
            priority: "required",
          },
        ],
      },
      plan: {
        requirementExecutionPaths: [
          {
            requirementId: "nda.confidentiality.scope_of_information",
            status: "not_supported",
            requirementType: "extraction",
          },
        ],
      },
    } as unknown as AnalysisState;
    const result = aggregateRequirements(state, { workUnitId: "wu-aggregate", input: {} } as never, findings);
    const assessment = result.state.requirementAssessments?.find(
      (a) => a.requirementId === "nda.confidentiality.scope_of_information"
    );
    assert.equal(assessment?.status, "adequate");
    assert.ok(assessment?.supportingFindingIds.includes("f_rule_ci"));
  });

  it("does NOT attach unrelated findings when a requirement has no matches", () => {
    // R1 has one finding tagged to it; R2 has none. Aggregation must not
    // spread R1's finding — or any other doc-type-level finding — into R2.
    const findings: Finding[] = [
      {
        findingId: "f_r1",
        kind: "compliance",
        category: "confidentiality",
        status: "present",
        claim: "R1 covered.",
        evidence: [],
        taxonomyVersion: "test",
        requirementId: "nda.confidentiality",
      },
      {
        // Orphan structural finding — no requirementId, must not be
        // adopted by any assessment.
        findingId: "f_structural_orphan",
        kind: "risk",
        category: "other_known_risk",
        status: "absent_expected",
        claim: "Skill-wide structural gap.",
        evidence: [],
        taxonomyVersion: "test",
        skillId: "doc-types/nda",
      },
    ];
    const state = {
      findings,
      intent: {
        requirements: [
          { id: "nda.confidentiality", description: "", type: "extraction", priority: "required" },
          { id: "nda.survival", description: "", type: "extraction", priority: "required" },
        ],
      },
    } as unknown as AnalysisState;
    const result = aggregateRequirements(
      state,
      { workUnitId: "wu-aggregate", input: {} } as never,
      findings
    );
    const byId = new Map(
      (result.state.requirementAssessments ?? []).map((a) => [a.requirementId, a])
    );
    assert.deepEqual(byId.get("nda.confidentiality")?.supportingFindingIds, ["f_r1"]);
    assert.equal(byId.get("nda.survival")?.status, "cannot_determine");
    assert.deepEqual(byId.get("nda.survival")?.supportingFindingIds, []);
  });

  it("recommends Obtain/Confirm, not Amend, when evidence is only insufficient", () => {
    const findings: Finding[] = [
      {
        findingId: "f_cd",
        kind: "compliance",
        category: "processor_terms",
        status: "insufficient_evidence",
        claim: "Confidentiality remainder was truncated.",
        evidence: [],
        taxonomyVersion: "test",
        requirementId: "gdpr.art28.3.b",
      },
    ];
    const result = aggregateRequirements(
      { findings } as unknown as AnalysisState,
      { workUnitId: "wu-aggregate", input: {} } as never,
      findings
    );
    const assessment = result.state.requirementAssessments?.[0];
    assert.equal(assessment?.status, "cannot_determine");
    assert.match(assessment?.recommendation ?? "", /Obtain or confirm/i);
    assert.doesNotMatch(assessment?.recommendation ?? "", /\bAmend\b/);
  });
});
