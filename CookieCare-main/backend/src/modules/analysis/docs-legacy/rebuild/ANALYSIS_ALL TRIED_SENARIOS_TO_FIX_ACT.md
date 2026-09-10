# LORA Analysis Module — ACT Phase Redesign: Research Brief

> **Purpose:** Handoff for a research/design pass on rebuilding the ACT phase of
> the Analysis module from scratch. PAC (PLAN → ACT → CRITIQUE/AUDIT → DONE)
> stays. Everything inside ACT — evidence extraction, isolation, evaluation,
> requirement identity, aggregation — is in scope for a clean rebuild.
>
> **This is a research brief, not an implementation ticket.** The goal of this
> pass is to produce a small set of candidate designs with tradeoffs, not to
> start writing ACT immediately. One candidate direction is included below
> (§7) as a starting hypothesis, not a decision.

---

## 1. End goal — what this system needs to actually do

A general-purpose document-analysis engine, usable for:

- **Structured compliance/checklist asks** — "check this DPA against GDPR
  Art 28," "check this BAA against HIPAA," or any other regime a skill has
  been authored for. Output is a stable, per-requirement table: each row
  independently correct, backed by evidence that specifically proves that
  row's proposition.
- **Open-ended analytical asks** — "what are the biggest risks in this
  contract," "compare these two NDAs," "what's unusual about this clause" —
  where there is no pre-built checklist, the system has to figure out what's
  worth investigating, and the output shouldn't be forced into a
  checklist-shaped template just because that's the only shape the system
  knows how to produce.

Both paths must hit a **counsel-grade correctness bar**: no status that
contradicts its own stated rationale, no requirement's evidence borrowed from
an unrelated requirement, no clause marked absent when it's present in the
document. This is a legal product — a wrong "compliant" is a liability
problem, not a UX annoyance.

**Hard constraint that shaped every failed attempt so far: nothing
regime-specific can be hardcoded into the shared ACT engine.** Art 28's
specific proof criteria, HIPAA's, or the shape of a one-off user question, all
have to be expressed as *data* the engine consumes generically — not as
GDPR-shaped code paths in a file every other regime also runs through. This
was tried (see §5, Attempt E) and reverted for exactly this reason.

---

## 2. What stays untouched

Per prior sessions' own conclusion (`LORA_Analysis_Architecture_Concise_Handoff.md`,
"What Should Stay") and confirmed still valid — do not redesign these:

- PAC lifecycle: `PLAN → ACT → (AUDIT/CRITIQUE) → DONE`, `Lite` and `Deep`
  variants
- Document ingestion / parsing / segmentation
- Skills / legal-knowledge authoring format (packages, requirements as
  currently authored — though the requirement *schema* likely needs new
  fields, see §7)
- Parallel execution, streaming, persistence infrastructure
- Deterministic, code-owned phase control (no LLM deciding to skip a phase) —
  this is a cross-module invariant already established for the Drafting
  module's PAC controller and applies here identically

**In scope for full rebuild: everything inside ACT** — evidence extraction,
isolation/scoring, package evaluation, finding-to-requirement linkage,
requirement identity/canonicalization, aggregation, risk/compliance
separation, judgement derivation.

---

## 3. The core diagnosed problem

Two distinct problems were found, at two different points in the pipeline.
Both are real; neither alone explains the whole failure.

### 3a. Aggregation/identity contamination (mechanical — was root-caused and mostly fixed)

A forensic investigation (full detail in §6) found the **first incorrect
state**: PLAN and package-level code used two different ID namespaces for the
same legal requirement (`gdpr.article28.duration` vs. package-native
`duration`). The linkage function couldn't match them, so:

- The correct native `duration` Present finding got orphaned from its PLAN
  row.
- A same-article fallback then attached **every unstamped Article 28 risk
  finding to every Article 28 PLAN row**, because the fallback logic only
  had an article number to go on, not a specific sub-requirement match.
