/**
 * ACT-Phase 0 deterministic fixture — "static alias table drift."
 *
 * Confirmed live on the real Cisco DPA (baseline-cisco-art28-BEFORE.json,
 * captured via the actual production PacController + defaultPacCapabilities,
 * 2026-08-29): LEGACY's PLAN classifier LLM-authors GDPR Art 28 requirement
 * ids fresh on every run. On the captured run it authored
 * `gdpr.article28.subject_matter_duration`, merging what evaluate_package's
 * package-native code treats as two separate requirements
 * (`gdpr.article28.subject_matter`, `gdpr.article28.duration`) into one PLAN
 * row.
 *
 * `shared/requirement-identity.ts`'s `UMBRELLA_TO_MEMBERS` table only knows
 * merges someone previously observed and hand-authored (e.g. the categories
 * umbrella). It has no entry for this subject-matter+duration merge, so
 * `getUmbrellaMembers` returns undefined for it, and
 * `article-linkage.ts`'s `findingsLinkedToRequirement` — the actual
 * finding-to-requirement bridge aggregate_requirements calls — returns zero
 * findings for this PLAN row despite two correctly-evidenced `present`
 * findings existing under its two native halves.
 *
 * Result in the real run: this PLAN row (and the other 9) all resolved to
 * `cannot_determine`, even though `gdpr.article28.subject_matter` and
 * `gdpr.article28.duration` were both independently found `present` with
 * real evidence. This is the same failure class as the research doc's §3a
 * dual-namespace-collision / orphan-finding, but demonstrates it is NOT
 * fully fixed: a static, hand-enumerated umbrella table cannot keep pace
 * with a non-deterministic LLM inventing new merges on every call. Required
 * property for the ACT rebuild: canonical identity must not depend on
 * anticipating every future LLM phrasing/merge.
 *
 * (The `data_types_categories` id from the same run is NOT part of this bug
 * — it correctly resolves via the existing categories umbrella; its
 * `cannot_determine` status there is legitimate, the underlying findings are
 * genuinely `insufficient_evidence`, not orphaned.)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Finding } from "../../../models/finding.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import {
  canonicalRequirementId,
  getUmbrellaMembers,
  requirementIdsEquivalent,
} from "../../../shared/requirement-identity.js";
import { findingsLinkedToRequirement } from "../../../shared/article-linkage.js";

function presentFinding(overrides: Partial<Finding>): Finding {
  return {
    findingId: "f",
    kind: "compliance",
    category: "x",
    status: "present",
    claim: "x",
    evidence: [],
    taxonomyVersion: "test",
    ...overrides,
  };
}

describe("static alias table drift (live Cisco baseline, 2026-08-29)", () => {
  it("has no umbrella for the live PLAN-authored merged subject_matter+duration id", () => {
    const planId = "gdpr.article28.subject_matter_duration";
    assert.equal(
      canonicalRequirementId(planId),
      planId,
      "unrecognized spelling canonicalizes to itself — no bridge exists"
    );
    assert.equal(
      getUmbrellaMembers(planId),
      undefined,
      "no umbrella entry anticipates this merge — confirms the live gap"
    );
    assert.ok(!requirementIdsEquivalent(planId, "gdpr.article28.duration"));
    assert.ok(!requirementIdsEquivalent(planId, "gdpr.article28.subject_matter"));
  });

  it("orphans two correctly-evidenced present findings under the merged PLAN id (real repro)", () => {
    const findings: Finding[] = [
      presentFinding({ findingId: "f_duration", requirementId: "gdpr.article28.duration" }),
      presentFinding({
        findingId: "f_subject_matter",
        requirementId: "gdpr.article28.subject_matter",
      }),
    ];
    const state = {
      intent: {
        requirements: [
          {
            id: "gdpr.article28.subject_matter_duration",
            type: "adequacy",
            priority: "required",
            description: "x",
          },
        ],
      },
      activeSkills: [],
    } as unknown as AnalysisState;

    const linked = findingsLinkedToRequirement(
      "gdpr.article28.subject_matter_duration",
      findings,
      state
    );

    assert.deepEqual(
      linked,
      [],
      "both present findings should NOT be silently dropped here — this is the live bug, " +
        "not a spec — the fix (ACT rebuild) must not require hand-enumerating every " +
        "possible LLM merge"
    );
  });

  it("control: the table DOES bridge a merge someone already anticipated (categories)", () => {
    const planId = "gdpr.article28.data_types_categories";
    assert.deepEqual(getUmbrellaMembers(planId), [
      "data_categories",
      "data_subject_categories",
    ]);

    const findings: Finding[] = [
      { ...presentFinding({ findingId: "f1", requirementId: "gdpr.article28.categories_of_data" }), status: "insufficient_evidence" },
      { ...presentFinding({ findingId: "f2", requirementId: "gdpr.article28.categories_of_data_subjects" }), status: "insufficient_evidence" },
    ];
    const state = {
      intent: { requirements: [{ id: planId, type: "adequacy", priority: "required", description: "x" }] },
      activeSkills: [],
    } as unknown as AnalysisState;

    const linked = findingsLinkedToRequirement(planId, findings, state);
    assert.deepEqual(
      linked.map((f) => f.findingId).sort(),
      ["f1", "f2"],
      "this merge IS anticipated — correctly bridges (isolates the bug to unanticipated merges only)"
    );
  });
});
