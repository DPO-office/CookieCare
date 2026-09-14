# Verification refactoring plan grounded in the current pipeline

Prepared 12 September 2026. This is a proposed implementation plan; runtime code has not been changed. Investigation retrieval algorithms and the separately ongoing skill migration are outside this change, except for the specific interface dependencies identified below.

## 1. Confirmed diagnosis

The reported DSR loss is reproducible from two saved execution logs. It occurs after verification.

| Boundary | an_7cafc49e… | an_bc3b28de… |
|---|---:|---:|
| Investigation bundles | 10 | 10 |
| Verify input events | 10 | 10 |
| Canonical verification results | 10 | 10 |
| Assessment results | 10 | 10 |
| Accepted locks | 4 | 4 |
| Rejected locks | 6 | 6 |
| Rendered assessment rows | 4 | 4 |

For `an_7cafc49e-2d9f-48ba-bec7-8f394ef5a8f6`, the six rejected rules are Articles 15, 18, 19, 20, 21, and 12(3). Each rejection is `GAP_WITHOUT_COMPLETENESS_BASIS`. In the earlier `an_bc3b28de…` run, Article 16 replaces Article 15 in this rejected set. Article 22 survives in both runs as `not_applicable`; it does not disappear in these two executions.

The sequence is:

1. Investigation marks missing primary evidence as `investigationComplete:false`.
2. Verify returns element verdicts for all ten rules.
3. Assess still derives `gap` for several rules with incomplete investigation.
4. Lock correctly refuses to certify those gaps without a completeness basis.
5. Report projection includes accepted locks only, yielding four assessment rows.

Current code adds coverage warnings and canonical snapshot `outstandingChecks`. This is better than entirely silent omission, but it does not satisfy one outcome row per selected check. A warning about six missing checks cannot replace their individual outcomes and available evidence.

Evidence: [DSR execution log, assessment and lock results](</C:/Program Files/CookieCare/CookieCare-main/logs/analysis/an_7cafc49e-2d9f-48ba-bec7-8f394ef5a8f6.compliance.log:207>), [run reconciliation](</C:/Program Files/CookieCare/CookieCare-main/logs/analysis/an_7cafc49e-2d9f-48ba-bec7-8f394ef5a8f6.compliance.log:266>), [second DSR execution](</C:/Program Files/CookieCare/CookieCare-main/logs/analysis/an_bc3b28de-49dc-46bb-9f9d-36b5746d7183.compliance.log>).

The current `latest.json` is a later, seven-rule breach review. It should not be used as the DSR regression fixture. Freeze the named historical DSR bundle and its log together; the files predate some current skill and adapter changes.

## 2. Additional defects visible in current code

