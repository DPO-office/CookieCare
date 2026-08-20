process.env.GOOGLE_CLOUD_PROJECT ??= "inventory-artifact-shape-test";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { getSkillById, resetSkillRegistryForTests } from "../../../skills/registry.js";

const { buildInventoryArtifact, inventoryClaim, parseArtifactShape } = await import(
  "../inventory-provisions.js"
);

const HANDLER = fileURLToPath(new URL("../inventory-provisions.ts", import.meta.url));

describe("inventory artifactShape", () => {
  it("materializes TransferRecord inventories from typed_records fieldSpec config", () => {
    const shape = parseArtifactShape({
      kind: "typed_records",
      recordType: "TransferRecord",
      recordsKey: "transfers",
      claimMechanismAggregate: "mechanisms",
      fieldSpec: [
        { name: "id", source: "_id" },
        { name: "evidenceIds", source: "_evidenceIds", defaultValue: [] },
        { name: "sectionIds", source: "_sectionIds" },
        { name: "sourceJurisdiction", source: "sourceJurisdiction" },
        { name: "destinationJurisdiction", source: "destinationJurisdiction" },
        { name: "mechanism", source: "mechanism", normalizeAliases: true },
        { name: "legalBasis", source: "legalBasis" },
        { name: "supplementaryMeasures", source: "supplementaryMeasures" },
        { name: "references", source: "references" },
        { name: "applicability", source: "applicability" },
        { name: "quotedText", source: "quotedText" },
      ],
      derivedAggregates: [
        { name: "mechanisms", from: "mechanism", unique: true, exclude: ["unspecified"] },
        {
          name: "jurisdictions",
          fromFields: ["sourceJurisdiction", "destinationJurisdiction"],
          unique: true,
        },
        { name: "referencedTransferDocuments", from: "references", unique: true, flatMap: true },
        { name: "unresolvedReferences", constant: [] },
      ],
      emptyClaim: "No international transfer provisions were identified in the retrieved sections.",
      presentClaim: "Identified {count} international transfer provision(s){mechanisms}.",
      mechanismAliases: { scc: "eu_scc" },
    });
    const artifact = buildInventoryArtifact({
      packageId: "international_transfer_inventory",
      outputArtifactType: "from-package",
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
      transfers: Array<{ mechanism: string; destinationJurisdiction?: string }>;
      jurisdictions: string[];
      mechanisms: string[];
      referencedTransferDocuments: string[];
    };
    assert.equal(data.transfers.length, 1);
    assert.equal(data.transfers[0].mechanism, "eu_scc");
    assert.deepEqual(data.jurisdictions.sort(), ["EU", "US"]);
    assert.ok(data.mechanisms.includes("eu_scc"));
    assert.deepEqual(data.referencedTransferDocuments, ["Module 2 SCCs"]);
    assert.match(inventoryClaim(artifact, shape), /Identified 1 international transfer/);
  });

  it("materializes generic records when artifactShape.kind is records", () => {
    const shape = parseArtifactShape({ kind: "records" });
    const artifact = buildInventoryArtifact({
      packageId: "pkg.records",
      outputArtifactType: "inventory",
      packageVersion: undefined,
      requirementIds: [],
      docId: "doc1",
      rawRecords: [{ id: "r1", quotedText: "hello" }],
      artifactShape: shape,
    });
    const data = artifact.data as { records: unknown[] };
    assert.equal(data.records.length, 1);
    assert.equal(inventoryClaim(artifact, shape), "Identified 1 inventory record(s).");
  });

  it("authors artifactShape on the international-transfer inventory package", () => {
    resetSkillRegistryForTests();
    const skill = getSkillById("regimes/data-protection/international-transfers");
    const pkg = skill?.evidencePackages?.find((p) => p.id === "international_transfer_inventory");
    assert.ok(pkg);
    const shape = parseArtifactShape(pkg!.config?.artifactShape);
    assert.equal(shape.kind, "typed_records");
    if (shape.kind === "typed_records") {
      assert.equal(shape.recordType, "TransferRecord");
    }
  });

  it("does not contain a hardcoded artifact-type branch string", () => {
    const src = readFileSync(HANDLER, "utf8");
    assert.equal(src.includes('"transfer_inventory"'), false);
    assert.equal(src.includes("'transfer_inventory'"), false);
  });
});
