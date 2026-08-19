process.env.GOOGLE_CLOUD_PROJECT ??= "plan-instruction-requirements-test";

/**
 * PLAN phase — instruction requirements, standard resolution, completeness checks.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeStandard } from "../../capabilities/plan/resolve-standard.js";
import {
  extractRequirementsHeuristic,
  extractInstructionFocus,
} from "../extract-instruction-focus.js";
import { getSkillById, resetSkillRegistryForTests } from "../registry.js";

const ART28_DPA_INSTRUCTION = `Review this DPA for GDPR Article 28 compliance. Verify subject matter, duration, nature and purpose, categories of data, categories of data subjects, controller obligations and rights, that all mandatory Article 28(3) clauses are present and adequate.`;

describe("PLAN instruction requirements", () => {
  it("resolves gdpr-article-28 standard alias to canonical regime pack", () => {
    resetSkillRegistryForTests();
    const result = normalizeStandard("regime_pack:gdpr-article-28");
    assert.equal(result.standard, "regime_pack:regimes/data-protection/gdpr");
    assert.equal(result.unresolved, undefined);
  });

  it("extracts Article 28 DPA semantic requirements heuristically", () => {
    const requirements = extractRequirementsHeuristic(ART28_DPA_INSTRUCTION);
    const ids = requirements.map((requirement) => requirement.id);
    assert.ok(ids.includes("subject_matter"));
    assert.ok(ids.includes("duration"));
    assert.ok(ids.includes("nature_and_purpose"));
    assert.ok(ids.includes("categories_of_data"));
    assert.ok(ids.includes("categories_of_data_subjects"));
    assert.ok(ids.includes("controller_obligations_and_rights"));
    assert.ok(ids.includes("mandatory_article_28_3_clauses"));
    assert.ok(ids.includes("clause_adequacy"));
  });

  it("returns structured focus with requirements and capability split for Article 28", async () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const focus = await extractInstructionFocus(ART28_DPA_INSTRUCTION, [gdpr]);
    assert.ok(focus, "focus should be defined for Article 28 DPA review");
    assert.ok((focus!.requirements?.length ?? 0) >= 5, "should preserve semantic requirements");
    assert.ok(focus!.requiredIds!.length > 0, "explicit Article 28 refs should yield required capabilities");
    assert.ok(
      focus!.ruleIds.some((id) => id.startsWith("gdpr.art28")),
      "should include Article 28 rules"
    );
    assert.ok(focus!.completenessCheck, "should include completeness check");
    assert.ok(Array.isArray(focus!.requirementMappings));
    assert.ok(Array.isArray(focus!.requiredCapabilities));
    assert.ok(Array.isArray(focus!.supportingCapabilities));
    if (focus!.unresolvedNeedDetails?.length) {
      for (const item of focus!.unresolvedNeedDetails) {
        assert.ok(item.requirement);
        assert.ok(item.reason);
      }
    }
  });

  it("does not promote related risk categories to required for a compliance_check", async () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const focus = await extractInstructionFocus(ART28_DPA_INSTRUCTION, [gdpr], {
      riskAnalysisRequested: false,
    });
    assert.ok(focus);
    const requiredRiskCategories = (focus!.provenance ?? []).filter(
      (item) => item.kind === "risk_category" && item.required
    );
    assert.deepEqual(
      requiredRiskCategories.map((item) => item.id),
      [],
      "risk categories must stay supporting for a pure compliance review"
    );
    const supportingRiskCategories = (focus!.provenance ?? []).filter(
      (item) => item.kind === "risk_category" && !item.required
    );
    assert.ok(
      supportingRiskCategories.length > 0,
      "related risk categories should remain available as supporting"
    );
    assert.ok(
      focus!.requiredCapabilities!.some((id) => id.startsWith("gdpr.art28")),
      "legal rules must remain required"
    );
  });

  it("promotes related risk categories to required when risk analysis is requested", async () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const focus = await extractInstructionFocus(
      `${ART28_DPA_INSTRUCTION} Flag all material risks.`,
      [gdpr],
      { riskAnalysisRequested: true }
    );
    assert.ok(focus);
    const requiredRiskCategories = (focus!.provenance ?? []).filter(
      (item) => item.kind === "risk_category" && item.required
    );
    assert.ok(
      requiredRiskCategories.length > 0,
      "risk categories should be required when the user asks to flag risks"
    );
  });

  it("marks explicit article refs as required, phrase map as supporting", async () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const focus = await extractInstructionFocus(
      "Check GDPR Article 28 processor terms only.",
      [gdpr]
    );
    assert.ok(focus);
    const provenance = new Map(focus!.provenance!.map((item) => [item.id, item]));
    const explicitEntries = [...provenance.values()].filter(
      (item) => item.source === "explicit_number"
    );
    assert.ok(explicitEntries.length > 0);
    // Explicit legal rule/matrix references are required; explicit risk-category
    // detectors stay supporting for a compliance review (no risk analysis asked).
    const explicitRuleAndMatrix = explicitEntries.filter(
      (item) => item.kind === "rule" || item.kind === "matrix_row"
    );
    assert.ok(explicitRuleAndMatrix.length > 0);
    assert.ok(explicitRuleAndMatrix.every((item) => item.required));
    assert.ok(
      explicitEntries
        .filter((item) => item.kind === "risk_category")
        .every((item) => !item.required),
      "explicit risk categories must not be required for a compliance review"
    );
    const phraseEntries = [...provenance.values()].filter(
      (item) => item.source === "phrase_map"
    );
    for (const entry of phraseEntries) {
      assert.equal(entry.required, false, "phrase map must remain supporting-only");
    }
  });
});
