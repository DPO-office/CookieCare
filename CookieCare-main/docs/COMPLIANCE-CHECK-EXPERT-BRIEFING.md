# Compliance Check — ACT Phase Approach

How CookieCare runs a **compliance_check** in the ACT phase: retrieve evidence, verify it, lock the result, then render the report.

---

## Overview

```text
PLAN hands ACT a set of requirements
        ↓
1. Extract / retrieve evidence  (per requirement)
        ↓
2. Verify each legal element against that evidence only
        ↓
3. Assess status + Lock (accept or reject)
        ↓
4. Render the compliance matrix from accepted locks only
```

Judgment is **requirement-isolated**: each requirement gets its own evidence bundle. We do not ask a model to “review the whole contract” in one free-form pass.

---

## 1. Extracting clauses / evidence

### Document prep

1. The uploaded document is turned into plaintext.
2. The text is **segmented** into clauses, headings, and paragraphs.
3. Those segments are grouped into **section candidates** (a heading/clause + the body under it). That pool is what retrieval searches over.

We also build a light **structural index** over the same document. This is not a second search corpus — it is a map of how the contract is wired together, so a hit can pull in the right neighbours:

- **Definitions** — where a defined term (e.g. “Personal Data”, “Term”) is introduced, so we can attach the definition when a clause uses that term.
- **Cross-references** — “see Clause 8.2”, “as set out in Appendix 1”, etc., mapped to target spans when they resolve inside the same document.
- **Hierarchy** — parent / child / sibling links between headings, clauses, and list items (so a hit on a sub-bullet can also bring the parent obligation, or a sibling bullet in the same list).

### Per-requirement investigation

**How retrieval works:** we already know **which compliance obligations to check** (from PLAN / the skill catalog — e.g. the Article 28 matrix). We do **not** ask a model to invent the checklist, or to skim the whole contract once and guess.

For each known requirement we:

1. Take that requirement’s authored text (proof standard, hypothesis, requirement id, clause types, element propositions).
2. **Pull keywords / phrases out of that text** — tokenize the proof standard, split it into element-level sentences, take multi-word anchors from the requirement id (e.g. `subject_matter_and_duration` → “subject matter and duration”), plus definition and cross-reference targets when they match. We also generate paraphrases, exception language, and contradiction queries from a search plan so contracts that word the same obligation differently still match.
3. **Search those terms in the document’s section candidates**.
4. Keep the matching passages (plus structural expansions) as that requirement’s **evidence bundle**.

So retrieval is always:

```text
known compliance requirement
        ↓
keywords / phrases / paraphrases taken from that requirement
        ↓
search those terms in the document sections
        ↓
evidence bundle for that requirement only
```

For each compliance requirement (e.g. an Article 28 obligation), that closed investigation runs as follows:

1. **Build a query mix from the requirement itself** (what it needs to prove):
   - One **requirement-level** query (proof standard / hypothesis text).
   - **Element-level** queries (sentences / atomic asks split from that same text).
   - **Exact anchors** — multi-word phrases taken from the standard or requirement id (e.g. “subject matter and duration”).
   - **Clause-type / extraction targets** from the skill package (what kinds of clauses usually carry this proof).
   - **Definition** and **cross-reference** targets when the standard points at a term or article.
   - A **search plan** adds paraphrases a contract might use, exception language, contradiction language, and explicit distinctions (e.g. DPIA is not TIA) — so we search for how the obligation is *likely drafted*, not only the statute’s exact wording. The planner uses headings / defined terms / schedule names to propose *where to look*, not a verdict.
   - Queries are capped (round-robin) so one requirement cannot flood the search.

2. **Search those queries into the document sections** (hybrid retrieval over the section-candidate pool — not over the whole document as one blob):
   - **Lexical** — score each section by keyword / phrase overlap with the queries derived above (exact anchors get an extra boost).
   - **Dense** — embed the same queries and rank sections by embedding similarity.
   - Fuse both arms (RRF) into a ranked shortlist so a section that matches on either keywords or meaning can survive.
   - Keep a bounded shortlist of hits per query / requirement (recall width, not the entire contract).

