# Compliance investigation

This folder owns Phase 3 evidence investigation. Its only authoritative inputs are:

1. `run_compliance_pipeline` work units;
2. PLAN's frozen `complianceRequirementResolution`;
3. the selected skills' atomic `regimeRules[].investigation` profiles; and
4. each workspace document's upload-time `structureGraph`.

`requirementBindings` and package evidence profiles are read only by the
off-mode/persisted-plan compatibility path. They are not requirement-selection
authority in shadow or canonical graph-native investigation.

It has no dependency on ACT element-schema registries. Investigation uses compiled
atomic skill rules. The archived multi-pass verifier consumes the same identities;
the restored previous verifier still has its historical schema adapter, which is a
known follow-up boundary rather than a dependency of investigation.

## Flow

`requirement-source` resolves the selected skill requirement, `evidence-index` projects searchable graph leaves, `build-queries` creates exact/sparse/dense query arms, and `hybrid-retrieval` fuses their results. `rerank-evidence` assigns evidentiary roles without deciding compliance. `expand-evidence` follows only bounded resolved graph relations, and `build-bundle` validates and budgets the final evidence. `run-investigation` coordinates those steps.

`legacy-retrieval` is retained for the shadow comparison and one rollback window. The root `retrieve-compliance-evidence.ts` file is only a compatibility re-export.

## Rollout

Graph-native investigation is canonical. `complianceInvestigationMode()` returns `canonical`; the former `COMPLIANCE_INVESTIGATION_MODE` switch no longer selects a retrieval path.

Verification has its own `COMPLIANCE_VERIFICATION_MODE=legacy|shadow|canonical` switch,
now defaulting to `legacy` (previous verification). Only explicit archived
`canonical`/`shadow` execution can request additional searches. The default previous
path consumes the initial graph-native result without that added loop. Graph
retrieval and expansion algorithms are unchanged by the rollback.

Bundles expose executionStatus and coverageReasons separately from unresolved proof elements and the compatibility investigationComplete flag. A completed search with no primary evidence is not necessarily an execution failure. Original evidence roles, actor scopes, dependency states and source ranges remain available downstream.

Bundles also expose element-scoped coverageIssues. Pruning pure orientation text is immaterial; unknown omissions remain unresolved. Unique element proof and known limitations, contradictions and dependencies are not discarded to satisfy fixed presentation quotas. The downstream verifier enforces the full-text input budget. References preserve graph edge identity and exact mention context. None of these changes replace hybrid graph retrieval.

Independent candidate-review batches run concurrently within the runtime's shared model-call pool. Expansion review still follows initial review. Per-call token deltas are summed safely. Additional requests can explicitly include already-resolved, in-scope graph target nodes for review.

Missing bindings, skill evidence profiles, or canonical graphs produce explicit incomplete bundles. Dense-index failures degrade to exact-anchor plus BM25 retrieval.
