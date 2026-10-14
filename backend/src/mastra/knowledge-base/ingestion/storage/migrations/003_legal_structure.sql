-- Legal identity, structural evidence and cross-document interpretation.
-- Additive: existing uploads, jobs and immutable revisions remain valid.

CREATE TABLE kb_legal_instruments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  jurisdiction TEXT,
  issuer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kb_legal_versions (
  id TEXT PRIMARY KEY,
  instrument_id TEXT NOT NULL REFERENCES kb_legal_instruments(id),
  version_label TEXT NOT NULL,
  language TEXT,
  publication_identifier TEXT,
  published_on DATE,
  effective_from DATE,
  effective_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instrument_id, id),
  CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from)
);

-- Identification happens after upload. Corrections append another revision.
CREATE TABLE kb_source_legal_version_links (
  source_version_id TEXT NOT NULL REFERENCES kb_source_versions(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  legal_version_id TEXT REFERENCES kb_legal_versions(id),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed', 'unresolved')),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_version_id, revision),
  CHECK (status <> 'confirmed' OR legal_version_id IS NOT NULL)
);

CREATE TABLE kb_extraction_runs (
  id TEXT PRIMARY KEY,
  source_version_id TEXT NOT NULL REFERENCES kb_source_versions(id),
  parser_name TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  configuration JSONB NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
  configuration_hash TEXT NOT NULL CHECK (configuration_hash ~ '^[a-f0-9]{64}$'),
  artifact_object_key TEXT NOT NULL UNIQUE,
  artifact_hash TEXT NOT NULL CHECK (artifact_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_version_id, parser_name, parser_version, configuration_hash, artifact_hash)
);

ALTER TABLE kb_provisions DROP CONSTRAINT kb_provisions_kind_check;
ALTER TABLE kb_provisions ADD CONSTRAINT kb_provisions_kind_check CHECK (
  kind IN ('article', 'paragraph', 'point', 'table', 'footnote', 'annex', 'definition',
           'rule', 'schedule', 'recital', 'chapter', 'section', 'illustration', 'unknown')
);
ALTER TABLE kb_provisions ADD COLUMN original_label TEXT;
ALTER TABLE kb_provisions ADD COLUMN semantic_purposes TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE kb_provisions ADD CONSTRAINT kb_provisions_purposes_check CHECK (
  semantic_purposes <@ ARRAY['obligation', 'definition', 'interpretation', 'procedure', 'context']::text[]
);

-- A table is attached to an exact provision revision. One logical row can span pages.
CREATE TABLE kb_tables (
  id TEXT PRIMARY KEY,
  source_version_id TEXT NOT NULL,
  provision_id TEXT NOT NULL,
  provision_revision INTEGER NOT NULL,
  caption TEXT,
  FOREIGN KEY (source_version_id, provision_id, provision_revision)
    REFERENCES kb_provisions(source_version_id, id, revision),
  UNIQUE (id, source_version_id)
);

CREATE TABLE kb_table_columns (
  table_id TEXT NOT NULL REFERENCES kb_tables(id),
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  header_text TEXT,
  PRIMARY KEY (table_id, ordinal)
);

CREATE TABLE kb_table_rows (
  table_id TEXT NOT NULL REFERENCES kb_tables(id),
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  role TEXT NOT NULL CHECK (role IN ('data', 'header', 'repeated_header')),
  PRIMARY KEY (table_id, ordinal)
);

CREATE TABLE kb_table_cells (
  table_id TEXT NOT NULL,
  row_ordinal INTEGER NOT NULL,
  column_ordinal INTEGER NOT NULL,
  text TEXT NOT NULL,
  is_header BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (table_id, row_ordinal, column_ordinal),
  FOREIGN KEY (table_id, row_ordinal) REFERENCES kb_table_rows(table_id, ordinal),
  FOREIGN KEY (table_id, column_ordinal) REFERENCES kb_table_columns(table_id, ordinal)
);

CREATE TABLE kb_table_cell_fragments (
  table_id TEXT NOT NULL,
  row_ordinal INTEGER NOT NULL,
  column_ordinal INTEGER NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  source_version_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset INTEGER NOT NULL CHECK (end_offset > start_offset),
  printed_page_label TEXT,
  PRIMARY KEY (table_id, row_ordinal, column_ordinal, ordinal),
  FOREIGN KEY (table_id, row_ordinal, column_ordinal)
    REFERENCES kb_table_cells(table_id, row_ordinal, column_ordinal),
  FOREIGN KEY (table_id, source_version_id) REFERENCES kb_tables(id, source_version_id),
  FOREIGN KEY (source_version_id, block_id) REFERENCES kb_blocks(source_version_id, id)
);

-- Keep the exact occurrence even when later relationship resolution succeeds.
CREATE TABLE kb_reference_occurrences (
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  source_provision_id TEXT NOT NULL,
  source_provision_revision INTEGER NOT NULL,
  exact_mention TEXT NOT NULL,
  start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset INTEGER NOT NULL CHECK (end_offset > start_offset),
  proposed_targets JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(proposed_targets) = 'array'),
  resolution_status TEXT NOT NULL CHECK (resolution_status IN ('unresolved', 'ambiguous', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, revision),
  FOREIGN KEY (source_provision_id, source_provision_revision)
    REFERENCES kb_provisions(id, revision)
);

-- Successor to the unversioned kb_relations table; old rows remain readable.
CREATE TABLE kb_legal_relation_revisions (
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  source_provision_id TEXT NOT NULL,
  source_provision_revision INTEGER NOT NULL,
  target_provision_id TEXT,
  target_provision_revision INTEGER,
  reference_occurrence_id TEXT,
  reference_occurrence_revision INTEGER,
  kind TEXT NOT NULL CHECK (kind IN ('refers_to', 'defines', 'exception_to', 'depends_on', 'alternative_to', 'interprets')),
  basis TEXT NOT NULL CHECK (basis IN ('explicit', 'inferred')),
  supporting_passages JSONB NOT NULL CHECK (jsonb_typeof(supporting_passages) = 'array'),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, revision),
  UNIQUE (id, revision, content_hash),
  FOREIGN KEY (source_provision_id, source_provision_revision) REFERENCES kb_provisions(id, revision),
  FOREIGN KEY (target_provision_id, target_provision_revision) REFERENCES kb_provisions(id, revision),
  FOREIGN KEY (reference_occurrence_id, reference_occurrence_revision) REFERENCES kb_reference_occurrences(id, revision),
  CHECK ((target_provision_id IS NULL) = (target_provision_revision IS NULL)),
  CHECK ((reference_occurrence_id IS NULL) = (reference_occurrence_revision IS NULL))
);

