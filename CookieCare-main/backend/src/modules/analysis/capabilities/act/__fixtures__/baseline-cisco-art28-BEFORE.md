# Baseline capture — Cisco DPA, GDPR Article 28 (BEFORE ACT rebuild)

Captured: 2026-08-30T08:08:35.420Z
Ask: "Review this DPA for GDPR Article 28 compliance."
Stopped reason: green
Findings: 34
Requirement assessments: 10

## Requirement assessments

| requirementId | status | judgement.compliance | summary |
|---|---|---|---|
| gdpr.article28.1.sufficient_guarantees | strong | present | The processor commits to implementing and maintaining appropriate technical and organisational secur |
| gdpr.article28.2.subprocessor_consent | cannot_determine | insufficient_evidence | The agreement does not provide enough verifiable language to confirm prior subprocessor authorisatio |
| gdpr.article28.3.a.documented_instructions | cannot_determine | insufficient_evidence | The agreement does not provide enough verifiable language to confirm documented instructions-only pr |
| gdpr.article28.3.b.confidentiality_commitment | strong | present | The processor ensures that persons authorised to process personal data have written contractual obli |
| gdpr.article28.3.c.security_measures | strong | present | The processor commits to implementing and maintaining technical and organizational security measures |
| gdpr.article28.3.d.subprocessor_obligations | conditional | partial | The processor remains fully liable to the controller for subprocessor performance. |
| gdpr.article28.3.e.data_subject_rights_assistance | strong | present | The processor is obligated to provide assistance to the controller in responding to data subject req |
| gdpr.article28.3.f.compliance_assistance | cannot_determine | insufficient_evidence | Assistance obligation clause is truncated and does not explicitly confirm complete assistance with s |
| gdpr.article28.3.g.data_deletion_or_return | cannot_determine | insufficient_evidence | The agreement does not provide enough verifiable language to confirm return or deletion after servic |
| gdpr.article28.3.h.audits_and_inspections | strong | present | The processor must make available information to demonstrate compliance with the DPA and Data Protec |

## Definition-of-done check (research doc §8)

Fill in by hand after reading the JSON — this is the real diff target
for ACT-Phase 5/6 once VERIFY is wired in:

- [ ] Duration: Present, evidence is the actual term clause (not termination/deletion language)
- [ ] Controller obligations: Present
- [ ] Confidentiality: Present/Strong, evidence is the confidentiality clause (not security language)
- [ ] Audit: partial/minor-gap is fair, independently derived (not inherited from shared risk pool)
- [ ] Subject matter: Present when baseline processing description exists
- [ ] Data-subject categories (pointer-only in source): Cannot determine, legitimately
- [ ] Six distinct PLAN requirements → six distinct assessments (no duplicate native-alias rows)
- [ ] No two unrelated requirements share supporting findings or near-identical summary text
- [ ] No row where status is Present/Strong while its own rationale denies coverage