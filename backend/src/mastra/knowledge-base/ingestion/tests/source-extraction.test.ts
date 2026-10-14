import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import type { Pool } from "pg";
import { buildSourceMap } from "../extraction/source-map.js";
import { IsaacusKanonClient, KanonStructureProvider, codePointBoundaries,
  kanonProviderConfiguration, projectKanonResponse } from "../extraction/kanon.js";
import { sourceLocations, type CandidateStructure } from "../extraction/structure-provider.js";
import { resolveStructureProviderConfig } from "../extraction/structure-provider.js";
import { LlmStructureProvider } from "../extraction/llm-structure.js";
import { detectReferences } from "../extraction/reference-detection.js";
import { reconstructSource } from "../extraction/reconstruct.js";
import { validateReconstruction } from "../extraction/validate-reconstruction.js";
import { KbArtifactStore, type ArtifactObjectStore } from "../storage/artifact-store.js";
import { KbJobStore } from "../storage/job-store.js";
import { runMigrations } from "../storage/migrate.js";
import type { ObjectStore, StoredObject } from "../storage/object-store.js";
import { KbIngestionWorker } from "../worker.js";
import { createPrepareSourceWorkflow } from "../workflows/prepare-source-workflow.js";
import { DOCLING_CONFIG, DOCLING_VERSION } from "../extraction/docling-pdf.js";
import { hashRevision } from "../schemas/common.js";

const docling = {
  schema_name: "DoclingDocument", version: "1", pages: {
    "1": { page_no: 1, size: { width: 600, height: 800 } },
    "2": { page_no: 2, size: { width: 600, height: 800 } },
  },
  body: { self_ref: "#/body", children: [ { $ref: "#/texts/0" }, { $ref: "#/tables/0" } ] },
  furniture: { self_ref: "#/furniture", children: [] },
  texts: [{ self_ref: "#/texts/0", text: "Rule 😀  8", label: "paragraph",
    prov: [{ page_no: 1, bbox: { l: 1, t: 2, r: 3, b: 4 } }] }],
  tables: [{ self_ref: "#/tables/0", prov: [{ page_no: 2 }], data: { table_cells: [
    { text: "Header", start_row_offset_idx: 0, start_col_offset_idx: 0, column_header: true },
    { text: "Value", start_row_offset_idx: 1, start_col_offset_idx: 0 },
  ] } }],
};

test("Kanon client sends the exact source text to the configured Isaacus endpoint", async () => {
  let requested = false;
  const fetcher: typeof fetch = async (url, options) => {
    requested = true;
    assert.equal(url, "https://api.isaacus.com/v1/enrichments");
    assert.equal(options?.method, "POST");
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer test-key");
    assert.deepEqual(JSON.parse(String(options?.body)), {
      model: "kanon-2-enricher", texts: ["Rule 8 🧾"], overflow_strategy: "chunk",
    });
    assert.equal(options?.signal?.aborted, false);
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  };
  const client = new IsaacusKanonClient("test-key", fetcher);
  assert.deepEqual(await client.enrich("Rule 8 🧾"), { results: [] });
  assert.equal(requested, true);
});

test("Docling map preserves characters, UTF-16 offsets, physical pages and cells", () => {
  const map = buildSourceMap(docling, 2);
  assert.equal(map.status, "mapped");
  assert.equal(map.text, "Rule 😀  8\nHeader\nValue");
  assert.equal(map.spans[0]?.end, "Rule 😀  8".length);
  assert.deepEqual(map.spans.map(span => map.text.slice(span.start, span.end)),
    ["Rule 😀  8", "Header", "Value"]);
  assert.deepEqual(map.spans.map(span => span.page), [1, 2, 2]);
  assert.equal(map.spans[1]?.kind, "table_cell");
  assert.equal(map.spans[1]?.row, 0);
  assert.equal(map.pages[0]?.printedPageLabel, null);
  assert.equal(buildSourceMap({ ...docling, pages: { "1": docling.pages["1"] } }, 2).status, "needs_review");
});

test("Kanon code-point spans convert to exact UTF-16 and references scan the source independently", () => {
  const map = buildSourceMap({ ...docling,
    texts: [{ ...docling.texts[0], text: "😀 Rule 8 refers to the Third Schedule" }] }, 2);
  assert.deepEqual(codePointBoundaries("😀x"), [0, 2, 3]);
  const points = [...map.text];
  const response = { results: [{ index: 0, document: {
    version: "ilgs@1", text: map.text, segments: [{ id: "seg:0", kind: "unit", type: "rule",
      category: "main", parent: null, children: [], span: { start: 2, end: 8 },
      code: null, title: null }], crossreferences: [],
  } }] };
  const candidate = projectKanonResponse(response, map);
  assert.equal(map.text.slice(candidate.segments[0]!.span.start, candidate.segments[0]!.span.end),
    points.slice(2, 8).join(""));
  const refs = detectReferences(map, "v1");
  assert.ok(refs.references.some(ref => ref.exactMention === "Third Schedule" &&
    ref.sourceSpans[0]?.physicalPage === 1));
  assert.ok(refs.references.some(ref => ref.exactMention === "Rule 8"));
  assert.throws(() => projectKanonResponse({ results: [{ index: 0,
    document: { ...response.results[0]!.document, text: "modified" } }] }, map), /changed/);
});

