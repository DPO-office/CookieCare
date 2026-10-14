import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { runMigrations } from "../storage/migrate.js";
import { LegalTableSchema, ReferenceOccurrenceSchema, RequirementMeaningSchema } from "../schemas/legal-structure.js";

test("migration extends an existing KB without replacing uploaded source versions", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec("CREATE TABLE users (id TEXT PRIMARY KEY)");
    await db.query("INSERT INTO users (id) VALUES ('reviewer')");
    await db.exec("CREATE TABLE kb_schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    for (const file of ["001_foundation.sql", "002_durable_uploads.sql"]) {
      const sql = await readFile(new URL(`../storage/migrations/${file}`, import.meta.url), "utf8");
      await db.exec(sql);
      await db.query("INSERT INTO kb_schema_migrations (version, checksum) VALUES ($1, $2)",
        [file, createHash("sha256").update(sql).digest("hex")]);
    }
    await db.exec(`
      INSERT INTO kb_sources (id, instrument_id, title, visibility, owner_user_id, authority_status)
        VALUES ('existing-source', 'rules', 'Rules', 'private', 'reviewer', 'verified');
      INSERT INTO kb_source_versions
        (id, source_id, upload_revision, object_key, checksum, original_file_name,
         mime_type, byte_size, uploaded_at, support_status)
        VALUES ('existing-upload', 'existing-source', 1, 'existing.pdf', repeat('a', 64),
                'existing.pdf', 'application/pdf', 100, now(), 'pending');
      INSERT INTO kb_ingestion_jobs (id, source_version_id, status, input_hash)
        VALUES ('existing-job', 'existing-upload', 'completed', repeat('b', 64));
    `);
    await runMigrations({
      query: async (sql, params) => {
        if (sql.startsWith("-- Legal identity") || sql.startsWith("-- One durable queue")) {
          await db.exec(sql);
          return { rows: [] };
        }
        return db.query(sql, params);
      },
    });
    assert.equal((await db.query<{ id: string }>("SELECT id FROM kb_source_versions WHERE id = 'existing-upload'"))
      .rows[0]?.id, "existing-upload");
    assert.equal((await db.query<{ version: string }>("SELECT version FROM kb_schema_migrations ORDER BY version"))
      .rows.at(-1)?.version, "005_structure_provider_runs.sql");
    assert.deepEqual((await db.query<{ job_type: string; source_version_id: string }>(`
      SELECT j.job_type, s.source_version_id FROM kb_ingestion_jobs j
      JOIN kb_job_sources s ON s.job_id = j.id WHERE j.id = 'existing-job'`)).rows,
      [{ job_type: "intake", source_version_id: "existing-upload" }]);
  } finally {
    await db.close();
  }
});

