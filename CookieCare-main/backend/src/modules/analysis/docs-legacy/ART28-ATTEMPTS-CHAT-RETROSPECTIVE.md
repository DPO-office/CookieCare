# Article 28 / ACT quality — what we tried in this chat (retrospective)

**Date range:** 2026-08-27  
**Scope:** Mastercard / Cisco-style GDPR Article 28 DPA review on the existing PLAN → ACT path  
**User constraint (throughout):** No PAC rewrite, no Mastra, no per-requirement LLM fan-out, no extra agents, no RAG  
**Product constraint (called out late):** System must stay **general-purpose** (any clause / any compliance ask) — not a hardcoded GDPR-only engine  

**Honest bottom line:**  
Several **pipeline/mechanics** issues improved in logs and unit tests. The **counsel-facing quality problem is not fixed**. Wrong clause cited as proof, Strong + denying rationale, and shallow report synthesis still fail the real DPA review use case. One later attempt (proposition hardcoding) made things worse and was **reverted**.

---

## 1. Original problem statement (user)

PLAN was mostly fine (maps mandatory Art 28 clauses). ACT was the failure zone:

1. **Evidence selection broken** — shared extract pool collapsed / wrong extracts assigned (e.g. duration got Nigeria / SCC stubs; subject matter got DSR).
2. **Wrong conclusions on wrong text** — status looked “green” while cites did not prove the ask.
3. **Identity / aggregation orphans** — package findings produced but assessments ended with `0 supporting findings`.
4. **Risk contaminating compliance** — planner auto-selected many risk categories; `flag_risk` findings with `req=(none)` polluted the compliance path.
5. Later: **report quality** — right-looking status + wrong evidence; self-contradictory claims; repeated matrix dumps instead of synthesis.

User diagnosis that still stands:

> **Related GDPR text ≠ text that proves the exact proposition.**

---

## 2. Hard constraints we agreed not to break

| Allowed | Not allowed |
|--------|-------------|
| Fix ACT evidence packets, identity, risk/compliance split, render consolidation | Rewrite PAC |
| Skill-authored hints / hypotheses | Mastra / new agents |
| Grouped `evaluate_package` | Per-requirement LLM fan-out |
| Deterministic scoring / guards | RAG rebuild |
| Keep system usable beyond GDPR | Bake Art 28 clause lists into generic ACT forever |

---

## 3. Attempt timeline (what we tried)

### Attempt A — Requirement-scoped evidence packets (P0 #1)

**Goal:** Stop one shared shortlist destroying useful extracts; give each requirement a classified packet.

**What we changed (high level):**
- Full-extract ranked pool → `resolveEvidence()` / `EvidencePacket` (`supporting` / `contextual` / `insufficient`)
- Partitioned grouped eval cites from packets
- Hint/token scoring in `isolate-requirement-evidence.ts`
- Duration / confidentiality / deletion focus heuristics (still somewhat regime-shaped)
- Related: `extract-shared-evidence.ts`, `evaluate-package.ts`, prompts

**What improved:**
- Logs less “93 → 10 garbage types only” in some runs
- Unit fixtures for packet roles

**What did *not* fix:**
- Subject matter / controller / nature & purpose still often cite **related** clauses (DSR, security, jurisdiction) instead of **proving** clauses
- Duration still treatable as “strong” off termination/deletion-adjacent language
- Counsel review still rejected pairings

---

### Attempt B — Canonical identity / no orphan rows (P0 #2)

**Goal:** One PLAN-shaped assessment identity; natives as aliases; package compliance as authority; no duplicate orphan rows.

**What we changed (high level):**
- `requirement-identity.ts` aliases / canonicalization
- Aggregation / matching so package findings attach to PLAN rows
- Package graph / aggregation fixtures

**What improved:**
- Later logs: assessments **linked** (not all `0 findings`)
- Identity plumbing healthier in inspection logs

**What did *not* fix:**
- Attached findings can still be the **wrong** evidence
- Status can look Strong/Conditional while the claim or cite is wrong
- “Linked ≠ correct”

---

### Attempt C — Compliance / risk split (P0 #3)

**Goal:** Empty `focus.riskCategoryIds` unless risk explicitly requested; Art 28.1/2/10 as package context; no leftover `flag_risk` on package compliance path; graph order aggregate → derive_risk → render.

