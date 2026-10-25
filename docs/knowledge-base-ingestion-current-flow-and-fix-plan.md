# Knowledge-base ingestion: earlier workflow and focused fix plan

> Historical snapshot: the 190,000-character recommendation below has been superseded by the small-chunk implementation. See [the implementation and evaluation note](<C:/Program Files/CookieCare/docs/knowledge-base-small-chunks-implementation-note.md>) for the current behavior. Remaining follow-up items below are not all implemented.

Reviewed against the working-tree code on 21 October 2026.

This document explains what the code currently does, where it is still weak, and the fixes to make next. It is a code review and implementation plan, not a measured accuracy report. No production code was changed while preparing it. Existing uncommitted changes were included in the reading and left untouched.

## 1. The explanation to give your senior

> We are building one shared legal knowledge base for analysis, drafting, and legal Q&A. We first preserve the PDF's extracted wording and its source locations. We then ask a replaceable structure provider—Kanon or a general LLM—to propose the document's provisions, hierarchy, and explicit references. Our own code checks those proposals against the saved source, combines results across processing chunks, and creates a document-wide graph. Interpretation, review, embeddings, and publication are separate stages. The current executable PDF flow reaches candidate structure and validation; it does not yet deliver an approved, searchable legal knowledge base.

The approach is **source-preserving extraction with a shared document index and later relationship resolution**. Mastra runs the steps in a fixed order. It is not a supervisor deciding dynamically which agents to invoke.

The important distinction is between three claims:

1. **The job completed:** all configured steps returned an output.
2. **The candidate passed engineering checks:** offsets, references, coverage, and other checks found no known issue.
3. **The legal knowledge is correct:** the wording, structure, relationships, and interpretation match the source.

The first two do not establish the third. A successful run must never be reported as a legal accuracy percentage.

## 2. What exists today

| Area | Current position |
|---|---|
| Analysis document graph | A separate implementation already builds a graph for user documents. It uses structural rules, reference patterns, and an optional LLM relationship helper. |
| KB PDF extraction | Implemented through Docling and a source map. |
| KB structure provider | Kanon and general-LLM adapters exist behind a common interface. |
| LLM input chunking | Implemented, with a 190,000-character target and 200,000-character ceiling for the counted prompt content. |
| LLM response recovery | Certain failures trigger splitting and another attempt. Successful chunks can be checkpointed. |
| Combining structure | Implemented, but this is currently limited matching and deduplication, not complete boundary repair. |
| Reference detection and resolution | Implemented using model output plus independent text patterns. Matching still has important weaknesses. |
| Tables, definitions, footnotes, recitals | Represented, but some connections are currently heuristic proposals. |
| Multi-hop context collection | Implemented for recorded outgoing references and parent context. It cannot discover missing edges or establish legal applicability by itself. |
| Legal interpretation | Contracts, helpers, and an injectable workflow exist. The production worker does not register this as a completed operational stage. |
| Embeddings and publication | Contracts and workflow components exist. Production embedding, lexical indexing, and activation dependencies are not fully wired. |
| Local PDF runner | Saves extraction and structure artifacts. Does not insert an approved publication into the KB. |

The two entry points must not be confused:

- **Local runner:** `kb-run-pdf-v1`, used by `npm run kb:run-pdf`, writes files under an evaluation-run directory. Its input schema defaults to `llm` and `glm-5.3`.
- **Queued preparation:** `kb-prepare-source-v2`, invoked by the durable worker after intake, saves versioned artifacts through the job/artifact services. Provider selection comes from the frozen job configuration. The documented environment default is Kanon; this does not establish what a particular deployed environment selected.

Read the actual run configuration to identify the provider. Do not infer it from a README or from which API keys exist.

## 3. One example used throughout this explanation

The following is **invented training text**, not a quotation or legal interpretation of the DPDP Act or Rules. It demonstrates the engineering without claiming that these are real legal requirements.

```text
PART II

Rule 8. Retention
(1) A provider must delete records after the period specified in the
    Third Schedule, unless Rule 9 applies.
(2) For this rule, "record" means an activity log.

Rule 9. Legal hold
Rule 8(1) does not require deletion while a legal hold remains in force.

Third Schedule
Category | Period  | Calculation
Standard | 30 days | Calculated under Rule 10

Rule 10. Starting date
The period starts when the account closes.
```

Assume the sentence in Rule 8(1) crosses a physical page boundary. Also assume other material makes the document large enough that Rule 8 is processed in one LLM request and the Third Schedule in another.

What we ultimately want is more than the fact that Rule 8 exists:

- The two pieces of Rule 8(1) must remain one complete provision.
- Rule 8(1) must belong to Rule 8.
- The reference to the Third Schedule must resolve to that Schedule.
- The Schedule row must retain the relationship between category, period, and calculation.
- Following the row's reference should retrieve Rule 10.
- The Rule 9 exception must not disappear.
- The definition in Rule 8(2) must apply to Rule 8, rather than automatically to the whole document.

The current code supports parts of this. It does not yet establish all these facts reliably.

## 4. Current flow, step by step

### Step 1 — Establish which PDF and configuration this run is using

The local runner checks that the file exists, has a PDF header, is within the size limit, and has a readable page count. It calculates a SHA-256 hash of the original bytes and creates a run directory and manifest.

The provider configuration records the provider, model, prompt version, strategy version, and configuration hash. These values should identify the exact processing setup.

**Example:** two runs of our training PDF with different structure models share the same PDF hash but have different processing configurations. This lets us compare their outputs against the same source.

**Output:** `original.pdf`, `stage-s1.json`, and an initial `manifest.json` in the local flow.

**Limit:** the local stage's name includes “classification,” but the checks here do not prove that a PDF is an authentic, currently applicable legal instrument. File identity and legal authority are separate questions.

### Step 2 — Docling reads the PDF

`DoclingPdfExtractor.extract()` sends the PDF to the configured Docling service. In development, if that service is not configured, it can use the local `docling.rs` pipeline. Production requires the service configuration.

The local configuration requests standard extraction, heading hierarchy, English OCR, JSON output, and placeholder images. The code pins the local package version to 1.41.0. An external service's actual version must be verified separately.

The returned document contains text items, tables, child references, and page provenance. At this point we have layout and extracted text, not a verified legal hierarchy.

**Example:** Docling might return the first part of Rule 8(1) as one text item and the continuation on the next page as another item. That is allowed. A Docling block is not guaranteed to be a complete legal paragraph.

**Output:** `docling.json`.

**Limit:** if OCR loses “unless,” later exact-text checks against Docling's output will not detect that loss by themselves. They prove consistency with extracted text, not perfect agreement with the PDF image.

### Step 3 — Build one source text and a source map

`buildSourceMap()` walks the Docling body in its supplied child order. It appends item text with a newline between items. It also visits furniture and retains previously unvisited items with warnings.

For tables, it sorts cells by row and column and appends their text while recording their cell positions. The underlying table structure remains available in the saved Docling artifact and mapped cell fields.

For each piece of text, the map records:

| Field | Meaning and reason |
|---|---|
| `start`, `end` | Positions in the combined text; `end` is exclusive. They allow exact slicing without asking an LLM to rewrite the wording. |
| `itemRef` | The original Docling item, such as `#/texts/41`. |
| `page` | Physical PDF page, or `null` when provenance is not unique. |
| `provenance` | Original location information retained from Docling. |
| `kind`, `blockType` | Whether this is text, a table cell, or another item, plus the observed item label. |
| Table fields | Row, column, row/column spans, header flag, and extraction warnings. |
| `textHash` on the map | Identifies the exact combined text used by later stages. |

Offsets use JavaScript UTF-16 positions. They are not byte offsets and not always Unicode character counts. This matters for characters represented by surrogate pairs.

**Example:** source item `src:41` contains the first part of Rule 8(1); `src:42` contains its continuation. Both have positions in one saved text even though their PDF pages differ.

**Output:** `source-map.json` and a smaller `stage-s2.json` summary.

**Limit:** retaining furniture and unreferenced items does not mean their appended order is the correct legal reading order. We must preserve their source role and avoid treating them as operative rule text merely because they are present.

### Step 4 — Choose the structure provider

Both providers must produce a common `CandidateStructure` containing segments, parent/child links, reference mentions, source spans, and warnings.

**General-LLM path:** our planner makes requests from the source map, the model returns short source anchors, and our code converts anchors into offsets.

**Kanon path:** our adapter sends the complete canonical text in one HTTP request with `overflow_strategy: "chunk"`. Chunk handling is delegated to the provider. The adapter currently has a 120-second request deadline. It checks that the returned text is unchanged and converts provider code-point offsets into our UTF-16 offsets.

**Example:** either provider should propose a Rule 8 node and a reference occurrence for “Third Schedule.” Both outputs then pass through our reconstruction and validation code.

**Limit:** “one HTTP request” does not establish that the provider processes everything in one internal model call, cannot time out, or is legally correct. This document describes the adapter code, not independently measured vendor capabilities.

### Step 5 — Choose LLM chunk boundaries

This happens **after Docling and source-map creation, but before the general LLM is called**. It is in `planStructureChunks()`.

The planner creates one source unit per source-map span. A source unit can be a text block or a table cell. It then grows each chunk by whole source units.

