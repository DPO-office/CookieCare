# Analysis Agreement Module: Current Architecture, Runtime Flow, and Core Problems

## Purpose of this document

This document explains what the current Analysis Agreement module does from the moment a user submits an instruction and one or more documents until the final result is displayed.

It describes:

- every PAC phase (`PLAN`, `ASK`, `ACT`, `CRITIQUE`, `DONE`);
- the state and data models passed between phases;
- document loading, segmentation, clause extraction, skill selection, rule evaluation, critique, retry, rendering, persistence, and frontend delivery;
- the exact path taken by a GDPR Article 28 DPA review;
- why that path is slower than expected;
- why the final output can still be shallow, contradictory, or unreadable;
- which problems are presentation problems and which are deeper architecture problems;
- a recommended correction order.

This is a description of the **current implementation**, not an idealized design.

---

## 1. Executive summary

### What the module is trying to be

The module is a deterministic TypeScript-controlled legal-analysis pipeline. The LLM performs bounded tasks inside a fixed workflow, but it is not allowed to choose arbitrary phase transitions.

The intended design is:

1. understand the request;
2. select authored legal skills;
3. build an auditable graph of work units;
4. extract relevant clauses;
5. evaluate those clauses against authored rules;
6. verify evidence and completeness;
7. retry only failed units;
8. render a user-facing report;
9. persist the session for audit and resume.

This is a sensible architecture for traceability and repeatability.

### What is going wrong

The central problem is that the pipeline is optimized around producing and validating atomic `Finding` objects, while the user expects a coherent legal deliverable.

For an Article 28 request, the system can:

- select the GDPR skill;
- identify the correct Article 28 rules;
- extract processor clauses;
- evaluate many individual requirements;
- verify quotes;
- retry failed evaluations;

but it does not have a dedicated Article 28 report model or renderer. The final renderer therefore receives a mixed bag of risk findings and compliance findings and often exposes them as a generic internal table.

In one sentence:

> The system performs a large amount of fragmented analysis but has no domain-specific synthesis layer that reconciles those fragments into the legal memorandum the user requested.

### The four highest-impact defects

1. **No Article 28 output schema.** Article 28 falls into a generic checklist/memo renderer instead of a requirement-by-requirement DPA assessment.
2. **Risk and compliance paths can run together.** They use the same statuses with different meanings and can reach opposite conclusions about the same clause.
3. **Most Article 28 rules are evaluated per clause rather than as one contractual package.** Cross-references, annexes, combined obligations, and overall adequacy are therefore hard to assess correctly.
4. **Critique verifies atomic evidence, not final-report coherence.** It can approve individually traceable findings while the final report remains contradictory or unusable.

---

## 2. Main entry points

### HTTP API

Relevant files:

- `api/route.ts`
- `api/controller.ts`
- `api/schema.ts`

The create endpoint validates:

- `instruction`;
- one or more `documentIds`;
- optional `promptLibraryId`;
- optional `organizationId`;
- optional `sessionId`.

`analyzePacController()` queues an asynchronous `analysis_pac` job and returns HTTP 202 with a job ID.

The resume endpoint accepts:

- `sessionId`;
- clarification answers.

It queues the same job type with `intent: "RESUME_ASK"`.

### Important API inconsistency

`analysis-handler.ts` supports `payload.documentRoles`, but `AnalysisRequestSchema` currently does not declare `documentRoles`.

That means the runtime can use target/reference roles, but a normal validated API request cannot necessarily supply them through this schema. This matters for playbook comparison and multi-document analysis.

### Job handler

Primary file:

- `src/services/jobs/handlers/analysis-handler.ts`

`executeAnalysisPac()` selects one of two paths:

- create a new analysis;
- resume an analysis after clarification.

For a new run, `handleCreate()`:

1. creates or accepts a session ID;
2. loads each file from the database;
3. decrypts encrypted content;
4. constructs `documentTexts` and `documentTitles`;
5. creates the initial `AnalysisState`;
6. attaches progress and streaming-token callbacks;
7. invokes `analysisEntry.run(initial)`;
8. persists a ledger snapshot;
9. sanitizes findings and rendered output for the API;
10. returns the result to the asynchronous job system.

### Workflow entry

Primary file:

- `entry/analysis-workflow.ts`

`AnalysisEntry.run()`:

- ensures conversation state exists;
- determines `CREATE` or `RESUME`;
- initializes the agent budget/state;
- pins taxonomy versions;
- hands control to `PacController.run()`.

`resumeAfterAsk()` resets the phase to `PLAN` and preserves the existing state.

### Frontend enqueue and display

This path is separate from legacy Ask Lawyer / `document_analysis`.

| Step | File / function |
|------|-----------------|
| UI entry | `frontend/src/features/analyze/InteractAnalyze.tsx` → `useAnalysis` |
| Start / follow-up | `handleStartAnalysis` / `handleSendChatMessage` → `enqueueAnalysisJob(..., "/api/analysis/run")` |
| Resume ASK | `handleResumeAsk` → `enqueueAnalysisJob(..., "/api/analysis/resume-ask")` |
| SSE wait | `analysisJobs.waitForAnalysisJob` → `EventSource(/api/jobs/sse?token=…)` |

Job lifecycle on the client:

1. Progress via SSE `job_update` (`updateJobProgress` in the handler).
2. Streaming tokens via SSE `draft_token` (`emitAnalysisToken` → `onToken`).
3. On completion, `extractAnalysisReport()` prefers `renderedOutput`, else decline message, else a raw findings-table fallback.
4. The UI typically replaces the streaming bubble with the **final** report only.

**Note:** Render runs inside ACT, before CRITIQUE. Users may see streamed output from a pre-verification render; the completed job result is authoritative.

### Job execution model

