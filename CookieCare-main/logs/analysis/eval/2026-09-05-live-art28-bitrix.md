# Live eval — CookieCare Analyze — 2026-09-05 — Bitrix24/Alaio Art 28

Documents: `C:\Users\abhinav.yadav_randst\Downloads\DPA - 1.docx` (Alaio / Bitrix24 DPA)
Competitor reference: `C:\Users\abhinav.yadav_randst\Downloads\chat_message (2).md`
Server: `npm run dev` → http://localhost:3000
Session: `an_d8021da4-5d61-4837-b7db-15dc0296775e`
Job: `ddda0f9f-7b4f-44e8-94a3-b2e17c887133`
Wall time: ~110 s
Backend log: `logs/analysis/an_d8021da4-5d61-4837-b7db-15dc0296775e.log`
UI report capture: `logs/analysis/eval/2026-09-05-art28-bitrix-ui-report.txt`
Browser: headed Chrome via `scripts/live-art28-bitrix-browser.mjs`

| ID | Category | Question | Session | Shape | Grounding | Verdict | Top fault |
|----|----------|----------|---------|-------|-----------|---------|-----------|
| Q1 | Compliance + table | Evidence-based Art 28 review (long prompt) | `an_d8021da4…` | Partial | Partial | **partial** | (g) residual-limitation fix worked; Appendix 1 in the uploaded DPA was treated as missing; duplicate/mismatched rows; (a) still Strong vs competitor Partial |

---

## Q1 — Compliance — Bitrix24/Alaio Art 28

- **Asked at:** 2026-09-05T05:48:09Z
- **Documents:** DPA only (`DPA - 1.docx`)
- **thinkingMode:** lite (UI default)
- **answerStyle:** narrative (UI default; BLUF table path still used for compliance_check)
- **Follow-up of:** none
- **Job / session:** `ddda0f9f-7b4f-44e8-94a3-b2e17c887133` / `an_d8021da4-5d61-4837-b7db-15dc0296775e`
- **Wall time:** ~110 s
- **Backend log:** `logs/analysis/an_d8021da4-5d61-4837-b7db-15dc0296775e.log`

### Question (verbatim)

(Same long evidence-based Art 28 prompt the user supplied — see run script.)

### Competitor ground truth (material)

From `chat_message (2).md`:

| Requirement | Competitor |
|---|---|
| Subject matter / duration / nature-purpose / data cats / subjects / controller rights | ✅ Present and adequate (Appendix 1 + Term + §3) |
| (a) Documented instructions | ⚠️ Partially covered — missing Union/MS legal-compulsion notify limb |
| (b)–(f), (h), 28(4) | ✅ Present and adequate (with commercial caveats on audit) |
| **(g) Delete or return** | ❌ / Partially covered — **deletion only, no return choice** (cl. 2.5) |
| Missing materials | ToS; Infrastructure/Sub-processors doc; Company Data Protection Policy; AWS GDPR docs |

### What VERIFY logged for (g) — the fix under test

```
REQUIREMENT: art28_3_g_deletion_return
PROOF STD:   …gives the CONTROLLER an actual choice between deletion and return…
[1] S10 clause-2.5 → proves + residual gap
  gap: The passage mandates deletion only and does not provide an alternative
       option for the controller (Administrator) to elect the return of personal data.
  fix: Add express terms providing the Administrator with the option to choose
       between the return or deletion of personal data upon term expiry.
RESULT: proves — S10 wins.
```

Rendered row:

`Art 28(3)(g) Deletion Return | ⚠️ Partially covered | cl. 2.5 | … | Add express terms providing the Administrator with the option to choose between the return or deletion…`

**Verdict on the session fix:** pass for the exact Bitrix failure mode that motivated the change. Status emoji also present (`⚠️` / `✅` / `➖`).

### Where we still disagree with the competitor (or are wrong)

1. **Appendix 1 is in the uploaded DOCX** (`DPA-1-extracted.txt` contains the categories/services lists). Competitor treated it as present. We marked subject matter / nature as “details in schedule / Obtain Appendix 1” and left data categories + data subjects as **Analysis incomplete**. That is a retrieval/verify-completion fault, not a true missing annex.

2. **Duration:** competitor Strong via Term definition + §3 DPA lifespan. We Partial off cl. 2.5’s 90-day deletion timeline (classic related≠duration risk, partially mitigated by remediation text).

3. **(a) Documented instructions:** we ✅ Strong; competitor ⚠️ Partial for the missing legal-compulsion notification limb. Intentional for this change (limb scoped to (h) rule, not rewritten into (a) this pass) — still a factual gap vs competitor.

4. **Duplicate / crossed rows:** a second “(g)”-labelled open proposition cites **cl. 2.4** (instructions) and recommends extending subprocessor objection — evidence/action mismatch. Duplicate Strong rows for (e) and 28(4).

5. **Report shape:** BLUF matrix present, but Bottom line rendered after the matrix in the saved snapshot; no prioritized remediation section matching competitor §5; missing materials list understates competitor’s ToS / sub-processor list / policy refs.

### Overall

- **Session goal (g residual limitation → Partial + remediation):** **achieved.**
- **Full factual parity with competitor Art 28 memo:** **not yet** — Appendix 1 under-used, (a) second limb, duration, duplicates, incomplete category rows.

### What to enhance next (smallest general fixes)

1. Treat appended schedules that *are* in the same uploaded document as in-scope evidence, not “Obtain Appendix 1.”
2. Deduplicate open-proposition vs catalog requirement rows when both fire for the same Art 28 particular.
3. Content follow-up: either extend `art28_3_a` / `art28_3_h` proof standards for the legal-compulsion / unlawful-instruction limbs carefully, or accept competitor’s (a) Partial as a known content gap.
