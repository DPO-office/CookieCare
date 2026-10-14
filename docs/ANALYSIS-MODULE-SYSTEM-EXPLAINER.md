# LORA Analysis Module — System, User Flow, Technology, and Design Rationale

> Audience: engineering, product, legal, and technical leadership  
> Repository scope: `frontend/src/features/analyze` and `backend/src/modules/analysis`  
> Implementation snapshot reviewed: 14 September 2026

## 1. Executive summary

The Analysis module turns one or more uploaded legal documents plus a natural-language instruction into an evidence-grounded legal review. It is designed as a controlled analysis system rather than a single prompt sent to a large language model.

The module has three primary business-analysis lanes:

1. **Compliance checking** — tests a document against an authored legal regime, such as GDPR Article 28.
2. **Risk review** — identifies, verifies, and ranks material contractual risks without pretending that every risk is a statutory compliance failure.
3. **Comparison and playbook review** — compares two sides, two documents, or a target agreement against an internal playbook or reference document.

These lanes share one orchestration lifecycle:

```text
User instruction + documents
        |
        v
Document ingestion and canonical structure graph
        |
        v
PLAN -> optional ASK -> ACT -> optional deep AUDIT -> release gate -> PERSIST
        |                  |
        |                  +-- Compliance lane
        |                  +-- Risk lane
        |                  +-- Comparison / playbook lane
        v
Streaming, evidence-linked report + session history + follow-up conversation
```

The most important architectural principle is separation of responsibilities:

- Code controls workflow, budgets, phase transitions, schemas, source validation, and release decisions.
- Skills contain authored legal and contract-domain knowledge.
- Models perform bounded semantic tasks such as classification, candidate review, element-level judgment, and report wording.
- The final report is generated from locked findings and citations; the reporting model is not allowed to silently re-decide the law or invent new findings.

This creates a system that is more reproducible, auditable, and safe than a monolithic “read this contract and tell me if it complies” prompt.

## 2. What the Analysis module does

The user can:

- upload or select up to ten documents;
- identify a target agreement and, where needed, a reference or playbook;
- type a custom question or choose a prompt-library starter;
- choose narrative or tabular output;
- choose Lite or Deep analysis;
- receive live progress and streamed report text;
- answer clarification questions when the requested operation, standard, or document roles are genuinely ambiguous;
- ask follow-up questions in the same analysis session;
- reopen prior analyses from history;
- copy, download, or print the report.

Internally, the system supports a wider operation taxonomy—extraction, risk flagging, compliance checks, comparison, summarization, explanatory Q&A, draft suggestions, and out-of-scope handling. The three lanes above are the main substantive review paths. Extraction, summarization, and Q&A are lighter supporting paths and can reuse the same evidence, provenance, and rendering primitives.

## 3. The three primary analysis pipelines

### 3.1 Pipeline A — Compliance check

**Purpose:** Determine how a supplied document addresses a defined set of legal or policy requirements.

**Examples:**

- “Check this DPA against GDPR Article 28.”
- “Assess whether the vendor terms cover GDPR data-subject-right assistance.”
- “Review this BAA against the HIPAA requirements available in the system.”

**What makes this lane special:**

- It is rule-first, not merely risk-first.
- The applicable legal rules are selected from a versioned skill catalog.
- Each rule has an authored citation, hypothesis, proof standard, proof elements, evidence hints, and scope.
- Every selected rule becomes an expected check in a ledger, so it cannot disappear simply because no supporting clause was found.
- Evidence is isolated by requirement and document.
- A structured verifier assesses atomic proof elements.
- Code validates citations, aggregates element decisions, locks the outcome, and creates a coverage-preserving report snapshot.
- Missing proof, unresolved appendices, conflicts, and model failures remain visible rather than being converted into false compliance conclusions.

The compliance pipeline is conceptually:

```text
Selected legal rules
      |
      v
Expected-check ledger
      |
      v
Graph-native evidence investigation
  - exact/structural signals
  - sparse lexical retrieval
  - dense embedding retrieval
  - semantic reranking
  - referenced-clause/appendix expansion
      |
      v
Requirement-level verification
      |
      v
Element aggregation and status policy
      |
      v
Locked assessment + exact citations
      |
      v
Compliance report snapshot
      |
      v
Checked presentation and release gate
```