| Finding | Code evidence | Refactoring consequence |
|---|---|---|
| Schema failure can exclude a requirement before Verify and again before Assess/Lock | `compliance-runtime.ts`: 1643, 2034, 1724, 2324 | Missing baseline becomes an explicit failure outcome; never `continue` without recording one |
| Atomic proof elements do not reach the verifier | `requirementEvidenceProfiles` copies only hypothesis, hints, and proof standard; `schemaForRequirement` prefers legacy schema | Resolve one approved rule contract for all stages |
| Fallback schema collapses a requirement into mandatory `E1` | `synthesizeElementSchemaFromProfile` | Compile real proof elements; do not silently invent a coarser checklist |
| Evidence roles and investigation warnings are preserved by the adapter but omitted by the LLM prompt | `build-bundle.ts:231`; `verify-evidence-with-llm.ts:217` | Include roles, contributions, rationale, completeness, and dependencies in verification input |
| Every passage is clipped at 900 characters | `verify-evidence-with-llm.ts:235` | Send complete selected passages or explicitly tracked source windows |
| LLM validator checks supplied citations but does not require nonempty citations/quotes for affirmative verdicts | `verify-evidence-with-llm.ts:305`; similar loops in Lock | Require affirmative proof citations and consistent quote-to-citation membership |
| N/A is checked as an allowed enum, without validating applicability grounds | Same validator; deterministic trigger check at `verify-evidence-deterministically.ts:145` | Add applicability state and evidence/context basis |
| Scope adapter supplies document/path, losing semantic actor relationship constraints | `build-bundle.ts:238` | Preserve rule actor scope and trusted document context; unknown scope stays unknown |
| Search execution and proof sufficiency share one boolean | `build-bundle.ts:155` | Separate execution coverage, evidence coverage, and dependency state |
| Assess and Lock separately implement aggregation | `assess-compliance-requirements.ts`; `lock-compliance-assessments.ts:288` | One pure policy function, checked by Lock |
| Generic assessment code includes law-specific element IDs | Hardcoded `G1/G4` choice semantics; `A1/A2` reason-code mapping | Move meaning to rule data; namespace element reasons |
| Requirement-only maps can overwrite different document checks | `compliance-runtime.ts` repeatedly maps by `requirementId` | Introduce a stable check identity including review scope |
| Report deduplication prefers higher-ranked status, including Present over Gap | `project-locked-compliance-report.ts:132` | Duplicate/conflicting results require reconciliation; never select the more positive result |
| Available context can disappear from report evidence | `buildRow` excludes `not_located` verdicts; explanation cites supported elements only | Represent related evidence independently of affirmative proof |
| Empty bundles cannot identify their document for fallback | `compliance-runtime.ts:1851` reads first item scope | Use the check's explicit review scope/document identity |
| Fallback replacement detects only span-ID set changes | `compliance-runtime.ts:1898` | Version/hash complete evidence payload, roles, dependencies, and coverage |

Quote validation currently normalizes whitespace, case, and typography despite the prompt's byte-exact wording. The replacement must state its actual matching policy, resolve normalized matches to source offsets, and render the original source substring.

The skill migration needs one concrete applicability correction: the current Article 22 proof standard explicitly permits N/A when the text does not describe the activity (`rule-investigation.ts:338`). A verifier-only change would conflict with that authored instruction. Record this as a dependency for the team updating skills; silence in a retrieved bundle cannot establish that the underlying activity is absent.

## 3. Evidence policy: supporting passages remain useful

The investigation role is an initial judgment about how a passage relates to a particular rule. It is not the final legal status and is not a permanent global property of a clause.

For each element, Verify should distinguish:

- Text that establishes the proposition directly.
- Several passages that establish it together, with an explanation of their connection.
- Text that provides relevant but insufficient support.
- Definitions or context that explain the clause without establishing an obligation.
- Limitations, exceptions, and conflicting provisions.

Supporting evidence is always available for reasoning and reporting. It does not become sufficient merely because primary evidence is absent. Conversely, an investigation label must not impose an automatic ceiling: if exact, operative text establishes an element, Verify may explain why it now counts as proof. Preserve the original role and record the revised contribution and justification separately.

Example using the saved DSR bundle:

- Clauses 4.1/4.2 are labeled supporting for both Article 17 and Article 28(3)(e).
- They visibly discuss assistance with rights requests. Verify can evaluate them as substantive evidence for the processor-assistance elements.
- The same passages do not automatically establish every element of a direct erasure, access, portability, or recipient-notification rule.
- The report should say what assistance exists and what is still unestablished, even if the overall result is insufficient evidence.

Use `primary_evidence_missing` as a diagnostic fact. Do not make it automatically imply Gap, N/A, or an irrevocable bar to support. Investigate and resolve the reason for the mismatch before certifying a positive conclusion.

## 4. Proposed contracts

### Expected check ledger

Create it from the canonical PLAN selection before investigation begins. A check is identified by `(skillId, ruleId, reviewScopeId)`. The scope can be one document or an explicitly grouped agreement and its schedules; arbitrary documents must not be merged.

Each entry holds:

- Stable `checkId`, canonical rule ID, skill ID, rule version/hash.
- Explicit review scope and document IDs/hashes.
- Request facet IDs and selection reasons.
- Current stage and one terminal outcome.
- References to the exact bundle, verification, assessment, and report outcome.

