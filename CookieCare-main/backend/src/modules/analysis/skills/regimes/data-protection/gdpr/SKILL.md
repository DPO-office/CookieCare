# EU GDPR private-entity obligations and data-subject rights

## Scope and source boundary
This skill maps the operative rules in Articles 1-99 of Regulation (EU) 2016/679 that impose obligations on private controllers or processors or grant rights enforceable against them.

It deliberately excludes:
- Chapters VI and VII (Articles 51-76) in full.
- Supervisory-authority, EDPB, Commission, court, and Member State duties or procedures.
- Public-authority-only rules, penalty machinery, delegated legislation, and final provisions.
- Voluntary code, certification, and monitoring-body machinery in Articles 40-43.

The supplied `GDPR EU.pdf` is the substantive source for this version. The supplied `GDPR UK.pdf` is not the UK GDPR: it is only the four-page Data Protection (Fundamental Rights and Freedoms) (Amendment) Regulations 2023 (S.I. 2023/1417). It supports the UK note under Article 9 but cannot support a complete current UK GDPR skill. UK-only rules and post-2023 UK amendments must not be inferred from it.

## How to analyse
1. Identify the entity's role, processing purpose, data types, data subjects, systems, recipients, locations, and transfer chain.
2. Apply only rules triggered by those facts. A privacy notice, DPA, internal policy, product flow, and incident record prove different things.
3. Separate `covered`, `partial/vague`, `missing`, `not applicable`, and `cannot determine from document`.
4. Do not convert a statutory exception into a default. Require the facts and records supporting the exception.
5. Distinguish a contractual promise from operational evidence. A good clause may still require records, workflows, settings, logs, assessments, or notices.
6. Use the exact article citation authored below. Do not invent recitals, guidance, enforcement outcomes, or UK equivalence.

## clause:lawful_basis
Where each purpose is mapped to an Article 6 basis and, where relevant, a compatible-further-use assessment.

Good evidence names the purpose, basis, necessity rationale, and legitimate-interests balance where used. A generic statement that processing is "lawful" is not enough.

## clause:consent_management
How consent is requested, recorded, verified for children where applicable, and withdrawn.

Look for separate and plain consent language, proof records, granular purposes, an equally easy withdrawal route, and controls against unnecessary service conditionality.

## clause:special_category_data
Article 9 categories, the applicable Article 9(2) condition, and secrecy or other safeguards.

An Article 6 basis alone is insufficient for special-category processing.

## clause:criminal_offence_data
Article 10 criminal-conviction, offence, allegation, and related security-measure data.

Require authorising law or official control plus applicable safeguards; do not treat legitimate interests alone as sufficient.

## clause:privacy_notice
Articles 12-14 transparency content, language, accessibility, timing, and new-purpose notices.

Check direct and indirect collection separately because their required content, source disclosure, timing, and exceptions differ.

## clause:data_subject_rights
The substantive conditions, exceptions, and fulfilment controls for Articles 15-22 and related rights.

Do not mark a right covered merely because a document says "applicable data protection rights."

## clause:data_subject_request_handling
Request intake, identity verification, routing, deadlines, extension or refusal notices, fulfilment, and evidence.

The workflow should support all applicable channels and rights without requiring unnecessary information.

## clause:retention_and_deletion
Purpose-based retention, record accuracy, mid-term erasure, restriction, downstream action, and processor return or deletion.

Deletion only at contract termination does not satisfy Article 17 rights during the service.

## clause:information_security
Risk-based technical and organisational security measures under Article 32.

Look for confidentiality, integrity, availability, resilience, restoration, testing, access controls, and instruction-only processing rather than generic "industry standard" wording alone.

## clause:controller_accountability
Measures, policies, ownership, review cycles, and evidence through which the controller demonstrates compliance.

Accountability is not satisfied by assigning all compliance responsibility to a processor.

## clause:privacy_by_design
Design-stage and default-setting controls that minimise amount, use, retention, and accessibility.

Look for requirements that operate before launch and throughout the processing lifecycle.

## clause:joint_controller_arrangement
Allocation of joint-controller responsibilities, actual roles, notice duties, rights handling, and a data-subject-facing summary.

Private allocation cannot remove the individual's right to proceed against either joint controller.

## clause:eu_representative
Written Article 27 EU representative designation, location, accessibility, mandate, and exception analysis.

Do not apply this EU-specific requirement without Article 3(2) territorial facts.

