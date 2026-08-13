# GDPR Article 28 DPA skill (v1.1)

## Scope
Data Processing Agreements under GDPR Article 28 — processor obligations, subprocessors,
transfers, audit rights, and **Chapter III data-subject rights assistance** (Arts 15–22)
plus the Art 12(3) response timeframe.

## What good looks like
- Documented instructions-only processing, confidentiality commitments, subprocessor flow-down,
  breach notification assistance, and audit rights.
- An assistance clause that **names** Chapter III rights (access, rectification, erasure,
  restriction, recipient notification, portability, objection, automated decisions) rather than
  a catch-all “data subject requests.”
- A **numeric** response timeframe aligned with Art 12(3) (one month, extendable by two), not
  “promptly” or “reasonably” alone.
- Mid-term erasure (Art 17) distinct from deletion-on-termination.
- Portability format (structured, commonly used, machine-readable) if Art 20 is in scope.
- Art 19 recipient / subprocessor notification where rectification, erasure, or restriction
  is supported.

## Rights matrix (Arts 15–22)
Evaluate each right against `data_subject_request_handling` and
`processor_assistance_obligation` (fallback: `data_protection`):

| Right | Article | Named vs generic |
|---|---|---|
| Access | 15 | Named if access / copy of personal data is express |
| Rectification | 16 | Named if correction / inaccuracy is express |
| Erasure | 17 | Named if erasure / right to be forgotten is express *during the term* |
| Restriction | 18 | Named if restriction of processing is express |
| Notification to recipients | 19 | Named if the processor must notify subprocessors / recipients |
| Portability | 20 | Named if structured / machine-readable export is express |
| Object | 21 | Named if objection to processing is express |
| Automated decisions | 22 | Named if ADM / profiling disclosure or human review is express |

`addressed_generic` = only a catch-all DSR / cooperation clause. `not_addressed` = silence.

## Legal hooks (copy into the memo; do not LLM-cite)
- **Art 28(3)(e):** EDPB Guidelines 07/2020, para 121 — generic DSR language may meet the spirit
  but not the letter of Art 28(3)(e).
- **Art 12(3):** Controller remains liable under Art 12(3) / Art 83(5)(b) even where the
  processor’s own language is vague.

## Red flags
- Missing processor obligation to assist with data subject requests.
- DSR clause that never names Arts 15–22.
- No timeframe, or only “promptly” / “as soon as reasonably practicable.”
- Erasure only on termination (no mid-term Art 17 path).
- Assistance gated on extra fees or controller consent in a way that can blow the one-month clock.
- Subprocessor changes without prior notice or objection rights.
- No transfer mechanism for international data flows.