Deduplicate repeated request facets onto one check while preserving every facet binding. Unresolved request facets get separate explicit outcomes. Use set equality on check IDs at each boundary, not only equal counts.

### Compiled rule contract

Consume the approved atomic skill rule directly. Runtime compilation is a data transformation, not another authored legal schema.

Retain existing proof-element IDs and add only legal semantics that are currently missing:

- Mandatory, conditional, and alternative element treatment.
- Explicit applicability predicates or guidance with unknown as a possible outcome.
- Aggregation: all required elements by default; authored alternatives, choices, and exceptions where needed.
- Proof guidance and non-proof distinctions when they add meaning.
- Optional remediation guidance and rule review/version information.

`required:false` must not be guessed to mean either optional or conditional. Resolve that ambiguity during skill migration. Do not recreate hard keyword vocabulary gates as the authority for semantic support.

A generic JSON/TypeScript output schema remains useful. Remove duplicate law-specific authored schemas only after their additional meaning has been migrated and reviewed. Some old schemas contain conditional rules, exceptions, and remediation guidance that the current skill type cannot fully express.

### Verification result

Retain an element matrix, extending it with:

- `applicability`: applicable / not applicable / unknown, with grounded basis.
- Existing evidence verdicts, with `not_located` explicitly scoped to reviewed evidence.
- Evidence contributions: source span, exact quote/range, original investigation role, verified use, and explanation.
- Established facts, missing proof, conflicting text, and material unresolved dependencies.
- Any justified role reassessment and the source text that supports it.
- Responses to PLAN's requested analysis questions, linked to verified elements and evidence.

Keep execution outcome outside the legal element state: completed, baseline unavailable, verification failed, budget exhausted, or blocked by material missing evidence/context. A failed model call is not a negative legal verdict.

### Investigation coverage

Replace the overloaded boolean with explicit facts:

- Did the investigation execute successfully for the intended scope?
- Which candidate reviews, expansions, or document regions were omitted, and why?
- Which elements have potentially relevant evidence?
- Which dependencies remain unresolved and which elements might they affect?

A successful search can find no proof. Finding related text does not prove completeness. Budget omissions are distinct from semantic rejections. Unknown historical coverage must stay unknown when replaying old bundles; do not infer completeness by deleting `primary_evidence_missing`.

## 5. Execution flow

1. Initialize the expected check ledger and resolve the approved skill rule for every check.
2. Accept the graph evidence bundle and validate identities, source offsets, and scope metadata.
3. Run one semantic verification per check with the actual elements, role metadata, complete evidence windows, and request context.
4. Validate element coverage, IDs, quotes, quote membership, applicable scope, and applicability grounds. Allow one bounded repair.
5. If proof is missing because investigation omitted a material area or dependency, issue a bounded investigation request through the existing graph investigation service. Version the returned bundle and reverify only affected checks/elements. Missing proof alone does not require another search indefinitely.
6. For a material role reassessment, unsupported N/A proposal, mixed actor scope, or unresolved conflict, run a targeted second review. An ungrounded disagreement ends in `judgment_required` or an incomplete outcome, rather than an automatic majority vote.
7. Assess using one deterministic aggregation policy over validated semantics and completeness facts.
8. Lock either a validated assessment or an explicit technical/insufficiency outcome. A rejected attempted assessment remains in diagnostics; it does not remove the expected check.
9. Reconcile related checks where their claims conflict. Apply dependency changes before finalizing affected conclusions.
10. Build report rows from every expected check outcome. Reuse the existing presentation writer/checker, extending their coverage contract to all outcomes.

The existing lexical verifier can remain temporarily in shadow for comparisons. Remove it from the canonical decision and retrieval-trigger path after qualification. Code still validates source integrity and aggregates states; LLM failure produces an incomplete result with any verified facts preserved.

## 6. Status policy

