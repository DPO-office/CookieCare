# Prompt for Claude — Fix LORA Analysis PAC module

Copy everything below this line into Claude (with the CookieCare repo / `backend/src/modules/analysis` available).

---

## Role

You are a senior legal-tech engineer. Propose the **best architectural + implementation fix** for the LORA **Analysis PAC** module so it can produce competitor-quality legal analysis on real DPAs — without abandoning PAC (TypeScript owns phase transitions; the LLM does not choose PLAN/ACT/CRITIQUE/ASK).

Do **not** just add more prompt text. Diagnose whether the graph, skills, taxonomies, critique, and renderer are the wrong shape for instruction-scoped legal questions, then propose a concrete fix plan (files, data model, graph changes, prompts, UI).

---

## Product context

LORA is moving document analysis onto **PAC: Plan → Act → Critique**, optional **Ask**.

- Path: `CookieCare-main/backend/src/modules/analysis`
- API: `POST /api/analysis/run`, `POST /api/analysis/resume-ask`, `GET /api/analysis/session/:sessionId`
- Job: `analysis_pac` (`backend/src/services/jobs/handlers/analysis-handler.ts`)
- Frontend: `CookieCare-main/frontend/src/features/analyze` (wired to PAC, SSE streaming via `draft_token`)
- Shared LLM: `backend/src/llm` (Gemini JSON + streaming)
- Docs: `CookieCare-main/docs/PAC-Analysis-Drafting.md`

**Invariant to keep:** TypeScript owns the control loop. Skills/packs define the ACT graph. Findings should be locator-backed. Do not turn this into a free-form agent that picks tools ad hoc.

**Invariant that is failing today:** The user instruction must **shape** what is analyzed and what is written. Right now the instruction is only a weak hint inside `flag_risk`; the graph always runs the same skill skeleton.

Drafting PAC is more mature (packs × regimes × jurisdictions, ASK for facts, section draft, assemble). Analysis copied the *pattern* but the *domain packs* and *question-shaped execution* are thin.

---

## How a run works today (actual code, not slides)

```
Frontend: documents + prompt (+ optional promptLibraryId)
  → POST /api/analysis/run
  → job loads file contents from Postgres
  → AnalysisEntry → PacController

PLAN
  classifyIntent (heuristic + Gemini JSON):
    scope / operation / standard / outputForm
    legal-advice regex → out_of_scope decline
  buildPlan:
    if low confidence / no docs / unsupported operation / skill ambiguity → ASK
    else resolveSkills (library id OR trigger phrases OR fallback general-review)
    buildActGraph(primaryDocId only)  ← ONLY documentIds[0] is analyzed

ASK (if critical clarifications)
  persist ledger, return needs_input
  resume-ask → applyUserAnswers → PLAN again (does not skip PLAN)

ACT (topo graph, always this shape for privacy skill)
  classify_document     (regex on first 6k chars, NO Finding emitted)
  extract_clauses       (Gemini JSON, clauseType enum from skill)
  check_expected_clauses (deterministic; SILENT if clause present)
  flag_risk             (Gemini JSON vs skill.riskCategories enum)
  check_against_rule    × each skill.regimeRules (Gemini; IGNORES user instruction)
  render_output         (table/checklist dump, or memo LLM if schemaId=memo)

CRITIQUE
  locator exists + quote in doc
  taxonomy membership
  expected-clause coverage
  regime-rule coverage
  EVERY work unit must have ≥1 Finding   ← classify + silent expected-check fail this
  LLM entailment on present risks
  fail → targeted ACT redo or PLAN if skeletonMismatch
  maxTurns default 8

DONE → persist conversation + analysis_state_ledger
Follow-up chat = NEW /run, not session continue
```

### ACT graph builder

`skills/build-act-graph.ts` always emits classify → extract → expected → flag_risk → one unit per regimeRule → render. It does **not** branch on the user’s question (e.g. “only Arts 15–22”).

### Skills that exist (only 3)

1. `general-review` — commercial risk flags (liability, indemnity, termination…)
2. `commercial` — payment/IP/liability; **no regimeRules**
3. `privacy-gdpr-dpa` — supposed GDPR Art 28 DPA skill (this test selected it)

Prompt library categories (vendor-risk, security, employment, AI, regulatory HIPAA/CCPA, disputes) **do not have skills**. They either map to privacy via `promptLibraryId=privacy` or fall through to general-review / free-text scoring.

### Privacy skill as authored today (`skills/privacy-gdpr-dpa/skill.config.ts`)

