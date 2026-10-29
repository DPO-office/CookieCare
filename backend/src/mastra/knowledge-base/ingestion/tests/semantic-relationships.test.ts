import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { buildSourceMap } from "../extraction/source-map.js";
import { detectReferences } from "../extraction/reference-detection.js";
import { citationPaths, provisionIdentity, reconstructSource } from "../extraction/reconstruct.js";
import { enrichSemanticRelationships } from "../extraction/semantic-relationships.js";
import { projectDoclingChunks } from "../extraction/docling-chunk-plan.js";
import type { CandidateStructure } from "../extraction/structure-provider.js";

const saved = path.resolve(process.cwd(), "evaluation-runs", "DPDPA-2023 Act.pdf",
  "83a01fe3-9a9f-44af-932c-999b9b96591a");
const read = async (name: string) => JSON.parse(await readFile(path.join(saved, name), "utf8"));

test("saved DPDPA Schedule rows preserve cells and row 6 roles", async () => {
  const map = buildSourceMap(await read("docling.json"), 21);
  const candidate = await read("structure-candidate.json") as CandidateStructure;
  assert.equal(map.textHash, candidate.textHash);
  const draft = reconstructSource(map, candidate, detectReferences(map, "fixture"));
  const byId = new Map(draft.provisions.map(provision => [provision.id, provision]));
  const schedule = draft.provisions.find(provision => provision.kind === "schedule" &&
    /THE\s+SCHEDULE/iu.test(provision.text));
  assert.ok(schedule);
  const rows = draft.provisions.filter(provision => provision.kind === "table_row" &&
    provision.parentId === schedule.id && /^[1-7]$/u.test(provision.label ?? ""));
  assert.deepEqual(rows.map(row => row.label), ["1", "2", "3", "4", "5", "6", "7"]);
  assert.ok(rows.every(row => row.text.includes("\n") && row.text.length > 80));
  const first = rows[0]!;
  assert.equal(draft.relationships.find(relation => relation.sourceProvisionId === first.id &&
    relation.exactMention === "sub-section ( 5 ) of section 8")?.status, "proposed");
  assert.deepEqual(citationPaths("sub-section ( 5 ) of section 8"),
    citationPaths("sub-section (5) of section 8"));
  const section32 = draft.provisions.find(provision => provision.kind === "section" &&
    provision.text.startsWith("32."));
  assert.ok(section32);
  assert.equal(provisionIdentity(section32, byId)?.number, "32");
  const row6 = rows.find(row => row.label === "6")!;
  assert.deepEqual(provisionIdentity(row6, byId), { kind: "schedule", number: "1", subpoints: ["6"] });
  const semantic = await enrichSemanticRelationships(map, draft);
  assert.ok(semantic.report.links.some(link => link.sourceProvisionId === row6.id &&
    link.kind === "penalty_for" && link.role === "undertaking_basis" &&
    byId.get(link.targetProvisionId)?.canonicalCitation === "Section 32"));
  assert.equal(semantic.report.penalties.length, 7);
  assert.ok(draft.relationships.some(relation => relation.sourceProvisionId === row6.id &&
    relation.exactMention === "section 28" && relation.status === "unresolved"));
});

test("table planner keeps a complete penalty row in one core chunk", async () => {
  const map = buildSourceMap(await read("docling.json"), 21);
  const native = [{ text: "schedule", docItems: ["#/tables/1"], headings: ["THE SCHEDULE"] }];
  const plan = projectDoclingChunks(map, native, 4000);
  const cells = map.spans.filter(span => span.itemRef === "#/tables/1" && span.row === 3);
  const owners = plan.chunks.filter(chunk => chunk.sourceUnits?.some(unit =>
    chunk.coreSourceIds.includes(unit.id) && unit.itemRef === "#/tables/1" && unit.row === 3));
  assert.equal(owners.length, 1);
  assert.equal(owners[0]!.sourceUnits!.filter(unit => owners[0]!.coreSourceIds.includes(unit.id) &&
    unit.itemRef === "#/tables/1" && unit.row === 3).length, cells.length);
});
