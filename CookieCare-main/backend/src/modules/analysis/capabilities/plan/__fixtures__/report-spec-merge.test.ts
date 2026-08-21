process.env.GOOGLE_CLOUD_PROJECT ??= "report-spec-merge-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSkillById, resetSkillRegistryForTests } from "../../../skills/runtime/catalog/registry.js";
import { mergeAuthoredReportSections } from "../resolve-report-spec.js";

describe("report spec merge from authored packages", () => {
  it("NDA structural_review supplies NDA sections without GDPR chapeau defaults", () => {
    resetSkillRegistryForTests();
    const nda = getSkillById("doc-types/nda")!;
    const pkg = nda.evidencePackages!.find((p) => p.id === "nda.structural_review")!;
    const merged = mergeAuthoredReportSections({
      reportType: "regime_compliance_memo",
      depth: "standard",
      packages: [pkg],
    });
    assert.ok(merged.sections.includes("requirements_detail"));
    assert.ok(!merged.sections.includes("chapeau_particulars"));
    assert.ok((merged.outlineExtras?.length ?? 0) >= 3);
  });

  it("DPA structural_review includes chapeau_particulars", () => {
    resetSkillRegistryForTests();
    const dpa = getSkillById("doc-types/dpa")!;
    const pkg = dpa.evidencePackages!.find((p) => p.id === "dpa.structural_review")!;
    const merged = mergeAuthoredReportSections({
      reportType: "regime_compliance_memo",
      depth: "standard",
      packages: [pkg],
    });
    assert.ok(merged.sections.includes("chapeau_particulars"));
    assert.ok(merged.sections.includes("missing_materials"));
  });

  it("GDPR Art 28 packages preserve chapeau and mandatory outline extras", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr")!;
    const packages = gdpr.evidencePackages!.filter((p) => p.id.includes("art28"));
    const merged = mergeAuthoredReportSections({
      reportType: "regime_compliance_memo",
      depth: "standard",
      packages,
    });
    assert.ok(merged.sections.includes("chapeau_particulars"));
    const headings = (merged.outlineExtras ?? []).map((e) => e.heading);
    assert.ok(headings.some((h) => /particulars/i.test(h)));
    assert.ok(headings.some((h) => /mandatory/i.test(h)));
  });

  it("international transfer inventory uses transfer-oriented sections", () => {
    resetSkillRegistryForTests();
    const skill = getSkillById("regimes/data-protection/international-transfers")!;
    const pkg = skill.evidencePackages!.find(
      (p) => p.id === "international_transfer_inventory"
    )!;
    const merged = mergeAuthoredReportSections({
      reportType: "regime_compliance_memo",
      depth: "standard",
      packages: [pkg],
    });
    assert.deepEqual(merged.sections, [
      "scope",
      "requirements_detail",
      "recommendations",
      "conclusion",
    ]);
  });

  it("CCPA packages supply service-provider sections", () => {
    resetSkillRegistryForTests();
    const ccpa = getSkillById("regimes/data-protection/ccpa-cpra")!;
    const merged = mergeAuthoredReportSections({
      reportType: "regime_compliance_memo",
      depth: "standard",
      packages: ccpa.evidencePackages ?? [],
    });
    assert.ok(merged.sections.includes("requirements_detail"));
    assert.ok((merged.outlineExtras?.length ?? 0) >= 1);
  });
});
