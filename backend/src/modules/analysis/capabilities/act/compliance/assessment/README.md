# Assessment and locking

Execution note: these shared helpers remain available for archived-engine tests and
coverage-preserving incomplete outcomes. Default previous verification retains its
own assessment and lock policy; this rollback has not unified those implementations.

Public API: `aggregateElements`, `assessRequirement`, `lockOutcome`. These functions are pure; no model, global tracker, graph retrieval or reporting imports are permitted.

Diagnostic callers can use `assessRequirementWithReason` and `lockOutcomeWithAudit`. These expose the same policy's first stopping gate and individual lock-validation failures; they do not apply a second assessment policy. Runtime writes their returned audit through the opt-in file trace under `temp/compliance-verification`. The audit retains the original verification result, including errors and attempt counts even when the final report outcome is incomplete.

## Worked example

An applicable rule requires an instructions obligation and a controller-notification proviso. If instructions are proven but the proviso is absent after adequate review, all-group aggregation returns Partial. If the proviso may be in an unresolved annex, the result is Cannot determine. A missing primary label is neither N/A nor a legal gap by itself.

Lock uses the same assessment policy and checks identities and exact citations. Invalid lock input becomes a stable incomplete outcome with available source evidence, not a discarded row. An empty applicable-element set never yields Present.

Excluding an extra introduction does not make an otherwise completed search fail: an explicitly immaterial coverage issue does not block aggregation. Missing operative evidence, unknown coverage materiality, unresolved references, and actual execution failures still block affected conclusions. Historical records with unknown coverage stay unknown. Incomplete outcomes can carry independently validated elements; reporting must not relabel all elements as missing.

## Extending the policy

Change generic all/any evaluation in `aggregate-elements.ts`. Applicability, execution coverage, material dependencies, conflicts and judgment-required treatment belong in `assess-requirement.ts`. No law-specific element IDs belong here.

Explain established facts and remaining proof in `build-explanation.ts`. Rule-specific proof and remediation guidance remain in skills. Source-validation defense and final outcome identity belong in `lock-outcome.ts`.

When debugging disagreement, reproduce it with the same request and validated decision and assert Assess and Lock return the same status. Test material, immaterial and unknown dependencies separately. Reporting must not retry aggregation or rank competing statuses.
