import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ReviewDatasetSchema, SourcePackSchema } from "../evaluation/dataset-contracts.js";

const fixture = fileURLToPath(new URL("../evaluation/fixtures/dpdpa-2023-review-v1/", import.meta.url));
const load = async (name: string) => JSON.parse(await readFile(join(fixture, name), "utf8"));

test("DPDPA reference graph keeps complete cited source and distinct legal relationships", async () => {
  const dataset = ReviewDatasetSchema.parse(await load("dataset.json"));
  const pack = SourcePackSchema.parse(await load("source-passages.json"));
  assert.equal(dataset.cases.length, 19);
  assert.deepEqual(new Set(dataset.cases.map(row => row.stage)),
    new Set(["S1", "S2", "S3", "S4", "S5", "S6", "S7"]));
  assert.equal(pack.source_sha256, dataset.source.sha256);
  const inventory = dataset.cases.find(row => row.id === "DPDPA-S2-04")!.expected;
  assert.deepEqual((inventory.section_starts as Array<{ section: number }>).map(item => item.section),
    Array.from({ length: 44 }, (_, index) => index + 1));
  assert.equal((inventory.chapter_markers as unknown[]).length, 9);
  const s3 = dataset.cases.filter(row => row.stage === "S3");
  for (const row of s3) {
    const source = row.source_refs.map(ref => pack.units[ref]?.comparison_text ?? "").join("\n");
    const tree = row.expected.reference_tree as { nodes: Array<{
      id: string; kind: string; exact_source_text: string }> };
    for (const node of tree.nodes) {
      if (node.kind === "table_row") continue; // Printed in separate breach and penalty cells.
      assert.ok(source.includes(node.exact_source_text), `${row.id}: ${node.id}`);
    }
  }
  const section8 = s3.find(row => row.id === "DPDPA-S3-01")!;
  const nodes = (section8.expected.reference_tree as { nodes: Array<{ id: string; exact_source_text: string }> }).nodes;
  const pointB = nodes.find(node => node.id === "Section 8(7)(b)")!;
  const illustrations = nodes.find(node => node.id === "Section 8(7) illustrations")!;
  assert.ok(!pointB.exact_source_text.includes("Illustrations."));
  assert.ok(illustrations.exact_source_text.startsWith("Illustrations."));
  assert.ok(nodes.find(node => node.id === "Section 8(3) shared consequence"));
  assert.ok(nodes.find(node => node.id === "Section 8(8) shared time condition"));
});

test("DPDPA Schedule and exceptions preserve the difficult distinctions", async () => {
  const dataset = ReviewDatasetSchema.parse(await load("dataset.json"));
  const byId = new Map(dataset.cases.map(row => [row.id, row]));
  const rows = byId.get("DPDPA-S2-03")!.expected.rows as Array<{
    row: number; breach_exact_text: string; penalty_exact_text: string }>;
  assert.deepEqual(rows.map(row => row.row), [1, 2, 3, 4, 5, 6, 7]);
  assert.match(rows[0]!.breach_exact_text, /sub-section \(5\) of section 8/);
  assert.match(rows[0]!.penalty_exact_text, /two\nhundred and fifty\ncrore rupees/);
  assert.match(rows[1]!.breach_exact_text, /sub-section \(6\) of section 8/);
  assert.match(rows[1]!.penalty_exact_text, /two\nhundred crore\nrupees/);
  const graph = byId.get("DPDPA-S3-02")!.expected;
  const edges = graph.reference_edges as Array<{ from: string; to: string; relation: string }>;
  assert.ok(edges.some(edge => edge.from === "Section 33(1)" && edge.to === "The Schedule"));
  assert.ok(edges.some(edge => edge.from === "Schedule row 6" && edge.to === "Section 32" &&
    edge.relation === "explicit_reference"));
  assert.ok(edges.some(edge => edge.from === "Schedule row 6" && edge.to === "Section 28" &&
    edge.relation === "explicit_procedural_reference"));
  const exemptions = byId.get("DPDPA-S3-03")!.expected.reference_edges as Array<{
    from: string; to: string; relation: string }>;
  for (const target of ["Section 8(1)", "Section 8(5)"])
    assert.ok(exemptions.some(edge => edge.from === "Section 17(1)" && edge.to === target &&
      edge.relation === "exception_to_exemption"));
  for (const row of dataset.cases) assert.equal(row.human_review.status, "pending");
});