**clauseTypes:** data_protection, definitions, termination, confidentiality, limitation_of_liability, indemnity, governing_law  
(no data_subject_rights, no transfers, no subprocessors, no breach_notification as first-class types)

**expectedClauses:** data_protection + limitation_of_liability only

**riskCategories (only 2):**
- `missing_carve_out`
- `other_known_risk`  ← junk drawer; almost every finding lands here

**regimeRules (only 3, none is the DSR rule):**
- `gdpr.art28.3.a` — documented instructions
- `gdpr.art28.3.b` — confidentiality of persons
- `gdpr.art28.3.h` — information / audits

**MISSING the rule that matches the test prompt:**
- `gdpr.art28.3.e` — assist controller with Chapter III data-subject rights

Also missing: Art 28(3)(c)(d)(f)(g), Arts 15–22 as checks, Art 12(3) timing, Art 33/34 breach, Art 44–49 transfers, subprocessors Art 28(2)/(4).

**SKILL.md** mentions “Missing processor obligation to assist with data subject requests” but that was never encoded as a rule, expected clause, or risk category.

**defaultOperation:** `compliance_check` → renderer schema **checklist/table**, not memo.

### Global risk taxonomy (`taxonomies/index.ts`)

Mostly commercial: uncapped_liability, one_sided_indemnity, auto_renewal_trap, etc.  
**No GDPR/DSR categories** (missing_portability, no_art12_deadline, art22_gap, generic_dsr_only, …).  
`flag_risk` schema enum = skill categories + `other_known_risk`. Unknown labels get coerced to `other_known_risk`.

### Tools declared but stubbed (`models/analysis-plan.ts`)

`list_documents`, `search_document`, `get_span` (used only in critique), `extract_entities`, `compare_clauses`, `diff_documents`, `map_document_relationships`, `get_applicable_rules`, `get_playbook_rule`, `create_draft_task`, `request_clarification` (deferred to ASK).

Unsupported PLAN operations (`compare`, `explain_qa`, `draft_suggestion`) currently ASK the user to confirm `run_risk_flag` or cancel — so a precise Q&A prompt may be forced into the same risk/compliance graph.

### Multi-doc

`buildActGraph({ docId: documentIds[0] })`. Extra selected files are ignored for ACT.

### Streaming / UI

SSE tokens: progress headings + finding bullets + final table/memo.  
Frontend opens report immediately (like drafting). Overlay only on error.  
Renderer includes **extraction status findings** and **compliance restatements** in the user-visible table.

### Critique completeness bug (observed in the test)

- `classify_document` never emits a Finding.
- `check_expected_clauses` emits **nothing** when the expected clause **is** present (`if (hasClause) continue`).
- Critique: “every scheduled work unit must have at least one Finding.”
- Result: fail on `wu-classify` and often `wu-check-expected` → targeted redo → still silent → **loop until max_turns**.

That produced the repeated:

```
Running document analysis…
Classifying document
Checking expected clauses
```

in the user-visible stream. Wasted turns; stop reason often `max_turns` not `green`.

### check_against_rule ignores the user instruction

Prompt is only: evaluate FIXED rule text against clauses.  
It does not receive “answer Arts 15–22 / timeframes / gaps.”  
So it happily “passes” Art 28(3)(a)(b)(h) while the user asked about Chapter III rights.

### persistAnalysis

Only appends conversation turns. Ledger persist is in the job handler. `draftTasks` handoff to drafting is not implemented.

---

## Golden test case (same inputs given to LORA AND a competitor)

### Document

File: `cisco-master-data-protection-agreement.pdf_draft.docx_draft (1).docx`  
(Cisco Master Data Protection Agreement / DPA — processor DPA, customer is controller “You”, Cisco is processor.)

Known relevant structure from the competitor read (verify against the file):

- **Section 5** — Data Subject requests: promptly redirect to controller or notify; will not respond without prior written consent except to redirect; provide information/cooperation/action as reasonably requested.
- **Section 2.4(d)** — assist as reasonably needed with requests from SAs, data subjects, customers, others.
- **Section 2.4(j)** — assistance on security, DPIA, prior consultation, breach.
- **Section 2.4(k)** — deletion **on termination** of the DPA (not mid-term Art 17).
- Concrete timelines elsewhere: ~48h breach notify; 30-day cure; 30-day / 10-day subprocessor notice — **none** tied to Art 12(3) DSR assistance.
- Subprocessors exist; no Art 19 recipient-notification flow-down.
- Possible AI/analytics in Cisco Offers; no Art 22 language.