## clause:processor_terms
The binding written Article 28 terms between controller and processor, including mandatory processing particulars and obligations.

Cross-check every Article 28(3) item; broad compliance language does not necessarily supply omitted particulars.

## clause:processor_assistance_obligation
Operational processor assistance for rights, security, breach response, DPIAs, and related controller duties.

Evaluate nature-of-processing and available-information qualifiers, response channels, timing, responsibility, and any cost gate.

## clause:audit_and_compliance_evidence
Processor information, audit, inspection, evidence, and unlawful-instruction warning duties.

Reasonable audit mechanics may regulate exercise but must not defeat Article 28(3)(h).

## clause:records_of_processing
Article 30 records for controller and processor roles.

Check required fields, written or electronic form, role accuracy, and whether the under-250-person exception is actually available.

## clause:data_subject_breach_notice
Article 34 communication to individuals after a breach likely to cause high risk.

Check trigger, undue-delay standard, plain-language content, contact details, consequences, mitigation, and narrowly applied exceptions.

## clause:data_protection_impact_assessment
Article 35 screening, assessment content, DPO advice, safeguards, data-subject views where appropriate, approval, and reassessment.

The DPIA must precede likely-high-risk processing and address necessity, proportionality, and rights impacts.

## clause:data_protection_officer
Private-sector DPO trigger assessment, designation, expertise, independence, resources, access, confidentiality, conflicts, and internal tasks.

A privacy contact title alone does not prove Article 37-39 compliance.

## clause:government_access_request
Treatment of foreign court or administrative demands for personal data.

Require a valid international agreement or another Chapter V transfer ground rather than treating the order itself as sufficient.

## clause:automated_decision_disclosure
Article 22 scope, exception, meaningful information, human intervention, viewpoint, and contest safeguards.

Differentiate automated support from a solely automated decision with legal or similarly significant effect.

## clause:judicial_remedies_and_compensation
Rights to judicial relief, mandated representation, compensation, and the controller/processor liability allocation.

Contract terms cannot eliminate statutory remedies against the responsible controller or processor.

## clause:research_and_statistics
Article 89 safeguards for public-interest archiving, scientific or historical research, and statistical processing.

Prefer non-identifying data where possible; otherwise require minimisation and technical or organisational safeguards such as pseudonymisation.

## rule:gdpr.art5.1
Check every processing activity against lawfulness, fairness, transparency, purpose limitation, data minimisation, accuracy, storage limitation, and integrity/confidentiality.

Raise a gap where language authorises unrestricted purposes, excessive collection, indefinite retention, stale data, or security unrelated to risk. Citation: EU GDPR Art 5(1).

## rule:gdpr.art5.2
The controller must own and be able to demonstrate compliance with Article 5(1).

Look for governance and evidence, not only a promise that another party complies. Citation: EU GDPR Art 5(2).

## rule:gdpr.art6.1
Require at least one valid Article 6(1) basis for each purpose. Test necessity for contract, legal obligation, vital interests, and public task; test necessity and balancing for legitimate interests.

Do not accept bundled bases without purpose mapping. Citation: EU GDPR Art 6(1).

## rule:gdpr.art6.4
For a new purpose unsupported by consent or law, require a compatibility assessment covering purpose links, collection context and relationship, data nature, consequences, and safeguards.

An updated notice does not itself make incompatible processing lawful. Citation: EU GDPR Art 6(4).

## rule:gdpr.art7.1
Where consent is the basis, the controller must retain evidence showing who consented, when, how, what they were told, and which purposes were accepted.

Citation: EU GDPR Art 7(1).

## rule:gdpr.art7.2
A consent request mixed with other terms must be distinguishable, accessible, intelligible, and in clear plain language.

Flag hidden, preselected, bundled, or internally inconsistent consent drafting. Citation: EU GDPR Art 7(2).

## rule:gdpr.art7.3
Inform individuals before consent that they may withdraw at any time; withdrawal must be as easy as giving consent and cannot retroactively invalidate prior lawful processing.

Check that withdrawal reaches all systems and downstream recipients where needed. Citation: EU GDPR Art 7(3).

## rule:gdpr.art7.4
Test whether consent is freely given when a service or contract is conditional on processing unnecessary to perform it.

Flag take-it-or-leave-it consent without a necessity rationale or genuine choice. Citation: EU GDPR Art 7(4).