**What we changed (high level):**
- Focus extraction / resolve-packages / `build-act-graph.ts`
- Stop risk flooding unrelated requirements

**What improved:**
- Risk-flooding largely gone in later logs
- Leftover rules/risk units cleaner (0 leftover in one Mastercard run)

**What did *not* fix:**
- Core particulars quality (wrong cite / wrong proof)
- Report depth / synthesis

---

### Attempt D — Finding consolidation + umbrella linkage

**Goal:** Stop render consolidation discarding `present` findings when paired with `absent_expected` for the same requirement (which made `groundFindings` downgrade locked assessments to `cannot_determine`). Also fix umbrella ID spelling variants.

**What we changed:**
1. **`render-output.ts` — `consolidationKey` includes `finding.status`**  
   So present + gap for same req are not collapsed to gap-only.
2. **`requirement-identity.ts` — `getUmbrellaMembers(id)`**  
   Exact map + pattern fallbacks (categories / mandatory Art 28).
3. Unit tests in `render-output-upgrade.test.ts` and `requirement-identity.test.ts`.

**What improved:**
- Mechanical downgrade path (present wiped → cannot_determine) addressed in tests
- Umbrella spelling variants less brittle

**What did *not* fix:**
- Wrong-evidence Strong rows
- Self-contradictory rationales (“does not set out…” + Strong)
- User-case counsel quality

**Status:** **Kept** as the last “mechanics checkpoint” after later revert.

---

### Attempt E — Claim / proposition-level evidence grounding (approved, then reverted)

**Goal:** Treat only text that proves the proposition as supporting; demote related noise; block Strong + denying rationale.

**What we tried:**
1. Hardcoded FocusKinds / proof regexes in **generic** `isolate-requirement-evidence.ts` for:
   - `subject_matter`, `nature_purpose`, `controller`, `categories`, stricter `duration`
2. Demote DSR / security / Argentina–Brazil–Nigeria–SCC stubs
3. Expand `rationaleDeniesCoverage` for “do not set out / specify…”
4. New fixtures for wrong-clause demotion + contradiction guard

**Why it was rejected / reverted:**
- Hardcoded **GDPR Art 28** logic inside shared ACT — breaks **general-use** architecture (NDA, AI Act, ad-hoc clause review, etc.)
- User: system got **even worse**
- Explicitly asked to **revert** all of that hardcoding back to the consolidation + umbrella checkpoint

**Status:** **Fully reverted** (code + those tests). Contradiction expansion reverted. Consolidation + umbrella kept.

---

### Attempt F — Process failures (not product fixes)

These wasted time and did not fix the product:

- Endless re-reads / plan-file loops instead of implementing
- Optimizing for “all unit tests pass” while user-case stayed bad
- Treating pipeline log health as “everything is fine” when counsel review of the DPA was not

---

## 4. Scorecard vs original / mid-chat diagnoses

| Theme | Tried? | Still broken for user-case? |
|------|--------|------------------------------|
| Raw extract finds relevant material | Mostly working already | Not the main bug |
| Shared evidence / wrong shortlist | Yes (packets) | Partially — wrong *proof* remains |
| Duration gets bad / related evidence | Yes (heuristics + later hardcode→reverted) | **Yes** |
| Subject matter cites DSR etc. | Yes (hardcode→reverted) | **Yes** |
| Orphan assessments / 0 findings | Yes (identity + consolidation) | Mostly improved in logs; quality still wrong |
| Risk contaminating compliance | Yes (focus/graph split) | Largely improved in logs |
| Present wiped by consolidate → cannot_determine | Yes (`status` in key) | Mechanics fixed; quality not |
| Umbrella ID variants | Yes (`getUmbrellaMembers`) | Mechanics improved |
| Strong + “does not set out/specify” | Tried then reverted | **Yes** (guard reverted) |
| Report repeats matrix / thin synthesis | Discussed, little done | **Yes** |
| General-purpose (not GDPR-only ACT) | Called out; hardcode reverted | Must remain a hard rule |

---

## 5. What is still true about the real bug

