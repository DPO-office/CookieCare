/**
 * Unit tests for the rule-first compliance requirement resolver. Cases are
 * deliberately phrased so every assertion resolves through the deterministic
 * exact-citation / article-range / composition channels — no live network
 * call (embedding or LLM) is needed to reach zero unclaimed facets.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveComplianceRequirements } from "../resolve-compliance-requirements.js";
import { getSkillById, resetSkillRegistryForTests } from "../../../skills/runtime/catalog/registry.js";
import type { AnalysisSkillConfig } from "../../../skills/runtime/catalog/types.js";
import {
  applyComplianceRequirementRouting,
  complianceRequirementRoutingMode,
} from "../compliance-routing-mode.js";

function gdprSkill(): AnalysisSkillConfig {
  resetSkillRegistryForTests();
  const skill = getSkillById("regimes/data-protection/gdpr");
  assert.ok(skill, "GDPR skill must be registered");
  return skill!;
}

describe("resolveComplianceRequirements", () => {
  it("uses canonical rule-first routing without an environment switch", () => {
    assert.equal(complianceRequirementRoutingMode(), "canonical");
  });

  it("replaces package requirements at PLAN time only in canonical mode", () => {
    const units = [{
      workUnitId: "compliance",
      tool: "run_compliance_pipeline" as const,
      input: { docId: "doc", requirementIds: ["legacy.package.requirement"] },
      requirementIds: ["legacy.package.requirement"],
      dependsOn: [],
      outputSchema: "ComplianceReportSnapshot" as const,
      status: "pending" as const,
    }];
    const resolution = {
      facets: [{ facetId: "f", sourceText: "rights", legalReferences: [], actors: [], actions: [], objects: [] }],
      selections: [{
        facetId: "f",
        skillId: "regimes/data-protection/gdpr",
        ruleId: "gdpr.art15",
        source: "semantic" as const,
        confidence: 0.8,
        required: true,
        reason: "test",
      }],
      unresolved: [],
      complete: true,
    };
    assert.deepEqual(applyComplianceRequirementRouting(units, resolution, "shadow"), units);
    const canonical = applyComplianceRequirementRouting(units, resolution, "canonical");
    assert.deepEqual(canonical[0].requirementIds, ["gdpr.art15"]);
    assert.deepEqual(canonical[0].input.requirementIds, ["gdpr.art15"]);
  });

  it("resolves a single explicit article citation deterministically", async () => {
    const gdpr = gdprSkill();
    const resolution = await resolveComplianceRequirements({
      instruction: "Check GDPR Article 15.",
      intentRequirements: [],
      activeSkills: [gdpr],
    });
    assert.equal(resolution.complete, true);
    const ruleIds = resolution.selections.map((s) => s.ruleId);
    assert.ok(ruleIds.includes("gdpr.art15"));
    assert.ok(!ruleIds.includes("gdpr.art16"));
    const selection = resolution.selections.find((s) => s.ruleId === "gdpr.art15");
    assert.equal(selection?.source, "exact_citation");
    assert.equal(selection?.skillId, "regimes/data-protection/gdpr");
  });

  it("expands an explicit article range to every rule in range", async () => {
    const gdpr = gdprSkill();
    const resolution = await resolveComplianceRequirements({
      instruction: "Review how this agreement addresses Articles 15-22.",
      intentRequirements: [],
      activeSkills: [gdpr],
    });
    const ruleIds = new Set(resolution.selections.map((s) => s.ruleId));
    for (const article of [15, 16, 17, 18, 19, 20, 21, 22]) {
      assert.ok(ruleIds.has(`gdpr.art${article}`), `expected gdpr.art${article} to be selected`);
    }
    const selection = resolution.selections.find((s) => s.ruleId === "gdpr.art17");
    assert.equal(selection?.source, "article_range");
  });

  it("resolves the complete Article 33 breach-notification particulars", async () => {
    const gdpr = gdprSkill();
    const resolution = await resolveComplianceRequirements({
      instruction:
        "Check GDPR Article 33(1)-(5), including the 72-hour authority deadline, " +
        "processor escalation, minimum notification content, phased information, and breach records.",
      intentRequirements: [],
      activeSkills: [gdpr],
    });
    const ruleIds = new Set(resolution.selections.map((selection) => selection.ruleId));
    for (const ruleId of [
      "gdpr.art33.1",
      "gdpr.art33.2",
      "gdpr.art33.3",
      "gdpr.art33.4",
      "gdpr.art33.5",
    ]) {
      assert.ok(ruleIds.has(ruleId), `expected ${ruleId} to be selected`);
    }
    assert.equal(resolution.complete, true);
    assert.deepEqual(resolution.unresolved, []);
  });

  it("treats cited rights and processor assistance as additive user facets", async () => {
    const gdpr = gdprSkill();
    const instruction =
      "Review how this agreement addresses data subject rights under GDPR Articles 15-22. " +
      "Identify: obligations to assist the controller with access, erasure, rectification, " +
      "and portability requests, defined response timeframes, and any gaps that could result " +
      "in a GDPR violation.";
    const resolution = await resolveComplianceRequirements({
      instruction,
      intentRequirements: [{
        id: "rights_review",
        description: instruction,
        type: "verification",
        priority: "required",
      }],
      activeSkills: [gdpr],
    });
    const ruleIds = new Set(resolution.selections.map((selection) => selection.ruleId));
    assert.deepEqual(
      [...ruleIds].sort(),
      [
        "gdpr.art12.3",
        "gdpr.art15",
        "gdpr.art16",
        "gdpr.art17",
        "gdpr.art18",
        "gdpr.art19",
        "gdpr.art20",
        "gdpr.art21",
        "gdpr.art22",
        "gdpr.art28.3.e",
      ].sort()
    );
    assert.equal(resolution.complete, true);
    assert.deepEqual(resolution.unresolved, []);
  });

  it("honours an explicitly exclusive article boundary", async () => {
    const gdpr = gdprSkill();
    const resolution = await resolveComplianceRequirements({
      instruction: "Review only GDPR Article 15 data subject rights.",
      intentRequirements: [],
      activeSkills: [gdpr],
    });
    const ruleIds = new Set(resolution.selections.map((selection) => selection.ruleId));
    assert.deepEqual([...ruleIds], ["gdpr.art15"]);
  });

  it("matches a named composition on a broad, citation-free ask", async () => {
    const gdpr = gdprSkill();
    const resolution = await resolveComplianceRequirements({
      instruction: "Check the processor obligations in this DPA.",
      intentRequirements: [],
      activeSkills: [gdpr],
    });
    const ruleIds = new Set(resolution.selections.map((s) => s.ruleId));
    for (const ruleId of [
      "gdpr.art28.3.a", "gdpr.art28.3.b", "gdpr.art28.3.c", "gdpr.art28.3.d",
      "gdpr.art28.3.e", "gdpr.art28.3.f", "gdpr.art28.3.g", "gdpr.art28.3.h",
      "gdpr.art28.4",
    ]) {
      assert.ok(ruleIds.has(ruleId), `expected ${ruleId} from the mandatory-clauses composition`);
    }
    const selection = resolution.selections.find((s) => s.ruleId === "gdpr.art28.3.e");
    assert.equal(selection?.source, "composition");
  });

  it("does not select a context-only article referenced merely as background", async () => {
    const gdpr = gdprSkill();
    const resolution = await resolveComplianceRequirements({
      instruction: "Review Article 15. Assist the controller with obligations under applicable Article 22.",
      intentRequirements: [],
      activeSkills: [gdpr],
    });
    const ruleIds = resolution.selections.map((s) => s.ruleId);
    assert.ok(ruleIds.includes("gdpr.art15"));
    assert.ok(!ruleIds.includes("gdpr.art22"), "Article 22 was referenced only as context and must not be scheduled");
  });

  it("expands a deterministic `requires` dependency alongside its owning rule", async () => {
    const gdpr = gdprSkill();
    // Author a throwaway `requires` edge on a real rule id to prove the
    // expansion mechanism without depending on any currently-authored
    // dependency (none of GDPR's migrated rules declare one yet).
    const rule = gdpr.regimeRules.find((r) => r.ruleId === "gdpr.art17");
    assert.ok(rule);
    const original = rule!.relationships;
    rule!.relationships = { requires: ["gdpr.art12.3"] };
    try {
      const resolution = await resolveComplianceRequirements({
        instruction: "Check GDPR Article 17.",
        intentRequirements: [],
        activeSkills: [gdpr],
      });
      const ruleIds = resolution.selections.map((s) => s.ruleId);
      assert.ok(ruleIds.includes("gdpr.art17"));
      assert.ok(ruleIds.includes("gdpr.art12.3"));
      const dependency = resolution.selections.find((s) => s.ruleId === "gdpr.art12.3");
      assert.equal(dependency?.source, "dependency");
    } finally {
      rule!.relationships = original;
    }
  });

  it("returns an empty, complete resolution when no active skill is rule-first", async () => {
    const nonRuleFirstSkill: AnalysisSkillConfig = {
      skillId: "regimes/data-protection/uk-gdpr-idta",
      axis: "regime",
      label: "UK GDPR/IDTA",
      version: "1.0.0",
      appliesToDocTypes: [],
      triggerPhrases: [],
      promptLibraryIds: [],
      clauseTypes: [],
      expectedClauses: [],
      riskCategories: [],
      regimeRules: [
        {
          ruleId: "ukgdpr.review",
          ruleText: "Some rule with no investigation profile.",
          checkType: "judgment",
          findingCategory: "ukgdpr.review_gap",
          ruleScope: "per_document",
        },
      ],
      defaultOperation: "compliance_check",
    };
    const resolution = await resolveComplianceRequirements({
      instruction: "Review this IDTA.",
      intentRequirements: [],
      activeSkills: [nonRuleFirstSkill],
    });
    assert.deepEqual(resolution, { facets: [], selections: [], unresolved: [], complete: true });
  });
});
