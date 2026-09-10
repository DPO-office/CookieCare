# Codex handoff — live eval of CookieCare Analyze

Copy everything below this line into Codex (with the CookieCare repo available). Codex will **not** have this chat’s history. This prompt is the entire brief.

---

## Role

You are a senior legal-tech engineer on CookieCare (LORA / randtrust). Your job is **not** a one-shot demo and **not** unit tests.

You will:

1. Run the **real Analyze UI** against real documents (Mastercard DPA + playbook).
2. Ask a **battery of questions** that cover the product’s full intelligence bar — the kinds of questions a lawyer would actually ask a colleague.
3. After **every** question, write a lab-notebook entry: the exact ask, what the system understood, the **full user-facing answer**, and a structured list of **faults**.
4. After the battery, produce a scorecard against the vision bar so we know what to enhance.

Do **not** treat green fixtures as success. Do **not** skip a run because it is slow. Do **not** invent a question-specific code path. Do **not** “fix” a PLAN/ACT bug by adding synthesis prompt text. Do **not** wait until the end to write notes — **log immediately after each run**, while the backend inspect dump is still on screen.

**Read first (in this order):**

1. `backend/src/modules/analysis/docs-legacy/rebuild/ANALYSIS_FEATURE_VISION.md` — what “smart” means; the question range; output-shape rules; grounding rules; what “done” looks like.
2. `backend/src/modules/analysis/docs-legacy/rebuild/CURSOR CURRENT SYSTEM STAGE AND ALL THE TRY.md` — use cases, success criteria, known ACT failure (`related text ≠ proof`).
3. `backend/src/modules/analysis/docs-legacy/PIPELINE-ISSUES.md` — NDA / non-GDPR collapse modes you must still watch for on a DPA.
4. `backend/src/modules/analysis/docs-legacy/CONTRIBUTING.md` — where new code belongs.

---

## 0. What we are building — how smart this system must be

Quote this into your notebook header. Judge every answer against it, not against “did something render.”

**Mission.** A lawyer uploads a legal document (DPA, NDA, MSA, SLA, or anything else) and asks a question in plain language, the way they would ask a colleague. The system understands what they actually want, investigates the document(s) accordingly, and returns an answer a senior associate would sign off on: correct, evidence-backed, shaped for the question asked. The product is hours given back — first-pass reading and evidence-gathering — not a replacement for judgment.

**The intelligence bar.** General-purpose legal reasoning over documents — like ChatGPT/Gemini are general-purpose, but scoped to law and held to a much higher correctness standard. A wrong answer here is a missed gap or a bad negotiating position.

A user must be able to ask a question the system has **never been explicitly built to handle**, and the system must figure out the investigation that question actually requires — not fail, not fall back to a generic template, and not need an engineer to have anticipated that exact prompt.

**Acceptance standard (non-negotiable):**

> Don’t build support for individual prompts. Build a system that can discover and execute the appropriate investigation for document-analysis questions it has never explicitly seen before. If the only way a new question type works is because someone added code for it, that’s the wrong layer of fix. Reasoning must be general. Only domain knowledge (what GDPR requires, what HIPAA requires) should be question-specific.

**Output must match the question, not a template.**

| Ask type | Correct shape | Wrong shape (current failure mode) |
|----------|---------------|-------------------------------------|
| Narrow factual (“what is the notice period?”) | Short direct answer + cite | Full Executive Summary → Scope → Requirements → Gaps → Recommendations → Conclusion |
| Compliance (“Art 28 review, table”) | Stable checklist / matrix | Generic memo that never tables, or empty article table |
| Open-ended risk (“biggest weaknesses?”) | Narrative risk analysis, ranked | Same compliance skeleton forced onto something that isn’t tabular |
| Negotiation (“what should I negotiate?”) | Action-oriented recommendations | Requirements dump with no negotiation stance |
| Reasoning (“is termination balanced?”) | Compare both sides, then conclude | Retrieve one clause and call it done |
| Follow-up (“focus on subprocessors”) | Continue the thread | Reset to a generic report |

Today, most asks — even open-ended ones — collapse into the same memo skeleton. That is acceptable for a compliance checklist. It is **wrong** for “what should I negotiate” and **wrong** for “who is the controller?”

**Non-negotiable grounding (the hardest unsolved problem):**

