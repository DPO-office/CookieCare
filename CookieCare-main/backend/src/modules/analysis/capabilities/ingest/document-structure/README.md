# Canonical document structure

This capability builds the document graph once, when a document version is
created. Analysis consumes the persisted graph and does not re-segment the
document during ACT.

## Pipeline

1. `parser.ts` converts layout-aware formats with `docling.rs` and retains
   source item references, page boxes, character spans, headings, lists, and
   table cell spans. Plain text formats use the native text reader.
2. `hierarchy.ts` creates the physical tree deterministically. Numbering,
   Docling heading levels, list nesting, and standalone appendix/schedule
   headings decide `parent_of` and sibling edges.
3. `relations.ts` creates a separate reference graph. Explicit clause and
   appendix references are resolved by hierarchical namespace and exact
   normalized labels. Qualified ranges become granular edges.
4. `llm-relations.ts` can inspect every substantive provision for semantic
   relations that syntax alone cannot find. Proposals are accepted only when
   their evidence is an exact source substring, and target IDs are always
   resolved by code.
5. `adjudication.ts` optionally sends only ambiguous evidence and bounded
   candidate excerpts to the configured model. It can select only an existing
   candidate, and code accepts only high-confidence, exact-evidence decisions.
6. `validator.ts` checks root count, cycles, orphans, source ranges, at least
   99.5% text coverage, relation evidence, and relation targets. Recoverable
   uncertainty uses verified-content-only Analysis; integrity failures block it.
7. `repository.ts` encrypts and persists the versioned artifact in
   `document_structure_artifacts`.

The graph also persists canonical ordinal paths, page ranges, source identity,
scoped local/imported definitions, and shared virtual unresolved targets. Three
references to an absent Schedule A therefore converge on
`unresolved://schedule/a` without manufacturing document content.

Physical containment and semantic references are deliberately separate. For
example, clause `2.1.1` remains a child of `2.1`, while “details are set out in
Appendix 1” creates a `details_provided_by` reference edge from `2.1.1` to the
real Appendix 1 node.

## Configuration

- `DOCUMENT_GRAPH_LLM_RELATIONS=1` enables Gemini relation discovery. It is
  off by default because this sends bounded contract excerpts to the configured
  external model provider.
- `DOCUMENT_GRAPH_RELATION_BATCH_CHARS` controls the maximum characters per
  semantic-discovery batch (default `18000`).
- `DOCUMENT_GRAPH_RELATION_CONCURRENCY` controls semantic-discovery
  concurrency and is capped at `2`.
- `DOCUMENT_GRAPH_LLM_ADJUDICATION=1` enables review-by-exception for
  ambiguous relations. It is off by default because selected evidence and
  candidate excerpts leave the process for the configured Gemini provider.
- `DOCUMENT_GRAPH_ADJUDICATION_LIMIT` caps ambiguous relations sent for one
  document (default `40`, maximum `100`).
- `DOCLING_RS_HOME` points to the directory containing `.models` and
  `.pdfium` for PDF conversion.

On Windows, install the local PDF assets once from the repository root:

```powershell
npm run setup:docling:windows
```

`GET /api/health` reports PDFium/layout/OCR/TableFormer readiness. Docker and
Render install the equivalent Linux assets during their build.

Deterministic reference extraction remains active when semantic discovery is
disabled. DOCX and other supported formats do not require the PDF model bundle.
An upload with recoverable uncertainty is stored successfully and can be
analysed in degraded mode; unresolved or ambiguous edges are never presented as
verified. Identity mismatches, invalid provenance, cycles, or other structural
integrity failures still block automated legal analysis.

## Operations

Run the database setup/migration before deploying the new backend. Existing
documents are upgraded lazily on first Analysis access, or in stable batches:

```http
POST /api/admin/backfill-document-graphs
Content-Type: application/json

{ "limit": 10, "cursor": "", "retryNeedsReview": false }
```

Repeat with `nextCursor`. Set `retryNeedsReview` to `true` after fixing a parser
dependency or configuration issue to rebuild both missing and review-required
artifacts. An optional `userId` limits the batch to one tenant.

`benchmark.ts` compares an extracted graph with a human-adjudicated gold graph
and emits machine-readable metrics for nodes, parents, namespaces, definitions,
references, target resolution, relation types, unresolved targets, ambiguity,
and traversal. A high node or relation count is not a readiness signal.

## Tests

```powershell
node --import tsx --test backend/src/modules/analysis/capabilities/ingest/document-structure/__fixtures__/document-structure.test.ts
```