The supported requirement statuses are:

| Status | Meaning |
|---|---|
| `present` | Required elements are sufficiently established by valid evidence. |
| `partial` | Some required elements are established, but one or more material parts are absent or inadequate. |
| `gap` | The reviewed material shows a substantive requirement is missing or contradicted. |
| `cannot_determine` | The supplied material is insufficient to reach a reliable conclusion. |
| `not_applicable` | Applicability has been affirmatively ruled out based on available facts; silence alone is not enough. |
| `conflicting` | Relevant provisions conflict and cannot be reconciled safely. |
| `judgment_required` | The issue depends on legal or contextual judgment that should not be flattened into a mechanical answer. |
| `verification_incomplete` | Investigation or verification did not complete reliably; the system preserves any validated facts but does not invent an outcome. |

### 3.2 Pipeline B — Risk review

**Purpose:** Identify the biggest exposures in a document from a selected party’s perspective.

**Examples:**

- “What are the top five risks for the customer?”
- “What is the biggest risk if we onboard this vendor?”
- “Review the termination, indemnity, liability, security, and data-use risks.”

**How it works:**

1. PLAN determines the user’s party perspective, scope, requested depth, and any explicit cap such as “top three.”
2. The active document-type, topic, regime, and jurisdiction skills contribute relevant clause types and risk categories.
3. The document is inventoried and relevant clauses are extracted from the canonical structure.
4. Risk propositions are evaluated against source evidence.
5. Confirmed risk findings are normalized and ranked.
6. A risk summary is derived from the individual findings.
7. The report outline is shaped around the actual risks found, then validated before release.

This lane deliberately distinguishes a commercial risk from a legal compliance conclusion. For example, a broad indemnity may be commercially unfavorable without being a GDPR Article 28 violation. Keeping the lanes separate prevents the system from labelling every negotiation issue as “non-compliant.”

### 3.3 Pipeline C — Comparison and playbook review

**Purpose:** Evaluate alignment or differences between two sides, two documents, or a contract and a reference playbook.

**Examples:**

- “Is termination balanced between the parties?”
- “Compare version A and version B.”
- “Does this agreement align with our playbook?”

**How it works:**

1. The system resolves document roles: target versus reference/playbook.
2. For a playbook, it extracts normative positions such as requirements, preferences, prohibitions, fallback positions, and severity if violated.
3. It turns the comparison question into paired propositions or comparison rows.
4. It retrieves evidence for both sides rather than evaluating only one clause in isolation.
5. It emits structured comparison-delta findings with side-A and side-B roles.
6. It synthesizes a comparison-focused report and keeps source quotations attached to each conclusion.

For compound prompts such as “check GDPR compliance, compare the playbook, and rank customer risks,” PLAN can construct isolated branches for the different operations. Safe preparation work—such as document classification, clause extraction, or evidence indexing—can be shared, while legal rules and verdict channels remain isolated. Branch outputs are merged deterministically in the original request order.

The branch-orchestration implementation supports `off`, `shadow`, and `compound` modes. This means the architecture exists for multi-lane prompts, but production behavior can be rolled out or observed under configuration rather than being forced on every request.

## 4. End-to-end user flow

### 4.1 Starting an analysis

1. The authenticated user opens **Legal Space → Analyze**.
2. The user attaches documents in one of three ways:
   - quick upload or drag-and-drop;
   - selection from the document vault;
   - selection of a saved draft.
3. The user types an instruction or chooses a prompt/question starter.
4. If a playbook is included, the user can mark it as the playbook/reference document.
5. The user selects:
   - **Narrative** or **Tabular** output;
   - **Lite** or **Deep** analysis.
6. The Analyze button is enabled only when at least one document and a non-empty instruction are present.

### 4.2 Request creation and live processing