- **Relevant is not proof.** Termination language is not duration evidence. Security language is not confidentiality evidence. DSR language is not data-subject *categories*.
- **Evidence must be traceable:** document, section/clause, exact quote, how that quote actually proves the claim.
- **Absence is careful.** “No evidence found” ≠ “this clause is absent.” Don’t call a Gap unless you looked hard enough.
- **Layers stay separate:** Fact → Evidence → Claim → Interpretation → Judgement → Risk → Recommendation → Synthesis → Presentation. A row marked Strong whose rationale says the document doesn’t establish the thing is a failed product.
- **Risk must never silently become compliance truth.**

**What “done” looks like (vision §8):**

A lawyer can upload any legal document, ask any legal question in their own words — specific or vague, narrow or open-ended, one document or several — get back an answer with the **right shape** and **genuinely correct, traceable evidence**, ask a **natural follow-up without losing context**, and **trust the answer enough to act without re-reading the whole document first**. That last part is the actual product.

**Counsel-quality success criteria** (from the rebuild architecture doc):

- Art 28 DPA review (Mastercard/Cisco-style): each table row has **its own** correct status, evidence, and finding.
- No row cites a related-but-wrong clause as proof.
- No Strong/Present status with rationale denying coverage.
- Narrative and table agree on every requirement.
- Memo interprets locked rows — not a matrix dump.
- Missing annexes → Obtain/Confirm, not invent-an-obligation.

We are **not** building: a replacement for counsel; an obligation inventor; a generic RAG chatbot; a per-requirement LLM fan-out; a critique-driven rewrite loop.

Competitors for ambition: Harvey (general-purpose legal AI) and LexLegis/MIRA. We stay **LLM freedom inside a deterministic PAC boundary** — TypeScript owns PLAN/ACT/ASK; the model does not pick the next phase.

---

## 1. Lab notebook — write this after every question (mandatory)

Create this file **before** the first ask (overwrite if you restart a session):

`CookieCare-main/logs/analysis/eval/YYYY-MM-DD-live-eval.md`

(Use today’s date. Create the `eval` folder if needed.)

Also keep a one-line row in a scorecard table at the **top** of that file, updated after every run.

### Scorecard table (top of the file)

```markdown
# Live eval — CookieCare Analyze — YYYY-MM-DD

Documents: <DPA path> | Playbook: <path or none>
Servers: frontend 5173 / backend 3000 | thinkingMode default unless noted
Vision bar: ANALYSIS_FEATURE_VISION.md

| ID | Category | Question (short) | Session | Shape OK? | Grounding OK? | Verdict | Top fault |
|----|----------|------------------|---------|-----------|---------------|---------|-----------|
| Q1 | … | … | an_… | yes/no | yes/no | pass / fail / partial | … |
```

Verdict:

- **pass** — a senior associate would use this as first-pass work without re-reading the whole DPA.
- **partial** — usable with caveats; list them.
- **fail** — wrong shape, wrong evidence, collapsed template, or internally contradictory.

### Per-run template (append one block per question, immediately after the run)

```markdown
---

## Q<n> — <category> — <short title>

- **Asked at:** ISO timestamp
- **Documents:** DPA only / DPA+playbook (PB marked on …)
- **thinkingMode:** lite | deep
- **answerStyle:** narrative | tabular
- **Follow-up of:** none | Q<n> session <id>
- **Job id / session id:**
- **Wall time:**
- **Backend log file:** logs/analysis/an_<uuid>.log (if written)

### Question (verbatim)
<exact text submitted>

### What we wanted (vision)
- Expected **investigation**: …
- Expected **output shape**: short answer | checklist table | risk narrative | negotiation recs | comparison | compound two-block memo
- Expected **not** to do: e.g. full compliance skeleton, invent annexes, mix risk into Art 28 status

### What PLAN understood (paste from `[Analysis PAC] PLAN INSPECT`)
- operation / reportType / depth / scope / outputForm / standard / compound / subIntents
- requirement ids (catalog vs `open.pN` vs `open.siK.pN`)
- `PLAN compound multi-lane` / `PLAN open-analysis lane` / `PLAN catalog/focus` — which fired
- document roles (target vs reference)

### User-facing answer (full)
Paste the complete ReportView markdown. Do not summarize and drop the body.
If huge, paste in full anyway — this file is the eval corpus. If the UI truncated, pull `GET /api/analysis/session/:sessionId` and paste `renderedOutput`.

### Faults
Numbered. Each fault:

1. **Symptom** (what the lawyer sees)
2. **Why it violates the vision** (wrong shape / related≠proof / risk overwrote compliance / lost follow-up / template collapse / absence overclaimed / internal ids leaked / …)
3. **Evidence** (quote the bad sentence or the PLAN line)
4. **Likely layer** (classify | PLAN lane | document roles | extract/VERIFY | aggregation | outline/render | synthesis)
5. **Severity** (blocker / high / medium / low)

If there are no faults, write **None — pass** and still paste the answer (we need the corpus).

### What to enhance (one line)
The smallest general-purpose fix, not a Mastercard special case.
```

