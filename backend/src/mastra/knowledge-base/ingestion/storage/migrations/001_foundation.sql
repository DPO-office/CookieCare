-- Versioned KB schema. Applied transactionally by migrate.ts.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE kb_workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kb_workspace_memberships (
  workspace_id TEXT NOT NULL REFERENCES kb_workspaces(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  can_upload BOOLEAN NOT NULL DEFAULT false,
  can_review BOOLEAN NOT NULL DEFAULT false,
  can_publish BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE kb_sources (
  id TEXT PRIMARY KEY,
  instrument_id TEXT NOT NULL,
  title TEXT NOT NULL,
  issuer TEXT,
  jurisdiction TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'workspace', 'curated_shared')),
  owner_user_id TEXT REFERENCES users(id),
  workspace_id TEXT REFERENCES kb_workspaces(id),
  curator_user_id TEXT REFERENCES users(id),
  authority_status TEXT NOT NULL CHECK (authority_status IN ('unverified', 'verified', 'disputed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((visibility = 'private' AND owner_user_id IS NOT NULL AND workspace_id IS NULL AND curator_user_id IS NULL)
    OR (visibility = 'workspace' AND owner_user_id IS NOT NULL AND workspace_id IS NOT NULL AND curator_user_id IS NULL)
    OR (visibility = 'curated_shared' AND owner_user_id IS NULL AND workspace_id IS NULL AND curator_user_id IS NOT NULL))
);

CREATE TABLE kb_source_versions (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES kb_sources(id),
  upload_revision INTEGER NOT NULL CHECK (upload_revision > 0),
  object_key TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  original_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  language TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL,
  enacted_on DATE,
  effective_from DATE,
  effective_until DATE,
  original_page_count INTEGER CHECK (original_page_count > 0),
  extraction_version TEXT,
  support_status TEXT NOT NULL CHECK (support_status IN ('pending', 'pilot_supported', 'review_required', 'unsupported', 'unreadable')),
  UNIQUE (source_id, upload_revision),
  UNIQUE (source_id, id),
  CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from)
);

CREATE TABLE kb_blocks (
  id TEXT PRIMARY KEY,
  source_version_id TEXT NOT NULL REFERENCES kb_source_versions(id),
  text TEXT NOT NULL,
  reading_order INTEGER NOT NULL CHECK (reading_order >= 0),
  page INTEGER NOT NULL CHECK (page > 0),
  bbox JSONB,
  extraction_method TEXT NOT NULL CHECK (extraction_method IN ('text_layer', 'ocr', 'docling')),
  item_ref TEXT NOT NULL,
  start_offset INTEGER CHECK (start_offset >= 0),
  end_offset INTEGER CHECK (end_offset > start_offset),
  UNIQUE (source_version_id, page, reading_order),
  UNIQUE (source_version_id, id)
);

CREATE TABLE kb_provisions (
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  source_version_id TEXT NOT NULL REFERENCES kb_source_versions(id),
  citation JSONB NOT NULL,
  parent_id TEXT,
  parent_revision INTEGER,
  kind TEXT NOT NULL CHECK (kind IN ('article', 'paragraph', 'point', 'table', 'footnote', 'annex', 'definition')),
  text TEXT NOT NULL CHECK (length(text) > 0),
  reconstruction_status TEXT NOT NULL CHECK (reconstruction_status IN ('complete', 'needs_review', 'incomplete')),
  normalization JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, revision),
  UNIQUE (source_version_id, id, revision),
  UNIQUE (id, revision, content_hash),
  FOREIGN KEY (source_version_id, parent_id, parent_revision)
    REFERENCES kb_provisions(source_version_id, id, revision),
  CHECK ((parent_id IS NULL) = (parent_revision IS NULL))
);