| Condition | Permitted overall outcome |
|---|---|
| Every applicable required element is proven, with no material unresolved limitation | Present |
| Some required elements proven and remaining shortfall established within adequate review scope | Partial |
| Required proof absent after adequate search, applicability established, and no material blocker | Gap within the reviewed scope |
| Relevant evidence exists but material facts, scope, or dependencies remain unresolved | Cannot determine / Insufficient evidence; still show established facts |
| Applicability cannot be established | Cannot determine applicability |
| Authored condition is proven false using trusted scope facts or evidence | Not applicable, with explicit basis |
| Operative evidence contradicts the baseline or an unresolved conflict affects it | Conflicting, with both the evidence and its scope stated |
| Missing baseline, invalid output, timeout, budget exhaustion, or internal failure | Explicit incomplete outcome for that check |

A contractual shortfall should not automatically become a conclusion that an organization has violated the law. PLAN must distinguish direct contract-content requirements, operational duties, processor assistance, and a user's request to assess how an agreement addresses an underlying right. Preserve all explicitly requested rules while qualifying what the document can establish.

Materiality matters: an irrelevant unavailable reference need not block a supported element; an omitted exception or overriding schedule may block it. Record this assessment per dependency and affected element. Unknown materiality cannot be silently treated as immaterial.

## 7. Dynamic context and reporting

Reuse PLAN's existing facets, instruction, actor perspective, document context, and bindings. Add a compact list of requested analysis questions only when the instruction needs it, for example:

- What assistance must the processor actually provide?
- Is a response timeframe specified, and whose response does it govern?
- Which limitations qualify that assistance?
- Which requested rights remain unestablished?

Each answer must cite verified elements and evidence or state why it cannot be answered. These questions may guide explanation and further evidence requests but cannot add an unauthored legal obligation or change a rule's proof threshold. If a question needs another rule, PLAN must resolve it explicitly or record an unresolved facet.

Keep report styling, headings, and length in the existing presentation layer. Its current writer/check/repair workflow already exists; extending its inputs and invariants is sufficient.

Every selected check receives one visible outcome in the detailed report/coverage matrix, including N/A and failures. Executive prose may summarize fewer findings provided the complete matrix remains available. Show supporting/context evidence under a label such as “Related contract provisions” with a clear explanation of what it does and does not establish.

## 8. Implementation sequence and file ownership

### Change 1: Preserve all outcomes and correct status gates

Files: `run-compliance-check.ts`, `compliance-runtime.ts`, `assess-compliance-requirements.ts`, `lock-compliance-assessments.ts`, `project-locked-compliance-report.ts`, report snapshot/models/presentation.

- Capture expected checks before work starts.
- Replace silent skips with explicit outcome records.
- Stop Assess deriving a certifiable Gap when the completeness basis is unavailable.
- Share aggregation policy with Lock.
- Add incomplete outcome rows to snapshot and renderer.
- Remove status-ranked deduplication.

This first increment fixes the observed 10-to-4 reporting defect without certifying rejected gaps or weakening Lock.

### Change 2: Preserve evidence semantics and validate decisions

Files: `investigation/types.ts`, `investigation/build-bundle.ts`, `verify-evidence-with-llm.ts`, generic verification types/validators, assessment policy.

- Separate coverage facts from proof availability.
- Carry role, contribution, scope, dependency, and source-range information into Verify.
- Remove silent passage clipping.
- Require proof-bearing citations and grounded applicability decisions.
- Retain related evidence in incomplete and negative results.
- Make old-bundle compatibility explicit and conservative.

Coordinate the Article 22 applicability wording with the separate skill work. This is a required dependency for consistent semantics, not a request to redesign investigation retrieval.

### Change 3: Use skills directly and retire lexical judgment

Files: rule contract/compiler; `compliance-schema-registry.ts` consumers; `verify-evidence-deterministically.ts`; pipeline runtime and fallback orchestration.