Do not skip the “User-facing answer (full)” section. A fault list without the actual memo is useless for enhancement.

---

## 2. Question battery — what Codex must ask

These are the question **types** from vision §3 plus rebuild use cases. Ask them **in this order** on the live UI. Same Mastercard DPA throughout. Attach the playbook **only** where the table says so. Mark playbook with the **PB** chip.

Use **Lite** unless the row says Deep. Narrative unless the row says table.

If time or quota dies, finish **P0** with full logs, then stop and say so. Do not skip logging on a finished P0 run to start P1.

### P0 — must run (this is the product bar on one real DPA)

| ID | Category | Docs | Question to paste verbatim |
|----|----------|------|----------------------------|
| Q1 | Narrow factual | DPA | What is the termination notice period? |
| Q2 | Narrow factual | DPA | Who is the controller and who is the processor? |
| Q3 | High-level / ambiguous | DPA | Is this DPA GDPR compliant? |
| Q4 | Compliance + table | DPA | Perform a rigorous GDPR Article 28 compliance review of this Data Processing Agreement. Verify: subject matter, duration, nature and purpose of processing, categories of data and data subjects, obligations and rights of the controller, and whether all mandatory Article 28(3) clauses are present and adequate. Present findings as a table. |
| Q5 | Open-ended risk | DPA | What are the biggest legal and commercial risks if we onboard this vendor? What should I negotiate? |
| Q6 | Reasoning | DPA | Is termination balanced between the parties, and does the liability cap adequately protect the customer? |
| Q7 | Playbook / multi-doc | DPA + playbook (PB on playbook) | Does this agreement align with our playbook? Flag every playbook position that is missing, weaker, or different, with evidence from both documents. |
| Q8 | Compound (two lanes) | DPA + playbook (PB on playbook) | Check this DPA for GDPR Article 28 compliance — subject matter, duration, nature and purpose, data categories and data subjects, and whether the mandatory Article 28(3) processor obligations are present and adequate. Also check it against our uploaded playbook. Separately, rank the top 5 customer-side onboarding risks (liability, audit, subprocessors, termination, transfers) with evidence from the DPA. |

**Shape checks for P0 (fail the run if these are off, even if prose is fluent):**

- Q1–Q2: a **short direct answer** with a cite. Fail if you get a 6-section compliance memo.
- Q3: the system **infers** a real GDPR investigation (not “please specify articles”). Fail if it asks the user to name the test, or returns a vague essay with no evidence.
- Q4: **checklist/table**, one row per particular, status matches rationale, quotes prove **that** particular (subject matter ≠ DSR clause). Fail if empty article table or Strong+denying rationale.
- Q5: **narrative risk + negotiation actions**, not an Art 28 matrix. Fail if it is the same skeleton as Q4.
- Q6: **both sides compared**, then a conclusion. Fail if it retrieves one termination sentence and stops.
- Q7: per-position **playbook alignment**, not “this is/isn’t GDPR.” Playbook misses are not statutory gaps unless Art 28 independently fails.
- Q8: `compound yes`, two distinct blocks (compliance vs risks), playbook not mixed into Art 28 status cells. Fail if `open.p1` with no `siK` (single-lane collapse).

### P1 — follow-up memory (same chat / session as Q4 if the UI supports it; else Q3)

Run as a **chain**. Each turn is a new lab entry (Q9a, Q9b, Q9c). Fail if each turn resets to a generic full report and ignores what was already established.