CREATE TABLE kb_provision_fragments (
  provision_id TEXT NOT NULL,
  provision_revision INTEGER NOT NULL,
  source_version_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  block_id TEXT NOT NULL,
  start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset INTEGER NOT NULL CHECK (end_offset > start_offset),
  PRIMARY KEY (provision_id, provision_revision, ordinal),
  FOREIGN KEY (source_version_id, provision_id, provision_revision)
    REFERENCES kb_provisions(source_version_id, id, revision),
  FOREIGN KEY (source_version_id, block_id) REFERENCES kb_blocks(source_version_id, id)
);

CREATE TABLE kb_rules (
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  source_version_id TEXT NOT NULL REFERENCES kb_source_versions(id),
  title TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  object TEXT NOT NULL,
  modality TEXT NOT NULL CHECK (modality IN ('must', 'must_not', 'may', 'should')),
  applicability JSONB NOT NULL,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  alternatives JSONB NOT NULL DEFAULT '[]'::jsonb,
  unresolved_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_status TEXT NOT NULL CHECK (review_status IN ('draft', 'review_required', 'rejected', 'approved')),
  authorship JSONB NOT NULL,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id, revision),
  UNIQUE (source_version_id, id, revision),
  UNIQUE (id, revision, content_hash)
);

CREATE TABLE kb_rule_sources (
  rule_id TEXT NOT NULL,
  rule_revision INTEGER NOT NULL,
  source_version_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  provision_id TEXT NOT NULL,
  provision_revision INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('target', 'parent', 'definition', 'dependency', 'exception')),
  exact_quote TEXT NOT NULL,
  start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset INTEGER NOT NULL CHECK (end_offset > start_offset),
  PRIMARY KEY (rule_id, rule_revision, ordinal),
  FOREIGN KEY (source_version_id, rule_id, rule_revision) REFERENCES kb_rules(source_version_id, id, revision),
  FOREIGN KEY (source_version_id, provision_id, provision_revision) REFERENCES kb_provisions(source_version_id, id, revision)
);

CREATE TABLE kb_rule_profiles (
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  source_version_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_revision INTEGER NOT NULL,
  module TEXT NOT NULL CHECK (module IN ('analysis', 'drafting', 'legal_qa')),
  content JSONB NOT NULL,
  review_status TEXT NOT NULL CHECK (review_status IN ('draft', 'review_required', 'rejected', 'approved')),
  authorship JSONB NOT NULL,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id, revision),
  UNIQUE (source_version_id, id, revision),
  UNIQUE (id, revision, content_hash),
  FOREIGN KEY (source_version_id, rule_id, rule_revision) REFERENCES kb_rules(source_version_id, id, revision)
);

CREATE TABLE kb_relations (
  id TEXT PRIMARY KEY,
  source_provision_id TEXT NOT NULL,
  source_provision_revision INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('reference', 'definition', 'exception', 'dependency', 'alternative')),
  evidence_quote TEXT NOT NULL,
  resolution TEXT NOT NULL CHECK (resolution IN ('resolved', 'unresolved')),
  target_provision_id TEXT,
  target_provision_revision INTEGER,
  target_mention TEXT,
  reason TEXT,
  FOREIGN KEY (source_provision_id, source_provision_revision) REFERENCES kb_provisions(id, revision),
  FOREIGN KEY (target_provision_id, target_provision_revision) REFERENCES kb_provisions(id, revision),
  CHECK ((resolution = 'resolved' AND target_provision_id IS NOT NULL AND target_provision_revision IS NOT NULL AND target_mention IS NULL AND reason IS NULL)
    OR (resolution = 'unresolved' AND target_provision_id IS NULL AND target_provision_revision IS NULL AND target_mention IS NOT NULL AND reason IS NOT NULL))
);

