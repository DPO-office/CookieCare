# Small-chunk ingestion: implementation and evaluation note

Date: 21 October 2026.

## What changed in this implementation

The production LLM provider now asks the existing Docling service to run native HybridChunker on the saved Docling document. The local experiment uses the same native `docling.rs` chunker directly. We did not replace Docling extraction, migrate the database, publish knowledge, or change the analysis/drafting modules.

The earlier 190,000-character request target is retired for structure extraction. Native chunking uses a 2,048-token content budget. The tokenizer is Docling's configured tokenizer, not a promise about GLM token counts. The source-preserving request adapter has an additional 12,000-character packing target and 24,000-character safety ceiling, including prompt/schema/metadata. It also limits the number of source units per request.

The native chunker suggests groups and headings. We retain the original source text and locations, rather than substituting rendered Markdown. Every source span is owned once. Blocks that the native chunker omits are preserved and reported. Repeated native references to one table cannot duplicate the source text. Oversized source blocks are divided into exact, Unicode-safe fragments, with continuation metadata. Headers are repeated as table context where they fit; omitted context is recorded.

This is a source-preserving projection of native chunks, not a claim that every final request is identical to a native chunk or has a verified GLM-token ceiling. That distinction matters for benchmarking.

Other changes:

- Added an authenticated `/v1/chunk` route to the Docling service, with input limits, concurrency handling, timeout behavior, and tests. The service image now includes the chunk tokenizer assets.
- Wired the original Docling artifact into both local and queued structure extraction.
- Bumped the structure prompt and processing strategy to v4 so older configuration-bound checkpoints are not reused as if they were this strategy.
- Tightened instructions about first/last anchors, list qualifications, and fragment continuation.
- Added conservative cross-chunk boundary reconciliation. It joins only complementary continuation flags with matching labels, compatible parents, and contiguous/overlapping source spans. It preserves the fragment evidence. Ambiguous or unlabelled continuations remain unresolved.
- Required parent-hint matches to contain the child; a matching label elsewhere is not enough.
- Derived reconstructed provision identity from the source version/text and structural span/type instead of temporary model/chunk IDs. This gives stability within the same frozen extraction, not across amended laws or changed OCR.
- Included child-owned references during candidate context traversal, so a selected Schedule can lead through its row to another provision. Including a parent for introductory context does not automatically expand all its children.
- Added typed incoming exceptions, definitions, and interpretative links to accepted-context assembly. Generic incoming citations are not reversed. This uses the caller's accepted relation set; it does not generate or approve those semantic links.
- Stopped choosing the first parent revision when several accepted revisions match.
- Added supported subsection, subparagraph, list-item, table-row, part, and title kinds.
- Fixed live-run handling of context-only segments: validate their source anchors, exclude duplicate context-only output, and preserve core-source coverage checks. A neighbour repeated by the model no longer aborts the whole document.
- Retained received token usage when a model response fails during normalization.

Several earlier fixes were already in the working tree before this implementation: checkpoint identity checks, attempted-call recording, range/ambiguity corrections, table separation, and explicit heuristic-review flags. They were preserved, not overwritten or claimed as newly implemented here.

## Tests and experiments

- All 114 KB tests passed with `DATABASE_URL` set to an empty value for the test process. This avoids the configured external workflow store; the database-focused tests use their existing isolated fixtures.
- All four Docling HTTP service tests passed with localhost networking enabled.
- TypeScript KB type checking passed.
- The 12-case reference self-check passed. It explicitly reports `releaseQualified: false`; it is not a live parser/model accuracy evaluation.
- A live GLM DPDPA experiment ran from the existing frozen Docling/source-map artifacts. It failed during chunk 43 of 59; details are below. The graph judge was not run against incomplete output.

The initial full test invocation encountered sandbox restrictions on localhost database access and a mocked-provider/native-chunker integration issue. The provider now accepts an injected chunker for isolated tests, while the production factory supplies native chunking. The isolated full suite subsequently passed.

## How to reproduce

From `backend`, using a saved run directory containing `docling.json`, `source-map.json`, and `original.pdf`:

```powershell
node --import tsx scripts/run-kb-structure-experiment.ts `
  --source 'evaluation-runs/DPDPA-2023 Act.pdf/2aa2c51e-de1c-44e8-bfd3-2e5503f2218b' `
  --output 'evaluation-runs/dpdpa-small-chunks-v4' `
  --local-docling --live
```

Without `--live`, this only exercises native chunking and source-preserving request planning. `--local-docling` explicitly uses local native assets for this experiment; it does not change the deployment configuration.

To evaluate the four selected S3 graph cases after a successful extraction:

```powershell
node --import tsx scripts/score-kb-structure-experiment.ts `
  --source 'evaluation-runs/DPDPA-2023 Act.pdf/2aa2c51e-de1c-44e8-bfd3-2e5503f2218b' `
  --run 'evaluation-runs/dpdpa-small-chunks-v4' `
  --fixture 'src/mastra/knowledge-base/ingestion/evaluation/fixtures/dpdpa-2023-review-v1'
```

Expected answers are only supplied to the judge, not the extractor. Evaluation selects observed nodes by the fixture's page scope, expands outgoing reference targets, and reports excluded oversized seed nodes. It does not construct an expected graph and pretend that graph was produced by the pipeline. Later-stage cases are not scored by this S3 experiment.

## Deployment requirements

Deploy the updated Docling service with `/v1/chunk` and tokenizer assets before enabling this LLM strategy in the worker. An older service will return an explicit error; there is no silent fallback to 190k requests. For local operation the tokenizer must exist under `.models/chunk/tokenizer.json`, or `DOCLING_CHUNK_TOKENIZER` must identify it.

The existing Node binding already supplies native chunking. A Python environment was installed under ignored `backend/out/` during investigation, but is not used by the implementation and is not a new application dependency.

## What this does not prove or implement

- No claim of 100% legal parsing, or that all nine risk categories are solved.
- Cross-page text extraction errors remain possible; the source-coverage check concerns the saved extracted text.
- Boundary reconciliation is deliberately conservative. It cannot repair every unlabelled continuation or every spanning parent.
- A complete source-text span does not prove that all subclauses were extracted separately.
- Implicit modifier discovery, verified definition scope, and semantic recital linking are still incomplete. Existing heuristic proposals remain review-required.
- Context traversal follows recorded edges. It does not infer that every downstream requirement is applicable.
- Overlapping parent/child text can still inflate context size; full scoped text deduplication is pending.
- External legal instruments, correct versions, and commencement information still need separate sources and review.
- Production meaning generation, module guidance, embeddings, lexical indexing, and publication are not completed by this structure experiment.
- The DPDPA reference dataset is still pending human review. Judge results are provisional; disputed text comparisons need source inspection.

## Live DPDPA result

**Result: failed; legal accuracy not established.** The resumed GLM-5.3 extraction stopped during chunk 43 of 59. Its final retry, `chunk_043bbab`, failed with `LLM quote is absent or occurrence is invalid: src:241`. The resumed invocation ran for about 26.9 minutes; this excludes earlier attempts.

The final retry had only one core source unit (`src:242`, the startup explanation), with adjacent units supplied as context. The invalid anchor referred to `src:241`, a context-only unit. The stack shows the reference validation step rejected that context reference before it could be excluded from core output. This is a specific remaining failure mode: an invalid reference in repeated context can still abort an otherwise small request. The run did not establish whether its core extraction was correct.

Follow-up fix implemented: distinguish known context-only segments and reference records from core records before quote validation. Discard context-only records rather than publishing them, and record their counts in warnings. Continue strictly validating every retained core reference, mixed core/context boundary, and context label actually used to establish a retained provision's parent hint. Unknown source IDs still fail, even in otherwise discarded records. This also addresses the later chunk 27 failure: `src:114` is neighbouring context, while `src:113` is the core unit in the saved plan.

Local follow-up verification: all 23 focused small-chunk/provider tests passed, including malformed context-only output, invalid core quotes, invalid core references, invented IDs, consumed parent labels, and mixed boundaries. No live model calls were made for this fix; the historical failed run remains failed until a new extraction succeeds. The model prompt and checkpoint configuration are unchanged, so already successful matching checkpoints remain reusable.

