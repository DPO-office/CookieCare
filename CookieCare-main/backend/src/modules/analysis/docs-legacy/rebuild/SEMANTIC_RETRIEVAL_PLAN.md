# Semantic Retrieval for INVESTIGATE — Architecture & Phase Plan

> Status: proposed · Author: design pass 2026-08-31 · Owner: analysis module
> Prereq reading: `ACT_AND_PLAN_REDESIGN_RESEARCH.md` §2.1 (the four ACT stages),
> `IMPLEMENTATION_PHASE_PLAN.md` (phase-gate working style this doc continues).

---

## 0. The problem, in one paragraph

INVESTIGATE currently finds candidate evidence with **lexical keyword-overlap
scoring plus hand-coded per-concept regex** (`scoreEvidenceItem`,
`scoreClauseForPackage`, `DURATION_SIGNALS`, `RETENTION_NOISE`). Keyword overlap
cannot bridge the vocabulary gap between a requirement (*"duration of
processing"*) and the clause that actually satisfies it (*"upon termination of
the Agreement … securely delete"*) — they share no content tokens. Worse, the
regex heuristics **actively demote** the correct clause (`if (retentionHits >
durationHits) score -= 50`). So VERIFY — which only ever sees the survivors —
correctly reports "these are termination clauses, not duration"; VERIFY is
doing its job, it is being handed the wrong evidence. This is a **recall
ceiling** problem in the retrieval substrate, not a reasoning problem.

## 1. Principle (do not violate)

1. **Retrieval widens recall. VERIFY is the only precision gate.** INVESTIGATE's
   job is "don't miss the right passage." It must never make the final
   proves/gap call — that is VERIFY's, over the actual passage text.
2. **General purpose is the whole point.** The retriever takes
   `(queryText, cluasePool) → rankedClauses` and contains **zero**
   topic-specific code. No `duration`, no `Art28`, no clause-type special-cases.
   If a change would need a new `if (topic === …)`, it is wrong. This is the
   line that makes the investment worth it: today every new topic needs new
   regex; after this, no topic needs any code.
3. **Retrieval quality and VERIFY cost are the same lever.** Good retrieval puts
   the right clause at rank 1–3, so VERIFY checks ~3 candidates instead of ~10 —
   faster *and* more accurate at once. This is why this work also relieves the
   ~10-minute VERIFY wall-clock.

## 2. Locked design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Retrieval kind | **Hybrid**: dense (embeddings) + lexical (existing scorer), fused | Dense bridges vocabulary gap; lexical nails exact identifiers (defined terms, "Section 3.8", "Article 28") that dense misses |
| Fusion | **Reciprocal Rank Fusion (RRF)**, `1/(k+rank)`, k=60 | Already implemented in `RAG/ragService.ts`; reuse it |
| Fusion weight | Start **~50/50** dense/lexical, tune on golden cases | Legal has many exact-term matches; `ragService`'s 0.7/0.3 under-weights lexical |
| Embed unit | **Clause / sub-clause level** (never fixed-size chunks) | We already have clause-aware segmentation — do not re-cut clauses |
| Embed text (hot path) | **`[heading path · clause type] + text`**, no LLM | Fast (2–5s/doc), clause types are already semantic (`deletion_on_termination`) |
| Embed text (persist path) | **Batched, adaptive LLM gloss** (background) | ~35–50% fewer misses on ambiguous clauses; batched keeps cost ~1 min, off the hot path |
| Query text | The requirement's **authored `proofStandard`** (or PLAN hypothesis, or user follow-up) | Already describes the *shape* of proof incl. termination-triggered duration — the perfect semantic query, already authored |
| Context expansion | **Parent-document retrieval** — retrieve sub-clause, hand VERIFY the full parent clause + referenced defined terms | Reuse `expandSharedEvidenceItem`; protects clause integrity |
| Embedding lifecycle | **In-memory per analysis run + persist to pgvector async** | Analysis never waits on a cold index; follow-ups hit the warm store |
| Provider | **Gemini `gemini-embedding-001`** (native 768-dim) | Same `@google/genai` client + key already in use; matches `legal_document_chunks.embedding vector(768)` |
| Rate limit | Embeddings get a **separate scheduler lane**; raise generation window with the new key | Embedding quota ≫ Pro generation quota — no reason to share the `REQUESTS_PER_WINDOW=3` budget |
| Rollout | Behind a **feature flag**, lexical remains the fallback | Zero-risk; matches the `ANALYSIS_DISABLE_VERIFY` kill-switch pattern |

## 3. Data flow

```
UPLOAD / PARSE
  └─ extract_clauses → ClauseObject[]            (already synchronous, fast)
        ├─ (background) embed clauses → pgvector legal_document_chunks   ── for FOLLOW-UPS
        │      └─ (background) batched adaptive gloss → richer embeddings
        └─ analysis run starts …

ANALYSIS RUN  (ACT / INVESTIGATE)
  1. build clause pool (existing extract_shared_evidence)
  2. embed clause pool IN-MEMORY  (heading+type+text)   [overlaps PLAN thinking]
  3. per requirement:
       queryText = proofStandard | hypothesis | follow-up question
       dense  = cosine(embed(queryText), clause embeddings)   → top 20
       lexical= scoreEvidenceItem (existing)                  → top 20
       fused  = RRF(dense, lexical)                           → top 10
       (optional) rerank                                      → top N
       parent-expand fused clauses
  4. hand candidates to VERIFY   (verify-proposition.ts — UNCHANGED)

FALLBACK (index cold / embeddings unavailable)
  → lexical-only recall (today's path). Never blocks.
```

## 4. Component specs (where each piece lives)

### 4.1 Embedding primitive — `src/llm`
- Add `executeEmbedding(texts: string[], opts?) : Promise<(number[] | null)[]>`
  in `src/llm/index.ts`, routed to a new `GeminiProvider.embed()` using the
  existing `this.client.models.embedContent({ model: "text-embedding-004",
  contents })`. Batch input; return `null` per item on failure so callers
  degrade gracefully (same contract as `ragService.embedText`).
- Runs through a **dedicated scheduler lane** (see §4.5), not the generation lane.
- Replace `RAG/ragService.ts:embedText()`'s `return null` stub with a call to
  this primitive, so chat/RAG *and* analysis share one embedding path.

### 4.2 Clause embedding index — `capabilities/act/clause-index.ts` (new)
- `buildInMemoryIndex(clauses | SharedEvidenceItem[]) : ClauseIndex` — embeds
  `[structuralPath · clauseType] + text` for each item, holds vectors in memory
  for the run. No persistence on this path.
- `persistClauseEmbeddings(fileId, userId, clauses)` — background writer to
  `legal_document_chunks` (metadata JSONB carries `structuralPath`, `clauseType`,
  `charRange`). Idempotent; skips already-indexed files (mirror
  `reindexUnchunkedDocuments`).
- 768-dim, matches the column. No schema migration required.

### 4.3 Hybrid retriever — `capabilities/act/retrieve-candidates.ts` (new, GENERIC)
- `retrieveCandidates({ queryText, pool, index, cap }) : SharedEvidenceItem[]`
  - dense: cosine(queryEmbedding, index) → ranked
  - lexical: `scoreEvidenceItem(item, hints)` (reuse existing) → ranked
  - fuse: `rrf(dense, lexical, { k: 60, denseWeight, lexWeight })`
  - slice `cap`
- **Contains no topic-specific logic.** `queryText` is opaque. This is the file
  that must stay general-purpose forever.

### 4.4 Wiring into INVESTIGATE — `isolate-requirement-evidence.ts` + `evaluate-package.ts`
- `resolveRecallCandidates(...)` gains an optional `index` + `queryText` and
  delegates to `retrieveCandidates` when the flag is on; falls back to today's
  pure-lexical sort when off or index absent. **Signature-compatible.**
- In `evaluateWithVerify`, `queryText = proofStandard` (already in scope as
  `profile.proofStandard`). For the grouped/open path, `queryText = hypothesis`.
- Everything downstream of candidate selection is untouched.

### 4.5 Scheduler / rate limits — `modules/compare/utils/llm-scheduler.ts` + `.env`
- Give embeddings a **separate lane** (own in-flight + window counters) so a
  burst of 400 clause embeddings never starves generation and vice-versa.
- With the new key, raise generation throughput. Suggested starting `.env`:
  ```
  GEMINI_REQUESTS_PER_WINDOW=10      # was 3 — new key headroom
  GEMINI_MAX_IN_FLIGHT=2             # was 1
  # embeddings — separate, generous lane
  GEMINI_EMBED_REQUESTS_PER_WINDOW=60
  GEMINI_EMBED_MAX_IN_FLIGHT=4
  GEMINI_EMBED_BATCH_SIZE=64         # texts per embedContent call
  ```
  Tune against the new key's actual published limits; keep the 429 backoff in
  `executeWithRetry`/scheduler as the safety net.

### 4.6 Background gloss (persist path only) — `capabilities/act/clause-gloss.ts` (new)
- One batched call glosses ~30 clauses → `{clauseId, gloss}[]` (one line each:
  "what this clause establishes"). Adaptive: only clauses over a length/complexity
  threshold; short clauses keep heading+type+text.
- Runs in the background persist job; the glossed text is what gets embedded into
  `legal_document_chunks` for follow-ups. **Never on the analysis hot path.**

### 4.7 Follow-up path
- Follow-up questions embed the user's question as `queryText` and query the
  **persisted** (glossed) index — no re-embedding of the doc.
- Slots directly into existing follow-up triage: "one narrow new proposition" →
  embed → retrieve → VERIFY just it.

## 5. Phase plan (each phase ships behind the flag, own exit gate)

**R0 — Embedding primitive + lanes.** `executeEmbedding` in `src/llm`, embed
scheduler lane, `.env` limits, un-stub `ragService.embedText`.
*Exit:* a unit test embeds 3 strings and gets 3× 768-dim vectors; cosine of
"delete on termination" vs "how long processing lasts" > cosine vs an unrelated
clause.

**R1 — In-memory index + hybrid retriever (dark).** `clause-index.ts`,
`retrieve-candidates.ts`, RRF. Not yet wired into the live path — invoked only
in a test harness.
*Exit:* on the Mastercard DPA fixture, `retrieveCandidates` for the duration
proofStandard returns the termination/deletion clause (E1/E8 equivalents) in the
top 3. Prove it beats today's lexical rank for the same query.

**R2 — Wire into INVESTIGATE (flag on in dev).** `resolveRecallCandidates`
delegates to the retriever; `queryText = proofStandard`.
*Exit:* full ACT run on the DPA — Duration, Nature & Purpose, and Data-subject
categories now receive on-topic candidates; VERIFY verdicts change from
"insufficient" to a real proves/gap where the document supports it. No regression
on the NDA golden cases (`return_or_destruction` still resolves).

**R3 — Retire the regex heuristics.** Delete `DURATION_SIGNALS`,
`RETENTION_NOISE`, `isRetentionOnly`, the duration/confidentiality/deletion
branches in `classifyEvidenceRole`/`scoreEvidenceItem`. Lexical becomes a plain
BM25-style term scorer (one arm of the fusion).
*Exit:* golden cases still pass with the heuristics gone — proving recall now
comes from embeddings, not hand-tuning. This is the "general purpose" gate.

**R4 — Persist + background gloss (follow-ups).** `persistClauseEmbeddings`,
`clause-gloss.ts`, follow-up query path.
*Exit:* upload → embeddings appear in `legal_document_chunks`; a follow-up
question retrieves from the store without re-embedding; gloss job completes in
~1 min for a 100-page doc.

**R5 — Reranking (optional).** Cross-encoder or LLM-as-reranker over fused top-20.
*Exit:* measurable precision@5 lift on the golden set; skip if R2–R3 already pass.

## 6. General-purpose acceptance set (must all pass, no per-case code)

1. **DPA / Duration** → retrieves termination/deletion clause (the reported bug).
2. **DPA / Nature & Purpose** → retrieves the processing-purpose clause, not the
   security clauses it wrongly got.
3. **DPA / Data-subject categories** → retrieves the Personal Data definition
   enumerating categories, not Business-Purpose boilerplate.
4. **NDA / return_or_destruction** → still resolves (no regression from prior work).
5. **Open follow-up with NO authored proofStandard** (e.g. "can we object to a
   subprocessor change?") → query = the question itself; retrieves the
   subprocessor-objection clause.
6. **A different regime / doc-type** (pick one non-GDPR skill) → retrieval works
   with zero new code, proving generality.

If any case needs a topic-specific tweak to pass, the design has regressed to the
thing we are replacing — stop and fix the retriever, not the case.

## 7. Risks & rollback

- **Flag off = today's behavior**, byte-for-byte. Lexical path is never deleted
  until R3, and even then remains as the fusion's lexical arm + cold-index
  fallback.
- **Index cold / embeddings 429 / provider down** → `executeEmbedding` returns
  nulls → retriever falls back to lexical. Analysis never blocks or errors.
- **Cost**: embeddings are cheap (~$0.02 / 1M tokens class); the gloss is the
  only LLM spend and it is batched + background + adaptive.
- **Rate limits**: separate embedding lane + conservative starting windows +
  existing 429 backoff. Raise only against the new key's published limits.

## 8. Config summary (`.env`)

```
# raise generation throughput (new key)
GEMINI_REQUESTS_PER_WINDOW=10
GEMINI_MAX_IN_FLIGHT=2

# embeddings — separate lane
GEMINI_EMBED_REQUESTS_PER_WINDOW=60
GEMINI_EMBED_MAX_IN_FLIGHT=4
GEMINI_EMBED_BATCH_SIZE=64

# retrieval feature flag (off = pure lexical, today's behavior)
ANALYSIS_SEMANTIC_RETRIEVAL=1
```

---

### One-line summary
Swap INVESTIGATE's lexical-only keyword scorer for **hybrid dense+lexical
retrieval keyed on the proofStandards you already authored**, embed at the
**clause level in-memory (fast) + persisted-with-gloss (follow-ups)**, keep
**VERIFY as the unchanged precision gate**, and **delete the per-concept
regex** — which is what makes the whole thing general-purpose instead of another
pile of topic-specific hacks.