Jobs are **in-process** (`services/jobQueue.ts`): there is no separate worker lease, crash recovery, or durable retry queue. A process restart can lose in-flight analysis.

---

## 3. The central state object

Primary file:

- `models/analysis-state.ts`

`AnalysisState` is the shared object carried through the entire workflow.

It contains the following major groups.

### Request

- session ID;
- user instruction;
- optional prompt-library selection;
- document IDs;
- optional target/reference roles;
- document text;
- document titles.

### Workspace

The workspace contains normalized document objects:

- full text;
- detected document type;
- role;
- segments;
- extracted clauses;
- optional playbook positions.

### Planning state

- classified intent;
- selected skills;
- merged clause types;
- merged risk categories;
- merged expected clauses;
- merged regime rules;
- instruction focus;
- plan and work-unit graph;
- pending clarification.

### Analysis products

- findings;
- draft tasks;
- rendered output;
- decline message.

### Control and verification state

- current PAC phase;
- turn and token budgets;
- critique report;
- targeted retry plan;
- per-work-unit terminal outcomes;
- Tier C cache;
- whether replanning was attempted.

### Audit and memory

- conversation;
- organization memory;
- attribution notes;
- partial-coverage warnings;
- history entries;
- pinned taxonomy and model metadata.

### Why this matters

The module is stateful, not a single prompt call. A poor final answer can originate from:

- bad request classification;
- wrong skill selection;
- incomplete extraction;
- wrong rule scope;
- contradictory findings;
- critique behavior;
- renderer selection;
- frontend formatting.

The final renderer cannot fully repair errors introduced earlier because it is explicitly instructed not to invent or reinterpret findings.

---

## 4. PAC phase controller

Primary files:

- `pac/controller.ts`
- `pac/transitions.ts`
- `pac/policy.ts`
- `pac/types.ts`

PAC is a TypeScript-owned loop:

```text
PLAN -> ASK (optional) -> PLAN
PLAN -> ACT -> CRITIQUE
CRITIQUE -> ACT       targeted retry
CRITIQUE -> PLAN      structural replan
CRITIQUE -> ASK       critical missing fact
CRITIQUE -> DONE      green, terminal, or budget stop
```

The LLM does not decide these transitions.

### Default limits

From `pac/types.ts`:

- maximum PAC turns: 4;
- maximum clarification rounds: 2;
- token budget: configurable, currently defaulting to 500,000;
- maximum documents: 10;
- maximum extraction units: 200;
- full-context threshold: approximately 320,000 characters.

### Stop reasons

A run can finish as:

- `green`;
- `max_turns`;
- `budget_exceeded`;
- `awaiting_user`;
- `out_of_scope`;
- `blocked`.

### Persistence behavior

Normal completion calls `persistAnalysis()`.

Early budget or turn stops also persist.

The `ASK` phase is different: it returns immediately so that the external job handler can store the state and wait for user input.

---

## 5. PLAN phase

The PLAN phase consists mainly of:

1. intent classification;
2. skill resolution;
3. document-role resolution;
4. instruction-focus extraction;
5. work-unit graph construction.

### 5.1 Intent classification

Primary files:

- `capabilities/plan/classify-intent.ts`
- `capabilities/plan/intent-heuristics.ts`
- `models/intent.ts`

The classifier determines:

- scope: whole document, named section, cross-cutting theme, or cross-document;
- operation: extract, risk flag, compliance check, compare, summarize, Q&A, drafting suggestion, or out of scope;
- legal standard;
- output form;
- whether the request is compound;
- confidence per axis.

Possible output forms include:

- table;
- checklist;
- redline diff;
- memo;
- Q&A thread;
- brief summary.

The classifier receives:

- the instruction;
- a detected document-type hint;
- up to 4,000 characters of document text;
- available document IDs.

Clear legal-advice requests can be declined before planning.

If the LLM classifier fails, the module falls back to deterministic heuristics.

#### Important output-form risk

The classifier is asked to choose an output form, but the user did not necessarily ask for one. If output-form confidence is low, `buildPlan()` defaults most compliance analysis to `checklist`.

That default is a major reason detailed legal-review requests can become raw tables.

### 5.2 Skill selection

Primary files:

- `skills/resolve-skills.ts`
- `skills/select-skills.ts`
- `skills/registry.ts`
- `skills/manifest.ts`
- individual `skill.config.ts` files;
- individual `SKILL.md` files.

Skills are composed across axes:

- global;
- document type;
- regime;
- topic;
- jurisdiction.

The `_global` skill is always included.

Selection can be driven by:

- a prompt-library ID;
- detected document type;
- trigger phrases in the instruction;
- inferred or organization-default jurisdiction.

For a GDPR DPA request, the usual active set is:

1. `_global`;
2. `doc-types/dpa`;
3. `regimes/data-protection/gdpr`.

The selected skills are merged into:

- clause types to extract;
- expected clauses;
- risk categories;
- regime rules.

`SKILL.md` provides authored prose and guidance. `skill.config.ts` provides executable configuration and routing.

### 5.3 Instruction focus

Primary file:

- `skills/extract-instruction-focus.ts`

Instruction focus narrows a large legal skill to the requested rules.

For explicit article references, it:

- parses article numbers;
- maps them to regime rules;
- maps Articles 15–22 to rights-matrix rows;
- collects associated risk categories.

For authored trigger phrases, it reads each skill's `instructionFocusMap`.

If no focus matches, the module can run the full selected skill. This can massively increase the number of work units.

### 5.4 Plan construction

Primary files:

- `capabilities/plan/build-plan.ts`
- `skills/build-act-graph.ts`
- `utils/topo-batches.ts`

`buildPlan()`:

1. applies sensible intent defaults;
2. loads organization memory;
3. handles missing documents or unsupported operations;
4. resolves active skills;
5. asks about ambiguous skill or document roles if needed;
6. extracts instruction focus;
7. creates the ACT graph;
8. pins taxonomy versions.