Completed checkpoints and attempt records remain in `backend/evaluation-runs/dpdpa-small-chunks-v4/`. The final status is in `experiment.json`. No complete reconstructed graph or legal accuracy score was produced. The four selected S3 judge cases were not run because their input graph was unavailable. No new PDF run was started after this failure.

The working implementation therefore passes engineering tests but is **not yet qualified for production legal ingestion**. Do not treat the engineering test count as a legal accuracy result.

## Focused S3 evaluation follow-up (22 October 2026)

The completed DPDPA run `d758231c-78a5-4bdd-a21e-fbd3703703aa` produced a graph, but the initial four-case judge run gave no verdict: one JSON response was truncated and three case payloads exceeded the judge input limit. The scoring script now expands the four S3 cases into 113 individual expected-field checks, sends one focused check per judge call, and retains a compact inventory of the page-scoped graph so missing items remain visible. It includes adjacent provisions whose source page is unknown; this matters for the Schedule heading in this run. Schedule table cells are included for relevant checks.

`--prepare-only` builds the evaluation input and a preview without contacting a judge. On this run, all 113 prepared checks were below the configured 100,000-character safety limit and had no preparation errors. The preview records selected candidates for inspection. `--case DPDPA-S3-01` runs one case at a time to limit cost. Live judge results are saved in both the standard report and a case/model-specific report; individual judge calls are recorded separately. A failed individual judge call becomes `needs_review`, not a pass. The dataset remains pending human approval, and no paid judge run was performed for this follow-up.

The scorer prints a progress line for each individual judge request and a waiting update every 15 seconds. This is console progress output; it does not simulate model work or alter timeouts. A case still takes multiple sequential judge calls.

### Planning observations

The frozen DPDPA source contains 63,173 source-span characters. Native Docling produced 21 chunks; source-preserving projection produced 59 model requests, with a maximum assembled request of 10,681 characters. The saved GDPR source contains 382,746 source-span characters; native planning produced 117 chunks and projection produced 383 requests, with a maximum of 14,528 characters. No live GDPR extraction was run.

Both planning checks retained the extracted source spans exactly. This does not establish that the PDF itself was extracted without omissions. The request count is higher than native Docling's count because the adapter retains otherwise unassigned source items and limits source units. Packing those items more efficiently is future work.

During the DPDPA model run, several responses contained source quotes that could not be matched to their supplied source units. Validation rejected these responses and retried smaller groups. Some retries recovered successfully; some individual calls took several minutes. Small requests therefore reduce output size pressure but do not guarantee accurate anchors or fast responses.

## Judge response recovery follow-up (23 October 2026)

The first `DPDPA-S3-01` judge run completed 30 of 32 planned calls, but several GLM Flash responses ended with incomplete JSON. The scorer parsed those responses immediately, and the first failed forbidden-claim call escaped its loop. That discarded the already collected field decisions and reduced the whole case to a generic `needs_review` result.

The scorer now uses a bounded response contract: one short verdict and a reason of at most 500 characters per focused check, low reasoning effort, and a 2,048-token first response limit. Only a failed check is retried; its second attempt can use 4,096 completion tokens. A provider `length` finish reason is classified as truncation before JSON parsing. Invalid JSON, invalid schema, truncation, and request errors are recorded separately.

Every received judge response is appended immediately to a case/model-specific JSONL file, including the raw text, finish reason, token usage, duration, and attempt number. Completed logical decisions are written to a checkpoint after every check. A restarted command reuses confirmed pass/fail checks from the same run and judge model; unresolved checks are tried again.

Expected-field and forbidden-claim failures are both isolated. After two unsuccessful attempts, that single check becomes `needs_review` and scoring continues. A confirmed expected-field failure or confirmed forbidden claim still makes the final case verdict `fail`, even when other checks need review. This prevents technical uncertainty from erasing a legal-structure failure already established by completed checks.

No paid judge call was made for this follow-up. `npm run lint:kb` completed successfully.
