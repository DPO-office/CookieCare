# Compliance checking

## Entry points and ownership

Application callers use `runCompliancePipeline(state)` from `index.ts`. The thin application entry point delegates to `runtime/index.ts`; tests can inject the completion client, investigation service, event sink, clock, and rollout mode through `executeCompliancePipeline`.

Default pipeline (previous verification restored):

```text
PLAN selections -> expected-check ledger -> graph investigation
  -> previous deterministic + LLM verification -> validation / canonical swap
  -> previous assessment and lock -> coverage-preserving report snapshot v2
```

- `contracts/`: provider-independent check, evidence, verification, and outcome types.
- `investigation/`: existing graph retrieval and expansion; no verification implementation imports.
- `verification/`: retained refactor-era judgment/validation helpers; not the default previous verifier.
- `assessment/`: retained pure aggregation/lock helpers, also used to preserve incomplete report rows.
- `runtime/`: per-run ledger, initial investigation scheduling, rollout and application orchestration.
- `adapters/`: application state and report/persistence translation.
- `diagnostics/`: observational events and qualification; never the source of canonical results.
- `legacy/`: previous verifier (now default) at its historical compatibility paths.
- `legacy/multi-pass/`: archived repeated-investigation/review runner. Only the rollout adapter loads it.

This rollback parks the expensive runner; it does not delete the pure helpers or
undo unrelated investigation, skill, UI or reporting changes. The old `canonical`
mode name is retained for explicit experiment compatibility, not as a recommendation.

The presentation writer, checker, renderer and storage remain under reporting. Cross-module consumers use explicit public exports. Fixtures may exercise private pure helpers.

## Identity and legal ownership

A check is identified by skill, atomic rule, and explicit document review scope. Multiple facets can bind to it; different documents cannot overwrite one another. A selected rule without an execution binding remains an incomplete check with unavailable scope; it is not silently dropped or assigned a guessed document. Rule hashes include the checklist and aggregation. Document hashes identify the canonical source text. Evidence hashes include passages, original roles, contribution IDs, dependencies and coverage metadata, not just span IDs.

PLAN, investigation and check identity still use the atomic skills. Their compiler
does not import ACT schemas or synthesize a mandatory E1. However, the restored
previous verifier still uses its historical schema lookup and aggregation. This is
an intentional temporary rollback boundary, not a claim that every active stage
already uses the same skill checklist. Schema mapping, synthesized E1 fallback and
completeness handling remain follow-up problems; no legal definitions were edited
as part of parking the multi-pass runner.

## Evidence and statuses

Primary/supporting/context are investigation classifications, not compliance verdicts.
Supporting clauses remain in the supplied bundle. The archived multi-pass engine
requires independent review of reassessments; the restored previous engine uses
its earlier verification policy without that added review loop.

Search execution and missing proof are separate facts in graph-native bundles.
The previous compatibility adapter still passes the older `investigationComplete`
flag. The rollback removes two refactor-added blanket Cannot determine overrides
from previous Assess and Lock, restoring their earlier aggregation behavior.
The original `GAP_WITHOUT_COMPLETENESS_BASIS` lock gate remains: an unsupported Gap
is rejected and preserved as an incomplete report row. The flag's meaning and the
separate aggregation implementations still need a focused follow-up fix.

Coverage issues carry affected elements and materiality separately from execution. Pure orientation pruning is immaterial, not a failed search. Unique element proof and known blockers are retained ahead of redundant passages. Unclassified candidates, source errors and failed reviews remain execution problems. Historical string-only coverage is not silently upgraded. Dependencies retain graph edge IDs and their original reference wording; missing dependency judgments remain unknown rather than invalidating independent facts.

Present, Partial and Gap concern the reviewed contract scope, not the organization's real-world legal compliance. Cannot determine, Conflicting and Judgment required preserve uncertainty. A failed call, unavailable baseline, invalid matrix or rejected lock produces an explicit Verification incomplete outcome.

Every selected check has an outcome ID. Only accepted assessments have a lock ID. Report snapshot v2 and every presentation mode preserve all outcome rows; unresolved PLAN facets also remain visible. Version-1 adaptation preserves historical conclusions without silently rejudging them.

## Rollout and budgets

`COMPLIANCE_VERIFICATION_MODE=legacy|shadow|canonical`, default **`legacy`**.