CREATE TABLE kb_search_entries (
  id TEXT PRIMARY KEY,
  index_version TEXT NOT NULL,
  source_version_id TEXT NOT NULL REFERENCES kb_source_versions(id),
  provision_id TEXT,
  provision_revision INTEGER,
  rule_id TEXT,
  rule_revision INTEGER,
  profile_id TEXT,
  profile_revision INTEGER,
  purpose TEXT NOT NULL CHECK (purpose IN ('legal_passage', 'rule_discovery', 'evidence_query')),
  proof_element_id TEXT,
  search_text TEXT NOT NULL,
  text_hash TEXT NOT NULL CHECK (text_hash ~ '^[a-f0-9]{64}$'),
  embedding_model TEXT NOT NULL,
  embedding_dimensions INTEGER NOT NULL CHECK (embedding_dimensions > 0),
  embedding_configuration_version TEXT NOT NULL,
  document_task TEXT NOT NULL,
  query_task TEXT NOT NULL,
  embedding VECTOR NOT NULL,
  FOREIGN KEY (source_version_id, provision_id, provision_revision) REFERENCES kb_provisions(source_version_id, id, revision),
  FOREIGN KEY (source_version_id, rule_id, rule_revision) REFERENCES kb_rules(source_version_id, id, revision),
  FOREIGN KEY (source_version_id, profile_id, profile_revision) REFERENCES kb_rule_profiles(source_version_id, id, revision),
  CHECK (vector_dims(embedding) = embedding_dimensions),
  CHECK (purpose <> 'evidence_query' OR proof_element_id IS NOT NULL),
  CHECK ((provision_id IS NOT NULL AND provision_revision IS NOT NULL AND rule_id IS NULL AND profile_id IS NULL)
    OR (rule_id IS NOT NULL AND rule_revision IS NOT NULL AND provision_id IS NULL AND profile_id IS NULL)
    OR (profile_id IS NOT NULL AND profile_revision IS NOT NULL AND provision_id IS NULL AND rule_id IS NULL))
);

CREATE UNIQUE INDEX kb_search_entry_identity ON kb_search_entries (
  index_version, purpose,
  (CASE WHEN provision_id IS NOT NULL THEN 'provision'
        WHEN rule_id IS NOT NULL THEN 'requirement' ELSE 'profile' END),
  (coalesce(provision_id, rule_id, profile_id)),
  (coalesce(provision_revision, rule_revision, profile_revision)),
  text_hash
);

CREATE TABLE kb_ingestion_jobs (
  id TEXT PRIMARY KEY,
  source_version_id TEXT NOT NULL REFERENCES kb_source_versions(id),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_owner TEXT,
  lease_until TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (source_version_id, input_hash)
);

CREATE TABLE kb_job_steps (
  job_id TEXT NOT NULL REFERENCES kb_ingestion_jobs(id),
  stage TEXT NOT NULL,
  stage_version TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_owner TEXT,
  lease_until TIMESTAMPTZ,
  checkpoint JSONB,
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (job_id, stage, stage_version, input_hash)
);

CREATE TABLE kb_reviews (
  id TEXT PRIMARY KEY,
  reviewer_user_id TEXT NOT NULL REFERENCES users(id),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('provision', 'requirement', 'profile')),
  provision_id TEXT,
  provision_revision INTEGER,
  rule_id TEXT,
  rule_revision INTEGER,
  profile_id TEXT,
  profile_revision INTEGER,
  revision_hash TEXT NOT NULL CHECK (revision_hash ~ '^[a-f0-9]{64}$'),
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'request_changes')),
  reason TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (provision_id, provision_revision) REFERENCES kb_provisions(id, revision),
  FOREIGN KEY (rule_id, rule_revision) REFERENCES kb_rules(id, revision),
  FOREIGN KEY (profile_id, profile_revision) REFERENCES kb_rule_profiles(id, revision),
  FOREIGN KEY (provision_id, provision_revision, revision_hash) REFERENCES kb_provisions(id, revision, content_hash),
  FOREIGN KEY (rule_id, rule_revision, revision_hash) REFERENCES kb_rules(id, revision, content_hash),
  FOREIGN KEY (profile_id, profile_revision, revision_hash) REFERENCES kb_rule_profiles(id, revision, content_hash),
  CHECK ((target_kind = 'provision' AND provision_id IS NOT NULL AND provision_revision IS NOT NULL AND rule_id IS NULL AND profile_id IS NULL)
    OR (target_kind = 'requirement' AND rule_id IS NOT NULL AND rule_revision IS NOT NULL AND provision_id IS NULL AND profile_id IS NULL)
    OR (target_kind = 'profile' AND profile_id IS NOT NULL AND profile_revision IS NOT NULL AND provision_id IS NULL AND rule_id IS NULL))
);