The graph normally starts with:

```text
classify_document
    -> extract_clauses
        -> one or more analysis units
            -> render_output
```

Analysis units may include:

- expected-clause checks;
- risk flagging;
- authored regime-rule checks;
- data-subject-rights matrix evaluation;
- playbook extraction and comparison;
- jurisdiction comparative checks;
- web-assisted reference lookup.

---

## 6. ASK phase

Primary files:

- `capabilities/ask/ask-user.ts`
- `memory/conversation-store.ts`

ASK is used for critical missing information such as:

- ambiguous operation;
- unresolved standard;
- missing document role;
- ambiguous skill selection;
- critical evidence gaps surfaced during critique.

`askUser()` converts missing clarification items into stable user-question objects, appends a conversation turn, sets `awaiting_user`, and pauses.

On resume:

1. the latest ledger snapshot is loaded;
2. document text is rehydrated if necessary;
3. answers are applied to state;
4. callbacks are reattached;
5. PAC starts again at `PLAN`.

---

## 7. ACT phase

Primary file:

- `capabilities/act/execute-act-plan.ts`

ACT executes the planned work-unit dependency graph.

### 7.1 Segmentation

Before tools run, `ensureSegmented()` creates segmented document representations when needed.

Segments allow:

- stable structural paths;
- evidence locators;
- quote verification;
- heuristic fallback extraction.

### 7.2 Dependency batches

`topologicalBatches()` groups work units whose dependencies are satisfied.

Some finding-only tools are considered parallel-safe:

- `check_against_rule`;
- `evaluate_matrix_row`;
- `flag_risk`;
- `check_expected_clauses`.

Concurrency defaults to four via `ANALYSIS_ACT_CONCURRENCY`.

Other tools run serially because they can mutate workspace state, especially:

- document classification;
- clause extraction;
- rendering.

### 7.3 Targeted retries

After critique, ACT may run in targeted mode.

In targeted mode:

- only pending or flagged units run;
- previous-attempt feedback is inserted into the unit input;
- old findings from retried units are removed;
- `render_output` is always flagged so the report is regenerated.

This is better than rerunning the whole graph, but repeated LLM verification can still make a run expensive.

---

## 8. ACT tools

### 8.1 Document classification

Primary file:

- `capabilities/act/classify-document.ts`

The classifier determines a document type such as DPA, MSA, NDA, or another supported class.

Document type influences skill selection and clause expectations.

### 8.2 Clause extraction

Primary file:

- `capabilities/act/extract-clauses.ts`

The extractor:

1. receives merged clause types from active skills;
2. builds definitions from skill configuration or `SKILL.md`;
3. sends the document and allowed clause taxonomy to the LLM;
4. requests verbatim clause spans;
5. converts returned text into located `ClauseObject` values;
6. updates the workspace;
7. emits an internal extraction finding.

#### Important extraction limits

- The LLM sees only the first 80,000 characters of the document.
- At most 40 clause-type definitions are included.
- Returned spans depend on one extraction call.
- If the LLM call fails, heuristic extraction usually keeps only the first matching segment per recognized type.

These limits can hide:

- annexes near the end of a long document;
- multiple clauses of the same type;
- cross-references;
- schedules and statements of work;
- distributed obligations.

For Article 28 review, this is critical because the mandatory particulars and technical measures are frequently located in annexes.

### 8.3 Expected-clause checks

Primary file:

- `capabilities/act/check-expected-clauses.ts`

Expected-clause checks answer a structural question:

> Was a clause type expected by the skill extracted?

They do not by themselves determine legal adequacy.

### 8.4 Risk flagging

Primary file:

- `capabilities/act/flag-risk.ts`

Risk flagging:

- receives allowed risk categories;
- loads authored risk guidance;
- sends extracted clauses to the LLM;
- requires a verbatim triggering quote;
- emits `kind: "risk"` findings.

Risk findings commonly use:

- `status: "present"` to mean the risk is present;
- medium or high severity;
- a claim describing the concern.

This meaning of `present` differs from compliance findings.

### 8.5 Rule evaluation

Primary file:

- `capabilities/act/check-against-rule.ts`

Rule evaluation resolves a rule source:

- Tier B: authored skill rule;
- Tier P: uploaded playbook position;
- Tier C: unverified web-derived rule.

It then:

1. selects clauses matching the rule's `appliesToClauseTypes`;
2. decides whether to evaluate per document or per clause;
3. sends fixed rule text, legal hook, instruction, and clauses to the LLM;
4. requests a closed status, claim, severity, gap, and quote;
5. converts the response into compliance findings.

Compliance statuses mean:

- `present`: the obligation is satisfied or evidenced;
- `absent_expected`: the expected requirement appears absent or inadequate;
- `insufficient_evidence`: available clauses do not support a firm conclusion.

#### Important status collision

For a risk finding, `present` means **a problem exists**.

For a compliance finding, `present` means **the requirement is met**.

Both can be rendered in the same `Status` column.

### 8.6 Rights-matrix evaluation

Primary file:

- `capabilities/act/evaluate-matrix-row.ts`

This tool is specialized for data-subject rights, especially Articles 15–22.

It can distinguish:

- named coverage;
- generic coverage;
- absent coverage.

This matrix has a dedicated memo renderer. Article 28 does not.

### 8.7 Playbook and reference tools

Relevant files:

- `extract-playbook-positions.ts`;
- playbook branch in `check-against-rule.ts`;
- `web-assisted-reference.ts`.

Playbook findings are attributed separately as Tier P.

Live web-derived material is Tier C and must remain visibly unverified.

---

## 9. Finding model

Primary file:

- `models/finding.ts`

A `Finding` is the atomic output of analysis.

Important fields include:

- kind;
- category;
- status;
- claim;
- evidence spans;
- rule ID and version;
- severity;
- work-unit ID;
- skill ID;
- visibility;
- matrix row and addressing;
- gap;
- related-not-requested marker;
- organization-playbook attribution;
- trust tier;
- terminal status.

### Strength of the model

It supports:

- auditability;
- precise retry ownership;
- evidence checking;
- trust-tier separation;
- taxonomy versioning;
- machine-readable downstream use.

### Limitation of the model

It does not directly model a legal review conclusion such as:

```text
Requirement: Article 28(3)(g)
Document mechanism: Section 3.6
Assessment: Compliant with qualification
Reasoning: Controller has the choice, but retention language should be narrowed
Recommendation: Add notification and isolation wording
```

Those concepts are flattened into independent findings. The renderer must reconstruct the relationship, but the generic renderer does not do so.

---

## 10. CRITIQUE phase

Primary files:

- `capabilities/critique/run-critique.ts`;
- `capabilities/critique/resolve-work-unit.ts`;
- `capabilities/critique/classify-failure-reason.ts`;
- `capabilities/critique/format-feedback.ts`;
- `capabilities/critique/entailment-candidates.ts`;
- `capabilities/critique/fire-tier-c-once.ts`;
- `models/critique-report.ts`;
- `models/work-unit-outcome.ts`.

CRITIQUE is stricter than a simple proofreading pass.

### 10.1 Evidence existence

For present risk/compliance findings:

- evidence must exist;
- the locator must resolve;
- quoted text must appear in the resolved span or full document.

Absent, insufficient, and not-covered findings are accepted without positive evidence because absence cannot always be quoted.

### 10.2 Taxonomy conformance

Risk and compliance categories must be recognized by active skills or the global registry.

### 10.3 Rule citation

Compliance findings with a rule ID must resolve to configured authored rule text.

### 10.4 Expected-clause completeness

Without instruction focus, critique checks whether every expected clause type was either extracted or represented by an appropriate missing/insufficient finding.

### 10.5 Regime-rule completeness

Every scheduled rule must have a compliance finding.

### 10.6 Instruction coverage

Every focused rule and matrix row must have a finding.

### 10.7 Work-unit completion

Every scheduled work unit must reach a terminal execution status.

### 10.8 Entailment

For eligible present findings, a separate LLM call checks whether quoted evidence supports the claim.

If the entailment LLM call fails, all candidates are treated as failed and can be retried.

### 10.9 Retry resolution

Failures are classified as:

- authored coverage missing;
- tool execution error;
- verification rejection;
- intent mismatch.

The resolver can:

- issue targeted retry feedback;
- fire one Tier C lookup;
- create a not-covered finding;
- log an authoring backlog item;
- request replan;
- stop after repeated identical output;
- mark retries exhausted.

Each unit can have one original attempt plus two Tier 2 retries.

### What critique does not currently verify

It does not perform a final semantic audit of the rendered report for:

- contradictory conclusions on the same legal requirement;
- duplicated risk and compliance rows;
- whether the report directly answers each user-requested verification item;
- whether the overall conclusion follows from the detailed findings;
- whether the title identifies the right legal skill;
- whether the chosen output form is usable;
- whether a qualification is properly distinguished from non-compliance;
- whether annex cross-references were evaluated as part of the contractual package.

This is a central architectural gap.

---

## 11. Rendering

Primary file:

- `capabilities/act/render-output.ts`

The renderer:

1. removes internal findings;
2. consolidates some compliance findings;
3. chooses a renderer by `schemaId`;
4. creates citations;
5. stores `renderedOutput`;
6. emits an internal render finding.

### Supported specialized renderers

- `brief_summary`;
- `rights_matrix_memo`;
- `playbook_comparison_memo`.

### Generic renderers

- table;
- checklist;
- memo;
- Q&A thread.

### Checklist and table behavior

The generic structured report renders Tier B findings as:

```text
Status | Kind | Category | Severity | Claim
```

This is an internal finding schema, not a legal-review schema.

It exposes:

- machine statuses;
- finding kind;
- taxonomy category;
- severity;
- a long claim.

It does not expose:

- legal requirement;
- relevant DPA clause;
- quoted language;
- legal assessment;
- qualification;
- recommendation.

### Memo behavior

Only `memo` and `qa_thread` pass the structured findings through `streamNarrativeReport()`.

The narrative writer is constrained to:

- reorganize and rephrase existing findings;
- preserve citation markers;
- introduce no new claims.

This protects against invention, but it also means the writer cannot repair incomplete or contradictory source findings.

### Consolidation behavior

`consolidateFindingsForRender()` groups only certain compliance findings sharing a rule ID.

It does not reconcile:

- risk findings against compliance findings;
- different categories describing the same requirement;
- legally equivalent clauses reached through different extraction paths.

### Primary-skill title bug

The renderer uses `skillIds[0]` as the primary skill.

Because `_global` is normally prepended, the report can be titled:

> General Contract Review

even when the actual requested and executed analysis is GDPR Article 28.

### Citation limitation

The citation registry produces document-level markers such as `[1]`.

Evidence spans exist, but the generic checklist does not display the actual clause quote or structural path. Multiple claims therefore point to the same document reference without helping the user locate the language.

---

## 12. Response sanitization and frontend display

Backend:

- `utils/response-safety.ts`;
- `src/services/jobs/handlers/analysis-handler.ts`.

Frontend:

- `frontend/src/features/analyze/api/analysisJobs.ts`;
- `frontend/src/shared/utils/markdownToHtml.ts`;
- `frontend/src/index.css`.

### Backend sanitization

Before API delivery:

- internal findings are removed;
- verifier jargon is rewritten;
- raw phase headings and internal status tokens are cleaned where matched.

Sanitization is a last-line safety mechanism. It cannot turn an unsuitable table into a good memo.

