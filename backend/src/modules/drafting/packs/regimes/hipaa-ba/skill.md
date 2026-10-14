
## hipaa-ba/skill.md
 
### When this applies
A party creates, receives, maintains, or transmits PHI on behalf of a HIPAA-covered entity or another business associate.
 
### Requirements — statutory floor (45 CFR §164.504(e), applies to every BAA regardless of counterparty)
- MUST describe the business associate's permitted and required uses and disclosures of PHI, and prohibit anything else.
- MUST require appropriate safeguards, including Security Rule administrative, physical, and technical safeguards for electronic PHI.
- MUST require the business associate to report breaches and security incidents involving PHI.
- MUST require any subcontractor with PHI access to agree in writing to the same restrictions as the business associate.
- MUST require the business associate to support the covered entity's obligations for individual access, amendment, and accounting-of-disclosures requests.
- MUST make internal practices and records available to HHS for compliance review.
- MUST require return or destruction of PHI at termination, where feasible; if infeasible, obligations continue to apply to any retained PHI.
- MUST include a termination-for-cause right for material breach.
### Reference implementation (from a real university BAA — treat as a strong template, not a universal legal minimum)
The specific numeric deadlines below come from one institution's negotiated contract, not from HIPAA itself — HIPAA's own text generally says "without unreasonable delay," not a fixed day count. Use these as a starting point for your own SHOULD-level defaults, and let your legal team decide whether to hold this line or negotiate differently per deal:
- SHOULD require breach/security-incident notification to the covered entity within a short fixed window (this reference contract uses 2 business days — tighter than the statutory "without unreasonable delay" standard).
- SHOULD require a written corrective-action plan within a fixed window after a breach (this reference contract: 20 calendar days).
- SHOULD require response to individual-rights requests (restriction, amendment, accounting, access) within fixed windows (this reference contract: 5 business days to acknowledge, 15-30 calendar days to fulfill, varying by request type).
- SHOULD include a "prohibition on sale of PHI for remuneration" clause distinct from the general use/disclosure restriction (HITECH Act §13405(d)(2)) — this is a separate, additional restriction beyond ordinary use limits, easy to omit if only working from the core 164.504(e) list.
- SHOULD include a minimum-necessary standard clause, requiring the business associate to limit use/disclosure to what's practicably necessary for the purpose.
- SHOULD require the business associate to document any modification it makes to PHI and retain that record for a defined period.
### Local quirks
- If the covered entity is California-based (as in this reference contract), state law layers on top: Cal. Civil Code §§1798.29, 1798.82 (breach definitions/notice) and Cal. Health & Safety Code §1280.15. Cross-reference the `california` jurisdiction pack rather than duplicating these here.
 