## rule:gdpr.art8.1-2
For consent-based information-society services offered directly to children, determine the applicable EU Member State threshold, obtain parental authorisation below it, and make reasonable verification efforts.

Do not hard-code 16: Member States may lower the threshold to no less than 13. Citation: EU GDPR Art 8(1)-(2).

## rule:gdpr.art9.1-3
Identify special-category data and require a specific Article 9(2) condition in addition to an Article 6 basis. For Article 9(2)(h), require professional secrecy or an equivalent duty.

The supplied UK instrument only removes obsolete EU-rights wording from UK Article 9(2)(g) and (j); it does not create a general private-sector exception. Citation: EU GDPR Art 9(1)-(3); S.I. 2023/1417 reg 2(4)-(5).

## rule:gdpr.art10
Process criminal-conviction or offence data only under official control or authorising law with appropriate safeguards.

Flag a comprehensive criminal register held outside official control. Citation: EU GDPR Art 10.

## rule:gdpr.art11.1
A controller need not maintain or acquire identifying information solely to comply with GDPR where processing purposes do not require identification.

Do not treat Article 11 as a reason to collect extra identity data "just in case." Citation: EU GDPR Art 11(1).

## rule:gdpr.art11.2
Where identification is genuinely impossible, inform the person if possible. Reactivate Articles 15-20 when the person provides sufficient identifying information.

Do not require the controller to collect extra identification solely to maintain data, but do not use Article 11 as a blanket refusal. Citation: EU GDPR Art 11(2).

## rule:gdpr.art12.1-2
Communications under Articles 13-22 and 34 must be concise, transparent, intelligible, accessible, and in clear plain language, especially for children. The controller must facilitate rights.

Flag obscure channels, legalistic language, or unsupported inability-to-identify refusals. Citation: EU GDPR Art 12(1)-(2).

## rule:gdpr.art12.3
Act without undue delay and within one month after receipt. A complexity or volume extension may add no more than two months and requires notice and reasons within the first month; use electronic response where appropriate for electronic requests.

This is the EU rule. The supplied UK PDF cannot substantiate current UK deadline amendments. Citation: EU GDPR Art 12(3).

## rule:gdpr.art12.4
If no action is taken, give reasons without delay and within one month and explain available complaint and judicial-remedy routes.

This skill checks the controller's notice, not supervisory-authority procedure. Citation: EU GDPR Art 12(4).

## rule:gdpr.art12.5-6
Information and action are ordinarily free. Fee or refusal requires controller proof that a request is manifestly unfounded or excessive; an identity request requires reasonable doubt.

Flag standard fees, blanket repeat-request refusals, or excessive identity collection. Citation: EU GDPR Art 12(5)-(6).

## rule:gdpr.art12.7
Where standardised privacy icons are used electronically, ensure they are easily visible, intelligible, legibly coloured, and machine-readable.

Do not treat decorative icons as a substitute for required notice content. Citation: EU GDPR Art 12(7).

## rule:gdpr.art13.1-2
At direct collection, provide controller and DPO contacts; purposes and bases; legitimate interests; recipients; transfer basis and safeguards; retention; rights; consent withdrawal; complaint information; mandatory/contractual status and consequences; and meaningful automated-decision information.

Evaluate every item independently. Citation: EU GDPR Art 13(1)-(2).

## rule:gdpr.art13.3-4
Before further processing directly collected data for a new purpose, provide that purpose and relevant further information unless the person already has it.

Check timing and proof of prior knowledge. Citation: EU GDPR Art 13(3)-(4).

## rule:gdpr.art14.1-2
For indirectly obtained data, provide the Article 14 information, including data categories and source, whether the source was public, transfer information, rights, and meaningful automated-decision information.

Do not substitute an Article 13 notice that omits source-specific fields. Citation: EU GDPR Art 14(1)-(2).

## rule:gdpr.art14.3-5
Deliver indirect-data notice within a reasonable period and no later than one month, at first communication, or before first disclosure, as applicable. Give new-purpose notice in advance.

Require exact facts for an exception. For impossible or disproportionate notice, require compensating protective measures including public availability. Citation: EU GDPR Art 14(3)-(5).

## rule:gdpr.art15
Confirm processing and provide access, required contextual information, transfer safeguards, and a copy. A fee is limited to further copies and reasonable administrative cost; protect others' rights without nullifying access.

Citation: EU GDPR Art 15.

