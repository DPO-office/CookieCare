# Temp: compliance evidence bundles (JSON only)

Writes investigation bundles after the **full investigation stage** finishes.

## What to open

`backend/src/modules/analysis/temp/compliance-bundles/out/latest.json`

That file is updated only when investigation is complete:

| Situation | `latest.json` contents |
|---|---|
| Graph-native on (shadow or canonical) | Completed **graph-native** bundles |
| Graph-native off / failed / skipped | Lexical Phase 3 bundles |
| Mid lexical dump | Does **not** overwrite `latest.json` (stamped archive only) |

Check `stage` + `meta` at the top of `latest.json`:

- `stage: "investigation_complete"`
- `meta.graphNativeMode`: `shadow` | `canonical`
- `meta.swappedIntoVerify`: whether verify uses these bundles

## Also written

- `<session>-deterministic_lexical-<time>.json` — early lexical archive (not latest)
- `<session>-investigation_complete-<time>.json` — stamped copy of latest
- `<requirementId>.json` — one file per requirement (from latest dump)

## Disable

```env
ANALYSIS_DUMP_COMPLIANCE_BUNDLES=0
```