1. The frontend sends an authenticated `POST /api/analysis/run` request.
2. The backend validates the payload with Zod.
3. The API creates an asynchronous `analysis_pac` job and immediately returns HTTP `202` with a job ID.
4. The frontend subscribes to the job event stream at `/api/jobs/sse`.
5. Progress events update the overlay—for example, reading documents, thinking, extracting clauses, verifying compliance, and writing the report.
6. Report tokens are streamed to the UI as they are produced.

The job architecture prevents a long legal review from blocking the HTTP request and gives the user continuous feedback.

### 4.3 Document ingestion and safety gate

For every selected document, the backend loads or builds a canonical document graph:

1. `docling.rs` performs layout-aware parsing for PDFs; native readers handle supported plain-text formats.
2. The system preserves page references, bounding boxes, character spans, headings, lists, tables, and source identities.
3. A deterministic physical hierarchy is built from numbering, headings, and list structure.
4. A separate semantic-reference graph links provisions to referenced clauses, schedules, and appendices.
5. Optional model-assisted relation discovery may propose non-obvious links, but code accepts a proposal only when its evidence is an exact source substring and its target resolves to an existing node.
6. Validation checks roots, cycles, orphans, ranges, graph targets, relation evidence, and at least 99.5% text coverage.
7. A recoverable problem allows verified-content-only degraded analysis and is disclosed as a structural limitation.
8. An integrity failure blocks analysis instead of producing an unsafe report.

The versioned graph is encrypted and stored in `document_structure_artifacts`, so ACT consumes a stable source model rather than re-chunking the document differently for every request.

### 4.4 PLAN phase

PLAN answers: **What exactly is the user asking us to prove, against which standard, over which documents, and in what form?**

It performs the following work:

1. Classifies the instruction into four axes:
   - scope: whole document, named section, cross-cutting theme, or cross-document;
   - operation: compliance, risk, compare, extract, summarize, Q&A, and so on;
   - standard: no external standard, regime skill, playbook rule, or reference document;
   - output form: memo, table, checklist, redline/diff, Q&A thread, or summary.
2. Extracts each concrete semantic requirement from compound instructions.
3. Resolves target/reference document roles.
4. Determines party perspective where it matters.
5. Detects explicit boundaries such as “Article 28 only,” “top three risks,” or “termination section only.”
6. Selects and hydrates the relevant skills.
7. Resolves the user’s requirements against the complete catalog exposed by those skills.
8. Builds a report specification and an executable dependency graph of work units.
9. Records pinned taxonomy, skill, rule, and model-task versions for traceability.

TypeScript—not the model—owns phase transitions and the final executable plan.

### 4.5 Optional ASK phase

The system pauses only when an ambiguity would materially change the work, for example:

- no document was selected;
- it is unclear which of two documents is the target and which is the playbook;
- the requested operation or legal standard cannot be determined with sufficient confidence;
- a skill match is genuinely ambiguous.

The API returns `needs_input`, the UI shows the questions, and the user submits answers through `POST /api/analysis/resume-ask`. The persisted session is rehydrated, the answers are applied, and the workflow resumes at PLAN. This avoids silently guessing a legal standard or document role.

### 4.6 ACT phase

ACT executes the planned work-unit graph in topological dependency batches.

- State-mutating preparation tasks run in dependency order.
- Independent finding-only tasks can run concurrently.
- Concurrency is bounded through configuration.
- Each work unit has a known tool name, input, dependency list, output schema, and terminal status.
- Progress messages are mapped to the current tool but internal orchestration noise is kept out of the final legal report.

Representative work units include:

- `classify_document`;
- `extract_clauses`;
- `inventory_provisions`;
- `extract_shared_evidence`;
- `run_compliance_pipeline`;
- `flag_risk`;
- `evaluate_package`;
- `extract_playbook_positions`;
- `check_against_rule`;
- `evaluate_matrix_row`;
- `derive_risk`;
- `aggregate_requirements`;
- `render_output`;
- `merge_branch_outputs`.

### 4.7 Audit and release

Lite and Deep preserve the same rigor for an individual verification; Deep expands scope and evidence budget rather than allowing a looser truth standard in Lite.