Attach / read this same DOCX when proposing the fix. Path on disk:  
`c:\Users\abhinav.yadav_randst\Downloads\cisco-master-data-protection-agreement.pdf_draft.docx_draft (1).docx`

### User prompt (exact)

```
Review how this agreement addresses data subject rights under GDPR Articles 15–22. Identify: obligations to assist the controller with access, erasure, rectification, and portability requests, defined response timeframes, and any gaps that could result in a GDPR violation.
```

This is a **focused legal question**, not “run a full Art 28 audit.”  
Expected product behavior: instruction-scoped review of Chapter III + Art 28(3)(e) + Art 12(3) timing, with section cites and a rights matrix.

---

## LORA actual output (this run)

Streaming / report looked like this (abridged but representative):

```
Loaded documents. Planning analysis…
Running document analysis…
Classifying document
Extracting clauses
[present] other_known_risk: Extracted 38 clauses from document doc_… (skill-scoped).
Evidence: "This Data Protection Agreement (“DPA”), forms part of the Agreement..."

Checking expected clauses
Flagging risks
[present] other_known_risk (medium): Cisco will redirect DSRs / notify controller, but no specific timeframe → delay / GDPR risk.
Evidence: “Data Subject requests. To the extent legally permitted, Cisco will promptly redirect..."

[present] other_known_risk (medium): Cooperation as reasonably requested; does not explicitly name Arts 15–22 or define assistance timeframes.
Evidence: “Cisco will provide such information and cooperation and take such action as You reasonably request..."

Checking compliance rules
[present] other_known_risk (low): processor processes only on documented instructions including transfers.
[present] other_known_risk (low): persons authorised to process have confidentiality obligations.
[present] other_known_risk (low): makes available information to demonstrate compliance and allows audits.

Writing report
GDPR Article 28 DPA Compliance (v1.0.0)
Instruction: <the user prompt>

<table of the same rows: extraction + 2 risks + 3 unrelated compliance passes>

Running document analysis…
Classifying document
Checking expected clauses
Running document analysis…
Classifying document
Checking expected clauses
Running document analysis…
Classifying document
Checking expected clauses
```

**What was actually useful:** the two medium DSR findings (redirect architecture + no named 15–22 + no timeframe).  
**Everything else:** pipeline noise, wrong rules, junk taxonomy, critique-loop spam, a spreadsheet instead of a legal memo.

---

## Competitor output on the SAME doc + SAME prompt (quality bar)

Title: *Data Subject Rights under GDPR Articles 15–22: Review of the Cisco DPA*

1. **What Cisco actually does (architecture):** redirect + cooperate, not fulfil. Cites Section 5, 2.4(d), 2.4(j) with quotes.
2. **Rights matrix:**

| GDPR Right | Article | Addressed? | Gap |
|---|---|---|---|
| Access | 15 | Generically via §5 | No “access”; only generic “Data Subject request” |
| Rectification | 16 | Not named | Subsumed under generic wording |
| Erasure | 17 | Not named | Only end-of-contract deletion in 2.4(k) |
| Restriction | 18 | Not addressed | |
| Notification to recipients | 19 | Not addressed | No obligation to notify recipients / subprocessors |
| Portability | 20 | Not named | No structured/machine-readable export commitment |
| Object | 21 | Not addressed | |
| Automated decisions | 22 | Not addressed | Despite possible AI/analytics Offers |

3. **Timeframes:** only “promptly”; no tie to Art 12(3) one-month (extendable +2). Other clocks (48h breach, 30-day cure, subprocessor notice) exist and highlight the silence on DSR assistance. Controller remains liable under Art 12(3) / 83(5)(b).
4. **Legal hook:** Art 28(3)(e) + EDPB 07/2020 para 121 — generic “DSR” language may meet spirit not letter.
5. **Further gaps:** portability format; Art 22; cost of assistance silent; erasure limited to termination; Art 19 flow-down; consent-gate on Cisco responses can itself blow Art 12(3).
6. **Remedial drafting** (explicit 15–22 list, 5-business-day assistance SLA, portability sub-clause, in-term Art 17, Art 19 flow-down, cost).
7. **Bottom line** for a controller-side lawyer.

This is the bar. LORA must be able to produce this *class* of output (structure + article coverage + section cites + legal consequence + fixes), grounded in locators, not hallucinated.

---

## Problem list (give each a fix; do not ignore)

