# P-4B-01 — Phase 4B lexical matcher misses real Art 28 proof (Bitrix + Mastercard)

**Status:** Open — **blocks wiring live VERIFY / Phase 5 into the product report**  
**Phase:** 4B (deterministic element matrix over Phase 3C bundles) → 5A/5B already consume this matrix in the side-channel  
**Severity:** High for scorecard correctness (false `not_located` on clauses that exist in the DPA)  
**Logged:** 2026-09-05 (updated after document-grounded review)  
**Docs index:** [README](./README.md)

---

## 1. One-sentence core problem

**Phase 3 already retrieves the right clauses into the evidence bundles, but Phase 4B’s substring matcher rejects those same passages**, so Art 28(3)(g)/(f) elements that *are* in the DPA still come out `not_located` — while deletion-only Bitrix correctly stays empty on chooser/return.

This is **not** “the obligation is missing from the document.”  
It is **not** a Phase 3 retrieval failure for the cases below.  
It is a **Phase 4B proof-matching failure** (plus one cascade in Phase 5 CHOICE aggregation).

---

## 2. What the pipeline is doing (context)

| Stage | Role | Status |
|-------|------|--------|
| Phase 3C | Build per-requirement **evidence bundles** (candidate passages + structural paths) | Working for the critical clauses |
| Phase 4A | Author element schemas (G1–G4, F1–F3, …) | Authored |
| Phase 4B | **Deterministic lexical matcher** (no LLM) over bundle items → element states | **Broken on real phrasing / whitespace** |
| Phase 5A/5B | Assess requirement status + explain drafts from the matrix | Faithfully reflects 4B (including wrong ticks) |
| Live VERIFY / UI report | Still the old path | Must **not** switch until 4B matches document truth |

Phase 4B algorithm (simplified):

1. For each element, load `distinctiveTokens[]` and optional `requiredTokenGroups[][]`.
2. For each bundle item, `hay = quotedText.toLowerCase()` (**no whitespace normalization**).
3. **Distinctive gate:** if any distinctive tokens are authored, the item is discarded unless `hay.includes(token)` for at least one token.
4. **Compound gate:** if `requiredTokenGroups` exist, every group must have ≥1 hit (AND across groups, OR within a group).
5. Score remaining items (`SUPPORT_SCORE_THRESHOLD = 2`) → `supported` / `ambiguous` / else `not_located`.

Code:

- `backend/src/modules/analysis/capabilities/act/phase4-verify.ts`
- `backend/src/modules/analysis/capabilities/act/element-schemas.ts`
- `backend/src/modules/analysis/capabilities/act/phase5-assess.ts` (CHOICE rule)

---

## 3. Document ground truth (source of correctness)

Always judge the matrix against the **DPA text**, not against “what greps we wish were true.”

### 3.1 Bitrix / Alaio — `DPA - 1.docx`

| Element | In the document? | Evidence |
|---------|------------------|----------|
| **G1** chooser (delete *or* return) | **No** | §2.5 is deletion-only; no controller choice between return and delete |
| **G2** delete | **Yes** | §2.5 *Deletion on Term Expiry* — instruct Alaio to delete all Personal Data |
| **G3** return | **No** | No return/export obligation at end of Term |
| **G4** legal-retention proviso | **Yes** | Same §2.5: *“unless any applicable law requires storage”* |
| **F3** DPIA / prior consultation | **Yes** | §10 *DATA PROTECTION IMPACT ASSESSMENT* — assist with DPIA and prior consultation / Arts 35–36 |

### 3.2 Mastercard-style DPA (clause text from Phase 3 bundles)

**§3.5.6 Return and Deletion of Personal Data** (single clause contains G1+G2+G3+G4):

> … comply with Mastercard’s request, and **at Mastercard’s sole option**, securely **delete** existing copies of the Personal Data **or return** the same to Mastercard … **unless applicable local law requires storage** of the Personal Data …

**§3.5.5 Cooperation and Assistance** (F3):

> … assist Mastercard in fulfilling its own obligations … including … **conducting data protection impact assessments and consultations** …

---

## 4. Current scorecard vs truth

Latest paired side-channel runs (token-group era), re-audited 2026-09-06 against source files:

| Session | Doc | Source file | Log |
|---------|-----|-------------|-----|
| `an_ff125c81-71fb-4f3e-bb8f-57011885fbae` | Bitrix | `Downloads/DPA - 1.docx` | `logs/analysis/an_ff125c81-….compliance.log` |
| `an_91c6b78b-ee53-41bc-a71b-3203c3f56695` | Mastercard | `Downloads/Mastercard_Data_Processing_Agreement.pdf` | `logs/analysis/an_91c6b78b-….compliance.log` |

**Bundle-side responsibility (Phase 3): PASS for both.** Critical clauses are in the `(g)`/`(f)` bundles. Bitrix has **zero** `return` in the DOCX — G1/G3 `not_located` is correct. Remaining false misses are Phase 4B matcher, not bundling.

### 4.1 Bitrix (g)/(f)

| ID | Matrix | Should be | Verdict |
|----|--------|-----------|---------|
| G1 | `not_located` | `not_located` | **Correct** |
| G2 | `supported` | `supported` | **Correct** |
| G3 | `not_located` | `not_located` | **Correct** |
| G4 | `not_located` | `supported` | **False miss** |
| F3 | typically `supported` on §10 | `supported` | OK on Bitrix path |

Phase 5 then emits `(g) = partial` with `LEGAL_RETENTION_NOT_LOCATED` — **wrong**, because the proviso is in §2.5.

### 4.2 Mastercard (g)/(f)

| ID | Matrix | Should be | Verdict |
|----|--------|-----------|---------|
| G1 | `not_located` | `supported` | **False miss** |
| G2 | `supported` | `supported` | **Correct** |
| G3 | `supported` | `supported` | **Correct** (return gate retune worked) |
| G4 | `unresolved_dependency` / blocked | `supported` | **False miss / cascade** (proviso is in 3.5.6; G1 missing also prevents CHOICE=`present`) |
| F3 | `not_located` | `supported` | **False miss** |

---

## 5. Proof that this is *not* “missing from the document”

### 5.1 Bitrix G4 — proviso is in the DPA **and** in the `(g)` bundle

Replay on `an_5c929289…`:

- Bundle item `clause-2.5` quotedText **includes**  
  `unless any applicable law requires storage` (`fullHasProviso: true`, length ~980).
- Matcher still returns **`rejected: distinctive_gate`** for G4 on that same item.
- Therefore: retrieval succeeded; **proof gate failed**.

### 5.2 Mastercard G1/G4 — 3.5.6 is in the `(g)` bundle

Full `clause-3.5.6` quote in the bundle contains:

- chooser language: `at Mastercard’s sole option` … `delete` … `or return`
- retention proviso: `unless applicable local law requires storage`

Matcher still **`distinctive_gate` rejects** that item for G1 and G4.

### 5.3 Mastercard F3 — 3.5.5 is in the `(f)` bundle

The `(f)` bundle item for `clause-3.5.5` contains the DPIA sentence, but with **irregular whitespace** from DOCX extraction (see §6.1). Distinctive multi-word tokens miss; state = `not_located`.

---

## 6. Root causes (two bugs that stack)

### 6.1 Bug A — whitespace-sensitive `includes()` on DOCX text (systemic)

Extracted / bundled `quotedText` often has **double spaces and mid-phrase newlines**, e.g. from the Mastercard `(f)` bundle:

```text
conducting \ndata  protection  impact  assessments  and  consultations
```

Human-normalized (`/\s+/g → " "`):

```text
conducting data protection impact assessments and consultations
```

Authored distinctive token: `"impact assessment"`.

| Check | Result |
|-------|--------|
| `"data  protection  impact  assessments".includes("impact assessment")` | **false** (two spaces) |
| Same after whitespace collapse | **true** |

Observed on MC 3.5.6 as well (`sole  option`, `delete  existing… or  return`).

**Phase 4B lowercases but does not collapse whitespace before token checks.**  
Any multi-word `distinctiveTokens` / `requiredTokenGroups` entry is fragile on real DOCX spans.

This alone is enough to false-miss F3 on Mastercard even when the vocabulary is otherwise correct.

