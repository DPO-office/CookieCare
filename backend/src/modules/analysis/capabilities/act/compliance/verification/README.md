# Evidence verification

Execution note: these refactor-era helpers are retained for the archived multi-pass
runner and tests. The default application path is now the previous verifier through
`runtime/rollout.ts`; it does not call this module's independent-review workflow.
See the root README before choosing an entry point.

Public API: `verifyRequirement`, `runVerification(request, complete, signal)`, `reviewDecision`, `validateVerification`, `locateSourceQuote`, and the existing-provider completion adapter. Runtime uses first-pass verification, resolves bounded additional-evidence requests, then performs final targeted review. `runVerification` remains the direct first-pass-plus-review convenience API.

An optional `VerificationTrace` observer records request versions, actual model prompts and response schemas, parsed raw responses, validation failures, repair inputs, provider errors, and both second-review decisions. Runtime supplies it with per-check round/phase identity. The file implementation and privacy/retention instructions live in `temp/compliance-verification`; validation never depends on whether logging succeeds.

A request contains a compiled atomic rule, scope and source versions, complete selected passages, investigation coverage and PLAN questions. Verification never searches a graph itself. It returns a validated element decision, an explicit incomplete result, and optionally a typed additional-evidence request; runtime performs bounded investigation through its public API.

## Worked example

A passage retrieved as supporting says the processor follows the customer's written instructions. The instructions element may be supported if the exact passage establishes the operative duty. The response cites its evidence ID and exact quote, explains the contribution, and records a role reassessment. Hard validation checks the source range and scope; targeted independent review must agree. The original role remains supporting.

A heading called "Instructions" alone is not proof. "No primary evidence" does not erase the supporting passage or automatically make it sufficient.

Protocol 2 sends each exact quote once in a shared citation registry. Element proof, actor scope and concerns reference citation IDs; the validator expands these into the existing source-mapped domain citations. A missing-duration element can cite a definition as related role context without falsely promoting it to proof. Actor-scope labels use the existing canonical relationship vocabulary, and unspecified retrieval metadata alone does not require a second review when the model supplies grounded compatible scope.

Missing dependency assessments are retained as unknown and can request investigation even when element verdicts say supported. Narrative answers are optional factual enrichment: invalid links become warnings, not matrix-wide failure. A failed element does not erase independently validated elements, but an incomplete matrix is not a legal Gap. A repair sees the failed response plus errors. The exact-source, identity, required-element, N/A and incompatible-scope guards remain enforced.

Final review still reads the full versioned baseline and bundle. Comparison excludes immaterial notes and immaterial dependency mappings, but material disagreements remain judgment required. Review is never automatically repeated for intermediate evidence versions.

## Where changes belong

- Payload and instruction/facet context: `build-request.ts`.
- Semantic instructions: `prompt.ts`; legal meaning belongs in the skill.
- Provider adaptation: `model-client.ts`.
- Structural, citation, version, applicability and scope checks: `validate-result.ts`.
- Provider wire schema and shared-citation expansion: `response-schema.ts`.
- One-repair protocol and additional-evidence request: `verify-requirement.ts`.
- Independent review and disagreement: `review-decisions.ts`.
- Per-check public composition: `run-verification.ts`.

Normalized quotations are mapped back to exact original substrings and offsets. Fabricated or ambiguous quotations fail validation. Supported and contradicted verdicts require corresponding proof/conflict citations. Input-budget overflow is explicit; no 900-character clipping is used.

Tests use an injected completion client. Add a fixture whenever introducing a new distinction (assistance versus direct duty, conditional scope, limitations, or joint support). A reviewer agreeing with a result is not a substitute for source validation, and unresolved disagreement is never resolved by selecting the more positive status.