- Migrate remaining legal meaning from authored verifier schemas to atomic skill rules.
- Compile approved proof elements and aggregation with stable IDs.
- Remove `E1` fallback and legacy ID resolution from the canonical compliance path.
- Run semantic Verify as the canonical judgment.
- Route bounded additional evidence requests through graph investigation.
- Keep the old verifier only as temporary shadow diagnostics, then remove its canonical dependencies.

### Change 4: Instruction-specific reasoning and targeted reconciliation

Files: PLAN context handoff, verifier output, assessment/snapshot model, existing reporting writer/checker.

- Pass user questions and perspective into Verify.
- Return evidence-linked answers for reporting.
- Add targeted review for role reassessment, uncertain applicability, and cross-rule conflicts.
- Preserve one result per check and one resolution per requested facet.

Avoid a broad agent rewrite. Add additional model passes only where a specific unresolved decision benefits from them.

## 9. Qualification and tests

### Historical replay

- Freeze both named DSR bundles and expected ID sets; do not depend on mutable `latest.json`.
- Replay recorded verifier outputs without network calls to reproduce 10 assessments, six rejected gaps, four rows.
- Under the new outcome policy, assert ten check outcomes and ten visible coverage rows; six incomplete checks must not be converted into accepted gaps.
- Preserve the actual recorded difference between the two runs instead of asserting identical legal verdicts.

### Evidence and applicability

- Supporting-only bundle remains visible without automatic Present.
- Supporting text that proves an element can be used with recorded justification.
- Several compatible clauses can jointly establish a proposition.
- Heading/definition/context alone does not establish an operative duty.
- Assistance evidence does not automatically establish the underlying direct right.
- Silence about a condition yields unknown applicability; a grounded exclusion can yield N/A.
- A material missing schedule blocks the conclusion; an explicitly immaterial reference does not.
- A clause or exception after character 900 is included and affects the verdict.
- No citations, quotes outside the cited IDs, unseen source windows, fabricated IDs, invalid states, and duplicate/missing elements fail validation.
- Normalized quote matching resolves back to exact source text and offsets.

### Coverage and execution

- Zero-item bundles, unavailable baselines, one malformed result among ten, timeouts, and budget exhaustion each preserve the original check IDs.
- Rule and document scope prevent cross-document overwrites.
- Repeated user facets share one check without losing facet coverage.
- Unknown element IDs are rejected; old and new element IDs are never silently mixed.
- Bundle updates with identical span IDs but different roles, text, dependencies, or coverage trigger version changes and revalidation.
- Every reporting mode preserves full check coverage; summary brevity does not remove detailed outcomes.
- Generic policy tests cover all/any/choice/exception/conditional aggregation and missing proof with complete versus incomplete search.

### Promotion gates

- Exact set equality at investigation, verification, assessment outcome, snapshot, and rendered coverage boundaries.
- No unsupported affirmative result or N/A in the reviewed negative fixtures.
- No Gap produced from an execution failure or unknown coverage basis.
- No duplicated authored legal baseline between skills and canonical Verify.
- No keyword score used as a canonical legal verdict.
- Existing non-compliance paths remain compatible; old registries are removed only when all consumers are migrated.
- Rule-level lawyer-reviewed examples qualify semantic behavior; structural tests alone cannot establish legal accuracy.
- Record latency, tokens, repair rates, role changes, unknown applicability, and unresolved checks for the shadow comparison.

## 10. Diagnostics and rollout

For each boundary emit expected, received, missing, duplicate, and unexpected check IDs. Each trace links check ID, rule version/hash, review scope, bundle version/hash, evidence IDs/roles, applicability basis, verification attempt, final verdict, assessment result, lock outcome, and report row ID.

Use one verification rollout mode with legacy/shadow/canonical behavior. A failure in the new path remains visible even while shadowing. Run the same versioned inputs through both paths for comparisons. Promote after the coverage invariants and legal review cases pass; preserve one rollback window.

The immediate success criterion is ten explicit DSR outcomes with honest explanations and citations. It is not ten accepted legal conclusions or ten gaps.
