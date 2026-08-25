process.env.GOOGLE_CLOUD_PROJECT ??= "art28-mandatory-requirements-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSkillById, resetSkillRegistryForTests } from "../runtime/catalog/registry.js";

const ART28_3_IDS = [
  "art28_3_a_instructions",
  "art28_3_b_confidentiality",
  "art28_3_c_security",
  "art28_3_d_subprocessors",
  "art28_3_e_dsr_assistance",
  "art28_3_f_security_assistance",
  "art28_3_g_deletion_return",
  "art28_3_h_audit",
];

describe("Art 28(3) mandatory package requirement split", () => {
  it("authors eight 28(3)(a)-(h) requirement ids plus 28(4)", () => {
    resetSkillRegistryForTests();
    const skill = getSkillById("regimes/data-protection/gdpr");
    assert.ok(skill);
    const pkg = skill.evidencePackages?.find(
      (item) => item.id === "gdpr.art28.3.mandatory_clauses"
    );
    assert.ok(pkg);
    for (const id of ART28_3_IDS) {
      assert.ok(pkg.requirementIds.includes(id), `missing ${id}`);
    }
    assert.ok(pkg.requirementIds.includes("art28_4_subprocessor_flow_down"));
    assert.equal(ART28_3_IDS.filter((id) => pkg.requirementIds.includes(id)).length, 8);
    assert.ok(!(pkg.requirementIds.includes("mandatory_article28_clauses")));
    assert.ok(pkg.requirementAliases?.includes("mandatory_article28_clauses"));
  });
});
