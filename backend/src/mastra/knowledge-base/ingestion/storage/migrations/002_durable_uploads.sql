CREATE TABLE kb_upload_intents (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES kb_sources(id),
  source_version_id TEXT NOT NULL UNIQUE,
  upload_revision INTEGER NOT NULL CHECK (upload_revision > 0),
  staging_key TEXT NOT NULL UNIQUE,
  object_key TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  original_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type = 'application/pdf'),
  byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400),
  language TEXT,
  enacted_on DATE,
  effective_from DATE,
  effective_until DATE,
  created_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'finalizing', 'committed', 'abandoned')),
  finalize_token TEXT,
  finalizing_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  committed_at TIMESTAMPTZ,
  cleaned_at TIMESTAMPTZ,
  UNIQUE (source_id, upload_revision),
  CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from)
);

ALTER TABLE kb_source_versions ADD COLUMN object_version_id TEXT;

ALTER TABLE kb_ingestion_jobs
  ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN cancel_requested_at TIMESTAMPTZ;

CREATE INDEX kb_jobs_claimable ON kb_ingestion_jobs (next_attempt_at, created_at)
  WHERE status IN ('queued', 'running');
CREATE INDEX kb_intents_reconcile ON kb_upload_intents (expires_at)
  WHERE status = 'pending';
