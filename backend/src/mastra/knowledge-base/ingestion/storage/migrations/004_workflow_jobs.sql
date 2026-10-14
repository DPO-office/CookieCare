-- One durable queue for intake and the three fixed KB workflows.
ALTER TABLE kb_ingestion_jobs ADD COLUMN job_type TEXT NOT NULL DEFAULT 'intake'
  CHECK (job_type IN ('intake', 'prepare_source', 'build_rule_drafts', 'publish_approved'));
ALTER TABLE kb_ingestion_jobs ADD COLUMN publication_id TEXT REFERENCES kb_publications(id);
ALTER TABLE kb_ingestion_jobs ADD COLUMN input_descriptor JSONB NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(input_descriptor) = 'object');
ALTER TABLE kb_ingestion_jobs ADD COLUMN result JSONB;
ALTER TABLE kb_ingestion_jobs ADD COLUMN waiting_reason TEXT;
ALTER TABLE kb_ingestion_jobs ADD COLUMN dedupe_key TEXT;
UPDATE kb_ingestion_jobs
  SET dedupe_key = 'intake:' || source_version_id || ':' || input_hash;
ALTER TABLE kb_ingestion_jobs ALTER COLUMN dedupe_key SET NOT NULL;
ALTER TABLE kb_ingestion_jobs ADD CONSTRAINT kb_ingestion_jobs_dedupe_key_key UNIQUE (dedupe_key);
ALTER TABLE kb_ingestion_jobs DROP CONSTRAINT kb_ingestion_jobs_source_version_id_input_hash_key;
ALTER TABLE kb_ingestion_jobs ALTER COLUMN source_version_id DROP NOT NULL;
ALTER TABLE kb_ingestion_jobs DROP CONSTRAINT kb_ingestion_jobs_status_check;
ALTER TABLE kb_ingestion_jobs ADD CONSTRAINT kb_ingestion_jobs_status_check
  CHECK (status IN ('queued', 'running', 'waiting', 'completed', 'failed', 'cancelled'));
ALTER TABLE kb_ingestion_jobs ADD CONSTRAINT kb_ingestion_jobs_target_check CHECK (
  (job_type = 'publish_approved' AND publication_id IS NOT NULL AND source_version_id IS NULL)
  OR (job_type <> 'publish_approved' AND publication_id IS NULL AND source_version_id IS NOT NULL)
);
ALTER TABLE kb_ingestion_jobs ADD CONSTRAINT kb_ingestion_jobs_waiting_check CHECK (
  (status = 'waiting' AND waiting_reason IS NOT NULL)
  OR (status <> 'waiting' AND waiting_reason IS NULL)
);

CREATE TABLE kb_job_sources (
  job_id TEXT NOT NULL REFERENCES kb_ingestion_jobs(id),
  source_version_id TEXT NOT NULL REFERENCES kb_source_versions(id),
  PRIMARY KEY (job_id, source_version_id)
);
INSERT INTO kb_job_sources (job_id, source_version_id)
  SELECT id, source_version_id FROM kb_ingestion_jobs WHERE source_version_id IS NOT NULL;

CREATE TABLE kb_job_dependencies (
  job_id TEXT NOT NULL REFERENCES kb_ingestion_jobs(id),
  required_job_id TEXT NOT NULL REFERENCES kb_ingestion_jobs(id),
  PRIMARY KEY (job_id, required_job_id),
  CHECK (job_id <> required_job_id)
);

CREATE TABLE kb_job_artifacts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES kb_ingestion_jobs(id),
  stage TEXT NOT NULL,
  stage_version TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  kind TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, stage, stage_version, input_hash, kind)
);

CREATE INDEX kb_job_sources_by_version ON kb_job_sources (source_version_id, job_id);
CREATE INDEX kb_job_dependencies_by_required ON kb_job_dependencies (required_job_id, job_id);
CREATE INDEX kb_jobs_type_claimable ON kb_ingestion_jobs (job_type, next_attempt_at, created_at)
  WHERE status IN ('queued', 'running');

CREATE TRIGGER kb_job_sources_immutable BEFORE UPDATE OR DELETE ON kb_job_sources
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_job_dependencies_immutable BEFORE UPDATE OR DELETE ON kb_job_dependencies
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
CREATE TRIGGER kb_job_artifacts_immutable BEFORE UPDATE OR DELETE ON kb_job_artifacts
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
