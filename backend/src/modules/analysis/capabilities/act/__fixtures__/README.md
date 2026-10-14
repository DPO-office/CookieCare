# ACT-Phase 0 — Baseline harness

No production code changes in this phase (aside from mechanical import-path
fixes to LEGACY test files broken by the `LEGACY_CAPABILITIES/` move — same
class of fix already applied during the PLAN rebuild).

## Files

- `baseline-runner.ts` — runs the real production pipeline
  (`PacController` + `defaultPacCapabilities`, i.e. fresh PLAN classify/build
  wrapping LEGACY ACT execution unchanged) against the real Cisco DPA with a
  GDPR Article 28 ask. Writes `baseline-cisco-art28-BEFORE.json` (full state
  dump) and `.md` (human-readable summary + definition-of-done checklist).

  Run with:
  ```
  node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/act/__fixtures__/baseline-runner.ts
  ```

- `static-alias-table-drift.test.ts` — deterministic (no LLM) fixture proving
  a real, live bug found *while capturing the baseline*: see below.

## What the baseline run found

Running the real Cisco DPA through the actual production pipeline surfaced a
live, current-day instance of the research doc's §3a
dual-namespace-collision / orphan-finding bug class — not fixed, despite the
docs' "mostly fixed" note (which was accurate for the specific spellings
someone had already hand-enumerated, not for the general problem).

**What happened:** LEGACY's PLAN classifier authors GDPR Art 28 requirement
ids via an LLM call, fresh every run. On this run it authored
`gdpr.article28.subject_matter_duration` — merging what
`evaluate_package`'s package-native code always keeps as two separate
requirements (`gdpr.article28.subject_matter`, `gdpr.article28.duration`)
into one PLAN row. `shared/requirement-identity.ts`'s alias/umbrella table is
a static, hand-enumerated list of previously-observed spellings; it has no
entry anticipating this particular merge, so `getUmbrellaMembers` returns
`undefined` for it and `article-linkage.ts`'s `findingsLinkedToRequirement`
returns zero findings for that PLAN row.

**Consequence:** all 10 of the run's requirement assessments came back
`cannot_determine` — including the merged row, even though the two
underlying native findings (`subject_matter`, `duration`) were both
correctly `present` with real evidence. Two more of the ten expected
particulars (`nature_and_purpose`, `controller_obligations_and_rights`)
never appeared as PLAN rows at all in this run — their `present` findings
have no assessment to surface under, a related but distinct "PLAN dropped
the row entirely" failure worth flagging separately for ACT-Phase 3
(authoring the 6 Art 28 particulars' proof standards explicitly, which — per
the Proposition model from PLAN's rebuild — should replace this
LLM-invents-ids-every-run mechanism with S1 propositions carrying **stable,
skill-authored ids**, eliminating this bug class by construction rather than
chasing it with a bigger alias table).

`static-alias-table-drift.test.ts` isolates and proves the merge-mismatch
half of this deterministically, using the exact ids observed in the real
run, with a control case proving the mechanism *does* work when a merge has
already been anticipated (the categories umbrella) — so the bug is
specifically "unanticipated LLM-invented merges", not "aliasing is broken."

## 5 named deterministic fixtures — mapping

| Named fixture | Status | Where |
|---|---|---|
| `orphan-finding-repro` | Covered — existing, passing | `act/__fixtures__/canonical-requirement-aggregation.test.ts`; extended with a real, still-live variant in `static-alias-table-drift.test.ts` |
| `dual-namespace-collision` | Covered — existing, passing; **live gap found and proven** | same two files as above |
| `truncated-extract-false-present` | **Open gap, confirmed by code inspection, not unit-tested** | see below |
| `nda-rule-missing-requirement-id` | Covered — existing, passing | `act/__fixtures__/requirement-id-propagation.test.ts` ("PLAN stamps requirementIds on rule/matrix/risk work units") |
| `risk-contaminates-compliance` | Covered — existing, passing | `canonical-requirement-aggregation.test.ts` |

### `truncated-extract-false-present` — why no fixture file

Confirmed as a real, currently-open gap by direct code reading of
`act/evaluate-package.ts`:

- `requirementsNeedingEvidenceExpansion` (line ~616) only selects results
  for truncated-evidence retry when their status is already
  `cannot_determine`/`partial`/`conditional` or compliance is
  `insufficient_evidence`/`partial`.
- A result that comes back `present`/`strong` from the LLM's first pass,
  citing only a truncated or heading-only evidence item, is **never**
  selected for retry — there is no separate guard forcing a truncated-only
  citation down to `insufficient_evidence` regardless of the claimed status.
- `forceInsufficient` (line ~476) only catches empty-ref or
  contextual-only-ref cases — not "the only supporting ref is truncated."

No deterministic fixture was written against this because the relevant
functions (`requirementsNeedingEvidenceExpansion`, `evidenceIsIncomplete`,
`citedItems`) are private (unexported), and `evaluatePackage` itself always
calls the real LLM with no injectable mock point — testing it would require
either exporting internals or adding a mock seam, both of which are
production code changes out of scope for "no production code changes."
`evaluate-package.ts` is also squarely inside ACT-Phase 5/6's VERIFY rework
scope, where this exact mechanism is being replaced — a throwaway test
against soon-to-be-deleted internals isn't worth writing. Tracked here as a
required behavior VERIFY must guarantee: a proof standard citing only
truncated/heading-only evidence must not resolve to a positive verdict.

## Definition-of-done (research doc §8) — hand-scored against the baseline

See `baseline-cisco-art28-BEFORE.md` for the checklist. Given the alias-drift
bug above, this run's real answer is: **all 10 rows came back
`cannot_determine`**, which fails nearly every §8 criterion outright — not
because the underlying evidence extraction/evaluation was wrong (4 of the
6 real particulars — subject_matter, duration, nature_and_purpose,
controller_obligations_and_rights — were correctly evaluated `present` with
real evidence at the finding level), but because the aggregation/linkage
layer failed to surface them. This is the exact "unit-tests-green,
real-case-still-broken" pattern the research doc warns about (§5, Attempt F)
— and gives ACT-Phase 5/6 (wiring VERIFY, replacing this linkage mechanism
with Proposition-sourced, stably-identified S1 rows) a concrete, real,
currently-failing case to fix against.