test("reconstruction proposes Rule 8 to Third Schedule but leaves other mentions for review", () => {
  const first = "Rule 8 refers to Third Schedule.";
  const second = "Third Schedule\nTable of details";
  const map = buildSourceMap({ ...docling, body: { self_ref: "#/body",
    children: [{ $ref: "#/texts/0" }, { $ref: "#/texts/1" }] },
    texts: [{ self_ref: "#/texts/0", text: first, prov: [{ page_no: 1 }] },
      { self_ref: "#/texts/1", text: second, prov: [{ page_no: 2 }] }], tables: [] }, 2);
  const segment = (id: string, type: string, start: number, end: number) => ({
    id, kind: "unit", type, category: "main", parent: null, children: [],
    span: { start, end }, code: null,
    title: type === "schedule" ? { start, end: start + "Third Schedule".length } : null,
    sourceSpans: sourceLocations(map, { start, end }),
  });
  const candidate: CandidateStructure = { schemaVersion: 1, textHash: map.textHash,
    provider: "kanon", model: "kanon-2-enricher", promptVersion: null,
    processingStrategy: "provider_chunk-v1",
    segments: [segment("seg:rule", "rule", 0, first.length),
      segment("seg:schedule", "schedule", first.length + 1, map.text.length)],
    references: [], unresolvedItems: [], warnings: [] };
  const draft = reconstructSource(map, candidate, detectReferences(map, "v1"));
  assert.equal(draft.provisions.length, 2);
  assert.ok(draft.relationships.some(relation => relation.exactMention === "Third Schedule" &&
    relation.status === "proposed" && relation.targetProvisionId === draft.provisions[1]?.id));
  assert.equal(draft.status, "needs_review");
  const report = validateReconstruction("v1", map, draft);
  assert.equal(report.status, "needs_review");
  assert.ok(report.issues.some(issue => issue.code === "unresolved_reference"));
  const changed = { ...draft, provisions: [{ ...draft.provisions[0]!, text: "invented" },
    ...draft.provisions.slice(1)] };
  assert.ok(validateReconstruction("v1", map, changed).issues.some(issue =>
    issue.code === "invalid_provision_span"));
});

class MemoryArtifacts implements ArtifactObjectStore {
  readonly values = new Map<string, { bytes: Uint8Array; contentType: string }>();
  async read(key: string) { return this.values.get(key) ?? null; }
  async putImmutable(key: string, bytes: Uint8Array) {
    if (this.values.has(key)) throw new Error("Duplicate artifact");
    this.values.set(key, { bytes, contentType: "application/json" });
  }
}

