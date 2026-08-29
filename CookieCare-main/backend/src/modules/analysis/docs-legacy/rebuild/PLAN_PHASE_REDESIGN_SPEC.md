# PLAN Phase — Consolidated Redesign Spec

> **Purpose:** Everything decided about PLAN specifically, pulled together
> from the ACT/PLAN research and the phase plan, into one place. PLAN's
> existing 12-step pipeline and its outputs (`intent`, `activeSkillIds`,
> `instructionFocus`, `workUnits[]`, `reportSpec`, `packageResolution`,
> `missingClarifications`) are not being replaced — one capability is being
> added to it, and a handful of parameters are being made first-class that
> today are implicit or missing. This document says exactly what that means.
> Depends on the ACT rebuild (`ACT_AND_PLAN_REDESIGN_RESEARCH.md`,
> `IMPLEMENTATION_PHASE_PLAN.md` Phases 1–10) being proven first — reasons
> in §7.

---

## 1. The one-sentence diagnosis

PLAN today can only generate requirements from **one source**: skill-authored
compliance packages (`resolve-packages.ts`). That's why it's compliance-shaped
— not because PLAN's steps are wrong, but because step 8 in its own pipeline
(package resolution) is the only mechanism it has for producing something for
ACT to investigate. Anything without a pre-built package falls through to
`not_supported` or a generic extract/summarize — this is the exact
"package-only resolution" issue your own reference doc already logs as a
known PLAN problem (§11 there). The fix is not a new PLAN architecture; it's
giving PLAN a second and third way to produce a requirement, alongside the
one it already has.

---

## 2. What PLAN produces, reframed

Everywhere PLAN currently thinks in terms of **requirements**, the redesign
reframes this as **propositions** — a proposition is anything ACT can
investigate: a thing to establish, with an explicit proof standard, whether
it came from a regime skill, a risk pattern, an uploaded playbook, or PLAN's
own read of the document. A compliance requirement is just one *kind* of
proposition. This is the same abstraction described in the ACT research doc
(§3, §9) applied specifically to what PLAN's output schema needs to carry.

### The five proposition sources PLAN chooses among

| Source | What it is | Already exists? | Used for |
|---|---|---|---|
| **S1 — Regime skill** | Fixed compliance particulars (GDPR Art 28, HIPAA, …) | Yes — `resolve-packages.ts` | Compliance asks |
| **S2 — Doc-type / topic skill** | Structural expectations + risk patterns (`doc-types/`, `topics/vendor-risk`) | Skill layout exists; not wired as a proposition source for open-ended asks yet | "Biggest weaknesses," "what should I negotiate," "unusual/one-sided clauses" |
| **S3 — Uploaded reference document** | A user-supplied playbook or a second agreement to compare against | `extract_playbook_positions` exists as an ACT tool; not wired into PLAN's proposition generation as a first-class source | Playbook alignment, agreement-vs-agreement comparison |
| **S4 — PLAN-authored ad hoc** | A proposition PLAN writes itself, in the same shape a skill author would, from the user's own words | Does not exist yet — this is the new capability | Any question no skill anticipated |
| **S5 — External / fetched** | World knowledge for a regime/standard with no authored skill | Does not exist yet; must be fenced (§8) | Niche compliance asks with no pack |