### A. Instruction does not drive the work
1. User asked Arts 15–22 / timeframes / violation gaps. PAC ran a generic Art 28(a)(b)(h) tour.
2. `buildActGraph` is one-size-fits-all; no “question-shaped” or intent-scoped subgraph.
3. `explain_qa` / focused review is not a first-class ACT path (forced toward risk_flag/compliance_check).
4. `check_against_rule` never sees the user instruction as the question to answer.
5. `flag_risk` is the only step that used the instruction — and even then dumped into `other_known_risk`.

### B. Privacy skill is a stub vs the question (and vs a real DPA review)
6. No `gdpr.art28.3.e` (the matching processor duty).
7. No per-right checks for Arts 15, 16, 17, 18, 19, 20, 21, 22.
8. No Art 12(3) timing rule (“promptly” ≠ one month).
9. No mid-term erasure vs termination-only deletion check.
10. No portability format check (structured, commonly used, machine-readable).
11. No Art 22 / automated decision check.
12. No Art 19 recipient / subprocessor flow-down check.
13. No cost-of-assistance / consent-gate timing risk.
14. clauseTypes too coarse (`data_protection` blob); DSR, transfers, subprocessors, breach not first-class.
15. expectedClauses are “is there a data_protection clause?” — useless for this prompt.
16. riskCategories only `missing_carve_out` + `other_known_risk` → every finding labeled junk.
17. SKILL.md content is not enforced (narrative only, 5k char slice).
18. Only 3 of 8+ Art 28(3) letters implemented; skill title overclaims “Art 28 DPA Compliance.”
19. Prompt library privacy prompts (Art 28 completeness, 72h breach, SCCs, subprocessors) will all hit this same thin graph.

### C. Taxonomy / finding model
20. Global `RISK_TAXONOMY` is commercial; GDPR findings cannot be named without expanding it or allowing skill-scoped categories that critique accepts.
21. `check_against_rule` hardcodes `category: "other_known_risk"` even when `ruleId` is specific.
22. Extraction emits a user-visible Finding (`Extracted 38 clauses…`) that pollutes the report.
23. `render_output` dummy `summary_point` also uses `other_known_risk`.
24. Status `present` on compliance rows that merely restate the rule (“the clause says X”) looks like a finding, not a pass/fail against the user’s question.
25. No article / section / rule mapping fields on Finding for a rights matrix (optional: `ruleId` exists but unused for 15–22).

### D. Renderer / UX
26. Privacy default → **table of internal findings**, not a legal memo.
27. Even with memo schema, narrative is “write from the finding list” — if findings are the wrong list, the memo cannot invent the matrix (and must not hallucinate). Garbage in, garbage out.
28. Pipeline headings streamed to the user (Classifying / Extracting / Checking rules / loop repeats) look like the analysis.
29. No rights matrix, no section-numbered cites, no bottom line, no remedial drafting block.
30. Follow-up starts a new PAC run; no conversation-aware “now expand Art 17 only.”

### E. Critique / loop (correctness + cost)
31. Completeness requires a Finding from every work unit, including classify (never emits) and expected-check (silent on hit).
32. Observed infinite-ish redo: classify + expected-check until max_turns.
33. Critique can be “green” on irrelevant Art 28(a)(b)(h) passes while the user’s question is unanswered (no completeness vs instruction).
34. No critique gate: “did we evaluate each requested article / timeframe?”
35. Entailment only runs on `kind=risk` with evidence; compliance restatements skip it.
36. `criticalFactSurfaced` is hardcoded false — ASK never triggers from critique.

### F. Coverage / product gaps (same module)
37. Only `documentIds[0]` analyzed.
38. Stub tools: compare, search, entities, playbook, draft-task.
39. Three skills only; most prompt-library categories have no pack.
40. Commercial skill has zero regimeRules.
41. Heuristic fallbacks for extract/risk are tiny regexes, not GDPR-aware.
42. `extractionUnitsUsed` increments but classify-loop wastes budget on no-op redos.

### G. Do not “fix” the wrong way
43. Do **not** solve this by one giant unstructured completion that ignores PAC, locators, and skills (that races the competitor on a good day and hallucinates on a bad one).
44. Do **not** only “improve the render prompt” while still feeding it extraction logs + Art 28(a)(b)(h) passes.
45. Do **not** keep `other_known_risk` as the only privacy label.
46. Do keep evidence quotes + locators; competitor quality still needs cites like [Section 5].
47. Prefer: instruction → (intent + skill) → **the right work units / rules** → findings that can populate a matrix → renderer that formats a memo/table from those findings.

