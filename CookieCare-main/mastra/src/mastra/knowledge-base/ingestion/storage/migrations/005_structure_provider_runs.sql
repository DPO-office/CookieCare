-- One durable queue extension: immutable provider runs keep replay artifacts and metrics.
CREATE TABLE kb_structure_provider_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES kb_ingestion_jobs(id),
  source_version_id TEXT NOT NULL REFERENCES kb_source_versions(id),
  source_text_hash TEXT NOT NULL CHECK (source_text_hash ~ '^[a-f0-9]{64}$'),
  provider TEXT NOT NULL CHECK (provider IN ('kanon', 'llm')),
  model TEXT NOT NULL,
  prompt_version TEXT,
  processing_strategy TEXT NOT NULL,
  provider_configuration JSONB NOT NULL CHECK (jsonb_typeof(provider_configuration) = 'object'),
  provider_configuration_hash TEXT NOT NULL CHECK (provider_configuration_hash ~ '^[a-f0-9]{64}$'),
  replayed_from_job_id TEXT REFERENCES kb_ingestion_jobs(id),
  raw_response_artifact_id TEXT NOT NULL REFERENCES kb_job_artifacts(id),
  candidate_artifact_id TEXT NOT NULL REFERENCES kb_job_artifacts(id),
  reconstruction_artifact_id TEXT NOT NULL REFERENCES kb_job_artifacts(id),
  validation_artifact_id TEXT NOT NULL REFERENCES kb_job_artifacts(id),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  usage JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((provider = 'kanon' AND prompt_version IS NULL) OR
         (provider = 'llm' AND prompt_version IS NOT NULL))
);

CREATE INDEX kb_structure_runs_comparison
  ON kb_structure_provider_runs (source_version_id, source_text_hash, provider, created_at);

CREATE TRIGGER kb_structure_provider_runs_immutable
  BEFORE UPDATE OR DELETE ON kb_structure_provider_runs
  FOR EACH ROW EXECUTE FUNCTION kb_reject_mutation();
