# ACT capability layout

`execute-act-plan.ts` is the dispatcher. It executes the work units selected by PLAN and routes each unit to the correct capability below.

## `compliance/`

The authoritative compliance-check pipeline.

- `run-compliance-check.ts` — runs the complete compliance flow from retrieval through the locked report snapshot.
- `compliance-runtime.ts` — owns pipeline state, diagnostics, timing, persistence events, and stage coordination.
- `compliance-schema-registry.ts` — resolves the element checklist used to verify each legal requirement.
- `retrieve-compliance-evidence.ts` — retrieves and expands relevant contract evidence for every requirement.
- `retrieve-evidence-with-llm.ts` — performs the bounded LLM retrieval fallback when deterministic retrieval is incomplete.
- `verify-evidence-deterministically.ts` — applies deterministic evidence checks to requirement elements.
- `verify-evidence-with-llm.ts` — asks the LLM to judge evidence bundles and validates its structured response.
- `llm-evidence-investigation.ts` — contains the separately flagged experimental LLM investigation path.
- `assess-compliance-requirements.ts` — converts verified element results into the eight compliance statuses.
- `lock-compliance-assessments.ts` — validates and locks assessments before reporting.
- `project-locked-compliance-report.ts` — converts accepted locks into report rows and the locked result model.
- `investigation-orchestrator.ts` — coordinates optional investigation queries and searches.
- `investigation-requirements.ts` — builds investigation instructions for resolved requirements.
- `investigation-types.ts` — defines investigation request and result types.
- `aiact-element-schemas.ts` — AI Act requirement element definitions.
- `ccpa-element-schemas.ts` — CCPA/CPRA requirement element definitions.
- `commercial-element-schemas.ts` — commercial-contract requirement element definitions.
- `dsr-element-schemas.ts` — GDPR data-subject-right element definitions.
- `gdpr-article-28-element-schemas.ts` — remaining GDPR Article 28 element definitions.
- `gdpr-security-element-schemas.ts` — GDPR security requirement element definitions.
- `hipaa-element-schemas.ts` — HIPAA requirement element definitions.
- `transfers-element-schemas.ts` — international-transfer requirement element definitions.
- `vendor-risk-element-schemas.ts` — vendor-control requirement element definitions used by compliance checks.

## `risk-review/`

Risk-review-specific work.

- `evaluate-risk-findings.ts` — evaluates evidence and emits individual risk findings.
- `derive-risk-summary.ts` — combines risk findings into the overall risk result.

## `operations/`

Reusable ACT work-unit handlers for non-canonical lanes such as comparison, playbooks, extraction, and generic review.

- `aggregate-requirement-results.ts` — combines findings into one result per requirement.
- `build-provision-inventory.ts` — creates structured inventories of contract provisions.
- `check-clause-coverage.ts` — checks whether expected clause categories are represented.
- `classify-document.ts` — applies the configured document classifier.
- `evaluate-comparison-row.ts` — evaluates one row of a comparison matrix.
- `evaluate-requirement-package.ts` — evaluates a configured package of related requirements.
- `evaluate-rule-compliance.ts` — evaluates evidence against one authored rule.
- `extract-clauses.ts` — extracts typed contract clauses.
- `extract-playbook-positions.ts` — extracts negotiation positions from a playbook.
- `research-legal-reference.ts` — performs the optional web-assisted legal-reference work unit.

## `shared/`

Utilities used by more than one pipeline or operation.

- `candidate-retrieval.ts` — retrieves candidate evidence from an indexed document.
- `candidate-selection.ts` — ranks and selects the candidates sent to verification.
- `clause-index.ts` — builds and queries the in-memory clause index.
- `convert-results-to-findings.ts` — converts grouped verifier results into standard findings.
- `evidence-locator.ts` — maps evidence back to exact source locations and quotations.
- `evidence-pool-log.ts` — records retrieval-pool and evidence-selection diagnostics.
- `execution-inspection-log.ts` — records ACT plan and execution diagnostics.
- `execution-stage.ts` — maps work-unit types to ACT lifecycle stages.
- `extract-shared-evidence.ts` — creates evidence bundles that multiple requirements can reuse.
- `proposition-verifier.ts` — verifies whether evidence proves a specific proposition.
- `requirement-evidence.ts` — isolates, partitions, and reconciles evidence for one requirement.
- `requirement-status-policy.ts` — derives generic requirement statuses from findings.
- `verification-inspection-log.ts` — records detailed verification diagnostics.
- `work-unit-utils.ts` — common finding, locator, and work-unit helper functions.

## Dependency direction

`execute-act-plan.ts` may call every area. Pipeline-specific folders, generic operations, and risk review may use `shared/`. Shared modules contain reusable mechanics rather than operation-specific legal decisions; the existing compliance diagnostics hooks remain explicit until observability is extracted in a later cleanup.
