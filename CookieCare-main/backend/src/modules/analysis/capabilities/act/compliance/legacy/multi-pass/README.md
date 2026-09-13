# Archived multi-pass verification

This is the parked orchestration responsible for repeated additional investigation,
re-verification, and independent second review. It is not the default application path.

`execute-checks.ts` retains the implementation rather than deleting or rewriting it.
It uses the existing pure verification/assessment helpers and shared runtime contracts;
those helpers remain in their public modules for compatibility and tests. This is an
archive of the multi-pass runner, not a claim that every refactor-era file moved here.

Only `runtime/rollout.ts` loads this runner. `runtime/execute-checks.ts` is a compatibility
facade used by replay tests. The historical `canonical` mode explicitly selects this
experiment; `shadow` runs it alongside the previous verifier and is also opt-in.
Neither mode is the default or needed for testing the restored previous path.

Default execution is `COMPLIANCE_VERIFICATION_MODE=legacy`: graph investigation, the
previous deterministic/LLM verifier, previous assessment and locking, and the retained
complete report handoff. Do not remove citation checks or force affirmative results
when investigating its remaining completeness/rule-identity problems.

## Refactor-added overrides removed from the previous engine

The older checked-in Phase 5/6 code did not contain these later additions:

- Assess: a blanket early `cannot_determine` with reason
  `INVESTIGATION_COVERAGE_UNCONFIRMED` whenever verification was complete but the
  older investigation flag was false.
- Lock aggregation: an early `cannot_determine` whenever that same flag was false.

Those two overrides were undone as part of the behavioral rollback. The archived
multi-pass engine's own assessment policy remains unchanged. The previous engine's
original `GAP_WITHOUT_COMPLETENESS_BASIS` lock check was not removed.
