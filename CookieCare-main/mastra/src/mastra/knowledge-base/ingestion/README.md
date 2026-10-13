# Knowledge base ingestion

Phase 0 contracts and evaluation examples live here. Phase 1 adds database and access control. Phase 2 adds private uploads and a durable worker. The revised shared-KB plan adds source extraction, local reference detection, candidate reconstruction, legal-draft contracts, review operations and guarded publication/retrieval components. A reviewed and searchable publication has not yet been produced.

## What is implemented

- Runtime-validated contracts for source identity and upload versions, raw blocks, complete provisions, structured requirements, investigation/drafting/Q&A profiles, relations, coverage, review decisions, search entries and publication manifests.
- Stable rule IDs and explicit record revisions. Legal dates, upload dates, extraction versions and profile versions are separate. Unknown dates are `null`.
- Private, workspace and curated shared visibility shapes. The Phase 1 source store checks approved users and workspace membership before source operations. The authenticated backend must supply the actor ID; a request body must never supply it.
- Canonical JSON revision hashes and exact search-text hashes. Hash the immutable content payload, excluding its own hash and mutable lifecycle metadata. Do not use object insertion order as a revision identity.
- Cross-record validation for block/source versions, fragment bounds, parent references/cycles, exact supporting quotes and block accounting.
- Twelve development examples covering Article 28(3)(a)-(d) and parent/dependency context, paragraph 28(5) continuation, headers/footers, real page-top paragraph starts, hyphenation, columns, tables, numbering restarts, missing extraction, exceptions/alternatives and unusable inputs.
- A repeatable artifact evaluator, comparisons between pipeline versions, source-family split protection and lossless JSON snapshots of the fourteen existing authored Article 28 profiles.
- A Mastra source-intake workflow with explicit review-required, unsupported and unreadable outcomes. It does not read PDF bytes or claim a completed ingestion.
- PostgreSQL tables for source versions, blocks, provisions, rule revisions and evidence, profiles, relations, search entries, job checkpoints, reviews, publications and audit events. Revision links and exact review hashes have database constraints.
- A transactional, checksum-checked migration runner. A failed or changed migration stops Mastra startup instead of logging and continuing.
- A scoped source store for creating workspaces, granting membership, adding immutable upload revisions and checking read/upload/review/publish rights. Only an approved administrator can create curated shared sources.
- An authenticated upload flow: authorize, sign a five-minute staging upload URL with a SHA-256 header, re-read and verify the PDF, count pages from the original bytes, write a permanent private object, and commit its source version and queued job together.
- A leased PostgreSQL worker running the fixed `kb-process-ingestion-v1` Mastra workflow. It verifies original bytes again, records versioned step checkpoints, classifies intake, retries transient failures and resumes expired leases. Cancellation fences off later checkpoints.
- PostgreSQL-backed Mastra workflow run storage when `DATABASE_URL` is configured. The KB job and checkpoint tables remain the recovery source of truth if a process exits mid-run.
- Reconciliation for expired staging uploads and missing permanent PDFs. The worker checks for these once at startup and periodically.
- Additive migration `003_legal_structure.sql` separates legal instruments/versions from PDF uploads and extraction runs. A later identification step can append a source-to-legal-version link without changing an uploaded source revision.
- Structural provisions can be rules, schedules, recitals, chapters, sections and illustrations, with semantic purposes stored separately. Tables retain row/column cells and source fragments across physical pages, including printed page labels.
- Reference occurrences retain exact wording even when resolved. Versioned relationships retain their source and target revisions, explicit/inferred basis and supporting passages. Append-only relation reviews can attach approved revisions to a publication.
- New requirement meaning contracts represent nested `all`/`any`/`not` applicability and supported conditions, exceptions, alternatives and deadlines. New `kb_rule_support` rows can cite a different legal document from the rule's original PDF. Legacy flat lists and support rows remain readable for existing records.
- Additive migration `004_workflow_jobs.sql` extends the same queue with `intake`, `prepare_source`, `build_rule_drafts` and `publish_approved` job types. Jobs record every source version in their scope, prerequisites, an input descriptor and a deterministic deduplication key. A publication job can depend on several documents without pretending to be one uploaded PDF.
- Workers claim only job types with a registered Mastra workflow. The worker runs intake and `prepare_source`; drafting and publication workflow factories exist but are not registered for production jobs yet.
- Jobs can wait without occupying a worker or consuming a retry. They resume after the dependency or review state changes. Failed or cancelled prerequisite jobs fail dependent queued jobs explicitly. Job reads and cancellation check permission across every source in the job scope.
- A checkpointed JSON artifact store writes raw future step outputs under immutable private object keys. PostgreSQL records their exact hashes, sizes and locations with the step checkpoint. A retry verifies the bytes and reuses a matching object; a lost lease cannot commit artifact metadata.
- Intake atomically queues `prepare_source` for readable English pilot PDFs, including sources whose legal authority still needs review. The fixed `kb-prepare-source-v1` Mastra workflow verifies the original checksum, converts it with pinned `docling.rs` 1.41.0, stores the complete Docling JSON, then stores a separate canonical text and source map. Each mapped span points to its Docling item and physical PDF page; table cells keep their row, column and box. Printed page labels remain unknown until verified. Unmapped pages or unreferenced items produce explicit review warnings. The extraction run records the raw artifact; the completed job result points to both artifacts. A completed preparation job means extraction and mapping only, not approved legal structure.
- Preparation uses one provider-neutral Mastra workflow. `KB_STRUCTURE_PROVIDER` defaults to `kanon`; each job freezes the provider, model, prompt version, strategy and configuration hash. The Kanon adapter sends unchanged canonical text with non-truncating chunk overflow. A strict LLM adapter is available for local injected tests and rejects invented source anchors and oversized inputs. Production LLM transfer is disabled until its destination is explicitly authorized. Both adapters feed the same reference detection, reconstruction and validation stages. None of those drafts is legal approval.
- Interpretation helpers assemble accepted provisions with their named dependencies, fail on incomplete or oversized context, validate exact support quotes and evaluate applicability as true, false or unknown. A model cannot approve its own proposal.
- An authorized reviewer can append an exact-hash decision through `POST /api/knowledge-base/reviews`. The review service rejects stale revisions and leaves old decisions intact. The publication preflight requires verified source readiness, latest exact approvals and independently verified lexical and dense indexes. It does not activate a publication by itself.
- A shared retrieval component merges exact citation, lexical and dense candidates, then rechecks publication and source scope for every result and linked dependency. Missing or inaccessible dependencies produce an incomplete-context flag.
- The fixed `kb-build-rule-drafts-v1` Mastra workflow assembles accepted legal context, saves a proposed interpretation and produces a validation bundle for review. Its proposal provider and accepted-context loader are injectable; the production worker does not register it yet.
- The fixed `kb-publish-approved-v1` Mastra workflow freezes an approved search scope, prepares search text and embeddings, checks live publication facts and asks an injected gateway to activate atomically. No production embedding provider, BM25 backend or activation gateway is registered. The workflow cannot publish in the current deployment.
- Source preparation also stores an explicit validation report for missing pages, unmapped PDF locations, unclassified wording, invalid provision spans and unresolved references. A candidate status never counts as human approval.

