import { pool } from "../config/database.js";

const DEFAULT_PROMPTS: Array<{
  id: string;
  name: string;
  type: "prompts";
  tags: string;
  details: string;
}> = [
  // ═══════════════════════════════════════════════════════════════════════
  // General Analysis (5 prompts)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_prompt_contract_risk_assessment",
    name: "Contract Risk Assessment",
    type: "prompts",
    tags: "General Analysis",
    details: "Perform a comprehensive risk assessment identifying all legal, financial, operational, and reputational risks in this agreement. Categorize risks by severity and likelihood. Highlight clauses that create asymmetric obligations, unlimited liability, or expose the organization to regulatory non-compliance."
  },
  {
    id: "lib_prompt_missing_standard_clauses",
    name: "Missing Standard Clauses Analysis",
    type: "prompts",
    tags: "General Analysis",
    details: "Review the agreement for missing standard clauses including: limitation of liability, force majeure, dispute resolution, governing law, severability, entire agreement, amendment procedures, notice provisions, and assignment restrictions. For each missing clause, explain the legal exposure and recommend specific language."
  },
  {
    id: "lib_prompt_contract_inconsistency_detection",
    name: "Contract Inconsistency Detection",
    type: "prompts",
    tags: "General Analysis",
    details: "Scan the entire agreement for internal inconsistencies including: conflicting definitions, contradictory obligations, cross-reference errors, inconsistent use of defined terms, schedule conflicts with main body, and conflicting effective dates. Provide clause-by-clause reconciliation recommendations."
  },
  {
    id: "lib_prompt_redline_negotiation_strategy",
    name: "Redline & Negotiation Strategy",
    type: "prompts",
    tags: "General Analysis",
    details: "Identify the top 10 most commercially important provisions requiring negotiation. For each, provide: current language analysis, business impact assessment, proposed alternative language, negotiation positioning strategy, and fallback positions. Prioritize clauses by negotiation leverage and risk exposure."
  },
  {
    id: "lib_prompt_compliance_obligations_mapping",
    name: "Compliance Obligations Mapping",
    type: "prompts",
    tags: "General Analysis",
    details: "Extract and map all compliance obligations imposed by this agreement including: regulatory requirements, audit rights, certification obligations, reporting requirements, training mandates, and policy adherence commitments. Assess feasibility and identify resource gaps for each obligation."
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Commercial Agreements (5 prompts)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_prompt_payment_terms_analysis",
    name: "Payment Terms & Obligations Analysis",
    type: "prompts",
    tags: "Commercial Agreements",
    details: "Analyze all payment provisions including: amounts, milestones, payment schedules, late payment penalties, interest rates, invoicing requirements, payment methods, currency, withholding taxes, disputed amounts procedures, and audit rights. Identify clauses allowing unilateral fee increases or vague pricing terms."
  },
  {
    id: "lib_prompt_sla_commitments_review",
    name: "Service Level Commitments Review",
    type: "prompts",
    tags: "Commercial Agreements",
    details: "Review all service level commitments including: uptime guarantees, performance metrics, response times, resolution times, support hours, service credits, remedies for failures, measurement methodologies, and escalation procedures. Assess enforceability and identify vague or unverifiable commitments."
  },
  {
    id: "lib_prompt_liability_indemnification_review",
    name: "Liability & Indemnification Review",
    type: "prompts",
    tags: "Commercial Agreements",
    details: "Examine all liability provisions including: liability caps, exclusions, consequential loss disclaimers, indemnification obligations, defense obligations, settlement rights, insurance requirements, and gross negligence carve-outs. Assess whether liability allocation is balanced and commercially reasonable."
  },
  {
    id: "lib_prompt_termination_rights_assessment",
    name: "Termination Rights & Exit Strategy Assessment",
    type: "prompts",
    tags: "Commercial Agreements",
    details: "Analyze termination provisions including: termination for cause triggers, termination for convenience rights, cure periods, notice requirements, post-termination obligations, transition assistance, data return/deletion, survival clauses, and financial consequences. Identify asymmetric termination rights."
  },
  {
    id: "lib_prompt_pricing_fee_structure_review",
    name: "Pricing & Fee Structure Review",
    type: "prompts",
    tags: "Commercial Agreements",
    details: "Review all pricing mechanisms including: base fees, variable fees, usage-based pricing, renewal pricing, price escalation clauses, volume discounts, most-favored-customer provisions, bundling terms, and hidden costs. Identify ambiguous pricing terms that may create budget exposure."
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Privacy & Data Protection (5 prompts)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_prompt_gdpr_compliance_assessment",
    name: "GDPR Compliance Assessment",
    type: "prompts",
    tags: "Privacy & Data Protection",
    details: "Conduct a comprehensive GDPR compliance review examining: lawful basis for processing, data subject rights mechanisms, processor obligations (Article 28), subprocessor consent, cross-border transfer safeguards, breach notification timelines, data retention limits, and privacy-by-design commitments. Identify gaps and recommend specific clause improvements."
  },
  {
    id: "lib_prompt_dpa_processing_terms_review",
    name: "Data Processing Agreement Review",
    type: "prompts",
    tags: "Privacy & Data Protection",
    details: "Review the Data Processing Agreement for: scope of processing, data categories, processing purposes, processor obligations, security measures, subprocessor management, audit rights, data breach procedures, data deletion/return commitments, and controller instructions. Verify alignment with GDPR Article 28 requirements."
  },
  {
    id: "lib_prompt_cross_border_transfer_assessment",
    name: "Cross-Border Data Transfer Assessment",
    type: "prompts",
    tags: "Privacy & Data Protection",
    details: "Analyze cross-border data transfer mechanisms including: adequacy decisions, Standard Contractual Clauses (SCCs), Binding Corporate Rules (BCRs), derogations, data localization requirements, and supplementary measures. Assess Schrems II compliance and identify jurisdictional data residency obligations."
  },
  {
    id: "lib_prompt_data_retention_deletion_review",
    name: "Data Retention & Deletion Review",
    type: "prompts",
    tags: "Privacy & Data Protection",
    details: "Examine data retention and deletion provisions including: retention periods, legal hold obligations, deletion timelines, data return procedures, secure destruction methods, and certification of deletion. Identify conflicts with regulatory retention requirements and assess data minimization compliance."
  },
  {
    id: "lib_prompt_data_subject_rights_compliance",
    name: "Data Subject Rights Compliance Review",
    type: "prompts",
    tags: "Privacy & Data Protection",
    details: "Review provisions addressing data subject rights including: access requests, rectification, erasure (right to be forgotten), data portability, objection to processing, automated decision-making opt-outs, and response timelines. Assess adequacy of cooperation obligations and identify gaps in rights fulfillment procedures."
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Vendor & Third-Party Risk (5 prompts)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_prompt_vendor_risk_management_review",
    name: "Vendor Risk Management Review",
    type: "prompts",
    tags: "Vendor & Third-Party Risk",
    details: "Assess vendor risk management provisions including: subcontracting rights and restrictions, fourth-party risk management, business continuity obligations, disaster recovery commitments, key personnel requirements, financial stability disclosures, insurance requirements, and exit/transition assistance. Identify single points of failure and dependency risks."
  },
  {
    id: "lib_prompt_subprocessor_management_review",
    name: "Subprocessor & Subcontractor Management Review",
    type: "prompts",
    tags: "Vendor & Third-Party Risk",
    details: "Review subprocessor and subcontractor provisions including: prior approval requirements, notification obligations, subcontractor oversight responsibilities, flow-down of obligations, liability for subcontractor acts, and termination rights triggered by subcontractor changes. Verify adequate control over fourth-party relationships."
  },
  {
    id: "lib_prompt_vendor_performance_monitoring",
    name: "Vendor Performance Monitoring & KPIs Review",
    type: "prompts",
    tags: "Vendor & Third-Party Risk",
    details: "Examine vendor performance monitoring mechanisms including: key performance indicators (KPIs), reporting frequency, performance review meetings, audit rights, quality assurance procedures, benchmarking rights, and remediation procedures for performance failures. Assess measurability and enforceability of performance standards."
  },
  {
    id: "lib_prompt_vendor_insurance_requirements",
    name: "Vendor Insurance & Risk Transfer Review",
    type: "prompts",
    tags: "Vendor & Third-Party Risk",
    details: "Review insurance and risk transfer provisions including: required insurance types (general liability, E&O, cyber), minimum coverage amounts, additional insured requirements, certificates of insurance delivery, insurance maintenance obligations, and waiver of subrogation. Assess adequacy of coverage relative to contract risk profile."
  },
  {
    id: "lib_prompt_vendor_exit_transition_planning",
    name: "Vendor Exit & Transition Planning Review",
    type: "prompts",
    tags: "Vendor & Third-Party Risk",
    details: "Analyze vendor exit and transition provisions including: transition assistance obligations, knowledge transfer requirements, transition service periods, data migration support, system access during transition, documentation delivery, and transition costs allocation. Identify gaps that could impede smooth vendor replacement."
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Security & Cybersecurity (5 prompts)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_prompt_information_security_standards",
    name: "Information Security Standards Review",
    type: "prompts",
    tags: "Security & Cybersecurity",
    details: "Review information security obligations including: applicable security frameworks (ISO 27001, SOC 2, NIST), security controls implementation, encryption requirements (at-rest and in-transit), access controls, authentication mechanisms, vulnerability management, and security monitoring. Assess specificity and enforceability of security commitments."
  },
  {
    id: "lib_prompt_data_breach_incident_response",
    name: "Data Breach & Incident Response Review",
    type: "prompts",
    tags: "Security & Cybersecurity",
    details: "Examine data breach and incident response provisions including: breach definition, notification timelines, notification content requirements, cooperation obligations, forensic investigation responsibilities, breach remediation commitments, regulatory reporting support, and liability for breaches. Verify compliance with GDPR 72-hour notification requirement."
  },
  {
    id: "lib_prompt_security_audit_rights",
    name: "Security Audit & Assessment Rights Review",
    type: "prompts",
    tags: "Security & Cybersecurity",
    details: "Analyze security audit and assessment rights including: frequency of audits, scope of audits, audit report delivery, remediation timelines for findings, penetration testing rights, vulnerability disclosure procedures, and costs allocation for audits. Assess adequacy of audit rights relative to data sensitivity and regulatory requirements."
  },
  {
    id: "lib_prompt_cybersecurity_insurance_requirements",
    name: "Cybersecurity Insurance & Liability Review",
    type: "prompts",
    tags: "Security & Cybersecurity",
    details: "Review cybersecurity insurance and liability provisions including: cyber liability insurance requirements, minimum coverage amounts, incident response coverage, regulatory defense coverage, breach notification cost coverage, and liability caps for security incidents. Assess alignment between cyber insurance requirements and potential exposure."
  },
  {
    id: "lib_prompt_security_certification_compliance",
    name: "Security Certifications & Compliance Review",
    type: "prompts",
    tags: "Security & Cybersecurity",
    details: "Examine security certification and compliance obligations including: required certifications (SOC 2 Type II, ISO 27001, PCI-DSS), certification maintenance obligations, re-certification timelines, certification report delivery, compliance audit rights, and consequences of certification lapses. Verify certification requirements match organizational security standards."
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Employment Agreements (5 prompts)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_prompt_employment_terms_conditions",
    name: "Employment Terms & Conditions Review",
    type: "prompts",
    tags: "Employment Agreements",
    details: "Review employment agreement terms including: position title and duties, reporting structure, compensation and benefits, work location and remote work policies, probation period, performance review procedures, and termination provisions. Identify terms that deviate from standard employment law requirements or create compliance risks."
  },
  {
    id: "lib_prompt_restrictive_covenants_review",
    name: "Restrictive Covenants & Non-Compete Review",
    type: "prompts",
    tags: "Employment Agreements",
    details: "Analyze restrictive covenants including: non-compete clauses, non-solicitation provisions, non-disclosure obligations, geographic scope, duration, restricted activities, and consideration adequacy. Assess enforceability under applicable jurisdiction law and identify overly broad restrictions that may be unenforceable."
  },
  {
    id: "lib_prompt_ip_assignment_inventions",
    name: "IP Assignment & Employee Inventions Review",
    type: "prompts",
    tags: "Employment Agreements",
    details: "Examine intellectual property assignment provisions including: scope of IP assignment, pre-existing IP carve-outs, invention disclosure obligations, work-for-hire provisions, moral rights waivers, and compensation for inventions. Verify compliance with state-specific employee invention laws and identify overly broad assignment language."
  },
  {
    id: "lib_prompt_termination_severance_provisions",
    name: "Termination & Severance Provisions Review",
    type: "prompts",
    tags: "Employment Agreements",
    details: "Review termination and severance provisions including: termination grounds (cause/without cause), notice periods, severance payment calculations, change-of-control provisions, release requirements, non-disparagement obligations, and post-termination cooperation. Assess compliance with employment standards legislation and identify potential wrongful termination exposure."
  },
  {
    id: "lib_prompt_employee_classification_compliance",
    name: "Employee Classification & Compliance Review",
    type: "prompts",
    tags: "Employment Agreements",
    details: "Assess employee classification and compliance provisions including: exempt vs. non-exempt status, independent contractor vs. employee classification, overtime eligibility, benefits eligibility, worker classification tests, and compliance with wage and hour laws. Identify misclassification risks and recommend corrective classification."
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Corporate Governance (5 prompts)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_prompt_shareholder_rights_obligations",
    name: "Shareholder Rights & Obligations Review",
    type: "prompts",
    tags: "Corporate Governance",
    details: "Review shareholder agreement provisions including: voting rights, board representation, information rights, inspection rights, preemptive rights, drag-along and tag-along rights, transfer restrictions, and dispute resolution. Assess balance of rights among shareholder classes and identify provisions that may create shareholder deadlock."
  },
  {
    id: "lib_prompt_board_governance_structure",
    name: "Board Governance & Structure Review",
    type: "prompts",
    tags: "Corporate Governance",
    details: "Examine board governance provisions including: board size and composition, director appointment and removal, board committee structure, quorum requirements, voting thresholds, director fiduciary duties, indemnification provisions, and D&O insurance requirements. Identify governance gaps and assess compliance with corporate law requirements."
  },
  {
    id: "lib_prompt_equity_vesting_acceleration",
    name: "Equity Vesting & Acceleration Review",
    type: "prompts",
    tags: "Corporate Governance",
    details: "Analyze equity compensation provisions including: vesting schedules, vesting conditions, acceleration triggers (single-trigger vs. double-trigger), change-of-control provisions, clawback provisions, repurchase rights, and good leaver/bad leaver provisions. Assess alignment with retention objectives and identify excessive acceleration exposure."
  },
  {
    id: "lib_prompt_transfer_restrictions_liquidity",
    name: "Transfer Restrictions & Liquidity Rights Review",
    type: "prompts",
    tags: "Corporate Governance",
    details: "Review transfer restrictions and liquidity provisions including: right of first refusal (ROFR), right of first offer (ROFO), co-sale rights, drag-along rights, permitted transfers, lock-up periods, redemption rights, and liquidity event definitions. Assess balance between transfer restrictions and shareholder liquidity needs."
  },
  {
    id: "lib_prompt_corporate_transaction_provisions",
    name: "Corporate Transaction & Exit Provisions Review",
    type: "prompts",
    tags: "Corporate Governance",
    details: "Examine corporate transaction provisions including: approval thresholds for major transactions, protective provisions, liquidation preferences, anti-dilution protections, participation rights, redemption rights upon qualified financing, and deemed liquidation event definitions. Assess economic outcomes for different shareholder classes across exit scenarios."
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AI Governance (5 prompts)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_prompt_ai_governance_framework_assessment",
    name: "AI Governance Framework Assessment",
    type: "prompts",
    tags: "AI Governance",
    details: "Assess AI governance provisions including: AI ethics principles, responsible AI commitments, algorithmic accountability mechanisms, AI oversight governance structure, fairness and bias mitigation procedures, explainability requirements, and human oversight obligations. Identify gaps in AI governance framework relative to EU AI Act and emerging AI regulations."
  },
  {
    id: "lib_prompt_ai_transparency_explainability",
    name: "AI Transparency & Explainability Review",
    type: "prompts",
    tags: "AI Governance",
    details: "Review AI transparency and explainability provisions including: algorithmic transparency commitments, model explainability requirements, automated decision-making disclosures, AI usage notifications, transparency reporting obligations, and documentation requirements. Assess adequacy of transparency measures for high-risk AI systems."
  },
  {
    id: "lib_prompt_ai_bias_fairness_assessment",
    name: "AI Bias & Fairness Assessment",
    type: "prompts",
    tags: "AI Governance",
    details: "Examine AI bias and fairness provisions including: bias testing requirements, fairness metrics and thresholds, disparate impact assessment obligations, bias mitigation procedures, training data diversity requirements, and algorithmic fairness audits. Verify alignment with anti-discrimination laws and assess adequacy of bias prevention measures."
  },
  {
    id: "lib_prompt_ai_risk_management_review",
    name: "AI Risk Management & Liability Review",
    type: "prompts",
    tags: "AI Governance",
    details: "Analyze AI risk management provisions including: AI risk assessment obligations, risk classification methodologies, high-risk AI system controls, AI incident response procedures, AI liability allocation, AI insurance requirements, and remedies for AI system failures. Assess adequacy of risk controls for AI system deployment."
  },
  {
    id: "lib_prompt_ai_regulatory_compliance_gap",
    name: "AI Regulatory Compliance Gap Analysis",
    type: "prompts",
    tags: "AI Governance",
    details: "Conduct AI regulatory compliance gap analysis covering: EU AI Act requirements, algorithmic accountability laws, sector-specific AI regulations, AI safety standards, AI documentation obligations, conformity assessment requirements, and post-market monitoring obligations. Identify compliance gaps and recommend remediation measures."
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Regulatory Compliance (5 prompts)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_prompt_regulatory_compliance_obligations",
    name: "Regulatory Compliance Obligations Review",
    type: "prompts",
    tags: "Regulatory Compliance",
    details: "Review regulatory compliance obligations including: applicable regulations and standards, licensing requirements, certification obligations, regulatory reporting requirements, inspection and audit rights, record-keeping obligations, and regulatory change management procedures. Assess feasibility of compliance obligations and identify resource gaps."
  },
  {
    id: "lib_prompt_industry_specific_regulations",
    name: "Industry-Specific Regulations Review",
    type: "prompts",
    tags: "Regulatory Compliance",
    details: "Examine industry-specific regulatory requirements including: healthcare (HIPAA, HITECH), financial services (PCI-DSS, SOX, GLBA), telecommunications (TCPA, CPNI), export controls (ITAR, EAR), anti-money laundering (AML/KYC), and sanctions compliance (OFAC). Verify contractual compliance obligations align with regulatory requirements."
  },
  {
    id: "lib_prompt_anti_bribery_corruption_compliance",
    name: "Anti-Bribery & Corruption Compliance Review",
    type: "prompts",
    tags: "Regulatory Compliance",
    details: "Review anti-bribery and anti-corruption provisions including: FCPA compliance, UK Bribery Act compliance, anti-kickback provisions, gifts and hospitality policies, third-party due diligence obligations, compliance certifications, whistleblower protections, and remedies for compliance breaches. Assess adequacy of anti-corruption controls."
  },
  {
    id: "lib_prompt_trade_compliance_export_controls",
    name: "Trade Compliance & Export Controls Review",
    type: "prompts",
    tags: "Regulatory Compliance",
    details: "Examine trade compliance and export control provisions including: export licensing requirements, denied party screening, ITAR compliance, EAR compliance, sanctions compliance (OFAC, EU), country-specific restrictions, re-export controls, and deemed export restrictions. Identify export control risks and recommend mitigation measures."
  },
  {
    id: "lib_prompt_esg_sustainability_compliance",
    name: "ESG & Sustainability Compliance Review",
    type: "prompts",
    tags: "Regulatory Compliance",
    details: "Review ESG and sustainability provisions including: environmental compliance obligations, carbon footprint reporting, sustainable sourcing commitments, modern slavery and human trafficking prevention, diversity and inclusion commitments, and ESG reporting requirements. Assess alignment with corporate ESG commitments and regulatory ESG disclosure requirements."
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Disputes & Litigation (5 prompts)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_prompt_dispute_resolution_mechanisms",
    name: "Dispute Resolution Mechanisms Review",
    type: "prompts",
    tags: "Disputes & Litigation",
    details: "Review dispute resolution provisions including: negotiation requirements, mediation procedures, arbitration clauses, arbitration rules and institutions, number of arbitrators, seat of arbitration, governing law, litigation venue, jury trial waivers, and consolidation rights. Assess efficiency and cost-effectiveness of dispute resolution procedures."
  },
  {
    id: "lib_prompt_arbitration_clause_enforceability",
    name: "Arbitration Clause Enforceability Review",
    type: "prompts",
    tags: "Disputes & Litigation",
    details: "Analyze arbitration clause enforceability including: arbitration agreement validity, scope of arbitrable disputes, class action waivers, carve-outs for injunctive relief, delegation clauses, severability provisions, and enforceability under FAA and international conventions. Identify provisions that may render arbitration agreement unenforceable."
  },
  {
    id: "lib_prompt_litigation_cost_allocation",
    name: "Litigation Cost & Fee Allocation Review",
    type: "prompts",
    tags: "Disputes & Litigation",
    details: "Examine litigation cost provisions including: attorney fees allocation (prevailing party, unilateral), costs and expenses recovery, fee-shifting provisions, proportional cost allocation, caps on recoverable fees, and pre-dispute fee waivers. Assess financial exposure from litigation cost provisions."
  },
  {
    id: "lib_prompt_injunctive_relief_remedies",
    name: "Injunctive Relief & Remedies Review",
    type: "prompts",
    tags: "Disputes & Litigation",
    details: "Review injunctive relief and remedies provisions including: availability of injunctive relief, specific performance rights, equitable remedies, liquidated damages clauses, penalty clause analysis, remedy limitations, and exclusive remedies provisions. Assess adequacy of remedies for different breach scenarios and identify unenforceable penalty provisions."
  },
  {
    id: "lib_prompt_governing_law_jurisdiction",
    name: "Governing Law & Jurisdiction Review",
    type: "prompts",
    tags: "Disputes & Litigation",
    details: "Analyze governing law and jurisdiction provisions including: choice of law, conflict of laws analysis, exclusive vs. non-exclusive jurisdiction, forum selection clauses, consent to jurisdiction, service of process, and enforcement of judgments. Identify conflicts between governing law and jurisdiction provisions and assess forum shopping risks."
  }];

