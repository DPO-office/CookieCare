/**
 * Point 1 acceptance: `requirementId` is losslessly propagated from PLAN to
 * WorkUnit to Finding, using a single identity mechanism for both the
 * package path and the rule/structural path.
 *
 * These are pure deterministic tests (no LLM) covering:
 *   1. the ACT stamp helpers (rule / matrix / flag_risk / expected clauses),
 *   2. the PLAN graph shape (units carry `requirementIds` /
 *      `requirementMappings` sourced from `focus.requirementMappings`),
 *   3. package-path regression (grouped-results-to-findings still tags).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  stampFindingsByCapability,
  stampRequirementIdsOnNewFindings,
  requirementIdsForCapability,
} from "../act-utils.js";
import { groupedResultsToFindings } from "../grouped-results-to-findings.js";
import { buildActGraphDetailed } from "../../../skills/runtime/graph/build-act-graph.js";
import { getSkillById, resetSkillRegistryForTests } from "../../../skills/runtime/catalog/registry.js";
import type { InstructionFocus, AnalysisWorkUnit } from "../../../models/analysis-plan.js";
import type { Finding } from "../../../models/finding.js";
import type { IntentClassification } from "../../../models/intent.js";

function unit(overrides: Partial<AnalysisWorkUnit> = {}): AnalysisWorkUnit {
  return {
    workUnitId: "wu-test",
    tool: "check_against_rule",
    input: {},
    dependsOn: [],
    outputSchema: "Finding[]",
    status: "pending",
    ...overrides,
  };
}

function baseFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    findingId: "f_new",
    kind: "compliance",
    category: "cat_a",
    status: "present",
    claim: "x",
    evidence: [],
    taxonomyVersion: "test",
    workUnitId: "wu-test",
    ...overrides,
  };
}

describe("stampRequirementIdsOnNewFindings", () => {
  it("stamps single-requirement work unit onto new findings", () => {
    const before: Finding[] = [];
    const after: Finding[] = [baseFinding()];
    const out = stampRequirementIdsOnNewFindings(
      unit({ requirementIds: ["R1"] }),
      before,
      after
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].requirementId, "R1");
  });

  it("fans one finding out into N findings when unit binds N requirements", () => {
    const out = stampRequirementIdsOnNewFindings(
      unit({ requirementIds: ["R1", "R2"] }),
      [],
      [baseFinding({ findingId: "f_shared" })]
    );
    assert.equal(out.length, 2);
    assert.equal(out[0].requirementId, "R1");
    assert.equal(out[1].requirementId, "R2");
    assert.notEqual(out[0].findingId, out[1].findingId);
  });

  it("does not overwrite an already-tagged finding", () => {
    const out = stampRequirementIdsOnNewFindings(
      unit({ requirementIds: ["R1"] }),
      [],
      [baseFinding({ requirementId: "R_original" })]
    );
    assert.equal(out[0].requirementId, "R_original");
  });

  it("passes through unchanged when unit has no requirementIds", () => {
    const finding = baseFinding();
    const out = stampRequirementIdsOnNewFindings(unit(), [], [finding]);
    assert.equal(out[0].requirementId, undefined);
  });

  it("never mutates carry-over findings from earlier handlers", () => {
    const carry = baseFinding({ findingId: "f_prior" });
    const fresh = baseFinding({ findingId: "f_new" });
    const out = stampRequirementIdsOnNewFindings(
      unit({ requirementIds: ["R1"] }),
      [carry],
      [carry, fresh]
    );
    assert.equal(out.find((f) => f.findingId === "f_prior")?.requirementId, undefined);
    assert.equal(out.find((f) => f.findingId === "f_new")?.requirementId, "R1");
  });
});

describe("stampFindingsByCapability", () => {
  const mappings = [
    { capabilityId: "cat_a", requirementId: "R_A" },
    { capabilityId: "cat_b", requirementId: "R_B1" },
    { capabilityId: "cat_b", requirementId: "R_B2" },
  ];

  it("stamps per-finding using the category lookup", () => {
    const u = unit({ input: { requirementMappings: mappings } });
    const out = stampFindingsByCapability(
      u,
      [],
      [
        baseFinding({ findingId: "f1", category: "cat_a" }),
        baseFinding({ findingId: "f2", category: "cat_b" }),
      ],
      (f) => [f.category]
    );
    const byId = new Map(out.map((f) => [f.findingId, f]));
    assert.equal(byId.get("f1")?.requirementId, "R_A");
    // cat_b maps to two requirements → fan-out
    const fanned = out.filter((f) => f.category === "cat_b");
    assert.equal(fanned.length, 2);
    const ids = new Set(fanned.map((f) => f.requirementId));
    assert.ok(ids.has("R_B1"));
    assert.ok(ids.has("R_B2"));
  });

  it("leaves unmapped findings orphaned (no guessing)", () => {
    const u = unit({ input: { requirementMappings: mappings } });
    const out = stampFindingsByCapability(
      u,
      [],
      [baseFinding({ findingId: "orphan", category: "unknown_cat" })],
      (f) => [f.category]
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].requirementId, undefined);
  });

  it("passes through when no mappings are supplied", () => {
    const out = stampFindingsByCapability(
      unit(),
      [],
      [baseFinding()],
      (f) => [f.category]
    );
    assert.equal(out[0].requirementId, undefined);
  });
});

describe("requirementIdsForCapability", () => {
  it("returns all requirements bound to a capability", () => {
    const ids = requirementIdsForCapability("cat_x", [
      { capabilityId: "cat_x", requirementId: "R1" },
      { capabilityId: "cat_x", requirementId: "R2" },
      { capabilityId: "cat_y", requirementId: "R3" },
    ]);
    assert.deepEqual(ids, ["R1", "R2"]);
  });
});

describe("groupedResultsToFindings preserves requirementId (package regression)", () => {
  it("tags every emitted finding with the source requirementId", () => {
    const findings = groupedResultsToFindings(
      [
        {
          requirementId: "req.gdpr.dsr",
          status: "covered",
          rationale: "Assistance clause present.",
          evidenceRefs: [],
        },
        {
          requirementId: "req.gdpr.subprocessor",
          status: "missing",
          rationale: "No sub-processor list.",
          evidenceRefs: [],
        },
      ],
      {
        unit: { workUnitId: "wu-pkg-eval-x" } as never,
        docId: "doc1",
        packageId: "pkg.gdpr.art28.3",
        sourceMode: "authored",
        skillId: "regimes/data-protection/gdpr",
        findingCategory: "processor_terms",
      }
    );
    const ids = new Set(findings.map((f) => f.requirementId));
    assert.ok(ids.has("req.gdpr.dsr"));
    assert.ok(ids.has("req.gdpr.subprocessor"));
    for (const f of findings) {
      assert.ok(f.requirementId, "every package finding must carry a requirementId");
    }
  });
});

describe("PLAN stamps requirementIds on rule/matrix/risk work units", () => {
  function gdprSkill() {
    resetSkillRegistryForTests();
    const skill = getSkillById("regimes/data-protection/gdpr");
    assert.ok(skill, "GDPR skill must be registered");
    return skill!;
  }

  function baseIntent(): IntentClassification {
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

  function makeFocus(partial: Partial<InstructionFocus>): InstructionFocus {
    return {
      ruleIds: [],
      matrixRowIds: [],
      riskCategoryIds: [],
      instructionText: "test",
      ...partial,
    };
  }

  it("stamps rule check_against_rule units with their owning requirementIds", () => {
    const skill = gdprSkill();
    const ruleId = skill.regimeRules[0]?.ruleId;
    assert.ok(ruleId, "GDPR skill must expose at least one regime rule");
    const focus = makeFocus({
      ruleIds: [ruleId!],
      requirementMappings: [
        {
          requirementId: "R_alpha",
          capabilityIds: [ruleId!],
          source: "catalog_llm",
        },
      ],
    });
    const { workUnits } = buildActGraphDetailed({
      docId: "doc1",
      instruction: "test",
      skills: [skill],
      intent: baseIntent(),
      focus,
    });
    const ruleUnit = workUnits.find(
      (u) => u.tool === "check_against_rule" && u.input.ruleId === ruleId
    );
    assert.ok(ruleUnit, "expected a check_against_rule unit for the mapped rule");
    assert.deepEqual(ruleUnit!.requirementIds, ["R_alpha"]);
  });

  it("passes requirementMappings on flag_risk units so per-finding stamping works", () => {
    const skill = gdprSkill();
    const focus = makeFocus({
      riskCategoryIds: ["dsr_generic_no_named_rights"],
      requirementMappings: [
        {
          requirementId: "R_dsr",
          capabilityIds: ["dsr_generic_no_named_rights"],
          source: "catalog_llm",
        },
      ],
    });
    const { workUnits } = buildActGraphDetailed({
      docId: "doc1",
      instruction: "test",
      skills: [skill],
      intent: baseIntent(),
      focus,
    });
    const riskUnits = workUnits.filter((u) => u.tool === "flag_risk");
    assert.ok(riskUnits.length > 0, "expected at least one flag_risk unit");
    const withMappings = riskUnits.find((u) => {
      const m = u.input.requirementMappings as
        | Array<{ capabilityId: string; requirementId: string }>
        | undefined;
      return Array.isArray(m) && m.some((entry) => entry.requirementId === "R_dsr");
    });
    assert.ok(
      withMappings,
      "flag_risk unit must carry the compact requirementMappings payload"
    );
  });

  it("derives matrix-row ownership from matching article numbers when mappings are package-level", () => {
    const skill = gdprSkill();
    const row = skill.rightsMatrixRows?.find((candidate) => /\b15\b/.test(candidate.article));
    assert.ok(row, "GDPR skill must expose the Article 15 matrix row");
    const requirementId = "gdpr.article15.access";
    const intent = baseIntent();
    intent.requirements = [
      {
        id: requirementId,
        description: "GDPR Article 15 access",
        type: "verification",
        priority: "required",
      },
    ];
    const { workUnits } = buildActGraphDetailed({
      docId: "doc1",
      instruction: "Review GDPR Article 15 access rights.",
      skills: [skill],
      intent,
      focus: makeFocus({
        matrixRowIds: [row!.rowId],
        requirements: [{ id: requirementId, label: "GDPR Article 15 access" }],
      }),
    });
    const matrixUnit = workUnits.find(
      (unit) => unit.tool === "evaluate_matrix_row" && unit.input.rowId === row!.rowId
    );
    assert.ok(matrixUnit);
    assert.deepEqual(matrixUnit!.requirementIds, [requirementId]);
  });
});
