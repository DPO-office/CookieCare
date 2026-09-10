# Live eval - CookieCare Analyze - 2026-09-03 - Lite vs Deep 15-question suite

Documents: `C:\Users\abhinav.yadav_randst\Downloads\Mastercard_Data_Processing_Agreement.pdf` | Playbook: `C:\Users\abhinav.yadav_randst\Downloads\DPA_AI_Prompt_Repository_Playbook.docx.pdf`
Server: restarted with `npm run dev` from `C:\Program Files\CookieCare\CookieCare-main`; UI/backend on `http://localhost:3000`
thinkingMode: paired `lite` and `deep` runs | answerStyle: narrative except explicit table/format requests
Vision bar: `backend/src/modules/analysis/docs-legacy/rebuild/ANALYSIS_FEATURE_VISION.md`
Iteration: post compliance-retrieval and explicit partial-coverage implementation

> This is a live product evaluation, not a fixture report. Each verdict checks output shape, source-document grounding, consistency between status and rationale, and the pipeline layer responsible for any fault.

## Scorecard

| ID | Mode | Category | Question (short) | Session | Time | Shape | Grounding | Verdict | Expected vs actual / top fault |
|---|---|---|---|---|---:|---|---|---|---|
| Q1 | Deep | Narrow factual | Termination notice period | `an_19b33626-0cff-40d2-a3a9-b453efb72e43` | 55.831 s | Yes | Yes | **Partial** | Correctly says no general notice period, but the evidence section is cut off by the narrow-depth output limit. |
| Q1 | Lite | Narrow factual | Termination notice period | `an_99e37451-483b-4aec-a2c7-82dac1a3f87a` | 37.497 s | Yes | **No** | **Fail** | Mistakes SCC notice cross-references for the requested termination period and never answers that no general period is stated. ACT accepted related-but-non-probative candidates as `present`. |
| Q2 | Deep | Narrow factual | Controller and processor identities | `an_a7829772-66f5-46c0-adae-c3de9a1407fc` | 73.386 s | Yes | **Partial** | **Partial** | Correct core roles, but the evidence quote stops before naming Supplier and the answer adds an unnecessary controller-to-controller exception. |
| Q2 | Lite | Narrow factual | Controller and processor identities | `an_b2b7119d-05ab-4cbf-873d-7edb2b438d4c` | 30.131 s | Yes | **Partial** | **Partial** | Same correct core answer and same incomplete role quote; a second quote is visibly truncated mid-word. |
| Q3 | Deep | Broad compliance | Is the DPA GDPR compliant? | `an_9dfb81ef-b442-4b2c-bce1-997bd78c6a02` | 293.715 s | **Partial** | Yes | **Partial** | Useful Article 28 matrix, but duplicates a synthetic parent row and marks Art. 28(3)(f)/(h) partial because evidence from complementary clauses was not aggregated. |
| Q3 | Lite | Broad compliance | Is the DPA GDPR compliant? | `an_b604b381-8537-4689-b1a3-8bf5b813b564` | 106.675 s | **Partial** | Yes | **Partial** | Better mandatory-clause conclusions than Deep and 64% faster, but creates two redundant parent rows and never gives a crisp qualified yes/no answer. |
| Q4 | Deep | Rigorous compliance table | Article 28 particulars and mandatory clauses | `an_783db26c-235b-4645-aecd-fddf3479f53a` | 249.929 s | **Partial** | **Partial** | **Fail** | Omits a distinct data-subject finding, uses incomplete evidence for controller rights, and falsely downgrades security assistance/audit because complementary clauses were not aggregated. |
| Q4 | Lite | Rigorous compliance table | Article 28 particulars and mandatory clauses | `an_4ecdb05a-5084-40ca-bfbb-5cbd14573a6e` | 97.761 s | **Partial** | **Partial** | **Partial** | Better mandatory-clause status, but combined categories/subjects row discusses only subjects; nature schedule dependency is mislabeled; missing-material list is incomplete. |
| Q5 | Deep | Open risk + negotiation | Vendor onboarding risks | `an_660c45b8-1efd-4f81-92db-2c504175ca2a` | 245.691 s | **No** | **Partial** | **Fail** | “No major risks” summary, only four narrow propositions, no ranked onboarding risks, almost no negotiation detail, and report truncates after one paragraph. |
| Q5 | Lite | Open risk + negotiation | Vendor onboarding risks | `an_d083d1b8-17fb-4809-9ac4-8509ac90aa55` | 116.258 s | **Partial** | **No** | **Fail** | Produces a risk narrative but flips perspective to Supplier, duplicates the same four propositions across two facets, misuses citations, and omits major transfer/subprocessor risks. |
| Q6 | Deep | Focused risk comparison | Termination balance + liability cap | `an_659a39c2-e008-4df3-ac78-32aef7645e2f` | 126.220 s | **No** | **Partial** | **Fail** | PLAN replaces the liability question with a second termination proposition; render truncates and releases despite missing required sections. |
| Q6 | Lite | Focused risk comparison | Termination balance + liability cap | `an_d84e34bc-179d-4c81-b8f6-1e46f8d00c4c` | 82.746 s | Yes | **Partial** | **Fail** | Finds the right clauses but reverses customer perspective, turning Mastercard's protections into a customer risk and wrong-direction negotiation advice. |
| Q7 | Deep | Playbook comparison | Agreement versus uploaded playbook | `an_a0c596de-6db2-4401-af25-10e3b6a5896d` | 313.703 s | **No** | **Partial** | **Fail** | Nearly five minutes; false single-clause negatives, extreme truncation, and internal drafting/meta-prompt text leaks into the user answer. |
| Q7 | Lite | Playbook comparison | Agreement versus uploaded playbook | `an_869c1651-b3ba-4da7-b623-26676fa1f410` | 108.769 s | **No** | **Partial** | **Fail** | Correct setup and several useful deltas, but false transfer/flow-down gaps, one-citation collapse, contradictory title/body, and truncation. |
| Q15 | Deep | Format follow-up | Show Q5 as table | `an_660c45b8-1efd-4f81-92db-2c504175ca2a` | 35.414 s | Yes | **Partial** | **Partial** | Correctly preserves session and changes only format, but faithfully re-renders Q5's incomplete/incorrect four-row substance; audit JSON parse failed and was skipped. |
| Q15 | Lite | Format follow-up | Show Q5 as table | `an_d083d1b8-17fb-4809-9ac4-8509ac90aa55` | 15.970 s | Yes | **No** | **Fail** | Preserves format intent, but collapses all three parent rows onto the same liability quote and loses the actual negotiation recommendations. |
| Q8 | Lite | Compound / multi-doc | Art 28 + playbook + top-5 risks | `an_32a6ad08-5c65-4c38-974a-631f2fcaf85e` | ~236 s | **Partial** | **Partial** | **Partial** | Real improvement over 09-02: Article 28 particulars/mandatory-clause table is now correct and grounded. But the playbook facet leaks an internal id (`Facet 2 P6`) and contradicts its own evidence (`Insufficient data` headline over a table of mostly `Strong` findings), and the risk-ranking facet truncates after ~2.5 of 5 requested risks with no negotiation content. Deep run skipped for this question at user's direction. |
| Q9a | Lite | Follow-up chain / baseline | Analyze GDPR compliance | `an_a5255808-29b4-440c-afac-2b87c4d99bb2` | ~219 s | **Partial** | **Partial** | **Partial** | 18-row real requirements table (up from 1 generic row on 09-02), but (3)(g)/(h) are `Cannot determine` in this run despite the same clauses being `Strong` in Q8 minutes earlier on the same document — cross-run VERIFY nondeterminism. Duration `Strong` again cites cross-section clause 4.4.5. A HIGH risk cites an unrelated marketing/cookies clause and leaks an internal label (`gdpr art12 4 reasoned refusal notice gap`) into user text. |
| Q9b | Lite | Follow-up chain | Focus on subprocessors | same session | ~40 s | Yes | **Partial** | **Partial** | Correctly scoped to subprocessors with 3 real, correctly grounded `Strong` findings (cl. 3.8.7, 3.8.2) — a major improvement over 09-02 (which reported real subprocessor clauses missing). But misses clause 3.8.6 (Supplier remains fully liable for Sub-Processor obligations), rendering "processor's liability for sub-processor compliance" as `Insufficient data` although the clause is in the same evidence pool logged for this session. |
| Q9c | Lite | Follow-up chain | Object to a subprocessor change? | same session | fast | Yes | **No** | **Fail** | Answers "insufficient data / no express clause identified" for subprocessor objection rights, directly contradicting clause 3.8.7 — quoted two turns earlier in this exact session (Q9b) — which gives Mastercard an explicit objection/suspend/terminate right. A same-session, same-document self-contradiction more severe than 09-02's version of this fault (which merely re-rendered stale content; this one actively re-investigated and got the opposite answer). |
| Q9d | Lite | Follow-up chain / negotiation | Negotiate that clause | same session | 3 s to ASK pause | **No** | n/a | **Fail** | Exact reproduction of the 09-02 bug: a clear `draft_suggestion`/negotiation ask is blocked with "Operation draft_suggestion is not fully supported in this release. Confirm to run a risk-flag analysis instead, or rephrase," offering only `run_risk_flag`/`cancel`. Unfixed since 2026-09-02. |
| Q10 | Lite | Open-ended | Unusual/one-sided clauses | `an_714c1f79-1af2-41d3-af10-3cbba29b876b` | ~99 s | **No** | Yes | **Fail** | Same tunnel-vision defect as 09-02: the broad "find unusual/one-sided clauses" ask narrows to only 2 propositions, both about liability, leaving unflagged real one-sided material already visible in the log (e.g. cl. 3.12's unilateral Mastercard-driven amendment right). Every finding is hedged `Cannot determine` even where the reviewed text itself answers the specific proposition, deferring to an unread main agreement that isn't actually needed for the two propositions asked. |
| Q11 | Lite | Open-ended | Contradictions/inconsistencies | `an_0454c881-22c6-44de-a200-b55b5088f2eb` | ~99 s | **No** | n/a | **Fail** | A different but arguably worse failure than 09-02's (which at least attempted the task and mislabeled an SCC rule as a contradiction). This run never searches for or reports a single candidate inconsistency; it answers the "find contradictions" ask with an explanation of the SCC precedence/hierarchy clause and concludes contradictions are structurally "neutralized," treating the presence of a conflict-resolution clause as proof no conflicts exist rather than as one input to the actual search. |
| Q12 | Lite | Compliance | GDPR Arts. 15-22 rights | `an_09d417e1-52eb-4b52-8782-414942a2a0ee` | ~117 s | Yes | **Partial** | **Partial** | Clear improvement over 09-02 (which produced contradictory statuses on a generic rights clause): all 8 articles get distinct rows. But Arts. 15/16/17/21 are `Strong`/`Present & adequate` while 18/19/20/22 are `Partially covered` off the *same* clause 3.3, which names restriction/portability/automated-decision-making just as explicitly as access/rectification/erasure/objection — an unexplained inconsistent verdict on equivalent evidence. Justification text also leaks internal evidence-pool labels (`clause E4`, `clause E5.5`) into user-facing prose. |
| Q13 | Lite | Compliance | International transfers | `an_51f750ad-7dc2-4137-8344-ff8320b4b248` | ~88 s | Yes | Yes | **Partial** | Major improvement over 09-02 (all 3 requirements were orphaned there despite a rich transfer inventory); here all 3 get real, well-grounded, multi-jurisdiction citations (EU/Swiss/UK/Brazil SCC clauses 3.7.1-3.7.5.3, 3.7.8). Sole defect: one finding leaks raw internal pipeline syntax verbatim into user-facing text — `"Per proofStandard, because the operative restriction is binding... evidenceState=incorporated"` — the most literal internal-key leak seen in this suite. |
| Q14 | Lite | Narrow QA | Post-termination data | `an_d18d0015-c6ab-4013-8957-c4c7268b4d7f` | ~54 s | Yes | **Partial** | **Partial** | Large improvement over 09-02 (which turned a missing fixed deadline into "nothing can be determined"): direct, correct, well-organized answer distinguishing Controller-to-Processor (return/delete on Mastercard's instruction, law-required-retention exception) from Controller-to-Controller scope. Both evidence quotes are truncated mid-sentence, and citations use the raw internal marker `[open.p1]` instead of a clean `[E1]`/`[E2]` style. |

---

## Q1 - Deep - Narrow factual - termination notice period

- **Asked at:** 2026-09-03T16:21:04Z
- **Documents:** DPA only
- **thinkingMode:** deep
- **answerStyle:** narrative / `qa_thread`
- **Follow-up of:** none
- **Job id / session id:** `90a1e413-31da-479e-b024-417490e6c865` / `an_19b33626-0cff-40d2-a3a9-b453efb72e43`
- **Wall time:** 55.831 s
- **Work units / tokens:** 4 / 38,833
- **Backend evidence trace:** `logs/analysis/an_19b33626-0cff-40d2-a3a9-b453efb72e43.log`

### Question (verbatim)

What is the termination notice period?

### What should be returned in both modes

- **Investigation:** distinguish a general termination notice period from the DPA's conditional termination rights and from 60-day notices concerning subprocessors/transfers.
- **Expected legal answer:** this DPA does not specify a standard advance notice period for general termination; that term must be confirmed in the Master Supplier Agreement or applicable SOW. The DPA itself gives Mastercard compliance-triggered termination rights without stating an advance period.
- **Expected shape:** a short direct answer with one or two complete citations.
- **Mode expectation:** Lite and Deep must reach the same legal answer; Deep may add grounding verification but should not become a longer memo.

### What PLAN understood

- `operation=extract`, `reportType=qa_answer`, `depth=narrow`, `outputForm=qa_thread`, `standard=none`, `compound=no`.
- One open-lane proposition, `open.p1`: the agreement requires a specific advance written notice period for one or both parties to terminate.
- Lean verified graph: classify document -> extract shared evidence -> evaluate package -> render output.

### User-facing answer (full as rendered)

## Answer

The agreement does not specify a standard advance notice period for general termination, but instead grants Mastercard immediate termination rights across two distinct operative scopes when required for legal compliance.

- **Controller to Processor Scope:** Mastercard is entitled to terminate the agreement and any further Personal Data Processing immediately if required to comply with Privacy and Data Protection Law.
- **Controller to Controller Scope:** Mastercard may suspend and terminate Personal Data Processing and terminate the agreement if doing so is required, or reasonably expected to be required, to comply with Privacy and Data Protection Law.

## Evidence

- **Controller to Processor Specific Terms and Conditions - Statutory Compliance Termination:** "Mastercard is entitled to terminate any further Personal Data Processing and the Agreement

`[Report ended at the length limit for narrow depth. Remaining detail was omitted.]`

### Faults

1. **Symptom:** the direct answer is correct, but the quoted evidence is cut off mid-sentence and the UI displays an explicit length-limit notice.
   - **Why it violates the vision:** a narrow answer should be the easiest output to render completely; a truncated quotation weakens traceability.
   - **Evidence:** `Report ended at the length limit for narrow depth. Remaining detail was omitted.`
   - **Likely layer:** outline/render token budgeting.
   - **Severity:** medium.

### What to enhance

Reserve a deterministic minimum output allowance for complete evidence sentences in narrow Q&A, trimming optional prose before truncating a citation.

---

## Q1 - Lite - Narrow factual - termination notice period

- **Asked at:** 2026-09-03T16:25:00Z (live paired run)
- **Documents:** DPA only
- **thinkingMode:** lite
- **answerStyle:** narrative / `qa_thread`
- **Follow-up of:** none
- **Job id / session id:** `920b36d6-d546-4476-abdd-654a1e5f835b` / `an_99e37451-483b-4aec-a2c7-82dac1a3f87a`
- **Wall time:** 37.497 s
- **Work units / tokens:** 4 / 37,769
- **Backend evidence trace:** `logs/analysis/an_99e37451-483b-4aec-a2c7-82dac1a3f87a.log`

### Question (verbatim)

What is the termination notice period?

### What should be returned in both modes

Same ground truth as the Deep run: the DPA does not state a standard advance notice period for general termination; the MSA/SOW must be checked. SCC notice-delivery cross-references are not themselves the requested period.

### What PLAN understood

- Correctly chose `operation=extract`, `reportType=qa_answer`, `depth=narrow`, `outputForm=qa_thread` and one open proposition.
- PLAN was therefore not the source of this failure.

### User-facing answer (full as rendered)

## Answer

The termination notice period depends on the specific data processing relationship and is determined by the timing mechanisms specified in the agreement's Controller-to-Controller and Controller-to-Processor terms.

- **Controller-to-Controller Scope:** Notices relating to termination or suspension under SCC Clauses 14(e) or 16 must be served in accordance with the timing requirements set out in Clause 4.6 of the Data Processing Agreement [P1].
- **Controller-to-Processor Scope:** Notices issued under EU SCC Clauses 14(e) or 16 follow the timing rules and delivery details established under Section 3.7.9 of the Data Processing Agreement [P1].

## Evidence

- **Controller-to-Controller Specific Terms:** "any notice provided under clause 14(e) or clause 16 of the SCCs shall be provided according to the timing and to the email address as set out in Clause 4.6 of this Data Processing Agreement;" [E1]
- **Controller-to-Processor Specific Terms:** "f) any notice provided under clause 14(e) or clause 16 of the EU SCCs shall be provided according to the timing and to the email address as set out in section 3.7.9 of this Data Processing Agreement;" [E2]

### Faults

1. **Symptom:** the answer substitutes SCC notice-routing language for the requested general termination notice period.
   - **Why it violates the vision:** it gives a confident related answer without proving the proposition the user asked about.
   - **Evidence:** both verifier rationales in the server trace recognized that the excerpts only cross-reference timing and do not state a specific advance period, yet the scoped QA result classified them as present.
   - **Likely layer:** ACT proposition evaluation / result aggregation, with the release gate failing to catch the mismatch.
   - **Severity:** high.

### Lite vs Deep comparison

- **Deep:** reached the correct legal conclusion and selected termination-right evidence, but rendered a truncated citation.
- **Lite:** was faster by 18.334 seconds and used 1,064 fewer tokens, but returned the wrong substantive answer because ACT promoted related SCC notice references into proof.
- **Expected:** identical legal conclusions in both modes. Deep should add validation, not rescue a weak Lite conclusion; neither mode should truncate a short citation.

### What to enhance

For narrow factual Q&A, require the final answer's operative object and value to be entailed by the selected evidence. If the evidence only points to another clause or document without stating the requested value, classify it as a cross-reference/unknown and answer that the value is not stated in the reviewed material.

---

## Q2 - paired Lite and Deep - controller/processor identities

### Question (verbatim)

In the Controller-to-Processor scenario, who is the controller and who is the processor?

### What should be returned in both modes

Mastercard is the Controller/Business and Supplier is the Processor/Service Provider. Where Mastercard processes for its own customers, Mastercard can itself be a Processor and Supplier a Sub-Processor. The answer should cite the complete role-allocation sentence in clause 3.3 and should not mix in the separately headed Controller-to-Controller terms unless briefly labelled as outside the asked scenario.

### Deep run

- **Job id / session id:** `6d1aa42c-40d4-49af-b873-fca87eff8a3b` / `an_a7829772-66f5-46c0-adae-c3de9a1407fc`
- **Wall time / tokens:** 73.386 s / 38,282
- **PLAN:** `operation=explain_qa`, `reportType=qa_answer`, `depth=narrow`, `outputForm=qa_thread`; correct single proposition.
- **ACT:** clause 3.3 and Brazil SCC 7.3 proved the proposition; the controller-to-controller clause was correctly recognized as a distinct-scope contradiction and reconciled as scope-dependent.
- **Rendered answer:** “Mastercard acts as the controller and Supplier acts as the processor, subject to the specific operational scope established in the agreement.” It then correctly describes both parties and adds a Controller-to-Controller scope exclusion.
- **Rendered evidence:** E1 ends at “...or Processor” before the sentence reaches Supplier's role; E2 proves only the distinct Controller-to-Controller scope.
- **Verdict:** **Partial**—the answer is correct, but its primary citation does not visibly include the Supplier designation.

### Lite run

- **Job id / session id:** `a79dc544-0035-4c73-b24b-ba326ab74ca3` / `an_b2b7119d-05ab-4cbf-873d-7edb2b438d4c`
- **Wall time / tokens:** 30.131 s / 37,969
- **PLAN:** initially inferred `depth=standard` and `outputForm=memo`, but the operation contract ultimately rendered `qa_thread`; correct proposition.
- **Rendered answer:** “In the Controller-to-Processor scenario under this agreement, Mastercard acts as the Controller (or Business) and the Supplier acts as the Processor (or Service Provider).” It also adds the separate independent-controller scope.
- **Rendered evidence:** E1 has the same incomplete role quote; E2 is additionally truncated mid-word at “independent Contr”.
- **Verdict:** **Partial**—correct conclusion, incomplete visible proof.

### Lite vs Deep comparison

- Both modes reached the same correct core legal answer.
- Lite was 43.255 seconds faster and used 313 fewer tokens.
- Deep's audit did not detect that the displayed quote failed to include the text proving Supplier's role. This is not a retrieval failure—the verifier saw the complete sentence—but a **render/evidence-span selection** failure plus a release-gate blind spot.

### What to enhance

Evidence excerpts should include every entity/value needed to prove a multi-part answer. Add a render-time entailment check that rejects a quote when required named entities are missing or when the excerpt ends mid-word/mid-clause.

---

## Q3 - paired Lite and Deep - broad GDPR compliance

### Question (verbatim)

Is this DPA GDPR compliant?

### What should be returned in both modes

A qualified conclusion rather than a blanket yes/no: the supplied DPA contains the core Article 28 processor obligations, but the service-specific particulars for nature, data categories, and data-subject categories are incorporated from an unavailable Agreement/SOW/Annex and therefore cannot be fully verified from this file alone. The answer should identify the meaningful gap/dependency without presenting the user's broad question as a separate compliance requirement.

### Deep run

- **Job id / session id:** `38ec0633-08fd-4615-bc94-b1ad8791f048` / `an_9dfb81ef-b442-4b2c-bce1-997bd78c6a02`
- **Wall time / tokens:** 293.715 s / 7,068 reported final tokens (the per-call trace shows this counter is not a reliable measure of total model work)
- **PLAN:** correctly selected `compliance_check`, `regime_compliance_memo`, GDPR Article 28, and expanded to the processing particulars plus mandatory Article 28(3)/(4) requirements.
- **Good:** subject matter, instructions, confidentiality, security, subprocessors, rights assistance, deletion/return, and flow-down were correctly grounded. Duration is now correctly labelled `Partially covered`; nature/purpose, data categories, and data-subject categories are correctly labelled `Partially covered - details in schedule`.
- **Fault 1 — LOCK/aggregation:** Article 28(3)(f) was labelled partial even though the verifier itself notes that clause 3.5.5 supplies DPIA/authority assistance and clause 3.6.4 separately supplies breach assistance. Article 28 permits the obligation to be expressed across clauses; the pipeline chose one winner instead of combining complementary proof.
- **Fault 2 — verification nondeterminism:** Article 28(3)(h) was labelled partial in Deep while Lite accepted the same audit provision as strong. The Deep verifier imposed an additional “all information” phrase requirement without aggregating clauses 3.9.1, 3.9.3, and 3.9.4.
- **Fault 3 — output architecture:** the first table row is the natural-language parent request (`Verify whether...`) and repeats a blend of subject-matter and duration findings. It is not a legal requirement and should appear only as the conclusion/roll-up.
- **Bottom line:** useful and mostly grounded, but slower and less accurate than Lite on two mandatory clauses.

### Lite run

- **Job id / session id:** `655ec4ab-533f-4f04-9e76-0a8473f95903` / `an_b604b381-8537-4689-b1a3-8bf5b813b564`
- **Wall time / tokens:** 106.675 s / 6,610 reported final tokens
- **PLAN:** correctly selected the compliance path but emitted two overlapping parent requirements (`gdpr.article28.compliance` and `gdpr.general.compliance`).
- **Good:** correctly classified the four service-specific particulars and all mandatory Article 28(3)/(4) clauses. It selected more complete subprocessor and flow-down excerpts than Deep.
- **Fault 1 — PLAN/LOCK identity:** both parent requirements became redundant user-facing rows with the same mixed evidence, status, and action. The release gate counted both as covered instead of suppressing them once their child requirements were rendered.
- **Fault 2 — articulation:** the bottom line says which items need attention but never directly answers the yes/no question with a qualified conclusion.
- **Bottom line:** substantively stronger than Deep and usable, but not clean enough to call a full pass.

### Lite vs Deep comparison

- Lite was 187.040 seconds (63.7%) faster.
- Both modes correctly used the new partial-coverage vocabulary and correctly found the missing schedule particulars.
- Deep performed an AUDIT, but it did not improve the result and in fact produced two additional false-negative partial findings. The observed difference formed in **VERIFY/LOCK**, not retrieval: the relevant clauses were retrieved but complementary evidence was not combined consistently.
- Both modes exposed the unresolved parent/child rendering problem: broad request nodes are being displayed as if they were independent legal requirements.

### What to enhance

1. Suppress roll-up/intent requirements from the matrix when their legal child requirements are present; use them only to compute the bottom line.
2. Allow a requirement to be proved by the union of compatible passages, with explicit part-to-passage coverage, instead of forcing a single winning passage.
3. Add deterministic status reconciliation so Deep cannot downgrade a clause that Lite marks strong unless it records a concrete missing element supported by the governing rule.
4. Start broad-compliance conclusions with a direct qualified answer: “Substantially aligned on the supplied text, but full compliance cannot be confirmed without the referenced schedules.”

---

## Q4 - paired Lite and Deep - rigorous Article 28 table

### Question (verbatim)

Perform a rigorous GDPR Article 28 compliance review of this Data Processing Agreement. Verify: subject matter, duration, nature and purpose of processing, categories of data and data subjects, obligations and rights of the controller, and whether all mandatory Article 28(3) clauses are present and adequate. Present findings as a table.

### What should be returned in both modes

A table with distinct coverage for every requested particular and every mandatory Article 28(3) processor duty. Combined rows are acceptable only if the finding and evidence explicitly address every combined element. The mandatory-clause roll-up must be derived from all child duties, not supported by a single child quote.

### Deep run

- **Job id / session id:** `5c05270f-349b-4670-aea1-6de11b11d43b` / `an_783db26c-235b-4645-aecd-fddf3479f53a`
- **Wall time / tokens:** 249.929 s / 7,340 reported final tokens
- **PLAN:** correct operation, GDPR Article 28 scope, `depth=deep`, `outputForm=table`, six explicit top-level requirements expanded to the correct packages.
- **Good:** subject matter, duration, nature/purpose, data categories, instructions, confidentiality, security, subprocessors, DSR assistance, deletion/return, and flow-down were grounded in the correct provisions.
- **Failing layer — VERIFY/LOCK:** security assistance and audit were again downgraded because one passage was expected to cover multiple elements, although complementary clauses were available.
- **Failing layer — RENDER:** the combined categories/data-subjects row only describes the data-category dependency and never states the data-subject finding. The controller-rights row cites only the general compliance warranty (clause 3.2), so the visible evidence does not establish the rights portion. The mandatory-clause parent row repeats confidentiality evidence while its finding discusses security assistance, an internal evidence/finding mismatch.
- **Verdict:** **Fail** for a rigorous review because several explicitly requested elements are not visibly proved even though much of the table is useful.

### Lite run

- **Job id / session id:** `7f69dfca-aeb8-4677-a57a-3c8104057ad1` / `an_4ecdb05a-5084-40ca-bfbb-5cbd14573a6e`
- **Wall time / tokens:** 97.761 s / 6,970 reported final tokens
- **Good:** all mandatory child duties are marked strong; subject matter, duration, and controller rights are supported by appropriate clauses.
- **Faults:** the categories/data-subjects row only articulates data subjects; the nature/purpose row is plain `Partially covered` despite explicitly depending on a missing Annex and gives the generic action “Amend the text”; the mandatory-clauses roll-up is marked strong using only the instructions quote; missing materials list includes only the data-subject schedule and omits the nature/purpose annex and duration source.
- **Verdict:** **Partial**—closer to the expected result than Deep, but incomplete for the prompt's explicit particulars.

### Lite vs Deep comparison

- Lite was 152.168 seconds (60.9%) faster and produced the more accurate mandatory-clause conclusions.
- The explicit prompt fixed PLAN ambiguity but did not fix downstream result identity or multi-passage proof composition.
- Deep's additional reasoning was counterproductive here: it increased latency and introduced false-negative partial statuses without catching render mismatches.

### What to enhance

Use atomic child assessments as the sole source of truth. Generate combined user rows by deterministic composition of all named children; generate parent adequacy rows from child statuses without inventing a single evidence quote. Add completeness checks that compare each requested noun phrase (for example, both “data categories” and “data subjects”) against the final row text and missing-material list.

---

## Q5 and Q15 - paired risk analysis and table follow-up

### Q5 question (verbatim)

What are the biggest legal and commercial risks if we onboard this vendor? What should I negotiate?

### What should be returned in both modes

A customer-side risk narrative that prioritizes material onboarding exposures and pairs each with a negotiation action. At minimum, it should distinguish strong customer protection (uncapped supplier privacy liability and claim-back rights) from residual risks/dependencies involving audit mechanics, subprocessor control, international transfers, termination/general commercial terms, referenced security schedules, and operational feasibility. It must not treat a supplier-unfavorable clause as a customer risk unless the user perspective is explicitly Supplier.

### Q5 Deep

- **Job/session:** `d5812b8b-d942-4919-9435-d79348567ef5` / `an_660c45b8-1efd-4f81-92db-2c504175ca2a`
- **Wall time/tokens:** 245.691 s / 50,436
- **PLAN:** correctly selected `risk_flag` and `risk_audit`, but generated only four propositions: liability cap, indemnity, termination symmetry, and audit adequacy. Transfers, subprocessors, security schedules, and other onboarding categories never entered the graph.
- **ACT:** one candidate timed out in each of multiple proposition checks. Liability and claim-back protection were proved; termination remained dependent on the main Agreement; the audit clauses were treated as conflicting rather than reconciled.
- **Rendered result:** heading “No Major Legal or Commercial Risks Identified”; one short bottom-line paragraph; explicit standard-depth truncation. It does not rank risks and provides only two high-level next steps.
- **Verdict:** **Fail**. The risk archetype exists, but proposition coverage and output budget make it unusable as the requested onboarding review.

### Q5 Lite

- **Job/session:** `fef0a426-36d3-4d82-b608-95b3bceb181f` / `an_d083d1b8-17fb-4809-9ac4-8509ac90aa55`
- **Wall time/tokens:** 116.258 s / 60,636
- **PLAN:** classified the prompt as a compound risk + drafting ask and split it into two facets, but then generated the same four risk propositions in both facets, doubling evidence work without adding negotiation-specific analysis.
- **Rendered result:** a substantially longer risk/negotiation memo, but its heading says the one-sided claim-back right “exposes Supplier,” while the body treats Mastercard as the client. It calls customer-favorable uncapped supplier liability a commercial imbalance/risk, cites nearly every claim as `[E1]` regardless of source, repeats conclusions, and still omits transfer/subprocessor onboarding risks.
- **Verdict:** **Fail**. More readable than Deep, but perspective and grounding are unreliable.

### Q5 Lite vs Deep

- Lite was 129.433 seconds faster and contained more actionable prose.
- Deep avoided the perspective reversal but collapsed to an overconfident “minimal risk” summary and was truncated before delivering the requested analysis.
- Primary failure begins in **PLAN/open proposition generation** (too few generic risk dimensions and duplicated facet work), continues in **ACT** (timeouts and unresolved same-scope audit clauses), and becomes severe in **RENDER** (perspective drift, citation collapse, truncation).

### Q15 question (verbatim)

Show that as a table instead.

### Q15 Deep

- Correctly recognized a presentation-only follow-up and reused the Q5 findings without re-running retrieval.
- Returned four rows in 35.414 s. The row content is consistent with Q5 but inherits its incomplete risk inventory. One evidence quote is truncated mid-sentence. The audit JSON verifier returned prose instead of JSON, was skipped, and the release still passed.
- **Verdict:** **Partial** for follow-up mechanics; content quality cannot exceed the failed parent analysis.

### Q15 Lite

- Correctly recognized a presentation-only follow-up and re-rendered in 15.970 s.
- The table contains only the three broad parent asks. All three rows reuse the same clause 3.10.1 quote and similar liability finding/action, so legal risk, commercial risk, and negotiation recommendations lose their distinct substance.
- **Verdict:** **Fail** because the format changed but the information architecture collapsed.

### What to enhance

1. Build a generic risk-dimension inventory before proposition generation and enforce requested perspective (`customer`, `supplier`, or neutral).
2. For compound risk + recommendation prompts, share one risk investigation and derive negotiation actions from those findings; do not duplicate identical investigations by facet.
3. Render risk findings, not broad planning requirements, as table rows on a format follow-up.
4. Enforce one-to-one citation entailment and reserve enough output for all ranked risks and actions.

---

## Q6 - paired Lite and Deep - termination balance and customer liability protection

### Question (verbatim)

Is termination balanced between the parties, and does the liability cap adequately protect the customer?

### What should be returned in both modes

A customer-side answer must first establish that Mastercard is the customer/controller in the reviewed Controller-to-Processor terms. Clause 3.4.1 gives Mastercard a termination remedy if the Supplier does not cure non-compliance; this is customer-favorable protection, not a customer-side risk. The DPA also removes the main Agreement's liability exclusions/caps for Supplier violations of privacy law or the DPA (clause 3.10.1), which is strong customer protection. Overall bilateral termination balance and the adequacy of the general monetary cap cannot be fully assessed without the incorporated Master Supplier Agreement. The missing-document conclusion should be described as `Requires the main agreement`, not as a system-sounding failure.

### Lite run

- **Job/session:** `773abe70-e1a9-4100-a810-846a99d1d7ee` / `an_d84e34bc-179d-4c81-b8f6-1e46f8d00c4c`
- **Wall time/tokens:** 82.746 s backend / about 89.118 s browser; 51,965 tokens
- **PLAN:** recognized two explicit requirements and split them into termination and liability facets. It selected `risk_flag`, `risk_audit`, and a memo renderer. This is structurally reasonable, although it created two separate 60-item evidence bundles containing the same 44,347 characters.
- **ACT/LOCK:** correctly proved Mastercard's termination right and correctly recognized that the DPA contains an uncapped privacy/DPA liability carve-out but not the main Agreement's general cap. LOCK reported one `strong` and one `cannot_determine` assessment.
- **Rendered result:** calls Mastercard's clause 3.4.1 right a structural asymmetry “favoring Mastercard,” but then recommends giving “the customer” a reciprocal right against Mastercard. That reverses the requested perspective because Mastercard is the customer in this document. It repeatedly labels the liability issue `Cannot determine`, even though the more useful legal conclusion is that privacy/DPA breach liability is uncapped while the general cap requires the main Agreement.
- **Release:** `release_with_limitations`, reason `blocked_by_budget`, coverage 1/2. The structural checker reported no issues and did not catch the party-role contradiction.
- **Verdict:** **Fail** for customer-side advice. The evidence was substantially correct, but the narrative converts a customer protection into a customer risk and proposes the wrong-direction amendment.

### Deep run

- **Job/session:** `235929a7-6930-45dc-a6f0-302382a0d2e8` / `an_659a39c2-e008-4df3-ac78-32aef7645e2f`
- **Wall time/tokens:** 126.220 s backend / about 189.229 s observed through final render; 54,894 tokens
- **PLAN:** initially understood the two requested adequacy questions, but open-proposition generation replaced the liability-cap requirement entirely with two termination propositions: Provider termination and Customer termination. The final plan therefore contained no proposition that could answer liability-cap adequacy.
- **ACT/LOCK:** proved Mastercard's termination right and found no Supplier reciprocal termination right in the supplied material. The liability clause was extracted during inventory, but the verifier never evaluated it because PLAN had dropped that requirement.
- **Rendered result:** more clearly identifies Mastercard as the customer and correctly says the general termination and liability terms require the main Agreement. However, it is visibly truncated mid-sentence and ends with the explicit length-limit notice. The report never gives a complete analysis of clause 3.10.1's uncapped supplier privacy liability.
- **Release:** the structural checker correctly detected a missing `risk_summary` section and missing P1/P2 outline headings, but no retry budget was available. The run was still released as `release_with_limitations`, reason `blocked_by_budget`.
- **Verdict:** **Fail**. Party perspective is better than Lite, but a planning identity loss deleted half the user's question and RENDER truncated the answer.

### Lite vs Deep comparison

- Lite was materially faster and preserved both user requirements through ACT, but failed at **RENDER/perspective articulation**.
- Deep handled party perspective more accurately, but failed earlier at **PLAN/open-proposition generation** by replacing the liability-cap question with a second termination proposition. Its output then failed again at **RENDER/output budgeting**.
- Neither mode delivered the expected concise answer: Mastercard has a customer-favorable termination remedy and uncapped Supplier privacy/DPA liability, while the incorporated main Agreement is needed to judge the overall bilateral termination regime and general liability cap.

### What to enhance

1. Make user requirements immutable across proposition generation: generated propositions may refine a requirement but must not replace or silently drop it.
2. Carry the resolved party perspective into every risk label, finding, and recommendation. Add a contradiction check for advice that treats the identified customer as the opposing party.
3. Replace `Cannot determine` in user-facing prose with a cause-specific label such as `Requires the main agreement`, while retaining the internal uncertainty state.
4. When the renderer detects truncation or missing required sections, do not release the partial prose as a normal answer; use a deterministic compact fallback that covers every assessment.

---

## Q7 - paired Lite and Deep - agreement versus uploaded playbook

### Question (verbatim)

Does this agreement align with our playbook? Flag every playbook position that is missing, weaker, or different, with evidence from both documents.

### Documents and expected comparison

- **Target:** `Mastercard_Data_Processing_Agreement.pdf`
- **Reference/playbook:** `DPA_AI_Prompt_Repository_Playbook.docx.pdf`, explicitly marked `PB` in the UI
- Both backend traces confirm `docs=2` and correctly assign the playbook `role=reference` and the Mastercard DPA `role=target`.
- Both modes should compare the playbook's atomic positions, quote both sides, and distinguish: (a) aligned/stronger terms for documented instructions, 24-hour breach notice, prior subprocessor consent plus 60-business-day notice/objection/termination, subprocessor flow-down, EU SCC Module 2 plus the UK Addendum, uncapped privacy liability, and on-request audit/certification access; (b) weaker terms for no fixed 30-day deletion deadline/automatic destruction certificate, no fixed five-business-day DSR-assistance deadline, and any TOM schedule dependency. A right exercisable on request should not be called weaker merely because the contract does not repeat the word `annual`.

### Lite run

- **Job/session:** `7f2c4785-524a-4528-9d34-dd3b51e7edca` / `an_869c1651-b3ba-4da7-b623-26676fa1f410`
- **Wall time/tokens:** 108.769 s backend / about 112.825 s browser; 62,075 tokens
- **PLAN:** correctly selected a cross-document `compare` operation and expanded the playbook into ten positions. However, it retained a synthetic roll-up proposition (`open.p1`) saying the agreement deviates across all topics and then treated the playbook standard for that proposition as “missing.”
- **Correct findings:** documented-instructions alignment, 24-hour breach notice, uncapped privacy liability, and audit rights were grounded correctly. The 30-day deletion/certificate difference and fixed DSR-assistance deadline difference are useful findings.
- **False findings from VERIFY:** subprocessor controls were labelled incomplete because clause 3.8.7 did not itself contain flow-down text, even though clause 3.8.2 does. EU/UK transfers were labelled incomplete because clause 3.7.5.3 did not itself contain the UK Addendum, even though clause 3.7.7 does. These are direct repeats of the multi-passage composition defect.
- **Rendered result:** the heading says `No Identifiable Positions or Deviations Found`, while the body identifies multiple alignments and deviations. It then claims the UK Addendum and subprocessor flow-down are missing, cites almost every conclusion as `[E1]`, says the explicit playbook standard is absent despite using it, and truncates before completing the recommendations.
- **Release:** structural validation detected missing outline headings and truncation, but no retry budget existed; the run released with only 4/10 requirements covered.
- **Verdict:** **Fail**. The comparison setup and several atomic findings are good, but false negatives, citation collapse, heading/body contradiction, and truncation make the report unsafe to rely on.

### Deep run

- **Job/session:** `94f5e586-2fca-4d41-aa37-b0bba888b3a7` / `an_a0c596de-6db2-4401-af25-10e3b6a5896d`
- **Wall time/tokens:** 313.703 s backend / about 317.714 s browser; 68,026 tokens
- **PLAN:** correctly selected comparison and extracted eleven positions, separating subprocessor authorization/notice from flow-down. This improved one Lite modeling error, but the synthetic all-topics roll-up remained.
- **ACT/LOCK:** correctly proved subprocessor consent/notice/termination and separately proved flow-down. It still treated EU SCC Module 2 and the UK Addendum as only partial because no single passage contained both. It also downgraded the 24-hour breach term and unrestricted on-request audit right, making Deep less accurate than Lite on those positions.
- **Rendered result:** catastrophically incomplete. It begins with `Insufficient Evidence Provided`, states that alignment is strong, then exposes drafting/meta-prompt text such as `Let’s carefully draft the paragraph according to the Role` and an unfinished “Sentence 1” planning bullet. It is truncated at 816 output characters and does not deliver the requested comparison.
- **Release:** structural validation found missing `scope` and `qualifications` sections plus missing P1/P2/key-finding headings. The run nevertheless released with limitations because no retry budget was available; only 5/11 requirements were covered.
- **Verdict:** **Fail**. Deep took nearly five minutes, did not correct evidence composition, introduced additional false negatives, and leaked internal drafting text into the answer.

### Lite vs Deep comparison

- Lite was about 205 seconds faster and produced a more readable, though legally unreliable, report.
- Deep improved subprocessor proposition granularity but was worse overall: longer latency, more inconsistent statuses, extreme truncation, and visible meta-prompt leakage.
- The primary factual failures form in **VERIFY/LOCK** because related clauses are not composed to satisfy multi-part playbook positions. The severe user-facing failures form in **RENDER** because title/body consistency, citation pairing, prompt-leak detection, and output-budget fallback are missing. The synthetic `open.p1` failure originates in **PLAN**.

### What to enhance

1. Represent every playbook position as atomic parts and allow compatible agreement clauses to jointly prove it; preserve separate citations for each part.
2. Suppress the synthetic all-topics roll-up from verification and rendering once atomic playbook positions exist.
3. Add deterministic title/body polarity checks and reject outputs containing planning/meta-instruction phrases.
4. Render playbook comparisons as a compact table with `Playbook position`, `Agreement evidence`, `Status`, `Difference`, and `Action`; fall back to this deterministic table when prose synthesis truncates.
5. Treat unrestricted/on-request rights as satisfying an annual minimum unless a contractual frequency restriction makes them weaker.

---

## Q8 - Lite only - compound multi-doc (Article 28 + playbook + top-5 risks)

- **Documents:** DPA target + `Playbook.pdf` (marked playbook/reference; a different, generic playbook than Q7's `DPA_AI_Prompt_Repository_Playbook.docx.pdf`, uploaded fresh for this run since the vault did not have a playbook loaded)
- **thinkingMode:** lite (Deep skipped for this question at user's direction)
- **Session id:** `an_32a6ad08-5c65-4c38-974a-631f2fcaf85e`
- **Wall time:** ~236 s (19:19:21Z start to first render-complete observation ~19:23:57Z)
- **Backend evidence trace:** `logs/analysis/an_32a6ad08-5c65-4c38-974a-631f2fcaf85e.log`

### Question (verbatim)

Check this DPA for GDPR Article 28 compliance — subject matter, duration, nature and purpose, data categories and data subjects, and whether the mandatory Article 28(3) processor obligations are present and adequate. Also check it against our uploaded playbook. Separately, rank the top 5 customer-side onboarding risks (liability, audit, subprocessors, termination, transfers) with evidence from the DPA.

### What should be returned

Three clearly separated facets: (1) an Article 28 particulars + mandatory-clause table matching Q4's expectations; (2) a playbook alignment check citing both documents; (3) five ranked customer-side onboarding risks (liability, audit, subprocessors, termination, transfers) each with DPA evidence and a negotiation angle.

### What was rendered

**Facet 1 (Article 28):** Materially correct and a clear improvement over the 2026-09-02 run and over L1/L2 in the lite-only file. Duration, nature/purpose, and both categories rows are correctly labelled `Partially covered` / `Partially covered - details in schedule` with real clause quotes (3.5.6, 2.3, 5.1.3) and an accurate missing-materials list (Annex 1 of Addendum 2; Annex 1 of Addendum A1). Subject matter and all eight Article 28(3)(a)-(h) mandatory clauses plus Article 28(4) flow-down are `Strong` with distinct, correctly grounded clause citations (3.3, 3.6.3, 3.6.1, 3.8.7, 3.5.5 ×2, 3.5.6, 3.9.1, 3.8.2) — no orphaned parent row, no single-passage overreach.

**Facet 2 (playbook):** Structurally weaker. The compliance-check paragraph states an overall `Insufficient data` headline while its own body cites mostly `Strong`/`Present & adequate`-style findings for other DPA obligations — a title/body contradiction of the same kind flagged in Q7 Lite. It also leaks an internal identifier into user-facing prose: *"the agreement contains a critical Gap regarding Facet 2 P6"*. The one substantive finding — general (non-privacy) liability is uncapped, no 12-month fee cap or consequential-damages exclusion — is a real, well-evidenced playbook gap, but it is buried in noise.

**Facet 3 (top-5 risks):** Only produces ~2.5 of 5 requested risk items (subprocessor management, transfers, then liability cut off mid-sentence) before the response hits `[Report ended at the length limit for standard depth. Remaining detail was omitted.]`. Audit and termination risks — both explicitly requested — never appear. No negotiation recommendations are rendered for this facet at all, contrary to the question's "with evidence" framing implying actionable ranking.

### Faults

1. **Symptom:** playbook facet's headline status (`Insufficient data`) contradicts the mostly-strong findings in its own narrative.
   **Likely layer:** RENDER/synthesis polarity check (same defect class as Q7 Lite/Deep).
   **Severity:** high.
2. **Symptom:** internal requirement id `Facet 2 P6` rendered directly into user-facing text.
   **Likely layer:** RENDER label sanitization.
   **Severity:** medium.
3. **Symptom:** the risk-ranking facet is truncated after 2-3 of 5 requested items; audit and termination risks are dropped entirely, and no negotiation content survives for any of them.
   **Likely layer:** output token budgeting for compound multi-facet standard-depth reports; same defect class as Q5/Q6/Q7's mid-sentence truncations, but here it also silently drops explicitly enumerated user sub-asks (audit, termination) rather than merely cutting prose.
   **Severity:** high.

### Lite vs Deep

Deep was skipped for this question at the user's direction; no comparison available.

### What to enhance

1. Reuse Q4's now-correctly-working Article 28 particulars pipeline as the template for the other two facets in a compound run — it demonstrates aggregation and status/evidence consistency are solvable.
2. Apply the same title/body polarity check recommended for Q7 to every facet independently, not just the primary compliance facet.
3. For an explicit N-item ranked list (top 5 risks), reserve output budget per named item before free-form prose, and never let the length cap silently drop an item that was named in the user's question (audit, termination).

---

## Q9a-d - Lite only - follow-up memory chain

- **Documents:** Mastercard DPA only
- **thinkingMode:** lite
- **Session id (all four turns, same thread):** `an_a5255808-29b4-440c-afac-2b87c4d99bb2`
- **Backend evidence trace:** `logs/analysis/an_a5255808-29b4-440c-afac-2b87c4d99bb2.log`

### Q9a - "Analyze GDPR compliance." (baseline, ~219 s)

Materially better than 09-02's Q9a, which collapsed 55 findings into one generic row plus a contradictory risk. This run renders 18 distinct rows (Article 28 particulars + all mandatory clauses), 10 `Strong`, 3 `Partially covered`, 5 `Cannot determine`.

**Faults:**
1. **Cross-run VERIFY nondeterminism on identical clauses.** Article 28(3)(g) (deletion/return, cl. 3.5.6) and (3)(h) (audit, cl. 3.9.1) are `Cannot determine` here, but the *same clauses on the same document* were `Strong` in Q8 (`an_32a6ad08...`), run minutes earlier. Nothing about the document changed between runs; only the surrounding question did. This generalizes the Q3-Deep-vs-Lite nondeterminism already logged — it now reproduces **within the same lite mode, run-to-run**, which is a stronger signal that VERIFY thresholds are not deterministic for a fixed clause/requirement pair. Severity: high.
2. **Cross-section duration contamination persists.** Duration is `Strong` again via clause 4.4.5, which the 09-03-lite-only report's root-cause section already identified as belonging to the controller-to-controller section, not the controller-to-processor relationship this DPA governs for Supplier. This is the same unfixed defect (`Recommended next implementation slice #3`). Severity: high.
3. **Risk citation/evidence mismatch plus leaked internal label.** The HIGH risk "Reasoned refusal notice" cites clause 3.5.3 (marketing communications/cookies opt-in-opt-out) as evidence — a clause with no connection to GDPR Article 12(4) refusal notices — and its own finding text is the raw internal label `gdpr art12 4 reasoned refusal notice gap` rather than a rendered sentence. This is both a grounding failure (wrong clause) and a render sanitization failure (internal key leaked verbatim). Severity: high.
4. Progress UI showed "Checking the playbook…" as a step label even though no playbook document was attached to this analysis — a cosmetic but potentially confusing mislabeled stage name.

### Q9b - "Focus on subprocessors." (follow-up, ~40 s)

A clear improvement over 09-02, where the equivalent follow-up reported real subprocessor clauses as missing. Here it correctly narrows scope and grounds three requirements in clause 3.8.7 (notice/objection/suspension/termination) and 3.8.2 (flow-down), both `Strong` and accurately quoted.

**Fault:** "Verify the primary processor's liability for sub-processor compliance and performance" is rendered `Insufficient data — No related clauses found`, but clause 3.8.6 ("Supplier will remain fully liable towards Mastercard for the performance by each Sub-Processor...") is on record in this exact session's evidence pool (visible in the Q8 retrieval trace under `outsourcing_governance`). The requirement was not matched to evidence that both exists and was already retrieved once in this document. Severity: medium-high.

### Q9c - "Can we object to a subprocessor change?" (follow-up, fast)

**This is the most severe fault found in the Q8-Q14 continuation.** The answer states: *"It is currently uncertain whether you can object... No express contractual clause governing subprocessor appointment, notification timelines, or objection procedures was identified within the provided text fragments."* This directly contradicts clause 3.8.7, quoted two turns earlier in this *same session* (Q9b), which gives Mastercard an explicit right to object to a new subprocessor and, if the objection cannot be accommodated, to suspend processing or terminate the agreement. Unlike 09-02's Q9c (which merely re-rendered stale prior findings without investigating the new ask), this run re-investigated from scratch and reached the *opposite, wrong* conclusion despite the correct evidence being available in the same conversation. This indicates the follow-up path is not reliably reusing or re-deriving from evidence already surfaced earlier in the same session. Severity: blocker.

### Q9d - "What should we negotiate on that clause?" (follow-up, 3 s to ASK pause)

Exact reproduction of the 09-02 Q9d bug, unfixed after this iteration's other pipeline work: the system responds *"I need a few details before I can finish this analysis: Operation 'draft_suggestion' is not fully supported in this release. Confirm to run a risk-flag analysis instead, or rephrase,"* offering only `run_risk_flag` / `cancel`. A clear, high-confidence negotiation ask referencing established conversational context ("that clause") is blocked rather than answered. Severity: blocker.

### What to enhance

1. Make VERIFY status for a fixed (clause, requirement) pair deterministic — cache or reuse the Q8-style strong verification of clauses 3.5.6/3.9.1 instead of re-deriving a different answer for the same document in a sibling run.
2. Fix the clause 4.4.5 cross-section contamination (controller-to-controller duration used to answer a controller-to-processor question) — flagged in the 09-03-lite-only report and still present.
3. Add an entailment/relevance check before a risk finding is allowed to cite a clause — 3.5.3 (marketing/cookies) should never ground a "reasoned refusal notice" finding — and never render an internal snake_case/lowercase label as the finding sentence.
4. Before answering a follow-up that revisits a topic covered in an earlier turn of the same session, prefer the evidence already retrieved and verified in that session over a fresh independent verification that can silently contradict it (Q9c vs Q9b).
5. Implement `draft_suggestion`/negotiation as a real path, or at minimum let it run risk-flag-based negotiation framing automatically instead of blocking on a manual ASK step for a well-formed, high-confidence request.

---

## Overall conclusion - Q8-Q14 continuation (2026-09-03, second half of the 15-question suite)

All 15 planned questions have now been run live at least once across the three 2026-09 eval files (Q1-Q7 and Q15 paired lite/deep in the first half of this file; Q8-Q14 lite-only here, per user direction to skip Deep on Q8 onward).

**What has clearly improved since 2026-09-02 and since the mid-suite 2026-09-03 lite-only checkpoint:**
- The Article 28 particulars/mandatory-clause pipeline (Q4/Q8/Q9a) now reliably grounds most sub-requirements in specific, correct clauses instead of collapsing to one orphaned parent row — the dominant 09-02 failure mode is largely fixed for this shape of question.
- Follow-up scoping works structurally: Q9b correctly narrowed to subprocessors, Q15 (in the first half) correctly preserved session/format-only intent.
- Broad compliance questions (Q12 rights review, Q13 transfers) now produce complete, mostly well-grounded per-requirement tables instead of orphaning findings — a major regression from 09-02 that appears resolved.

**What is newly visible or still broken in this continuation, roughly in order of severity:**
1. **Same-session self-contradiction (Q9c)** — the single worst fault of the whole suite: the system denied a fact it had proven with a citation one turn earlier in the same conversation. This is more damaging to user trust than any truncation or hedging fault, because it means even a session's own established findings are not reliably reused.
2. **Cross-run/cross-mode VERIFY nondeterminism** — the same clause/requirement pair (Art 28(3)(g)/(h), cl. 3.5.6/3.9.1) was `Strong` in Q8 and `Cannot determine` in Q9a minutes later, on the identical document. This generalizes a defect previously seen only Deep-vs-Lite (Q3) to lite-vs-lite, run-to-run.
3. **Negotiation/draft_suggestion is still entirely blocked (Q9d)** — an exact, unfixed reproduction of the 09-02 bug.
4. **Internal key/label leakage into user-facing prose** is now the most common single defect class, appearing in some form in nearly every question run this session: `Facet 2 P6` (Q8), `gdpr art12 4 reasoned refusal notice gap` (Q9a), `clause E4`/`clause E5.5` (Q12), `Per proofStandard... evidenceState=incorporated` (Q13), `[open.p1]` citations (Q14). This looks like a single missing render-sanitization pass that would fix many findings at once.
5. **Broad, open-ended asks with no explicit checklist (Q10, Q11) still underperform** relative to explicit-checklist questions. Q10 tunnel-visions onto 2 liability propositions; Q11 answers "find contradictions" by describing a precedence clause instead of searching for any. This suggests the open-proposition-generation step still needs a broader default materiality/topic scan specifically for unscoped requests, even though scoped/explicit requests (Q4, Q12, Q13) now perform well.
6. **Cross-section role contamination persists** (clause 4.4.5, controller-to-controller duration answering controller-to-processor questions) — flagged in the 09-03 lite-only report's root-cause list and reproduced again in Q9a.

**Net assessment:** the explicit, checklist-shaped compliance questions (Q4, Q8's particulars facet, Q12, Q13) have moved from broadly failing to broadly partial/passing since 09-02. The remaining failures cluster in three places: (a) open-ended/unscoped asks that need a materiality scan rather than a narrow hypothesis set, (b) follow-up/session consistency (Q9b-d), where new evidence is not reliably reconciled with prior-turn evidence in the same conversation, and (c) a render-layer leak of internal pipeline vocabulary into user text, which is likely the cheapest of the three to fix and would improve the polish of nearly every answer in this suite.