The measured size is:

```text
system prompt length
+ serialized response-schema length
+ serialized chunk prompt length
```

This includes source text, tuple wrappers, and JSON escaping. It is not simply 190,000 characters of legal text. It is also not a provider token calculation or a measurement of every HTTP wrapper field.

The current selection algorithm is:

1. Start at the next unassigned source unit.
2. Add complete units while the counted request stays at or below 200,000 characters.
3. Once the counted request reaches 190,000, collect possible end positions.
4. Score each possible end by examining the next unit's beginning and the current unit's ending.
5. Choose the highest-scoring end. If scores tie, choose the later end.
6. If no candidate reaches the target, use the last complete unit that fits.
7. If even one source unit cannot fit, throw an error; the planner does not safely split that oversized unit internally.

Current boundary scores are:

| Signal | Score |
|---|---:|
| End of the document | 1,000 |
| Next unit starts with Chapter, Title, Part, Section, or Annex | 500 |
| Next unit starts with `Article` and a number | 450 |
| Next unit starts with a parenthesized number such as `(12)` | 400 |
| Next unit starts with Whereas, Having regard, or HAS ADOPTED | 350 |
| Current unit ends with `.`, `!`, `?`, `;`, or `:` | 100 |
| Other boundary | 10 |

**Example:** suppose the counted sizes before possible boundaries are 191,200, 194,800, and 198,100. If 194,800 is before `Article 10`, it beats a plain sentence boundary at 198,100. These are illustrative sizes, not measurements from your PDFs.

Two important limitations:

- The planner currently does not give `Rule 8` or `Third Schedule` the explicit high scores given to `Article 8` and `Annex`.
- A `(1)` prefix might be a paragraph, not a recital. A punctuation boundary is only a clue. Neither proves that a legal provision is complete.

After choosing the core, the planner tries to add one preceding source unit and one following source unit as context. Each is added only if it fits under the ceiling. Therefore overlap is optional and can be absent. It is not a full preceding article or a guaranteed parent context window.

**Output:** `chunk-plan.json`, containing core ranges, source IDs, optional context IDs, input hashes, and measured sizes.

### Step 6 — Ask the LLM for structure, not legal interpretation

The prompt contains compact tuples:

```json
[
  ["src:41", "c", "(1) A provider must delete records after the period specified in the"],
  ["src:42", "c", "Third Schedule, unless Rule 9 applies."]
]
```

`c` means core input owned by this request. `b` and `a` mean context before and after it. The model must not emit a separate segment consisting only of context material.

The model is asked for:

- Provisions, their observed types, and their parent relationships.
- Short, exact quotes identifying source boundaries.
- Original label and title anchors.
- Explicit reference mentions and any locally identified targets.
- Flags and hints for structures that cross the chunk boundary.
- Warnings and unresolved items.

It is expressly told **not** to generate obligations, proof standards, drafting guidance, or compliance conclusions in this call.

An illustrative reference response is:

```json
{
  "mention": {
    "sourceId": "src:42",
    "exactQuote": "Third Schedule",
    "occurrence": 0
  },
  "targetSegmentIds": [],
  "targetHint": "Third Schedule",
  "resolutionStatus": "pending"
}
```

This is legitimate even if the Schedule is in another request. A model-local target ID cannot point to a segment that was not returned in that same response; the hint preserves the pending connection for later.

The DigitalOcean structure client currently requests temperature 0, a maximum completion of 16,384 tokens, and a default timeout of 600,000 milliseconds. The timeout can be overridden. For `glm-5.3`, reasoning effort defaults to `low` unless configured otherwise.

**Limit:** a 190,000-character input can need more than 16,384 output tokens if it contains many small provisions and references. Fewer input chunks do not guarantee fewer failed calls or lower total cost.

### Step 7 — Ground the returned anchors and recover from selected failures

For every anchor, `locate()`:

1. Checks that the source ID was supplied to this request.
2. Looks for the exact quote inside that source unit.
3. Selects the requested occurrence, starting from occurrence 0.
4. Converts the match into a position in the full source text.

For a segment with several source anchors, the code takes the earliest anchor start and the latest anchor end as its span. Later it obtains the text by slicing the saved source across that span.

**Example:** an anchor at the start of `src:41` and another at the end of `src:42` can identify the whole cross-page Rule 8(1). The model does not have to return the complete provision wording.

**Limit:** the schema allows a single short anchor. A quote matching the source proves that quote exists; it does not prove that the model selected the full provision boundary. A broad span can also accidentally include intervening unrelated content. Boundary validity needs additional checks.