PLAN's job, restated: for a given ask, decide which source(s) apply, and for
S4/S5, actually write the proposition + proof standard itself. Everything
downstream (ACT's INVENTORY → VERIFY → LOCK) is identical regardless of
source — that's what keeps this from becoming five different engines.

---

## 3. Where this inserts into PLAN's existing 12 steps

No step is deleted. One step gains new responsibility, one entirely new
step is added, and the follow-up step gets extended.

| Step (existing) | Change |
|---|---|
| 1. Classify intent | Unchanged mechanically, but its output must now also flag which proposition source(s) look applicable — not just `operation`/`scope` |
| 2–3. Heuristics, normalize requirements | Unchanged |
| 4. Follow-up handling | **Extended** — see §6, becomes the triage step |
| 5. Document roles | **Made first-class** — see §5.1, currently a known weak spot |
| 6. Skill selection | Unchanged mechanically, but now must select S2 (topic/doc-type) skills for open-ended asks, not only S1 regime skills |
| 7. Instruction focus | Unchanged |
| 8. Package resolution | Still S1's mechanism, untouched |
| **8a. NEW — Inventory pass** | **New step.** Before proposition generation for anything without a full S1 package match: run `classify_document` + `extract_clauses` to get a structural inventory of what's actually in the document(s). See §4. |
| **8b. NEW — Proposition generation** | **New step.** Cross-reference the inventory against S2 skill risk-patterns to generate matched propositions; for anything still uncovered, PLAN authors an S4 ad hoc proposition + proof standard directly. See §4. |
| 9. ACT graph build | Unchanged mechanically — now just also carries S2/S3/S4-sourced propositions through the same `AnalysisWorkUnit[]` shape S1 already uses |
| 10–12. Report spec, refine, inject authored reqs | Unchanged |

The two new steps (8a, 8b) are the entire net-new PLAN capability. Everything
else is the existing pipeline, either untouched or given one additional
input it didn't have before.

---

## 4. The new steps in detail

### 8a — Inventory pass (why it has to come before proposition generation)

For compliance, PLAN knows what to ask for before reading a word of the
document — Art 28 has six particulars, full stop. For "what are the biggest
weaknesses," it can't write "is the liability cap one-sided" until it knows
the document *has* a cap and what it says. So for any ask not fully covered
by S1, PLAN first runs a cheap, generic inventory pass — reusing the
existing `classify_document` and `extract_clauses` ACT tools, which are
already doc-type-driven and already generic, not new capability — producing
something like: *"termination §7, liability cap §9 (capped at 12 months'
fees), indemnification §11 (vendor→customer only), audit §14."*

This is intentionally recall-oriented and cheap — it is not judging
anything, just inventorying what clause types exist and roughly what they
say, the same discipline ACT's own INVESTIGATE stage uses for candidate
generation (deliberately the same shape, reused).

### 8b — Proposition generation (inventory-informed, not blind)

For each inventoried clause, PLAN checks it against the applicable S2
skill's risk patterns (`topics/vendor-risk`, doc-type expected-clause list).
A proposition is generated **only where there's a plausible match** — this
is what stops the alternative failure mode: running a giant fixed checklist
of "check for unlimited liability / check for broad indemnification / …"
against every document regardless of whether it's relevant. No liability cap
in the document → no liability-cap proposition generated, at all.

For anything the inventory surfaces that no S2 pattern anticipated (a
genuinely document-specific oddity, or the user's phrasing points at
something no skill covers), PLAN authors an **S4 ad hoc proposition**
itself, in the identical shape a skill author would write by hand:

```typescript
{
  hypothesis: string;        // what's being investigated, in plain language
  proofStandard: string;     // what would actually establish it — PLAN
                              // writes this from the user's own wording,
                              // same discipline as skill-authored ones
  source: 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
  priority: number;          // for Lite-mode trimming, §10 of the ACT doc
}
```

