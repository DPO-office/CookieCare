# Claude implementation brief: simplify compliance verification

## 1. Objective

Simplify the active compliance verification path to this model:

```text
Selected check + compiled skill rule + investigation bundle + user questions
  -> one LLM verification call
  -> hard grounding and completeness validation
  -> one shared assessment/lock policy
  -> one visible report outcome
```

If PLAN selects `N` checks, the normal path must make `N` initial verification calls and preserve `N` terminal outcomes:

```text
PLAN N -> Investigation N -> Verify N -> Assess/Lock N -> Report N
```

For example, ten requirement bundles must normally produce ten LLM verification calls and ten report rows. A rule can contain four or more proof elements, but all of those elements are judged together in the single call for that rule. Do not make one LLM call per proof element.

This work must keep the improvements that matter:

- Atomic skill rules are the single legal source of truth.
- Every selected check survives to the report.
- Citations and quotations are validated by code.
- User-specific questions are answered from the same evidence.
- Assessment and Lock use one status policy.
- Calls are bounded and parallel.

Do not restore duplicate ACT verification schemas as the canonical baseline, and do not preserve the newer multi-pass behavior in the normal path.

## 2. Confirmed current behavior and root causes

### 2.1 Call-count correction

The previous verifier already sends all elements of one requirement in one prompt. It uses `runBoundedWithBudget(...)` with `ANALYSIS_COMPLIANCE_SIDE_CHANNEL_CONCURRENCY`, defaulting to four workers.

Therefore:

- Ten bundles do **not** mean forty calls when each rule has four elements.
- Ten bundles normally mean ten initial verification calls.
- One validation repair may add one extra call for an invalid response, so the upper bound is `N + repairCount`, where `repairCount <= N`.
- The deterministic verifier performs no LLM calls. Removing it will simplify the pipeline and eliminate conflicting verdict paths, but it is not the main source of ten-minute latency.

The approximately ten-minute run came from the newer multi-pass design. That run scheduled 73 model operations: initial investigation, additional investigation rounds, initial verification, reverification, targeted review, and repairs. These loops must not run routinely.

### 2.2 Why ten old findings became four report rows

The historical failure was:

```text
10 investigated
-> 10 verified
-> 10 assessed
-> 6 lock rejections
-> 4 projected report rows
```

Six assessments were classified as Gap while their coverage metadata said investigation was incomplete. Lock rejected them with `GAP_WITHOUT_COMPLETENESS_BASIS`. The report projector then iterated only accepted locks, so rejected checks disappeared.

Lock was not merely protecting the report. It became a destructive filter.

The required fix is not to weaken grounding. It is to preserve every check:

- A valid assessment produces a locked assessment outcome.
- A rejected, failed, timed-out, or unavailable assessment produces an explicit incomplete outcome.
- Both kinds receive stable outcome IDs and both are reported.
- No projector may filter the canonical check ledger down to accepted locks only.

### 2.3 Coverage was being confused with proof

The previous adapter treated unresolved proof elements as if the investigation itself had not completed. These are different facts:

- **Search execution:** Did investigation finish the intended search?
- **Proof result:** Did that completed search establish the required legal element?

A completed search that finds no clause can support a scoped Gap. Missing primary evidence does not by itself mean search failure, and it never means Not applicable.

### 2.4 Requirement identity is unsafe

The current compatibility path has produced incorrect canonical mappings, including examples such as:

- `gdpr.art28.1` mapped to `gdpr.art89.1`
- `gdpr.art28.2` mapped to `gdpr.art42.2`
- `gdpr.art28.4` mapped to `gdpr.art12.4`

It has also synthesized fallback baselines such as `auto-0.1.0` and mandatory `E1` elements. Fuzzy identity conversion and synthesized legal requirements must not be used in canonical verification.

## 3. Required normal execution path

### 3.1 Inputs per check

Build exactly one verification request for each expected check. It must contain:

- Stable `checkId` from skill ID, rule ID, review scope, and document scope.
- Exact `skillId` and `ruleId` selected by PLAN.
- Compiled rule version and hash.
- All proof elements for that rule, including kind, applicability, proof guidance, non-proof distinctions, alternatives, dependencies, and aggregation.
- Versioned evidence bundle and complete selected passage text.
- Evidence role and limitations from Investigation.
- Search execution state: `complete`, `incomplete`, or `unknown`.
- Document IDs/hashes and bundle version/hash.
- Request-facet bindings, party perspective, and selection reasons.
- User-specific questions relevant to this check.

Do not silently clip a passage at 900 characters. If a request cannot fit the configured input limit, create `verification_incomplete: input_budget_exceeded` for that check.

### 3.2 One semantic verification call

The LLM judges every proof element and every custom question for one check in one structured response.

For each proof element it returns:

- `elementId`
- evidence verdict: `supported`, `contradicted`, `not_located`, `ambiguous`, or `unresolved_dependency`
- applicability: `applicable`, `not_applicable`, or `unknown`, with a grounded basis
- cited evidence span IDs
- exact quotes
- evidence contribution: individual, joint, contextual, or insufficient
- established fact
- missing proof
- limitations and conflicts
- original evidence role and any proposed role reassessment with explanation

It also returns evidence-linked answers to the user-specific questions. Those answers may shape the report explanation, but they must not alter the authored legal checklist or create unselected obligations.

Supporting passages remain available when primary evidence is missing. The model may find that supporting passages jointly establish an element, or that they are useful but insufficient. It must not automatically promote supporting evidence simply because no primary evidence exists.

### 3.3 Hard validation

Code, not the model, validates:

- Exactly one result exists for every expected element ID.
- No invented or duplicate element IDs exist.
- Check, skill, rule, bundle, scope, and version identities match the request.
- Cited span IDs exist in the supplied bundle.
- Every quote is an exact substring of the cited source after normalized matching is restored to the exact source substring and offsets.
- Supported and contradicted verdicts have nonempty citations and quotes.
- Evidence actor scope is compatible with the rule.
- Not applicable has an affirmative, cited applicability basis; silence is insufficient.
- Role reassessment is explicit and explained.
- Custom answers do not cite evidence outside the request.

If validation fails, perform at most one targeted repair call for that check using the validation errors. If repair also fails, emit an explicit `verification_incomplete` outcome while preserving any independently validated evidence and facts.

Do not fall back to a deterministic legal verdict after an invalid LLM response.

## 4. Remove deterministic legal judgment from canonical execution

`verify-evidence-deterministically.ts` must not produce the canonical legal matrix and must not be a fallback for model failure.

It may temporarily remain only for:

- historical replay tests;
- shadow diagnostics comparing old behavior;
- noncanonical development tooling.

Exact ID checks, quote matching, schema completeness, scope validation, hashing, and aggregation remain deterministic. The removal applies to keyword-based **legal judgment**, not to structural validation.

The canonical behavior on model failure is honest incompleteness, not a keyword-generated Gap, Present, or Not applicable result.

## 5. Skills are the single legal source of truth

Canonical verification must resolve the exact atomic rule selected by PLAN and compile it through the skills runtime.

Investigation, Verify, and Assess must consume the same compiled representation and the same versioned proof-element identities.

Required rules:

- No canonical import of ACT element-schema registries.
- No lookup by loose aliases after PLAN has selected an exact rule ID.
- No `canonicalRequirementId(...)` fuzzy substitution.
- No synthesized mandatory `E1` baseline.
- No package-owned proof standard or duplicate checklist.
- If the selected rule is absent or invalid, return `baseline_unavailable` for that check.

The skill compiler should expose a generic contract such as:

```ts
interface CompiledComplianceRule {
  skillId: string;
  ruleId: string;
  version: string;
  hash: string;
  proposition: string;
  applicability: CompiledApplicability;
  elements: CompiledProofElement[];
  aggregation: CompiledAggregation;
  remediationGuidance?: string;
}
```

If the previous verifier needs its old schema shape temporarily, create one narrow adapter from `CompiledComplianceRule` to the request shape. Do not author or maintain a second legal definition.