test("legal structures retain cross-page tables, references and cross-document support", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec("CREATE TABLE users (id TEXT PRIMARY KEY)");
    await db.query("INSERT INTO users (id) VALUES ('reviewer')");
    await runMigrations({
      query: async (sql, params) => {
        if (sql.startsWith("-- Versioned KB schema") || sql.startsWith("CREATE TABLE kb_upload_intents") || sql.startsWith("-- Legal identity") || sql.startsWith("-- One durable queue")) {
          await db.exec(sql);
          return { rows: [] };
        }
        return db.query(sql, params);
      },
    });

    await db.exec(`
      INSERT INTO kb_legal_instruments (id, title) VALUES ('rules', 'Rules'), ('act', 'Act');
      INSERT INTO kb_legal_versions (id, instrument_id, version_label)
        VALUES ('rules-2025', 'rules', '2025'), ('act-2023', 'act', '2023');
      INSERT INTO kb_sources (id, instrument_id, title, visibility, owner_user_id, authority_status)
        VALUES ('rules-pdf', 'rules', 'Rules PDF', 'private', 'reviewer', 'verified'),
               ('act-pdf', 'act', 'Act PDF', 'private', 'reviewer', 'verified');
      INSERT INTO kb_source_versions
        (id, source_id, upload_revision, object_key, checksum, original_file_name,
         mime_type, byte_size, uploaded_at, support_status)
        VALUES ('rules-upload', 'rules-pdf', 1, 'rules.pdf', repeat('a', 64), 'rules.pdf',
                'application/pdf', 100, now(), 'pending'),
               ('act-upload', 'act-pdf', 1, 'act.pdf', repeat('b', 64), 'act.pdf',
                'application/pdf', 100, now(), 'pending');
      INSERT INTO kb_source_legal_version_links
        (source_version_id, revision, legal_version_id, status)
        VALUES ('rules-upload', 1, 'rules-2025', 'confirmed'),
               ('act-upload', 1, 'act-2023', 'confirmed');
      INSERT INTO kb_blocks (id, source_version_id, text, reading_order, page, extraction_method, item_ref)
        VALUES ('row-page-2', 'rules-upload', 'First half', 0, 2, 'docling', 'item-1'),
               ('row-page-3', 'rules-upload', 'Second half', 0, 3, 'docling', 'item-2'),
               ('act-block', 'act-upload', 'Defined in the Act', 0, 1, 'docling', 'item-3');
      INSERT INTO kb_provisions
        (id, revision, source_version_id, citation, kind, original_label, semantic_purposes,
         text, reconstruction_status, content_hash)
        VALUES ('rule-8', 1, 'rules-upload', '{}', 'rule', 'Rule 8', ARRAY['obligation'],
                'See Third Schedule', 'complete', repeat('c', 64)),
               ('schedule-3', 1, 'rules-upload', '{}', 'schedule', 'Third Schedule', ARRAY['context'],
                'First half Second half', 'complete', repeat('d', 64)),
               ('act-definition', 1, 'act-upload', '{}', 'section', 'Section 2', ARRAY['definition'],
                'Defined in the Act', 'complete', repeat('e', 64));
      INSERT INTO kb_tables (id, source_version_id, provision_id, provision_revision)
        VALUES ('schedule-table', 'rules-upload', 'schedule-3', 1);
      INSERT INTO kb_table_columns (table_id, ordinal, header_text)
        VALUES ('schedule-table', 0, 'Applicability');
      INSERT INTO kb_table_rows (table_id, ordinal, role)
        VALUES ('schedule-table', 0, 'data');
      INSERT INTO kb_table_cells (table_id, row_ordinal, column_ordinal, text)
        VALUES ('schedule-table', 0, 0, 'First half Second half');
      INSERT INTO kb_table_cell_fragments
        (table_id, row_ordinal, column_ordinal, ordinal, source_version_id, block_id, start_offset, end_offset, printed_page_label)
        VALUES ('schedule-table', 0, 0, 0, 'rules-upload', 'row-page-2', 0, 10, '27'),
               ('schedule-table', 0, 0, 1, 'rules-upload', 'row-page-3', 0, 11, '28');
      INSERT INTO kb_reference_occurrences
        (id, revision, source_provision_id, source_provision_revision, exact_mention,
         start_offset, end_offset, proposed_targets, resolution_status)
        VALUES ('third-schedule-mention', 1, 'rule-8', 1, 'Third Schedule', 4, 18,
                '[{"citedLabel":"Third Schedule","target":{"id":"schedule-3","revision":1},"reason":"matching schedule label"}]', 'resolved');
      INSERT INTO kb_legal_relation_revisions
        (id, revision, source_provision_id, source_provision_revision, target_provision_id,
         target_provision_revision, reference_occurrence_id, reference_occurrence_revision,
         kind, basis, supporting_passages, content_hash)
        VALUES ('rule-8-schedule', 1, 'rule-8', 1, 'schedule-3', 1,
                'third-schedule-mention', 1, 'refers_to', 'explicit',
                '[{"provisionId":"rule-8","quote":"Third Schedule"}]', repeat('f', 64));
      INSERT INTO kb_rules
        (id, revision, source_version_id, title, actor, action, object, modality,
         applicability, review_status, authorship, content_hash, created_at)
        VALUES ('requirement-8', 1, 'rules-upload', 'Rule 8', 'actor', 'do', 'thing', 'must',
                '{}', 'draft', '{}', repeat('1', 64), now());
      INSERT INTO kb_rule_semantics (rule_id, rule_revision, applicability_expression, components)
        VALUES ('requirement-8', 1, '{"componentId":"when-defined"}',
                '[{"id":"when-defined","kind":"condition","statement":"Defined in the Act"}]');
      INSERT INTO kb_rule_support
        (rule_id, rule_revision, ordinal, component_id, provision_id, provision_revision,
         role, exact_quote, start_offset, end_offset)
        VALUES ('requirement-8', 1, 0, 'when-defined', 'act-definition', 1,
                'definition', 'Defined in the Act', 0, 18);
    `);

    const fragments = await db.query<{ page: number; printed_page_label: string }>(`
      SELECT b.page, f.printed_page_label FROM kb_table_cell_fragments f
      JOIN kb_blocks b ON b.id = f.block_id ORDER BY f.ordinal`);
    assert.deepEqual(fragments.rows.map(row => [row.page, row.printed_page_label]), [[2, "27"], [3, "28"]]);
    assert.equal((await db.query<{ exact_mention: string }>(
      "SELECT exact_mention FROM kb_reference_occurrences WHERE id = 'third-schedule-mention'"
    )).rows[0]?.exact_mention, "Third Schedule");
    assert.equal((await db.query<{ source_version_id: string }>(`
      SELECT p.source_version_id FROM kb_rule_support s
      JOIN kb_provisions p ON (p.id, p.revision) = (s.provision_id, s.provision_revision)`
    )).rows[0]?.source_version_id, "act-upload");
    await assert.rejects(db.query(`INSERT INTO kb_table_cell_fragments
      (table_id, row_ordinal, column_ordinal, ordinal, source_version_id, block_id, start_offset, end_offset)
      VALUES ('schedule-table', 0, 0, 2, 'act-upload', 'act-block', 0, 5)`));
    await assert.rejects(db.query("UPDATE kb_reference_occurrences SET exact_mention = 'changed'"));

    await db.exec(`
      INSERT INTO kb_relation_reviews
        (id, reviewer_user_id, relation_id, relation_revision, revision_hash, decision, reason, reviewed_at)
        VALUES ('approved-relation', 'reviewer', 'rule-8-schedule', 1, repeat('f', 64), 'approve', 'checked', now()),
               ('rejected-relation', 'reviewer', 'rule-8-schedule', 1, repeat('f', 64), 'reject', 'no', now());
      INSERT INTO kb_publications
        (id, manifest_hash, manifest, index_version, lexical_status, dense_status, state, created_by, created_at)
        VALUES ('publication', repeat('2', 64), '{}', 'index-1', 'pending', 'pending', 'building', 'reviewer', now());
    `);
    await assert.rejects(db.query(`INSERT INTO kb_publication_relations
      (publication_id, relation_id, relation_revision, revision_hash, review_id)
      VALUES ('publication', 'rule-8-schedule', 1, $1, 'rejected-relation')`, ["f".repeat(64)]));
    await db.query(`INSERT INTO kb_publication_relations
      (publication_id, relation_id, relation_revision, revision_hash, review_id)
      VALUES ('publication', 'rule-8-schedule', 1, $1, 'approved-relation')`, ["f".repeat(64)]);
    await assert.rejects(db.query("DELETE FROM kb_publication_relations WHERE publication_id = 'publication'"));
  } finally {
    await db.close();
  }
});

