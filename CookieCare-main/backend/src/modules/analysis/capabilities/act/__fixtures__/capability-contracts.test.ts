import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allCapabilityContracts,
  capabilityContractFor,
} from "../../contracts/analysis-capability-contract.js";
import { fallbackReportType } from "../../plan/intent-sensible-defaults.js";
import { operationNeedsOpenInventory } from "../../plan/build-open-plan.js";
import { operationSupportsOpenProposition } from "../../plan/generate-propositions.js";

describe("analysis capability contracts", () => {
  it("defines exactly one internally consistent contract per operation", () => {
    const contracts = allCapabilityContracts();
    assert.equal(new Set(contracts.map(({ operation }) => operation)).size, 8);
    for (const contract of contracts) {
      assert.equal(fallbackReportType(contract.operation), contract.defaultReportType);
      assert.equal(
        operationSupportsOpenProposition(contract.operation),
        contract.supportsOpenPropositions
      );
      assert.equal(
        operationNeedsOpenInventory(contract.operation),
        contract.needsOpenInventory
      );
      if (contract.leanVerifiedGraph) {
        assert.equal(contract.supportsOpenPropositions, true);
        assert.equal(contract.allowRelatedChecks, false);
        assert.equal(contract.allowComparativeChecks, false);
      }
    }
  });

  it("keeps focused Q&A lean, compositional, and free of adjacent checks", () => {
    const contract = capabilityContractFor("explain_qa");
    assert.equal(contract.leanVerifiedGraph, true);
    assert.equal(contract.needsOpenInventory, false);
    assert.equal(contract.evidenceCardinality, "single_or_multi_passage");
    assert.equal(contract.allowRelatedChecks, false);
    assert.equal(contract.allowBluf, false);
  });

  it("keeps compliance requirement-isolated and on the authored regime path", () => {
    const contract = capabilityContractFor("compliance_check");
    assert.equal(contract.bypassRegimeCatalog, false);
    assert.equal(contract.leanVerifiedGraph, false);
    assert.equal(contract.evidenceCardinality, "requirement_isolated");
    assert.equal(contract.allowBluf, true);
  });

  it("keeps risk and comparison output semantics separate", () => {
    const risk = capabilityContractFor("risk_flag");
    const compare = capabilityContractFor("compare");
    assert.equal(risk.evidenceCardinality, "ranked_findings");
    assert.equal(risk.outlineDesigner, "risk");
    assert.equal(compare.evidenceCardinality, "paired_sides");
    assert.equal(compare.outlineDesigner, "comparison");
    assert.equal(risk.allowBluf, false);
    assert.equal(compare.allowBluf, false);
  });

  it("does not force summary through proposition verification", () => {
    const contract = capabilityContractFor("summarize");
    assert.equal(contract.supportsOpenPropositions, false);
    assert.equal(contract.evidenceCardinality, "document_rollup");
    assert.equal(contract.allowRelatedChecks, false);
  });
});