## 6. Evidence and coverage policy

Preserve these independently:

```ts
type InvestigationExecution = "complete" | "incomplete" | "unknown";
type EvidenceAvailability = "found" | "none_found" | "unknown";
```

Also preserve unresolved references, dependency materiality, actor scope, passage role, contribution IDs, source offsets, and limitations.

Apply these rules:

| Situation | Permitted result |
|---|---|
| Search complete, applicability established, required proof absent | Gap within reviewed scope |
| Some required elements proven, remaining shortfall established after complete search | Partial |
| Search incomplete or unknown and missing proof is material | Cannot determine / insufficient evidence |
| Applicability condition affirmatively established as false | Not applicable |
| Applicability merely not mentioned | Unknown applicability, not N/A |
| Supporting evidence exists but is insufficient | Preserve and explain it; do not call it no evidence |
| Operative conflict in evidence | Conflicting |
| Model/reviewer disagreement unresolved | Judgment required |
| Baseline missing, timeout, invalid model output, or budget failure | Explicit incomplete outcome |

Do not infer that investigation is incomplete merely because `unestablishedElementIds` is nonempty.

## 7. Assessment and Lock

Create one pure aggregation function used by both Assess and Lock. It must operate on generic proof-element kinds and rule-authored `all`/`any` groups, with no hardcoded GDPR element IDs.

Canonical statuses are:

- Present
- Partial
- Gap within reviewed scope
- Cannot determine / insufficient evidence
- Not applicable
- Conflicting
- Judgment required
- Verification incomplete
- Baseline unavailable

Lock must validate identity, evidence grounding, versions, and the result of the shared aggregation policy. It must not independently recompute status using different rules.

If a proposed assessment fails Lock validation:

1. Record the rejection reason.
2. Finalize the same check as an explicit incomplete outcome.
3. Preserve validated evidence, facts, and limitations.
4. Keep the check in the canonical ledger and report snapshot.

Never delete or omit the check.

## 8. Expected-check ledger and report preservation

Initialize an expected-check ledger immediately after PLAN resolves checks and before Investigation starts.

Each ledger entry records:

- `checkId`
- skill/rule/version identity
- document scope
- request facets and selection reasons
- bundle ID/version
- verification decision ID
- assessment ID, when valid
- terminal `outcomeId`

After every stage, reconcile exact check-ID sets. Missing, duplicate, or unexpected IDs are explicit diagnostics and terminal outcomes.

The report adapter must iterate the ledger/outcomes, not accepted locks. Every selected check gets exactly one row in every detailed report mode. Executive prose may summarize, but it may not replace complete detailed coverage.

Remove status-ranked deduplication. Repeated user facets can point to one check, but separate checks and separate document scopes must not overwrite one another.

## 9. User-specific questions

Pass questions generated from the original instruction and PLAN facets into the same per-check verification call.

Examples:

- Does the processor assist the controller with deletion requests?
- Does the contract define a response deadline?
- Which clause creates the obligation and which clause only provides context?
- What is missing for this user-requested issue?

Each answer contains:

- `questionId`
- concise answer
- cited span IDs and exact quotes
- confidence/limitation
- related element IDs

Failure to answer an optional narrative question must not erase an otherwise valid legal matrix. The output should mark that answer incomplete and preserve the check outcome.

## 10. Parallelism and performance

Use a single bounded worker pool for normal verification:

- Default concurrency: four checks.
- One initial call per check.
- Only the invalid check receives one repair call.
- Do not run automatic additional investigation.
- Do not automatically reverify a successful result.
- Do not run routine second-review calls.
- Do not split calls by proof element.

With ten checks and concurrency four, initial verification should run in roughly three model-call waves, not ten serial waves and not forty calls.

Do not batch multiple checks into one model call in v1. One check per call provides better identity isolation, citation validation, retries, and diagnostics. Consider batching only after the simple path meets correctness targets and measured provider overhead proves batching is necessary.

The complete feature includes PLAN, Investigation, Verify, Assess/Lock, and reporting, so verification parallelism alone cannot guarantee a two-minute end-to-end target. Instrument each stage and enforce this initial performance goal:

- Verification initial calls: exactly `N`.
- Verification total calls: at most `N + repairCount`.
- Default verification concurrency: four.
- No normal multi-pass operations.
- Target end-to-end p95 for v1: at or below two minutes on the agreed benchmark corpus, or provide stage-level evidence identifying the remaining bottleneck.

Do not solve latency by silently skipping checks or truncating evidence.

## 11. Logging and diagnostics

Write structured run diagnostics to files as well as the event sink. Every event must include `sessionId`, `runId`, `checkId`, `skillId`, `ruleId`, and stage.

Record:

- Expected and actual check-ID sets at every boundary.
- Bundle/version/hash and passage count.
- Investigation execution state separately from unestablished elements.
- Verification call number, start/end, latency, model, token usage, and repair reason.
- Validation errors.
- Assessment status and aggregation inputs.
- Lock acceptance or rejection code.
- Final outcome ID and report-row ID.
- Stage totals and peak concurrency.

Redact secrets and avoid logging full contract text by default. Store span IDs and hashes; allow an explicit local diagnostic mode for full evidence replay.

## 12. Module ownership

Do not create a third verifier. Modify the active previous-verifier path through clean public modules, while keeping the parked multi-pass implementation noncanonical.

Target ownership:

```text
compliance/
  contracts/       shared check, evidence, verification, and outcome types
  runtime/         ledger, concurrency, orchestration, rollout
  verification/    request builder, one-call verifier, prompt, validator, repair
  assessment/      pure aggregation, explanation, lock validation
  adapters/        skills, analysis-state, persistence, and report translation
  diagnostics/     typed events and file sink only
  legacy/          historical deterministic/schema code and parked multi-pass runner
```

Specific constraints:

- `run-compliance-check.ts` stays a thin entry point.
- Verification does not call Investigation directly.
- Diagnostics does not own business state.
- Contracts import no provider SDK, reporting code, or orchestration.
- Reporting consumes terminal outcomes through an adapter.
- The active path does not import from `legacy/` after migration is complete.
- Do not move the old monolith into a newly named file.

During incremental work, compatibility exports are acceptable, but every temporary dependency must have a removal test or tracked cleanup item.

## 13. Implementation sequence

### Step 1: Freeze and characterize

- Preserve the historical DSR fixture showing 10 assessments, 6 rejected locks, and 4 old report rows.
- Preserve a recent 14-check replay fixture.
- Add call counters and stage timing before changing behavior.
- Assert that one previous-verifier call contains all elements for one rule.

### Step 2: Establish exact identity and ledger

- Create expected check IDs from PLAN bindings.
- Remove fuzzy canonical-ID translation from the verification boundary.
- Reconcile N-to-N coverage at every stage.
- Make all missing checks explicit outcomes.

### Step 3: Compile skills into verification input

- Resolve exact skill/rule pairs.
- Compile proof elements and aggregation.
- Add the temporary compiled-rule-to-verifier adapter.
- Return `baseline_unavailable` instead of generating `E1`.

### Step 4: Make the previous one-call verifier canonical

- Build one request per check.
- Include all rule elements, full selected passages, coverage facts, and custom questions.
- Run four checks in parallel.
- Keep one validation repair only.
- Remove deterministic matrices from canonical swap/fallback behavior.

### Step 5: Correct coverage and statuses

- Separate completed search from proof completeness.
- Ground N/A affirmatively.
- Preserve supporting evidence and dependencies.
- Implement the shared aggregation table.

### Step 6: Unify Assess and Lock

- Use the same pure aggregation function.
- Turn every rejection into a visible incomplete terminal outcome.
- Remove accepted-lock-only projection.

### Step 7: Complete report handoff

- Project from outcome IDs/check ledger.
- Enforce one row per expected check.
- Add evidence-linked custom answers.
- Preserve negative and incomplete evidence.

### Step 8: Retire obsolete canonical dependencies

