# LORA — PAC Architecture Brief  
**Modules covered:** Analysis · Drafting  
**Audience:** Senior engineering / architecture review  
**Scope:** How these two modules work today under PAC orchestration (not the full product surface)

---

## 1. Product context (one paragraph)

LORA is a legal-tech platform. Besides older agent routes (DPA review, vendor review, negotiate, ask-lawyer, etc.), the backend is moving core **document analysis** and **agreement drafting** onto a shared **PAC** pattern: **Plan → Act → Critique**, with an optional **Ask** pause for missing facts. TypeScript owns the control loop; the LLM executes capability work but **never chooses phase transitions**. Both modules live under `backend/src/modules/{analysis,drafting}`, mount at `/api/analysis` and `/api/drafting`, and share the same LLM abstraction (`backend/src/llm`).

---

## 2. PAC — the shared control model

| Concept | Behavior |
|--------|----------|
| **Phases** | `PLAN` → (`ASK`?) → `ACT` → `CRITIQUE` → loop or `DONE` |
| **Controller** | `PacController.run(state)` — while-loop + switch; injects capabilities |
| **Transitions** | Pure functions in `pac/transitions.ts` (unit-testable, zero LLM) |
| **Policy** | Pure guards in `pac/policy.ts` (budgets, must-ask, mark-for-redo) |
| **Stop reasons** | `green` · `awaiting_user` · `max_turns` · `budget_exceeded` · `blocked` (+ analysis: `out_of_scope`) |
| **Budgets** | Turn cap (default 8), token budget, ask-round cap; analysis also caps docs / extraction units |
| **State** | Single mutable run object (`AnalysisState` / `DraftState`) carrying plan, findings/draft, critique, conversation, audit history |
| **Entry** | `*Entry.run()` seeds conversation + agent; `resumeAfterAsk()` re-enters after user answers |

**Invariant:** After Critique, fixes are **targeted** (flagged work units only) — no full regen unless skeleton mismatch forces a return to Plan.

Module-specific control flows are below (Analysis §3, Drafting §4) — same phase names, different PLAN work, ASK semantics, and resume behavior.

---

## 3. Analysis module

**Path:** `modules/analysis`  
**API:** `POST /run` · `POST /resume-ask` · `GET /session/:sessionId`  
**Entry:** `AnalysisEntry` → `PacController`

### Control flow

```
CREATE
  │
  ▼
PLAN
  ├── classifyIntent
  │     └── out_of_scope / legal-advice decline ──────────────► DONE (out_of_scope)
  └── buildPlan (resolve skills → buildActGraph)
        │
        ├── critical clarifications?
        │     (intent confidence / docs / skill ambiguity)
        │           │ yes
        │           ▼
        │          ASK ──► return awaiting_user
        │           │
        │           │ user answers → resumeAfterAsk → PLAN
        │           │ (re-classify intent/skills; do not skip PLAN)
        │           ▼
        └── no ──► ACT
                     │  topo batches of tools:
                     │  classify → extract → expected → flag_risk
                     │  → regime rules → render_output
                     ▼
                  CRITIQUE
                     │  locator + entailment + taxonomy + completeness
                     ├── green ───────────────────────────────► DONE → persistAnalysis
                     ├── skeletonMismatch ────────────────────► PLAN
                     ├── criticalFactSurfaced ────────────────► ASK
                     └── fixPlan (markForRedo, targeted) ─────► ACT
Budget stops anytime: max_turns | token | maxDocs | maxExtractionUnits → DONE
```

### What it does
Runs skill-scoped review of uploaded documents: classify → extract clauses → check expected clauses → flag risks → optional regime-rule checks → render output. Produces **Findings** with locators/evidence, not a drafted contract.

### PLAN
1. **`classifyIntent`** — heuristics + LLM; axes: scope / operation / standard / outputForm. Legal-advice / out-of-scope → decline and stop.
2. **`buildPlan`** — resolves **skills** (`general-review`, `commercial`, `privacy-gdpr-dpa`) from library id or free text; low confidence → critical clarification (ASK), not a guess. Builds a dependency-ordered **work-unit graph** via `buildActGraph` (tools as nodes).

### ACT tools (graph nodes)
Implemented today: `classify_document`, `extract_clauses`, `check_expected_clauses`, `flag_risk`, `check_against_rule`, `render_output`. Others are declared on the plan type but return explicit “not implemented / insufficient” findings. Execution: segment docs → topological batches → run tools → append Findings.

