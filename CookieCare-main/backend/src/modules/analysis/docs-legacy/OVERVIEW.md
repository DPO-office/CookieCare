# Analysis — current state & objective

> Full line-by-line module map (phases, files, status axes, fidelity gaps, Cisco audit ladder): [`ANALYSIS-MODULE-DEEP-DIVE.md`](./ANALYSIS-MODULE-DEEP-DIVE.md).
> Live PLAN→ACT walkthrough for the Art 28 tabular ask (and how open risk asks differ): [`PLAN-ACT-WALKTHROUGH-ART28-AND-RISK.md`](./PLAN-ACT-WALKTHROUGH-ART28-AND-RISK.md).
> Point 1 forensic (evidence → judgement → aggregation integrity): [`ANALYSIS-POINT-1-EVIDENCE-JUDGEMENT-AGGREGATION-FORENSIC.md`](./ANALYSIS-POINT-1-EVIDENCE-JUDGEMENT-AGGREGATION-FORENSIC.md).
> **Point 1 fix landed:** canonical requirement identity + whole-article-only risk fallback + compliance/risk judgement split — see `shared/requirement-identity.ts` and golden `capabilities/act/__fixtures__/canonical-requirement-aggregation.test.ts`.

Counsel-facing document review: upload a contract (or set of docs), ask a question, get a grounded memo or table — not a raw findings dump.

## Objective

Turn an instruction + documents into a **faithful, usable legal answer**:

- Statuses and quotes come from the reviewed text (or clear annex/SOW pointers), not inventiveness.
- User sees counsel language (Strong / Present & adequate / Present, particulars in schedule / Minor drafting gap / Gap / Cannot determine), not internal enums.
- Narrative vs tabular output matches what the user asked for.
- Latency stays tolerable; the final report streams as it is written.

## Pipeline (now)

| Mode | Flow |
|------|------|
| **Lite** | `PLAN → ACT → DONE` |
| **Deep** | `PLAN → ACT → AUDIT → DONE` |

Neither mode re-enters ACT. Critique redo loops are retired; deep adds a grounding **AUDIT** only.

1. **PLAN** — classify intent, select skills/packages, build the ACT graph and report outline.
2. **ASK** — pause only when critical clarifications are required.
3. **ACT** — extract shared evidence → evaluate packages (hypothesis + isolated candidates) → aggregate locked assessments → **ground** → analytical synthesis → **render**.
4. **AUDIT** (deep) — deterministic grounding + optional verification notes; does not rewrite findings.
5. **DONE** — persist conversation / release the final report.

**Three layers**

- **Canonical findings** = what is true (compliance, evidence state, rec kind).
- **Analytical synthesis** = what it means (themes, significance, residual uncertainty). May interpret; must not change status.
- **Renderer** = how to tell the user.

## What we are optimizing right now

- **Evidence fidelity** — one requirement’s quote must not bleed onto sibling rows.
- **Status honesty** — two-axis model: compliance vs evidence vs drafting. A floating annex pointer is not Present and not a Minor drafting gap. NLI is not compliance.
- **Tabular UX** — section-scoped tables, no mega-table dump, no `—` placeholders.
- **Streaming** — when “Writing the report…” starts, section text streams in outline order while sections still generate in parallel.
- **Speed** — few fat parallel model calls: package evals in parallel, one analytical synthesis on locked rows, then parallel section writes.

## Non-goals (for this feature)

- Generic handlers do not hard-code GDPR/NDA tokens; law lives in skills.
- Critique is frozen — deep ≠ retry/rewrite loop.
- Analysis does not replace counsel judgment or invent obligations from missing annexes.

## Success looks like

A re-run Art 28 (or similar) review where each table row has **its own** status, evidence, and finding; the memo interprets the locked rows; and the final text matches what counsel would expect from the extracts provided.