When output is truncated, an anchor is not grounded, or selected timeout/input-size errors occur, the provider attempts to split the failed chunk. **The fallback currently divides the number of core source units roughly in half.** It does not reuse the legal boundary scoring algorithm. It tries to preserve neighbouring context and calls the two children in sequence.

Successful outputs are checkpointed. Other failures, such as general malformed JSON or many schema errors, are not automatically covered by this splitting policy. A one-unit chunk cannot be split further by this mechanism.

**Output:** successful chunk checkpoints and provider responses. The initial plan and the actual successful child chunks are different pieces of evidence; both are needed to explain what ran.

### Step 8 — Combine the successful chunk outputs

`mergeCandidates()` currently:

1. Prefixes temporary model IDs with their chunk IDs to prevent collisions.
2. Converts local parents, children, and targets to those prefixed IDs.
3. Deduplicates segments with identical kind, type, category, start, and end.
4. Redirects links from removed duplicates to retained segments.
5. Tries to resolve missing parents using an exact normalized label hint and limited container types.
6. Tries to resolve target hints using an exact normalized label match across all returned segments.
7. Carries warnings and unresolved items forward.

**Example:** Rule 8's pending `Third Schedule` hint can find a uniquely labelled Schedule produced by another chunk.

**Critical limitation:** this code does not generally combine two differently bounded fragments of the same provision. `startsBeforeChunk` and `continuesAfterChunk` preserve uncertainty; they are not themselves a stitching algorithm. A paragraph extracted as two partial spans can remain two partial spans.

Parent-hint matching is also limited. For example, it does not implement full legal-path matching for every possible article, rule, paragraph, and point parent.

Another limitation: reconstruction currently derives provision IDs partly from the candidate segment ID, which contains the chunk prefix on the LLM path. Changing chunk boundaries can therefore change candidate IDs. Evaluation should compare canonical source facts and paths, not expect those IDs to remain identical.

**Output:** `structure-candidate.json`, plus `structure-response.json` for inspection.

### Step 9 — Independently find reference wording across the complete source

`detectReferences()` scans the entire saved source text, after structure extraction. It does not scan each LLM chunk separately.

Current patterns recognize selected forms of articles, sections, rules, schedules, relative references, and external instruments. They save the exact mention and its source positions. For example, the Schedule pattern includes First through Tenth Schedule and forms such as Schedule III.

**Example:** it finds “Third Schedule” in Rule 8(1) even if the LLM omitted that reference. It can also find “Rule 10” inside the Schedule row.

**Limit:** these patterns are not a complete legal citation grammar. Some numbered subpoints, ranges, plural forms, and unusual instrument names are missed or only partly matched. They can also match labels that are headings rather than operative references.

This is an independent detector, not an independent proof that every reference was found. Both the detector and model can miss the same reference.

**Output:** `references.json`.

### Step 10 — Reconstruct provisions and resolve reference candidates

`reconstructSource()` checks that the source map, provider candidate, and detected references refer to the same text hash. It creates provision records, fills their text by slicing the source, and builds parent paths and inherited parent IDs.

For each reference occurrence it:

1. Chooses the smallest provision span containing the mention as its source owner.
2. Collects model-supplied targets.
3. Searches provision labels and first lines using normalized text matching.
4. Tries supported relative-reference and numeric-range handling.
5. Combines candidate targets and assigns a draft status.

The main statuses are `proposed`, `unresolved`, `ambiguous`, and `external_unavailable`. They are not approval states.

**Example:** if exactly one Schedule matches “Third Schedule,” the relationship can become `proposed`. If two candidate targets remain, it should be ambiguous.

Current weaknesses worth fixing immediately:

- Some target and relative-label comparisons use substring matching. `Rule 8` can collide with `Rule 80`, and a relative token `1` can collide with `10`.
- When model and detector occurrences are merged, candidate target lists are combined without consistently recalculating the final ambiguity state.
- A complete numeric range can legitimately have several target IDs, but validation still expects a singular target ID.
- Uncovered text is computed from provision spans. A large parent can cover the wording even if its required child nodes were never extracted. Coverage is not child-structure completeness.

**Output:** `reconstruction.json`.

### Step 11 — Build the document model

`buildDocumentModel()` adds views of the reconstructed graph:

| Component | Current calculation | Example and limitation |
|---|---|---|
| Directory | Provision IDs, labels, types, paths, parents, and offsets | Finds Rule 8 anywhere in the document. Quality still depends on extracted structure. |
| Tables | Groups source cells by a containing table/schedule/annex where possible; combines cells by row and column | Preserves the Schedule's cells, but separate tables under one Schedule can be incorrectly combined if coordinates restart. |
| Footnotes | Proposes the preceding provision by source position | A nearby provision may not be the one indicated by the footnote marker. |
| Definition scope | Uses the definition node's structural parent, otherwise document scope | “For this rule” requires a wording-based scope decision, not merely a parent assignment. |
| Recital candidates | Proposes pairs sharing at least three selected words | This is candidate discovery, not verified interpretation. |
| Context manifests | Traverses parent context and recorded outgoing reference targets | Collects linked material; it does not prove the links or their applicability. |