### Frontend fallback

If `renderedOutput` is missing, `extractAnalysisReport()` creates another five-column findings table.

Therefore a renderer failure can still expose the same internal shape.

### Markdown rendering

Markdown is converted to HTML with `markdown-it`.

Tables are wrapped in horizontally scrollable containers.

### Table styling problem

Analysis table cells use:

- small text;
- minimum width;
- maximum width of 18rem;
- aggressive word wrapping.

A five-column table containing paragraph-length claims becomes visually dense and difficult to read.

This is a real UI problem, but it is secondary. A perfectly styled version of the same table would still be the wrong legal deliverable.

---

## 13. Persistence and audit

Relevant files:

- `capabilities/persist/persist-analysis.ts`;
- `utils/persisted-state.ts`;
- `memory/conversation-store.ts`;
- `memory/org-memory.ts`;
- `src/services/jobs/handlers/analysis-handler.ts`.

### In-module persistence

`persistAnalysis()`:

- appends user and assistant conversation turns;
- stores a truncated rendered-output summary in conversation;
- records successful skill use in organization memory.

### Ledger persistence

The job handler serializes a state snapshot into `analysis_state_ledger`.

The snapshot retains:

- request metadata;
- workspace, segments, clauses, and full text;
- intent;
- active skill IDs;
- rules and expected clauses;
- findings;
- rendered output;
- agent state;
- plan;
- critique;
- conversation;
- history.

It drops `request.documentTexts` because text remains in the workspace.

**Fields omitted from the ledger snapshot** (`utils/persisted-state.ts`):

- `request.documentRoles`
- `activeSkills`
- `mergedClauseTypes` / `mergedRiskCategories`
- `skillMarkdown`
- `partialCoverageWarning`
- `draftTasks`
- `fixPlan`
- `workUnitOutcomes`
- `tierCCache`
- `replanAttemptedThisRun`

**Consequence:** if a run pauses at ASK after the user supplied document roles, a resumed session may lose those roles and re-enter ambiguous role resolution.

Ledger persistence soft-fails if the database migration is unavailable, allowing the immediate job result to return.

**Session lookup:** `GET /analysis/session/:sessionId` and resume-ask load ledger rows by `session_id` only. Ownership is not enforced in the visible query (depends on session-ID entropy and any DB RLS).

---

## 14. Exact Article 28 request path

Example instruction:

> Perform a rigorous GDPR Article 28 compliance review of this Data Processing Agreement. Verify: subject matter, duration, nature and purpose of processing, categories of data and data subjects, obligations and rights of the controller, and whether all mandatory Article 28(3) clauses are present and adequate.

### Step 1: document type

The document is expected to classify as a DPA.

### Step 2: active skills

The likely active skills are:

- `_global`;
- `doc-types/dpa`;
- `regimes/data-protection/gdpr`.

### Step 3: instruction focus (critical detail)

For this exact prompt, **explicit article parsing wins** over the authored phrase map.

Flow in `extract-instruction-focus.ts`:

1. `extractArticleNumbers(instruction)` → `[28]` from “Article 28” / “Article 28(3)”.
2. Because the instruction does **not** enumerate the full DSR range (Articles 15–22), `explicitArticleFocus()` returns immediately.
3. The GDPR `instructionFocusMap` entry for `"article 28"` is **never merged** for this prompt.

**Focused rules (14):** `gdpr.art28.1` through `gdpr.art28.10` — **not** `gdpr.art29`.

The phrase map (`skill.config.ts`, `instructionFocusMap[1]`) would additionally schedule `gdpr.art29` and curated processor risk categories (`processor_terms_incomplete`, `subprocessor_authorisation_or_flowdown_gap`, etc.). That path applies only when the instruction hits phrase triggers **without** explicit “Article N” parsing taking the early return.

**Focused risk category IDs:** mostly auto-slugs derived from rule labels via `findingCategoryForRule()`. Only **`dsr_assistance_not_operational`** (for `gdpr.art28.3.e`) exists in the skill’s `riskCategories` list. `flagRisk()` filters to known categories, so most focus risk IDs are **ignored** at runtime — except the DSR-assistance category, which duplicates the compliance path for 28(3)(e).

**Matrix rows:** none (Article 28 is not a Chapter III rights-matrix request).

**Skipped when focus is set:**

- `check_expected_clauses` (structural “processor_terms present?” gate);
- critique expected-clause completeness.

So “subject matter, duration, nature and purpose…” is assessed only via **`gdpr.art28.3.chapeau`**, not via the `expectedClauses` / `processor_terms_incomplete` shortcut.

### Step 4: graph behavior

Scheduled work units (typical):

1. `wu-classify` → `classify_document`
2. `wu-extract` → `extract_clauses` (union of `_global` + DPA + GDPR clause types)
3. `wu-flag-risk` → `flag_risk` (focus risk IDs; effectively **`dsr_assistance_not_operational`** only)
4. **14×** `check_against_rule` (one per focused Art 28 rule; parallel batches of up to 4)
5. `wu-render` → `render_output` with **`schemaId: checklist`**

In `appendSubIntentUnits()`:

- `runCompliance` is true because focus exists;
- `runRisk` is also true whenever `focus.riskCategoryIds.length > 0`.

This is the first source of duplicate conclusions (compliance + risk on 28(3)(e)) and unnecessary latency (14 rule LLM calls + risk + entailment + render).

### Step 5: extraction

The extraction call receives merged clause types from all selected skills.

It attempts to extract:

- processor terms;
- data-protection terms;
- confidentiality;
- security;
- subprocessor flow-down;
- return/deletion;
- audit evidence;
- transfer mechanisms;
- related global contract clauses.

The analysis then evaluates only extracted spans, not necessarily the complete DPA package.

### Step 6: rule scope