This `priority` field is also new and required — it's what lets Lite mode
trim scope by dropping lowest-priority propositions first (mandatory S1
compliance items always keep top priority; S2 risk categories rank by
authored severity/likelihood; S4 ad hoc items rank lowest by default unless
the user's phrasing makes them clearly central to the ask).

---

## 5. First-class parameters PLAN must resolve (currently implicit or missing)

These came out of working through where the system could still fail even
with the primitive/proposition model in place (§13 of the ACT research doc).
None of them require new architecture — they require PLAN to explicitly
decide and carry forward a value it currently either guesses at or doesn't
track at all.

### 5.1 Document-role resolution
Which uploaded document is the target being analyzed, which is a reference
(playbook, prior version, the "other" agreement in a comparison)? Already
exists as `resolve-document-roles.ts` but is a known weak spot — needs to be
made an explicit, surfaced-to-the-user decision (not a silent guess) for
anything beyond a single-document ask, because a wrong guess here corrupts
every proposition downstream.

### 5.2 Party perspective
"What should I negotiate," "does the liability cap adequately protect the
customer" — these are only meaningful from **one side's** point of view.
Without capturing this, PLAN generates generic, unopinionated propositions
instead of ones scoped to the user's actual side. New field on `intent`:
`partyPerspective: string` (which named party in the document the user
represents) — inferred from context where possible, asked when genuinely
ambiguous.

### 5.3 Frame-fit check
"Is this GDPR compliant" asked of a document that isn't a DPA at all. Before
generating any S1 propositions, a cheap check: does the classified doc-type
actually match the frame being asked about? If not, PLAN should say so
directly ("this doesn't appear to be a DPA — did you mean to ask about
[actual doc-type]?") instead of confidently investigating the wrong frame.

### 5.4 Surfaced skill selection
Wrong doc-type detection → wrong S2 risk patterns selected → confident
investigation of the wrong things, silently. The detected doc-type and
active skill set should be surfaced to the user as part of the run (not
just logged internally) and correctable — this turns a silent
misclassification into a visible, fixable one.

### 5.5 Lock invalidation on document version
If a follow-up turn includes a revised document, PLAN must not reuse
prior-turn locked facts that depended on the old version. New field to
track: a document version/hash keyed alongside each locked assessment, so
follow-up triage (§6) can tell "still valid" from "must re-investigate."

---

## 6. Follow-up handling — the triage step

`follow-up-intent.ts` exists today for presentation changes only ("show that
as a table instead"). It needs to become the general triage point for every
follow-up, deciding one of three things before anything else runs:

1. **Answerable from what's already locked** — pure re-render, no new ACT
   work. ("Focus on subprocessors" after a full GDPR sweep — just re-scope
   which already-locked rows to foreground.)
2. **One narrow addition** — a genuinely new question, but answerable by
   adding one or two new propositions to the existing locked set without
   re-running everything. ("Can we object to a subprocessor change?" — one
   new S4 proposition, investigated narrowly, added to the same locked set.)
3. **Real re-plan** — rare; a follow-up broad enough, or working from a
   revised document (§5.5), that the existing locked set isn't a valid
   starting point.

This requires the conversation to persist the full locked
finding/assessment set across turns (not just chat history text) — that
persisted set is what "conversational memory" actually is here, not the
model remembering prose.

---

## 7. What stays entirely ACT's job (explicitly out of scope for PLAN)

Keeping this boundary crisp is what keeps ACT a bounded executor rather than
re-opening the "LLM freedom without a deterministic boundary" problem:

- PLAN decides **what** to investigate (propositions) and **who supplies the
  standard** (source). It never decides whether a specific passage proves a
  specific proposition — that's VERIFY's job, always, regardless of source.
- PLAN does not read raw evidence text itself beyond the cheap inventory
  pass (8a) — it works from structure (clause types, doc roles), not from
  judging content.
- The one narrow exception: ACT's single hard-capped expansion hop (chase
  one annex reference mid-investigation) is an ACT-internal escape hatch,
  not PLAN re-planning — it's logged as its own auditable work unit, capped
  at one hop, not open-ended.

---

## 8. External knowledge (S5) — PLAN's specific responsibility here

For a niche ask with no S1/S2 pack (e.g., a jurisdiction's data-protection
law with no authored skill), PLAN's job is specifically:
1. Recognize no S1/S2 source covers the ask.
2. Fetch/derive the external standard and crystallize it into a
   **provisional pack** — cached, inspectable — rather than a raw live call
   folded silently into the run.
3. Attach an honest confidence tier to it, carried through to RENDER, so the
   user sees "no authored pack for this — investigated using general
   principles, verify against primary law" rather than a confidently
   presented result indistinguishable from an authored-pack one.

The fetched material becomes a proposition/proof-standard source only — it
never becomes document evidence (that discipline lives in ACT, but PLAN is
what decides *when* S5 gets invoked at all).

---

## 9. Existing PLAN bugs this must not reintroduce

From your own reference doc's PLAN known-issues table — carried forward as
constraints on the redesign, not problems the redesign is expected to
silently fix as a side effect unless explicitly addressed above:

| Issue | Addressed by this redesign? |
|---|---|
| Intent misclassification (NDA/commercial → wrong operation) | Not directly — still a classify-intent tuning problem, orthogonal to the proposition-source work |
| Keyword triggers ("identify" → extraction) | Same — orthogonal, needs its own attention |
| `depth` (intent) vs PAC deep mode confusion | Not addressed here — a naming/documentation clarity issue, separate fix |
| **Package-only resolution → `not_supported`** | **Yes — directly fixed.** This is the exact problem S2/S4 propositions solve. |
| Risk category over-selection (focus LLM) | Partially — the inventory-informed proposition generation (only generate where the inventory shows a plausible match) should reduce this, but worth explicitly re-testing |

---

## 10a. Self-critique — known gaps in the design above (not yet resolved)

Stress-testing §1–§9 against harder cases surfaced real gaps. These are not
resolved yet — they're recorded here so implementation doesn't start on a
version of this design that looks more finished than it is.

**Gap 1 — the proposition schema doesn't thread party perspective through.**
`partyPerspective` was added as an `intent`-level field (§5.2), but nothing
in §4's proposition shape actually consumes it. "Is the liability cap
adequate" is meaningless without "adequate for whom" — `partyPerspective`
needs to flow into every generated proposition's `proofStandard`, not sit
next to the proposition list unread. **Fix:** proposition generation (8b)
must read `partyPerspective` and bake it into `baselineComparison`-style
proof standards, not just into the report tone at render time.

**Gap 2 — no field captures the user's stated exhaustiveness.** `priority`
exists only to let Lite mode trim scope under a *system* cost budget. It
does nothing for a user who says "just the top 3 risks" or "skip drafting
nitpicks, only things that could actually bite us" — that's a *content*
instruction, not a cost control, and today has nowhere to live. **Fix:** add
`exhaustiveness`/`stoppingCriterion` to `intent`, separate from Lite/Deep.

**Gap 3 — decomposition into independent propositions can lose compounding
risk.** A narrow liability cap, broad indemnification, and weak termination
rights might each verify as individually tolerable, while *together* they're
a bad deal — no single proposition or pairwise COMPARE catches that; this is
the standard failure mode of any decomposition-based reasoning approach, and
naming it honestly matters more than pretending the primitive set already
covers it. **Fix:** a sixth primitive, **P5 — SYNTHESIZE**, runs once after
LOCK, over the full locked set (never raw document text), explicitly
prompted to surface cross-cutting/compounding patterns. Still bounded — it
composes relationships between already-verified facts, it does not invent a
new one.

**Gap 4 — not everything should pay full proposition+VERIFY overhead.**
Narrow factual asks ("what is the termination notice period") aren't
contested claims — running them through proposition generation and full
entailment verification is overhead built for adjudication, wasted on a
plain lookup, and would make the highest-volume, simplest query type slower
for no correctness gain. Pure summarization is a category error to force
into "propositions to prove" at all — it's compression, not investigation.
**Fix:** both stay (or become) distinct `operation` values at classify-intent
that route around the proposition machinery entirely — a lightweight
locate-and-quote path for narrow factual, direct compression for summarize.
"General" should not mean "one mechanism for everything."

**Gap 5 — the five sources are not provably exhaustive.** Two cases don't
fit cleanly: a "what changed between this version and the last" ask needs
the prior version of the *same* document as a source (S3-shaped, but needs
diffing, not independent re-verification); and S5 as written conflates
primary-law text (fetchable, quotable, higher confidence) with
interpretive/market-practice knowledge ("what's a typical cap in this
industry" — much lower confidence, easier to be confidently wrong about).
**Likely fix:** split S5 into S5a (primary source text) and S5b
(interpretive/market knowledge, always carrying the lower confidence label);
treat version-diffing as its own comparison variant. **Why this doesn't
reopen the N+1 problem this design exists to avoid:** sources are about the
*epistemic origin* of a claim standard — a small, slow-changing category —
not about topic, which is genuinely unbounded. Every gap found here is a
refinement of an existing source, not a new category. The **primitives**
(inventory, verify, compare, consistency-check, prioritize, and now
synthesize) are the part actually closed by construction — they're the only
operations you can perform on evidence. The source list should be expected
to need periodic revisiting; the primitive list shouldn't.

**Gap 6 — ambiguous proposition generation has nowhere to go.** If the
inventory plausibly matches more than one risk pattern and it's genuinely
unclear which the user means, PLAN should not silently pick one. **Fix:**
ASK's trigger condition (currently just "missing clarifications" from
classify-intent) needs to explicitly include "proposition generation
produced more than one plausible interpretation" as a trigger into ASK.

None of these invalidate the core two-axis position (general content via a
closed primitive set, bounded control) — the competitor evidence in the ACT
research doc still supports that split. What's not settled is the specific
proposition schema and source taxonomy in §2–§4 above; treat those as a
first draft to be revised per this section before implementation starts, not
as agreed final shape.

---

## 10b. Why this waits for the ACT phases (sequencing)

An S4 ad hoc proposition's proof standard is PLAN's own invention, generated
per-question rather than authored and reviewed by a skill author ahead of
time — meaning it's inherently the least reliable proposition source. That
makes it entirely dependent on VERIFY (ACT Phase 4 onward) already being
trustworthy on authored proof standards before it's asked to also grade
PLAN-invented ones. Building PLAN's proposition generation before ACT's
VERIFY is proven would mean testing two new, unproven mechanisms against
each other simultaneously — exactly the "can't tell which fix worked"
problem the phased plan exists to avoid. Per the phase plan, this is Phase
11 onward, after ACT Phases 1–10 pass on both Cisco (Art 28) and NDA.
