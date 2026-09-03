# Live eval - CookieCare Analyze - 2026-09-03 - Lite only

Iteration: post-Phase-2/next-phase live re-test  
Mode: `lite` only (`enableDeepCritique=false`, `maxTier2Attempts=0`, `maxReplans=0`)  
Server: restarted with `npm run dev` from `C:\Program Files\CookieCare\CookieCare-main`  
Target: `Mastercard_Data_Processing_Agreement.pdf` (`doc_f453ff12-4bbd-4239-978f-9647e5875ee2`)  
Reference for compound run: `DPA_AI_Prompt_Repository_Playbook.docx.pdf`, explicitly marked as playbook/reference  
Execution: visible in-app browser plus backend console and per-session trace inspection  

> **Gate result: FAIL.** The focused Article 28 path is materially improved and PLAN is now correct, but Lite still converts verifier timeouts into contractual uncertainty, accepts cross-section evidence, and releases an answer that incorrectly says mandatory duties cannot be determined even though the DPA contains relevant clauses.

## Results at a glance

| ID | Scope | Session | Wall time | Work units | Tokens | Shape | Grounding | Verdict | Primary failing layer |
|---|---|---|---:|---:|---:|---|---|---|---|
| L1 | Article 28 + playbook + top-five risks | `an_8c58c5a5-0e9c-46e4-b897-c56e12efb348` | 235.715 s | 38 | 53,628 | Poor | Poor | **Fail** | ACT timeouts/locator failures, then LOCK/RENDER misclassification |
| L2 | Article 28 only | `an_b527b70a-405c-4f01-87b3-5beceb8317a0` | 177.528 s | 9 | 37,802 | Readable | Partial | **Fail** | ACT timeouts and scope contamination, then incomplete LOCK/RENDER |

Browser console errors/warnings: **none**. The failures are backend analysis-pipeline failures, not frontend JavaScript crashes.

## Environment and document-selection finding

The first API-harness attempt selected the newest database record named `Mastercard_Data_Processing_Agreement.pdf`. That duplicate contained raw `%PDF`/compressed stream bytes as its stored text (`532,159` characters, only 13 corrupted segments), so every answer degraded to insufficient evidence. This was not a valid product-quality run.

The visible browser run selected the Vault copy with clean extracted text (`124,593` characters, 426 segments; ACT produced 172 clauses in the compound run). All verdicts below use this clean document.

Required fix: document lookup and evaluation fixtures must use immutable document IDs and reject/quarantine records whose extracted content fails a text-quality check. Selecting "latest by title" is unsafe when duplicate uploads exist.

---

## L1 - Compound Lite run

### Prompt

Check this DPA for GDPR Article 28 compliance — subject matter, duration, nature and purpose, data categories and data subjects, and whether the mandatory Article 28(3) processor obligations are present and adequate. Also check it against our uploaded playbook. Separately, rank the top 5 customer-side onboarding risks (liability, audit, subprocessors, termination, transfers) with evidence from the DPA.

### Runtime evidence

- Job: `6c7f418d-b0c8-43d3-b433-d1181d3261ff`
- Session: `an_8c58c5a5-0e9c-46e4-b897-c56e12efb348`
- Trace: `logs/analysis/an_8c58c5a5-0e9c-46e4-b897-c56e12efb348.log`
- PLAN: correctly classified `compliance_check`, `regime_compliance_memo`, DPA, Article 28, compound with two sub-intents; mapped all seven user requirements.
- ACT: expanded to 38 units and sent about 121k-123k prompt characters per candidate-selection call over a 219-section pool.
- ACT completion: 205.940 s, 35 findings, 53,628 tokens.
- CRITIQUE-LITE: `structurallyValid=false`, 35 issues: locator 13, requirement-ID stamp 10, taxonomy 10, report output 1, outline analysis 1.
- Release: `release_with_limitations`, reason `blocked_by_budget`; no repair was available in Lite (`maxTier2Attempts=0`).

### User-facing faults

1. Many rows say `Insufficient data` because candidate verification exceeded the 45-second timeout. This is an execution failure, not evidence that the contract is silent.
2. Favorable customer provisions are mislabeled as `Gap`, including uncapped data-protection liability (cl. 3.10.1) and 60-business-day subprocessor notice with objection/termination rights (cl. 3.8.7).
3. The compliance table repeats generic categories such as `Mandatory processing agreement particulars` and `Documented instructions-only processing` instead of one row per requested Article 28 element.
4. Playbook items use opaque names such as `Playbook Pp 839e1538 Gap`, and some target quotations are truncated or point to the wrong clause.
5. The bottom line is more balanced than the table, but the answer contradicts itself: it recognizes strong protections while the table labels the same protections as gaps.

### Layer diagnosis

