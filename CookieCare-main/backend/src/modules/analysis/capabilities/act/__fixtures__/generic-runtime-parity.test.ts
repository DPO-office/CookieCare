process.env.GOOGLE_CLOUD_PROJECT ??= "generic-runtime-parity-test";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyDocumentFromText } from "../classify-document.js";
import {
  getSkillById,
  mergeClauseHeuristics,
  resetSkillRegistryForTests,
} from "../../../skills/registry.js";
import { buildInventoryArtifact, inventoryClaim, parseArtifactShape } from "../inventory-provisions.js";
import { findRuleByRendererHook } from "../render-output.js";

describe("generic ACT runtime parity", () => {
  it("classifies DPA samples via authored docTypeClassifiers", () => {
    resetSkillRegistryForTests();
    const sample =
      "This Data Processing Agreement between Controller and Processor under Article 28 sets out processor obligations.";
    assert.equal(classifyDocumentFromText(sample), "dpa");
  });

  it("merges GDPR clause heuristics without hardcoding in extract-clauses", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr");
    assert.ok(gdpr);
    const heuristics = mergeClauseHeuristics([gdpr!]);
    assert.ok(
      heuristics.some((h) => h.clauseType === "international_transfer_mechanism"),
      "expected transfer heuristic from skill metadata"
    );
  });

  it("builds transfer inventory artifacts from fieldSpec metadata", () => {
    resetSkillRegistryForTests();
    const skill = getSkillById("regimes/data-protection/international-transfers");
    const pkg = skill?.evidencePackages?.find((p) => p.id === "international_transfer_inventory");
    assert.ok(pkg?.config?.artifactShape);
    const shape = parseArtifactShape(pkg!.config!.artifactShape);
    const artifact = buildInventoryArtifact({
      packageId: "international_transfer_inventory",
      outputArtifactType: "transfer_inventory",
      packageVersion: "1.0.0",
      requirementIds: ["international_data_transfer"],
      docId: "doc1",
      rawRecords: [
        {
          id: "t1",
          sectionTitle: "Transfers",
          quotedText: "SCCs apply",
          mechanism: "scc",
          destinationJurisdiction: "US",
          sourceJurisdiction: "EU",
          references: ["Module 2 SCCs"],
        },
      ],
      artifactShape: shape,
    });
    const data = artifact.data as {
      transfers: Array<{ mechanism: string }>;
      mechanisms: string[];
    };
    assert.equal(data.transfers.length, 1);
    assert.ok(data.mechanisms.length >= 1);
    assert.match(inventoryClaim(artifact, shape), /Identified 1 international transfer/);
  });

  it("resolves renderer hooks from authored rule metadata", () => {
    resetSkillRegistryForTests();
    const gdpr = getSkillById("regimes/data-protection/gdpr");
    assert.ok(gdpr);
    const rule = gdpr!.regimeRules.find((r) => r.rendererHooks?.responseTimeframeSection);
    assert.ok(rule, "expected responseTimeframeSection hook on authored rule");
    const hookRule = findRuleByRendererHook(
      { activeSkills: [gdpr!] } as import("../../../models/analysis-state.js").AnalysisState,
      "responseTimeframeSection"
    );
    assert.equal(hookRule?.ruleId, rule!.ruleId);
  });

  it("CCPA skill uses the same generic matrix row shape without regime strings in ACT", () => {
    resetSkillRegistryForTests();
    const ccpa = getSkillById("regimes/data-protection/ccpa-cpra");
    assert.ok(ccpa);
    assert.ok(ccpa!.regimeRules.length > 0);
    assert.equal(ccpa!.regimeRules.every((r) => typeof r.findingCategory === "string"), true);
  });
});
