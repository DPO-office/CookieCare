# Plan-Phase 0 baseline fixtures

Real `{ intent, clarificationRequest, declineMessage, plan }` snapshots captured
by running the LEGACY `classifyIntent` + `buildPlan` implementation against 5
fixed asks. These are the diff targets every later PLAN phase is checked
against — see `../../../docs-legacy/rebuild/IMPLEMENTATION_PHASE_PLAN.md`.

**PLAN only.** ACT never runs here — no findings, no requirement
assessments, no rendered report. Judging these against "is the final report
correct" is the wrong question at this stage; see the ⚠️ callout at the top
of `IMPLEMENTATION_PHASE_PLAN.md`.

## Running the harness

From `CookieCare-main/backend/`:

```bash
node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/plan/__fixtures__/baseline-runner.ts
```

Requires a working Gemini key in `CookieCare-main/.env`
(`GOOGLE_GEMINI_EXTERNAL_KEY` / `GOOGLE_CLOUD_PROJECT`) — `classifyIntent`
makes a real LLM call. Loads the Cisco DPA docx from
`C:/Users/abhinav.yadav_randst/Downloads/cisco-master-data-protection-agreement.pdf_draft.docx_draft.docx`
via the existing `src/utils/extractText.ts`. No real negotiation-playbook
document was found on disk (the only "playbook" file in Downloads is an
AI-prompt-engineering repository, not a set of negotiated positions), so the
playbook-alignment case uses a short synthetic 5-position playbook fixture
authored inline in the harness.

## What each file shows

- **`baseline-gdpr-art28-BEFORE.json`** — control case. `plan.workUnits`
  contains two `evaluate_package` units covering 15 authored Art 28
  particulars (6 GDPR-specific + 9 DPA-structural). This is the one case
  where PLAN already works.
- **`baseline-biggest-weaknesses-BEFORE.json`** — classifies reasonably
  (`risk_flag` / `risk_audit`, two well-worded requirements), but
  `plan.workUnits`'s only `evaluate_package` unit maps to the same 8 generic
  DPA-structural checks as every other case (subject-matter defined,
  duration defined, etc.) — nothing about liability caps, indemnification
  scope, or termination asymmetry. No risk-pattern (S2) propositions get
  generated at all.
- **`baseline-termination-balanced-BEFORE.json`** — same generic 8
  DPA-structural checks; the single `termination.balance_assessment`
  requirement is never actually evaluated by anything termination-specific,
  and there is no paired sub-proposition decomposition.
- **`baseline-playbook-alignment-BEFORE.json`** — `extract_playbook_positions`
  does run as a work unit, but `plan.requirementExecutionPaths` shows
  `playbook.alignment_check` status `"not_supported"`, reason "No analysis
  package or named-rule mapping for playbook.alignment_check." The extracted
  playbook positions are never turned into propositions.
- **`baseline-followup-chain-BEFORE.json`** — array of 3 turn snapshots.
  Each turn produces fresh `intent.requirements` and a full fresh
  `plan.workUnits` graph (11 → 10 → 4 units) with no reference to the prior
  turn's intent or assessments — no lock reuse, no triage.
