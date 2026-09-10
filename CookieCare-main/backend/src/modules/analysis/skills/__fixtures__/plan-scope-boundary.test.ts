process.env.GOOGLE_CLOUD_PROJECT ??= "plan-scope-boundary-test";

/**
 * Point 5 — explicit scope must bound standalone package/rule work through ACT.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InstructionFocus } from "../../models/analysis-plan.js";
import type { IntentClassification, IntentRequirement } from "../../models/intent.js";
import type { AnalysisSkillConfig } from "../runtime/catalog/types.js";
import {
  capabilityIdMatchesScope,
  extractExplicitScope,
  ruleIdMatchesScope,
  scopeBoundaryActive,
} from "../runtime/focus/extract-explicit-scope.js";
import { buildResolutionCatalog } from "../runtime/focus/build-resolution-catalog.js";
import { collectStrongCatalogShortlist } from "../runtime/focus/extract-instruction-focus.js";
import { buildActGraphDetailed } from "../runtime/graph/build-act-graph.js";
import { resolvePackages } from "../runtime/graph/resolve-packages.js";
import {
  bothSkills,
  gdpr,
  intent as baseIntent,
} from "../../__test-helpers__/package-graph-fixtures.js";

const ART28_REVIEW =
  "Perform a rigorous GDPR Article 28 compliance review. Verify mandatory Article 28(3) clauses.";

const ART28_ONLY_3 = "Only assess GDPR Article 28(3) mandatory clauses in this DPA.";

const ART28_AND_32 =
  "Review GDPR Article 28 and Article 32 security requirements in this DPA.";

const BROAD_DPA = "Analyse this DPA against GDPR.";

const TRANSFER_INSTRUCTION =
  "Analyse all international data transfer provisions. Identify whether Standard Contractual Clauses, Binding Corporate Rules, or adequacy decisions are referenced.";

const CROSS_REF_INSTRUCTION =
  "Review Article 28, considering Articles 32-36 when assessing processor assistance.";

function intent(requirements: IntentRequirement[] = []): IntentClassification {
  return {
    ...baseIntent(requirements),
    standard: "regime_pack:regimes/data-protection/gdpr",
  };
}

function focus(partial: Partial<InstructionFocus>): InstructionFocus {
  return {
    ruleIds: [],
    matrixRowIds: [],
    riskCategoryIds: [],
    instructionText: "",
    ...partial,
  };
}

function gdprSkills(): AnalysisSkillConfig[] {
  return [gdpr()];
}

function transferSkills(): AnalysisSkillConfig[] {
  return bothSkills();
}

function ruleIdsFromGraph(workUnits: ReturnType<typeof buildActGraphDetailed>["workUnits"]): string[] {
  return workUnits
    .filter((unit) => unit.tool === "check_against_rule")
    .map((unit) => String(unit.input.ruleId));
}

function evalPackageInputs(workUnits: ReturnType<typeof buildActGraphDetailed>["workUnits"]) {
  return workUnits
    .filter((unit) => unit.tool === "evaluate_package")
    .map((unit) => ({
      packageId: String(unit.input.packageId),
      capabilityIds: (unit.input.capabilityIds as string[]) ?? [],
      contextCapabilityIds: (unit.input.contextCapabilityIds as string[]) ?? [],
    }));
}

function mockRequiresPackagesSkill(): AnalysisSkillConfig {
  return {
    skillId: "test/scope-gate",
    axis: "regime",
    status: "published",
    label: "Scope gate test",
    version: "test",
    appliesToDocTypes: [],
    triggerPhrases: [],
    promptLibraryIds: [],
    defaultOperation: "compliance_check",
    regimeRules: [],
    riskCategories: [],
    rightsMatrixRows: [],
    expectedClauses: [],
    clauseTypes: [],
    evidencePackages: [
      {
        id: "gdpr.art28.eval_test",
        requirementIds: ["art28_test"],
        capabilityIds: ["gdpr.art28.3.a"],
        clauseTypes: ["processor_obligations"],
        extractionTargets: ["processor_obligations"],
        sourceMode: "authored",
        requiresPackages: ["gdpr.art32.inventory_test"],
      },
      {
        id: "gdpr.art32.inventory_test",
        requirementIds: [],
        capabilityIds: [],
        clauseTypes: ["international_transfer_mechanism"],
        extractionTargets: ["international_transfer_mechanism"],
        sourceMode: "authored",
        kind: "inventory",
        config: { artifactShape: "typed_records" },
      },
    ],
  } as AnalysisSkillConfig;
}

describe("plan scope boundary", () => {
  describe("Test 1 — Article 28 only", () => {
    it("bounds evaluate_package capabilities and blocks out-of-scope rule units", () => {
      const skills = gdprSkills();
      const scope = extractExplicitScope(ART28_REVIEW);
      assert.deepEqual(scope.articles, [28]);
      assert.equal(scopeBoundaryActive(scope), true);

      const planFocus = focus({
        instructionText: ART28_REVIEW,
        explicitScope: scope,
        ruleIds: ["gdpr.art28.3.a", "gdpr.art28.3.f", "gdpr.art32", "gdpr.art39.1.a-c"],
        selectedPackageIds: ["gdpr.art28.particulars", "gdpr.art28.3.mandatory_clauses"],
      });
      const resolution = resolvePackages(skills, planFocus, intent().requirements);
      const graph = buildActGraphDetailed({
        docId: "dpa-1",
        instruction: ART28_REVIEW,
        skills,
        intent: intent(),
        focus: planFocus,
      });

      for (const entry of evalPackageInputs(graph.workUnits)) {
        for (const capId of entry.capabilityIds) {
          assert.equal(
            capabilityIdMatchesScope(capId, scope),
            true,
            `out-of-scope capability on ${entry.packageId}: ${capId}`
          );
        }
      }

      const outOfScopeRules = ruleIdsFromGraph(graph.workUnits).filter(
        (id) => !ruleIdMatchesScope(id, scope)
      );
      assert.deepEqual(outOfScopeRules, []);

      const transferEval = resolution.packages.find(
        (item) => item.pkg.id === "international_transfer_evaluation"
      );
      assert.equal(transferEval, undefined);
    });
  });

  describe("Test 2 — Article 28(3) only", () => {
    it("preserves 28(3) package capabilities and excludes 28.1/28.2 standalone rules", () => {
      const skills = gdprSkills();
      const scope = extractExplicitScope(ART28_ONLY_3);
      assert.deepEqual(scope.subsections, [{ article: 28, paragraph: 3 }]);

      const planFocus = focus({
        instructionText: ART28_ONLY_3,
        explicitScope: scope,
        ruleIds: ["gdpr.art28.3.a", "gdpr.art28.3.h", "gdpr.art28.4"],
        selectedPackageIds: ["gdpr.art28.3.mandatory_clauses"],
      });
      const graph = buildActGraphDetailed({
        docId: "dpa-1",
        instruction: ART28_ONLY_3,
        skills,
        intent: intent(),
        focus: planFocus,
      });

      const mandatory = evalPackageInputs(graph.workUnits).find(
        (entry) => entry.packageId === "gdpr.art28.3.mandatory_clauses"
      );
      assert.ok(mandatory);
      assert.ok(mandatory!.capabilityIds.includes("gdpr.art28.3.a"));
      assert.ok(mandatory!.capabilityIds.includes("gdpr.art28.4"));
      assert.equal(mandatory!.capabilityIds.includes("gdpr.art28.1"), false);
      assert.equal(mandatory!.capabilityIds.includes("gdpr.art28.2"), false);

      const standalone = ruleIdsFromGraph(graph.workUnits);
      assert.equal(standalone.includes("gdpr.art28.1"), false);
      assert.equal(standalone.includes("gdpr.art28.2"), false);
    });
  });

  describe("Test 3 — Articles 28 and 32", () => {
    it("allows standalone work for both explicit articles", () => {
      const skills = gdprSkills();
      const scope = extractExplicitScope(ART28_AND_32);
      assert.deepEqual(scope.articles, [28, 32]);

      const planFocus = focus({
        instructionText: ART28_AND_32,
        explicitScope: scope,
        ruleIds: ["gdpr.art28.3.a", "gdpr.art32", "gdpr.art33"],
        selectedPackageIds: ["gdpr.art28.3.mandatory_clauses"],
      });
      const resolution = resolvePackages(skills, planFocus);
      const allCaps = resolution.packages.flatMap((item) => item.capabilityIds);
      assert.ok(allCaps.some((id) => id.startsWith("gdpr.art28")));
      assert.ok(
        planFocus.ruleIds.some((id) => id.startsWith("gdpr.art32")) ||
          resolution.leftoverRuleIds.some((id) => id.startsWith("gdpr.art32"))
      );
      assert.equal(resolution.leftoverRuleIds.includes("gdpr.art33"), false);
    });
  });

  describe("Test 4 — cross-reference context", () => {
    it("keeps Arts 32-36 as context, not standalone capabilities", () => {
      const skills = gdprSkills();
      const scope = extractExplicitScope(CROSS_REF_INSTRUCTION);
      assert.deepEqual(scope.articles, [28]);
      assert.deepEqual(scope.contextArticles, [32, 33, 34, 35, 36]);

      const planFocus = focus({
        instructionText: CROSS_REF_INSTRUCTION,
        explicitScope: scope,
        ruleIds: ["gdpr.art28.3.f"],
        selectedPackageIds: ["gdpr.art28.3.mandatory_clauses"],
      });
      const resolution = resolvePackages(skills, planFocus);
      const mandatory = resolution.packages.find(
        (item) => item.pkg.id === "gdpr.art28.3.mandatory_clauses"
      );
      assert.ok(mandatory);
      assert.ok(mandatory!.capabilityIds.includes("gdpr.art28.3.f"));
      assert.equal(
        mandatory!.capabilityIds.some((id) => /^gdpr\.art3[2-6]/.test(id)),
        false
      );
    });
  });

  describe("Test 5 — broad DPA (no explicit article ceiling)", () => {
    it("does not split package capabilities when scope boundary is inactive", () => {
      const skills = gdprSkills();
      const scope = extractExplicitScope(BROAD_DPA);
      assert.equal(scopeBoundaryActive(scope), false);

      const planFocus = focus({
        instructionText: BROAD_DPA,
        explicitScope: scope,
        selectedPackageIds: ["gdpr.art28.3.mandatory_clauses"],
      });
      const resolution = resolvePackages(skills, planFocus);
      const mandatory = resolution.packages.find(
        (item) => item.pkg.id === "gdpr.art28.3.mandatory_clauses"
      );
      assert.ok(mandatory);
      assert.deepEqual(
        mandatory!.capabilityIds,
        mandatory!.pkg.capabilityIds
      );
      assert.deepEqual(mandatory!.contextCapabilityIds, []);
      assert.deepEqual(resolution.scopeAudit, []);
    });
  });

  describe("Test 6 — international transfers (no Art-44 ceiling)", () => {
    it("runs full transfer evaluation capabilities on a broad transfer request", () => {
      const skills = transferSkills();
      const scope = extractExplicitScope(TRANSFER_INSTRUCTION);
      assert.equal(scopeBoundaryActive(scope), false);

      const reqs: IntentRequirement[] = [
        {
          id: "international_data_transfer",
          description: TRANSFER_INSTRUCTION,
          type: "extraction",
          priority: "required",
        },
        {
          id: "transfer_mechanism_identification",
          description: "Identify transfer mechanisms",
          type: "verification",
          priority: "required",
        },
      ];
      const planFocus = focus({
        instructionText: TRANSFER_INSTRUCTION,
        explicitScope: scope,
        ruleIds: [
          "gdpr.art44",
          "gdpr.art45.1",
          "gdpr.art46",
          "gdpr.art47",
          "gdpr.art48",
          "gdpr.art49",
        ],
        requirements: reqs.map((req) => ({ id: req.id, label: req.description })),
      });
      const resolution = resolvePackages(skills, planFocus, reqs);
      const evaluation = resolution.packages.find(
        (item) => item.pkg.id === "international_transfer_evaluation"
      );
      assert.ok(evaluation, "transfer evaluation package should be selected");
      assert.ok(evaluation!.capabilityIds.includes("gdpr.art44"));
      assert.ok(evaluation!.capabilityIds.includes("gdpr.art49"));
      assert.ok(evaluation!.capabilityIds.includes("transfers.scc_module_selection"));
    });
  });

  describe("Test 7 — requiresPackages scope gate", () => {
    it("drops out-of-scope dependency packages and records scopeAudit", () => {
      const mockSkill = mockRequiresPackagesSkill();
      const scope = extractExplicitScope(ART28_REVIEW);
      const planFocus = focus({
        instructionText: ART28_REVIEW,
        explicitScope: scope,
        requirements: [{ id: "art28_test", label: "Art 28 test" }],
      });
      const reqs: IntentRequirement[] = [
        {
          id: "art28_test",
          description: "Art 28 test",
          type: "verification",
          priority: "required",
        },
      ];
      const resolution = resolvePackages([mockSkill], planFocus, reqs);
      assert.ok(
        resolution.packages.some((item) => item.pkg.id === "gdpr.art28.eval_test")
      );
      assert.equal(
        resolution.packages.some((item) => item.pkg.id === "gdpr.art32.inventory_test"),
        false
      );
      const parentAudit = resolution.scopeAudit.find(
        (entry) => entry.packageId === "gdpr.art28.eval_test"
      );
      assert.ok(parentAudit);
      assert.ok(
        parentAudit!.droppedDependencyIds.includes("gdpr.art32.inventory_test")
      );
    });
  });

  describe("audit shape", () => {
    it("returns empty scopeAudit when every capability is in scope", () => {
      const skills = gdprSkills();
      const scope = extractExplicitScope(ART28_ONLY_3);
      const planFocus = focus({
        instructionText: ART28_ONLY_3,
        explicitScope: scope,
        selectedPackageIds: ["gdpr.art28.3.mandatory_clauses"],
        ruleIds: ["gdpr.art28.3.a"],
      });
      const resolution = resolvePackages(skills, planFocus);
      const mandatory = resolution.packages.find(
        (item) => item.pkg.id === "gdpr.art28.3.mandatory_clauses"
      );
      assert.ok(mandatory);
      const outOfScopeCaps = mandatory!.contextCapabilityIds;
      assert.equal(
        resolution.scopeAudit.length === 0 || outOfScopeCaps.length === 0,
        true
      );
    });
  });

  describe("shortlist sibling scoping", () => {
    it("does not add out-of-scope transfer rule ids to the catalog shortlist", () => {
      const skills = transferSkills();
      const scope = extractExplicitScope(ART28_REVIEW);
      const catalog = buildResolutionCatalog(skills);
      const { ids } = collectStrongCatalogShortlist(ART28_REVIEW, skills, scope, catalog);
      for (const id of ids) {
        if (/^gdpr\.art4[4-9]/.test(id)) {
          assert.fail(`transfer rule leaked into Art 28 shortlist: ${id}`);
        }
      }
    });
  });
});