- `deriveRequirementJudgement` took the **first stamped judgement** in the
  supporting set — often one of the flooded risk findings — so one risk
  finding could silently become an entire requirement's compliance
  conclusion.
- Result, reproduced deterministically: 6 PLAN requirements → 8 locked
  assessments, **all 8 `conditional`**, several sharing near-identical
  rationale text across unrelated requirements (subject matter and duration
  both got "lacks complete processing particulars").

This class of bug — dual ID namespaces, risk findings masquerading as
compliance findings, first-wins judgement logic, article-wide fallback
attachment — **was substantially fixed** across Attempts B, C, D (see §5).
Logs post-fix show findings correctly linked, risk flooding gone, orphan rows
resolved. **Do not re-introduce this class of bug in the rebuild** — the
fixes that worked (canonical requirement identity, risk/compliance channel
separation, deterministic judgement merge instead of first-wins) should be
treated as required properties of the new design, not optional nice-to-haves.

### 3b. "Related ≠ proof" (semantic — never fixed, is the real remaining blocker)

Even after 3a's mechanical bugs were fixed, evidence attached to a
requirement is still frequently **topically related but doesn't actually
prove the specific proposition**:

- Duration → gets termination/retention/deletion language, not an actual
  term length or end condition
- Confidentiality → gets security language
- Data-subject categories → gets data-subject-rights language
- Subject matter / nature & purpose → gets security or regional-law
  boilerplate

The system was scoring and selecting evidence by keyword/topic proximity, not
by whether the text actually establishes the claim being tested. This
produces the counsel-review failures that persisted through every attempt:
wrong clause cited as proof, a row marked "Strong" while its own rationale
says the document "does not set out" the thing being tested, shallow
synthesis that repeats the matrix instead of reasoning about it.

**This is the problem that was never solved, and it's a missing capability,
not a bug in an existing one.** Nothing in the current pipeline explicitly
asks "does this candidate text prove this specific proposition, or is it just
nearby." That judgment is implicit in a keyword/hint scorer plus a generic
evaluation LLM call that was never given a proof standard to check against.

---

## 4. Non-negotiable constraints for the redesign

Carried forward from explicit user decisions across all prior sessions:

| Constraint | Why |
|---|---|
| No regime-specific logic hardcoded into shared ACT code | Tried (Attempt E), reverted — broke general-purpose use, and made GDPR results worse anyway |
| Must remain general-purpose: any clause, any compliance regime, any ad-hoc analytical question | Core product requirement, not negotiable |
| PAC outer loop (PLAN/ACT/AUDIT/DONE) is not being redesigned | Only ACT internals are in scope this round |
| No orchestration framework migration (LangGraph/Mastra/etc.) as a fix for this | Already independently concluded wrong tool for this problem — the bug is semantic (evidence correctness), not a control-flow/framework problem |
| Whatever replaces the current mechanism must be provably better against the same real failing case (Cisco Art 28 DPA), not just green on new unit tests | Prior attempts repeatedly had passing unit tests while the real counsel review still failed — "unit tests ≠ user case" is an explicitly learned lesson, see §5 |
| Deterministic, testable golden fixtures required before/alongside implementation, not after | Missing-tests list from the forensic investigation (§6) should be treated as a required deliverable, not optional |

---

## 5. Everything tried so far (full attempt history)

15+ hours across two parallel diagnostic threads (an internal forensic
investigation, and a separate hands-on implementation session). Both reached
compatible conclusions independently — worth noting as corroboration, not
duplication.

### Forensic investigation (code-level root cause)

A deterministic reproduction probe confirmed the exact failure mechanism in
§3a: constructed a minimal case (one native Present finding + three unstamped
risk findings) and proved the linkage function returns the three risk
findings for every PLAN requirement while the correct native finding is
never attached. Full root cause, file/function-level detail, and a minimal
correctness contract (10 invariants, most currently failing) are preserved in
the original forensic document — reattach if the implementer needs file/line
level detail; summarized here:

**Files most implicated:**
- `skills/runtime/graph/resolve-packages.ts` — dual ID merge (authored
  natives + PLAN extras) creates the two-namespace problem in the first place
- `shared/article-linkage.ts` — `findingsLinkedToRequirement`,
  `articleNumberFromRequirementId`, `subprovisionKeyFromId`,
  `articleNumberForFinding` — where PLAN ids fail to match native ids, and
  where the article-wide fallback over-attaches
- `capabilities/act/aggregate-requirements.ts` — `aggregateRequirements`,
  `orderedRequirementIds`, `buildSummary` — builds the (currently duplicated)
  assessment list and clones summary text from a shared, contaminated support
  set
- `capabilities/act/requirement-status-policy.ts` — `isGap`, `isSupporting`,
  `complianceFromFindings`, `deriveRequirementJudgement` — where risk
  findings can flip a compliance status, and where "first stamped judgement"
  logic lets one finding poison an entire row
- `capabilities/act/evaluate-package.ts` — `isolateAndNormalize` /
  `forceInsufficient` — gated correctly, not the live homogenizer, but still
  a risk for empty-ref Present findings without coverage preservation
- `grouped-results-to-findings.ts` — `judgementForResult` — substance-upgrade
  logic works in single-id golden fixtures but is never reached by the
  multi-id PLAN path that actually fails in production

**Minimal correctness contract** (should become the acceptance test suite for
the rebuild — most items below were failing at investigation time):

1. Every assessment has exactly one canonical requirement identity
2. `supportingFindingIds` belong to that requirement, or are independently
   validated for legitimate multi-use
3. Every evidence reference traces to the actual reviewed document
4. A positive judgement is never downgraded solely because filtering failed
   elsewhere
5. Different requirements cannot inherit a shared generic judgement unless
   evidence independently supports each one
6. Aggregation cannot merge unrelated requirements
7. Risk findings cannot silently mutate compliance assessments
8. Package-native IDs cannot silently create duplicate assessments alongside
   their PLAN-id alias
9. The locked assessment is the single source of truth for rendering
10. Table and narrative rendering consume the same lock (no divergent views)

### Hands-on implementation session (product/counsel-quality level)

Working against a real Mastercard/Cisco-style Article 28 DPA review, with an
explicit constraint set: no PAC rewrite, no Mastra, no per-requirement LLM
fan-out, no extra agents, no RAG, must stay general-purpose.

**Attempt A — Requirement-scoped evidence packets.**
Replaced a single shared ranked-extract pool with classified packets
(`supporting` / `contextual` / `insufficient`) per requirement, plus
hint/token scoring. *Improved:* less cross-requirement noise in some runs.
*Did not fix:* subject matter / controller / nature-purpose still frequently
cited related-but-wrong clauses (DSR, security, jurisdiction language);
duration still scored "strong" off termination/deletion-adjacent text, not
actual duration language. Counsel review still rejected the pairings.

**Attempt B — Canonical identity / no orphan rows.**
Introduced `requirement-identity.ts` aliasing so PLAN ids and package-native
ids resolve to one identity; fixed aggregation matching. *Improved:*
assessments stopped showing `0 supporting findings`; identity plumbing
healthy in logs. *Did not fix:* linked findings could still be the *wrong*
evidence — "linked ≠ correct."

**Attempt C — Compliance / risk split.**
Emptied `focus.riskCategoryIds` unless risk was explicitly asked for; made
Art 28.1/2/10 package context rather than always-active; reordered the ACT
graph (aggregate → derive_risk → render) to stop leftover `flag_risk`
findings polluting the compliance path. *Improved:* risk-flooding of
unrelated requirements largely eliminated in later logs. *Did not fix:* core
particulars quality — wrong clause still cited as proof; report depth/
synthesis untouched.