### CRITIQUE (stricter than drafting)
Deterministic gates first: locator existence, quote entailment in span/doc, taxonomy membership, completeness. Failures produce a **fixPlan** targeting work units. Explicit statuses `absent_expected` / `insufficient_evidence` are first-class passes (not forced “present”).

### Domain model (essentials)
- **`AnalysisState`** — request (docs + instruction), workspace (segmented docs), intent, active skills, findings, draftTasks, renderedOutput  
- **`AnalysisPlan`** — workUnits `{ tool, dependsOn, status }`, missingClarifications, pinned taxonomy versions  
- **`Finding`** — kind, category, status, claim, evidence spans, severity, skillId  
- **Skills** — config + `SKILL.md`; merge clause types, expected clauses, risk categories, regime rules; conflict-checked at registry load

### Notable design choices
- Skills drive the ACT graph (not free-form agent tool-calling).
- Evidence must be locator-backed and critique-verified.
- Analysis can emit **draft tasks** for handoff toward drafting (suggestion path), without owning draft generation.

---

## 4. Drafting module

**Path:** `modules/drafting`  
**API:** `POST /generate-stream` · `POST /refine` · `POST /resume-ask` · `GET /conversation/:documentId` · template upload  
**Entry:** `DraftEntry` → `PacController`  
**Entry modes:** `CREATE` (full PAC) · `HUMAN_REFINE` (surgical patch or targeted ACT)

### Control flow — CREATE

```
CREATE
  │
  ▼
PLAN
  ├── extractRequirements
  ├── retrieveContext (template / playbook / clauses)
  └── buildPlan
        ├── resolveApplicablePacks (doc-type × regime × jurisdiction)
        └── detectGaps (one-shot) → freeze checklist + missingFacts
              │
              ├── critical missingFacts? ──yes──► ASK → persistDraft → return
              │                                      │
              │                                      │ user answers → resumeAfterAsk
              │                                      │   critical left? ──yes──► ASK
              │                                      │                 └── no ──► ACT
              │                                      │   (skips re-detectGaps / full PLAN)
              └── no ──────────────────────────────► ACT
                                                       │  topo batches:
                                                       │  draftSection / draftExhibit
                                                       │  (deal identity locked)
                                                       │  → assembleDocument
                                                       ▼
                                                    CRITIQUE
                                                       │  skeleton · placeholders · parties
                                                       │  · checklist (LLM)
                                                       ├── green ──────────────────────────► DONE → persistDraft
                                                       ├── skeletonMismatch ───────────────► PLAN
                                                       ├── criticalFactSurfaced ───────────► ASK
                                                       │     (keeps fixPlan for post-answer redraft)
                                                       ├── fixPlan empty ──────────────────► DONE (keep draft)
                                                       └── fixPlan (markForRedraft) ───────► ACT
Budget stops anytime: max_turns | tokenBudget → DONE
```

### Control flow — HUMAN_REFINE

```
REFINEMENT request
  │
  ▼
applyFixPlan
  ├── surgicalRefineApplied? ──yes──► DONE → persistDraft (no PAC loop)
  └── else synthesizePlanFromDraft (if needed)
            │
            ▼
         enter PAC at ACT ──► CRITIQUE ──► (same branches as CREATE)
```

### What it does
Creates / refines agreements section-by-section from **three-axis packs** (document type × regime × jurisdiction), with gap detection, user ASK for critical facts, then assemble + critique.

### PLAN
1. **`extractRequirements`** — LLM structures contract type, parties, jurisdiction, clauses from instructions / uploads.  
2. **`retrieveContext`** — templates, playbook rules, clause library / catalog.  
3. **`buildPlan`** — `resolveApplicablePacks` (deterministic triggers, no LLM) merges:
   - **Document type** skeleton (NDA, DPA, MSA, SLA, service-agreement)
   - **Regime** add-ons (GDPR Art.28, HIPAA BA, CPRA, UK IDTA, …)
   - **Jurisdiction** skill overlays (England, Ireland, Delaware, California, …)  
   One **`detectGaps`** LLM call freezes `mandatoryChecklist` + `missingFacts`; core deal facts are merged deterministically and capped. Critical missing facts → ASK before ACT.

### ACT
Topo-batched `draftSection` / `draftExhibit` (default concurrency 1 to avoid provider 429s). Locks **deal identity** (party names) into glossary. Ends with **`assembleDocument`**. Critique-driven redrafts only re-run flagged units.

