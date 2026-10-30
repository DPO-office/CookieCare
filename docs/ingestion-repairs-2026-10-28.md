# Ingestion repairs — 28 October 2026

These changes address the concrete failures in the supplied review. They were verified with 148 passing KB tests, TypeScript checking, and offline replay of two saved extraction candidates. No paid model call, production database update, or publication was performed. Existing working-tree changes were retained.

## Changes and examples

### Extraction and retries

The seven-call limit shared by a root chunk and all descendants has been removed. Splits strictly reduce the number of owned source units, so a tree of N units is bounded by 2N−1 calls. Every sibling gets an attempt. This can spend more calls than the old limit; it no longer silently sacrifices later regions to stay under seven calls.

A coverage failure retains grounded output and retries only missing units. Partial checkpoints record missing source IDs and cannot be mistaken for completed extraction. A resumed run reuses grounded partial results and completed children. Production writes partial checkpoints separately from immutable complete checkpoints and stops preparation when substantive extraction remains incomplete.

Example: A and C extracted, B missing → retain A/C, retry B. A regression exercises a 19-call split tree and confirms all ten source units receive an attempt.

### Coverage and boundaries

Text coverage now unions multiple adjacent provision spans. Numbered openings, including bare `17.` and nested `(a)` markers, receive separate boundary checks. Validation also reports duplicate canonical citations and missing numbered boundaries.

The adapter no longer automatically extends the last model anchor to the end of its source block. Such extension could hide omitted clauses inside an earlier provision.

Example: two correctly extracted sentences can jointly cover one Docling block. Conversely, one node spanning `(a)` and `(b)` does not satisfy the requirement for both numbered boundaries.

### Pages, chunks, and parents

Requests carry physical-page and block-type metadata and up to two substantive neighboring units on each side, while retaining the hard input ceiling. This helps keep actual continuation text visible when page furniture intervenes. Omitted context remains recorded.

An unlabelled right fragment can merge with a labelled left fragment when both explicitly mark continuation, types and parents are compatible, source ranges are contiguous, and the right fragment does not begin a new numbered provision. Both page locations remain attached. Ambiguous cases stay unresolved. A separate validator flags plausible unmarked cross-page continuations for review.

Example: `Rule 8 ... after` on page 4 plus `the period expires.` on page 5 can become one source-backed provision. `(2) Keep an audit log` remains separate.

The source-ordered directory repairs hints such as `sec_9` against actual section numbers and neighboring heading boundaries. Parent spans can expand to their verified children; over-broad sections are bounded by the next distinct section heading.

### Identities and tables

`8. (1)` under Section 8 now yields `Section 8(1)`, rather than `Section 8(8)`. Unnumbered explanations are no longer parsed as subsection tokens. Explicit printed heading types take precedence; inconsistent bare numbered types can be corrected from a strong document pattern with a review warning.

Table type aliases (`table-row`, `table_row`, `tablerow`) are normalized before canonical rows are built. Removed model row identities redirect to their canonical source rows, including reference targets and children.

### Definitions and semantics

Quoted definitions are detected independently of structural kind. A definition represented as a point or paragraph can therefore be found. Repeated terms retain separate scopes; narrower applicable scopes take precedence and ties remain ambiguous. Sibling uses are allowed. Self-links are excluded. Missing scope is unresolved rather than silently assumed document-wide. Model-identified table definitions remain visible for review even without quoted-term syntax.

Semantic requests now focus on one resolved reference at a time and include full target text rather than its first 2,000 characters. Failed requests get bounded retries; successful decisions are checkpointed against source, target, model, prompt, and version. Full requests above the explicit size ceiling remain pending instead of being silently truncated. Production does not treat pending semantics as a completed stage. Reference form is retained separately when semantic meaning is added.

### Evaluation

Evidence ranking understands `first_line_exact_text` and `section`. Compact inventories retain page provenance. Deterministic positive checks cover exact section-start/page facts and matching reference edges. Generic explicit-reference expectations accept relative/procedural explicit subtypes, but that compatibility is directional; it does not equate generic references with penalties or exceptions. Old verdicts are not reused against changed evidence or evaluator behavior.

## Offline evidence

On saved run `original.pdf/af6797b1-50fd-4e63-ab6b-5106d27e4ea0`:

| Diagnostic | Saved reconstruction | Repaired replay |
|---|---:|---:|
| Duplicate canonical-row source ranges | 7 | 0 |
| References owned by canonical rows | 0 | 7 |
| Orphan paragraphs/points/subsections | 41 | 32 |
| Proposed/resolved references | 39 | 42 |

The replay also produces five deterministic semantic links, and Section 9 children have citations `9(1)` through `9(5)`. These counts are diagnostics, not legal accuracy scores. The final report is `backend/evaluation-runs/ingestion-repair-replay-2026-10-28T03-32-22-543Z/report.json`.

The second older saved run also retains unresolved structure and changed node classifications. Its raw counts should not be interpreted as an accuracy improvement. Both runs were checked using the same offline evaluator.

## Reproduction and remaining limits

Run `npm run test:kb` and `npm run lint:kb` from the repository root. The test entry point isolates workflow storage from `.env`; database tests use their own fixtures.

From `backend`, run `node --import tsx scripts/check-ingestion-repairs.ts <saved-run-directory>`. This writes a new replay directory and leaves old artifacts untouched.

Prompt/strategy versions are now v6, and reconstruction/model/validation stage versions have changed. A new extraction run is needed to regenerate source regions absent from saved model output. Old candidates cannot recreate missing Section 2 definitions or missing Section 17 merely through reconstruction.

Cross-page repair remains evidence-based: conflicting parents, absent continuation evidence, substantive intervening text, OCR loss, uncertain reading order, and unusual definition syntax can still require review. Existing table-quality checks retain uncertainty for damaged tables. External instruments and their versions remain a separate source-resolution problem. The saved replay still has unresolved regions and validation issues; a clean production legal-ingestion result has not been established.
