/**
 * Phase 2 — structural requirement binding.
 *
 * Companion to `capabilities/act/__fixtures__/static-alias-table-drift.test.ts`,
 * which documents the failure this fixes: the PLAN classifier invents merged
 * requirement ids (e.g. `gdpr.article28.subject_matter_duration`) that no
 * hand-authored alias table anticipates, orphaning correctly-evidenced findings.
 * Here we prove the binding is derived STRUCTURALLY — from the request/native
 * ids themselves — with no table to maintain.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Finding } from "../../models/finding.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import { deriveStructuralBindings } from "../requirement-binding.js";
import { findingsLinkedToRequirement } from "../article-linkage.js";

const noCaps = () => [];

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

describe("structural requirement binding", () => {
  it("splits a merged classifier id across its two package natives (the drift case)", () => {
    const bindings = deriveStructuralBindings(
      ["gdpr.article28.subject_matter_duration"],
      noCaps,
      {
        packageId: "gdpr.art28.particulars",
        nativeRequirementIds: [
          "gdpr.article28.duration",
          "gdpr.article28.subject_matter",
          "gdpr.article28.nature_and_purpose",
        ],
      }
    );
    const bound = bindings
      .filter((b) => b.requestRequirementId === "gdpr.article28.subject_matter_duration")
      .map((b) => b.nativeRequirementId)
      .sort();
    assert.deepEqual(
      bound,
      ["gdpr.article28.duration", "gdpr.article28.subject_matter"],
      "both halves of the merged id must bind; the unrelated native must not"
    );
    assert.ok(
      bindings.every((b) => b.relation === "child" && b.source === "subprovision"),
      "token-subset nesting resolves the merge without an alias table"
    );
  });

  it("binds an identical id directly (canonical)", () => {
    const bindings = deriveStructuralBindings(
      ["international_data_transfer"],
      noCaps,
      {
        packageId: "international_transfer_evaluation",
        nativeRequirementIds: ["international_data_transfer", "schrems_supplementary_measures"],
      }
    );
    const direct = bindings.find(
      (b) => b.nativeRequirementId === "international_data_transfer"
    );
    assert.ok(direct);
    assert.equal(direct!.source, "canonical");
    assert.equal(direct!.relation, "direct");
  });

  it("binds via the request→capability→native-capability path", () => {
    const bindings = deriveStructuralBindings(
      ["transfer_destinations"],
      (reqId) => (reqId === "transfer_destinations" ? ["gdpr.art44"] : []),
      {
        packageId: "international_transfer_evaluation",
        nativeRequirementIds: ["general_transfer_restriction"],
        nativeCapabilities: new Map([["general_transfer_restriction", ["gdpr.art44"]]]),
      }
    );
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0]!.source, "capability");
  });

  it("fails closed when an unmatched request merely selected the package", () => {
    const bindings = deriveStructuralBindings(
      ["international_transfer.sccs"],
      noCaps,
      {
        packageId: "international_transfer_evaluation",
        nativeRequirementIds: [
          "transfer_mechanism_identification",
          "schrems_supplementary_measures",
          "international_data_transfer",
        ],
      }
    );
    assert.deepEqual(bindings, []);
  });

  it("uses request descriptions and authored hypotheses to isolate transfer concepts", () => {
    const bindings = deriveStructuralBindings(
      [
        "international_transfers.sccs",
        "international_transfers.supplementary_measures",
        "international_transfers.destinations",
      ],
      noCaps,
      {
        packageId: "international_transfer_evaluation",
        nativeRequirementIds: [
          "transfer_mechanism_identification",
          "schrems_supplementary_measures",
          "international_data_transfer",
        ],
        requestDescriptions: new Map([
          ["international_transfers.sccs", "Check Standard Contractual Clauses"],
          [
            "international_transfers.supplementary_measures",
            "Check Schrems II supplementary measures",
          ],
          ["international_transfers.destinations", "Identify transfer destinations"],
        ]),
        nativeDescriptions: {
          transfer_mechanism_identification:
            "The agreement identifies the lawful transfer mechanism, including Standard Contractual Clauses (SCCs), adequacy, or Binding Corporate Rules.",
          schrems_supplementary_measures:
            "The agreement addresses Schrems II supplementary measures and transfer impact assessments.",
          international_data_transfer:
            "The agreement identifies international transfer destinations and destination jurisdictions.",
        },
      }
    );
    const byRequest = new Map(
      bindings.map((binding) => [
        binding.requestRequirementId,
        binding.nativeRequirementId,
      ])
    );
    assert.equal(bindings.length, 3);
    assert.equal(
      byRequest.get("international_transfers.sccs"),
      "transfer_mechanism_identification"
    );
    assert.equal(
      byRequest.get("international_transfers.supplementary_measures"),
      "schrems_supplementary_measures"
    );
    assert.equal(
      byRequest.get("international_transfers.destinations"),
      "international_data_transfer"
    );
    assert.ok(bindings.every((binding) => binding.source === "semantic"));
  });

  it("uses package-local discriminating vocabulary to resolve close semantic siblings", () => {
    const bindings = deriveStructuralBindings(
      ["generated.transfer.supplementary_measures"],
      () => ["international_transfer_evaluation"],
      {
        packageId: "international_transfer_evaluation",
        nativeRequirementIds: [
          "transfer_mechanism_identification",
          "schrems_supplementary_measures",
          "international_data_transfer",
        ],
        requestDescriptions: new Map([
          [
            "generated.transfer.supplementary_measures",
            "Review international transfer supplementary measures and safeguards",
          ],
        ]),
        nativeDescriptions: {
          transfer_mechanism_identification:
            "Identify international transfer mechanisms and contractual safeguards",
          schrems_supplementary_measures:
            "Assess Schrems supplementary measures and transfer safeguards",
          international_data_transfer:
            "Identify international transfer destinations and jurisdictions",
        },
      }
    );

    assert.deepEqual(
      bindings.map((binding) => binding.nativeRequirementId),
      ["schrems_supplementary_measures"]
    );
    assert.equal(bindings[0]!.source, "semantic");
  });

  it("honors explicit package edges and blocks fuzzy cross-package bindings", () => {
    const selectedPackageIds = ["regime.particulars", "regime.mandatory"];
    const descriptions = new Map([
      ["regime.duration", "Verify processing duration under the applicable rule"],
      ["regime.processor_obligations", "Check whether all mandatory processor obligations are present"],
    ]);
    const durationAgainstWrongPackage = deriveStructuralBindings(
      ["regime.duration"],
      () => ["regime.particulars"],
      {
        packageId: "regime.mandatory",
        nativeRequirementIds: ["documented_instructions", "confidentiality"],
        selectedPackageIds,
        requestDescriptions: descriptions,
        nativeDescriptions: {
          documented_instructions: "Processing only under documented instructions",
          confidentiality: "Persons processing data are bound by confidentiality",
        },
      }
    );
    assert.deepEqual(durationAgainstWrongPackage, []);

    const broadMandatory = deriveStructuralBindings(
      ["regime.processor_obligations"],
      () => ["regime.mandatory"],
      {
        packageId: "regime.mandatory",
        nativeRequirementIds: ["documented_instructions", "confidentiality"],
        selectedPackageIds,
        requestDescriptions: descriptions,
      }
    );
    assert.deepEqual(
      broadMandatory.map((binding) => binding.nativeRequirementId),
      ["documented_instructions", "confidentiality"]
    );
  });

  it("binds every native only when the request structurally names the package umbrella", () => {
    const bindings = deriveStructuralBindings(
      ["gdpr.article28.mandatory_clauses_adequacy"],
      noCaps,
      {
        packageId: "gdpr.art28.3.mandatory_clauses",
        nativeRequirementIds: ["art28_3_a_instructions", "art28_3_b_confidentiality"],
      }
    );
    assert.deepEqual(
      bindings.map((binding) => binding.nativeRequirementId).sort(),
      ["art28_3_a_instructions", "art28_3_b_confidentiality"]
    );
    assert.ok(bindings.every((binding) => binding.source === "semantic"));
  });

  it("binds a content-free umbrella only through its explicit PLAN package edge", () => {
    const nativeRequirementIds = ["alpha", "beta", "gamma"];
    const bindings = deriveStructuralBindings(
      ["regime.compliance.assessment"],
      () => ["regime.package.review"],
      {
        packageId: "regime.package.review",
        nativeRequirementIds,
      }
    );
    assert.deepEqual(
      bindings.map((binding) => binding.nativeRequirementId),
      nativeRequirementIds
    );

    const notExplicitlyMapped = deriveStructuralBindings(
      ["regime.compliance.assessment"],
      () => ["some.other.package"],
      {
        packageId: "regime.package.review",
        nativeRequirementIds,
      }
    );
    assert.deepEqual(notExplicitlyMapped, []);
  });

  it("binds a single broad request from explicit multi-package PLAN edges, independent of its wording", () => {
    const nativeRequirementIds = ["alpha", "beta", "gamma"];
    const packageIds = ["regime.package.review", "regime.package.mandatory"];
    const bindings = deriveStructuralBindings(
      ["regime.generated_parent_label"],
      () => packageIds,
      {
        packageId: "regime.package.review",
        nativeRequirementIds,
        selectedPackageIds: packageIds,
        requestRequirementCount: 1,
      }
    );
    assert.deepEqual(
      bindings.map((binding) => binding.nativeRequirementId),
      nativeRequirementIds
    );

    const compoundAsk = deriveStructuralBindings(
      ["regime.generated_parent_label", "regime.specific_check"],
      () => packageIds,
      {
        packageId: "regime.package.review",
        nativeRequirementIds,
        selectedPackageIds: packageIds,
        requestRequirementCount: 2,
      }
    );
    assert.deepEqual(
      compoundAsk,
      [],
      "multi-requirement asks must not acquire package-wide bindings"
    );
  });

  it("closes the loop: stamped findings resolve through article-linkage (the drift fix)", () => {
    // The two native findings evaluate-package would emit, now carrying the
    // request-id stamp the binding graph produces (see static-alias-table-drift
    // for the un-stamped orphan this fixes).
    const findings: Finding[] = [
      presentFinding({
        findingId: "f_duration",
        requirementId: "gdpr.article28.duration",
        requestRequirementIds: ["gdpr.article28.subject_matter_duration"],
      }),
      presentFinding({
        findingId: "f_subject_matter",
        requirementId: "gdpr.article28.subject_matter",
        requestRequirementIds: ["gdpr.article28.subject_matter_duration"],
      }),
    ];
    const state = { activeSkills: [] } as unknown as AnalysisState;

    const linked = findingsLinkedToRequirement(
      "gdpr.article28.subject_matter_duration",
      findings,
      state
    );
    assert.deepEqual(
      linked.map((f) => f.findingId).sort(),
      ["f_duration", "f_subject_matter"],
      "both stamped findings must reach the merged request id — no orphan, no alias table"
    );
  });
});