// ---------------------------------------------------------------------------
// Default Questions
// ══════════════════════════════════════════════════════════════════════════
// Approximately 50 enterprise-grade legal review questions will be manually
// curated and added here. The current 10 entries are placeholders to
// demonstrate the structure.
// ---------------------------------------------------------------------------
const DEFAULT_QUESTIONS: Array<{
  id: string;
  name: string;
  type: "questions";
  tags: string;
  details: string;
}> = [
  // ═══════════════════════════════════════════════════════════════════════
  // General Analysis (5 questions)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_question_major_legal_risks",
    name: "What are the major legal risks?",
    type: "questions",
    tags: "General Analysis",
    details: "What are the major legal risks in this agreement and which specific clauses create the most exposure for our organization?"
  },
  {
    id: "lib_question_missing_standard_clauses",
    name: "Which standard clauses are missing?",
    type: "questions",
    tags: "General Analysis",
    details: "Which standard contractual protections are missing from this agreement and what risk does each omission create?"
  },
  {
    id: "lib_question_unfavorable_terms",
    name: "What are the most unfavorable terms?",
    type: "questions",
    tags: "General Analysis",
    details: "Which provisions are most commercially unfavorable to our organization and should be prioritized for negotiation?"
  },
  {
    id: "lib_question_obligations_timeline",
    name: "What are our key obligations and deadlines?",
    type: "questions",
    tags: "General Analysis",
    details: "What are the critical obligations we must fulfill under this agreement, and what are the associated timelines and deadlines?"
  },
  {
    id: "lib_question_contract_ambiguities",
    name: "What ambiguous terms require clarification?",
    type: "questions",
    tags: "General Analysis",
    details: "Which provisions contain ambiguous language, undefined terms, or vague obligations that could lead to disputes?"
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Commercial Agreements (5 questions)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_question_total_contract_value",
    name: "What is the total contract value and payment structure?",
    type: "questions",
    tags: "Commercial Agreements",
    details: "What is the total financial commitment, including all fees, renewal costs, and potential additional charges?"
  },
  {
    id: "lib_question_liability_caps",
    name: "What are the liability limitations?",
    type: "questions",
    tags: "Commercial Agreements",
    details: "What are the liability caps and exclusions, and do they adequately protect our organization from financial exposure?"
  },
  {
    id: "lib_question_termination_costs",
    name: "What are the termination rights and costs?",
    type: "questions",
    tags: "Commercial Agreements",
    details: "Under what circumstances can we terminate this agreement, what are the associated costs, and what transition assistance is provided?"
  },
  {
    id: "lib_question_sla_commitments",
    name: "What service levels are guaranteed?",
    type: "questions",
    tags: "Commercial Agreements",
    details: "What specific service level commitments are guaranteed, how are they measured, and what remedies are available for failures?"
  },
  {
    id: "lib_question_price_increases",
    name: "How can pricing change over time?",
    type: "questions",
    tags: "Commercial Agreements",
    details: "What mechanisms allow for price increases, are there caps on increases, and what notice is required before price changes?"
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Privacy & Data Protection (5 questions)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_question_gdpr_compliance_status",
    name: "Is this agreement GDPR compliant?",
    type: "questions",
    tags: "Privacy & Data Protection",
    details: "Does this agreement meet GDPR requirements including Article 28 processor obligations, data subject rights, and breach notification timelines?"
  },
  {
    id: "lib_question_data_processing_scope",
    name: "What data will be processed and for what purposes?",
    type: "questions",
    tags: "Privacy & Data Protection",
    details: "What categories of personal data will be processed, for what purposes, and under what lawful basis?"
  },
  {
    id: "lib_question_data_location",
    name: "Where will our data be stored and processed?",
    type: "questions",
    tags: "Privacy & Data Protection",
    details: "In which countries or regions will personal data be stored and processed, and what cross-border transfer mechanisms are in place?"
  },
  {
    id: "lib_question_data_deletion",
    name: "How is data returned or deleted upon termination?",
    type: "questions",
    tags: "Privacy & Data Protection",
    details: "What procedures are in place for data return, deletion, or destruction upon contract termination, and what certification is provided?"
  },
  {
    id: "lib_question_subprocessor_controls",
    name: "What controls exist over subprocessors?",
    type: "questions",
    tags: "Privacy & Data Protection",
    details: "Is prior consent required for subprocessors, how are they managed, and what happens if we object to a subprocessor?"
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Vendor & Third-Party Risk (5 questions)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_question_vendor_dependencies",
    name: "What are the key vendor dependencies?",
    type: "questions",
    tags: "Vendor & Third-Party Risk",
    details: "What critical dependencies on this vendor exist, and what are the risks if the vendor fails to perform or exits the market?"
  },
  {
    id: "lib_question_business_continuity",
    name: "What business continuity protections exist?",
    type: "questions",
    tags: "Vendor & Third-Party Risk",
    details: "What disaster recovery and business continuity commitments are in place, and what happens if the vendor experiences an outage?"
  },
  {
    id: "lib_question_vendor_financial_health",
    name: "What financial stability guarantees exist?",
    type: "questions",
    tags: "Vendor & Third-Party Risk",
    details: "What information or assurances are provided regarding the vendor's financial stability and viability?"
  },
  {
    id: "lib_question_transition_assistance",
    name: "What transition support is provided upon exit?",
    type: "questions",
    tags: "Vendor & Third-Party Risk",
    details: "What transition assistance, knowledge transfer, and data migration support is the vendor obligated to provide if we switch vendors?"
  },
  {
    id: "lib_question_vendor_insurance_coverage",
    name: "What insurance does the vendor maintain?",
    type: "questions",
    tags: "Vendor & Third-Party Risk",
    details: "What types and amounts of insurance coverage does the vendor maintain, and are we named as an additional insured?"
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Security & Cybersecurity (5 questions)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_question_security_certifications",
    name: "What security certifications does the vendor hold?",
    type: "questions",
    tags: "Security & Cybersecurity",
    details: "What security certifications (SOC 2, ISO 27001, etc.) does the vendor maintain, and how recently were they obtained?"
  },
  {
    id: "lib_question_data_breach_notification",
    name: "What are the data breach notification requirements?",
    type: "questions",
    tags: "Security & Cybersecurity",
    details: "Within what timeframe must the vendor notify us of a data breach, and what information must be included in the notification?"
  },
  {
    id: "lib_question_encryption_standards",
    name: "What encryption is used for data protection?",
    type: "questions",
    tags: "Security & Cybersecurity",
    details: "What encryption standards are applied to data at rest and in transit, and are encryption keys properly managed?"
  },
  {
    id: "lib_question_security_audit_rights",
    name: "What security audit rights do we have?",
    type: "questions",
    tags: "Security & Cybersecurity",
    details: "Can we conduct security audits or penetration tests, how frequently, and who bears the cost?"
  },
  {
    id: "lib_question_incident_response_plan",
    name: "What incident response procedures are in place?",
    type: "questions",
    tags: "Security & Cybersecurity",
    details: "What incident response and breach remediation procedures are defined, and what is our role in incident response?"
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Employment Agreements (5 questions)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_question_compensation_structure",
    name: "What is the complete compensation package?",
    type: "questions",
    tags: "Employment Agreements",
    details: "What is the base salary, bonus structure, equity compensation, benefits, and other forms of compensation included in this agreement?"
  },
  {
    id: "lib_question_non_compete_scope",
    name: "What are the non-compete restrictions?",
    type: "questions",
    tags: "Employment Agreements",
    details: "What activities are restricted by the non-compete clause, for how long, in what geographic area, and is it enforceable?"
  },
  {
    id: "lib_question_ip_ownership",
    name: "Who owns employee-created intellectual property?",
    type: "questions",
    tags: "Employment Agreements",
    details: "What intellectual property created by the employee belongs to the company, and what pre-existing IP is carved out?"
  },
  {
    id: "lib_question_severance_entitlement",
    name: "What severance is owed upon termination?",
    type: "questions",
    tags: "Employment Agreements",
    details: "What severance payments or benefits are owed if the employee is terminated without cause or in a change of control?"
  },
  {
    id: "lib_question_at_will_employment",
    name: "Is this at-will employment?",
    type: "questions",
    tags: "Employment Agreements",
    details: "Is this an at-will employment relationship, and are there any limitations on the employer's right to terminate?"
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Corporate Governance (5 questions)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_question_voting_rights",
    name: "What voting rights do shareholders have?",
    type: "questions",
    tags: "Corporate Governance",
    details: "What matters require shareholder approval, what are the voting thresholds, and do different share classes have different voting rights?"
  },
  {
    id: "lib_question_board_composition",
    name: "How is the board composed and elected?",
    type: "questions",
    tags: "Corporate Governance",
    details: "How many board seats exist, how are directors appointed, and what rights do different shareholders have to board representation?"
  },
  {
    id: "lib_question_liquidation_preference",
    name: "What are the liquidation preferences?",
    type: "questions",
    tags: "Corporate Governance",
    details: "In an exit or liquidation event, what order and amounts do different shareholders receive, and is there participation?"
  },
  {
    id: "lib_question_drag_along_rights",
    name: "What drag-along and tag-along rights exist?",
    type: "questions",
    tags: "Corporate Governance",
    details: "Can majority shareholders force minority shareholders to sell in an acquisition, and can minority shareholders participate in such sales?"
  },
  {
    id: "lib_question_transfer_restrictions",
    name: "What restrictions exist on share transfers?",
    type: "questions",
    tags: "Corporate Governance",
    details: "What restrictions apply to transferring shares, including ROFR, ROFO, board approval requirements, and permitted transfers?"
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AI Governance (5 questions)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_question_ai_systems_use",
    name: "What AI systems are used and for what purposes?",
    type: "questions",
    tags: "AI Governance",
    details: "What AI or automated decision-making systems are deployed, for what purposes, and what data do they process?"
  },
  {
    id: "lib_question_ai_bias_testing",
    name: "How is AI bias tested and mitigated?",
    type: "questions",
    tags: "AI Governance",
    details: "What procedures are in place to test for algorithmic bias, what fairness metrics are used, and how are biases remediated?"
  },
  {
    id: "lib_question_ai_transparency",
    name: "What transparency exists around AI decisions?",
    type: "questions",
    tags: "AI Governance",
    details: "Can AI-driven decisions be explained, are individuals notified when AI is used, and can decisions be appealed?"
  },
  {
    id: "lib_question_ai_regulatory_compliance",
    name: "Is the AI system compliant with emerging regulations?",
    type: "questions",
    tags: "AI Governance",
    details: "Does the AI system comply with the EU AI Act, sectoral AI regulations, and algorithmic accountability laws?"
  },
  {
    id: "lib_question_ai_liability",
    name: "Who is liable for AI system errors or harms?",
    type: "questions",
    tags: "AI Governance",
    details: "How is liability allocated for AI system failures, errors, or harms, and what insurance coverage exists?"
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Regulatory Compliance (5 questions)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_question_applicable_regulations",
    name: "What regulations apply to this agreement?",
    type: "questions",
    tags: "Regulatory Compliance",
    details: "What industry-specific or jurisdiction-specific regulations govern this agreement and what compliance obligations do they impose?"
  },
  {
    id: "lib_question_compliance_certifications",
    name: "What compliance certifications are required?",
    type: "questions",
    tags: "Regulatory Compliance",
    details: "What certifications, licenses, or registrations must be maintained to comply with this agreement?"
  },
  {
    id: "lib_question_audit_inspection_rights",
    name: "What audit and inspection rights exist?",
    type: "questions",
    tags: "Regulatory Compliance",
    details: "What audit rights do we have to verify regulatory compliance, and what access must be provided?"
  },
  {
    id: "lib_question_regulatory_change_management",
    name: "How are regulatory changes handled?",
    type: "questions",
    tags: "Regulatory Compliance",
    details: "What obligations exist to adapt to new or changed regulations, and who bears the cost of compliance updates?"
  },
  {
    id: "lib_question_sanctions_export_compliance",
    name: "Are there export control or sanctions restrictions?",
    type: "questions",
    tags: "Regulatory Compliance",
    details: "What export control, sanctions, or trade compliance restrictions apply, and what screening procedures are in place?"
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Disputes & Litigation (5 questions)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "lib_question_dispute_resolution_forum",
    name: "Where and how are disputes resolved?",
    type: "questions",
    tags: "Disputes & Litigation",
    details: "What forum (arbitration, litigation, mediation) is required for disputes, where is the venue, and what law governs?"
  },
  {
    id: "lib_question_arbitration_waiver",
    name: "Are we waiving rights to court litigation?",
    type: "questions",
    tags: "Disputes & Litigation",
    details: "Does this agreement require arbitration, and do we waive the right to jury trial or participation in class actions?"
  },
  {
    id: "lib_question_attorneys_fees",
    name: "Who pays legal fees in a dispute?",
    type: "questions",
    tags: "Disputes & Litigation",
    details: "Are attorney fees and costs allocated to the prevailing party, and are there any fee-shifting provisions?"
  },
  {
    id: "lib_question_injunctive_relief_availability",
    name: "Can we seek injunctive relief?",
    type: "questions",
    tags: "Disputes & Litigation",
    details: "Is injunctive relief available for breaches, or are damages the exclusive remedy, and are there carve-outs from arbitration for injunctions?"
  },
  {
    id: "lib_question_governing_law_choice",
    name: "What law governs this agreement?",
    type: "questions",
    tags: "Disputes & Litigation",
    details: "What jurisdiction's law governs the interpretation and enforcement of this agreement, and does it favor one party?"
  }
];