**Output:** `document-model.json`; `stage-s3.json` is a summary and directory, not the complete graph evidence.

### Step 12 — Collect multi-hop context

For each provision the document model starts a queue with that provision and its inherited parents. It adds accepted-for-traversal draft targets of outgoing references, checks visited IDs, and records unavailable or unresolved dependencies and character-limit omissions.

The current document-model context budget defaults to 190,000 characters. This is a **separate budget** from the structure request target; it counts selected provision text, not the same assembled request fields.

**Example:** starting from Rule 8(1), the traversal may collect the Third Schedule and then Rule 10 if the Schedule reference is owned by a selected node. It also follows the recorded Rule 9 reference.

There is an important ownership gap: if the Rule 10 reference belongs to a separate table-row child node, selecting only the Schedule parent does not automatically traverse all child-owned edges. The text may contain the row, while traversal still misses the row's outgoing reference.

Additional limits:

- Relevant incoming exception/definition relationships are not generally traversed.
- Parent and child text can overlap, causing duplicated prompt text and inflated budget use.
- The candidate manifest and the later accepted-context helper are separate implementations and can drift.
- A manifest's `complete` flag only concerns dependencies the implementation considered. It does not prove there are no missing legal relationships.

The accepted-context helper separately supports approved revisions, a depth limit, and fail-or-report behavior on context limits. That does not mean the full interpretation workflow is deployed.

### Step 13 — Validate and save a candidate result

`validateReconstruction()` checks page mapping, source spans, exact reconstructed wording, parent containment, hierarchy cycles, uncovered wording, reference states, table issues, and recorded context omissions.

**Example:** if the reconstructed Rule 8 text differs from the saved source slice, validation catches it. If Rule 8's parent does not contain its span, validation catches that too.

What it cannot prove:

- That OCR read every original word correctly.
- That every expected child provision or explicit reference exists.
- That a unique target is the correct legal target.
- That an inferred definition, recital, or exception link is legally correct.

The result is `candidate_ready` or `needs_review`. Neither means approved for production legal answers.

The local runner currently ends here and saves the run bundle. It does not execute all interpretation, embedding, retrieval, and module evaluation layers.

**Important current defect:** the generic runner still writes a GDPR dataset ID, selected GDPR case IDs, and a fixed page subset into `run-results.json`. It also writes estimated cost as zero when no actual costing was performed. That makes its evaluation metadata misleading for a DPDPA run and must be corrected before relying on its reports.

### Step 14 — What happens later, once the remaining stages are wired

The intended continuation is:

1. Review or otherwise establish accepted source structure and relationships.
2. Assemble the required context for a provision.
3. Ask an interpretation provider for legal meaning and module guidance, citing supporting source passages.
4. Validate the exact support and review the proposed interpretation.
5. Build purpose-specific search text from approved records.
6. Send that search text to an embedding model and store the returned vectors with model, dimensions, input hash, record revision, and purpose.
7. Verify lexical and dense index coverage and activate an approved publication.

**Example:** the approved Rule 8 search entry helps retrieve the requirement. A separate investigation query/profile helps analysis find evidence in a user's agreement. Those are different retrieval tasks. A vector is generated by the embedding model; it is not hidden inside the structure JSON.

These are intended downstream operations supported by components, not stages completed by the current local PDF runner.

## 5. Graph, tree, JSON, and embeddings: what each means here

```text
Tree:
  Part II
    Rule 8
      Paragraph 1
      Paragraph 2

Additional graph connections:
  Rule 8(1) --explicit reference--> Third Schedule
  Schedule row --explicit reference--> Rule 10
  Rule 8(1) --explicit reference--> Rule 9

Separate interpretation to verify:
  Rule 9 --exception affecting--> Rule 8(1)
  Rule 8(2) --defines a term within--> Rule 8
```

The tree describes membership. The wider graph describes relationships between passages. JSON is the saved representation, not an alternative to a graph. PostgreSQL can store the same graph using provision and relationship tables.

An explicit citation edge and an interpreted legal effect are different records or different clearly identified stages of a record. Finding “Rule 9” does not itself establish the direction and scope of its exception.

Embeddings help retrieve related text. They do not replace explicit source positions, document identity, or verified relationship records.

## 6. Focused implementation plan

### Scope