test("new contracts require valid table coordinates and supported nested conditions", () => {
  const table = {
    id: "table", provision: { id: "schedule", revision: 1 }, sourceVersionId: "upload",
    caption: null, columns: [{ ordinal: 0, headerText: "Case" }], rows: [{ ordinal: 0, role: "data" }],
    cells: [{ row: 0, column: 0, text: "A", isHeader: false, fragments: [
      { blockId: "block", start: 0, end: 1, physicalPage: 2, printedPageLabel: "27" },
    ] }],
  };
  assert.equal(LegalTableSchema.safeParse(table).success, true);
  assert.equal(LegalTableSchema.safeParse({ ...table, cells: [{ ...table.cells[0], column: 2 }] }).success, false);
  assert.equal(ReferenceOccurrenceSchema.safeParse({
    id: "mention", revision: 1, source: { id: "rule-8", revision: 1 },
    exactMention: "Third Schedule", start: 4, end: 18,
    proposedTargets: [{ citedLabel: "Third Schedule", target: null, reason: "Candidate not resolved yet" }],
    resolutionStatus: "unresolved",
  }).success, true);

  const support = { sourceVersionId: "act-upload", provision: { id: "act-definition", revision: 1 },
    exactQuote: "Defined in the Act", start: 0, end: 18 };
  const meaning = {
    applicabilityExpression: { operator: "all", children: [
      { componentId: "condition" }, { operator: "not", child: { componentId: "exception" } },
    ] },
    components: [
      { id: "condition", kind: "condition", statement: "When defined", supportingPassages: [support] },
      { id: "exception", kind: "exception", statement: "Unless exempt", supportingPassages: [support] },
      { id: "deadline", kind: "deadline", statement: "Within 30 days", supportingPassages: [support] },
    ],
  };
  assert.equal(RequirementMeaningSchema.safeParse(meaning).success, true);
  assert.equal(RequirementMeaningSchema.safeParse({ applicabilityExpression: { constant: true }, components: [] }).success, true);
  assert.equal(RequirementMeaningSchema.safeParse({ ...meaning, applicabilityExpression: { componentId: "missing" } }).success, false);
  assert.equal(RequirementMeaningSchema.safeParse({ ...meaning, components: meaning.components.map(({ supportingPassages, ...rest }, i) =>
    i === 2 ? { ...rest, supportingPassages: [] } : { ...rest, supportingPassages }) }).success, false);
});
