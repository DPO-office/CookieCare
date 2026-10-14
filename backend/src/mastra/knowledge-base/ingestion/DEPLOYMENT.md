# Pilot deployment decisions

Recorded 9 October 2026. These are implementation targets, not deployed resources. No infrastructure is provisioned by Phase 0.

| Component | Decision | Confirmation still needed |
| --- | --- | --- |
| Original PDFs and extraction artifacts | Private DigitalOcean Space behind a storage service; unique object keys per immutable source upload. Use authorized short-lived URLs. | Account, region, Space, retention, encryption and scoped key before Phase 1/2 deployment. |
| Structured records and dense indexes | Existing PostgreSQL integration, recorded KB migrations and pgvector. Required KB migration failures stop KB startup. | Inspect actual PostgreSQL/extension versions and exercise fresh-install/upgrade paths in Phase 1. |
| Worker hosting | Separate backend worker process polling a durable PostgreSQL queue on the same server as the API. | `npm run kb:worker` is implemented, but hosting has not been provisioned. |
| Persistent lexical ranking | Prefer a supported PostgreSQL BM25 extension after verifying availability on the deployed database. If unavailable, use a dedicated OpenSearch BM25 index. | Deployed extension support is unknown; no extension or external service is claimed available. Select the verified path before lexical indexing begins. PostgreSQL `ts_rank` is not BM25. |
| Embeddings | Benchmark the current `gemini-embedding-001` / 768-dimensional configuration first. Record model, dimensions and query/document tasks per index version; choose the KB configuration after reviewed search evaluation. | No model calls or live index benchmark were run. Selection remains pending; existing evidence vectors are not automatically a compatible KB index. |

The existing backend uses PostgreSQL through `backend/src/config/database.ts`, setup logic in `backend/scripts/setupDb.ts` and the embedding constants in `backend/src/llm/config/model-specs.ts`. These are integration points for later phases; this module does not change them.

Phase 1 migration: set `DATABASE_URL` for the backend worker, run existing backend database setup first so `users` exists, then run `npm run kb:migrate` from the repository root. This installs the KB tables and requires pgvector. The production worker applies migrations before polling and fails startup if they fail. Only an embedded PostgreSQL test database was migrated in development; the deployed database and Space have not been changed.

Phase 2 runtime: give both backend API and worker `DATABASE_URL`, `DO_SPACES_REGION`, `DO_SPACES_BUCKET`, `DO_SPACES_KEY`, and `DO_SPACES_SECRET`. Use a Space-scoped key. Keep the Space private and permit browser CORS PUT requests with `Content-Type` and `x-amz-checksum-sha256` from the frontend origin. Run `npm run kb:worker` from the same backend image as the API, in a separate process on the same server. The process applies migrations before polling. Upload and read URLs expire after five minutes. No Space, access key, CORS rule or hosted worker was created by this code change.

Phase 3 worker: in the DigitalOcean production stack, set `DOCLING_SERVICE_URL` and `DOCLING_SERVICE_TOKEN` to the separate authenticated HTTPS Docling service described in the root [deployment guide](../../../../../DEPLOYMENT.md). The main worker image does not contain native Docling assets. Failed conversions fail the preparation job explicitly. Local development can still use `docling.rs` 1.41.0 and `DOCLING_RS_HOME`. Raw Docling JSON and its source map use immutable private Spaces artifact keys and can be located from the completed `prepare_source` job result. The code was checked against a local 18-page DPDP Rules PDF; no deployed worker or storage was changed.

Phase 4 worker: set `KB_STRUCTURE_PROVIDER=kanon` and `ISAACUS_API_KEY`. Kanon is also the default when the provider variable is absent. The user explicitly authorized sending extracted text from private and workspace legal PDFs to the Isaacus Kanon API at `api.isaacus.com`. The selected provider configuration is saved in every job. Preparation submits complete canonical text with `overflow_strategy: chunk`, stores the raw response privately, and validates returned text and spans against the PDF. Authorized uploaders can replay a saved Docling source map; every replay keeps a separate immutable run and artifact set.

The code includes a strict LLM structure adapter selected locally with `KB_STRUCTURE_PROVIDER=llm` and `KB_STRUCTURE_LLM_MODEL`. It uses exact source anchors, a versioned prompt and explicit oversize rejection. The production provider factory and replay API currently reject `llm`, so private or workspace source text cannot be sent to Gemini from this ingestion worker. Enabling it requires explicit authorization for that destination.

Later-phase guards: the rule-drafting and publication Mastra workflows are defined with injectable services, but neither is registered by the production worker. Requirement generation, legal review of the pilot, a verified BM25 backend, embeddings, publication activation and module cutover remain separate prerequisites; candidate artifacts and a passing unit preflight are not a published legal KB.

Spaces supports permission-bound presigned uploads. Reusing an object key can replace existing bytes, so versioned keys and checksum validation are required in our upload design. [DigitalOcean Spaces documentation](https://docs.digitalocean.com/products/spaces/reference/s3-compatibility/).

Render background workers run independently of request-serving web processes and can poll a queue. [Render worker documentation](https://render.com/docs/background-workers).

OpenSearch offers BM25 lexical ranking. Its backend/version/configuration must be recorded with each publication's index manifest. [OpenSearch keyword search documentation](https://docs.opensearch.org/latest/search-plugins/keyword-search/).

pgvector HNSW indexes support up to 2,000 dimensions for `vector` and 4,000 for `halfvec`. The current 768-dimensional candidate fits those documented limits, but the deployed extension and actual index still need verification. [pgvector documentation](https://github.com/pgvector/pgvector#hnsw).