Keep the fixed Mastra workflow, source-map design, provider interface, PostgreSQL direction, and 190,000-character target. Fix concrete correctness and reporting problems before replacing components.

The first batch below is a bounded hardening effort. Full boundary repair and semantic relation extraction are larger follow-up tasks and are listed separately. Calling those “minor fixes” would underestimate the work.

### Batch A — Small fixes, in implementation order

| Order | Change | Files/functions to start from | Acceptance check |
|---|---|---|---|
| A1 | Make local run metadata document-neutral. Accept an explicit dataset binding or leave it absent; remove hardcoded GDPR cases/page selection from generic export. Represent unknown cost as `null`, not zero. Resolve provider-specific model defaults and record actual configuration. | `run-pdf-workflow.ts`, CLI argument handling, `run-pdf.test.ts` | A DPDPA run has no implicit GDPR identity. Kanon is not assigned a GLM default model. Unknown cost is distinguishable from a free call. |
| A2 | Do not save an LLM chunk plan as though Kanon used it. Store `provider_managed` planning metadata for Kanon; keep any hypothetical LLM plan explicitly separate. | `run-pdf-workflow.ts` fallback after provider extraction | A Kanon run's artifacts describe the request strategy actually used. |
| A3 | Verify chunk checkpoint identity before reuse: source text hash, input hash, configuration hash, prompt/strategy version, and schema. Record the successful split tree and failed attempts. | `llm-structure.ts`, local checkpoint loader; audit queued checkpoint handling too | Changing prompt, model, source, or chunk boundaries cannot reuse an old local result. Identical inputs can resume. |
| A4 | Replace substring citation matching for supported forms with parsed kind/number/subpoint paths. Keep unsupported forms unresolved. | `targetCandidates()`, `relativeTargets()`, `reference-detection.ts` | Rule 8 never resolves to Rule 80; point (1) never resolves merely because a label contains 1. Nested paths and relative scopes are tested. |
| A5 | Recompute reference status after combining model and detector candidates. Preserve disagreements and external identity; do not silently promote one target when several survive. | `reconstructSource()` / `addRelationship()` | Two detectors proposing different targets result in explicit ambiguity. Repeated agreement produces one occurrence with both detector labels. |
| A6 | Validate range references using the plural target set and unique expected labels. Check that all endpoints and intermediate targets exist; do not require a singular target for a valid range. | `referencedRange()`, `validateReconstruction()` | A complete Articles 4–6 range passes the range check; missing Article 5 or duplicate Article 4 does not. |
| A7 | Explicitly report cross-chunk boundaries that have not been reconciled. Carry unresolved provider items and semantic-review warnings into the final validation outcome. | `llm-structure.ts`, `reconstruct.ts`, `validate-reconstruction.ts` | A flagged partial paragraph cannot be reported as candidate-ready merely because its text has source locations. |
| A8 | Extend boundary scoring to supported Rule/Section/Schedule forms, with examples from the pilot corpus. Use the same scoring near a balanced fallback split. Preserve the 190k target and 200k ceiling; allow earlier cuts when output risk or continuity requires it. | `structure-chunk-plan.ts` | Rule and Schedule boundaries are preferred over arbitrary block-count splits. A fixture crossing a page/chunk retains source ownership and reports any unfinished continuation. |
| A9 | Preserve distinct source-table identities. Do not concatenate cells from different table items simply because row/column coordinates and Schedule owner match. Only mark a continuation after supporting evidence, otherwise retain separate tables for review. | `buildTables()` in `document-model.ts` | Two tables under one Schedule remain separate; repeated coordinates cannot join unrelated periods or categories. |
| A10 | Mark positional footnote attachments and structural-parent definition scopes as heuristic, unverified candidates. Surface them in validation/review. Keep shared-word recital links review-required. | `document-model.ts`, related contracts and validator | The output cannot imply that proximity or shared words proved a legal connection. Supporting evidence and review reason are visible. |
| A11 | Report traversal bookkeeping separately from legal completeness. Record missing target IDs, selected paths, and budget omissions. Deduplicate already included nodes without calling every repeated visit a cycle. | `buildManifest()`, `context-assembly.ts` | A shared target reached through two paths is not a missing dependency. A real missing target is never silently skipped. |
| A12 | Make run reporting honest about failures and usage. Record every attempted call where usage is available, including discarded/split calls; otherwise label totals partial. Mark failures from every stage, not only the structure call. | `llm-structure.ts`, `do-structure.ts`, `run-pdf-workflow.ts` | A later reconstruction failure cannot leave a manifest appearing successfully complete. Token totals state whether failed-call usage is included. |

For A3, local checkpoints currently load by chunk filename and are accepted by the provider without a comparison at that boundary. The queued path has separate stage/configuration hashing; do not remove that protection or assume it has the same weakness without inspecting it.