-- The nested expression uses component IDs; evidence is attached to each conclusion.
CREATE TABLE kb_rule_semantics (
  rule_id TEXT NOT NULL,
  rule_revision INTEGER NOT NULL,
  applicability_expression JSONB NOT NULL CHECK (jsonb_typeof(applicability_expression) = 'object'),
  components JSONB NOT NULL CHECK (jsonb_typeof(components) = 'array'),
  PRIMARY KEY (rule_id, rule_revision),
  FOREIGN KEY (rule_id, rule_revision) REFERENCES kb_rules(id, revision)
);

-- Unlike legacy kb_rule_sources, this reference does not force both provisions
-- to belong to the rule's original uploaded PDF.
CREATE TABLE kb_rule_support (
  rule_id TEXT NOT NULL,
  rule_revision INTEGER NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  component_id TEXT,
  provision_id TEXT NOT NULL,
  provision_revision INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('target', 'parent', 'definition', 'dependency', 'exception', 'alternative', 'deadline')),
  exact_quote TEXT NOT NULL,
  start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset INTEGER NOT NULL CHECK (end_offset > start_offset),
  PRIMARY KEY (rule_id, rule_revision, ordinal),
  FOREIGN KEY (rule_id, rule_revision) REFERENCES kb_rules(id, revision),
  FOREIGN KEY (provision_id, provision_revision) REFERENCES kb_provisions(id, revision)
);

-- Review decisions remain append-only; draft review_status columns are not approval authority.
CREATE TABLE kb_relation_reviews (
  id TEXT PRIMARY KEY,
  reviewer_user_id TEXT NOT NULL REFERENCES users(id),
  relation_id TEXT NOT NULL,
  relation_revision INTEGER NOT NULL,
  revision_hash TEXT NOT NULL CHECK (revision_hash ~ '^[a-f0-9]{64}$'),
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'request_changes')),
  reason TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (relation_id, relation_revision, revision_hash)
    REFERENCES kb_legal_relation_revisions(id, revision, content_hash),
  UNIQUE (id, relation_id, relation_revision, revision_hash, decision)
);

CREATE TABLE kb_publication_relations (
  publication_id TEXT NOT NULL REFERENCES kb_publications(id),
  relation_id TEXT NOT NULL,
  relation_revision INTEGER NOT NULL,
  revision_hash TEXT NOT NULL,
  review_id TEXT NOT NULL,
  review_decision TEXT NOT NULL DEFAULT 'approve' CHECK (review_decision = 'approve'),
  PRIMARY KEY (publication_id, relation_id),
  FOREIGN KEY (relation_id, relation_revision, revision_hash)
    REFERENCES kb_legal_relation_revisions(id, revision, content_hash),
  FOREIGN KEY (review_id, relation_id, relation_revision, revision_hash, review_decision)
    REFERENCES kb_relation_reviews(id, relation_id, relation_revision, revision_hash, decision)
);

CREATE TRIGGER kb_legal_instruments_immutable BEFORE UPDATE OR DELETE ON kb_legal_instruments
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_legal_versions_immutable BEFORE UPDATE OR DELETE ON kb_legal_versions
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_source_legal_version_links_immutable BEFORE UPDATE OR DELETE ON kb_source_legal_version_links
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_extraction_runs_immutable BEFORE UPDATE OR DELETE ON kb_extraction_runs
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_tables_immutable BEFORE UPDATE OR DELETE ON kb_tables
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_table_columns_immutable BEFORE UPDATE OR DELETE ON kb_table_columns
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_table_rows_immutable BEFORE UPDATE OR DELETE ON kb_table_rows
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_table_cells_immutable BEFORE UPDATE OR DELETE ON kb_table_cells
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_table_cell_fragments_immutable BEFORE UPDATE OR DELETE ON kb_table_cell_fragments
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_reference_occurrences_immutable BEFORE UPDATE OR DELETE ON kb_reference_occurrences
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_legal_relation_revisions_immutable BEFORE UPDATE OR DELETE ON kb_legal_relation_revisions
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_rule_semantics_immutable BEFORE UPDATE OR DELETE ON kb_rule_semantics
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_rule_support_immutable BEFORE UPDATE OR DELETE ON kb_rule_support
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_relation_reviews_immutable BEFORE UPDATE OR DELETE ON kb_relation_reviews
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_publication_relations_immutable BEFORE UPDATE OR DELETE ON kb_publication_relations
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