- **Lite:** skips supporting-priority checks, uses smaller evidence and report budgets, and goes from ACT to the deterministic release gate.
- **Deep:** includes supporting requirements, allows more selected passages and a larger evidence/report budget, and runs an additional evidence AUDIT before the same release gate.

Every run passes Critique Lite, a deterministic release gate that checks execution completeness, required coverage, report structure, alignment with the user’s request, placeholder output, and whether material facts were surfaced. The old open-ended critique/redo loop is retired; the controller does not allow the model to loop indefinitely or choose its own phase transitions.

The terminal release result is one of:

- release (`green`);
- release with limitations (`green_partial`);
- withhold/block;
- awaiting user;
- out of scope;
- budget or turn limit reached.

### 4.8 Report, history, and follow-up

The report is built section-by-section from findings, assessments, and exact evidence. Compliance reports use a locked snapshot so presentation cannot mutate the legal outcomes. A semantic conformance check validates adaptive compliance wording; if checked composition fails, the system uses a deterministic presentation rather than returning unvalidated prose.

The session state is written to `analysis_state_ledger`. The frontend can restore prior user/assistant turns and the report from history.

For a follow-up:

- a presentation-only request such as “make this shorter” can reuse the locked prior result and run only the renderer;
- a conversational question can reuse prior findings where source versions still match;
- a material topic shift or changed document source creates a new analysis rather than relying on stale conclusions.

## 5. How the skill system works

In this module, a **skill** is a versioned domain-knowledge pack used by PLAN and ACT. It is not just a system prompt.

Skills are composed across several axes:

| Skill axis | Examples | What it contributes |
|---|---|---|
| Global | `_global` | Universal evidence, citation, uncertainty, and writing rules. |
| Document type | DPA, NDA, MSA, SaaS agreement, employment agreement | Clause taxonomy, expected document structure, domain-specific risks. |
| Legal regime | GDPR, CCPA/CPRA, HIPAA BAA, EU AI Act, international transfers | Authored legal rules, citations, proof standards, evidence packages. |
| Jurisdiction | California, Delaware, England & Wales, Ireland | Jurisdiction-specific overlays and interpretation context. |
| Topic | Cybersecurity/incident response, vendor risk/diligence | Cross-document thematic checks and risk categories. |

### 5.1 Skill selection

There are two primary selection paths:

1. **Prompt-library selection:** a known prompt category deterministically activates the intended skills. For example, the privacy/GDPR/DPA prompt activates global + DPA + GDPR.
2. **Free-text selection:** document type and explicit trigger phrases are matched against the registry. Relevant regime, topic, and jurisdiction skills can be combined.

At the current catalog size, deterministic matching is preferred. An embedding-shortlist stage is deliberately gated until the number of skills justifies it, and embeddings are not allowed to finalize a skill choice on their own.

The system also adds safe pairings. For example, a GDPR request over a DPA can activate both the GDPR regime skill and the DPA document-type skill. An explicit international-transfer request can add the transfer overlay.

### 5.2 Skill hydration

After selection, the runtime hydrates the active skills into the analysis state:

- merged clause types and definitions;
- expected clauses;
- risk categories;
- regime rules;
- evidence packages;
- report guidance;
- skill markdown guidance;
- active skill versions and taxonomy versions.

The structured `skill.config.ts` data drives routing and execution. `SKILL.md` supplies legal-analysis and writing guidance. This prevents free-form prose from being the only machine-readable source of legal scope.

### 5.3 What a legal rule contains

A mature rule can include:

- stable rule ID;
- human-readable label;
- authoritative instrument, provision path, and citation;
- rule text and legal hook;
- applicability and relationship scope;
- selection aliases and concepts;
- hypothesis to test;
- evidence hints;
- proof standard;
- atomic required and optional proof elements;
- relationships to required, supporting, or related rules;
- verification guidance and version;
- renderer hooks and remediation guidance.

This structure is the main reason the module can distinguish “present,” “partial,” “cannot determine,” and “verification incomplete” instead of asking a model for one unsupported yes/no answer.

## 6. Worked example — “Check this DPA against GDPR Article 28”

