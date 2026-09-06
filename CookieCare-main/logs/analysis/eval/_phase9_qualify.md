# Phase 9 — Regression Qualification Report

Generated 2026-09-06T07:27:41.237Z from 3 run(s): an_9922f418-61f0-4a20-87dc-0e93611ce38e, an_7a536dd3-7984-4f2c-9db5-41fc414bd39c, an_4fa11225-3e5f-47ff-bdf2-93a1c5075023

> "Expected evidence" is not filled in automatically — confirm it against the source document and the reviewed requirement definition per plan §5.2, then check off Pass/Fail rows below by hand where marked FAIL for reasons other than a hard invariant violation.

## an_9922f418-61f0-4a20-87dc-0e93611ce38e

Total duration: 103448 ms

| Requirement | Expected evidence | Retrieved evidence | Bundle evidence | Verified element states | Calculated status | Locked status | Rendered status | Pass/fail |
|---|---|---|---|---|---|---|---|---|
| art28_3_a_instructions | _(human review)_ | 25 | 45 | A1=supported, A2=supported | present | accepted | present | PASS |
| art28_3_b_confidentiality | _(human review)_ | 29 | 37 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| art28_3_c_security | _(human review)_ | 25 | 32 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| art28_3_d_subprocessors | _(human review)_ | 19 | 39 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| art28_3_e_dsr_assistance | _(human review)_ | 17 | 28 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| art28_3_f_security_assistance | _(human review)_ | 29 | 49 | F1=supported, F2=supported, F3=supported | present | accepted | present | PASS |
| art28_3_g_deletion_return | _(human review)_ | 33 | 40 | G1=not_located, G2=supported, G3=not_located, G4=supported | partial | accepted | partial | PASS |
| art28_3_h_audit | _(human review)_ | 24 | 44 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| art28_4_subprocessor_flow_down | _(human review)_ | 18 | 38 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| controller_obligations_rights | _(human review)_ | 34 | 38 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| data_categories | _(human review)_ | 40 | 42 | CD1=supported | present | accepted | present | PASS |
| data_subject_categories | _(human review)_ | 38 | 43 | DS1=supported | present | accepted | present | PASS |
| duration | _(human review)_ | 23 | 43 | DU1=supported | present | accepted | present | PASS |
| nature_purpose | _(human review)_ | 16 | 25 | NP1=supported, NP2=supported | present | accepted | present | PASS |
| subject_matter | _(human review)_ | 34 | 41 | SM1=supported | present | accepted | present | PASS |

### Activation gate (mechanically checkable subset)

- All planned requirements terminal (live ACT reconciliation): ❌ (missing: subject_matter, duration, nature_purpose, data_categories, data_subject_categories, controller_obligations_rights)
- No exact-quote-check failures (in-scope requirements only): ✅
- No duplicate canonical rows: ✅
- No orphan structural nodes: ✅
- Failure states are explicit (no silent gap, in-scope requirements only): ✅
- **Mechanical gate: FAIL**

_Not evaluated by Phase 4B/5/6/7 (no authored element schema yet — plan §4A scope boundary, not a defect): art28_3_b_confidentiality, art28_3_c_security, art28_3_d_subprocessors, art28_3_e_dsr_assistance, art28_3_h_audit, art28_4_subprocessor_flow_down, controller_obligations_rights_

Not mechanically checkable here — requires human sign-off: reviewed golden statuses match; production latency target met at the agreed percentile across concurrent runs (see `compliance.run.timing` across a batch, not a single run).

## an_7a536dd3-7984-4f2c-9db5-41fc414bd39c

Total duration: 124554 ms

| Requirement | Expected evidence | Retrieved evidence | Bundle evidence | Verified element states | Calculated status | Locked status | Rendered status | Pass/fail |
|---|---|---|---|---|---|---|---|---|
| art28_3_a_instructions | _(human review)_ | 25 | 45 | A1=supported, A2=supported | present | accepted | present | PASS |
| art28_3_b_confidentiality | _(human review)_ | 29 | 37 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| art28_3_c_security | _(human review)_ | 25 | 32 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| art28_3_d_subprocessors | _(human review)_ | 19 | 39 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| art28_3_e_dsr_assistance | _(human review)_ | 17 | 28 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| art28_3_f_security_assistance | _(human review)_ | 29 | 49 | F1=supported, F2=supported, F3=supported | present | accepted | present | PASS |
| art28_3_g_deletion_return | _(human review)_ | 33 | 40 | G1=not_located, G2=supported, G3=not_located, G4=supported | partial | accepted | partial | PASS |
| art28_3_h_audit | _(human review)_ | 24 | 44 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| art28_4_subprocessor_flow_down | _(human review)_ | 18 | 38 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| controller_obligations_rights | _(human review)_ | 34 | 38 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| data_categories | _(human review)_ | 40 | 42 | CD1=supported | present | accepted | present | PASS |
| data_subject_categories | _(human review)_ | 38 | 43 | DS1=supported | present | accepted | present | PASS |
| duration | _(human review)_ | 23 | 43 | DU1=supported | present | accepted | present | PASS |
| nature_purpose | _(human review)_ | 16 | 25 | NP1=supported, NP2=supported | present | accepted | present | PASS |
| subject_matter | _(human review)_ | 34 | 41 | SM1=supported | present | accepted | present | PASS |

