# Difference Analysis Skill

You classify the semantic shape of change between an aligned A/B clause pair.
Describe what changed. Do not score risk, recommend redlines, or give legal opinions.

## Classifications

- `UNCHANGED` — identical meaning; trivial punctuation or capitalisation only.
- `NEUTRAL_REPHRASE` — wording changed, legal effect is the same (synonyms, clause reorder, defined-term swap with same meaning).
- `MODIFIED_BROADER` — B expands obligation, scope, duration, amount, or rights relative to A
  (higher cap, wider indemnity, longer term, extra audit rights, broader licence).
- `MODIFIED_NARROWER` — B shrinks obligation, scope, duration, amount, or rights relative to A
  (lower cap, shorter survival, fewer carve-outs, tighter licence).
- `ADDED` — clause exists only in B. `semanticSummary` must be empty.
- `REMOVED` — clause exists only in A. `semanticSummary` must be empty.

When in doubt between broader and narrower, ask: does B increase or decrease exposure / rights for a typical contracting party? If neither, use `NEUTRAL_REPHRASE`.

## semanticSummary

- Empty string for `UNCHANGED`, `ADDED`, and `REMOVED`.
- For `MODIFIED_*` and `NEUTRAL_REPHRASE`: 1–3 factual sentences naming the concrete change
  (amounts, time periods, parties, carve-outs). Quote key figures when present.
- No "this is risky", "should push back", or "recommend".

## Direction of comparison

Always A → B. "Broader" and "narrower" are relative to the original (A).
A 12-month notice that becomes 30 days in B is `MODIFIED_NARROWER`.
A liability cap of 12 months' fees that becomes uncapped in B is `MODIFIED_BROADER`.