test("prepare_source workflow stores raw Docling JSON and a replayable map", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT, status TEXT)");
    await db.exec("INSERT INTO users VALUES ('alice','USER','APPROVED')");
    const query = async (sql: string, params?: unknown[]) => {
      if (["-- Versioned KB schema", "CREATE TABLE kb_upload_intents", "-- Legal identity", "-- One durable queue",
        "-- One immutable record"]
        .some(prefix => sql.startsWith(prefix))) { await db.exec(sql); return { rows: [], rowCount: 0 }; }
      const result = await db.query(sql, params);
      return { ...result, rowCount: result.rows.length || result.affectedRows };
    };
    const client = { query, release() {} };
    await runMigrations(client);
    const pool = { connect: async () => client, query } as unknown as Pool;
    const bytes = Buffer.from("%PDF-test-content");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    await db.query(`INSERT INTO kb_sources (id,instrument_id,title,visibility,owner_user_id,authority_status)
      VALUES ('source','eu-2016-679','GDPR','private','alice','unverified')`);
    await db.query(`INSERT INTO kb_source_versions
      (id,source_id,upload_revision,object_key,checksum,original_file_name,mime_type,byte_size,
       uploaded_at,original_page_count,support_status)
      VALUES ('v1','source',1,'pdf',$1,'source.pdf','application/pdf',$2,now(),2,'review_required')`,
    [checksum, bytes.length]);
    const originals = { read: async (key: string) => key === "pdf"
      ? { bytes, contentType: "application/pdf" } as StoredObject : null } as ObjectStore;
    const artifactObjects = new MemoryArtifacts();
    const jobs = new KbJobStore(pool);
    const artifacts = new KbArtifactStore(pool, artifactObjects, jobs);
    let conversions = 0;
    const extractor = { extract: async () => { conversions++; return docling; } };
    let enrichments = 0;
    const providerFactory = (configuration: ReturnType<typeof kanonProviderConfiguration>) =>
      new KanonStructureProvider({ enrich: async (text: string) => {
        enrichments++;
        return { results: [{ index: 0, document: { version: "ilgs@1", text,
          segments: [{ id: "seg:0", kind: "unit", type: "rule", category: "main", parent: null,
            children: [], span: { start: 0, end: [...text].length }, code: null, title: null }],
          crossreferences: [] } }] };
      } }, configuration);
    const structureProvider = kanonProviderConfiguration();
    const job = await jobs.enqueue({ type: "prepare_source", sourceVersionIds: ["v1"],
      inputDescriptor: { sourceVersionId: "v1", parser: "docling.rs", parserVersion: DOCLING_VERSION,
        configurationHash: hashRevision(DOCLING_CONFIG), checksum, structureProvider } });
    const workflow = createPrepareSourceWorkflow(() => ({ pool, objects: originals, jobs, artifacts,
      extractor, providerFactory }));
    const worker = new KbIngestionWorker(jobs, { prepare_source: workflow });
    assert.equal(await worker.runOnce(), true);
    assert.equal((await jobs.getAuthorized("alice", job.id)).status, "completed");
    assert.equal(conversions, 1);
    const result = (await jobs.getAuthorized("alice", job.id)).result as {
      rawArtifact: import("../storage/artifact-store.js").ArtifactReference;
      mapArtifact: import("../storage/artifact-store.js").ArtifactReference;
      referencesArtifact: import("../storage/artifact-store.js").ArtifactReference;
      candidateArtifact: import("../storage/artifact-store.js").ArtifactReference;
      reconstructionArtifact: import("../storage/artifact-store.js").ArtifactReference;
      extractionRunId: string; textHash: string; originalPageCount: number;
      mappingStatus: string; preparationStatus: string };
    assert.equal(result.mappingStatus, "mapped");
    assert.equal(result.preparationStatus, "candidate_ready");
    assert.ok("validationArtifact" in result);
    assert.ok(artifactObjects.values.has(result.candidateArtifact.objectKey));
    assert.ok(artifactObjects.values.has(result.reconstructionArtifact.objectKey));
    assert.deepEqual(JSON.parse(Buffer.from(artifactObjects.values.get(result.rawArtifact.objectKey)!.bytes).toString()), docling);
    const map = JSON.parse(Buffer.from(artifactObjects.values.get(result.mapArtifact.objectKey)!.bytes).toString());
    assert.equal(map.text, "Rule 😀  8\nHeader\nValue");
    assert.ok(artifactObjects.values.has(result.referencesArtifact.objectKey));
    assert.equal(Number((await db.query<{ count: string }>("SELECT count(*) FROM kb_extraction_runs")).rows[0]?.count), 1);
    assert.equal(Number((await db.query<{ count: string }>("SELECT count(*) FROM kb_structure_provider_runs")).rows[0]?.count), 1);
    assert.equal(enrichments, 1);
    assert.equal(await worker.runOnce(), false);

    const llmConfiguration = resolveStructureProviderConfig({ KB_STRUCTURE_PROVIDER: "llm",
      KB_STRUCTURE_LLM_MODEL: "local-test-model" });
    const replayJob = await jobs.enqueue({ type: "prepare_source", sourceVersionIds: ["v1"],
      inputDescriptor: { sourceVersionId: "v1", parser: "docling.rs", parserVersion: DOCLING_VERSION,
        configurationHash: hashRevision(DOCLING_CONFIG), checksum, structureProvider: llmConfiguration,
        replay: { sourceJobId: job.id, originalPageCount: result.originalPageCount,
          extractionRunId: result.extractionRunId, rawArtifact: result.rawArtifact,
          mapArtifact: result.mapArtifact, textHash: result.textHash } } });
    const llmWorker = new KbIngestionWorker(jobs, { prepare_source: createPrepareSourceWorkflow(() => ({
      pool, objects: originals, jobs, artifacts, extractor,
      providerFactory: configuration => new LlmStructureProvider(configuration, { generate: async () => ({
        output: { segments: [{ id: "llm:0", kind: "unit", type: "rule", category: "main",
          parent: null, sourceAnchors: [{ sourceId: "src:0", exactQuote: docling.texts[0].text,
            occurrence: 0 }], codeAnchor: null, titleAnchor: null }], references: [],
          unresolvedItems: ["Remaining table text requires classification"], warnings: [] },
        rawResponse: { provider: "local-test" }, usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
      }) }),
    })) });
    assert.equal(await llmWorker.runOnce(), true);
    assert.equal((await jobs.getAuthorized("alice", replayJob.id)).status, "completed");
    assert.equal(conversions, 1);
    const runs = await db.query<{ provider: string; replayed_from_job_id: string | null }>(
      "SELECT provider, replayed_from_job_id FROM kb_structure_provider_runs ORDER BY created_at");
    assert.deepEqual(runs.rows.map(row => row.provider), ["kanon", "llm"]);
    assert.equal(runs.rows[1]?.replayed_from_job_id, job.id);
  } finally { await db.close(); }
});