// ---------------------------------------------------------------------------
const ALL_DEFAULT_ITEMS = [...DEFAULT_PROMPTS, ...DEFAULT_QUESTIONS];

export async function seedDefaultLibraryForUser(
  userId: string,
  userRole: string = "USER"
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Set RLS context so the INSERT is visible to the user under RLS policy
    const sanitizedId = userId.replace(/'/g, "''");
    const sanitizedRole = userRole.replace(/'/g, "''");
    await client.query(`SET LOCAL app.current_user_id = '${sanitizedId}'`);
    await client.query(`SET LOCAL app.current_user_role = '${sanitizedRole}'`);

    for (const item of ALL_DEFAULT_ITEMS) {
      // Per-user deterministic ID prevents cross-user collisions and duplicates
      const itemId = `${item.id}_${userId}`;

      await client.query(
        `INSERT INTO library_items (id, user_id, type, name, description, tags, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [itemId, userId, item.type, item.name, item.name, item.tags, item.details]
      );
    }

    await client.query("COMMIT");
    console.log(
      `[libraryDefaults] Seeded ${ALL_DEFAULT_ITEMS.length} default items for user ${userId}`
    );
  } catch (err) {
    await client.query("ROLLBACK");
    // Log but do not re-throw — seeding is non-critical and must not block login
    console.warn(`[libraryDefaults] Seeding failed for user ${userId}:`, err);
  } finally {
    client.release();
  }
}
