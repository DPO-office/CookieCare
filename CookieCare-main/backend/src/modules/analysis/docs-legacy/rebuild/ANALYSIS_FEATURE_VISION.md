# LORA Analysis — What We're Building (End-to-End Vision)

> **Purpose:** Self-contained context for a fresh session. If you need the
> full bug-history and technical root-cause detail behind *why* the current
> implementation doesn't meet this vision yet, see the companion document
> `ACT_PHASE_REDESIGN_RESEARCH_BRIEF.md` — this document is the "what and
> why," that one is the "what's broken and what's been tried."

---

## 1. The mission, in one paragraph

A lawyer uploads a legal document — DPA, NDA, MSA, SLA, or anything else —
and asks a question in plain language, the way they'd ask a colleague. The
system understands what they actually want, investigates the document(s)
accordingly, and gives back an answer a senior associate would sign off on:
correct, evidence-backed, appropriately structured for the question asked.
The point is to give lawyers back the hours they currently spend manually
reading contracts to answer exactly these questions — not to replace their
judgment, but to do the first-pass reading and evidence-gathering fast and
correctly so their time goes to judgment, not searching.

## 2. The bar we're aiming for

**General-purpose legal reasoning over documents, the way ChatGPT or Gemini
are general-purpose reasoning agents — but scoped to the legal domain and
held to a much higher correctness standard**, because a wrong answer here
isn't an inconvenience, it's a missed compliance gap or a bad negotiating
position. Concretely: a user should be able to ask a question the system has
never been explicitly built to handle, and the system should figure out what
investigation that question actually requires — not fail, not fall back to a
generic template, and not need an engineer to have anticipated that exact
question in advance.

**Acceptance standard: don't build support for individual prompts. Build a
system that can discover and execute the appropriate investigation for
document-analysis questions it has never explicitly seen before.** If the
only way a new question type works is because someone added code for it,
that's the wrong layer of fix — the reasoning capability has to be general,
and only domain knowledge (what GDPR requires, what HIPAA requires) should be
question-specific.

## 3. The full range of questions this needs to handle

**Open-ended:**
"What are the biggest weaknesses in this contract?" / "What are the biggest
legal/commercial risks?" / "What should I negotiate?" / "Find unusual,
one-sided, or unfavorable clauses." / "Find contradictions or
inconsistencies." / "Which of these two agreements is more favorable, and
why?" / "What obligations does each party have?"

**Compliance:**
"GDPR Article 28 compliance review." / "GDPR Articles 15–22 data-subject
rights." / "GDPR Articles 33–34 breach obligations." / "International
transfer compliance." / "Security obligations." — and any other regime a
skill has been authored for, per the same pack model already built for the
Drafting module.

**High-level / ambiguous** (the system has to infer the actual investigation,
not wait for a precise spec):
"Is this DPA GDPR compliant?" / "Does this agreement adequately protect
personal data?" / "Is this contract safe from a GDPR perspective?"

**Narrow factual** (should get a simple, direct answer — not a full report):
"What is the termination notice period?" / "Who is the controller?" / "How
long does the agreement remain in force?" / "What happens to data after
termination?"

**Reasoning** (requires finding multiple clauses, comparing them, and
concluding — not just retrieving one clause):
"Is termination balanced?" / "Does the liability cap adequately protect the
customer?" / "Is the vendor's data-use permission broader than necessary?"

**Multi-document:**
"Compare these agreements." / "Find inconsistencies across the MSA, DPA, and
SOW." / "Determine each party's obligations across multiple documents."

**Follow-ups, with real conversational memory** — not a reset to a generic
report every time:
```
"Analyze GDPR compliance"
→ "Focus on subprocessors"
→ "Can we object to a subprocessor change?"
→ "What should we negotiate on that clause?"
```
Each follow-up should build on what's already been established, the same way
a colleague would keep the thread rather than re-explaining from scratch.

## 4. Output has to match the question, not a template

A narrow factual question gets a short, direct answer. A compliance ask gets
a stable, checklist-shaped table. An open-ended risk question gets narrative
analysis, not a table forced onto something that isn't naturally tabular. A
negotiation question gets action-oriented recommendations. The system needs
to genuinely support: narrative, table, executive summary, detailed counsel
memo, evidence-focused direct answer, and negotiation/action recommendations
— and choose among them based on what was actually asked and what the
analysis actually found, not a fixed per-module template. This is one of the
concrete, current failure modes worth being explicit about: today, most asks
— even open-ended ones — collapse into the same "Executive Summary → Scope →
Requirements → Gaps → Recommendations → Conclusion" shape. That's acceptable
for a compliance checklist ask. It's wrong for "what should I negotiate."

## 5. Non-negotiable grounding rules

These aren't aspirational — they're the difference between a tool a lawyer
can rely on and one they can't, and they're the rules that have been hardest
to actually hold onto in practice so far.

