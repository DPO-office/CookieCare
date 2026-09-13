# Previous verifier and archived experiment

The previous verifier in this folder is now the default application execution path
(`COMPLIANCE_VERIFICATION_MODE=legacy`). Its historical paths are retained to avoid
breaking existing consumers. The newer expensive runner has been moved into
`multi-pass/`; it runs only for explicit `canonical` or `shadow` experiments.

This rollback restores the previous decision policy by removing the refactor-added
blanket incomplete-investigation overrides in Assess and Lock. Their absence was
verified against the earlier checked-in Phase 5 and Phase 6 source. The original
Gap completeness gate and citation/identity validation remain enforced.

It does not fix every previous-verifier defect: the adapter still mixes missing
proof with incomplete search, and historical schema lookup can mismatch rule IDs.
Those need separate fixes; restoring old behavior is not legal qualification.

This folder retains the previous lexical verifier, per-regime schema registries, LLM canonical-swap flow, assessment, locking and projection for one rollback release. New orchestration may execute it only through `runtime/rollout.ts`. Root compatibility re-exports remain for persisted and non-compliance consumers and existing regression tests.

The previous engine retains its historical run tracker for its verification and
assessment results. The outer runtime independently owns expected-check identity
and creates visible incomplete rows when that engine or its locks produce no row.
The archived multi-pass experiment uses an explicit per-run outcome ledger.

Relevant proof guidance and non-proof distinctions were transferred into atomic skill contracts. Richer existing rule checklists were retained; coarse profiles with matching schemas gained their authored decomposition. Cross-instrument alias collisions (including CCPA security resolving to GDPR) were not adopted. Shared transfer schemas contribute only relevant non-proof distinctions, not additional unselected obligations. Migrated content remains authored, not legally reviewed.

Historical DSR v1 records the old ten-assessment/six-rejection/four-row failure. Do not update it to pretend the historical analysis used current rules. New source/rule versions must be separate fixtures.

Do not remove either implementation during this baseline-testing step. Future
replacement requires migrated consumers, qualification and reviewed semantic
examples. Non-compliance compatibility must be explicitly preserved.
