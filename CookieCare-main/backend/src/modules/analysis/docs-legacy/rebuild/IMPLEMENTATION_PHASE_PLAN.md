# Analysis Module Rebuild — Phased Implementation Plan (PLAN-first ordering)

> **Purpose:** Sequenced build order for the redesign described in
> `ACT_AND_PLAN_REDESIGN_RESEARCH.md` and `PLAN_PHASE_REDESIGN_SPEC.md`.
> **Reordered on request: PLAN is rebuilt fully first, then ACT, then the
> primitives/features that need both.** Each phase is small enough to
> review by hand, has an explicit file scope, an explicit non-goal list, and
> a manual verification procedure — exact steps, exact things to read
> yourself, exact pass/fail criteria. No phase starts until the previous
> phase's exit gate is met **by your own read of real output**, not green
> CI alone.

## ⚠️ Read this before starting — the one tradeoff of PLAN-first ordering

**PLAN phases are verified by reading PLAN's own generated output — the
proposition list, the resolved parameters, the work-unit graph — never by
reading the final rendered report.** ACT still runs its old, unfixed
`evaluate-package.ts` / `aggregate-requirements.ts` logic throughout every
PLAN phase below. That means if you run a full end-to-end analysis during
the PLAN phases, **the final report will still show the exact same
wrong-evidence bugs as today** (duration citing termination language,
etc.) — that is expected, is not a regression, and is not evidence PLAN's
work is wrong. The manual verification for every PLAN phase explicitly
stops at "does PLAN produce the right propositions/parameters," never "is
the final report correct." Full end-to-end correctness only becomes
checkable once you reach Part 3 (Integration), after both PLAN and ACT are
rebuilt. If you forget this and judge a PLAN phase by the old broken report,
you will wrongly conclude PLAN's fix didn't work.

**How to hand this to a coding agent, phase by phase:** copy exactly one
phase's Scope/Explicit non-goals/Deliverable as the instruction, plus:
*"Implement only this phase. Do not modify any file outside Scope. Do not
proceed to the next phase. Run the commands under Manual verification
yourself and show me the output, then stop."*

---

# PART 1 — PLAN phases (build first)

## Plan-Phase 0 — Baseline capture for PLAN (no production code changes)

**Goal:** Capture what PLAN currently outputs for a fixed set of test asks,
so every later PLAN phase has something real to diff against.

**Scope (create only):**
- Branch, e.g. `plan-rebuild/phase-0-baseline`
- Save PLAN's current `plan.*` state object (not the final report — PLAN's
  own output) for five fixed test asks, run against your existing fixtures:
  1. "GDPR Article 28 compliance review" on the Cisco DPA
  2. "What are the biggest weaknesses in this contract?" on the same DPA
  3. "Is termination balanced?" on the same DPA
  4. "Does this agreement align with our playbook?" (DPA + a playbook doc)
  5. The follow-up chain: "Analyze GDPR compliance" → "Focus on
     subprocessors" → "Can we object to a subprocessor change?"
  Save each as `plan/__fixtures__/baseline-<name>-BEFORE.json`.

**Explicit non-goals:** no changes to any file under `capabilities/plan/`
or `skills/runtime/` besides the new fixture files.

**Manual verification:** open each of the 5 saved `plan.*` objects and read
what PLAN currently produces (which requirements, from where, what's
missing). For #2–#5, you should see today's known failure by hand:
"biggest weaknesses" produces `not_supported` or falls back to a generic
extract; "is termination balanced" produces nothing decomposed; playbook
produces no propositions from the playbook at all; the follow-up chain
re-classifies from scratch each turn instead of reusing anything.

**Exit gate:** 5 saved baselines, and you've personally confirmed each
shows the expected current gap.

---

## Plan-Phase 1 — Proposition schema extension (types only, no behavior change)

**Goal:** Add the proposition type and its supporting fields to the type
system, per `PLAN_PHASE_REDESIGN_SPEC.md` §2 and §10a's revisions. Nothing
reads these fields yet — this phase should be a boring, changes-nothing
diff to review.