Assume the user uploads `Vendor-DPA.pdf` and enters:

> Check whether this DPA complies with GDPR Article 28. Give me a table of every mandatory requirement, the exact contract wording, gaps, and recommended actions.

### 6.1 What PLAN understands

The expected classification is approximately:

| Axis | Resolution |
|---|---|
| Scope | Whole target DPA, explicitly limited to Article 28 |
| Operation | `compliance_check` |
| Standard | GDPR regime pack |
| Document type | DPA |
| Output | Tabular compliance memo |
| Core skills | Global + DPA + GDPR |
| Party relationship | Controller-to-processor |

The explicit-scope parser identifies Article 28 as the legal boundary. Cross-referenced articles may be used as context for an Article 28 requirement, but they are not automatically scheduled as separate compliance checks. For example, Article 32 informs the Article 28(3)(c) security obligation; the system should not silently turn an Article 28-only request into a full Article 32 audit.

### 6.2 Which Article 28 requirements are selected

The GDPR skill models Article 28 as atomic rules and named compositions. The relevant checks include:

| Rule | What is tested |
|---|---|
| Art. 28(1) | Controller uses processors providing sufficient guarantees. |
| Art. 28(2) | Prior specific/general written subprocessor authorisation; for general authorisation, change notice and meaningful objection opportunity. |
| Art. 28(3) chapeau + 28(9) | Binding written/electronic instrument and the processing particulars: subject matter, duration, nature, purpose, data types, data-subject categories, controller obligations and rights. |
| Art. 28(3)(a) | Processing and transfers only on documented controller instructions, subject to the legal-requirement proviso. |
| Art. 28(3)(b) | Confidentiality obligations for authorised persons. |
| Art. 28(3)(c) | Article 32 security measures. |
| Art. 28(3)(d) | Subprocessor conditions and flow-down. |
| Art. 28(3)(e) | Assistance with Chapter III data-subject rights. |
| Art. 28(3)(f) | Assistance with security, breach, DPIA, and prior-consultation duties under Articles 32–36. |
| Art. 28(3)(g) | Controller choice to return or delete data after services, deletion of copies, and lawful-retention exception. |
| Art. 28(3)(h) | Compliance information, audits/inspections, and warning about unlawful instructions. |
| Art. 28(4) | Equivalent obligations imposed on subprocessors and processor liability for their performance. |
| Art. 28(10) | Role boundary: a processor determining purposes and means may be treated as a controller for that processing. |

The skill also exposes named compositions such as:

- `gdpr.art28.mandatory_particulars` — Article 28(3) chapeau plus the writing requirement;
- `gdpr.art28.mandatory_clauses` — Article 28(3)(a)–(h) plus Article 28(4).

These named shortcuts simplify selection, but the atomic rules remain the source of legal truth and the unit of verification.

### 6.3 How one requirement is evaluated

Take Article 28(2), subprocessor authorisation.

The authored hypothesis is that the processor cannot appoint another processor without prior specific or general written authorisation and, for general authorisation, must give advance notice of additions or replacements so the controller can object.

Its required proof elements include:

1. written authorisation;
2. advance change notice when general authorisation is used;
3. a meaningful controller objection opportunity.

The investigation stage builds queries from the hypothesis, evidence hints, and proof elements. It searches the canonical document graph using structural, sparse, and dense signals. It may retrieve the main subprocessor clause, an incorporated online list, and a schedule. The semantic reviewer selects passages that actually contribute to each element. Reference expansion follows real graph links rather than guessing that an absent “Schedule A” exists.

The verifier receives a bounded, structured payload containing the rule, proof elements, candidate passages, exact locators, scope, and dependencies. It answers at element level. Code then validates that cited text exists in the source and applies the status policy.

Hypothetical result:

| Element | Evidence | Decision |
|---|---|---|
| Written authorisation | “Customer provides general written authorization…” | Proven |
| Change notice | “Provider will give 15 days’ notice before adding a subprocessor.” | Proven |
| Objection opportunity | No objection right in the supplied DPA or linked schedule | Not proven after completed search |