3. **Expand** those seed hits using the structural index before packing the bundle:
   - If the hit uses a defined term → pull the **definition** span.
   - If the hit cites another clause / appendix → pull the **resolved target** when it is in-document; mark unresolved external refs instead of inventing text.
   - Pull **parent / child / sibling / heading** neighbours within node and token budgets so list items and schedule rows are not stranded alone.
   - Expansion stops when node / depth / token limits are hit; omitted spans are recorded rather than silently ignored.

4. **Pack** the kept passages into an **evidence bundle**. Each bundle is tied to one requirement and includes:

   | Detail | What it carries |
   |--------|-----------------|
   | **Items (passages)** | `spanId`, display `ref`, exact `quotedText`, `structuralPath` (e.g. clause/heading path), `charRange` in the document |
   | **Provenance** | Whether the item was a retrieval **seed** or an **expansion**, and why it was added (definition, internal reference, parent/child/sibling, heading) |
   | **Scope** | Party / relationship (e.g. controller→processor), jurisdiction, time period, condition, exception vs main rule, document id |
   | **Partitions** | Groups of items that share a compatible scope (so mixed scopes are not treated as one pile of proof) |
   | **Exclusions** | Spans dropped for incompatible scope, duplicate, or budget, with reason |
   | **Dependencies** | Cross-references found in the evidence — classified as resolved inside the document, unresolved external, or ambiguous — plus target span ids when resolved |
   | **Budget** | Estimated token size of the bundle (caps how much context the verifier sees) |

That bundle is the only document text the verifier is allowed to use for that requirement.

---

## 2. Verifying and locking

### Element schemas

Each requirement is broken into **atomic elements** (small, checkable propositions), with rules for how they combine (e.g. AND, OR, CHOICE). Example: deletion/return may be a chooser plus alternatives plus a closing proviso.

### Verify

Against the evidence bundle only, each element is marked as one of:

- **supported** — cited quote(s) actually back the element  
- **contradicted** — passage conflicts with what is required  
- **not_located** — no usable evidence in the bundle  
- **ambiguous** / **unresolved_dependency** / **not_applicable** as needed  

Verification may be deterministic (token / proof-guidance matching) and/or LLM-assisted, but in all cases:

- Citations must point at real bundle span IDs.
- Quotes must be **exact substrings** of the cited passage.
- The verifier outputs **per-element states**, not a free-form legal memo.

### Assess

Element states are rolled up with the requirement’s aggregation rule into a status such as:

**Present · Partial · Gap · Cannot determine · Conflicting · Verification incomplete · …**

Retrieval or verification failure is **not** silently turned into Gap; incomplete investigation stays a separate outcome.

### Lock

Before anything reaches the user matrix, the assessment must pass lock gates, including:

- Every cited evidence ID exists in the bundle  
- Supported quotes match the cited text exactly  
- Status matches the aggregation rule  
- A Gap is only allowed when investigation + verification both completed  

**Accepted** → becomes a locked row.  
**Rejected** → does not appear as a compliance finding (logged with reason codes).

---

## 3. Providing the output

Only **accepted locks** feed the report:

- One matrix row per locked requirement (citation, title, status, evidence quotes, what is present / missing, recommended action).
- Bottom-line summary claims must reference locked assessment IDs — no unlocked inventing of obligations.
- That locked matrix is what the user sees for the compliance check.

---

## End-to-end picture

```text
Document → segments → section candidates
                         ↓
              retrieve + expand per requirement
                         ↓
                   evidence bundle
                         ↓
              verify elements → assess status
                         ↓
                    lock (accept / reject)
                         ↓
              render matrix from accepted locks
```