**Relevant is not proof.** Termination language is not automatically evidence
of duration. Security language is not automatically evidence of
confidentiality. Data-subject-rights language is not automatically evidence
of data-subject *categories*. This sounds obvious stated plainly — it has
been the single hardest thing to actually enforce in the current
implementation, and it's the primary open problem, not a solved one.

**Evidence must be traceable.** Every substantive claim needs: which
document, which section/clause, the exact evidence text, and how that
evidence actually relates to the claim being made. Not just "the answer,"
but the chain that justifies it.

**Absence must be established carefully.** "No evidence found" is not the
same claim as "this clause is absent from the document." Don't report a
contractual gap without having actually looked hard enough to be confident
it's genuinely absent, not just unfound.

**Analytical layers stay separate, and don't collapse into each other:**
```
Fact → Evidence → Claim/Observation → Interpretation → Judgement
→ Risk → Recommendation → Synthesis → Presentation
```
A risk annotation is not a compliance judgement. An interpretation is not a
verified fact. Conflating these layers is exactly how a report ends up
internally contradictory — a row marked "Strong" whose own rationale says the
document doesn't establish the thing being tested.

**Risk must never silently become compliance truth.** Compliance evidence
drives compliance judgements. Risk evidence drives risk/materiality
annotations. A risk finding is allowed to sit alongside a compliance
conclusion — it's never allowed to overwrite one.

## 6. Architecture direction — dynamic, but inside a deterministic boundary

The core principle carried over from everything decided so far:

> **LLM freedom inside a deterministic execution boundary.**

The reasoning layer (what to investigate, which capabilities to use, when
enough evidence has been gathered, how to structure the output) should be
genuinely dynamic — an LLM/supervisor deciding these things per-question, not
a fixed workflow per document type. But that freedom is bounded by hard,
code-owned limits: time, token budget, tool-call limits, iteration limits,
delegation depth, which capabilities are even reachable, provenance rules
(every claim traceable to real evidence), state/schema validation, and clear
termination conditions. This is the same shape of decision already made for
the Drafting module — PAC's outer loop stays deterministic in TypeScript,
dynamism is scoped to a bounded inner layer, not the whole system — applied
here to ACT specifically rather than to Drafting's outer PLAN→ACT→CRITIQUE
loop, since ACT is the phase that actually needs to investigate a genuinely
open-ended space.

Compliance stays a specialization of the same generic runtime, not a
separate code path: a GDPR skill supplies legal questions, requirements,
evidence guidance, and evaluation criteria — the engine underneath is the
same one that handles an open-ended risk question.

**One important caution, worth stating explicitly:** the fix is not simply
"add more verification/retry/critique loops on top of what exists." A
verification step can catch a specific bad answer locally, but it cannot
substitute for the system actually having a correct model of what it's doing
— what it's trying to establish, what evidence it needs, what that evidence
actually establishes, what remains genuinely uncertain, and what conclusion
follows from all of that. Verification is necessary but not sufficient — the
deeper requirement is that the analytical model itself (the layers in §5) is
structurally correct, so there's something real for verification to check
against.

## 7. Where we're headed, relative to what already exists

**Harvey** is the closest comparison in ambition — general-purpose legal AI,
handling open-ended questions across document types, not a single fixed
workflow. Worth knowing: Harvey's own internal Assistant product moved to a
fully agentic architecture, but for organizational reasons (many teams
independently shipping capabilities into one shared surface) — not because
agentic execution is inherently more *correct*. Their own client-facing
product for firms (Workflow Builder) is explicitly deterministic
(DAG-based), because firms need governed, repeatable structure — which
lines up with the "dynamic but bounded" principle in §6 rather than
contradicting it.

**LexLegis (`app.lexlegis.ai/interact`)** is the closest direct competitor —
same space, similar positioning (their MIRA product markets itself as
running a process — planning, skill selection, verification — rather than
just answering). Direct feature/UX comparison target.

**OpenContracts** is a different category and worth being precise about that:
it's an open-source **document intelligence substrate**, not a compliance-
chat competitor. It's an annotation/citation graph — documents wired to the
specific sections of law they cite — exposed over an API for both humans and
AI agents (including an MCP server), meant to be built on top of, not a
finished product answering legal questions end-to-end. The useful thing to
take from it isn't "compete with it," it's the idea of a **citation graph as
a first-class artifact** — every claim traceable not just to a quote in the
document, but to the actual section of law that quote relates to, inspectable
and reusable rather than regenerated from scratch on every question. That's
a genuinely useful pattern for the evidence-traceability requirement in §5,
worth evaluating as a design input even though OpenContracts itself isn't a
competitor in the product sense.

## 8. What "done" looks like

A lawyer can upload any legal document, ask any legal question about it in
their own words — specific or vague, narrow or open-ended, about one document
or several — get back an answer with the right shape and genuinely correct,
traceable evidence, ask a natural follow-up without losing context, and trust
the answer enough to act on it without independently re-reading the whole
document first. That last part is the actual product: time given back, not
time spent double-checking the tool.