For A8, the target remains a preference, not a requirement to send 190k characters to every call. A dense legal table can require a smaller request because output size and boundary safety matter too.

### Batch B — Necessary follow-ups that are not minor patches

| Work | Concrete implementation requirement | Why it is larger |
|---|---|---|
| B1. Repair cross-chunk structures | A dedicated reconciliation step compares neighbouring fragments using original offsets, heading/path hints, and boundary context. Join only supported continuations. Store the join evidence; keep uncertain fragments unresolved. Preserve source fragments if canonical ordering places unrelated content between them. | Deduplicating equal spans does not solve fragmented provisions or spanning parents. This needs its own input/output contract and fixtures. |
| B2. Stabilize identities | Separate temporary provider/chunk IDs from durable legal provision identity. Use instrument/version plus a verified legal path where available; preserve extraction-run IDs and explicit redirects. Do not assume offsets stay stable across re-extraction or document revisions. | Existing records, relationships, and evaluation adapters may depend on IDs. |
| B3. Build correct context packages | Follow outgoing references, relevant typed incoming modifiers, and descendant-owned references within a selected provision's scope. Include verified definitions, table headers/rows, and footnotes. Pin exact revisions; deduplicate overlapping text ranges. | Blindly adding all incoming edges or all descendants can flood context or introduce unrelated law. Relationship types and scope must be explicit. |
| B4. Verify legal effects | Give a focused model call the source, target, parent wording, and relevant definitions. Ask separately whether the passage defines, limits, excepts, or overrides another provision, and require quoted support. Preserve conditions and alternatives. | A citation resolver cannot establish legal effect. This needs interpretation evaluation and review. |
| B5. Verify implicit connections | Retrieve recital/definition candidates across the whole source, then check candidate pairs with context. Use explicit textual scope for definitions and marker evidence for footnotes. | Shared words and position are insufficient, but replacing them requires more than a regex change. |
| B6. Handle missing or external evidence | Represent external instrument/version requirements and source extraction doubts. Route unresolved sources to review or another extraction attempt; never invent a replacement passage. | Correctness depends on obtaining and identifying material outside the current candidate graph. |

Do A1–A7 before trusting provider comparisons. Complete A8–A12 before describing the current run as hardened. Start B1 and B3 before claiming that the pipeline reliably handles cross-chunk, multi-hop legal context.

### Regression checks to add alongside the fixes

Use existing test files where practical: `structure-providers.test.ts`, `source-extraction.test.ts`, `document-model.test.ts`, `interpretation.test.ts`, and `run-pdf.test.ts`.

| Fixture | Required observation |
|---|---|
| Rule text split between pages | Exact wording and source fragments retained; no false completeness when the boundary remains unresolved. |
| Same document with different forced chunk boundaries | Same verified legal paths, provision text, and relationship targets after adapter normalization; temporary IDs may differ until B2. |
| Rule 8 and Rule 80 | No substring collision. |
| Paragraph (1) and paragraph (10) | Relative references resolve within the correct parent and exact label. |
| Range with a missing middle provision | Missing member identified; not counted complete by duplicate targets. |
| Two detectors disagree | Ambiguous result with both candidates retained. |
| Two tables in one Schedule | No cell concatenation across distinct tables. |
| A → B → C with the B → C edge on a child row | Context includes the dependency or explicitly reports the unsupported scope until B3. |
| Exception E → A | B3 includes the relevant incoming modifier without importing every incoming citation. |
| Scoped definition and footnote marker | Heuristic guesses remain unverified until evidence supports them. |
| Unknown heading or external law | Preserved as unknown/unavailable; not silently forced into a familiar rule. |
| Changed configuration with an existing checkpoint | Cache rejected. |
| Truncated output and malformed JSON | Typed failure and saved attempt; only configured recoveries occur. |
| DPDPA local run | No GDPR case IDs or source-specific page selections are inserted automatically. |

These tests check code behavior. For legal accuracy, use reviewed source-backed expected graphs, including all required nodes and edges within each selected scope. Keep expected answers out of the extraction prompt. Inspect a sample of passes as well as failures.

Run the provider comparison from the same frozen Docling/source-map artifacts. That isolates structure-provider differences from PDF extraction differences. Run a separate end-to-end check when Docling or source-map code changes.

Do not claim improvement from one overall number. Report at least source completeness, hierarchy correctness, reference detection, target resolution, context coverage, unresolved cases, and interpretation correctness separately. This plan does not set a new accuracy percentage without measured evidence.

## 7. Answers to likely follow-up questions

**Why not ask one LLM to return the whole document?**