**Scope:**
- New/extended type, e.g. `models/proposition.ts`:
  ```typescript
  interface Proposition {
    hypothesis: string;
    proofStandard: string;
    source: 'S1' | 'S2' | 'S3' | 'S4' | 'S5a' | 'S5b';
    priority: number;
    partyPerspective?: string;   // Gap 1 — threaded, not left unread
  }
  ```
  (S5 split into S5a primary-source-text / S5b interpretive-market-knowledge
  per Gap 5.)
- `models/intent.ts` — add `partyPerspective: string | null`,
  `exhaustiveness: { mode: 'default' | 'user_capped'; limit?: number }`
  (Gap 2), `documentVersionRef` per-document (for follow-up invalidation,
  §5.5 of the spec)

**Explicit non-goals:** do not wire any of these fields into
classify-intent, resolve-packages, or anything that runs. Do not touch
ACT at all this phase.

**Manual verification:** typecheck/build clean. Confirm nothing in the
existing test suite changed status (nothing reads the new fields yet).

**Exit gate:** clean build, zero test regressions.

---

## Plan-Phase 2 — Document-role resolution + party-perspective, made first-class

**Goal:** Implement §5.1 and §5.2 of the PLAN spec — explicit, surfaced
document-role resolution for multi-doc asks, and inference (or a
clarification question) for whose side the user is asking from.

**Scope:** `resolve-document-roles.ts`, `classify-intent.ts` (populate
`partyPerspective`), `capabilities/ask/ask-user.ts` (trigger a
clarification when perspective is genuinely ambiguous rather than guessing)

**Explicit non-goals:** do not touch proposition generation yet (that's
Plan-Phase 5+). Do not touch ACT.

**Manual verification:**
1. Run "compare these two agreements" with two uploaded documents. Print
   the resolved document roles. Confirm by hand which one PLAN picked as
   target vs. reference, and that it's correct for your fixture.
2. Run "what should I negotiate" on the DPA. Print `partyPerspective`.
   Confirm it correctly inferred your side from context (e.g. the DPA
   naming Mastercard as controller and your fixture's framing as the
   customer).
3. Construct one deliberately ambiguous case (a document with no clear
   party framing) and confirm it triggers a clarification question instead
   of silently guessing.

**Exit gate:** all 3 manual checks read correctly by you.

---

## Plan-Phase 3 — Frame-fit check

**Goal:** Implement §5.3 — before generating S1 (regime) propositions,
check whether the classified doc-type actually matches the frame being
asked about.

**Scope:** a new check inside `classify-intent.ts` or `intent-heuristics.ts`
comparing detected doc-type against the regime/frame implied by the ask.

**Explicit non-goals:** only implement the mismatch *detection* and
messaging; do not change skill-selection logic beyond this check.

**Manual verification:** feed an NDA into "perform a GDPR Article 28
compliance review." Confirm PLAN surfaces "this doesn't appear to be a
DPA" (or equivalent) instead of silently building Art 28 propositions
against it. Also confirm a correctly-matched case (DPA + Art 28 ask) is
unaffected — passes through with no false-positive mismatch warning.

**Exit gate:** mismatch case flagged; matched case unaffected, verified by
reading both outputs yourself.

---

## Plan-Phase 4 — Inventory pass (reuses existing generic ACT tools)

**Goal:** Implement §4's step 8a — a cheap, generic structural inventory of
the document(s), reusing `classify_document` + `extract_clauses`, callable
from PLAN before proposition generation.

**Scope:** a new PLAN-side orchestration step, e.g.
`capabilities/plan/build-inventory.ts`, calling the two existing ACT tools
(no changes to those tools themselves — they're already generic and
untouched by the ACT bug this whole redesign exists to fix).