### 6.2 Bug B — over-narrow / wrong-shape distinctive phrases (schema + matcher)

Even after whitespace normalization, several tokens still would not match real contract English:

#### G4 (legal retention)

Authored `distinctiveTokens` are mostly rigid idioms:

- `unless required by`
- `except as required by`
- `required by applicable law to retain`
- …

Real Bitrix:

- `unless any applicable law requires storage`

Real Mastercard:

- `unless applicable local law requires storage`

`requiredTokenGroups` for G4 (exception ∧ storage ∧ law) **would pass** on those sentences — but the **distinctive gate runs first** and rejects the item, so groups never get a chance.

Replay: Bitrix `clause-2.5` → `rejected: distinctive_gate` while proviso present; groups would be `[true, true, true]`.

#### G1 (chooser)

Authored tokens require either:

- contiguous branch phrase: `delete or return` / `return or delete` / …, **or**
- fixed choice idiom: `at the option`, `at the choice`, `controller's option`, …

Real Mastercard:

- `at Mastercard’s sole option` (not `at the option`)
- `securely delete existing copies of the Personal Data or return` (not contiguous `delete or return`)

Replay: `clause-3.5.6` → G1 `distinctive_gate` reject; zero G1 hits on the real haystack.

Bitrix correctly has **no** chooser — G1 `not_located` is right and must stay right after any G1 fix.

#### F3 (DPIA)

Distinctive list includes `impact assessment`, `data protection impact`, `prior consultation`, etc.

On Mastercard 3.5.5 those substrings are present **semantically**, but Bug A breaks the multi-word hits. Bitrix §10 uses cleaner spacing / heading vocabulary, so F3 can look “fine” on Bitrix while failing on MC — another Bitrix↔MC seesaw symptom.

### 6.3 Bug C — Phase 5 CHOICE cascade (secondary)

For Art 28(3)(g) aggregation rule `CHOICE`:

- `present` requires **chooser (G1) + ≥1 branch + proviso (G4)** all supported.
- Missing G1 or G4 → `partial` / reason codes like `CONTROLLER_CHOICE_NOT_LOCATED`, `LEGAL_RETENTION_NOT_LOCATED`.
- Mastercard G4 may also surface as `unresolved_dependency` depending on scoring path, which further blocks a clean `present`.

So Phase 5 is **not inventing** a new error — it is amplifying Phase 4B false misses into requirement-level status.

---

## 7. What is *not* the core problem (anymore)

| Suspected earlier | Current status |
|-------------------|----------------|
| Schema / alias resolution (`canonicalKey`) | Fixed — registry + verify completeness OK |
| Phase 3 never packing §2.5 / §3.5.6 / §3.5.5 | **False** for these sessions — items are in the bundles |
| “Bitrix G4 should be empty because deletion-only” | **Wrong ground truth** — deletion-only affects G1/G3; G4 proviso **is** in §2.5 |
| Global threshold seesaw alone | Contributes historically, but current false misses are explained by §6 |
| Live VERIFY chunking Class A (appendix/Term) | Still a separate upstream issue for the **live** path; not the side-channel matrix bug described here |

---

## 8. Why Bitrix and Mastercard still “fight”

Historical narrative (still useful):

1. Loose tokens → Bitrix G3/G1 false `supported`.
2. Tighten distinctive phrases / traps → Bitrix G1/G3 correct, Mastercard under-fires.
3. Add `requiredTokenGroups` → G3 return fixed on MC; G4 groups written correctly but blocked by distinctive gate + phrasing mismatch.

Current precise statement:

> We tightened the matcher enough to stop Bitrix false positives on chooser/return, but the same gate design (rigid multi-word phrases + no whitespace normalization) now **false-negatives** real Mastercard chooser/DPIA language and Bitrix’s own retention proviso — even when those passages are already in the bundle.

---

## 9. Related open issues (same family, not this ticket’s must-fix)

| Issue | Notes |
|-------|--------|
| F1/F2 cite bleed / junk spans (`clause-2023`) | Noisy cites; secondary after G1/G4/F3 correctness |
| Appendix-first ranking for particulars (SM1/CD1/DS1) | Deferred; Path often not `appendix-…` |
| Live VERIFY Class A (appendix body / Term) | See `COMPLIANCE-CHECK-ACT-CHUNKING-DIAGNOSTIC.md` |
| Optional LLM shortlist rerank | Only after deterministic gates are honest |