### CRITIQUE
Deterministic first: skeleton section presence, placeholders, party consistency/presence. Then LLM review against checklist. Green → DONE; else targeted `fixPlan` → ACT (or ASK if a critical fact surfaced; skeleton mismatch → PLAN). Empty fixPlan stops the loop instead of spinning.

### HUMAN_REFINE
`applyFixPlan` can surgically patch sections without a full PAC loop; otherwise synthesizes a plan from the existing draft and enters ACT.

### Domain model (essentials)
- **`DraftState`** — requirements, retrieval, plan, draft (sections + formattedDocument), validation, riskReview, structuredFacts  
- **`DraftPlan`** — workUnits (section|exhibit), missingFacts, mandatoryChecklist, regimes, glossary, negotiationPositions  
- **Packs** — `pack.ts` (skeleton / triggers) + `skill.md` (prompt grounding loaded via `load-skill-docs`)

### Notable design choices
- Pack merge is code-owned; LLM fills content and gaps, not structure.
- ASK pauses persist to `draft_state_ledger` for resume.
- After ASK answers, resume skips re-detectGaps when possible (avoids re-asking the same fields) and goes ASK→remaining critical or ACT.

---

## 5. Side-by-side

| | **Analysis** | **Drafting** |
|--|--------------|--------------|
| Goal | Findings + rendered review | Formatted agreement |
| Knowledge packs | Skills (clause/risk/regime rules) | Doc-type + regime + jurisdiction packs |
| Work units | Tool invocations | Sections / exhibits |
| ASK for | Intent/skill/doc clarifications | Critical deal facts |
| Critique focus | Evidence locators + taxonomy | Skeleton, parties, placeholders, checklist |
| Extra budgets | Docs + extraction units | Token + turns |
| Refine path | Resume after ASK | HUMAN_REFINE + resume-ask |

Shared: injected capabilities, topo batches, audit history, conversation store pattern, shared LLM provider/task layer, “TS owns the loop.”

---

## 6. Runtime wiring

```
HTTP (auth) → api/controller → AnalysisEntry / DraftEntry
                                    ↓
                              PacController
                                    ↓
                    capabilities/{plan|act|critique|ask|persist}
                                    ↓
                         llm/ (Gemini / OpenRouter, task-typed)
                                    ↓
                    persist (session / draft_state_ledger) + progress/SSE callbacks
```

Older routes (`routes/analyze.ts`, legacy `routes/drafting.ts`, specialized agents) still exist for other product surfaces; **these two modules are the PAC reference implementation** for the refactor direction.

---

## 7. Review prompts for seniors

Worth pressure-testing:

1. **Control vs model** — Is keeping phase transitions out of the LLM the right long-term tradeoff vs a planner agent?  
2. **Pack/skill authoring** — Cost of adding a new doc type / skill; versioning and conflict rules.  
3. **Critique loop** — Targeted redo quality vs risk of local minima; empty-fixPlan stop heuristics.  
4. **ASK UX** — Max ask rounds, critical vs optional, resume semantics after partial answers.  
5. **Evidence bar (analysis)** — Locator + entailment strictness vs recall on messy PDFs.  
6. **Concurrency / cost** — Drafting ACT concurrency=1; token budgets; when to parallelize safely.  
7. **Handoff** — Analysis `draftTasks` → Drafting CREATE: is the contract clear enough?  
8. **Coverage gaps** — Analysis tools still stubbed; drafting pack coverage vs real deal mix.

---

## 8. Key files (navigation)

| Area | Analysis | Drafting |
|------|----------|----------|
| Entry | `entry/analysis-workflow.ts` | `entry/draft-workflow.ts` |
| Controller | `pac/controller.ts` | `pac/controller.ts` |
| Transitions / policy | `pac/transitions.ts`, `policy.ts` | same layout |
| Capabilities wire-up | `capabilities/index.ts` | `capabilities/index.ts` |
| Plan | `capabilities/plan/*` | `capabilities/plan/*` |
| Act | `capabilities/act/execute-act-plan.ts` | `capabilities/act/execute-act-plan.ts` |
| Critique | `capabilities/critique/run-critique.ts` | same |
| Domain packs | `skills/` | `packs/` |
| API | `api/route.ts` | `api/route.ts` |

---

*This brief covers Analysis + Drafting PAC only. Other modules: `docs/LORA-Modules-Architecture-Detail.md`. Platform overview: `docs/LORA-overview.md`.*