---

## What “fixed” looks like on this exact test

After the fix, the same Cisco DPA + same prompt should yield something in this class:

- Identify DSR architecture (redirect vs fulfil) with Section 5 / 2.4(d)(j) quotes.
- Table or equivalent covering Arts 15–22 (addressed / generic / missing) with clause cites.
- Explicit Art 12(3) timing gap vs “promptly”; contrast other numeric SLAs in the DPA.
- Tie to Art 28(3)(e) and controller enforcement risk.
- Call out portability format, Art 22, termination-only erasure, Art 19, cost/consent-gate if in the doc.
- Controller-side remedial points.
- **No** “Extracted 38 clauses” in the report.
- **No** unrelated “staff are confidential / audit rights exist” as the answer.
- **No** repeating classify/expected-check loop in the UI.
- Stop reason `green` (or honest `insufficient_evidence` per right), not `max_turns` from silent work units.

If a finding is absent in the document, status should be `absent_expected` / `insufficient_evidence`, not a hallucinated clause.

---

## Constraints for your proposal

- Keep PAC: PLAN / ACT / CRITIQUE / ASK; TS transitions in `pac/transitions.ts` + `policy.ts`.
- Skills remain authored config + SKILL.md (deterministic registry, conflict-checked).
- Findings stay the source of truth; renderer formats them (memo may polish wording but must not add unaudited rights).
- Streaming to the existing Analyze UI can stay; stop streaming internal loop spam.
- Propose skill versioning if you extend taxonomies.
- Call out tradeoffs: one mega-skill vs question-routed subgraph vs adding an `answer_instruction` / `evaluate_rights_matrix` ACT tool.
- Give an implementation order: (1) stop the critique loop and report pollution, (2) encode 15–22 + 28(3)(e) + 12(3) in the privacy skill, (3) instruction-scoped graph or tool, (4) memo/matrix renderer, (5) broaden remaining Art 28 letters.
- List exact files to change under `backend/src/modules/analysis` and any frontend renderer/filter changes.
- If you recommend new Finding fields or taxonomy IDs, specify them.

---

## Deliverable

1. **Root-cause summary** (short): why this run failed the prompt.
2. **Recommended design** (the best fix, not three equally vague options — pick one and justify).
3. **Skill/taxonomy/graph spec** for privacy DSR + Art 28(3)(e) sufficient to pass the golden test.
4. **Critique policy change** so silent/classify units don’t loop.
5. **Renderer spec** (memo + rights matrix from findings).
6. **File-level implementation plan**.
7. **Optional:** stub/pseudocode for `buildActGraph` branching and new regime rules.

Then, if you have the repo, implement unless the human asked for plan-only.

---

## Key files

```
backend/src/modules/analysis/pac/controller.ts
backend/src/modules/analysis/pac/transitions.ts
backend/src/modules/analysis/pac/policy.ts
backend/src/modules/analysis/capabilities/plan/classify-intent.ts
backend/src/modules/analysis/capabilities/plan/build-plan.ts
backend/src/modules/analysis/capabilities/plan/intent-heuristics.ts
backend/src/modules/analysis/skills/build-act-graph.ts
backend/src/modules/analysis/skills/select-skills.ts
backend/src/modules/analysis/skills/registry.ts
backend/src/modules/analysis/skills/types.ts
backend/src/modules/analysis/skills/privacy-gdpr-dpa/skill.config.ts
backend/src/modules/analysis/skills/privacy-gdpr-dpa/SKILL.md
backend/src/modules/analysis/taxonomies/index.ts
backend/src/modules/analysis/taxonomies/clause-taxonomy.ts
backend/src/modules/analysis/capabilities/act/execute-act-plan.ts
backend/src/modules/analysis/capabilities/act/classify-document.ts
backend/src/modules/analysis/capabilities/act/extract-clauses.ts
backend/src/modules/analysis/capabilities/act/check-expected-clauses.ts
backend/src/modules/analysis/capabilities/act/flag-risk.ts
backend/src/modules/analysis/capabilities/act/check-against-rule.ts
backend/src/modules/analysis/capabilities/act/render-output.ts
backend/src/modules/analysis/capabilities/critique/run-critique.ts
backend/src/modules/analysis/models/finding.ts
backend/src/modules/analysis/models/analysis-plan.ts
backend/src/services/jobs/handlers/analysis-handler.ts
frontend/src/features/analyze/hooks/useAnalysis.ts
frontend/src/features/analyze/api/analysisJobs.ts
```