- `legacy`: runs previous verification, assessment and locking only. No archived
  verification-driven investigation rounds or independent review calls.
- `canonical`: explicitly runs the archived multi-pass experiment.
- `shadow`: explicitly runs both; it is not a performance test of the previous path.

Shadow runs both verifiers against the same original graph bundle, displays coverage-preserving legacy outcomes and records proposed decisions separately. Additional canonical evidence is versioned; comparison records baseline and evidence hashes. Legacy mode also repairs missing report coverage. Keep rollback for one release; do not remove compatibility facades until non-compliance consumers migrate.

Archived multi-pass settings remain available for replay (not promises about the
previous verifier's own provider controls):

- `ANALYSIS_COMPLIANCE_SIDE_CHANNEL_CONCURRENCY`: default 4 concurrent model calls, shared across verification and investigation for the run. Independent initial investigation batches run concurrently. Checks do not hold model permits while retrieving evidence. Token accounting uses per-call deltas.
- `ANALYSIS_COMPLIANCE_SIDE_CHANNEL_STAGE_BUDGET_MS`: optional emergency deadline; no shared 45-second deadline by default. Explicitly configuring this value can produce unfinished-check outcomes.
- `COMPLIANCE_VERIFICATION_DISABLE_TIME_BUDGET=true`: overrides the optional shared deadline. Provider/infrastructure failures, cancellation, input limits and retry limits still apply. The two-to-three-minute latency target is not an automatic cutoff.
- Complete verifier input is bounded to 120000 characters; it is never silently clipped.
- One invalid-output repair supplied with the actual failed response; at most two additional searches per check, stopping when evidence is materially unchanged. Wording, ordering and confidence-only changes are audited without repeating legal judgment.
- When explicitly configured, repairs share the verification stage deadline; final targeted review has its own stage deadline. Late responses do not replace finalized outcomes. Abort signals are propagated to model calls.

The execution-policy event and pre-report `verificationExecution` now explicitly
name `engine`, `archivedMultiPassEnabled`, `verificationEvidenceRetryLimit`, and
`independentReviewEnabled`. In legacy mode expect `engine: previous`, false, 0,
and false respectively. The existing concurrency/deadline fields describe the
shared run wrapper; the previous verifier retains its existing provider controls.
Restart the backend and start a fresh analysis after changing modes.

## Debugging and extension

For attempt-by-attempt file diagnostics, enable `ANALYSIS_DUMP_COMPLIANCE_VERIFICATION=1`. See `temp/compliance-verification/README.md` under the analysis module. That opt-in trace retains raw model responses, validation and repair errors, reviewer differences, additional-investigation activity, and the actual assessment/lock stopping gate. The pre-report dump contains `verificationDiagnostics` with the run directory and any file-write errors. Tracing explains existing policy and does not relax it.

`compliance.model.queue` separates queue delay from model-processing time. Windows summary locks receive bounded asynchronous replacement retries; the previous readable summary is never deleted. Node test workers disable global live-run dumps; diagnostic tests opt into their own temporary directories.

In previous mode, inspect the session `.compliance.log` for legacy verification,
assessment and lock events, then `handedToReporting.rows` in the pre-report dump.
`proposedOutcomes` describes the archived engine and is empty when it did not run;
it is not the previous verifier's outcome list. Expected and rendered check IDs
must still match. In experimental modes, the detailed per-attempt trace is available
and shadow decisions have the `compliance.shadow.*` prefix.

To add a rule, edit its skill's atomic checklist and authority, specify element kinds, conditional applicability and any all/any aggregation, bump the verification version, and run skill lint. Keep review status authored until counsel signs off. Change semantic behavior in verification; aggregation belongs in assessment, never in reporting or diagnostics.

From `backend/`:

```text
npm run lint
npm run lint:skills
npm run audit:skills:investigation
npm run test:compliance
npm test
npm run compliance:qualify -- <session.compliance.log>
```

Targeted tests are under each module's `__fixtures__` and the root fixtures. The frozen DSR v1 record includes source hashes, ten assessments, six rejected locks and four historical rows; it is an observed regression, not reviewed legal gold. Promotion still requires reviewed semantic examples across all six regimes, complete check-ID preservation, and passing repository qualification.