The source can fit the input budget while its structured output exceeds the completion budget. Exact source anchors reduce output size, but many provisions and references can still need multiple calls.

**Does keeping a Docling block intact mean keeping a legal clause intact?**

No. One clause can span several blocks or pages. One block can also contain several legal units. Complete-block splitting is a useful constraint, not a complete legal-boundary solution.

**Where are relationships found after chunking?**

Mention extraction happens in model calls and a separate full-source scan. Target matching happens against the combined document candidates. Legal-effect interpretation needs a later call with both passages and their relevant context.

**Have we already built complete cross-chunk reconciliation?**

No. We have exact-span deduplication, ID remapping, label-hint matching, and flags. General continuation repair and robust parent reconstruction still need work.

**Can the graph prove that we have found every relationship?**

No. It represents recorded relationships. Completeness requires comparison with reviewed examples and explicit handling of unresolved material.

**Are we using Docling Graph?**

The reviewed flow uses Docling extraction plus our provider/reconstruction/document-model code. It is not the same as integrating the separate Docling Graph project.

**Is JSON the reason relationships are weak?**

No. The weak points are extraction, matching, scope, and interpretation. Moving the same incorrect edges into a graph database does not correct them.

**What does Mastra contribute?**

Fixed execution order, workflow inputs/outputs, and integration with run persistence. The durable worker and artifact/checkpoint services provide additional recovery behavior. Mastra itself does not decide whether a legal paragraph or relationship is correct.

**Can we now use these outputs as the compliance source of truth?**

They are candidate extraction outputs. The remaining interpretation, approval, indexing, and publication gates must be completed before they become the approved source used by all modules.

## 8. Code reading map

The following paths identify the implementation reviewed for this document. Function names in the walkthrough make it easier to find the relevant code even if line numbers change.

| Responsibility | Source |
|---|---|
| Local fixed PDF workflow and artifact export | [run-pdf-workflow.ts](<C:/Program Files/CookieCare/backend/src/mastra/knowledge-base/ingestion/workflows/run-pdf-workflow.ts>) |
| Queued source preparation | [prepare-source-workflow.ts](<C:/Program Files/CookieCare/backend/src/mastra/knowledge-base/ingestion/workflows/prepare-source-workflow.ts>) |
| Worker workflow registration | [runtime.ts](<C:/Program Files/CookieCare/backend/src/mastra/knowledge-base/ingestion/runtime.ts>) |
| PDF extraction | [docling-pdf.ts](<C:/Program Files/CookieCare/backend/src/mastra/knowledge-base/ingestion/extraction/docling-pdf.ts>) |
| Canonical text and provenance | [source-map.ts](<C:/Program Files/CookieCare/backend/src/mastra/knowledge-base/ingestion/extraction/source-map.ts>) |
| Provider contracts and character limits | [structure-provider.ts](<C:/Program Files/CookieCare/backend/src/mastra/knowledge-base/ingestion/extraction/structure-provider.ts>) |
| Initial and fallback chunking | [structure-chunk-plan.ts](<C:/Program Files/CookieCare/backend/src/mastra/knowledge-base/ingestion/extraction/structure-chunk-plan.ts>) |
| LLM schema, prompt, grounding, merging, checkpoint reuse | [llm-structure.ts](<C:/Program Files/CookieCare/backend/src/mastra/knowledge-base/ingestion/extraction/llm-structure.ts>) |
| LLM completion budget and timeout | [do-structure.ts](<C:/Program Files/CookieCare/backend/src/mastra/knowledge-base/ingestion/extraction/do-structure.ts>) |
| Kanon adapter and offset conversion | [kanon.ts](<C:/Program Files/CookieCare/backend/src/mastra/knowledge-base/ingestion/extraction/kanon.ts>) |
| Independent reference patterns | [reference-detection.ts](<C:/Program Files/CookieCare/backend/src/mastra/knowledge-base/ingestion/extraction/reference-detection.ts>) |
| Provision reconstruction and target matching | [reconstruct.ts](<C:/Program Files/CookieCare/backend/src/mastra/knowledge-base/ingestion/extraction/reconstruct.ts>) |
| Tables, heuristic links, and candidate context traversal | [document-model.ts](<C:/Program Files/CookieCare/backend/src/mastra/knowledge-base/ingestion/extraction/document-model.ts>) |
| Candidate validation | [validate-reconstruction.ts](<C:/Program Files/CookieCare/backend/src/mastra/knowledge-base/ingestion/extraction/validate-reconstruction.ts>) |
| Later accepted-context assembly | [context-assembly.ts](<C:/Program Files/CookieCare/backend/src/mastra/knowledge-base/ingestion/interpretation/context-assembly.ts>) |

