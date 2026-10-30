# Ingestion repairs ? 30 October 2026

## Implemented

1. Preserve Docling numbering markers, enumeration and heading metadata in source spans and chunk prompts without changing canonical text offsets. Markers inform identity; quotes must still come from source text.
2. Repair source-backed section identities, child numbering and parent boundaries; normalize structural type aliases; unify overlapping definition/numbered fragments. Empty quarantined extraction stays incomplete. Bare numbering recovery requires an established document convention.
3. Share citation parsing/resolution between reconstruction and semantic discovery. Split coordinated targets, retain nested addresses, and prevent explicit external-law citations from resolving to similarly numbered local provisions.
4. Include orphan substantive units in semantic discovery. Ground whitespace-normalized quotes back to exact source offsets. Preserve specific meanings over generic references; conflicting kinds require review. Record accepted, rejected and unresolved proposals by discovery unit.
5. Preserve ancestor wording and relationship conditions in retrieval contexts. Ordinary graph cycles terminate traversal without creating false missing-context failures. Conflicted semantic edges do not drive retrieval or become active Neo4j legal relationships.
6. Supply complete saved graph facts to evaluation, independently of evaluation scope. Use deterministic structural checks and focused source/edge/context packets for semantic checks. Missing evidence remains review-required. Resume-from-step-6 rebuilds source metadata and reconstruction from frozen extraction rather than reusing stale enriched relations.

Structure prompt/strategy and semantic/evaluator versions were advanced so incompatible cached results are not silently reused. Migration 007 adds the persisted condition field and definition relation vocabulary; local migration tests include it.

## Verification

- `npm run lint:kb`: passed.
- Local ingestion test suite: 164 passed, 0 failed. Model calls in tests use mocks.
- Frozen extraction replay: `backend/evaluation-runs/ingestion-repair-replay-2026-10-30T07-29-10-092Z/report.json`.
- Original run: `DPDPA-2023 Act.pdf/dpdpa-relations-20261029-01`.

| Diagnostic | Saved run | Offline reconstruction |
| --- | ---: | ---: |
| Confirmed section starts/pages | 18/44 | 44/44 |
| Orphan subsection/point/paragraph nodes | 64 | 3 |
| Ambiguous references | 12 | 3 |
| Unresolved references | 141 | 37 |
| Uncovered text characters | 1,068 | 140 |

These are diagnostics, not evaluation accuracy. The original graph includes model-discovered relations; this replay performs deterministic reconstruction and enrichment only, so relationship totals are not directly equivalent. No paid ingestion or judge calls were made and the original run was preserved.

## Remaining limits

The replay still reports 622 validation issues, including 23 parent-containment issues, 55 unreconciled boundaries, 2 duplicate citations and 355 incomplete contexts. These categories include unavailable external sources and provisional heuristics; they are not 622 independent legal errors. Frozen extraction cannot restore missing model output. Novel numbering conventions, ambiguous identities and genuinely conflicting interpretations still require review. Conditions are preserved but cannot establish real-world facts such as whether a notification was issued.

Run a fresh pipeline into a new run directory to test updated extraction prompts, then score all cases against that same new output. A step-6 resume tests reconstruction and semantics against old extraction; it cannot validate the updated structure prompt. Compare per-check outcomes and review counts, not only overall percentages. Import the new run into Neo4j after reviewing its saved artifacts.

## Repeat the free diagnostic replay

From `C:\Program Files\CookieCare\backend`:

```powershell
node --import tsx scripts/check-ingestion-repairs.ts `
  "evaluation-runs/DPDPA-2023 Act.pdf/dpdpa-relations-20261029-01"
```

This writes a separate timestamped replay directory and does not call an LLM.