The requirement should therefore be **Partial**, not Present. The report might say:

- **What the document provides:** general written authorisation and 15-day advance notice.
- **What is missing or unclear:** no meaningful mechanism allowing the controller to object.
- **Why it matters:** Article 28(2) couples general authorisation with notice and an opportunity to object.
- **Recommended action:** add a defined objection process, response period, and consequence if the parties cannot resolve the objection.

If the DPA refers to an unavailable subprocessor policy that may contain the objection mechanism, the safer result is **Cannot determine** or **Verification incomplete**, not a fabricated Gap or Present outcome.

### 6.4 How the Article 28 report is produced

After every expected check reaches a terminal outcome:

1. Assessments are locked with their rule versions, document hashes, evidence, and exact pointers.
2. A compliance snapshot preserves all expected rows, including incomplete ones.
3. The report composer receives only the locked data and a registry of de-duplicated evidence quotations.
4. It creates a plan and draft constrained to known finding IDs and allowed columns.
5. A semantic check verifies that the wording conforms to the locked findings.
6. If adaptive composition fails validation or exceeds budget, a deterministic report is returned.
7. The release gate confirms request coverage and structural validity before the report is exposed.

This is why report generation cannot legitimately “upgrade” a partial Article 28(2) assessment to present merely to make the prose sound confident.

## 7. Technology stack

### 7.1 Frontend

| Technology | Use in Analysis |
|---|---|
| React 19 + TypeScript | Analyze landing page, document selection, clarification UI, report view, history, and follow-up conversation. |
| Vite | Frontend development and production build. |
| React Router | Protected routing and application layout. |
| Tailwind/CSS + Motion + Lucide | Styling, interaction, transitions, and icons. |
| Server-Sent Events | Job progress and streamed report tokens. |
| `pdfjs-dist` | PDF-oriented frontend features and document display support. |
| Markdown rendering | Counsel-facing report display. |

### 7.2 Backend and orchestration

| Technology | Use in Analysis |
|---|---|
| Node.js + TypeScript | Runtime and strongly typed legal-analysis state machine. |
| Express | Authenticated Analysis, job, history, and session APIs. |
| Zod | Request and structured-payload validation. |
| Async PostgreSQL-backed job queue | Long-running analysis execution, progress, status, and results. |
| PAC controller | Deterministic PLAN/ASK/ACT/AUDIT/DONE orchestration. |
| Work-unit DAG | Dependency-aware execution and bounded parallelism. |
| Pino/Sentry | Operational logging and error/diagnostic observability. |

### 7.3 Document and retrieval layer

| Technology | Use in Analysis |
|---|---|
| `docling.rs` + PDFium assets | Layout-aware PDF parsing and canonical structure extraction. |
| Mammoth / PDF parsing libraries | Supported document-text ingestion paths. |
| Canonical document graph | Stable nodes, hierarchy, source ranges, page pointers, tables, references, and unresolved targets. |
| Hybrid retrieval | Exact/structural, sparse lexical, and dense semantic retrieval. |
| Gemini embeddings | Dense candidate retrieval with a separate scheduler lane; lexical fallback on embedding failure. |
| Encrypted structure artifacts | Versioned reuse of parsed document structure. |

### 7.4 Model layer

| Technology | Use in Analysis |
|---|---|
| Google Gemini API via `@google/genai` | Primary structured and streaming completion provider. |
| Task-specific model presets | Different temperature, output, and thinking settings for classification, verification, critique, and refinement. |
| JSON response schemas | Constrain model output for intent, verification, report planning, and conformance checks. |
| OpenRouter legacy provider | Retained compatibility path; Gemini is the primary routed provider in this module. |
| Token, time, concurrency, and output ceilings | Bound cost and latency and prevent unbounded agent behavior. |

### 7.5 Data, authentication, and isolation

| Technology | Use in Analysis |
|---|---|
| PostgreSQL / Neon-compatible pooling | Files, jobs, document structures, analysis ledger, folders, and other application data. |
| Row-level-security transaction context | User/tenant isolation for protected records. |
| JWT/Firebase-related application auth | Authenticated API access; the Analysis endpoints require a user token. |
| Application encryption utilities | Encrypted stored document content and graph artifacts where configured. |
| Versioned state snapshots | Resume-after-clarification, history, auditability, and safe follow-up reuse. |

