# Analysis Pipeline Issues — Root Cause Review

> This document catalogues the recurring failures when the pipeline processes non-DPA documents (NDAs, commercial agreements) or non-GDPR prompts. Each case shows the user prompt, the document provided, the output received, and the pipeline stage that broke.

---

## Case 1: DPA "In-depth analysis" — Skill Not Selected

### What was asked
> "Do an in-depth analysis of this DPA"

### Document provided
- A Data Processing Agreement (DPA)

### Output received
- Generic report saying **"no analysis package available for key pointers"**
- Only the `_global` skill was selected; `doc-types/dpa` was never loaded
- Requirements like `dpa.overall_analysis`, `dpa.key_pointers` had no mapped capabilities

### Pipeline breakdown

| Stage | What went wrong |
|-------|----------------|
| **PLAN → skill-selection** | `resolve-skills.ts` did not include the doc-type skill even though `docTypeHint=dpa` was set. No fallback logic existed to force-include the relevant doc-type skill. |
| **PLAN → resolve-packages** | Generic requirements (`dpa.overall_analysis`) had no package mapping. The system only resolves when a known package exists with matching `capabilityIds`. |
| **ACT → build-act-graph** | `hasUnsupportedExtraction()` caused the legacy structural subgraph (`check_expected_clauses`, `flag_risk`) to be skipped entirely — removing the only fallback analysis path. |
| **ACT → aggregate-requirements** | With no findings tagged to requirements, it emitted "no package" placeholder findings for every requirement → synthesis concluded "not applicable". |

### Root cause
The system was built around GDPR Art 28 packages. When a DPA arrives without that specific package structure, the pipeline has no graceful degradation — it either runs packages or emits blanks.

---

## Case 2: NDA "Do the analysis" — Wrong Renderer

### What was asked
> "do the anaysis of NDA"

### Document provided
- A mutual NDA (Randstad mutual NDA.docx)

### Output received
- Empty GDPR-style article quick-reference table
- Headers like "Brief overview / Quick reference" with generic bottom-line text
- Message: *"The requested articles did not produce a confirmed document gap"*

### Pipeline breakdown

| Stage | What went wrong |
|-------|----------------|
| **PLAN → classify-intent** | Classified as `operation: summarize`, `outputForm: brief_summary`, `reportType: qa_answer`. The LLM saw a short instruction and defaulted to summary mode. |
| **ACT → check-against-rule** | NDA rules ran correctly and produced findings. |
| **ACT → render-output** | Selected `buildBriefSummaryDocument()` renderer, which looks for GDPR Article numbers. Found none → rendered empty table with fallback text. |

### Root cause
The renderer selection is coupled to `outputForm` / `reportType` without checking whether the document is actually GDPR-related. A `brief_summary` for an NDA hits a code path that only knows how to render Article-based quick-reference tables.

---

## Case 3: NDA Detailed Confidentiality Review — Findings Not Linked

### What was asked
> "Analyse the confidentiality and non-disclosure obligations in this NDA. Identify: the scope of confidential information, permitted disclosures and exceptions, survival period after termination, return or destruction of confidential materials obligations, and whether the obligations are mutual or unilateral."

### Document provided
- Randstad mutual NDA.docx

### Output received
- Report with only **Scope** and **Conclusion** sections (no analysis body)
- Conclusion states: *"All primary requirements are marked as 'not applicable' because no analysis packages were available"*
- Contradicts itself: also mentions *"survival period is limited to five years"* (found by risk flagging)
- Job ended with `reason=blocked` after critique iteration 2

### Pipeline breakdown

| Stage | What went wrong |
|-------|----------------|
| **PLAN → classify-intent** | Classified as `operation: extract` (because "Identify:" triggers extraction). `reportType: qa_answer`. This is technically correct for extraction but wrong for a structured review. |
| **PLAN → intent-heuristics** | `refineWholeDocumentAnalysisIntent()` explicitly skipped `operation: extract` — so the upgrade to `risk_audit` + memo never fired. |
| **PLAN → derive-report-outline** | `reportType: qa_answer` → outline collapsed to just Scope + Conclusion, even with 6 requirements. No analysis sections generated. |
| **PLAN → resolve-packages** | All 6 requirements typed as `extraction`. No packages exist for NDA extraction requirements → all marked `not_supported`. |
| **ACT → check-against-rule** | Rules (`nda.ci_definition`, `nda.purpose_limitation`, `nda.return_or_destruction`) ran correctly, produced findings with `ruleId` set but **no `requirementId`** tagged. |
| **ACT → flag-risk** | Found `weak_confidentiality` risk (survival period = 5 years). Also no `requirementId` tagged. |
| **ACT → aggregate-requirements** | Only looked for findings with explicit `requirementId` match. Found none → emitted "no package" placeholders with `status: not_covered` for all 6 requirements. |
| **ACT → render-output (synthesis)** | Got 6 "not applicable" assessments + contradicting risk finding → confused synthesis LLM → contradictory conclusion. |
| **CRITIQUE** | Deep critique found issues, triggered retry. Second iteration still `structurallyValid=false`. No fix available → `reason=blocked`, job terminated with bad output delivered. |