| Layer | Result | Evidence |
|---|---|---|
| INGEST | Pass for visible run | Clean DPA text and clean DPA-specific playbook were loaded. |
| PLAN | Pass | All seven asks were recognized and mapped; no PLAN/ACT alignment issue was logged. |
| ACT / retrieval | Partial | Relevant clauses were retrieved, but evidence pools were far too broad for Lite. |
| ACT / verification | Fail | Repeated 45-second candidate failures; quote/locator validation failures; 35 structural issues. |
| LOCK / aggregation | Fail | Operational failures became `cannot_determine`; contradictory findings were not reconciled. |
| RENDER | Fail | Repetitive generic rows, opaque IDs, misclassified favorable terms, and truncated evidence. |
| CRITIQUE / release | Fail-safe only | Critique detected the faults, but Lite had no retry budget and still released the answer. |

---

## L2 - Focused Article 28 Lite run

### Prompt

Check this DPA for GDPR Article 28 compliance — subject matter, duration, nature and purpose, data categories and data subjects, and whether the mandatory Article 28(3) processor obligations are present and adequate.

### Runtime evidence

- Job: `bd3bde1e-b0b0-4c26-b066-0e1dddab3276`
- Session: `an_b527b70a-405c-4f01-87b3-5beceb8317a0`
- Trace: `logs/analysis/an_b527b70a-405c-4f01-87b3-5beceb8317a0.log`
- PLAN: correctly classified five requirements and mapped them to `gdpr.art28.particulars` and `gdpr.art28.3.mandatory_clauses`.
- Graph: 9 work units, down from 38 in the compound case.
- PLAN time: 35.939 s; ACT time: 141.584 s; total: 177.528 s.
- Findings: 17; tokens: 37,802.
- Package result for particulars: 5 `present`, 1 `insufficient_evidence`.
- Package result for mandatory clauses: 5 `present`, 4 `insufficient_evidence`.
- CRITIQUE-LITE incorrectly reported `structurallyValid=true`, zero issues, despite verifier timeouts and incomplete mandatory-clause coverage.
- Release: `release_with_limitations`, coverage `4/5`, but no release reason was shown.

### What improved

- The response is readable and organized as a requirements table.
- Subject matter and Article 28(3)(a)-(d), plus Article 28(4) flow-down, are connected to real, relevant clauses.
- The earlier PLAN-to-LOCK identity failure is substantially improved: child findings are visible instead of being fully orphaned behind one generic parent row.

### What remains wrong

1. Article 28(3)(e) and (f) say `Cannot determine` solely because verification calls timed out. The DPA contains relevant assistance language in clauses 3.5.4, 3.5.5 and 3.6.4.
2. The answer uses clause 4.4.5 from the controller-to-controller part of the document to mark processor-side duration `Strong`. That is cross-section/role contamination. For the controller-to-processor relationship, the operative details are tied to Annex 1 of Addendum A1 and the applicable SOW; the absent annex limits certainty.
3. The categories row treats broad definitions and a notification clause as the actual processing schedule. Clause 5.1.3 expressly says data-subject categories, data categories and processing operations are set out in Annex 1/Addendum A1 or applicable SOWs. Those materials were not supplied, so this should be a scoped/partial conclusion, not `Strong`.
4. Article 28(3)(g) and (h) are rendered as `Cannot determine` even though relevant clauses were found. These are adequacy gaps/qualifications, not unknown facts: deletion/return is request-conditioned (cl. 3.5.6), and audit rights exist but the exact all-information formulation is not explicit (cl. 3.9.1-3.9.4).
5. The parent Article 28(3) row cites only clause 3.3 and then discusses deletion. It does not summarize all eight mandatory processor duties.
6. Requirement labels are visibly truncated (`Assess whether all mandatory...`, `Verify presence and adequacy...`).
7. `Obtain the referenced schedule or materials` is an incorrect action for timeout-driven failures. The missing-material action should only appear when the required evidence is genuinely in an absent annex/SOW.

## Document-ground-truth check