## 8. Why the system is designed this way

### 8.1 Why not use one large prompt?

A single prompt is fast to prototype but weak for legal review because it mixes scope selection, retrieval, legal interpretation, evidence judgment, and writing in one opaque step. It is difficult to know whether an omitted rule was intentionally inapplicable, accidentally forgotten, or simply not retrieved.

The current design makes each responsibility observable and testable.

### 8.2 Why rules are atomic

GDPR Article 28 contains several independent obligations. A document can satisfy confidentiality while failing deletion, audit, or subprocessor requirements. Atomic rules prevent one strong clause from causing the entire article to be labelled compliant.

### 8.3 Why use skills

Legal knowledge changes independently from orchestration code. Skills allow the team to version and review legal substance—rules, citations, proof elements, risks, clause definitions, and report guidance—without rewriting the workflow engine. They also allow a DPA skill, GDPR skill, transfer skill, and jurisdiction skill to be composed for the same request.

### 8.4 Why build a canonical document graph

Legal meaning is structural. A paragraph may depend on a parent definition, a referenced schedule, or an incorporated policy. Flat chunks can lose that relationship and create false matches. The graph preserves structure and provenance once, validates it, and gives every later stage a stable view of the source.

### 8.5 Why hybrid retrieval

Exact and lexical search are strong for defined terms and familiar clause wording. Dense retrieval is useful when the agreement expresses the same concept differently. Structural signals and graph expansion recover parent clauses, definitions, schedules, and cross-references. Combining the channels improves recall while keeping citations traceable.

### 8.6 Why separate retrieval from verification

Retrieval answers “which passages might matter?” Verification answers “what does this evidence actually prove?” Conflating them allows a high-similarity passage to be treated as proof. The system instead retrieves broadly, semantically reviews candidates, verifies atomic elements, and then applies a code-owned status policy.

### 8.7 Why use locked findings for reporting

The report writer’s job is presentation, not legal re-adjudication. Locked outcomes prevent fluent prose from changing a status, omitting an inconvenient limitation, or citing evidence that was never verified. A deterministic fallback preserves usability if the adaptive writer or semantic check fails.

### 8.8 Why have Lite and Deep modes

Users need different latency/detail trade-offs. The system treats this as a scope and budget decision, not a truth-quality decision. Lite can omit supporting-priority checks and use fewer selected passages; Deep examines more supporting material, provides larger evidence and output budgets, and adds an audit pass. A checked requirement should be evaluated with the same rigor in both.

### 8.9 Why use asynchronous jobs and streaming

Document parsing, retrieval, verification, and report synthesis may take longer than a normal request timeout. Jobs make the process resilient and observable. SSE provides low-overhead one-way progress and token delivery to the browser.

### 8.10 Why persist the complete session

Clarifications and follow-ups need continuity. Versioned state lets the system resume safely, reuse a locked result for formatting requests, reject stale reuse when documents change, and provide an auditable history of what was planned, checked, and released.

## 9. Reliability, safety, and observability controls

The module includes the following controls:

- authenticated Analysis endpoints;
- document ownership and session-history checks;
- row-level database isolation;
- encrypted stored artifacts;
- input validation with Zod;
- canonical source hashes and version references;
- exact-substring and source-range checks for citations;
- graph integrity validation before analysis;
- explicit degraded and blocked document modes;
- expected-check reconciliation so selected rules cannot vanish;
- requirement-isolated evidence bundles;
- deterministic assessment and release policies;
- incomplete statuses for model, retrieval, or dependency failures;
- bounded model calls, token budgets, deadlines, and concurrency;
- no model-controlled phase transitions;
- structured diagnostic events that are observers, not sources of truth;
- skill parity and rule-contract tests;
- regression fixtures for Article 28, DSR, comparison, branch isolation, reporting, and evidence grounding.

## 10. Current implementation notes and honest limitations