### Root cause (compound)
1. **Intent classification**: "Analyse + Identify" is a structured review but gets classified as `extract` because of keyword matching
2. **Requirement→Finding mapping is broken for non-package paths**: The only link between PLAN requirements and ACT findings is `finding.requirementId`. Rule checks (`check-against-rule`) never set this field — they tag `ruleId` instead. There's no bridge.
3. **Report outline is too conservative**: Any `qa_answer` gets minimal outline regardless of requirement count
4. **Aggregation has no capability-mapping lookup**: PLAN explicitly maps `nda.confidentiality.scope_of_information → nda.ci_definition` in `requirementMappings`, but aggregation never uses that mapping to resolve findings by `ruleId`

---

## Systemic Issues (Across All Cases)

### 1. The pipeline was designed for GDPR Art 28 DPA analysis

Every structural assumption — packages, renderers, outline generation, article-based sections — assumes a GDPR compliance memo. Non-GDPR document types hit dead code paths.

### 2. Two disconnected execution paths with no bridge

```
Path A: Packages → evaluate_package → findings tagged with requirementId → aggregation works
Path B: Rules → check_against_rule → findings tagged with ruleId only → aggregation blind
```

When PLAN maps a requirement to a **rule** (not a package), the requirement resolves as `not_supported` and the rule findings are orphaned. The PLAN `requirementMappings` data exists to bridge them, but aggregation never consulted it.

### 3. Renderer selection is not doc-type-aware

`brief_summary` always picks the GDPR article renderer. `qa_answer` always picks minimal outline. There's no doc-type dispatch at the rendering layer.

### 4. "not_supported" requirements generate `not_covered` findings (wrong semantics)

A requirement that has no **package** is not the same as a requirement that is **outside scope**. The system conflates "I don't have a package for this" with "this doesn't apply to the document" — then synthesis parrots "not applicable" to the user.

### 5. Intent classification doesn't understand doc-type-specific analysis patterns

- "Analyse the confidentiality obligations" → should be `compliance_check` or `risk_flag`
- Gets classified as `extract` because "Identify:" is present
- Heuristic refinement only catches `summarize`/`explain_qa` misclassification, not `extract`

### 6. Critique can block delivery without fallback

When critique detects `structurallyValid=false` on the second iteration with no fixes available, it terminates with `reason=blocked`. The user gets whatever was last rendered — often the broken first-pass output.

---

## What Was Fixed So Far

| Fix | File | Effect |
|-----|------|--------|
| Force-include doc-type skill from `docTypeHint` | `resolve-skills.ts` | DPA/NDA skills always load |
| Skip legacy subgraph only when packages run | `build-act-graph.ts` | Structural checks (extract, flag_risk) not skipped for doc-type reviews |
| Upgrade `summarize`/`brief_summary` NDA → `risk_audit` + memo | `intent-heuristics.ts` | "do the analysis" no longer hits article renderer |
| Upgrade `extract` when instruction says "Analyse" | `intent-heuristics.ts` | "Analyse + Identify" NDA prompt now gets `risk_audit` |
| Multi-requirement `qa_answer` gets full outline | `derive-report-outline.ts` | 6-point review gets analysis sections |
| Aggregation uses `requirementMappings` to resolve findings by `ruleId` | `aggregate-requirements.ts` | Rule check findings now link to requirements |
| Broad doc-type requirement detection includes `nda.*` | `aggregate-requirements.ts` | NDA requirements can reuse structural findings |
| Unresolved requirements emit `insufficient_evidence` not `not_covered` | `aggregate-requirements.ts` | Synthesis says "could not determine" not "not applicable" |
| Render synthesis fallback when no article numbers | `render-output.ts` | NDA gets synthesis memo, not empty article table |

---

## What Still Needs Review

1. **check-against-rule should tag `requirementId`** — The bridge via `requirementMappings` in aggregation is a workaround. Ideally, when PLAN assigns a rule to a requirement, the ACT work unit should carry `requirementId` into the finding directly.

2. **NDA survival-period rule** — No authored rule for extracting/checking survival period. Gap in the NDA skill catalog.

3. **Critique `reason=blocked` handling** — Should deliver best-available output with a disclaimer, not silently serve broken first-pass.

4. **Package resolution for `extraction` type requirements on non-GDPR docs** — The entire `resolvePackages` path assumes packages. For doc-type skills that use rules instead, there's no supported execution path for extraction requirements.

5. **Doc-type-aware renderer dispatch** — The renderer should check `docTypeHint` before selecting output format, not just `outputForm`/`reportType`.

6. **Intent classification over-relies on keyword triggers** — "Identify" → extraction, "brief" → summary. These are reasonable defaults for GDPR but fail for NDA/commercial analysis. The LLM classification should weight doc-type context more heavily.