| ID | Question |
|----|----------|
| Q9a | Analyze GDPR compliance. |
| Q9b | Focus on subprocessors. |
| Q9c | Can we object to a subprocessor change? |
| Q9d | What should we negotiate on that clause? |

### P2 — more of the vision range (if P0+P1 are logged)

| ID | Category | Docs | Question |
|----|----------|------|----------|
| Q10 | Open-ended | DPA | Find unusual, one-sided, or unfavorable clauses. |
| Q11 | Open-ended | DPA | Find contradictions or inconsistencies in this agreement. |
| Q12 | Compliance | DPA | Review GDPR Articles 15–22 data-subject rights against this DPA. |
| Q13 | Compliance | DPA | Review international transfer compliance (SCCs, supplementary measures, destinations). |
| Q14 | Narrow factual | DPA | What happens to personal data after termination? |
| Q15 | Format follow-up | after Q5 | Show that as a table instead. |

Do **not** pick prompt-library templates. Paste the questions above. The system must discover the investigation from the words.

You may add **one extra question of your own** that is *not* in this list (a question no engineer anticipated) and log it as Qx. That is the vision test: never-seen-before. Keep it a real counsel question, not a trick.

---

## 3. Repo, runtime, documents

Workspace: **`CookieCare-main/`**. Commands from there.

```
CookieCare-main/
  .env
  frontend/          Vite 5173, proxies /api → 3000
  backend/           Express PAC analysis
  logs/analysis/     an_<session>.log evidence traces
  logs/analysis/eval/  ← YOUR notebook lives here
```

**Start (two PowerShell terminals):**

```powershell
npm run dev:backend
npm run dev:frontend
```

Health: `GET http://localhost:3000/api/analysis/health`

Login: `http://localhost:5173/login`  
Seed admin (`backend/scripts/setupDb.ts`): `swarnaaishwarya17@gmail.com` / `MamuSecure2026!`  
Then `/analyze`.

**Env (do not paste secrets).** Confirm `CookieCare-main/.env` has:

```
ANALYSIS_OPEN_PROPOSITIONS=1     # required for open lane + compound
ANALYSIS_OPEN_RISK=1
ANALYSIS_BLUF_REPORT=1
ANALYSIS_SEMANTIC_RETRIEVAL=1
ANALYSIS_LLM_CANDIDATE_SELECT=1
ANALYSIS_DISABLE_VERIFY=0
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

**Documents are not in git.** Search the machine:

```powershell
Get-ChildItem -Path "$env:USERPROFILE\Downloads","$env:USERPROFILE\Desktop","$env:USERPROFILE\Documents" -Recurse -Include *.pdf,*.docx -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match 'mastercard|master.?card|dpa|playbook|negotiation' } |
  Select-Object FullName, Length, LastWriteTime
```

Cisco DPA fallback only if Mastercard is missing:

`C:/Users/abhinav.yadav_randst/Downloads/cisco-master-data-protection-agreement.pdf_draft.docx_draft.docx`

If the playbook PDF is missing, run P0 Q1–Q6 anyway, skip Q7–Q8, and **ask the human for the playbook path**. Do not substitute fixture playbook text.

UI: paperclip / drag-drop (ephemeral upload). Playbook = **PB** on that chip (amber). DPA must not be PB.

Runs take minutes. Do not cancel. If ASK for document roles: DPA = Target, playbook = Playbook.

---

## 4. How a run works (enough architecture to diagnose)

```
/analyze → POST /api/analysis/run
  → analysis_pac job (backend/src/services/jobs/handlers/analysis-handler.ts)
  → PLAN → ACT → (AUDIT if thinkingMode=deep) → DONE
  → SSE into ReportView