In the GDPR configuration, only a small set of rules is explicitly document-level.

Article 28(3)(e) is document-level, but most other Article 28 rules default to per-clause.

This creates several problems:

- one requirement may be split across clauses;
- one clause can generate a partial adverse result even if another clause cures it;
- annex references may be treated as missing content;
- the chapeau particulars are not naturally evaluated as one schedule/package;
- subprocessor authorization, flow-down, liability, and objection mechanics may be fragmented.

### Step 7: contradictory semantics

The risk unit is instructed to find weaknesses.

The rule unit is instructed to determine whether the fixed rule is satisfied.

Examples of possible output:

- risk finding: confidentiality wording is inadequate;
- compliance finding: confidentiality requirement is present;
- risk finding: return/deletion lacks controller choice;
- compliance finding: return/deletion is present;
- risk finding: subprocessor obligations are incomplete;
- compliance finding: equivalent obligations are present.

Both survive because render consolidation does not reconcile risk against compliance.

### Step 8: renderer choice

Article 28 does not produce rights-matrix rows.

Therefore it does not receive `rights_matrix_memo`.

If intent classification selected or defaulted to checklist, it receives the generic five-column table.

If intent classification selected memo, it receives a prose rewrite of the same findings, but no Article 28-specific requirement matrix.

### Step 9: title

The renderer may use `_global` as primary and title the output `General Contract Review`.

### Step 10: critique

Critique can verify:

- that each focused rule produced a compliance finding;
- that present findings have evidence;
- that quotes exist in the document;
- entailment (second LLM pass on present claims).

It does **not** reconcile risk vs compliance before render.

**Article 28 state-machine quirk (verified):**

- `insufficient_evidence` is treated as a valid first-class status and passes critique evidence gates.
- If `gdpr.art28.3.e` is `insufficient_evidence`, `criticalFactSurfaced` may be set.
- But if all units are otherwise terminal, `nextPhaseAfterCritique()` checks **green / all-terminal before ASK**, so the run can go to `DONE` without asking the user for missing annexes or context.
- If ASK is reached, `askUser()` only surfaces `plan.missingClarifications` — it does not generate a question from `criticalFactSurfaced` alone, which can yield **`awaiting_user` with zero open questions**.

**`isGreen` semantics:** terminal completion of all work units, not “all substantive checks passed.” A green stop can still ship contradictory or insufficient findings.

---

## 14A. Verified implementation defects (beyond output shape)

These are confirmed in current code and explain latency, lost state, or silent data loss — not hypotheses.

| Defect | Effect | Primary location |
|--------|--------|------------------|
| Parallel ACT merges **findings only**, not `result.state` | `DraftTask` from parallel `evaluate_matrix_row` can be **discarded** | `execute-act-plan.ts` ~133–159 |
| Concurrent LLM calls share one `agent.tokensUsed` | Token budget **under-counted**; races on shared agent state | `check-against-rule.ts`, `flag-risk.ts`, `evaluate-matrix-row.ts` |
| Document slice **80,000 chars** in extraction | Annexes and tail schedules may never enter analysis | `extract-clauses.ts` ~76 |
| Clause text truncated (2k–3k) in rule/risk/matrix judges | Long clauses lose operative language | `check-against-rule.ts`, `flag-risk.ts`, `evaluate-matrix-row.ts` |
| `320_000` full-context threshold declared but **unused** | No fallback to full-document evaluation | `pac/types.ts` |
| Render runs **before** CRITIQUE | User may see pre-verification streamed output | ACT graph + `render-output.ts` |
| Failed dependency does not block render | Report can render with incomplete extraction/rules | `topo-batches.ts`, `execute-act-plan.ts` |
| `compare` intent exists but `buildPlan` rejects it | Playbook comparison path unreachable from normal classify | `build-plan.ts` ~82–95 vs `build-act-graph.ts` |
| Skill ambiguity branch effectively **unreachable** | First registry match wins; embedding shortlist is empty stub | `select-skills.ts` |
| `FixItem.instruction` not passed to retries | Only `previousAttemptFeedback` reaches tools | `execute-act-plan.ts` ~69–83 |
| Intent classifier examples use invalid standard IDs | e.g. `regime_pack:gdpr.art28.3.e` (a rule id, not a pack) | `classify-intent.ts` vs `normalizeStandard()` |

---

## 15. Why the competitor-style output is stronger

A strong Article 28 deliverable is organized around the legal test, not around internal finding metadata.

Its natural structure is:

1. scope and overall conclusion;
2. Article 28(3) chapeau particulars:
   - subject matter;
   - duration;
   - nature;
   - purpose;
   - personal-data types;
   - data-subject categories;
   - controller obligations and rights;
3. Article 28(3)(a)–(h), one requirement at a time;
4. Article 28(2), 28(4), 28(9), and relevant transfer terms;
5. qualifications and dependencies on unseen annexes/SOWs;
6. prioritized drafting recommendations;
7. documents still required to complete verification.

The current module instead organizes output around:

- finding status;
- finding kind;
- taxonomy category;
- severity;
- claim.

The competitor-style output is not necessarily doing more legal computation. It is using a report structure aligned with the user's legal question.

---

## 16. Latency analysis

### Calls made in a typical focused Article 28 run

A run can include:

1. intent-classification LLM call;
2. clause-extraction LLM call;
3. focused risk-flag LLM call;
4. one rule-evaluation LLM call for each Article 28/29 rule;
5. critique entailment LLM call;
6. targeted re-evaluation calls for rejected units;
7. another entailment call;
8. final narrative-refinement call if output form is memo.

Even with concurrency four, the work is much more expensive than a single long-context legal review.

### Latency amplification points

- one work unit per rule;
- risk and compliance both scheduled;
- per-clause judgments can emit multiple findings;
- quote verification can reject otherwise reasonable conclusions;
- failed entailment is retried;
- render runs again after every targeted retry;
- critique itself uses an LLM;
- a full run may reach four PAC turns.

