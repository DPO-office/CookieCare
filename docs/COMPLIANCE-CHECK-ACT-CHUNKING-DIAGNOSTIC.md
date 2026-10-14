# Compliance-check pipeline diagnostic — ACT, chunking, skills, prompts, live Bitrix failure map

**Purpose.** Forensic baseline for refining the GDPR / Article 28 **compliance_check** path.  
**Audience.** Engineers diagnosing why LORA’s Art 28 matrix diverges from a counsel-grade / competitor memo.  
**Scope.** Upload → plaintext → segmentation → PLAN packages → ACT investigate → VERIFY → aggregate → BLUF render.  
**Not in scope.** Risk lane, playbook compare, draft_suggestion, open Q&A (except where they collide with compliance).

**Primary live session referenced throughout**

| Field | Value |
|--------|--------|
| Date | 2026-09-05 |
| Document | `DPA - 1.docx` (Alaio / Bitrix24) |
| Competitor memo | `Downloads/chat_message (2).md` |
| Session | `an_d8021da4-5d61-4837-b7db-15dc0296775e` |
| Job | `ddda0f9f-7b4f-44e8-94a3-b2e17c887133` |
| Backend log | `logs/analysis/an_d8021da4-5d61-4837-b7db-15dc0296775e.log` |
| UI capture | `logs/analysis/eval/2026-09-05-art28-bitrix-ui-report.txt` |
| Eval notebook | `logs/analysis/eval/2026-09-05-live-art28-bitrix.md` |
| Server | `npm run dev` → `http://localhost:3000` |

**One-line verdict from that run.** VERIFY residual-limitation on Art 28(3)(g) **worked**. Most other matrix rows were still factually wrong vs the competitor and vs the DPA text, mainly because Appendix 1 / Term definition never reached VERIFY as usable evidence, complementary `proves` were not merged, and open propositions duplicated catalog rows.

---

## Table of contents