## rule:gdpr.art16
Rectify inaccurate data without undue delay and permit completion of incomplete data, including by supplementary statement where appropriate.

Citation: EU GDPR Art 16.

## rule:gdpr.art17
Erase without undue delay when an Article 17(1) ground applies, take reasonable downstream steps for public data, and use an Article 17(3) exception only to the necessary extent.

Check mid-term requests separately from processor deletion at contract end. Citation: EU GDPR Art 17.

## rule:gdpr.art18
Restrict processing for contested accuracy, opposed erasure of unlawful processing, legal-claim retention, or a pending objection. While restricted, process only under Article 18(2) and notify before lifting.

Citation: EU GDPR Art 18.

## rule:gdpr.art19
Notify each recipient of rectification, erasure, or restriction unless impossible or disproportionate, and identify recipients to the individual on request.

Check operational propagation to subprocessors, integrations, and other recipients. Citation: EU GDPR Art 19.

## rule:gdpr.art20
For automated processing based on consent or contract, provide data supplied by the individual in a structured, commonly used, machine-readable format and transmit directly where technically feasible.

Apply the public-task and third-party-rights limits. Citation: EU GDPR Art 20.

## rule:gdpr.art21
After objection to legitimate-interest or public-task processing, stop unless compelling overriding grounds or legal claims are demonstrated. Direct marketing and related profiling must stop unconditionally.

Disclose the right clearly and separately by first communication and support automated objection for information-society services. Citation: EU GDPR Art 21.

## rule:gdpr.art22
Do not use solely automated decisions with legal or similarly significant effects unless a specific exception applies. Contract-necessity and explicit-consent cases require human intervention, viewpoint, and contest safeguards.

Apply heightened limits to special-category data. The supplied UK PDF cannot establish current UK Article 22 amendments. Citation: EU GDPR Art 22.

## rule:gdpr.art24
Implement and periodically update proportionate measures and policies reflecting processing context and risk and capable of demonstrating compliance.

Look for ownership, monitoring, evidence, and reassessment rather than a static policy only. Citation: EU GDPR Art 24(1)-(2).

## rule:gdpr.art25
Embed state-of-the-art, cost- and risk-appropriate safeguards at design time and during processing. Default settings must limit amount, use, retention, and accessibility to necessity.

Flag public-by-default access or optional minimisation applied only after request. Citation: EU GDPR Art 25(1)-(2).

## rule:gdpr.art26
Joint controllers must transparently allocate responsibilities, especially notices and rights; reflect actual roles; publish the arrangement's essence; and preserve rights against each controller.

Citation: EU GDPR Art 26.

## rule:gdpr.art27
A non-EU entity subject to Article 3(2) must designate a written EU representative unless the narrow occasional and low-risk exception applies. Test establishment, mandate, and accessibility.

This is EU-specific. Do not infer the current UK representative rule from the supplied UK PDF. Citation: EU GDPR Art 27.

## rule:gdpr.art28.1
The controller must perform and document due diligence showing that the processor provides sufficient guarantees for compliant measures and protection of rights.

Certification language alone is evidence, not an automatic safe harbour. Citation: EU GDPR Art 28(1).

## rule:gdpr.art28.2
Require specific or general prior written subprocessor authorisation. General authorisation also requires advance change notice and a meaningful controller objection opportunity.

Citation: EU GDPR Art 28(2).

## rule:gdpr.art28.3.chapeau
The binding processing instrument must state subject matter, duration, nature, purpose, personal-data types, data-subject categories, and controller obligations and rights.

Do not infer missing particulars from unrelated commercial schedules. Citation: EU GDPR Art 28(3) chapeau.

## rule:gdpr.art28.3.a
Limit processing, including transfers, to documented controller instructions. If law requires other processing, notify the controller before processing unless the law prohibits notice for important public-interest reasons.

Citation: EU GDPR Art 28(3)(a).

## rule:gdpr.art28.3.b
Ensure every person authorised to process data is contractually committed to confidentiality or under an appropriate statutory duty.

Check survival and coverage of personnel, contractors, and permitted users. Citation: EU GDPR Art 28(3)(b).

## rule:gdpr.art28.3.c
Require all Article 32 measures from the processor, not merely a generic reasonable-security promise.

Read with Article 32 risk, testing, restoration, and instruction controls. Citation: EU GDPR Art 28(3)(c).

## rule:gdpr.art28.3.d
Require Article 28(2) authorisation and Article 28(4) equivalent written obligations, sufficient guarantees, and processor liability for subprocessor performance.