### Why additional time does not guarantee a better report

The extra time improves atomic verification and retry coverage. It does not create missing report architecture.

The system can spend more time proving that each row is traceable while never asking whether the collection of rows is a coherent answer.

---

## 17. Core problems by layer

### Product/output contract

- No explicit contract for what a rigorous legal memorandum must contain.
- User-facing report schema is derived from internal findings.
- Output-form choice is probabilistic or defaulted rather than domain-driven.

### Planning

- Focused compliance can also schedule risk flagging.
- Article 28 has no specialized graph/renderer pairing.
- Global skill ordering leaks into presentation.

### Extraction

- Hard 80,000-character document slice.
- One extraction pass for many clause types.
- Annexes and repeated clause types can be missed.
- Heuristic fallback is intentionally shallow.

### Evaluation

- Many package-level Article 28 duties are per-clause.
- Independent rule calls do not share conclusions.
- There is no explicit `compliant_with_qualification` status.
- `insufficient_evidence` conflates extraction failure, unseen annex dependency, and genuine ambiguity.

### Finding semantics

- `present` has opposite practical meanings for risk and compliance findings.
- Risk categories and regime rules can cover the same issue without a common legal-requirement key.
- Severity and compliance verdict are mixed.

### Critique

- Evidence verification is strong.
- Cross-finding contradiction detection is absent.
- Final-answer completeness and usefulness are not tested.
- The renderer output itself is not critiqued as a legal deliverable.

### Rendering

- Generic checklist exposes internal columns.
- Article 28 lacks a dedicated renderer.
- Evidence quotes and structural paths are mostly hidden.
- Report title can come from `_global`.
- Narrative refinement cannot repair unsupported synthesis.

### Frontend

- Wide tables are scrollable but still dense.
- Long claims are squeezed into fixed-width cells.
- Missing rendered output falls back to the same raw findings table.

---

## 18. Recommended target architecture

### 18.1 Separate analysis facts from legal conclusions

Retain `Finding` for traceability, but add a requirement-level synthesis model:

```text
LegalRequirementAssessment
  requirementId
  citation
  label
  verdict
  documentMechanisms[]
  evidence[]
  reasoning
  qualifications[]
  missingMaterials[]
  recommendations[]
  supportingFindingIds[]
```

Recommended verdicts:

- compliant;
- compliant with qualification;
- partially compliant;
- non-compliant;
- cannot determine;
- not applicable.

This avoids overloading `present`.

### 18.2 Build a dedicated Article 28 review

Add an `article_28_memo` renderer schema selected when Article 28 focus is active.

It should always include:

- chapeau particulars;
- Article 28(3)(a)–(h);
- Article 28(2), (4), and (9);
- overall conclusion;
- unseen-annex dependencies;
- prioritized recommendations.

### 18.3 Use package-level evaluation

Evaluate Article 28 requirements against the complete relevant clause set once per requirement, or evaluate the whole Article 28 matrix in one structured call.

The evaluator should explicitly understand:

- cross-references;
- annex incorporation;
- terms spread across sections;
- cure by another clause;
- controller/processor role allocation.

### 18.4 Stop duplicate risk scheduling

For a focused `compliance_check`:

- do not automatically run `flag_risk` merely because the focus contains risk categories;
- derive gaps from the requirement assessment;
- run separate risk flagging only for genuinely additional contractual risks.

### 18.5 Add reconciliation before render

Before rendering:

1. group findings by legal requirement;
2. detect opposing conclusions;
3. prefer full-document findings over isolated clause findings;
4. distinguish wording weakness from statutory failure;
5. attach all supporting and conflicting evidence;
6. resolve or visibly disclose unresolved contradictions.

### 18.6 Critique the final report

Add a deterministic and/or LLM final-output critique:

- every requested item answered;
- no conflicting verdicts for one requirement;
- verdict follows evidence;
- no internal enum leakage;
- correct skill/title;
- overall conclusion consistent with details;
- recommendations tied to identified gaps;
- missing documents clearly stated.

### 18.7 Improve evidence presentation

Show:

- clause/section identifier;
- short verbatim quote;
- document marker;
- whether the quote is direct language or a cross-reference.

### 18.8 Fix skill priority

Choose the primary presentation skill as:

1. focused regime;
2. focused document type;
3. topic/jurisdiction;
4. global fallback.

Never title a GDPR Article 28 report from `_global`.

---

## 19. Recommended implementation order

### Phase 1: Correct the output contract

1. Add `article_28_memo` to renderer schema types.
2. Route Article 28 focus to it deterministically.
3. Render requirement, clause language, verdict, qualification, and recommendation.
4. Select a non-global report title (regime skill, not `_global`).
5. Add a regression fixture for the exact Mastercard prompt.
6. Fix Article 28 `criticalFactSurfaced` → ASK (or block green when material 28(3)(e) is insufficient).
7. Add `documentRoles` to `api/schema.ts` and persist roles in ledger snapshots.

This provides the largest visible improvement with the least architectural change.

### Phase 2: Remove contradictions

1. Do not run generic risk flagging for focused compliance unless explicitly requested.
2. Add requirement-level grouping and contradiction detection.
3. Introduce legal verdict semantics separate from finding status.

### Phase 3: Improve legal accuracy

1. Make Article 28 requirements document/package-level.
2. Pass all relevant clauses together.
3. model annex/SOW dependencies explicitly;
4. distinguish absent language from unavailable incorporated material.

### Phase 4: Reduce latency

1. Evaluate the Article 28 matrix in one or a few structured calls.
2. Keep deterministic evidence verification.
3. Run entailment only on disputed/high-risk conclusions.
4. avoid rerendering until analytical retries finish.