**Explicit non-goals:** do not generate any propositions from the inventory
yet (that's Plan-Phase 5). This phase only produces the inventory list.

**Manual verification:** run this against the DPA fixture and separately
against the NDA fixture. Print the inventory (clause type → section →
brief content) for each. Read both by hand: does it look like what you'd
expect from a first read of each document — right clause types found,
right sections cited, nothing obviously missing (e.g. if the DPA has an
audit clause, it should appear in the inventory).

**Exit gate:** both inventories read correctly to you.

---

## Plan-Phase 5 — S2 proposition generation (inventory + topic/doc-type skill patterns)

**Goal:** Implement §4's step 8b for the S2 source only — cross-reference
the inventory against risk/structural patterns to generate propositions,
with priority. Author content for exactly one topic skill first
(`topics/vendor-risk`, 3–4 patterns: e.g. `termination_asymmetry`,
`liability_cap_adequacy`, `indemnification_scope`) to keep this phase
small and reviewable.

**Scope:**
- `skills/topics/vendor-risk/skill.config.ts` — author the 3–4 patterns'
  `proofStandard` + `priority`, per the authoring bar from
  `ACT_AND_PLAN_REDESIGN_RESEARCH.md` Phase 3's discipline ("would a
  first-year associate know exactly what to check and reject from this
  sentence alone")
- New PLAN step: `capabilities/plan/generate-propositions.ts` — matches
  inventory items against active S2 skill patterns, emits `Proposition[]`

**Explicit non-goals:** do not wire this into the ACT graph / work units
yet. Do not call VERIFY (it doesn't exist reachably yet — that's Part 2).
This phase's deliverable is a `Proposition[]` array that nothing downstream
consumes yet, deliberately.

**Manual verification:** run "what are the biggest weaknesses in this DPA?
What should I negotiate?" through PLAN only. **Print the generated
proposition list and stop there — do not run it through to a report.**
Read each proposition by hand:
- Does `hypothesis` match something actually in the inventory (no
  proposition generated for a clause type that doesn't exist in the
  document)?
- Is `proofStandard` well-written per the same bar as Plan-Phase 5's
  authoring check?
- Is `priority` sensible (e.g. termination asymmetry ranked above a minor
  drafting-quality nit)?
- Does `partyPerspective` from Plan-Phase 2 actually appear threaded into
  the relevant proof standards (Gap 1's fix) — e.g. does the liability-cap
  proposition's standard reference "adequate for the customer" specifically,
  not a generic "adequate"?

**Exit gate:** you personally approve the generated proposition list for
this one fixture — this is the second-highest-leverage manual read in the
PLAN phases, same discipline as authoring `proofStandard` was for ACT.

---

## Plan-Phase 6 — S4 ad hoc proposition authoring (novel questions)

**Goal:** For a question no S1/S2 source covers, have PLAN write its own
proposition + proof standard directly from the user's phrasing.

**Scope:** extend `generate-propositions.ts` with an S4 fallback path when
inventory × S2 patterns produces no match but the ask clearly implies
something to investigate.

**Explicit non-goals:** still no ACT wiring.

**Manual verification:** invent a genuinely novel ask your fixtures don't
anticipate (e.g. "does this DPA say anything about what happens if
Mastercard is acquired?"). Print the generated S4 proposition. Read it by
hand — is the proof standard specific and checkable, or vague boilerplate?
Rewrite the generation prompt if it's vague; this is a judgment call only
you can make well.

**Exit gate:** the S4 proposition for your invented novel ask reads as
specific and checkable to you.

---

## Plan-Phase 7 — S3 playbook-as-source

**Goal:** Wire the existing `extract_playbook_positions` ACT tool's output
into proposition generation, treating each playbook position as a
proposition source.

**Scope:** `generate-propositions.ts` extended to consume
`extract_playbook_positions` output (that tool itself is untouched —
it's not part of the broken evaluate/aggregate path, safe to call now);
`resolve-document-roles.ts` must correctly mark the playbook document as a
reference doc (built on Plan-Phase 2).

**Explicit non-goals:** do not implement the actual alignment judgment
(target clause vs. playbook position) — that's COMPARE, which needs
VERIFY, which is Part 4. This phase only produces one proposition per
playbook position; it does not resolve them yet.

**Manual verification:** upload a real playbook alongside the DPA. Print
the generated proposition list. Confirm there's one proposition per
distinct playbook position, with a `proofStandard` derived from the
playbook's own wording (not paraphrased into something the playbook didn't
say) and `source: 'S3'`.

**Exit gate:** the playbook-derived propositions read as faithful to the
actual playbook text, checked by you against the playbook document itself.

---

## Plan-Phase 8 — Reasoning-ask decomposition (paired sub-propositions)

**Goal:** For "is termination balanced" / liability-cap-adequacy /
data-use-breadth style asks, have PLAN decompose into the paired
sub-propositions COMPARE will later need (§ reasoning asks in the ACT
research doc).

**Scope:** extend `generate-propositions.ts` to recognize a
comparison-shaped ask and emit two (or more) linked sub-propositions
(e.g. "Party A's termination rights" + "Party B's termination rights"),
tagged so ACT can later pair them for COMPARE.

**Explicit non-goals:** do not implement COMPARE itself (Part 4, needs
VERIFY).

**Manual verification:** run "is termination balanced?" through PLAN only.
Print the two generated sub-propositions. Confirm each is independently
well-formed (a real proof standard, not "find termination stuff") and that
they're correctly tagged as a linked pair for later comparison.

**Exit gate:** both sub-propositions read as independently investigable to
you, and correctly paired.

---

## Plan-Phase 9 — Exhaustiveness / stopping-criterion handling (Gap 2)

**Goal:** Parse a user's explicit scoping instruction ("just the top 3
risks," "skip drafting nitpicks") into the `exhaustiveness` field from
Plan-Phase 1, and use it to trim the generated proposition list —
separately from the Lite/Deep system budget, which doesn't exist as a
concept PLAN needs to know about yet at this stage.

**Scope:** `classify-intent.ts` (parse the instruction),
`generate-propositions.ts` (apply the trim by `priority` when
`exhaustiveness.mode === 'user_capped'`)

**Manual verification:** run "what are the top 3 risks in this contract"
through PLAN. Print the final proposition list. Confirm it's trimmed to 3,
and that the 3 kept are the highest-priority ones from the full candidate
set (print the untrimmed list too, for comparison, and check the trim was
correct by hand).

**Exit gate:** trimming behaves correctly and picks the right 3 by your
own judgment of what should matter most for this fixture.

---

## Plan-Phase 10 — Follow-up triage logic (mocked locked-fact input)

**Goal:** Implement the three-way triage from §6 of the PLAN spec —
answerable-from-locks / one-narrow-addition / real-re-plan — as its own
testable decision function, using a **mocked** locked-fact set (since
ACT's real locked assessments aren't trustworthy yet).

**Scope:** extend `follow-up-intent.ts` with the triage function; a new
test fixture providing a hand-constructed mock `RequirementAssessment[]`
representing "what a correct GDPR Art 28 lock would look like" (you can
build this mock from the Cisco definition-of-done table in the ACT
research doc §8 — it doesn't need to come from a real ACT run).

**Explicit non-goals:** do not wire this to a real ACT-produced locked set
yet — that only becomes trustworthy in Part 3.

**Manual verification:** feed the triage function the mocked locked set
plus each turn of the GDPR→subprocessors→object→negotiate chain. Print
which bucket each turn was classified into. Confirm by hand it matches the
table in the ACT research doc §9 (turn 1 = full investigation, turn 2 =
no new work, turn 3 = one narrow addition, turn 4 = no new work).

**Exit gate:** all 4 turns classified correctly against your mock.

---

## Plan-Phase 11 — Ambiguity → ASK wiring (Gap 6)

**Goal:** When proposition generation (Plan-Phase 5/6) produces more than
one plausible interpretation for the same ask, route to ASK instead of
silently picking one.

**Scope:** `generate-propositions.ts` (detect and flag multi-match cases),
`capabilities/ask/ask-user.ts` (accept this as a new trigger condition
alongside "missing clarifications" from classify-intent)

**Manual verification:** construct a case where the inventory plausibly
matches two different risk patterns for the same clause (e.g. a clause
that could be read as either an indemnification issue or a liability-cap
issue, if your vendor-risk patterns overlap that way). Confirm PLAN routes
to ASK with a clarifying question, rather than silently picking one
interpretation.

**Exit gate:** the ambiguous case triggers ASK; confirm a non-ambiguous
case from Plan-Phase 5 is unaffected (no false-positive ASK trigger).

---

## Plan-Phase 12 — SYNTHESIZE decomposition prep (Gap 3, generation side only)

**Goal:** Nothing to implement yet on the reasoning side (SYNTHESIZE itself
needs locked facts, so it's a Part 4 ACT primitive) — but PLAN needs to
mark, at proposition-generation time, which propositions belong to a
"related cluster" worth a compounding-risk check later (e.g. all
termination/liability/indemnification propositions generated for one
negotiation-style ask get tagged into one cluster).

**Scope:** `generate-propositions.ts` — add a `clusterId` field grouping
related propositions from the same ask.

**Manual verification:** re-run Plan-Phase 5's "biggest weaknesses" case.
Print the proposition list with cluster tags. Confirm the termination,
liability, and indemnification propositions are grouped into one cluster
(since together they're the compounding-risk case from Gap 3), while an
unrelated proposition (say, a data-use one) is in its own cluster or
ungrouped.

**Exit gate:** clustering matches your own read of which findings should
plausibly be considered together later.

---

# PART 2 — ACT phases (build after PLAN is complete)

Everything below is the ACT rebuild from the original plan, **unchanged in
substance**, renumbered to follow PLAN. One adaptation: from ACT-Phase 5
onward, `evaluate-package.ts`/VERIFY consumes `Proposition[]` objects in the
new shape PLAN now produces (Plan-Phase 1's type), rather than reading
`requirementEvidence` directly off skill config — skill-authored
requirements (S1) are simply propositions with `source: 'S1'`, so this is a
small interface adaptation, not new design.

## ACT-Phase 0 — Baseline harness (no production code changes)
Same as originally specified: branch, save `baseline-cisco-art28-BEFORE`
(json + md), write the 5 missing deterministic fixtures
(orphan-finding-repro, dual-namespace-collision, truncated-extract-false-
present, nda-rule-missing-requirement-id, risk-contaminates-compliance).
**Manual verification:** hand-scored PASS/FAIL table against the §8
definition-of-done from the research doc. **Exit gate:** baseline + scorecard
+ 5 runnable fixtures exist.

## ACT-Phase 1 — Requirement-ID stamping at source (mechanical)
Scope: `check-against-rule.ts`, `evaluate-matrix-row.ts`,
`check-expected-clauses.ts`, `flag-risk.ts`, `shared/requirement-identity.ts`,
`models/finding.ts` (`requirementId` required). Non-goals: no scoring
changes, no schema/proofStandard work (PLAN already owns that shape now).
**Manual verification:** NDA fixture's raw `Finding[]` all carry
`requirementId`; Cisco output unchanged vs. baseline.
**Exit gate:** lint + aggregation fixtures green; NDA findings populated;
Cisco unchanged.

## ACT-Phase 2 — Schema extension for enrichment fields
Scope: `models/requirement-assessment.ts` — add `establishedBy`,
`gapDescription`, `dependency`, `baselineComparison`, `structuralNote`,
`remediation` (optional). `models/evidence-package.ts`'s `proofStandard`
etc. **already added in Plan-Phase 1** — this phase only adds the
assessment-side enrichment fields.
**Manual verification:** clean build; zero test regressions.

## ACT-Phase 3 — Confirm authored `proofStandard` content (already done in Plan-Phase 5)
No new authoring needed here if Plan-Phase 5 already covered the Cisco
particulars — **but check**: Plan-Phase 5 authored `topics/vendor-risk`
patterns, not necessarily the 6 GDPR Art 28 particulars themselves (those
are S1, not S2). **This phase authors the 6 Art 28 `proofStandard` entries
specifically**, in `skills/regimes/data-protection/gdpr/skill.config.ts`,
using the same read-aloud bar as before.
**Manual verification:** read each of the 6 aloud; would a first-year
associate know exactly what to accept/reject from the sentence alone.
**Exit gate:** you approve all 6.

## ACT-Phase 4 — Build VERIFY standalone, unit-tested in isolation
Scope: `capabilities/act/verify-proposition.ts`, `prompts/verify-
proposition.ts`, `capabilities/act/__fixtures__/verify-proposition.test.ts`.
Non-goals: not wired into any real run yet. Deliverable: the 5 adversarial
cases (duration vs. termination language, duration vs. real term clause,
confidentiality vs. security clause, an affirmative-indefinite contradiction
case, a fabricated-quote rejection case).
**Manual verification:** run the test file, read every verdict + quote by
hand against your own judgment.
**Exit gate:** 100% of the 5 cases correct by your read.

## ACT-Phase 5 — Wire VERIFY into ACT for the 6 Art 28 particulars only
Scope: `isolate-requirement-evidence.ts` (loosen to recall-oriented
candidate generation, cap ~10), `evaluate-package.ts` (call VERIFY per
candidate for the 6 particulars — now reading `Proposition` objects sourced
from PLAN's S1 output), `aggregate-requirements.ts` (LOCK only promotes
`proves`/`contradicts`-verdict findings).
**Manual verification:** the 6 particular rows match the definition-of-done
table; the other 8 mandatory-clause rows byte-identical to baseline.
**Exit gate:** both checks pass on the real Cisco document.

## ACT-Phase 6 — Extend VERIFY to the 8 mandatory clauses
Author their `proofStandard`s; reuse the same wiring, no new code.
**Manual verification:** all 14 rows pass against definition-of-done.
**Exit gate:** full Cisco fixture passes end to end.

## ACT-Phase 7 — Populate enrichment fields, wire RENDER to use them
Scope: `verify-proposition.ts` output extended; `render-output.ts` /
`analytical-synthesis.ts` consume the new fields; extend
`unsupported-inference.ts`'s guardrail to the richer record.
**Manual verification:** read the full Cisco report prose, compare depth
against the Mastercard example from earlier in this conversation.
**Exit gate:** you're satisfied the prose matches that bar.

## ACT-Phase 8 — Second doc-type: NDA (proves general-purpose)
Scope: `skills/doc-types/nda/skill.config.ts` — author `proofStandard` for
confidentiality scope, exceptions, survival, return/destruction, mutuality.
Zero new code.
**Manual verification:** `generic-handler-domain-lint.test.ts` green; NDA
report read by hand — survival-period finding no longer contradicts a
placeholder assessment.
**Exit gate:** both pass.

## ACT-Phase 9 — Narrow AUDIT
Scope: `run-audit.ts`, `ground-findings.ts`. **Manual verification:** Deep
mode wall-clock drops for the AUDIT step; an injected table-vs-narrative
contradiction is still caught.
**Exit gate:** both confirmed.

## ACT-Phase 10 — Lite/Deep scope control
Scope: PLAN's `priority` field (already exists from Plan-Phase 5) now
drives ACT's candidate cap and proposition inclusion under Lite; RENDER's
prose-length instruction per mode.
**Manual verification:** Cisco in both modes — identical correctness,
Lite faster and terser, hits the ~2min target.
**Exit gate:** confirmed by side-by-side read.

---

# PART 3 — Integration (first point where end-to-end correctness is checkable)

## Integration-Phase 1 — Full pipeline re-run on all 5 Plan-Phase-0 baselines

**Goal:** This is the first phase where you can honestly judge a *complete*
report, because both PLAN's proposition generation and ACT's VERIFY/LOCK
are now real.

**Manual verification:** re-run all 5 fixed test asks from Plan-Phase 0.
For each, diff against its `-BEFORE` baseline and confirm improvement:
1. GDPR Art 28 — matches the full definition-of-done table (already proven
   in ACT-Phase 6, confirm it still holds with PLAN's new proposition
   pipeline feeding it, not just the old direct skill-config path)
2. "Biggest weaknesses" — now produces a real negotiation-recommendation
   report instead of `not_supported`
3. "Is termination balanced" — now produces a grounded comparative answer
   citing both parties' actual clauses
4. Playbook alignment — now produces per-position alignment findings
5. The follow-up chain — confirm which turns triggered new ACT work
   matches the expected table, now for real (not the mocked version from
   Plan-Phase 10)

**Exit gate:** all 5 read correctly to you, end to end, on real documents.

---

# PART 4 — Primitives needing both PLAN and ACT (build last)

- **COMPARE** — consumes Plan-Phase 8's paired sub-propositions once both
  are VERIFY'd; extends `analytical-synthesis.ts`. Manual check: read the
  two independently-verified facts yourself before reading COMPARE's
  conclusion, confirm it doesn't smuggle in anything beyond those two.
- **P3 consistency/contradiction check** — for "find contradictions" asks;
  compares multiple verified passages about the same subject.
- **SYNTHESIZE (Gap 3)** — consumes Plan-Phase 12's proposition clusters
  plus their locked verdicts; surfaces compounding-risk patterns. Manual
  check: confirm it only composes relationships between already-locked
  facts, never introduces a new one.
- **Fenced S5a/S5b external knowledge** — PLAN decides when to invoke it
  (§8 of the ACT research doc); ACT fences it so fetched text never becomes
  document evidence; confidence-tier labeling surfaces in RENDER. Manual
  check: ask about a regime with no authored skill, confirm the response is
  visibly labeled lower-confidence.

Expand each of these to the same phase-by-phase granularity as Parts 1–2
once you've reached this point — by then you'll have working conventions
(test fixture format, manual-verification habits) from the earlier phases
to reuse rather than inventing them fresh here.

---

# Running scorecard

| Phase | Manual check performed | Result | Date |
|---|---|---|---|
| Plan-0 | 5 baselines captured, gaps confirmed | | |
| Plan-1 | Clean build | | |
| Plan-2 | Roles/perspective correct; ambiguous case asks | | |
| Plan-3 | Frame mismatch flagged; match unaffected | | |
| Plan-4 | Both inventories read correctly | | |
| Plan-5 | Proposition list approved (biggest-weaknesses case) | | |
| Plan-6 | S4 ad hoc proposition specific, not vague | | |
| Plan-7 | Playbook propositions faithful to source | | |
| Plan-8 | Reasoning sub-propositions well-formed, paired | | |
| Plan-9 | Top-3 trim correct | | |
| Plan-10 | Follow-up triage correct on mock | | |
| Plan-11 | Ambiguous case → ASK; normal case unaffected | | |
| Plan-12 | Clustering matches your judgment | | |
| ACT-0 | Baseline + scorecard captured | | |
| ACT-1 | NDA requirementId populated; Cisco unchanged | | |
| ACT-2 | Clean build | | |
| ACT-3 | 6 Art 28 proof standards approved | | |
| ACT-4 | 5 adversarial VERIFY cases read by hand | | |
| ACT-5 | 6 particulars pass; other 8 unchanged | | |
| ACT-6 | All 14 rows pass | | |
| ACT-7 | Prose depth matches Mastercard bar | | |
| ACT-8 | NDA passes; lint green | | |
| ACT-9 | AUDIT faster; contradiction caught | | |
| ACT-10 | Lite = Deep correctness, faster | | |
| Integration-1 | All 5 fixtures pass end to end | | |