Citation: EU GDPR Art 28(3)(d).

## rule:gdpr.art28.3.e
Taking account of processing nature, the processor must use appropriate technical and organisational measures, insofar as possible, to assist with Chapter III requests.

A clear Chapter III commitment may be sufficient; GDPR does not expressly require listing Articles 15-22. Still flag language that is purely discretionary or operationally empty. Citation: EU GDPR Art 28(3)(e).

## rule:gdpr.art28.3.f
Taking account of processing nature and available information, require assistance with applicable Articles 32-36 security, breach, DPIA, and consultation duties.

Evaluate the private assistance promise only; supervisory-authority procedure is excluded. Citation: EU GDPR Art 28(3)(f).

## rule:gdpr.art28.3.g
At the controller's choice after services, return or delete all personal data and delete copies unless applicable law requires storage.

Flag processor-only choice, undefined retention, or backup exceptions without isolation and deletion controls. Citation: EU GDPR Art 28(3)(g).

## rule:gdpr.art28.3.h
Require all compliance information, audits and inspections by the controller or its auditor, processor contribution, and immediate warning of an unlawful instruction.

Flag absolute audit prohibitions or sole reliance on a summary report that cannot demonstrate compliance. Citation: EU GDPR Art 28(3)(h).

## rule:gdpr.art28.4
Impose the same data-protection obligations on each subprocessor and keep the initial processor fully liable to the controller for subprocessor performance.

Citation: EU GDPR Art 28(4).

## rule:gdpr.art28.9
The processing contract or legal act must be in writing, including electronic form.

Citation: EU GDPR Art 28(9).

## rule:gdpr.art28.10
A processor that determines purposes and means contrary to GDPR becomes a controller for that processing.

Flag clauses purporting to preserve processor status despite independent purpose or means determination. Citation: EU GDPR Art 28(10).

## rule:gdpr.art29
A processor or person under controller or processor authority may process only on controller instructions unless applicable law requires otherwise.

Check access governance and instructions for personnel, support teams, and subprocessors. Citation: EU GDPR Art 29.

## rule:gdpr.art30
Require role-appropriate written or electronic records with all Article 30 particulars. The under-250-person exception fails for risky, non-occasional, Article 9, or Article 10 processing.

This skill excludes the duty to provide records to a supervisory authority. Citation: EU GDPR Art 30(1)-(3) and (5).

## rule:gdpr.art33.2
After becoming aware of a personal-data breach, the processor must notify the controller without undue delay.

In a DPA, look for a specific processor-to-controller escalation duty and timing, not only a generic security clause. Citation: EU GDPR Art 33(2). Art 33(1) authority notification is excluded.

## rule:gdpr.art33.5
The controller must document every breach with facts, effects, and remedial action in a form sufficient to verify Articles 33 and 34 compliance.

Check for an incident register or equivalent recordkeeping obligation, not only reactive notice language. Citation: EU GDPR Art 33(5).

## rule:gdpr.art32
Implement measures appropriate to risk after considering state of the art, cost, context, purposes, likelihood, and severity. Test encryption or pseudonymisation where appropriate, resilience, restoration, regular testing, and instruction controls.

Do not treat Article 32's example measures as a fixed universal checklist; require a reasoned risk match. Citation: EU GDPR Art 32(1)-(2) and (4).

## rule:gdpr.art34
Communicate a likely-high-risk breach to affected individuals without undue delay in clear language with nature, contact, consequence, and mitigation information.

Use an exception only for effective prior protection, later elimination of high risk, or disproportionate effort with equally effective public communication. Citation: EU GDPR Art 34(1)-(3).

## rule:gdpr.art36
Where a DPIA shows unmitigated high risk, consult the supervisory authority before processing and provide the required submission information.

This skill checks the controller's pre-processing consultation trigger and submission readiness, not authority procedure. Citation: EU GDPR Art 36(1) and (3).

## rule:gdpr.art35
Before likely-high-risk processing, conduct and document a DPIA covering processing and purposes, necessity and proportionality, risks, and safeguards. Seek DPO advice, appropriate data-subject views, and reassess after risk changes.

Supervisory-authority lists and public-law exceptions are excluded. Citation: EU GDPR Art 35(1)-(3), (7), (9), and (11).

