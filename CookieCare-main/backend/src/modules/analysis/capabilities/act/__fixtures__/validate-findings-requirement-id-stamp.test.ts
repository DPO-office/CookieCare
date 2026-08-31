/**
 * ACT-Phase 1 — requirement-id stamping is required at the type level would
 * break the post-hoc stamping architecture (handlers emit raw findings
 * before act-utils.ts's stamp helpers enrich them), so it's enforced here
 * instead: `validateFindings` fails any user-facing compliance/risk finding
 * that reaches CRITIQUE without a requirementId.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Finding } from "../../../models/finding.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { CritiqueIssue, FixItem } from "../../../models/critique-report.js";
import { validateFindings } from "../../critique/validators/findings.js";

function finding(overrides: Partial<Finding>): Finding {
  return {
    findingId: "f1",
    kind: "compliance",
    category: "x",
    status: "present",
    claim: "x",
    evidence: [],
    taxonomyVersion: "test",
    ...overrides,
  };
}

const emptyState = { workspace: { documents: [] } } as unknown as AnalysisState;

describe("validateFindings — requirement-id stamping (ACT-Phase 1)", () => {
  it("fails a user-facing compliance finding with no requirementId", () => {
    const results: CritiqueIssue[] = [];
    const fixes: FixItem[] = [];
    validateFindings(emptyState, [finding({ requirementId: undefined })], results, fixes);

    const stampIssue = results.find((r) => r.itemId.startsWith("requirement-id-stamp:"));
    assert.ok(stampIssue, "expected a requirement-id-stamp issue");
    assert.equal(stampIssue!.status, "fail");
  });

  it("fails a user-facing risk finding with no requirementId", () => {
    const results: CritiqueIssue[] = [];
    const fixes: FixItem[] = [];
    validateFindings(
      emptyState,
      [finding({ kind: "risk", requirementId: undefined })],
      results,
      fixes
    );

    const stampIssue = results.find((r) => r.itemId.startsWith("requirement-id-stamp:"));
    assert.ok(stampIssue);
    assert.equal(stampIssue!.status, "fail");
  });

  it("passes when requirementId is present", () => {
    const results: CritiqueIssue[] = [];
    const fixes: FixItem[] = [];
    validateFindings(
      emptyState,
      [finding({ requirementId: "gdpr.article28.duration" })],
      results,
      fixes
    );

    const stampIssue = results.find((r) => r.itemId.startsWith("requirement-id-stamp:"));
    assert.equal(stampIssue, undefined, "no stamp issue expected once requirementId is set");
  });

  it("does not require requirementId on internal-visibility findings", () => {
    const results: CritiqueIssue[] = [];
    const fixes: FixItem[] = [];
    validateFindings(
      emptyState,
      [finding({ visibility: "internal", requirementId: undefined })],
      results,
      fixes
    );

    const stampIssue = results.find((r) => r.itemId.startsWith("requirement-id-stamp:"));
    assert.equal(stampIssue, undefined, "internal findings are exempt");
  });

  it("does not require requirementId on extraction/summary_point kinds", () => {
    const results: CritiqueIssue[] = [];
    const fixes: FixItem[] = [];
    validateFindings(
      emptyState,
      [
        finding({ kind: "extraction", requirementId: undefined }),
        finding({ kind: "summary_point", findingId: "f2", requirementId: undefined }),
      ],
      results,
      fixes
    );

    const stampIssues = results.filter((r) => r.itemId.startsWith("requirement-id-stamp:"));
    assert.equal(stampIssues.length, 0, "extraction/summary_point are not requirement-scoped");
  });
});