---

## 10. What “fixed” means (acceptance)

Re-run **both** DPAs on the **same** build. Side-channel matrix must match document truth:

### Must-have

1. **Bitrix (g):** G1=`not_located`, G2=`supported`, G3=`not_located`, **G4=`supported`** (cite §2.5 proviso).
2. **Mastercard (g):** **G1=`supported`**, G2=`supported`, G3=`supported`, **G4=`supported`** (all credit §3.5.6 / equivalent).
3. **Mastercard (f):** **F3=`supported`** (credit §3.5.5 DPIA language).
4. Bitrix must **not** regress: G1/G3 must stay empty.

### Then

5. Phase 5 `(g)` status/reason codes should stop claiming `LEGAL_RETENTION_NOT_LOCATED` on Bitrix and stop blocking MC solely for false-missing G1/G4.
6. Only after that: consider wiring live VERIFY / report to this matrix.

### Nice-to-have (after)

7. Whitespace normalization in matcher (or at extract/bundle time) for all multi-word tokens.
8. Appendix-first ranking; drop year-fragment junk cites.

---

## 11. Suggested fix directions (implementer)

Do **not** only raise/lower a global score threshold — that recreates the Bitrix↔MC seesaw.

Prefer, in order:

1. **Normalize whitespace** before all `includes` checks  
   (`quotedText.toLowerCase().replace(/\s+/g, " ")`) in `phase4-verify.ts` (and consider fixing at extract time too).
2. **Rewrite G4 distinctive tokens** to match real proviso shapes  
   e.g. allow `unless` + storage/retain + law via groups as the primary gate; broaden or drop idioms that require `unless required by` contiguous order; ensure distinctive gate does not veto passages that pass `requiredTokenGroups`.
3. **Rewrite G1 distinctive tokens** for real chooser shapes  
   e.g. `sole option`, `at … option`, non-contiguous delete+return near termination, title `return and deletion` — **plus** keep hard trap: deletion-only with no return branch (Bitrix §2.5).
4. **F3:** after whitespace fix, re-check; if still thin, accept `impact assessments` / `consultations` plurals or stem lightly — without accepting blanket “cooperate with privacy law” alone.
5. Optionally: if distinctive tokens are empty, rely on `requiredTokenGroups` only (don’t double-veto).

Out of scope for this fix pass: LLM whole-doc ranking; live VERIFY cutover.

---

## 12. Decision

| Decision | Recommendation |
|----------|----------------|
| Move forward to live VERIFY / product report wiring? | **No** |
| Keep debugging Phase 4B? | **Yes — focused pass only** (§10 must-haves) |
| Is empty G1/G3 on Bitrix a bug? | **No** — document is deletion-only |
| Is empty G4 on Bitrix a bug? | **Yes** — proviso is in §2.5 and in the bundle |
| Is empty G1/F3 on Mastercard a bug? | **Yes** — text is in §3.5.6 / §3.5.5 and in the bundles |

---

## 13. Changelog

| Date | Note |
|------|------|
| 2026-09-05 | Original filing: Bitrix `an_d0984515…` + Mastercard `an_77df02b9…` after matcher tighten (G1/G3 Bitrix↔MC seesaw). |
| 2026-09-05 | **Updated after document check + matcher replay.** Corrected Bitrix G4 ground truth (proviso **present**). Identified core failure: Phase 3 packs proof, Phase 4B distinctive gate rejects it — driven by (A) whitespace-sensitive multi-word `includes`, (B) over-narrow G1/G4 phrases. Latest pair: Bitrix `an_5c929289…`, Mastercard `an_7d107bb4…`. |
| 2026-09-06 | Re-audit vs `DPA - 1.docx` + `Mastercard_Data_Processing_Agreement.pdf`. Newest pair `an_ff125c81…` / `an_91c6b78b…`. **Bundles correct** (Bitrix return absent in doc+bundle; MC 3.5.6/3.5.5 present). Matrix still wrong on Bitrix G4 + MC G1/G4/F3. |