## rule:gdpr.art37
Designate a DPO where private core activities involve regular and systematic large-scale monitoring or large-scale Article 9/10 processing. Require expertise, accessibility, permitted group sharing, and published contact details.

Public-authority triggers and supervisory-authority notification are excluded. Citation: EU GDPR Art 37(1)(b)-(c), (2), and (4)-(7).

## rule:gdpr.art38
Involve the DPO timely, provide resources and access, preserve independence and confidentiality, prohibit retaliation, permit direct data-subject contact, and prevent conflicts.

Citation: EU GDPR Art 38.

## rule:gdpr.art39.1.a-c
Require the DPO to inform and advise, monitor law and policy compliance, support assignments, awareness, training and audits, and advise on and monitor DPIAs using a risk-based approach.

Supervisory-authority cooperation and contact tasks are excluded. Citation: EU GDPR Art 39(1)(a)-(c) and (2).

## rule:gdpr.art40.3
A non-GDPR-bound entity relying on an approved code for transfer safeguards must make binding, enforceable commitments to apply the code and protect data-subject rights.

Apply only where code-based transfer is actually claimed. Citation: EU GDPR Art 40(3).

## rule:gdpr.art42.2
A non-GDPR-bound entity relying on certification for transfer safeguards must undertake binding, enforceable commitments to apply the certification and protect data-subject rights.

Apply only where certification-based transfer is actually claimed. Citation: EU GDPR Art 42(2).

## rule:gdpr.art44
Permit third-country and international-organisation transfers and onward transfers only under Chapter V without undermining GDPR protection.

Map the full transfer chain and roles. Citation: EU GDPR Art 44.

## rule:gdpr.art45.1
An adequacy-based transfer is permissible only where the destination is covered by a valid Commission adequacy decision for the transfer in question.

Do not treat a destination country name alone as sufficient proof of adequacy. Citation: EU GDPR Art 45(1).

## rule:gdpr.art46
Absent adequacy, require an Article 46 safeguard plus enforceable rights and effective remedies. Verify the claimed mechanism and any binding commitments.

This skill checks the private safeguard and excludes supervisory-authority approval procedure. Citation: EU GDPR Art 46.

## rule:gdpr.art47
Binding corporate rules must be legally binding and enforceable against all relevant group members and employees, confer enforceable data-subject rights, and contain the mandatory Article 47(2) programme elements.

Check BCR content and enforceability, not only a generic intra-group transfer statement. Citation: EU GDPR Art 47(1)-(2).

## rule:gdpr.art48
Do not treat a foreign court or administrative disclosure order as sufficient by itself; require an applicable international agreement or another valid Chapter V ground.

Citation: EU GDPR Art 48.

## rule:gdpr.art49
Apply transfer derogations narrowly and verify every condition. For compelling legitimate interests, require a non-repetitive limited transfer, documented assessment, suitable safeguards, and individual notice.

Public-authority notices and authority-defined limits are excluded. Citation: EU GDPR Art 49(1)-(2) and (6).

## rule:gdpr.art77.1
A data subject has the right to lodge a complaint with a supervisory authority, in particular where they reside, work, or where the alleged infringement occurred.

Do not treat complaint information in a privacy notice as optional boilerplate, and do not contractually restrict the right. Citation: EU GDPR Art 77(1).

## rule:gdpr.art79
Preserve the data subject's right to an effective judicial remedy against a controller or processor for alleged GDPR-infringing processing.

Court procedure and forum analysis are outside this contract-compliance check. Citation: EU GDPR Art 79.

## rule:gdpr.art80.1
Preserve the right to mandate a qualifying not-for-profit data-protection body to exercise applicable remedies and, where Member State law permits, compensation claims.

Supervisory-authority complaint procedure and Article 80(2) Member State options are excluded. Citation: EU GDPR Art 80(1).

## rule:gdpr.art82
Preserve compensation for material and non-material damage. Apply controller liability, processor-specific liability, the no-responsibility proof burden, joint and several liability, and contribution rights.

GDPR does not expressly require a particular contractual liability-cap carve-out; assess enforceability separately under applicable law. Citation: EU GDPR Art 82(1)-(5).

## rule:gdpr.art89.1
For research, statistics, or public-interest archiving, require rights-protective safeguards, data minimisation, pseudonymisation where purposes allow, and non-identifying data where purposes can be fulfilled that way.

National derogations are excluded. Citation: EU GDPR Art 89(1).