The following points are important when presenting the current state:

1. **The compliance architecture contains a rollout boundary.** The graph-native investigation path is current, but the default production verification mode is presently the previous/legacy verifier. A newer multi-pass verification implementation remains available through rollout modes such as shadow/canonical for qualification. This is an intentional compatibility and safety choice, not a claim that all refactor-era verification is already canonical.
2. **Multi-branch compound orchestration is configuration-controlled.** The code supports compound, shadow, and off modes. Product documentation should say “supported architecture” unless the deployment configuration is confirmed.
3. **Embedding-based skill selection is not active at the current catalog size.** Skill selection is intentionally deterministic; the embedding shortlist is a gated placeholder for a larger future catalog.
4. **Some document relationships use optional model assistance.** Deterministic reference extraction is always available, while semantic relation discovery and adjudication are controlled by environment flags.
5. **The system analyzes supplied evidence; it does not replace legal judgment.** `cannot_determine`, `judgment_required`, limitations, and missing-material disclosures are first-class outcomes.
6. **External or incorporated materials matter.** If an agreement relies on a missing policy, schedule, or online document, the system should disclose that dependency rather than assume its contents.
7. **Legal content still requires governance.** Skills and rule versions should be maintained and approved by qualified legal owners, especially when statutes, guidance, or organizational risk positions change.

## 11. Short explanation for a senior stakeholder

You can describe the module in one minute as follows:

> The Analysis module is an evidence-grounded legal review engine. A user uploads one or more agreements and asks a question. The system first creates and validates a canonical structure graph of the documents. It then classifies the request, selects versioned legal and contract skills, resolves the exact requirements, and builds an executable plan. Depending on the request, it runs one of three main lanes: compliance checking, risk review, or comparison/playbook alignment. It retrieves relevant clauses using structural, lexical, and semantic signals, verifies what each quotation actually proves, applies code-owned outcome rules, and produces a report from locked findings. The workflow can ask the user for genuinely missing context, supports Lite and Deep modes, streams progress, persists the full session, and reuses prior findings safely for follow-ups. The design separates orchestration, legal knowledge, evidence judgment, and presentation so that the result is traceable, testable, and safer than a single LLM prompt.

## 12. Repository map for reviewers

| Area | Main location |
|---|---|
| Analyze UI and user flow | `frontend/src/features/analyze/` |
| Analysis API | `backend/src/modules/analysis/api/` |
| Async execution handler | `backend/src/services/jobs/handlers/analysis-handler.ts` |
| PAC orchestration | `backend/src/modules/analysis/pac/` |
| PLAN | `backend/src/modules/analysis/capabilities/plan/` |
| ACT dispatcher | `backend/src/modules/analysis/capabilities/act/execute-act-plan.ts` |
| Compliance pipeline | `backend/src/modules/analysis/capabilities/act/compliance/` |
| Risk evaluation | `backend/src/modules/analysis/capabilities/act/risk-review/` |
| Comparison/playbook operations | `backend/src/modules/analysis/capabilities/act/operations/` |
| Document structure graph | `backend/src/modules/analysis/capabilities/ingest/document-structure/` |
| Audit and release checks | `backend/src/modules/analysis/capabilities/audit/` and `capabilities/critique/` |
| Reporting | `backend/src/modules/analysis/capabilities/reporting/` |
| Skills and runtime | `backend/src/modules/analysis/skills/` |
| GDPR Article 28 rule definitions | `backend/src/modules/analysis/skills/regimes/data-protection/gdpr/` |
| State and domain models | `backend/src/modules/analysis/models/` |
| Session persistence | `backend/src/modules/analysis/capabilities/persist/` and `analysis_state_ledger` |

## 13. Final takeaway

The Analysis module is best understood as a controlled legal-analysis platform with three main review lanes, one deterministic orchestration lifecycle, a composable skill system, and an evidence-to-report chain that preserves provenance. Its value is not only that it can generate a legal memo; it can show which rule was selected, which source text was reviewed, what each passage proved, why a status was assigned, what remains uncertain, and whether the final report faithfully represents the locked analysis.
