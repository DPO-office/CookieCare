 
## cpra-service-provider/skill.md
 
### When this applies
A party processes personal information of California consumers on behalf of a business, under a written contract, for a business purpose.
 
### Requirements — statutory floor (Cal. Civ. Code §1798.140(ag), §1798.100)
- MUST prohibit the service provider from selling or sharing the personal information.
- MUST prohibit retaining, using, or disclosing the personal information for any purpose other than the specified business purpose.
- MUST prohibit retaining, using, or disclosing the information outside the direct business relationship between service provider and business (except where a permitted subcontractor is engaged).
- MUST prohibit combining the personal information received from the business with personal information from other sources, except as permitted for the business purpose and in compliance with CCPA/CPRA.
- MUST prohibit sharing or processing the personal information for targeted or cross-context behavioral advertising.
- MUST require the service provider to notify the business if it determines it can no longer meet its CCPA/CPRA obligations.
- MUST require any subcontractor engaged by the service provider (or by another engaged party) to be bound by a written contract observing the same requirements, and require the business be notified of that engagement.
### Reference implementation (from a real production SaaS vendor contract — good structural template)
- SHOULD structure consumer-rights cooperation as: service provider assists the business in responding to verifiable consumer requests (deletion, access, know/correct), but redirects any consumer who contacts the service provider directly back to the business without acting on the request itself — a clean, commonly-used allocation of responsibility worth using as the default pattern.
- SHOULD grant the business inspection/audit rights at the business's own expense, with advance notice to the service provider — matches the statutory "reasonable and appropriate steps to ensure compliance" language without over-specifying mechanics.
- SHOULD require security measures "appropriate to the nature of the personal information," referencing a separate technical/organizational measures exhibit rather than embedding technical detail in the main body — mirrors how DPAs typically handle this (see Appendix 2 pattern in the reference contract) and keeps the main contract body auditable against the checklist without drowning it in infrastructure detail.
- SHOULD specify the choice on data return/deletion at termination is the business's, not the service provider's — matches statutory intent that the business controls this decision, and this specific point is easy to accidentally invert if drafted from a service-provider-favorable template.
### Local quirks
- The reference contract notably omits: (a) a mandatory (vs. discretionary) audit-cooperation clause, and (b) any distinction between "service provider" and the newer CPRA "contractor" role. Flag both as open items for your legal team — the omissions may reflect the vendor's own risk posture rather than a defensible drafting choice for your product.