## Upload and worker flow

1. The authenticated backend receives `POST /api/knowledge-base/uploads` with `sourceId`, an optional new `source`, `originalFileName`, `byteSize`, the file's hex SHA-256 `checksum`, `language`, and nullable `enactedOn`, `effectiveFrom`, `effectiveUntil` dates. A newly uploaded source starts with `unverified` authority regardless of the client's claim. The response contains `intentId`, `url` and required `headers`.
2. The client sends the PDF bytes with HTTP PUT to that short-lived URL, supplying the exact returned headers.
3. The client calls `POST /api/knowledge-base/uploads/{intentId}/complete`. The server checks size, content type, checksum and original page count, then returns the source version and job IDs. No job exists if verification fails.
4. A separate `npm run kb:worker` process claims queued jobs and runs the Mastra intake workflow, then its dependent source-preparation workflow. `GET /api/knowledge-base/jobs/{jobId}` returns the intake job's `prepareJobId` and a completed job's result with artifact IDs. An authorized reader can inspect verified JSON through `GET /api/knowledge-base/jobs/{prepareJobId}/artifacts/{artifactId}`. The client can also cancel a job or obtain an authorized five-minute original-PDF URL at `GET /api/knowledge-base/sources/{sourceId}/versions/{versionId}/read-url`.
5. An uploader can replay structure extraction from saved Docling and source-map artifacts with `POST /api/knowledge-base/sources/{sourceId}/versions/{versionId}/structure-runs/replay`. Each replay creates separate provider-response, candidate, reconstruction and validation artifacts plus an immutable provider-run row. The original PDF and previous runs stay unchanged. The older `/reprepare` route remains for legacy `awaiting_kanon` jobs.