**Attempt D — Finding consolidation + umbrella linkage.**
Fixed `render-output.ts`'s `consolidationKey` to include `finding.status` (so
a `present` finding paired with an `absent_expected` finding for the same
requirement no longer collapsed to `cannot_determine`); added
`getUmbrellaMembers()` for robust umbrella-ID resolution across spelling
variants. *Improved:* mechanical downgrade path fixed; umbrella ID matching
more robust. *Did not fix:* wrong-evidence "Strong" rows; self-contradictory
rationales (status says compliant, rationale says the document "does not set
out..."). **Status: kept** — this is the last known-good checkpoint.

**Attempt E — Claim/proposition-level evidence grounding. Implemented, then
fully reverted.**
Hardcoded proof-vs-noise regex patterns for specific Art 28 particulars
(`subject_matter`, `nature_purpose`, `controller`, `categories`, stricter
`duration`) directly into the shared, generic
`isolate-requirement-evidence.ts`, plus an expanded contradiction guard
("does not set out / specify..." blocks a Strong/Present status).
**Result: the system got measurably worse**, and — independent of quality —
this broke the general-purpose requirement by baking one regime's proof
criteria into code every other regime and every ad-hoc question also runs
through. **Fully reverted**, including its dedicated test fixtures, back to
the Attempt D checkpoint. **This is the most important lesson from the whole
arc: the right fix requires the specificity Attempt E was reaching for
(explicit proof criteria, not keyword proximity), but that specificity cannot
live in shared code — it has to live in per-skill data that a generic engine
consumes.** See §7.

**Attempt F — process failures, not product fixes.**
Noted separately because they cost real time: repeated re-reading/re-planning
loops instead of implementing; over-indexing on "all unit tests pass" while
the real counsel-facing case stayed broken; treating healthy pipeline logs as
"fixed" when the actual document review was still wrong. Worth calling out
explicitly for whoever does the rebuild: **green tests and clean logs are not
sufficient evidence of correctness for this system. The real DPA / real
document case is the actual acceptance bar.**

### Standing lessons (both threads agree on these independently)

1. Related evidence is not proving evidence — this is the actual unsolved
   problem, not a bug to patch.
2. Unit-test-green does not imply user-case-correct.
3. Correct linkage (finding attached to the right requirement) does not
   imply correct evidence (the finding actually proves that requirement).
4. Regime-specific proof logic belongs in skill-authored data, never in
   shared ACT code — this was tried the other way and made things worse.
5. A general contradiction guard (status cannot contradict its own stated
   rationale) is still worth having, but must not be regime-specific in how
   it's implemented.

---

## 6. Reference: full forensic investigation

The complete forensic document (`ANALYSIS-POINT-1-EVIDENCE-JUDGEMENT-AGGREGATION-FORENSIC.md`)
contains, beyond what's summarized in §3a/§5:
- The full current ACT data-flow diagram (PLAN classify → packages →
  extract_shared_evidence → candidateRefsByRequirement → evaluate_package →
  isolateAndNormalize/forceInsufficient → groupedResultsToFindings →
  flag_risk/check_against_rule → aggregate_requirements → render)
- A full per-requirement trace table for the live Cisco run
- A hypothesis scorecard (10 hypotheses tested against the reproduction
  probe, each marked confirmed/rejected/contributing)
- A list of missing deterministic test fixtures (5 specific cases) that
  should be written as part of the rebuild's acceptance suite, not
  afterward
- Live-run-vs-golden-expectation table for the Cisco fixture specifically

Recommend attaching that document in full alongside this brief for anyone
doing the actual ACT rebuild — this brief summarizes it but the file/line
detail is worth having on hand.

---

## 7. A candidate direction (starting hypothesis for research — not decided)

This is one proposal to evaluate, refine, or discard during research — not an
instruction to implement as-is.

**Core idea: make "does this evidence prove this proposition" an explicit,
generic verification step, with regime-specific proof criteria supplied as
skill-authored data rather than hardcoded logic.**

1. **Extend the requirement/skill schema with explicit proof criteria**, not
   just keyword hints. Instead of (or in addition to) a hint list, a skill
   author writes what actually counts as proof, in prose, per requirement —
   e.g. for `duration`: *"proven by text stating or clearly implying how long
   the processing/agreement continues — an explicit term, an end condition,
   or an express reference to the term of the underlying agreement.
   Termination or data-deletion language alone does not establish duration
   unless it also states the term."* This is exactly the kind of thing
   Attempt E hardcoded as regex for one regime — the fix is making it
   author-supplied data, general by construction, instead of code.

2. **Add one generic, reusable verification capability** — the ACT
   equivalent of the evidence-verification discipline already used in the
   Drafting module's `run-critique` (no claim accepted without a literal,
   checkable quote backing it). Given a candidate quote and the proof
   criteria for the requirement it's being considered for, it returns a
   structured verdict: proves it / related but does not prove it /
   contradicts it. One function, same shape for GDPR, HIPAA, or a
   dynamically-generated ad-hoc question — only the criteria vary.