## risk:principles_or_accountability_gap
Raise when processing terms permit unspecified purposes, excessive collection, inaccurate data, indefinite retention, inadequate security, or no demonstrable controller accountability.

Do not claim every Article 5 principle must appear verbatim in one contract; identify the missing control or evidence.

## risk:lawful_basis_or_purpose_gap
Raise when a purpose lacks an Article 6 basis, necessity is unsupported, legitimate interests lacks balancing, or new use lacks compatibility analysis.

## risk:invalid_or_unmanageable_consent
Raise for unprovable, bundled, unclear, coerced, unnecessary, age-inappropriate, or harder-to-withdraw consent.

## risk:sensitive_data_condition_gap
Raise when Article 9 or 10 data is present without the additional condition, authorising law, secrecy, or safeguards required for that category.

## risk:privacy_notice_incomplete_or_late
Raise for omitted Article 13/14 fields, wrong direct/indirect template, unclear language, late delivery, unsupported exception, or missing new-purpose notice.

## risk:dsr_assistance_not_operational
Raise when Chapter III assistance is discretionary, structurally impossible, unallocated, or lacks practical measures.

Do not raise solely because Articles 15-22 are not individually named if a binding, operational Chapter III commitment exists.

## risk:dsr_no_response_timeframe
Raise when the controller workflow cannot satisfy EU Article 12(3), or processor timing is likely to prevent it.

"Promptly" may still be operationally adequate in a processor clause if a shorter documented SLA exists; distinguish missing evidence from legal non-compliance.

## risk:erasure_termination_only_gap
Raise when deletion exists only after termination and there is no route for an Article 17 erasure request during processing.

## risk:portability_format_unaddressed
Raise when applicable automated consent/contract processing lacks structured, commonly used, machine-readable export or technically feasible direct transmission.

## risk:automated_decision_gap
Raise when solely automated significant decisions are used without an Article 22 exception, meaningful transparency, or required human review, viewpoint, and contest safeguards.

## risk:recipient_notification_gap
Raise when rectification, erasure, or restriction cannot propagate to recipients or recipients cannot be identified to the individual on request.

## risk:assistance_cost_or_consent_gate_risk
Raise when cost, separate consent, discretionary approval, or delay mechanics can prevent required processor assistance.

Distinguish reasonable fee allocation between parties from a refusal to perform a binding Article 28 duty.

## risk:cost_allocation_silent
Raise when the DPA creates an Article 28(3)(e) assistance duty but says nothing about whether assistance is included in the fees or charged at a reasonable documented cost.

EDPB controller-processor guidance recognises that commercial terms may allocate assistance costs, but cost mechanics must not undermine the processor's binding assistance duty. Silence should be identified as a contractual-operability risk, not stated as an independent GDPR violation.

## risk:processor_terms_incomplete
Raise for missing Article 28 processing particulars or processor duties. List the exact missing subparagraphs.

## risk:subprocessor_authorisation_or_flowdown_gap
Raise for no prior authorisation, ineffective change notice or objection, missing equivalent obligations, or disclaimer of initial processor liability.

## risk:processor_return_deletion_gap
Raise where the controller lacks the return-or-delete choice, copies are excluded, or a legal-retention exception is undefined or overbroad.

## risk:processor_audit_evidence_gap
Raise for absent compliance information, prohibited audits or inspections, no contribution duty, or no unlawful-instruction warning.

## risk:security_measures_not_risk_based
Raise when security is generic, static, or disconnected from processing risk, or omits material resilience, restoration, testing, or instruction controls.

## risk:processor_breach_escalation_gap
Raise when the processor lacks a without-undue-delay obligation to notify the controller after becoming aware of a personal-data breach.

## risk:breach_recordkeeping_gap
Raise when there is no requirement or process to document breach facts, effects, and remedial action under Article 33(5).

## risk:complaint_right_restriction
Raise when terms or practices improperly restrict the data subject's Article 77(1) right to lodge a supervisory-authority complaint.

## risk:high_risk_breach_notice_gap
Raise when no adequate trigger, undue-delay workflow, communication content, or controlled Article 34 exception exists for likely-high-risk breaches.

## risk:dpia_or_dpo_governance_gap
Raise when likely-high-risk processing lacks prior DPIA governance or when a mandatory private-sector DPO lacks designation, resources, independence, access, or conflict controls.

## risk:transfer_mechanism_or_derogation_gap
Raise when a restricted transfer or onward transfer lacks a valid Chapter V path, enforceable rights, or documented narrow-derogation conditions.