Limits: 25 MiB per PDF, 5,000 pages, 30 seconds for PDF inspection, three queue attempts and at most four concurrent jobs per worker. Intake does not invoke a model; preparation calls Isaacus Kanon after Docling extraction. A completed intake job means the original was verified and classified; a completed preparation job means candidate structure is ready for review, not approved or published.

## Run checks

From the repository root:

```powershell
npm run test:kb
npm run lint:kb
npm run kb:evaluate
```

The default evaluation is a **reference self-check**. It checks prepared expectations, not a real ingestion pipeline. It never claims production qualification.

Inside `mastra`, run `npm test`, `npm run typecheck` and `npm run kb:evaluate`. The evaluator resolves export paths from the `mastra` folder even when launched through the root script.

The storage tests use disposable embedded PostgreSQL with pgvector and an in-memory object store. They cover migrations, access, immutable revisions, checksum failures, abandoned uploads, expired leases, retries, cancellation and missing objects. They do not apply migrations to a deployed database or call live S3.

The revised-plan tests also check cross-page table cells, retained schedule mentions, cross-document rule support, exact approved relationship revisions, multi-source job dependencies, waiting/resume behavior, permission checks and artifact recovery after lease loss. Source-extraction tests check exact UTF-16 offsets, page and table-cell references, candidate reconstruction, validation reports and persisted Docling/map artifacts. Production still needs an API key, a legal-draft provider, reviewed pilot knowledge, a selected BM25 backend and verified embeddings before publication.


Export reference outputs and authored profiles for inspection:

```powershell
npm run kb:evaluate -- --export-reference reference.json --export-authored authored.json --output report.json
```

A later pipeline can export `PipelineRunSchema` artifacts and compare two versions:

```powershell
npm run kb:evaluate -- --baseline before.json --candidate after.json --output comparison.json
```

The process exits with code 1 for schema errors, missing/unknown/duplicate cases, failed artifact checks or new regressions. Equal total error counts do not conceal a newly introduced error. This is exact deterministic comparison; changes to expected interpretation need review, rather than fuzzy automatic acceptance.

## Contract conventions

`schemas/` defines runtime schemas and their TypeScript types. Nested JSON is strict: accidental fields fail validation. Revision references include both ID and revision; citations include instrument, source version and a structural path. Fragment and quote offsets are UTF-16 indices with exclusive ends, matching JavaScript `slice`. Raw PDF blocks retain original wording; only explicit normalization choices apply to reconstructed provisions.

Authorship and legal approval are separate. An imported profile retains its source path, skill/profile versions, content hash and declared authored/reviewed status, and still requires separate legal review. It is a comparison input, not published KB knowledge.

The evaluation adapter reads the old backend GDPR catalog solely for comparisons. The ingestion workflow does not depend on that catalog. Its inputs must come from trusted backend code after access is resolved; the workflow itself is not an upload API or an authorization boundary.

Search entries retain exact embedding input, purpose, record revision, model, dimensions and query/document configuration. They reject incorrect hashes, wrong dimensions and nonfinite vectors. No embedding model or dimension is locked in by this module.

An active publication's shape requires both lexical and dense indexes to be ready. Phase 5/6 services must enforce approved-review scope, index completeness and transactional publication before exposing records. A schema alone does not enforce those server operations.

## Phase 0 qualification still pending

No original pilot PDF was found in the repository. Legislative wording is based on the [official GDPR text](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng); page labels 67-69 and layouts are synthetic. The prepared interpretations have **not** been checked by a human legal reviewer. Other examples use invented wording and are marked synthetic.

All twelve cases are development inputs. Independent calibration and held-out documents must be added with all versions/variants of each source in one split. Initial critical-error budgets are zero for each represented category, explicitly provisional; extraction/retrieval thresholds need calibration on reviewed material. Corpus size is reported as evidence, never as certification.

Phase 0's engineering code is ready. Its full completion gate still requires the real pilot PDF, varied reviewed pilot documents, human-checked expected answers and a measured embedding/retrieval baseline. See [the component baseline](evaluation/BASELINE.md) and [deployment decisions](DEPLOYMENT.md).