3. **For ad-hoc, un-authored asks** ("does this NDA cover subcontractors"),
   PLAN generates proof criteria in the same shape a skill author would
   write, from the user's own phrasing, and feeds it through the identical
   generic verifier. This is what answers the "can't hardcode n compliance
   checks" objection — the mechanism is general-purpose; only the criteria
   text varies per ask, which is unavoidable no matter what architecture
   surrounds it, because "what counts as an answer to this question" is
   inherently question-specific.

4. **This sits alongside, not instead of, the identity/aggregation fixes
   already proven correct in §3a/§5** — canonical requirement identity,
   risk/compliance channel separation, deterministic (not first-wins)
   judgement merge should all be treated as required properties of whatever
   the new ACT pipeline looks like, not something to re-derive from scratch.

Open research questions this should resolve, not answer in advance:
- Where exactly does verification sit relative to extraction/isolation —
  before scoring (verify candidates, then rank only verified ones) or after
  (rank by topical proximity first, then verify only top-K)? Cost/latency
  tradeoff worth quantifying.
- Should the six-plus current overlapping mechanisms (packets, hints,
  `forceInsufficient`, umbrella members, consolidation keys, letter keys) be
  deleted wholesale and replaced, or are some still structurally necessary
  underneath a new verification layer? Recommend an explicit keep/delete
  decision per mechanism rather than a blanket rewrite.
- How does the general contradiction guard (status cannot contradict its own
  rationale) get implemented without becoming regime-specific — is this a
  property the verification step itself should guarantee by construction, or
  a separate check?
- For open-ended analysis (no pre-built requirement/skill at all) — does
  claim/hypothesis generation happen in PLAN (before ACT ever runs) or
  dynamically inside ACT? This determines whether ACT needs to stay a fixed
  executor of a PLAN-supplied list, or needs its own limited
  discovery/expansion capability.

---

## 8. Definition of done for the rebuild

The real acceptance bar, per the explicit lesson in §5: **passing on the real
Cisco Article 28 DPA, not just new unit tests.**

Minimum bar, adapted from the forensic doc's appendix:

| Requirement | Expected |
|---|---|
| Duration | Present, evidence is the actual term clause, not termination/deletion language |
| Controller obligations | Present |
| Confidentiality | Present / Strong, evidence is the confidentiality clause, not security language |
| Audit | Minor drafting gap (partial) is a legitimately fair result here — the point is it should be independently derived, not inherited from a shared risk pool |
| Subject matter | Present when the agreement provides baseline processing description |
| Data-subject categories (pointer-only in source) | Cannot determine — legitimately, not disguised as conditional via unrelated risk mix |

Plus, structurally:
- Six distinct PLAN requirements produce six distinct assessments (no
  duplicate native-alias rows)
- No two unrelated requirements share supporting findings or near-identical
  summary text
- No row where status is Present/Strong while its own rationale denies
  coverage
- The five missing deterministic fixtures listed in the forensic document
  (§J there) pass
