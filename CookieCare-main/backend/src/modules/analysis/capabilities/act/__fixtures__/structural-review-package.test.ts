/**
 * Structural-review package path for NDA / DPA broad reviews.
 * Deterministic — no LLM.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSkillById, resetSkillRegistryForTests } from "../../../skills/runtime/catalog/registry.js";
import { resolvePackages } from "../../../skills/runtime/graph/resolve-packages.js";
import { buildActGraphDetailed } from "../../../skills/runtime/graph/build-act-graph.js";
import { groupedResultsToFindings } from "../grouped-results-to-findings.js";
import { aggregateRequirements } from "../aggregate-requirements.js";
import { injectAuthoredRequirements } from "../../plan/inject-authored-requirements.js";
import type { InstructionFocus } from "../../../models/analysis-plan.js";
import type { IntentClassification } from "../../../models/intent.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { Finding } from "../../../models/finding.js";

function skill(id: string) {
  resetSkillRegistryForTests();
  const found = getSkillById(id);
  assert.ok(found, `${id} must be registered`);
  return found!;
}

function emptyFocus(): InstructionFocus {
  return {
    ruleIds: [],
    matrixRowIds: [],
    riskCategoryIds: [],
    instructionText: "Analyse this document",
  };
}

function broadIntent(): IntentClassification {
  return {
    scope: "whole_document",
    operation: "compliance_check",
    standard: "none",
    outputForm: "memo",
    compound: false,
    subIntents: [],
    requirements: [],
    confidence: { scope: 1, operation: 1, standard: 1, outputForm: 1 },
  };
}

describe("structural-review package selection", () => {
  it("selects nda.structural_review for injected NDA requirements", () => {
    const nda = skill("doc-types/nda");
    const intent = injectAuthoredRequirements(broadIntent(), [nda], emptyFocus());
    const resolution = resolvePackages([nda], emptyFocus(), intent.requirements);
    const ids = resolution.packages.map((p) => p.pkg.id);
    assert.deepEqual(ids, ["nda.structural_review"]);
    for (const req of nda.authoredRequirements ?? []) {
      assert.equal(resolution.requirementToPackageId[req.id], "nda.structural_review");
    }
  });

  it("selects dpa.structural_review for injected DPA requirements", () => {
    const dpa = skill("doc-types/dpa");
    const intent = injectAuthoredRequirements(broadIntent(), [dpa], emptyFocus());
    const resolution = resolvePackages([dpa], emptyFocus(), intent.requirements);
    const ids = resolution.packages.map((p) => p.pkg.id);
    assert.deepEqual(ids, ["dpa.structural_review"]);
  });
});

describe("structural-review ACT graph", () => {
  it("emits the package evaluation path for a broad NDA review, not rule fan-out", () => {
    const nda = skill("doc-types/nda");
    const intent = injectAuthoredRequirements(broadIntent(), [nda], emptyFocus());
    const { workUnits } = buildActGraphDetailed({
      docId: "doc1",
      instruction: "Analyse this NDA",
      skills: [nda],
      intent,
      focus: emptyFocus(),
    });
    const tools = workUnits.map((u) => u.tool);
    assert.deepEqual(tools, [
      "classify_document",
      "extract_clauses",
      "extract_shared_evidence",
      "evaluate_package",
      "aggregate_requirements",
      "derive_risk",
      "render_output",
    ]);
    assert.equal(
      workUnits.filter((u) => u.tool === "check_expected_clauses").length,
      0
    );
    assert.equal(
      workUnits.filter((u) => u.tool === "check_against_rule").length,
      0
    );
    const evalUnit = workUnits.find((u) => u.tool === "evaluate_package");
    assert.equal(evalUnit?.input.packageId, "nda.structural_review");
  });

  it("resolves every NDA structural_review capabilityId to an authored regime rule", () => {
    const nda = skill("doc-types/nda");
    const pkg = (nda.evidencePackages ?? []).find((p) => p.id === "nda.structural_review");
    assert.ok(pkg);
    for (const capId of pkg!.capabilityIds) {
      const rule = nda.regimeRules.find((r) => r.ruleId === capId);
      assert.ok(rule, `capability ${capId} must resolve`);
      assert.equal(rule!.ruleId, capId);
    }
  });

  it("resolves every DPA structural_review capabilityId to an authored regime rule", () => {
    const dpa = skill("doc-types/dpa");
    const pkg = (dpa.evidencePackages ?? []).find((p) => p.id === "dpa.structural_review");
    assert.ok(pkg);
    for (const capId of pkg!.capabilityIds) {
      const rule = dpa.regimeRules.find((r) => r.ruleId === capId);
      assert.ok(rule, `capability ${capId} must resolve`);
    }
  });
});

describe("structural-review requirementId (Point 1 regression)", () => {
  it("grouped findings and assessments stay 1:1 with authored NDA requirements", () => {
    const nda = skill("doc-types/nda");
    const reqIds = (nda.authoredRequirements ?? []).map((r) => r.id);
    const evidenceItems = reqIds.map((requirementId, index) => ({
      ref: `E${index + 1}`,
      clauseType: "authored_requirement",
      quotedText: `The agreement expressly addresses ${requirementId}.`,
      structuralPath: `section-${index + 1}`,
      charRange: [0, 48] as [number, number],
    }));
    const results = reqIds.map((requirementId, index) => ({
      requirementId,
      status: "covered" as const,
      rationale: `${requirementId} present.`,
      evidenceRefs: [evidenceItems[index]!.ref],
    }));
    const findings = groupedResultsToFindings(results, {
      unit: { workUnitId: "wu-pkg-eval-nda.structural_review" } as never,
      docId: "doc1",
      packageId: "nda.structural_review",
      sourceMode: "authored",
      skillId: "doc-types/nda",
      findingCategory: "nda_definition_gap",
      bundle: {
        packageId: "nda.structural_review",
        docId: "doc1",
        items: evidenceItems,
      },
    });
    assert.equal(findings.length, reqIds.length);
    for (const f of findings) {
      assert.ok(reqIds.includes(f.requirementId ?? ""), f.findingId);
    }

    const state = {
      findings,
      intent: { requirements: nda.authoredRequirements ?? [] },
    } as unknown as AnalysisState;
    const aggregated = aggregateRequirements(
      state,
      { workUnitId: "wu-aggregate", input: {} } as never,
      findings as Finding[]
    );
    const assessments = aggregated.state.requirementAssessments ?? [];
    assert.equal(assessments.length, reqIds.length);
    for (const reqId of reqIds) {
      const a = assessments.find((x) => x.requirementId === reqId);
      assert.ok(a, reqId);
      assert.equal(a!.status, "adequate");
      assert.equal(a!.supportingFindingIds.length, 1);
    }
  });
});