### Activation gate (mechanically checkable subset)

- All planned requirements terminal (live ACT reconciliation): ❌ (missing: subject_matter, duration, nature_purpose, data_categories, data_subject_categories, controller_obligations_rights)
- No exact-quote-check failures (in-scope requirements only): ✅
- No duplicate canonical rows: ✅
- No orphan structural nodes: ✅
- Failure states are explicit (no silent gap, in-scope requirements only): ✅
- **Mechanical gate: FAIL**

_Not evaluated by Phase 4B/5/6/7 (no authored element schema yet — plan §4A scope boundary, not a defect): art28_3_b_confidentiality, art28_3_c_security, art28_3_d_subprocessors, art28_3_e_dsr_assistance, art28_3_h_audit, art28_4_subprocessor_flow_down, controller_obligations_rights_

Not mechanically checkable here — requires human sign-off: reviewed golden statuses match; production latency target met at the agreed percentile across concurrent runs (see `compliance.run.timing` across a batch, not a single run).

## an_4fa11225-3e5f-47ff-bdf2-93a1c5075023

Total duration: n/a ms

| Requirement | Expected evidence | Retrieved evidence | Bundle evidence | Verified element states | Calculated status | Locked status | Rendered status | Pass/fail |
|---|---|---|---|---|---|---|---|---|
| art28_3_a_instructions | _(human review)_ | 21 | 22 | A1=supported, A2=supported | present | accepted | (not rendered) | FAIL (no_rendered_row_for_accepted_lock) |
| art28_3_b_confidentiality | _(human review)_ | 26 | 27 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| art28_3_c_security | _(human review)_ | 29 | 31 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| art28_3_d_subprocessors | _(human review)_ | 20 | 40 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| art28_3_e_dsr_assistance | _(human review)_ | 25 | 25 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| art28_3_f_security_assistance | _(human review)_ | 30 | 30 | F1=supported, F2=supported, F3=not_located | partial | accepted | (not rendered) | FAIL (no_rendered_row_for_accepted_lock) |
| art28_3_g_deletion_return | _(human review)_ | 18 | 24 | G1=supported, G2=supported, G3=supported, G4=supported | present | accepted | (not rendered) | FAIL (no_rendered_row_for_accepted_lock) |
| art28_3_h_audit | _(human review)_ | 31 | 34 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| art28_4_subprocessor_flow_down | _(human review)_ | 29 | 31 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| controller_obligations_rights | _(human review)_ | 31 | 35 | (none) | (none) | (no decision) | (not rendered) | N/A (no element schema) |
| data_categories | _(human review)_ | 27 | 29 | CD1=supported | present | accepted | (not rendered) | FAIL (no_rendered_row_for_accepted_lock) |
| data_subject_categories | _(human review)_ | 34 | 36 | DS1=supported | present | accepted | (not rendered) | FAIL (no_rendered_row_for_accepted_lock) |
| duration | _(human review)_ | 23 | 26 | DU1=supported | present | accepted | (not rendered) | FAIL (no_rendered_row_for_accepted_lock) |
| nature_purpose | _(human review)_ | 24 | 25 | NP1=supported, NP2=supported | present | accepted | (not rendered) | FAIL (no_rendered_row_for_accepted_lock) |
| subject_matter | _(human review)_ | 25 | 28 | SM1=supported | present | accepted | (not rendered) | FAIL (no_rendered_row_for_accepted_lock) |

### Activation gate (mechanically checkable subset)

- All planned requirements terminal (live ACT reconciliation): ✅
- No exact-quote-check failures (in-scope requirements only): ✅
- No duplicate canonical rows: ✅
- No orphan structural nodes: ✅
- Failure states are explicit (no silent gap, in-scope requirements only): ✅
- **Mechanical gate: PASS**

_Not evaluated by Phase 4B/5/6/7 (no authored element schema yet — plan §4A scope boundary, not a defect): art28_3_b_confidentiality, art28_3_c_security, art28_3_d_subprocessors, art28_3_e_dsr_assistance, art28_3_h_audit, art28_4_subprocessor_flow_down, controller_obligations_rights_

Not mechanically checkable here — requires human sign-off: reviewed golden statuses match; production latency target met at the agreed percentile across concurrent runs (see `compliance.run.timing` across a batch, not a single run).