| Requirement | What the supplied DPA actually supports | Correct assessment for supplied materials | Lite output |
|---|---|---|---|
| Subject matter | Clause 3.3 covers Supplier processing Mastercard personal data to provide the Services under the Agreement/SOW. | Present, but service details depend on Agreement/SOW. | Strong |
| Duration | Termination/deletion appears in cl. 3.5.6; detailed processing particulars are delegated to Annex 1/SOW. Clause 4.4.5 is in a separate controller-to-controller section. | Partial / schedule-dependent | Strong (overstated and scope-contaminated) |
| Nature and purpose | Purpose is in cl. 3.3; concrete processing operations are delegated to Annex 1/SOW. | Partial; nature not established from supplied DPA alone | Cannot determine (too absolute) |
| Data categories | Definitions list possible personal/sensitive-data types; cl. 5.1.3 says actual categories are in Annex 1/SOW. | Partial / schedule-dependent | Strong (overstated) |
| Data-subject categories | Cl. 3.5.4 names customers, consumers and employees in a notification context; cl. 5.1.3 delegates actual categories to Annex 1/SOW. | Partial / schedule-dependent | Strong (overstated) |
| Art. 28(3)(a) instructions | Cl. 3.3 and 3.4.1 restrict processing to Mastercard instructions. | Present | Strong |
| Art. 28(3)(b) confidentiality | Cl. 3.6.3 imposes enforceable confidentiality on authorized persons. | Present | Strong |
| Art. 28(3)(c) security | Cl. 3.6.1 specifies risk-appropriate TOMs and core safeguards. | Present | Strong |
| Art. 28(3)(d) subprocessors | Cl. 3.8.1 requires prior listing or written authorization; cls. 3.8.2-3.8.7 add flow-down, diligence, notice and objection rights. | Present / strong | Strong |
| Art. 28(3)(e) DSR assistance | Cls. 3.5.4-3.5.5 require prompt notification, controlled responses and assistance with data-subject rights. | Present, with operational timing governed by controller instruction | Cannot determine because verifier timed out |
| Art. 28(3)(f) security/DPIA assistance | Cl. 3.5.5 expressly covers DPIAs and supervisory-authority consultation; cl. 3.6.4 covers breach assistance. | Present | Cannot determine because verifier timed out |
| Art. 28(3)(g) return/deletion | Cl. 3.5.6 requires return or secure deletion at Mastercard's option, triggered through Mastercard's request. | Present but qualified / drafting gap | Cannot determine |
| Art. 28(3)(h) information and audits | Cls. 3.9.1-3.9.4 provide broad audit, cooperation, remediation and certification rights, but do not use the full statutory `all information necessary` wording. | Substantially present with drafting gap | Cannot determine |
| Art. 28(4) flow-down | Cl. 3.8.2 requires the same data-protection obligations in the subprocessor contract; cl. 3.8.6 preserves Supplier liability. | Present / strong | Strong |

## Root cause summary

The original PLAN-to-LOCK identity bug is no longer the only or dominant issue in the focused run. The remaining failure chain is:

1. **ACT evidence scope is too large for Lite.** Candidate selection receives the full 219-section pool and roughly 121k prompt characters even for a five-requirement request.
2. **ACT timeouts are interpreted as evidence outcomes.** A verifier timeout becomes `insufficient_evidence` instead of an explicit execution-status value.
3. **Section/role boundaries are not enforced.** Controller-to-controller terms can prove a controller-to-processor requirement.
4. **LOCK collapses distinct states.** `Not in supplied documents`, `clause present but inadequate`, `reference missing`, and `verification failed` all drift toward `cannot_determine`.
5. **RENDER exposes the collapsed state.** The user sees `Cannot determine`/`Obtain materials`, which looks like a document conclusion even when the system timed out.
6. **Lite critique is inconsistent.** It correctly found 35 compound-run issues, but reported zero issues for the focused run despite two timed-out mandatory duties and cross-section evidence.

## Recommended next implementation slice

1. Add an execution-status channel separate from legal/compliance status. A timeout must render as `Analysis incomplete - verification timed out`, never as `Cannot determine` or `No related clauses found`.
2. Bound Lite evidence before the LLM: retrieve a small requirement-specific set (for example 6-12 candidate clauses), preserve section/addendum role metadata, and never send the 219-section corpus to each selector.
3. Enforce target-role and section scope during verification so controller-to-controller clauses cannot establish controller-to-processor particulars unless explicitly used as contextual evidence.
4. Normalize whitespace/page artifacts before exact quote verification; retain the complete source span and do not fail a substantively exact quote because PDF spacing differs.
5. Give LOCK four distinct outcomes: `covered`, `gap/partial`, `not found in supplied materials`, and `analysis unavailable`. Aggregate Article 28(3) only after every child duty reaches one of those states.
6. Make the release gate fail closed when any required verifier times out, any parent row lacks child coverage, or evidence comes from the wrong document section. Lite may return partial verified results, but must prominently state which checks did not execute.
7. Add regression fixtures for this exact clean DPA ID and for a corrupted-PDF duplicate. Assert clause 3.5.5 proves (e)/(f), clause 4.4.5 cannot prove processor duration, and a timeout never becomes a contractual absence.

## Decision

Do **not** start the 15-question Deep suite yet. First fix the Lite execution-status separation, evidence bounding, section scoping, and release-gate checks above; otherwise Deep will spend more calls retrying the same structural problems and the results will remain hard to interpret.