```

PAC invariant: TypeScript owns phases. Lite vs Deep is **budget as scope, never as rigor**. UI default Lite skips supporting-priority VERIFY and skips AUDIT. Intent `depth` only shapes sections.

**Two PLAN lanes** (`ANALYSIS_OPEN_PROPOSITIONS=1`):

| Lane | When | Mechanism |
|------|------|-----------|
| Catalog | `standard` starts with `regime_pack:` | authored GDPR/DPA packages |
| Open | no regime, or `risk_flag` / `explain_qa` / `compare` | inventory → propositions → same VERIFY spine |

**Compound:** `compound=true` + ≥2 `subIntents` → merge both lanes, tag `subIntentId` (`si0`, `si1`), compose one report block per sub-ask. Heuristic classify **always** sets `compound=false` — compound is **LLM-only**. If inspect shows `compound no`, Q8 cannot pass.

Playbook: explicit `documentRoles`. Open lane S3 propositions on the reference; do not also run duplicate Tier P checks (`openLaneHandledReference`). Target+playbook is alignment, not peer comparison.

**Key files:** `capabilities/plan/build-plan.ts`, `build-open-plan.ts`, `classify-intent.ts`, `prompts/classify-intent.ts`, `derive-report-outline.ts`, `resolve-document-roles.ts`, `plan-inspect-log.ts`, `skills/runtime/graph/build-act-graph.ts`, `capabilities/act/evaluate-package.ts`, `capabilities/act/evidence-pool-log.ts`, `capabilities/reporting/{render-output,synthesize-report,finalize-report-spec}.ts`, `prompts/synthesis.ts`, `models/intent.ts`, `frontend/src/features/analyze/*`.

Deterministic sanity only (optional, 2 min):  
`node --import ./node_modules/tsx/dist/loader.mjs --test src/modules/analysis/capabilities/plan/__fixtures__/compound-composition.test.ts`  
from `backend/`. Not a substitute for the battery.

---

## 5. Fault catalog — name problems in the notebook this way

Watch backend `[Analysis PAC]` and `logs/analysis/an_*.log`.

| Signal | Typical fault to log |
|--------|----------------------|
| Full 6-section memo on Q1/Q2 | **Template collapse** — output ignored question shape |
| `compound no` on Q8 | **Classifier miss** — multi-lane never ran |
| `open.p1` not `open.si1.p1` on Q8 | **Single-lane fallback** |
| Subject matter row quotes DSR/security | **Related ≠ proof** (the #1 ACT bug on Mastercard/Cisco DPAs) |
| Status Present + “does not set out…” | **Layer collapse** (judgement vs rationale) |
| Q5 looks like Q4 | **Wrong archetype** — risk ask got compliance skeleton |
| Q7 verdicts written as Art 28 unlawfulness | **Risk/playbook overwrote compliance** |
| Q9b–d restarts a full memo | **No conversational memory** |
| Empty article table / “no package” / “not applicable” | **Pipeline dead-end** (PIPELINE-ISSUES.md) |
| Internal ids `wu-…`, `open.si1.p3` in the memo | **Leak** |
| Many `insufficient_evidence` | **Pool/VERIFY miss** — read session `.log` before blaming the writer |
| Invented annex obligations | **Obligation inventor** (forbidden) |

**Blame the correct layer:**

| Symptom | Layer | Files |
|---------|-------|-------|
| Wrong shape / mashed compound | classify / outline | `classify-intent`, `derive-report-outline`, `build-plan` |
| Wrong quote, right row | VERIFY / retrieval | `evaluate-package`, evidence-pool log — **not** synthesis |
| Pretty prose, wrong law | do not patch writer | PLAN/ACT grounding |
| Playbook as second DPA | roles / sectionOperation | `resolve-document-roles.ts`, `build-plan.ts` |

Fixing: after the battery (or after P0 if you must patch a blocker), smallest **general-purpose** change at that layer. Re-run **the same question** and append Qn-retest. Do not commit unless asked.

---

## 6. Constraints

- Live UI + real PDFs. Fixtures are not the mission.
- Log **every** run with **full** answer text in `logs/analysis/eval/…`.
- Do not hardcode Mastercard, “and”, or this prompt list into the engine.
- Do not add critique/retry loops as a substitute for a correct model of the ask.
- Windows / PowerShell; paths may include `Program Files\CookieCare`.
- Do not print `.env` secrets into the notebook.

---

## 7. Deliverable

1. The eval file `logs/analysis/eval/YYYY-MM-DD-live-eval.md` with scorecard + one full block per question.
2. In chat: path to that file, which P0/P1/P2 IDs ran, which PDFs, which sessions.
3. The **top 5 enhancement targets** ranked by how much they move the vision bar (shape, grounding, compound, follow-up, playbook contamination) — not a laundry list of typos.
4. Code changes only if a fault is clearly at a known layer and the fix is general-purpose; retest that question into the same notebook.

Start: find the PDFs, confirm servers, create the eval file with an empty scorecard, then Q1.