1. **Related ≠ proof** — scoring by keyword overlap / clause-type affinity is not enough for counsel.
2. **Unit tests ≠ user case** — green fixtures can coexist with a bad Mastercard report.
3. **Identity/linkage ≠ correctness** — attaching findings to the right row does not mean the cite proves the row.
4. **Hardcoding Art 28 into ACT is the wrong layer** — proof/noise belongs in **skill profiles** (or a generic `proofSignals` / `noiseSignals` schema), not shared ACT.
5. **Contradiction between status and rationale** must be impossible — but the expanded guard was tied to a bad hardcode path and was reverted with it; a **general** contradiction guard may still be worth re-adding carefully.

---

## 6. Files touched in this arc (orientation)

**Mechanics still intended to keep (checkpoint):**
- `capabilities/reporting/render-output.ts` — `consolidationKey` + `finding.status`
- `shared/requirement-identity.ts` — `getUmbrellaMembers` and callers
- Related tests under `skills/__fixtures__/render-output-upgrade.test.ts`, `shared/__fixtures__/requirement-identity.test.ts`

**P0 evidence / identity / risk work (still in tree; quality incomplete):**
- `capabilities/act/isolate-requirement-evidence.ts`
- `capabilities/act/extract-shared-evidence.ts`
- `capabilities/act/evaluate-package.ts`
- `prompts/evaluate-package.ts`
- `capabilities/act/aggregate-requirements.ts` / `grouped-results-to-findings.ts` / `requirement-status-policy.ts`
- `skills/runtime/focus/extract-instruction-focus.ts`, `build-act-graph.ts`, `resolve-packages.ts`
- GDPR `skill.config.ts` hypotheses / `evidenceHints`
- Many `__fixtures__` under `capabilities/act/`

**Reverted (do not reintroduce into generic ACT):**
- Art 28 particulars FocusKinds / DSR–security–jurisdiction hard demotion inside `isolate-requirement-evidence.ts`
- Expanded “set out / specify” denial regexes (unless redesigned as general + skill-safe)
- Proposition-level fixtures that only tested that hardcoding

---

## 7. Directions that were agreed but not successfully shipped

1. **Proposition-level grounding without GDPR hardcodes in ACT**  
   - Skill-authored `hypothesis` + `evidenceHints` already exist  
   - Next shape: skill (or profile) fields like `proofSignals` / `noiseSignals` / `relatedButNotProof` consumed by a **dumb** ACT classifier  
2. **General contradiction guard**  
   - If rationale denies coverage → cannot stay Present/Strong  
   - Must not depend on Art 28 ID lists  
3. **Report synthesis**  
   - Less duplicate matrix dump across sections; more counsel-facing synthesis (outline / render) — barely touched  
4. **Evaluate success on the real DPA**, not only unit tests  

---

## 8. Checkpoint we reverted *to*

After user rejection of hardcoding, code was rolled back to the stage summarized as:

1. Finding consolidation fix (`consolidationKey` includes status)  
2. Dynamic umbrella resolution (`getUmbrellaMembers`)  
3. Their unit tests  

Everything **after** that (Art 28 proposition hardcodes + expanded denial guard + those tests) was removed.

---

## 9. One-line summary for the next session

> We fixed several ACT **plumbing** bugs (packets, identity orphans, risk split, consolidation wipe, umbrella IDs). We have **not** fixed counsel-quality evidence grounding. Hardcoding Art 28 proof rules into shared ACT was tried, made things worse, and was reverted. Next fix must be **skill-scoped / general**, proven on the real Mastercard (or equivalent) DPA, not only on unit tests.

---

## 10. Chat pointer index (for humans)

| When (approx) | User ask | Outcome |
|---------------|----------|---------|
| Morning | Diagnose ACT failure from logs | Core issues listed |
| Midday | Implement requirement-scoped evidence packets | Shipped; partial |
| Afternoon | Identity orphans + risk contamination | P0 plan; partial in logs |
| Afternoon | Frustration — still broken | Consolidation + umbrella plan |
| Evening | Consolidation + umbrella implement | Shipped; tests green |
| Evening | Logs look healthier | Plumbing OK; quality unknown |
| Evening | Counsel review vs real Mastercard DPA | Quality rejected |
| Evening | Approve proposition grounding | Implemented with GDPR hardcodes |
| Evening | “What are you doing / system worse / general use” | Hardcodes reverted to checkpoint |
| Now | Document all attempts | This file |