### Phase 5: Final-output quality gate

1. critique the rendered memorandum;
2. verify requested-item coverage;
3. reject contradictory or raw-table output;
4. add output-quality regression tests.

---

## 20. Tests that should protect the fix

### Routing tests

- Exact Article 28 prompt selects GDPR + DPA skills.
- Exact prompt produces Article 28 focus.
- Exact prompt selects `article_28_memo`.
- `_global` is not used as the title.

### Graph tests

- Focused Article 28 compliance does not schedule generic `flag_risk`.
- Required rules are evaluated.
- Renderer depends on all requirement assessments.
- Annex-aware document-level scope is used.

### Finding/reconciliation tests

- Risk-present and compliance-present cannot silently appear as equivalent statuses.
- Opposing conclusions for one rule are reconciled or surfaced.
- “Compliant with qualification” is representable.
- Unseen annexes result in “cannot determine” or qualification, not automatic absence.

### Renderer tests

- Every Article 28(3)(a)–(h) requirement appears exactly once.
- Chapeau particulars are individually addressed.
- Evidence quote and source location appear.
- Overall conclusion matches row verdicts.
- Recommendations exist only for gaps or qualifications.
- Internal values such as `absent_expected` do not appear.

### End-to-end regression

Use the exact Mastercard DPA and exact prompt.

Assert that the output:

- is a legal memorandum, not the five-column findings table;
- identifies incorporated Annex 1/2 and SOW dependencies;
- recognizes present mandatory clauses where supported;
- distinguishes drafting weakness from non-compliance;
- identifies missing materials required for final verification;
- ends with an overall assessment and next step.

---

## 21. File map

### Entry and API

- `api/route.ts`
- `api/controller.ts`
- `api/schema.ts`
- `entry/analysis-workflow.ts`
- `src/services/jobs/handlers/analysis-handler.ts`

### PAC control

- `pac/controller.ts`
- `pac/transitions.ts`
- `pac/policy.ts`
- `pac/types.ts`

### PLAN

- `capabilities/plan/classify-intent.ts`
- `capabilities/plan/intent-heuristics.ts`
- `capabilities/plan/build-plan.ts`
- `capabilities/plan/resolve-document-roles.ts`

### Skills and graph

- `skills/select-skills.ts`
- `skills/resolve-skills.ts`
- `skills/extract-instruction-focus.ts`
- `skills/build-act-graph.ts`
- `skills/registry.ts`
- `skills/manifest.ts`
- `skills/types.ts`
- `skills/_global/skill.config.ts`
- `skills/doc-types/dpa/skill.config.ts`
- `skills/regimes/data-protection/gdpr/skill.config.ts`
- corresponding `SKILL.md` files.

### ACT

- `capabilities/act/execute-act-plan.ts`
- `capabilities/act/classify-document.ts`
- `capabilities/act/extract-clauses.ts`
- `capabilities/act/check-expected-clauses.ts`
- `capabilities/act/flag-risk.ts`
- `capabilities/act/check-against-rule.ts`
- `capabilities/act/evaluate-matrix-row.ts`
- `capabilities/act/extract-playbook-positions.ts`
- `capabilities/act/web-assisted-reference.ts`
- `capabilities/act/render-output.ts`

### CRITIQUE

- `capabilities/critique/run-critique.ts`
- `capabilities/critique/resolve-work-unit.ts`
- `capabilities/critique/classify-failure-reason.ts`
- `capabilities/critique/entailment-candidates.ts`
- `capabilities/critique/fire-tier-c-once.ts`
- `capabilities/critique/format-feedback.ts`
- `capabilities/critique/output-hash.ts`

### Models

- `models/analysis-state.ts`
- `models/analysis-plan.ts`
- `models/intent.ts`
- `models/document-workspace.ts`
- `models/clause-object.ts`
- `models/finding.ts`
- `models/locator.ts`
- `models/critique-report.ts`
- `models/work-unit-outcome.ts`

### Persistence and safety

- `capabilities/persist/persist-analysis.ts`
- `utils/persisted-state.ts`
- `utils/response-safety.ts`
- `memory/conversation-store.ts`
- `memory/org-memory.ts`

### Frontend result path

- `frontend/src/features/analyze/InteractAnalyze.tsx`
- `frontend/src/features/analyze/api/analysisJobs.ts`
- `frontend/src/shared/utils/markdownToHtml.ts`
- `frontend/src/index.css`
- `backend/src/services/jobQueue.ts` (SSE `draft_token` / `job_update`)
- `backend/src/routes/jobs.ts` (SSE endpoint)

### Subagent research (same investigation)

Additional traces that informed sections 2, 14, 14A, and 13:

- [Trace runtime phases](5334d510-0f71-4478-bff4-fb244797d042) — frontend → job → PAC → SSE
- [Map analysis architecture](1ef8f10a-49bf-47a6-92ac-cc8131ba71c7) — concurrency, persistence, critique semantics
- [Audit Article 28 path](ba0a667c-d157-4f96-b2f7-39f2836d0901) — explicit `[28]` focus vs phrase map

---

## 22. Final diagnosis

The module does not fail because it has no GDPR knowledge. The authored GDPR skill contains the relevant Article 28 rules and the planner can select them.

It fails because legal knowledge, execution, and presentation are connected through an overly generic intermediate format.

The current chain is:

```text
legal request
  -> many isolated rule/risk findings
  -> evidence verification
  -> generic findings renderer
```

The required chain is:

```text
legal request
  -> requirement-specific evidence collection
  -> reconciled legal assessments
  -> domain-specific memorandum
  -> final coherence and coverage verification
```

The first priority should therefore not be adding more Article 28 rules or increasing token budgets.

The first priority should be changing the unit of output from **raw finding** to **reconciled legal requirement assessment**, then rendering that assessment in an Article 28-specific memorandum.
