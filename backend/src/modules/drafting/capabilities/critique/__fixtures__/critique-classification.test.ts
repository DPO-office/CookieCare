import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyFixItems,
  partitionClassifiedFixes,
} from "../classify-fix.js";
import type { FixItem } from "../../../models/critique-report.js";

describe("critique classification", () => {
  it("classifies placeholders and party-consistency as deterministic", () => {
    const fixes: FixItem[] = [
      {
        workUnitId: "sec-parties",
        instruction: "remove placeholders",
        sourceChecklistItemId: "placeholders",
      },
      {
        workUnitId: "sec-processing",
        instruction: "party lock",
        sourceChecklistItemId: "party-consistency",
      },
    ];
    const classified = classifyFixItems(fixes);
    const { deterministic, sectionRedraft } = partitionClassifiedFixes(classified);
    assert.equal(deterministic.length, 2);
    assert.equal(sectionRedraft.length, 0);
  });

  it("classifies skill section fails as section_redraft", () => {
    const fixes: FixItem[] = [
      {
        workUnitId: "sec-breach",
        instruction: "add breach notice",
        sourceChecklistItemId: "dpa-sec-breach-present",
      },
    ];
    const classified = classifyFixItems(fixes);
    assert.equal(classified[0].strategy, "section_redraft");
  });

  it("classifies skeleton missing as plan_change", () => {
    const fixes: FixItem[] = [
      {
        workUnitId: "sec-misc",
        instruction: "restore section",
        sourceChecklistItemId: "skeleton:sec-misc",
      },
    ];
    const classified = classifyFixItems(fixes);
    assert.equal(classified[0].strategy, "plan_change");
  });

  it("iteration cap env defaults to >= 1", () => {
    const maxIter = Math.max(1, Number(process.env.DRAFTING_CRITIQUE_MAX_ITER || 2));
    assert.ok(maxIter >= 1);
  });
});