## risk:joint_controller_or_representative_gap
Raise when actual joint controllers fail to allocate duties or publish the arrangement's essence, or when an Article 3(2) entity lacks a required EU representative.

## risk:remedy_or_compensation_restriction
Raise when terms purport to eliminate or improperly restrict Articles 79, 80, or 82 rights against a responsible controller or processor.

Do not state that GDPR itself mandates a particular liability-cap carve-out.

## risk:research_safeguards_gap
Raise when research, statistical, or archiving processing lacks minimisation, pseudonymisation where feasible, or use of non-identifying data where the purpose permits.

## risk:other_known_risk
Use only for a material GDPR issue that does not fit a defined category. State the exact article, facts, and uncertainty; do not use this category as a substitute for article analysis.

## matrix:gdpr.right.access
Named example: "Processor shall assist Controller in responding to data subject requests for access under Article 15, including providing a copy of personal data undergoing processing."
Generic example: "Processor shall assist Controller with data subject requests" (no access/Article 15 named).
Absent example: no cooperation or DSR language at all for access.

## matrix:gdpr.right.rectification
Named example: expressly names rectification or Article 16, or describes correcting inaccurate personal data on request.
Generic example: only a catch-all "data subject requests" / "cooperation" clause without naming rectification.
Absent example: no assistance language that could cover correction.

## matrix:gdpr.right.erasure
Named example: names erasure, right to be forgotten, or Article 17, or describes deleting personal data on data-subject request (not only on contract termination).
Generic example: catch-all DSR assistance without naming erasure; or deletion only on termination.
Absent example: no erasure or deletion-on-request language.

## matrix:gdpr.right.restriction
Named example: names restriction of processing or Article 18.
Generic example: catch-all DSR / cooperation only.
Absent example: no restriction language and no catch-all that could cover it.

## matrix:gdpr.right.notification
Named example: names obligation to notify recipients of rectification/erasure/restriction (Article 19) or equivalent.
Generic example: catch-all assistance without recipient-notification duty.
Absent example: silent on notifying recipients of changes.

## matrix:gdpr.right.portability
Named example: names portability, Article 20, or structured/machine-readable export to the data subject or another controller.
Generic example: catch-all DSR assistance without portability or format.
Absent example: no portability or export-on-request language.

## matrix:gdpr.right.object
Named example: names the right to object or Article 21, including objection to direct marketing where relevant.
Generic example: catch-all DSR assistance without objection.
Absent example: silent on objection rights.

## matrix:gdpr.right.automated_decisions
Named example: names automated decision-making / profiling rights or Article 22, including human review.
Generic example: catch-all DSR assistance without ADM/profiling.
Absent example: silent on automated decisions.

## Article coverage audit
Included actionable private-entity obligations or data-subject rights:
- Articles 5-22, excluding national-law and institutional paragraphs.
- Articles 24-30, excluding voluntary compliance evidence and supervisory-authority-facing provisions.
- Articles 32-36, excluding supervisory-authority procedure and public-law exemptions.
- Articles 40(3) and 42(2), where code or certification is relied on for transfers.
- Articles 44-49, excluding Commission adequacy administration and authority approval machinery.
- Articles 77(1), 79, 80(1), 82, and 89(1).

Excluded after review:
- Articles 1-4: subject matter, scope, and definitions rather than standalone checks.
- Article 23: Union or Member State legislative restrictions.
- Articles 31, 33.1, and 33.3-4: supervisory-authority cooperation, notification, and minimum notification content.
- Articles 36(2) and 36(4)-(5): supervisory-authority procedure and Member-State exemptions.
- Articles 40-43 except 40(3) and 42(2): code, monitoring-body, and certification machinery.
- Articles 45(2)-(9) and 47(3): Commission adequacy administration and BCR approval procedure.
- Article 50: international cooperation by public institutions.
- Articles 51-76: Chapters VI and VII, excluded in full.
- Articles 77(2) and 78: supervisory-authority complaint handling and authority-focused remedy procedure.
- Article 81: court procedure.
- Articles 83-84: administrative fines and Member State penalties.
- Articles 85-88 and 89(2)-(4): Member State/public-document/national-law rules and derogations.
- Articles 90-91: supervisory powers concerning secrecy and church-specific supervision.
- Articles 92-99: delegated acts, committees, repeal, legislative relationships, Commission review, and entry into force.