CREATE TABLE kb_publications (
  id TEXT PRIMARY KEY,
  manifest_hash TEXT NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  manifest JSONB NOT NULL,
  index_version TEXT NOT NULL,
  lexical_status TEXT NOT NULL CHECK (lexical_status IN ('pending', 'ready', 'failed')),
  dense_status TEXT NOT NULL CHECK (dense_status IN ('pending', 'ready', 'failed')),
  state TEXT NOT NULL CHECK (state IN ('building', 'active', 'withdrawn', 'superseded')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (state <> 'active' OR (lexical_status = 'ready' AND dense_status = 'ready'))
);

CREATE TABLE kb_publication_reviews (
  publication_id TEXT NOT NULL REFERENCES kb_publications(id),
  review_id TEXT NOT NULL REFERENCES kb_reviews(id),
  PRIMARY KEY (publication_id, review_id)
);

CREATE TABLE kb_audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION kb_reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% records are immutable', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER kb_blocks_immutable BEFORE UPDATE OR DELETE ON kb_blocks
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_provisions_immutable BEFORE UPDATE OR DELETE ON kb_provisions
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_provision_fragments_immutable BEFORE UPDATE OR DELETE ON kb_provision_fragments
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_rules_immutable BEFORE UPDATE OR DELETE ON kb_rules
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_rule_sources_immutable BEFORE UPDATE OR DELETE ON kb_rule_sources
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_rule_profiles_immutable BEFORE UPDATE OR DELETE ON kb_rule_profiles
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_relations_immutable BEFORE UPDATE OR DELETE ON kb_relations
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_search_entries_immutable BEFORE UPDATE OR DELETE ON kb_search_entries
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_reviews_immutable BEFORE UPDATE OR DELETE ON kb_reviews
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_publication_reviews_immutable BEFORE UPDATE OR DELETE ON kb_publication_reviews
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_audit_events_immutable BEFORE UPDATE OR DELETE ON kb_audit_events
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();

CREATE FUNCTION kb_protect_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR
     (OLD.id, OLD.manifest_hash, OLD.manifest, OLD.index_version, OLD.created_by, OLD.created_at)
     IS DISTINCT FROM
     (NEW.id, NEW.manifest_hash, NEW.manifest, NEW.index_version, NEW.created_by, NEW.created_at) THEN
    RAISE EXCEPTION 'publication manifest is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kb_publication_protected BEFORE UPDATE OR DELETE ON kb_publications
  FOR EACH ROW EXECUTE FUNCTION kb_protect_publication();

CREATE FUNCTION kb_protect_source_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR
     (OLD.id, OLD.source_id, OLD.upload_revision, OLD.object_key, OLD.checksum,
      OLD.original_file_name, OLD.mime_type, OLD.byte_size, OLD.language, OLD.uploaded_at,
      OLD.enacted_on, OLD.effective_from, OLD.effective_until)
     IS DISTINCT FROM
     (NEW.id, NEW.source_id, NEW.upload_revision, NEW.object_key, NEW.checksum,
      NEW.original_file_name, NEW.mime_type, NEW.byte_size, NEW.language, NEW.uploaded_at,
      NEW.enacted_on, NEW.effective_from, NEW.effective_until) THEN
    RAISE EXCEPTION 'source version identity and legal dates are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER kb_source_version_protected BEFORE UPDATE OR DELETE ON kb_source_versions
  FOR EACH ROW EXECUTE FUNCTION kb_protect_source_version();