1. [End-to-end call chain](#1-end-to-end-call-chain)
2. [Upload and plaintext extraction](#2-upload-and-plaintext-extraction)
3. [Chunking / segmentation — how “clauses” are born](#3-chunking--segmentation--how-clauses-are-born)
4. [How we “grab” clauses for investigation](#4-how-we-grab-clauses-for-investigation)
5. [GDPR skill — packages, rules, requirementEvidence](#5-gdpr-skill--packages-rules-requirementevidence)
6. [ACT compliance hot path (investigate)](#6-act-compliance-hot-path-investigate)
7. [LLM prompts — select / evaluate / inventory](#7-llm-prompts--select--evaluate--inventory)
8. [VERIFY — prompts, schema, winner selection](#8-verify--prompts-schema-winner-selection)
9. [Aggregation and status](#9-aggregation-and-status)
10. [Rendering (BLUF)](#10-rendering-bluf)
11. [Live Bitrix test — row-by-row what went wrong and why](#11-live-bitrix-test--row-by-row-what-went-wrong-and-why)
12. [Refinement backlog (ordered by impact)](#12-refinement-backlog-ordered-by-impact)
13. [Appendix — full VERIFY system + candidates prompts](#13-appendix--full-verify-system--candidates-prompts)
14. [Appendix — full Art 28 skill requirementEvidence](#14-appendix--full-art-28-skill-requirementevidence-verbatim)
15. [Caps and env flags cheat sheet](#15-caps-and-env-flags-cheat-sheet)

---

## 1. End-to-end call chain

```text
UI Analyze
  → POST /api/documents/upload (ephemeral)     controllers/documents.ts
  → file_processing job                        services/jobQueue.ts
      → extractText (mammoth HTML→text)        utils/extractText.ts
      → files.content = encrypted plaintext

UI Analyze submit
  → POST /api/analysis/run                     modules/analysis/api/controller.ts
  → analysis_pac job                           analysis-handler / pac runner
      → load files.content → documentTexts
      → CLASSIFY intent (operation=compliance_check)
      → PLAN: select GDPR skill + packages
          gdpr.art28.particulars
          gdpr.art28.3.mandatory_clauses
      → ACT graph:
          ensureSegmented (segmentDocument)
          extractClauses / locateEvidence
          extractSharedEvidence → SharedEvidenceItem[]
          evaluatePackage / evaluateWithVerify   ← COMPLIANCE HOT PATH
          aggregateRequirements
          renderOutput → buildBlufReport
```

**Critical design fact:** Analysis PAC does **not** search RAG chunks for Art 28. RAG may still run on upload, but evaluate/VERIFY read **in-process segments + shared evidence** derived from `files.content`.

For `operation === "compliance_check"`:

- Candidate source = **document sections** (`buildSectionCandidates`), filtered by `evidenceScope` (controller_to_processor).
- Retrieval = **hybrid dense + lexical** over those sections (`retrieveCandidates`), **not** the LLM select-candidates path (that path is **disabled** when `complianceReport` is true — see `evaluate-package.ts` ~L845–846).
- Judgment = **`verifyPropositionCandidates`** (one bounded LLM call per requirement, N candidates in one prompt).

---

## 2. Upload and plaintext extraction

### 2.1 API

| Piece | Location |
|--------|----------|
| Route | `backend/src/routes/documents.ts` — `POST /upload`, multer memory, **25MB** |
| Controller | `backend/src/controllers/documents.ts` → `uploadDocument` |
| Frontend | `frontend/.../useUpload.ts` — Analyze uses `ephemeral=true` |

Flow:

1. MIME + magic-byte check.
2. Insert `files` row with empty `content`, store original bytes.
3. Ephemeral → `type = "ephemeral_upload"`, no vault folder.
4. Enqueue `file_processing`.

### 2.2 DOCX → text

`backend/src/utils/extractText.ts`:

- DOCX uses **`mammoth.convertToHtml`**, then `htmlToStructuredText`.
- `</p|li|h1–6|tr>` → newlines; tags stripped.
- **`</td>` is not a separator** — table cells in one row concatenate into a single line.

**Why this matters for Bitrix Appendix 1.** Schedule grids often become:

```text
PROCESSING SUBJECT MATTER Data Subjects. The personal data transferred concern the following categories of data subjects.
```

…with the real bullet list on later lines or split oddly. That single concatenated line is exactly what showed up as VERIFY candidate `S42` in the live log — a **heading/label blob without the list body**.

### 2.3 What analysis loads at runtime

`analysis-handler` decrypts `files.content` into `request.documentTexts[docId]` / workspace `fullText`.  
Segmentation and clause extraction run **at analysis time**, not at upload.

---

## 3. Chunking / segmentation — how “clauses” are born

**File:** `backend/src/modules/analysis/segmentation/segment-document.ts`  
**Function:** `segmentDocument(docId, fullText)`

Line-oriented over full plaintext:

| Kind | Rule | `structuralPath` |
|------|------|------------------|
| `clause` | `NUMBERED_CLAUSE_RE` — `1.`, `1)`, `3.6`, `3.6.1` | `clause-{number}` e.g. `clause-2.5` |
| `heading` | `HEADING_RE` **and** `length < 120` — `#` markdown, **ALL-CAPS ≥9 chars**, `Article N`, `N. Title` | `heading-{slug}` |
| `paragraph` | else | `{heading}.para-{n}` |

Also:

- **`INLINE_CLAUSE_RE`** — split mid-line collapsed compound numbers (`8.1. …`) when DOCX lost breaks.
- **`mergeAdjacentParagraphs`** — merge consecutive paragraphs under the same path.

**`schedule` kind** exists on the type but the segmenter **never emits** it. Appendices are headings + paragraphs/clauses, not first-class schedule objects.

### 3.1 Logical sections for retrieval

`groupDocumentSections` / `buildSectionCandidates` in `locate-evidence.ts` / `select-candidates.ts`:

- Flush on each `heading` or `clause`.
- Body = following paragraphs until next start.
- Caps (section path):

| Cap | Typical value | Effect |
|-----|----------------|--------|
| `SECTION_MIN_CHARS` | 40 | Tiny headings dropped from section pool |
| `SECTION_MAX_CHARS` | 1500 | Body truncated (`truncated: true`) |
| `MAX_SECTIONS` | 260 | Tail of long annexes dropped |
| `TOTAL_CHAR_BUDGET` | 150_000 | Same |

### 3.2 Expansion of numbered siblings

`expandLogicalSection` / `expandSharedEvidenceItem`:

- Numbered parent `1.1` can pull children `1.1.1`, `1.1.2` (up to `MAX_MERGED_SIBLINGS ≈ 24`).
- Then clipped by **`profileEvidenceCharBudget`**: **lite ~2 000 / deep ~8 000** chars (harder than absolute 12k/24k caps).
- **Unnumbered appendix labels do not merge** into a rich section the way `clause-2.5` children do.

### 3.3 Why Appendix 1 and Term definitions die here (live log facts)

From `an_d8021da4-…log` whole-log scans:

| Needle | Count in log | Meaning |
|--------|--------------|---------|
| `Staff including` | 6 | Data-subject bullets exist somewhere in indexed text |
| `Personal details` | **0** | Category list from Appendix 1 **never entered** usable pool |
| `Collecting, recording` | **0** | Nature list from Appendix 1 **never entered** usable pool |
| `Term means` / `“Term” means` | **0** | Duration definition **never indexed** as searchable evidence |

VERIFY candidate `S42` text was only:

```text
PROCESSING SUBJECT MATTER Data Subjects. The personal data transferred concern the following categories of data subjects.
```

No bullet list. VERIFY correctly said related_not_proof / heading-only. Downstream stamped **dependency on Appendix 1** even though Appendix 1 was **inside the same uploaded DOCX**.

**Root class:** segmentation + DOCX table flattening + section caps + short-text scoring penalty (`text.length < 50 → −40` on particulars targets in `scoreClauseForPackage`), **not** VERIFY being unable to read lists.

---

## 4. How we “grab” clauses for investigation

There are **three** layered mechanisms. Compliance uses (A)+(C) heavily; (B) is off for compliance_check.

### 4.1 (A) Dictionary / clause-type locate (shared evidence pool)

**Files:** `extract-clauses.ts`, `locate-evidence.ts`, `extract-shared-evidence.ts`

- Skill authors `clauseRetrieval` dictionaries (headings, aliases, anchors) per clause type (`processor_terms`, `retention_and_deletion`, …).
- `locateEvidence` scores segments; heading-only hits get `heading_only=true`.
- Package `extractionTargets` bias scoring for particulars (subject matter, duration, …).
- Pool capped (`MAX_ITEMS_PER_PACKAGE` ≈ 200, `MAX_CANDIDATES_PER_TYPE` ≈ 8).

### 4.2 (B) LLM candidate select (NON-compliance by default)

**Prompt file:** `prompts/select-candidates.ts`  
**Runner:** `capabilities/act/select-candidates.ts`

Enabled when `ANALYSIS_LLM_CANDIDATE_SELECT !== "0"` **and** `!complianceReport`.  
Compliance explicitly skips this (see §6) and uses hybrid retrieval instead.

### 4.3 (C) Hybrid retrieve per requirement (COMPLIANCE hot path)

**File:** `capabilities/act/retrieve-candidates.ts` — topic-agnostic RRF fuse of:

1. **Dense arm** — embed `complianceRetrievalQuery(hypothesis, evidenceHints)` (NOT the full proofStandard — traps in the proof standard used to pull the wrong passages).
2. **Lexical arm** — `scoreEvidenceItem` / isolate hints.

```ts
// evaluate-package.ts
export function complianceRetrievalQuery(hypothesis, profile) {
  return [hypothesis, ...(profile?.evidenceHints ?? [])]
    .map(...).join(". ");
}
```

Then top-`cap` sections go to VERIFY (`COMPLIANCE_VERIFY_CANDIDATE_CAP`, profile verify candidate cap — typically small, ~8).

**Evidence scope filter:** `filterCandidatesByEvidenceScope` drops controller-to-controller sections when the package declares `relationshipScopes: ["controller_to_processor"]`.

---

## 5. GDPR skill — packages, rules, requirementEvidence

**Skill root:** `backend/src/modules/analysis/skills/regimes/data-protection/gdpr/`

| Artifact | Role |
|----------|------|
| `SKILL.md` | Human/legal analysis guidance for the skill (roles, covered/partial/missing, article notes) |
| `skill.config.ts` | Machine packages, rules, clauseRetrieval, finding categories, **requirementEvidence** |

### 5.1 Regime rules (Art 28 family)

Authored rules include (non-exhaustive):

- `gdpr.art28.1` … `gdpr.art28.10`
- Chapeau + (a)–(h) + (4) as separate capability ids
- Example chapeau text for (g): *At the controller's choice, the processor must delete or return…*
- Example (h) title: *Compliance evidence, audits, and unlawful-instruction warning*

### 5.2 Evidence packages used by compliance Art 28 review

#### Package `gdpr.art28.particulars`

**requirementIds**

- `subject_matter`
- `duration`
- `nature_purpose`
- `data_categories`
- `data_subject_categories`
- `controller_obligations_rights`

**clauseTypes:** `processor_terms`, `data_protection`, `termination`, `definitions`, `records_of_processing`  
**evidenceScope:** `controller_to_processor`  
**extractionTargets:** subject_matter, duration, nature, purpose, personal_data_categories, data_subject_categories, controller_obligations_rights

Each id has `{ hypothesis, evidenceHints[], proofStandard }` — full text in [§14](#14-appendix--full-art-28-package-proof-standards).

#### Package `gdpr.art28.3.mandatory_clauses`

**requirementIds**

- `art28_3_a_instructions` … `art28_3_h_audit`
- `art28_4_subprocessor_flow_down`

**capabilityIds:** `gdpr.art28.3.a` … `gdpr.art28.4`  
**extractionTargets:** instructions_only_processing, confidentiality, security_measures, subprocessor_flow_down, dsr_assistance, breach_security_assistance, return_or_deletion, audit_rights

### 5.3 How PLAN binds skill → ACT

Classify intent → `operation=compliance_check`, focus Art 28 → select GDPR skill → resolve packages → ACT work units per package with `requirementEvidence` profiles loaded onto state.  
Open propositions from a long user prompt can **also** create `open.pN` requirements — this is how the Bitrix run got **duplicate (g)/(e)/flow-down rows**.

---

## 6. ACT compliance hot path (investigate)

**Primary file:** `capabilities/act/evaluate-package.ts` → `evaluateWithVerify`

### 6.1 Branching

```text
if compliance_check:
  pool = buildSectionCandidates(doc) filtered by evidenceScope
  build semantic index over sections (if ANALYSIS_SEMANTIC_RETRIEVAL=1)
  llmSelectEnabled = false   // IMPORTANT
else:
  optionally LLM selectCandidates over sections
  else hybrid/lexical over extracted items
```

### 6.2 Per-requirement loop

For each `requirementId` with a non-empty `proofStandard`:

1. Build `hypothesis` from profile (or fallback).
2. Build retrieval query = hypothesis + evidenceHints.
3. `retrieveCandidates` → up to verify candidate cap.
4. Optionally expand truncated/heading-only items.
5. Call **`verifyPropositionCandidates({ hypothesis, proofStandard, candidates })`**.
6. Interpret outcomes:
   - mixed proves+contradicts → scope/conflict finding
   - first `proves` or `contradicts` (quoteVerified) → `buildVerifiedFinding`
   - else `related_not_proof` + `partialCoverage` → `buildPartialVerifyFinding`
   - else closest with dependency / gap → `buildInsufficientVerifyFinding`
7. Push Finding(s).

### 6.3 What VERIFY is *not* allowed to do

VERIFY is entailment against the **authored proof standard only**. It is instructed **not** to be a free-form compliance reviewer. Adequacy labels (Strong / Partial / Gap) are stamped later from axes.

### 6.4 Known structural gaps in this stage (pre-Bitrix and confirmed by Bitrix)

1. **Single winner.** If two candidates each `proves` a complementary half (cl. 6.4 = Art 32–34, cl. 10 = Art 35–36), only the first ranked `proves` wins. The model can literally say “combine with clause 10” and we still emit Partial.
2. **Same-document annex treated as external.** Proof standards say a bare pointer is a dependency unless the target’s contents are confirmed. If Appendix 1 text never enters the candidate passages, VERIFY *correctly* emits dependency — but the product outcome is wrong because we failed to supply the appendix body.
3. **`proves` + `coverage=partial` always downgrades status** via `buildVerifiedFinding` → `compliance: "partial"`. Good for (g) deletion-only; too harsh for (d) “if GDPR applies” on a GDPR-scoped review.

---

## 7. LLM prompts — select / evaluate / inventory / bottom line

> **Compliance investigate ≠ SELECT.** For `compliance_check`, the investigate stage is **hybrid retrieve** (`complianceRetrievalQuery` = hypothesis + `evidenceHints`) then **VERIFY candidates**. `SELECT_CANDIDATES` and `EVALUATE_PACKAGE` stay in-tree for other ops / legacy; they are **not** what Bitrix Art 28 ran for row judgments.

### 7.1 SELECT_CANDIDATES (investigate for non-compliance; **forced off** for compliance_check)

**File:** `prompts/select-candidates.ts`  
**Gate:** `ANALYSIS_LLM_CANDIDATE_SELECT !== "0"` **and** `!complianceReport` (`evaluate-package.ts`).

**System prompt (verbatim):**

```text
You are an evidence-selection engine for a contract-analysis pipeline. You
are given a numbered list of clauses extracted from ONE document, and a set
of requirements — each with a hypothesis and a proof standard describing what
would prove it.

Your ONLY job is selection, not judgment. For each requirement, pick the
clause refs most likely to contain text that a downstream verifier could use
to prove OR disprove that requirement. You are optimising recall for that
verifier: include any clause that plausibly bears on the requirement, and
rank the most directly-on-point evidence first.

Critical selection discipline:
- Prefer a clause that STATES the specific fact (an actual scope/subject-
  matter statement, an explicit duration, an enumerated list of data
  categories) over a clause that merely USES the same vocabulary. A
  Definitions section that defines 'Personal Data' or 'Business Purpose' is
  usually NOT where the subject matter / categories are actually specified —
  it just contains the words. Do not let keyword density fool you.
- A clause that points to where a particular is specified (e.g. 'as set out
  in Annex 1', 'the Services specified in the Agreement', 'documented in the
  SOW') IS relevant — it establishes the fact by incorporation. Include it.
- Do NOT pick a clause just because it shares a topic area. If nothing in the
  list plausibly bears on a requirement, return an empty list for it — that
  is a valid, useful answer.

Pick ONLY from the refs given. Never invent a ref. Return at most the
requested number per requirement, best-first.
```

**User prompt builder** (`buildSelectCandidatesUserPrompt`):

```text
CLAUSES (pick refs only from this list):
{ref} [{clauseType} · {structuralPath}] {snippet}
…

REQUIREMENTS:
- {requirementId}
    hypothesis: {hypothesis}
    proof standard: {proofStandard}

For each requirement, return up to {N} clause refs,
ranked most-relevant first. Empty list is valid when nothing bears on it.
```

**Schema:** array of `{ requirementId, refs: string[] }` with enums constrained to known ids/refs.

### 7.2 EVALUATE_PACKAGE (legacy / grouped path — not the Art 28 hot path)

**File:** `prompts/evaluate-package.ts`

Used by the older grouped evaluation path. Compliance Art 28 mainline prefers VERIFY candidates; this prompt still matters for axes vocabulary and non-VERIFY fallbacks.

**System prompt (verbatim):**

```text
You are a precise legal/compliance analyst evaluating requirements against authored rule text and supplied document evidence. Evaluate each requirement independently against its own hypothesis and its own candidate evidence. Never fabricate evidence. Your job is to classify axes. Do not write the user-facing report. NLI is not compliance: entailed may still be partial; not_mentioned is not automatically a gap. For each requirement answer: (1) Does supporting evidence address the hypothesis? (2) What exact proposition does it establish? (3) Is coverage complete or partial? (4) What is only contextual or an external dependency? (5) What evidence would be required to conclude the rest? Contextual evidence alone cannot make compliance=present. Retention is not duration. Security measures are not confidentiality.
```

**User prompt** (`buildEvaluatePackageUserPrompt`) includes: user instruction, depth, per-requirement hypothesis / proofStandard / candidateEvidenceRefs / supporting+contextual refs / packet evidence lines, authored rule text, optional context rules, shared evidence, then long axis instructions (`nli`, `compliance`, `evidenceState`, `referenceBinding`, `draftingQuality`, truncated/heading_only rules, Obtain vs Amend). Full builder body lives in that file (~lines 86–152).

### 7.3 INVENTORY

**File:** `prompts/inventory-provisions.ts`

```text
You extract structured inventory records from the supplied document sections.
Do not decide legal compliance. Do not invent provisions that are not in the text.
If a field is not stated, omit it or use unspecified.
```

### 7.4 Bottom line (report only — after VERIFY)

**File:** `prompts/render-output-prompts.ts`

**System:** `BOTTOM_LINE_SYSTEM_PROMPT`

```text
Write polished senior-associate legal-memo prose from verified findings. Synthesize meaningfully, but introduce no new claim — reorganize and rephrase only.
```

**User** (`buildBottomLineUserPrompt`): short senior-associate paragraph; no new claims; evidence-completeness binding if any row is Cannot determine / Insufficient / Present-with-annex; then pasted structured sections.

### 7.5 What compliance “investigate” actually sends to an LLM today

For Art 28 compliance_check on the hot path:

| Stage | LLM? | What is sent |
|-------|------|----------------|
| Segment / locate / score pool | No | deterministic |
| Hybrid retrieve | Embeddings only | `complianceRetrievalQuery` = `hypothesis` + `evidenceHints[]` joined (NOT full proofStandard) |
| **VERIFY candidates** | **Yes** | System: `VERIFY_CANDIDATES_SYSTEM_PROMPT` (= base VERIFY + coverage addendum). User: hypothesis + **full proofStandard from skill** + N candidate passages. Schema: per-candidate verdict/coverage/quote/enrichment |
| Aggregate / status | No | `requirement-status-policy.ts` |
| BLUF bottom line | Yes (short) | §7.4 |
| Matrix cells | No | deterministic from locked assessments |

So the **only place an LLM reads evidence for compliance rows** is VERIFY (plus a tiny bottom-line paragraph). Skill `hypothesis` / `evidenceHints` / `proofStandard` are the “prompt payload” for investigate+verify — see §14 for full Art 28 text.

---

## 8. VERIFY — prompts, schema, winner selection

**Files:**

- Prompts/schema: `prompts/verify-proposition.ts`
- Runtime + candidates wrapper: `capabilities/act/verify-proposition.ts`
- Logging: `capabilities/act/verify-inspect-log.ts` → `logs/analysis/<sessionId>.log`

### 8.1 Single-passage vs candidates batch

| API | When | Shape |
|-----|------|--------|
| `verifyProposition` | older / one-off | one passage → one verdict |
| `verifyPropositionCandidates` | **compliance hot path** | many passages, same hypothesis → one row each |

Candidates system prompt = base VERIFY system prompt **plus** coverage consistency rules (`full=proves`, residual `partial+proves`, topical `partial+related_not_proof`).

### 8.2 User prompts (verbatim builders)

**Single-passage** (`buildVerifyPropositionUserPrompt` in `prompts/verify-proposition.ts`):

```text
Proposition (hypothesis): {hypothesis}

Proof standard: {proofStandard}

Candidate passage (from {locator}):
{passage}

Return your verdict, the exact supporting quote (verbatim substring of
the candidate passage above, or empty string if verdict is irrelevant),
a one-line rationale naming the specific words that do the work, and
whichever of establishedBy / gapDescription / dependency / structuralNote
/ remediation / partialCoverage genuinely apply (leave the rest empty —
see system prompt). If the core is proved but a named sub-element is
missing, verdict is still proves with partialCoverage=true and a specific
gapDescription + remediation.
```

**Candidates batch** (compliance hot path, built inline in `verifyPropositionCandidates`):

```text
Proposition (hypothesis): {hypothesis}

Proof standard: {proofStandard}

--- CANDIDATE {ref} from {locator} ---
{passage}
--- END {ref} ---
…

Return one independent verdict row for every candidateRef. Quotes must be
verbatim substrings of that same candidate passage. Classify coverage
independently for each row using the strict rules in the system instruction.
```

**Investigate retrieval string (not an LLM prompt — embedding/lexical query):**

```ts
complianceRetrievalQuery(hypothesis, profile) =
  [hypothesis, ...evidenceHints].filter(Boolean).join(". ")
```

Hypothesis + hints come from the skill `requirementEvidence` row; the **full proofStandard is reserved for the VERIFY user prompt**, not the retrieval query (avoids trap-language pulling wrong passages).
### 8.3 Output fields (enrichment)

| Field | Intent |
|-------|--------|
| `verdict` | proves / contradicts / related_not_proof / irrelevant |
| `coverage` | full / partial / none / contradicted (candidates path) |
| `quote` | verbatim; deterministically checked (`quoteVerified`) |
| `rationale` | one line naming words that do the work |
| `establishedBy` | report-ready what is shown |
| `partialCoverage` | residual limitation on a proving passage |
| `gapDescription` / `remediation` | specific delta + action |
| `dependency` | named missing doc + why |
| `structuralNote` | optional drafting observation |
| `applicabilityScope` / `scopeRole` | parties, jurisdictions, … |

Fake quotes on proves/contradicts are downgraded to `related_not_proof`.

### 8.4 Finding builder (status stamp)

`buildVerifiedFinding` (compliance lane):

```ts
const compliance =
  verdict === "proves"
    ? result.partialCoverage ? "partial" : "present"
    : "gap";
```

Risk lane is separate (present/absent via materiality + nli).

`buildPartialVerifyFinding` handles `related_not_proof` + `partialCoverage` without a full prove.

Full VERIFY system prompt text: [§13](#13-appendix--full-verify-system-prompt-text).

---

## 9. Aggregation and status

**Files:**

- `aggregate-requirements.ts` — findings → `RequirementAssessment`, copies enrichment fields
- `requirement-status-policy.ts` — `complianceFromFindings`, stamped-axis fast path

If every compliance finding agrees on `judgement.compliance`, that stamp wins (`present` / `partial` / `gap` / …).  
`displayRequirementStatus` / `renderedAssessmentStatus` map axes → Strong / Partially covered / Gap / etc., with emoji prefix on rendered status (`⚠️`, `✅`, `❌`, `➖`).

---

## 10. Rendering (BLUF)

For compliance_check with `ANALYSIS_BLUF_REPORT=1`:

`render-output.ts` → `buildBlufReport`:

1. Bottom line (small LLM)
2. `## Requirements at a glance` — `assessmentTableMarkdown`
3. Key risks (if any)
4. What needs attention
5. Missing materials (from `dependency`)

Columns: Requirement | Status | Evidence | Finding | Action  
Evidence uses clause locator + quote; Finding prefers `establishedBy` + `gapDescription`; Action prefers `remediation`.

---

## 11. Live Bitrix test — row-by-row what went wrong and why

Competitor ground truth: `chat_message (2).md`.  
Our report: `2026-09-05-art28-bitrix-ui-report.txt`.  
VERIFY digest: 14 blocks in session log.

### 11.1 VERIFY RESULT lines (machine)

| # | Requirement | VERIFY RESULT |
|---|-------------|---------------|
| 1 | subject_matter | insufficient — closest S44 related_not_proof (Appendix pointer) |
| 2 | duration | **partial** — S10 (cl. 2.5 deletion) |
| 3 | nature_purpose | **partial** — S44 (purpose + Appendix pointer) |
| 4 | art28_3_a_instructions | **proves** — S9 (cl. 2.4) |
| 5 | art28_3_b_confidentiality | **proves** — S18 |
| 6 | art28_3_c_security | **proves** — S17 |
| 7 | data_subject_categories | insufficient — S44 Appendix pointer |
| 8 | controller_obligations_rights | **proves** — S6 |
| 9 | art28_3_e_dsr_assistance | **proves** — S13 |
| 10 | art28_3_d_subprocessors | **proves** + coverage PARTIAL — S22 (GDPR-gated objection) |
| 11 | art28_3_f_security_assistance | **proves** + PARTIAL — S19 only (S30 also proved!) |
| 12 | art28_3_g_deletion_return | **proves** + PARTIAL — S10 deletion-only ← **correct vs competitor** |
| 13 | art28_3_h_audit | **proves** — S29 |
| 14 | art28_4_subprocessor_flow_down | **proves** — S21 |

Note: **`data_categories` had no VERIFY block** (`data_categories verify=false` in forensics). Report still showed an “Analysis incomplete” row for categories of personal data.

### 11.2 Comparison table

| Requirement | Competitor | Us | Log root cause |
|-------------|------------|----|----------------|
| Subject matter | ✅ Present (Appendix 1 services list) | ⚠️ Obtain Appendix 1 | Appendix body never in VERIFY passages; pointer → dependency |
| Duration | ✅ Present (Term def + §3) | ⚠️ Partial off cl. 2.5 | Term definition **absent from pool**; 2.5 deletion mistaken as duration boundary |
| Nature & purpose | ✅ Present (Appendix 1) | ⚠️ Partial | Same appendix supply failure; purpose half only |
| Data categories | ✅ Present | ➖ Incomplete | No VERIFY block / list text not in pool |
| Data subjects | ✅ Present | ➖ Incomplete / dependency | Heading-only S42; list not attached |
| Controller rights | ✅ | ✅ Strong | OK |
| (a) Instructions | ⚠️ Partial (missing legal-compulsion notify) | ✅ Strong | Proof standard explicitly **excludes** that limb from (a); content gap vs competitor |
| (b)(c)(e)(h)(4) | ✅ | ✅ (some duplicates) | Substance OK |
| (d) Subprocessors | ✅ | ⚠️ Partial | Residual-partial on “if GDPR applies” — over-fire for GDPR review |
| (f) 32–36 assist | ✅ (6.4 + §10) | ⚠️ Partial | **Both** S19 and S30 proved PARTIAL; winner picker kept only S19 |
| (g) Delete/return | ⚠️/❌ deletion only | ⚠️ Partial + right remediation | **Match — intended fix** |
| Extra open “(g)” row | — | ⚠️ cites cl. 2.4 + wrong action | PLAN open proposition collision |

### 11.3 Failure classes (for refinement planning)

```text
CLASS A — Evidence supply (chunking / sectioning / indexing)
  A1 Appendix 1 list bodies not attached to VERIFY candidates
  A2 Term definition not in retrieval pool
  A3 data_categories never verified

CLASS B — Aggregation / winner policy
  B1 Complementary proves not merged ((f) 6.4 + 10)
  B2 Residual partial too aggressive on jurisdiction gates ((d))

CLASS C — Skill / proof-standard content
  C1 (a) omits Union/MS legal-compulsion notify (competitor flags it)
  C2 (h) rule title claims unlawful-instruction warning; proof standard may not fully test it

CLASS D — PLAN / rendering shape
  D1 Duplicate open.p* vs catalog requirement rows
  D2 Crossed evidence/action on duplicate rows
  D3 “Analysis incomplete” labelling vs insufficient_evidence/dependency
```

**(g) is Class B/C success:** proof standard + residual `proves+partial` + status stamp behaved as designed.

---

## 12. Refinement backlog (ordered by impact)

Use this as the redesign checklist. Do **not** add Bitrix-only special cases.

### P0 — Evidence supply (fixes most “competitor Present, we Obtain Appendix”)

1. **Same-document annex resolution.** If VERIFY sees `Appendix 1` / `Schedule X` and that heading exists in `documentTexts` / segments of the **same** docId, expand or inject that section into candidates before emitting `dependency`.
2. **Appendix / ALL-CAPS heading merge.** Don’t leave `PROCESSING SUBJECT MATTER` as a body-less heading when the next lines are bullets under the appendix; merge until next true section break.
3. **DOCX table cell separation.** Treat `</td>` as a break in `htmlToStructuredText` so schedule grids don’t become one label line.
4. **Protect definitional Term lines.** Ensure `“Term” means …` survives into the section pool for duration retrieval (dedicated extract or boost), not only buried past 2k lite budget inside `clause-1.1`.

### P0 — Complementary proves

5. **Merge multiple `proves` with complementary gaps** when `gapDescription` of A names what B established (or coverage=partial on disjoint proof elements). Emit one finding with union of quotes / establishedBy, `compliance=present` if union satisfies proof standard.

### P1 — Residual partial policy

6. Distinguish **material statutory residual** (delete vs return) from **scope already implied by the ask** (GDPR-gated clause on a GDPR review). Don’t auto-downgrade the latter to Partially covered.

### P1 — PLAN collisions

7. When catalog packages already cover Art 28(3)(a)–(h), suppress duplicate `open.p*` propositions that restate the same particulars.

### P2 — Skill content

8. Decide explicitly: put legal-compulsion notify on `(a)` or keep on `(h)` and strengthen `art28_3_h` proof standard — then re-live-test Mastercard + Bitrix.
9. Audit other compound proof standards for letter-vs-substance traps (same class as (g)).

### P2 — Observability

10. Keep per-session VERIFY logs; add a one-line “candidate pool contained Appendix body? yes/no” and “Term definition present? yes/no” diagnostic for particulars packages.

---

## 13. Appendix — full VERIFY system + candidates prompts

### 13.1 Base system (`VERIFY_PROPOSITION_SYSTEM_PROMPT`)

Source: `prompts/verify-proposition.ts` (residual-limitation rules included 2026-09-05).

```text
You are a claim-verification engine, not a compliance reviewer. You are
given exactly one candidate passage and one proposition with an explicit
proof standard. Your only job is entailment: does this specific passage,
on its own, prove the proposition, contradict it, relate to it without
proving it, or have nothing to do with it?

You are NOT being asked whether the document is compliant, adequate, or
good practice. You are NOT evaluating the proposition against any external
standard beyond the proof standard given to you. Ignore any temptation to
reason about legal adequacy — that is a separate step you do not perform.

Verdicts:
- proves: the passage satisfies the proof standard exactly as written.
- contradicts: the passage affirmatively states the opposite of the
  hypothesis (not merely 'is silent on it'). A passage that proves only
  one part of a multi-part hypothesis is related_not_proof, not a
  contradiction. A scoped rule does not contradict a proposition about
  the document as a whole merely because other scopes are handled elsewhere.
- related_not_proof: the passage is on-topic — same subject area, uses
  similar vocabulary — but does not satisfy the proof standard's specific
  criteria. This is the single most important verdict to get right: a
  passage merely being near the topic is never enough. Read the proof
  standard's own stated traps (what commonly gets mistaken for proof) and
  apply them.
- irrelevant: the passage has nothing to do with the proposition at all.

Quote discipline (non-negotiable):
- `quote` must be copied character-for-character from the candidate
  passage you were given. Never paraphrase, summarize, correct spelling,
  normalize punctuation, or combine non-adjacent fragments with an ellipsis
  unless the passage itself contains that ellipsis.
- If no substring of the passage actually supports your verdict, your
  verdict must be `irrelevant` or `related_not_proof` — never invent
  supporting text that is not there.
- `rationale` must name the exact words in the quote doing the work, not a
  restatement of the proof standard.

You are the only stage that ever reads this evidence — capture what you
see as structured data instead of discarding it once you've picked a
verdict:
- If verdict is `proves`: fill `establishedBy` with what the passage
  actually shows, in your own words, as a report-ready sentence (e.g.
  "specifies the end-of-processing consequence via an explicit reference
  to the underlying Agreement's term") — richer than `rationale`, written
  for a reader who will never see the raw passage.
- Residual limitation on a `proves` verdict (compound / choice-based
  standards): when the passage satisfies the CORE of the proof standard
  but only one branch or part of a compound or choice-based standard
  (e.g. "A or B, at X's choice" where only A is offered; "A and B"
  where only A is stated), the verdict is still `proves` — the core
  proposition holds; do not manufacture a false `related_not_proof`.
  Set `partialCoverage` to true, and fill `gapDescription` and
  `remediation` with the SAME rigor required for a failure verdict:
  name the specific unaddressed part (e.g. "obligates deletion only;
  the controller has no return option") and the concrete action that
  would close it. Never a generic caveat.
- If verdict is `related_not_proof` or `contradicts`: fill
  `gapDescription` with the SPECIFIC delta between what the proof standard
  needs and what this passage actually gives (e.g. "specifies the
  post-termination deletion timeline, not the duration of the processing
  itself") — never a generic "does not establish this requirement".
  Also fill `remediation` with the concrete action that would close that
  specific gap (e.g. "confirm the referenced Offer Disclosure states a
  term, or add an express duration clause") — an instruction, not "needs
  improvement".
- If the passage's proof depends on a document that isn't supplied to you
  (an Annex, Schedule, SOW, or Offer Disclosure referenced but not
  included in what you were given), fill `dependency` with the document
  name and why it's needed — this applies regardless of verdict.
- If you notice a genuine drafting-quality observation worth a reader
  knowing (e.g. the relevant terms are dispersed across several clauses
  rather than consolidated, or the obligation is buried in an unrelated
  section), fill `structuralNote` — optional, only when you actually
  notice something, never manufactured to fill the field.
- Every one of these fields is optional and must be omitted (empty
  string, or the whole object left out for `dependency`) when it doesn't
  apply — never invent content for a field just because it exists in the
  schema.
- Capture applicabilityScope from the passage itself: parties,
  jurisdictions, timePeriods, and conditions. Omit dimensions the passage
  does not state. Set scopeRole=exception only when the passage is an
  express carve-out/exception; otherwise use main_rule or unspecified.
- The candidate location may include an enclosing section/addendum heading.
  Treat that heading as applicability context, but never copy it into quote
  unless those exact words also appear in the candidate passage.
```

### 13.2 Candidates addendum (`VERIFY_CANDIDATES_SYSTEM_PROMPT`)

Source: `capabilities/act/verify-proposition.ts` — appended after the base system prompt for the compliance batch call.

```text
You will receive several candidate passages for the SAME proposition.
Evaluate every candidate independently and return exactly one row for each
candidateRef. Do not combine text from different candidates into one quote.
For each row, separately classify coverage as full, partial, none, or
contradicted. Keep it consistent with verdict, with one exception for
residual limitations: full=proves (complete satisfaction);
contradicted=contradicts; none=irrelevant or a merely topical
related_not_proof; and coverage=partial is used in two distinct cases —
(1) verdict=proves when the passage satisfies the CORE of the proof
standard but misses a named sub-element of a compound or choice-based
standard (e.g. "A or B, at X's choice" where only A is offered);
(2) verdict=related_not_proof when the passage does not establish the
core at all and only touches part of the topic. Do not use case (2) for
a passage that satisfies the core proposition.

Use coverage=partial only when the quoted passage affirmatively establishes
a material portion of the proof standard but falls short of the complete
standard. Generic examples: (1) the standard requires A and B and the quote
expressly establishes A but not B; (2) the quote imposes the required type
of obligation, but with a narrower trigger, scope, or condition than the
standard requires; or (3) the quote expressly says that the exact required
particular is specified in an identified incorporated annex, schedule, or
statement of work that is not among the supplied passages. For case (3),
also populate dependency with the named material and why it must be checked.
For case (1) when the core still holds, pair coverage=partial with
verdict=proves (not related_not_proof).

When coverage=partial, populate establishedBy with the material portion the
quote establishes and gapDescription + remediation with the SAME rigor
required for a failure verdict: name the specific unaddressed part and the
concrete action that would close it. Do not use partial for a heading,
definition, generic topic mention, generic cross-reference, or a
proof-standard trap that establishes none of the proposition's substantive
elements.
```

---

## 14. Appendix — full Art 28 skill `requirementEvidence` (verbatim)

Authoritative source: `skills/regimes/data-protection/gdpr/skill.config.ts`.  
These strings are what VERIFY receives as **Proof standard:** / **Proposition (hypothesis):**; `evidenceHints` feed `complianceRetrievalQuery` only.

### 14.1 Package `gdpr.art28.particulars`

#### `subject_matter`
- **hypothesis:** The contract sets out the subject matter of the processing.
- **evidenceHints:** subject matter, offer, offers, disclosures, applies to the processing, services, business purpose, statement of work
- **proofStandard:** Proven only by text stating what personal-data processing activity or service this agreement covers (e.g. 'processing of Customer Personal Data in connection with the Offerings'). An explicit, named cross-reference to another document (an Offer, SOW, or Order Form) counts only if that referenced document itself states the subject matter — a bare pointer with no confirmation the target document contains it is a dependency, not proof. General recitals about the parties' business relationship, or a bare definition of 'Personal Data'/'Processing', do not establish subject matter unless they also say what is being processed under this specific agreement.

#### `duration`
- **hypothesis:** The contract sets out the duration of the processing.
- **evidenceHints:** duration, term, period, termination, in force, set forth, expiry, end of services, statement of work
- **proofStandard:** Proven only by text stating how long the processing continues — an explicit term (e.g. 'for the duration of the Agreement'), a fixed period, or an end condition tied to a specific event. Termination rights, notice periods, or post-termination data-deletion timelines do NOT by themselves establish duration unless they also state or clearly reference the term of the underlying processing itself. A binding end-of-processing consequence expressly tied to expiry, termination, or the end of services establishes a material end boundary and is partial coverage when the complete active processing term is not stated. A bare statement that 'this DPA remains in effect' without saying what period that tracks against does not count.

#### `nature_purpose`
- **hypothesis:** The contract sets out the nature and purpose of the processing.
- **evidenceHints:** nature, purpose, processing activities, services, business purpose, schedule, statement of work, provision of
- **proofStandard:** Proven only when the text describes BOTH what activities are performed on the data (nature — e.g. storage, hosting, transmission, analysis) AND why (purpose — e.g. to provide the contracted Offerings to the Customer). Both halves must be present: a clause stating only the purpose without describing the kind of processing activity, or vice versa, is partial, not present. A generic statement like 'Cisco will process data in accordance with the Agreement' describes neither and does not count.

#### `data_categories`
- **hypothesis:** The contract sets out the types of personal data.
- **evidenceHints:** categories of personal data, types of personal data, processing operations, annex, schedule, statement of work
- **proofStandard:** Proven only by text that names or categorizes the type(s) of personal data processed — e.g. contact details, account credentials, health data, employee data. An explicit, named cross-reference to an Annex/Schedule/Order Form counts only if that referenced document itself lists the categories - a bare pointer such as 'as described in the Offer' without confirming the Offer actually contains such a list is a dependency on an unsupplied document, not proof of the requirement. A general definition listing data that could qualify as personal or sensitive data does not prove that those categories are actually processed under the services.

#### `data_subject_categories`
- **hypothesis:** The contract sets out the categories of data subjects.
- **evidenceHints:** data subjects, categories of data subjects, employees, customers, end users, annex, schedule, statement of work
- **proofStandard:** Proven only by text identifying WHO the data subjects are — e.g. Customer's employees, customers, or end users — distinct from what data is processed about them. A clause describing only the types of DATA does not establish the types of PEOPLE the data is about. As with data categories, an explicit named cross-reference to a document that itself lists data-subject categories counts; an unconfirmed pointer does not.

#### `controller_obligations_rights`
- **hypothesis:** The contract sets out the controller's obligations and rights.
- **evidenceHints:** obligations, rights, instructions, lawful, minimise, minimize, data protection laws
- **proofStandard:** Proven only by text stating what the CONTROLLER (not the processor) must do or is entitled to do — e.g. the controller's duty to give lawful instructions or ensure a legal basis for the processing, or its right to audit/inspect the processor's compliance. A clause describing only the PROCESSOR's duties (the more common Art 28(3)(a)-(h) content) does not satisfy this particular unless it also names something the controller itself must or may do.

### 14.2 Package `gdpr.art28.3.mandatory_clauses`

#### `art28_3_a_instructions`
- **hypothesis:** The processor processes personal data only on documented instructions from the controller.
- **evidenceHints:** documented instructions, instructions
- **proofStandard:** Proven only by text that requires the processor to act ONLY on the controller's documented/written instructions — not merely to comply with data protection law generally, and not merely a description of the processing already agreed in the contract. A general statement that the processor 'will process personal data in accordance with Data Protection Laws' is a compliance obligation, not an instructions-only constraint, and does not by itself satisfy this. The clause must specifically tie processing to controller instructions (a carve-out for legally required processing, paired with a duty to notify the controller first, is consistent with this particular and does not defeat it). The separate duty to immediately warn the controller that an instruction is unlawful is Article 28(3)'s closing sentence, already scoped to art28_3_h_audit / gdpr.art28.3.h — do not treat its absence as a defect of this particular.

#### `art28_3_b_confidentiality`
- **hypothesis:** Persons authorised to process personal data are committed to confidentiality.
- **evidenceHints:** confidential, secrecy, authorised persons, authorized persons
- **proofStandard:** Proven only by text imposing a confidentiality duty specifically on the PERSONS who process the data (employees, staff, representatives) — via written contractual confidentiality obligations or a statutory duty of confidentiality binding those persons. A general corporate confidentiality clause covering the parties' business information, without specifically extending to persons handling personal data, does not satisfy this. Do not confuse with the technical/security-measures particular — this one is about people being bound to secrecy, not about systems being secured.

#### `art28_3_c_security`
- **hypothesis:** The processor implements appropriate technical and organisational security measures.
- **evidenceHints:** security, technical and organisational, tom
- **proofStandard:** Proven only by text obligating the processor to implement technical and organisational measures appropriate to the risk (e.g. referencing encryption, access controls, resilience, testing, or an incorporated security exhibit/schedule). A bare cross-reference to 'the Information Security Exhibit' or similar counts only if that referenced document is confirmed to actually contain security measures — an unconfirmed pointer is a dependency on an unsupplied document, not proof.

#### `art28_3_d_subprocessors`
- **hypothesis:** The processor does not engage another processor without controller authorisation.
- **evidenceHints:** sub-processor, subprocessor, authorisation, authorization, notice, object, written agreement, thirty days, 30 days
- **proofStandard:** Proven only by text requiring the processor to obtain the controller's prior GENERAL or SPECIFIC written authorization before engaging a subprocessor, AND (for general authorization) giving the controller an opportunity to object to changes. A clause that merely says the processor 'will notify' or 'may engage subprocessors' without any authorization/objection mechanism does not satisfy this — notice alone is not authorization.

#### `art28_3_e_dsr_assistance`
- **hypothesis:** The processor assists the controller in responding to data-subject rights requests.
- **evidenceHints:** data subject, assist, rights request, supervisory
- **proofStandard:** Proven only by text obligating the processor to assist the controller (by appropriate technical and organisational measures) in responding to data subject rights requests (access, rectification, erasure, portability, objection, etc.) made to the controller. A clause obligating the processor merely to forward or redirect a data subject's own request to the controller is a weaker, narrower obligation than 'assist responding to requests' — treat it as partial/gap unless it also commits to some substantive assistance (providing the means, information, or technical support the controller needs to fulfill the request), not merely notice/redirection.

#### `art28_3_f_security_assistance`
- **hypothesis:** The processor assists the controller with security, personal-data-breach, and DPIA obligations.
- **evidenceHints:** assist, breach, dpia, security of processing, prior consultation, supervisory
- **proofStandard:** Proven only by text obligating the processor to assist the controller with the CONTROLLER's own Article 32-36 obligations — security of processing, breach notification to the supervisory authority/data subjects, data protection impact assessments, or prior consultation with a supervisory authority. A clause stating only that the processor will notify the controller of a breach affecting the processor's own systems is the processor's OWN breach-notification duty (a different, narrower obligation) — this particular requires the processor to help the controller satisfy the controller's own downstream obligations, not just report upward.

#### `art28_3_g_deletion_return`
- **hypothesis:** At the end of the services the controller may choose whether the processor deletes or returns personal data and existing copies.
- **evidenceHints:** delete, deletion, return, erasure, copies
- **proofStandard:** Proven only by text that, at the end of the provision of services (not merely 'on request' at an unspecified time), gives the CONTROLLER an actual choice between deletion and return of all personal data, and requires deletion of existing copies, unless EU/Member State law requires continued storage. It is not enough that the processor performs one of those outcomes unilaterally. A clause obligating deletion only, with no return option the controller can elect, does not fully satisfy this — flag partialCoverage. A clause giving the controller only a vague 'right to request deletion' without the processor being independently obligated to delete or return at end-of-service does not satisfy this.

#### `art28_3_h_audit`
- **hypothesis:** The processor makes available information necessary to demonstrate compliance and allows audits and inspections.
- **evidenceHints:** audit, inspection, demonstrate compliance
- **proofStandard:** Proven only by text obligating the processor to make available information necessary to demonstrate compliance AND to allow for and contribute to audits, including inspections, conducted by the controller or an auditor mandated by the controller. Providing only third-party certifications/reports (e.g. SOC2, ISO 27001) on request, with no independent right for the controller (or its auditor) to conduct or contribute to an actual audit/inspection, is a weaker, narrower obligation — treat it as partial/gap, not full satisfaction, since this particular requires both the information AND the audit/inspection right.

#### `art28_4_subprocessor_flow_down`
- **hypothesis:** A subprocessor is bound by the same data-protection obligations as the processor.
- **evidenceHints:** flow-down, same obligations, subprocessor
- **proofStandard:** Proven only by text requiring the SAME data protection obligations imposed on the processor by this DPA to be imposed on any subprocessor by contract, specifically by reference to the processor's own Article 28(3) obligations — not merely a general statement that subprocessors must comply with data protection law, and not merely that the processor remains liable for the subprocessor's acts. Liability for a subprocessor's conduct is a different, narrower guarantee that does NOT by itself establish that the same contractual obligations were actually imposed on the subprocessor.

---

## 15. Caps and env flags cheat sheet

| Cap / flag | Where | Notes |
|------------|--------|------|
| Upload 25MB | documents route | |
| Evidence budget lite/deep | profileEvidenceCharBudget | ~2k / ~8k |
| Absolute evidence / expand | locate-evidence | 12k / 24k |
| Section max / min / count | select-candidates | 1500 / 40 / 260 |
| Verify candidate cap | profile + COMPLIANCE_VERIFY_CANDIDATE_CAP | small N per requirement |
| `ANALYSIS_SEMANTIC_RETRIEVAL` | evaluate-package | hybrid dense arm |
| `ANALYSIS_LLM_CANDIDATE_SELECT` | evaluate-package | **forced off** for compliance_check |
| `ANALYSIS_BLUF_REPORT` | render-output | hardcoded matrix path |
| `ANALYSIS_DISABLE_VERIFY` | must be 0 | |

---

## Document history

| Date | Change |
|------|--------|
| 2026-09-05 | Initial diagnostic from Bitrix live session `an_d8021da4-…`, competitor memo, and current ACT/VERIFY/skill code. Includes residual-limitation VERIFY change and (g) success / particulars failure map. |
| 2026-09-05 | Expanded §§7–8 / §§13–14 with verbatim investigate/VERIFY prompts (incl. candidates addendum + user builders), bottom-line prompts, and full Art 28 `requirementEvidence` skill strings. |

**How to use.** When refining, pick a Class (A–D) from §11.3, implement the smallest general fix from §12, typecheck, restart `npm run dev`, re-run the **same** Bitrix Art 28 prompt + Mastercard regression, and append a new live-eval section with VERIFY log quotes — same discipline as this session.