- Move deterministic legal judgment and duplicate ACT schemas to historical compatibility only.
- Keep the multi-pass verifier parked and disabled.
- Remove compatibility imports after callers and fixtures migrate.

## 14. Required tests

### Call-count and concurrency

- Ten checks with valid responses cause exactly ten initial calls.
- Four proof elements in one check still cause one call.
- One invalid response causes exactly one repair, for eleven total calls.
- Ten invalid responses never exceed twenty calls.
- Peak initial-call concurrency is four by default.
- No normal call is labeled additional-investigation, reverify, or second-review.
- Deterministic legal verification is not invoked in canonical mode.

### Coverage and identity

- `10 -> 10 -> 10 -> 10 -> 10` is enforced across the ledger.
- A lock rejection still produces a report row.
- Duplicate and unexpected check IDs are explicit failures.
- Multiple documents do not overwrite one another.
- Exact selected GDPR Article 28 IDs remain unchanged.
- Missing rules produce `baseline_unavailable`.
- No synthesized `E1` or fuzzy ID mapping occurs.

### Evidence and validation

- Exact and normalized quotes restore original source text and offsets.
- Fabricated span IDs and quotes fail validation.
- Text after character 900 remains available.
- Supporting-only, jointly sufficient, contextual, and contradictory evidence are distinguished.
- Controller duties are not proven by processor-assistance clauses and vice versa.
- Metadata-only bundle changes update the bundle version/hash.

### Coverage and status semantics

- Complete search plus absent required proof can become Gap.
- Incomplete search plus material missing proof becomes Cannot determine.
- Silence never becomes Not applicable.
- Grounded false applicability becomes Not applicable.
- Empty applicable-element sets never become Present.
- Material and immaterial unresolved dependencies are handled differently.

### Reporting and failure handling

- Provider failure, timeout, malformed JSON, failed repair, input overflow, missing baseline, and lock rejection each produce one visible outcome.
- All detailed report modes preserve every selected check.
- Custom answers are evidence-linked and do not alter aggregation.
- An invalid optional custom answer does not delete a valid legal result.

## 15. Rollout

Keep:

```text
COMPLIANCE_VERIFICATION_MODE=legacy|shadow|canonical
```

For this work, `legacy` means the currently active previous one-call verifier while it is being corrected. The parked multi-pass implementation must have an unambiguous separate internal name and must never be selected accidentally.

Recommended rollout:

1. Run characterization tests against frozen fixtures.
2. Implement identity, ledger, and row preservation first.
3. Run the simplified verifier in shadow against identical bundles.
4. Compare status, citation validity, call counts, and latency.
5. Promote only when acceptance gates pass.
6. Keep one rollback release, then remove duplicate schemas and deterministic canonical wiring.

## 16. Acceptance gates

The implementation is complete only when:

- One initial LLM call is made per selected check, with all its elements included.
- No routine additional-investigation, reverification, or second-review loop runs.
- Deterministic keyword matching is not a canonical judge or fallback.
- Atomic skill rules are the only canonical legal checklist.
- Exact rule IDs are preserved; no fuzzy substitutions or synthesized legal elements exist.
- Every selected check has exactly one terminal outcome and one detailed report row.
- Assessment and Lock use the same aggregation policy.
- Present, Gap, and N/A conclusions are grounded under the coverage rules.
- Citation and quote validation remains strict.
- User-specific questions are answered from the same call and evidence.
- Ten-check tests produce ten initial calls and ten rows.
- Historical DSR replay produces ten explicit outcomes rather than four rows.
- Structured file diagnostics explain every stage transition and failure.
- The agreed v1 benchmark reaches the two-minute p95 target or stage timings demonstrate the specific remaining non-verification bottleneck.

## 17. Non-goals

Do not redesign:

- PLAN rule-first routing;
- graph construction or core Investigation retrieval;
- PDF-to-skill ingestion;
- the LLM provider;
- visual report presentation;
- legal content for all six regimes as part of this code change.

Do not add automatic legal research, automatic rule authoring, routine re-investigation, or a second general-purpose verifier. Missing legal configuration or evidence must remain visible instead of being guessed.

