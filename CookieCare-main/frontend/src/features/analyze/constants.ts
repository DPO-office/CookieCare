// ─── Upload limits ───────────────────────────────────────────────────────────
export const ACCEPTED_UPLOAD_EXTENSIONS = [".pdf", ".docx", ".doc", ".txt", ".md", ".csv", ".json"];
export const ACCEPTED_UPLOAD_ACCEPT_STRING = ".txt,.md,.json,.pdf,.docx,.doc,.csv";
export const MAX_UPLOAD_FILES = 25;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const UPLOAD_CONCURRENCY = 3;
export const JUNK_FILE_NAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini", ".gitkeep"]);

// ─── Misc ────────────────────────────────────────────────────────────────────
export const SYSTEM_FOLDER_NAME = "Uploaded Documents";

export const DEFAULT_PROMPT =
  "Perform a rigorous compliance audit and vulnerability scanning focusing on unannounced server audit entries, unilateral liability exclusions, and punitive liquidated damages.";

export const DEFAULT_PROMPT_LIBRARY = [
  {
    title: "Review Asymmetric Indemnification Liability",
    prompt:
      "Analyse whether the clause passes all IP infraction and systemic server delay damages solely onto the client on an asymmetric scale.",
  },
  {
    title: "SLA Infrastructure Availability Audit",
    prompt:
      "Verify uptime compliance thresholds and standard service credits calculations for cloud disruptions.",
  },
];

export const DEFAULT_QUESTIONS_LIBRARY = [
  "What is the confidentiality survival duration defined in the text?",
  "Are there any punitive, non-proven liquidated damages listed?",
];

// ─── Types ───────────────────────────────────────────────────────────────────
export interface PromptItem {
  title: string;
  description: string;
  prompt: string;
}

export interface PromptCategory {
  id: string;
  label: string;
  prompts: Array<{ title: string; prompt: string }>;
}

export interface QuestionItem {
  title: string;
  question: string;
}

export interface QuestionCategory {
  id: string;
  label: string;
  questions: Array<{ title: string; question: string }>;
}

// ─── Prompt Library ──────────────────────────────────────────────────────────
export const DEFAULT_PROMPT_CATEGORIES: PromptCategory[] = [
  {
    id: "general-review",
    label: "General Analysis",
    prompts: [
      {
        title: "Full Contract Risk Audit",
        prompt:
          "Perform a comprehensive risk audit of this agreement. Identify all one-sided, ambiguous, and potentially unenforceable clauses. Flag provisions that expose either party to disproportionate liability, unlimited indemnification, or uncapped damages. Summarise findings by severity: Critical, High, Medium, and Low.",
      },
      {
        title: "Key Obligations Summary",
        prompt:
          "Extract and summarise all material obligations imposed on each party. Categorise by: payment obligations, delivery obligations, compliance obligations, confidentiality obligations, and termination obligations. Identify any obligations that are vague, unmeasurable, or lack a defined timeframe.",
      },
      {
        title: "Termination Rights Analysis",
        prompt:
          "Review all termination provisions in this agreement. Identify: termination for convenience clauses and any required notice periods, termination for cause triggers, whether termination rights are mutual or one-sided, post-termination obligations including data return, destruction, and survival clauses.",
      },
      {
        title: "Dispute Resolution Review",
        prompt:
          "Analyse the dispute resolution mechanism in this agreement. Identify the governing law and jurisdiction, any mandatory arbitration clauses and their fairness implications, escalation procedures before litigation or arbitration, and whether the process is balanced between both parties.",
      },
      {
        title: "Liability & Indemnification Analysis",
        prompt:
          "Review all liability, indemnification, and limitation of liability provisions. Identify: whether liability caps are mutual, whether there are carve-outs for fraud, wilful misconduct, or gross negligence, whether indemnification obligations are proportionate, and any unlimited liability exposures.",
      },
    ],
  },
  {
    id: "commercial",
    label: "Commercial Agreements",
    prompts: [
      {
        title: "NDA Confidentiality Scope Review",
        prompt:
          "Analyse the confidentiality and non-disclosure obligations in this NDA. Identify: the scope of confidential information, permitted disclosures and exceptions, survival period after termination, return or destruction of confidential materials obligations, and whether the obligations are mutual or unilateral.",
      },
      {
        title: "MSA Payment Terms Audit",
        prompt:
          "Review all payment, invoicing, and financial provisions in this Master Services Agreement. Flag: payment terms and late payment penalties, disputed invoice procedures, price adjustment mechanisms, currency and tax obligations, and any automatic renewal or price escalation clauses.",
      },
      {
        title: "IP Ownership & Licensing Review",
        prompt:
          "Analyse all intellectual property provisions. Identify: who owns work product and deliverables, whether background IP is adequately protected, license grants and their scope, any IP indemnification obligations, and whether open source usage restrictions are addressed.",
      },
      {
        title: "SLA Performance Obligations",
        prompt:
          "Review all service level commitments. Extract: uptime guarantees and measurement methodology, service credit calculation and redemption process, exclusions from SLA calculations, escalation procedures for persistent failures, and termination rights triggered by SLA breaches.",
      },
      {
        title: "Renewal & Auto-Renewal Risks",
        prompt:
          "Identify all auto-renewal provisions, notice requirements to prevent renewal, and price change provisions upon renewal. Flag any clauses where failure to provide timely notice results in long-term commitment or price escalation the client may not have anticipated.",
      },
    ],
  },
  {
    id: "privacy",
    label: "Privacy & Data Protection",
    prompts: [
      {
        title: "GDPR Article 28 DPA Compliance Review",
        prompt:
          "Perform a rigorous GDPR Article 28 compliance review of this Data Processing Agreement. Verify: subject matter, duration, nature and purpose of processing, categories of data and data subjects, obligations and rights of the controller, and whether all mandatory Article 28(3) clauses are present and adequate.",
      },
      {
        title: "Data Subject Rights Obligations",
        prompt:
          "Review how this agreement addresses data subject rights under GDPR Articles 15–22. Identify: obligations to assist the controller with access, erasure, rectification, and portability requests, defined response timeframes, and any gaps that could result in a GDPR violation.",
      },
      {
        title: "International Data Transfer Mechanisms",
        prompt:
          "Analyse all international data transfer provisions. Identify: whether Standard Contractual Clauses, Binding Corporate Rules, or adequacy decisions are referenced, whether Schrems II supplementary measures are addressed, transfers to third countries and the legal basis for each, and any gaps in transfer mechanisms.",
      },
      {
        title: "Data Breach Notification Obligations",
        prompt:
          "Review all data breach and security incident notification obligations. Extract: notification timeframes (72-hour GDPR requirement), who must notify whom, minimum notification content requirements, obligations to assist with regulatory reporting, and any gaps relative to GDPR Articles 33 and 34.",
      },
      {
        title: "Subprocessor Management Review",
        prompt:
          "Review all subprocessor provisions in this DPA. Identify: whether prior written consent is required for new subprocessors, notice periods for subprocessor changes, objection rights, whether subprocessors are bound by equivalent obligations, and the controller's step-in rights if a subprocessor fails.",
      },
    ],
  },
  {
    id: "vendor-risk",
    label: "Vendor & Third-Party Risk",
    prompts: [
      {
        title: "Vendor Due Diligence Clause Review",
        prompt:
          "Analyse vendor due diligence and compliance obligations in this agreement. Identify: representations and warranties regarding security posture, compliance certifications required (ISO 27001, SOC 2, etc.), audit rights, obligations to notify the client of material changes to security practices, and supply chain risk provisions.",
      },
      {
        title: "Third-Party Subcontracting Risk",
        prompt:
          "Review all subcontracting and delegation provisions. Identify: whether subcontracting is permitted, approval requirements for subcontractors, whether the vendor remains liable for subcontractor failures, flow-down obligations, and any geographic restrictions on subcontracting.",
      },
      {
        title: "Audit Rights Analysis",
        prompt:
          "Review all audit and inspection rights in this agreement. Extract: who has the right to audit, frequency and notice requirements, scope of permitted audits (financial, security, compliance), obligations to remediate audit findings, and whether audit costs are borne by the vendor or shared.",
      },
      {
        title: "Vendor Financial Stability Provisions",
        prompt:
          "Identify provisions addressing vendor financial stability. Review: change of control and assignment clauses, insolvency or bankruptcy triggers for termination, step-in rights, escrow obligations for source code or data, and business continuity obligations.",
      },
      {
        title: "Service Continuity & Exit Planning",
        prompt:
          "Review service continuity, transition assistance, and exit management provisions. Identify: transition assistance obligations upon termination, data export and migration support, knowledge transfer requirements, exit fees or lock-in provisions, and whether the vendor must cooperate with a replacement provider.",
      },
    ],
  },
  {
    id: "security",
    label: "Security & Cybersecurity",
    prompts: [
      {
        title: "Cybersecurity Obligation Assessment",
        prompt:
          "Review all cybersecurity and information security obligations. Extract: specific security standards required (NIST, ISO 27001, CIS Controls), encryption requirements for data at rest and in transit, access control obligations, penetration testing requirements, and vulnerability management obligations.",
      },
      {
        title: "Security Incident Response Review",
        prompt:
          "Analyse security incident response obligations. Identify: incident detection and containment timeframes, notification obligations and timelines, forensic investigation cooperation, regulatory notification assistance obligations, remediation requirements, and whether the vendor must indemnify the client for security incidents caused by vendor negligence.",
      },
      {
        title: "Data Retention & Deletion Obligations",
        prompt:
          "Review all data retention and deletion provisions. Identify: retention periods for different categories of data, secure deletion and destruction obligations upon contract termination, certification of deletion requirements, backup retention policies, and whether retention periods comply with applicable regulations.",
      },
      {
        title: "Access Control & Privileged Access",
        prompt:
          "Review access control, privileged access management, and identity provisions. Identify: minimum access principles, multi-factor authentication requirements, privileged access monitoring obligations, background check requirements for personnel with data access, and offboarding obligations.",
      },
      {
        title: "Business Continuity & DR Obligations",
        prompt:
          "Analyse business continuity and disaster recovery provisions. Extract: RPO and RTO commitments, DR testing frequency and reporting obligations, geographic redundancy requirements, obligations to notify the client of BCP/DR plan changes, and any gaps that could affect service availability.",
      },
    ],
  },
  {
    id: "employment",
    label: "Employment Agreements",
    prompts: [
      {
        title: "Non-Compete & Restraint of Trade Review",
        prompt:
          "Review all post-employment restraint provisions. Identify: geographic scope and duration of non-compete obligations, scope of restricted activities, whether restrictions are proportionate and likely enforceable under applicable law, garden leave provisions, and any compensation provided in exchange for post-employment restrictions.",
      },
      {
        title: "IP Assignment & Inventions Clause",
        prompt:
          "Review all intellectual property assignment and inventions provisions. Identify: scope of IP assigned to the employer, whether pre-existing IP is excluded, obligations to disclose inventions, moral rights waivers, and whether the assignment extends to inventions made outside working hours.",
      },
      {
        title: "Termination & Redundancy Provisions",
        prompt:
          "Analyse termination, redundancy, and severance provisions. Identify: notice periods and payment in lieu provisions, grounds for summary dismissal, redundancy selection criteria, severance payment obligations, and any post-termination cooperation obligations that could restrict the employee's future employment.",
      },
      {
        title: "Employee Data Privacy Review",
        prompt:
          "Review all provisions relating to employee data collection, monitoring, and processing. Identify: categories of data collected, monitoring practices (email, communications, location), legal basis for processing under GDPR or applicable law, data retention periods, and whether employee consent obligations are appropriately addressed.",
      },
      {
        title: "Bonus, Commission & Equity Provisions",
        prompt:
          "Analyse all variable compensation provisions including bonuses, commissions, and equity. Identify: discretionary versus contractual entitlements, performance measurement criteria, payment conditions and timing, good leaver/bad leaver provisions, clawback clauses, and any provisions that could result in forfeiture of earned compensation.",
      },
    ],
  },
  {
    id: "corporate",
    label: "Corporate Governance",
    prompts: [
      {
        title: "Change of Control Provisions",
        prompt:
          "Review all change of control, assignment, and novation provisions. Identify: what constitutes a triggering change of control event, whether consent is required from the counterparty, termination rights triggered by a change of control, and whether these provisions are balanced or favour one party.",
      },
      {
        title: "Representations & Warranties Audit",
        prompt:
          "Analyse all representations and warranties. Identify: which party makes each representation, whether representations are qualified by materiality or knowledge, the survival period after closing, remedy provisions for breach of representation, and any gaps in standard commercial representations.",
      },
      {
        title: "Confidentiality & Non-Solicitation",
        prompt:
          "Review non-solicitation of employees, customers, and confidentiality provisions. Identify: scope of non-solicitation obligations, duration and geographic limitations, whether restrictions are mutual, exceptions for general advertising, and enforceability considerations under applicable law.",
      },
      {
        title: "Force Majeure Clause Analysis",
        prompt:
          "Review the force majeure clause. Identify: what events are defined as force majeure, whether cyber attacks, pandemics, and supply chain disruptions are included, notice requirements, obligations during a force majeure period, termination rights if force majeure persists, and whether the clause is appropriately balanced.",
      },
      {
        title: "Entire Agreement & Variation Clause",
        prompt:
          "Analyse the entire agreement, variation, and waiver provisions. Identify: whether the entire agreement clause adequately supersedes prior representations, requirements for valid variations (written, signed), whether waivers must be express, and any course of dealing risks that could override contractual terms.",
      },
    ],
  },
  {
    id: "ai-governance",
    label: "AI Governance",
    prompts: [
      {
        title: "AI EU Act Compliance Review",
        prompt:
          "Review this agreement against EU AI Act obligations. Identify: whether the AI system falls within prohibited, high-risk, or limited-risk categories, conformity assessment obligations, obligations regarding training data, human oversight requirements, transparency and explainability obligations, and technical documentation requirements.",
      },
      {
        title: "AI Bias & Fairness Obligations",
        prompt:
          "Analyse provisions addressing AI bias, fairness, and non-discrimination. Identify: obligations to test for discriminatory outputs, fairness monitoring requirements, obligations to notify affected parties of automated decisions, right to human review of AI decisions, and any indemnification provisions for discriminatory AI outcomes.",
      },
      {
        title: "AI Vendor Liability Allocation",
        prompt:
          "Review how liability is allocated for AI system errors, hallucinations, and harmful outputs. Identify: whether the vendor accepts liability for AI-generated content, indemnification obligations for AI-caused harm, accuracy and reliability representations, and whether the agreement adequately addresses the unpredictable nature of AI outputs.",
      },
      {
        title: "Training Data & IP Rights",
        prompt:
          "Analyse provisions relating to training data and AI intellectual property. Identify: whether customer data can be used to train AI models, opt-out mechanisms, ownership of AI-generated outputs, whether the vendor's use of training data creates IP contamination risks, and compliance with applicable data protection law.",
      },
      {
        title: "AI Transparency & Explainability",
        prompt:
          "Review transparency and explainability provisions for AI systems. Identify: obligations to disclose that AI is being used, explainability requirements for AI-driven decisions, audit trail obligations, obligations to document model changes, and whether human override mechanisms are contractually required.",
      },
    ],
  },
  {
    id: "regulatory",
    label: "Regulatory Compliance",
    prompts: [
      {
        title: "CCPA / CPRA Compliance Review",
        prompt:
          "Review this agreement for CCPA and CPRA compliance. Identify: whether required Service Provider restrictions are present, sale and sharing of personal information prohibitions, consumer rights obligations, data retention limitations, and whether the agreement adequately addresses sensitive personal information categories under CPRA.",
      },
      {
        title: "HIPAA Business Associate Agreement Review",
        prompt:
          "Analyse this agreement against HIPAA Business Associate Agreement requirements. Identify: permitted uses and disclosures of PHI, safeguard obligations, breach notification requirements, obligations to flow down to subcontractors, return or destruction of PHI upon termination, and any provisions that could expose the covered entity to HIPAA liability.",
      },
      {
        title: "Financial Services Regulatory Compliance",
        prompt:
          "Review this agreement for compliance with applicable financial services regulations including MiFID II, PSD2, and FCA requirements. Identify: outsourcing notification obligations, operational resilience requirements, audit and supervisory access rights, sub-outsourcing restrictions, and concentration risk provisions.",
      },
      {
        title: "Anti-Bribery & Corruption Compliance",
        prompt:
          "Analyse anti-bribery, anti-corruption, and anti-money laundering provisions. Identify: compliance with the UK Bribery Act, US FCPA, and applicable local law, representations regarding facilitation payments, obligations to maintain adequate procedures, audit rights, and termination rights for breach of anti-corruption provisions.",
      },
      {
        title: "Modern Slavery & Supply Chain",
        prompt:
          "Review modern slavery, human trafficking, and ethical supply chain provisions. Identify: representations regarding compliance with the Modern Slavery Act, obligations to audit the supply chain, reporting obligations, right to terminate for modern slavery breaches, and whether due diligence obligations extend to all tiers of the supply chain.",
      },
    ],
  },
  {
    id: "disputes",
    label: "Disputes & Litigation",
    prompts: [
      {
        title: "Arbitration Clause Fairness Review",
        prompt:
          "Review the arbitration and alternative dispute resolution provisions. Identify: whether arbitration is mandatory or optional, the selected arbitral institution and rules, seat of arbitration and governing procedural law, whether class action waivers are included and their enforceability, cost allocation provisions, and whether the clause is balanced.",
      },
      {
        title: "Limitation of Liability Carve-Outs",
        prompt:
          "Analyse all limitation of liability provisions and their exceptions. Identify: the liability cap amount and its basis, excluded categories of loss (consequential, indirect, loss of profits), carve-outs from the cap for fraud, wilful misconduct, death and personal injury, IP infringement, and data breaches. Assess whether the overall liability allocation is commercially reasonable.",
      },
      {
        title: "Injunctive Relief & Specific Performance",
        prompt:
          "Review provisions addressing injunctive relief, specific performance, and emergency remedies. Identify: whether either party has agreed that monetary damages are inadequate for certain breaches, automatic entitlement to injunctive relief provisions, waiver of bond or undertaking requirements, and whether these provisions are mutual.",
      },
      {
        title: "Warranty Disclaimers & AS-IS Provisions",
        prompt:
          "Review all warranty, disclaimer, and AS-IS provisions. Identify: what warranties are expressly given, which implied warranties are disclaimed, whether consumer protection law warranties can be lawfully disclaimed in the relevant jurisdiction, fitness for purpose representations, and any gaps in warranty coverage that expose the client.",
      },
      {
        title: "Set-Off & Withholding Rights",
        prompt:
          "Analyse set-off, counterclaim, and withholding rights. Identify: whether set-off rights are expressly excluded, conditions under which a party may withhold payment, whether disputed amounts can be withheld pending resolution, cash flow implications of set-off exclusions, and whether the provisions are commercially balanced.",
      },
    ],
  },
];

// ─── Question Library ─────────────────────────────────────────────────────────
export const DEFAULT_QUESTION_CATEGORIES: QuestionCategory[] = [
  {
    id: "general-review",
    label: "General Analysis",
    questions: [
      { title: "Unlimited Liability Exposure", question: "Does this agreement contain any unlimited liability provisions? If so, identify each clause and explain the commercial risk." },
      { title: "Balanced Obligations", question: "Are the obligations in this agreement balanced between both parties, or does one party bear a disproportionate burden?" },
      { title: "Ambiguous Clauses", question: "Identify any clauses that are ambiguous, undefined, or likely to lead to disputes about their meaning or application." },
      { title: "Missing Standard Provisions", question: "What standard commercial provisions are missing from this agreement that would typically appear in a contract of this type?" },
      { title: "Survival Clauses", question: "Which clauses survive termination of this agreement and for how long? Are there any gaps in survival provisions?" },
    ],
  },
  {
    id: "commercial",
    label: "Commercial Agreements",
    questions: [
      { title: "Termination Balance", question: "Are the termination rights in this agreement mutual, or does one party have significantly broader rights to terminate than the other?" },
      { title: "Auto-Renewal Risk", question: "Does this agreement include auto-renewal provisions? What notice period is required to prevent renewal, and does it create lock-in risk?" },
      { title: "Price Escalation", question: "Does this agreement allow the vendor to increase prices unilaterally? If so, what notice is required and are there any caps on price increases?" },
      { title: "IP Ownership Risk", question: "Who owns the intellectual property in deliverables and work product created under this agreement? Is there any risk of the client losing rights to materials it has paid for?" },
      { title: "Payment Dispute Risk", question: "What happens if the client disputes an invoice? Can the vendor suspend services or terminate for a disputed payment?" },
    ],
  },
  {
    id: "privacy",
    label: "Privacy & Data Protection",
    questions: [
      { title: "GDPR Article 28 Completeness", question: "Does this Data Processing Agreement include all mandatory provisions required under GDPR Article 28(3)? Identify any missing elements." },
      { title: "Subprocessor Consent", question: "Does the agreement require prior written consent before the processor engages a new subprocessor, or only notification? What is the client's right to object?" },
      { title: "Data Breach 72-Hour Notification", question: "Does the agreement require the processor to notify the controller within 72 hours of becoming aware of a data breach, as required by GDPR Article 33?" },
      { title: "International Transfer Mechanism", question: "What legal mechanism is used for international transfers of personal data? Are Standard Contractual Clauses referenced, and do they reflect the 2021 EU SCCs?" },
      { title: "Data Subject Rights Assistance", question: "What obligations does the processor have to assist the controller in responding to data subject rights requests? Are response timeframes defined?" },
    ],
  },
  {
    id: "vendor-risk",
    label: "Vendor & Third-Party Risk",
    questions: [
      { title: "Audit Rights Adequacy", question: "Does the client have the right to audit the vendor's security and compliance practices? How often, with what notice, and at whose cost?" },
      { title: "Subcontracting Approval", question: "Can the vendor subcontract its obligations without the client's consent? What liability does the vendor retain for subcontractor failures?" },
      { title: "Change of Control", question: "What happens if the vendor is acquired? Does the client have termination rights on a change of control, and is consent required for assignment?" },
      { title: "Service Continuity Risk", question: "What obligations does the vendor have to support transition and data migration if the agreement is terminated? Are there any exit fees or cooperation restrictions?" },
      { title: "Security Certification Requirements", question: "Does this agreement require the vendor to maintain specific security certifications such as ISO 27001 or SOC 2? What happens if the vendor loses a required certification?" },
    ],
  },
  {
    id: "security",
    label: "Security & Cybersecurity",
    questions: [
      { title: "Encryption Requirements", question: "Does this agreement specify encryption standards for data at rest and in transit? Are the required standards current and adequate?" },
      { title: "Penetration Testing Obligations", question: "Is the vendor required to conduct regular penetration testing? How frequently, and must results be shared with the client?" },
      { title: "Incident Notification Timeframe", question: "Within what timeframe must the vendor notify the client of a security incident? Does the agreement define what constitutes a notifiable incident?" },
      { title: "Access Control Obligations", question: "Does the agreement impose minimum access controls, multi-factor authentication requirements, or privileged access management obligations on the vendor?" },
      { title: "Data Deletion on Termination", question: "What obligations does the vendor have to securely delete or return client data on termination? Is certification of deletion required?" },
    ],
  },
  {
    id: "employment",
    label: "Employment Agreements",
    questions: [
      { title: "Non-Compete Enforceability", question: "Are the post-employment non-compete restrictions in this agreement proportionate in scope, duration, and geography to be enforceable under applicable law?" },
      { title: "IP Assignment Scope", question: "Does the IP assignment clause capture inventions made outside working hours or using personal resources? Could this be challenged by the employee?" },
      { title: "Garden Leave Provisions", question: "Does this agreement include garden leave provisions, and are they properly structured to protect the employer's legitimate business interests?" },
      { title: "Clawback Provisions", question: "Does this agreement include bonus or equity clawback provisions? Under what circumstances can compensation be recovered, and are they enforceable?" },
      { title: "Employee Monitoring Legality", question: "Does this agreement or any referenced policy authorise employee monitoring of communications or location? Is the legal basis for monitoring adequately addressed?" },
    ],
  },
  {
    id: "corporate",
    label: "Corporate Governance",
    questions: [
      { title: "Force Majeure Scope", question: "Does the force majeure clause cover cyber attacks, pandemics, and supply chain disruptions? Are the consequences of a force majeure event clearly defined?" },
      { title: "Governing Law Suitability", question: "Is the governing law and jurisdiction clause appropriate for both parties given their locations and the nature of the agreement?" },
      { title: "Variation Requirements", question: "Does this agreement require all variations to be made in writing and signed by both parties? Are there risks from oral modifications or course of dealing?" },
      { title: "Representations Survival", question: "For how long do representations and warranties survive after the agreement's effective date or completion? Are survival periods adequate for the risk involved?" },
      { title: "Non-Solicitation Balance", question: "Are the non-solicitation of employees and customers provisions mutual, and are they proportionate enough to be enforceable?" },
    ],
  },
  {
    id: "ai-governance",
    label: "AI Governance",
    questions: [
      { title: "Training Data Usage", question: "Does this agreement permit the vendor to use client data, including personal data, to train or improve AI models? Is there an opt-out mechanism?" },
      { title: "AI Output Liability", question: "Who is liable if the AI system produces incorrect, harmful, or discriminatory outputs? Does the vendor disclaim all liability for AI-generated content?" },
      { title: "EU AI Act Risk Category", question: "Based on the description of this AI system, does it fall within the EU AI Act's prohibited, high-risk, or limited-risk category? What compliance obligations apply?" },
      { title: "Human Oversight Requirements", question: "Does this agreement require human oversight of AI-driven decisions that affect individuals? Are override mechanisms contractually required?" },
      { title: "AI Explainability Obligations", question: "Is the vendor required to explain how the AI system makes decisions? Are audit trail and model documentation obligations included?" },
    ],
  },
  {
    id: "regulatory",
    label: "Regulatory Compliance",
    questions: [
      { title: "CCPA Service Provider Status", question: "Does this agreement include the restrictions necessary to qualify the vendor as a Service Provider under CCPA, preventing the sale or sharing of personal information?" },
      { title: "HIPAA BAA Completeness", question: "Does this agreement satisfy all requirements for a valid HIPAA Business Associate Agreement? Identify any provisions that do not meet HHS requirements." },
      { title: "Anti-Bribery Representations", question: "Does this agreement include adequate anti-bribery and anti-corruption representations and warranties compliant with the UK Bribery Act and US FCPA?" },
      { title: "Financial Outsourcing Requirements", question: "Does this agreement meet applicable financial services outsourcing requirements including operational resilience, audit access, and supervisory notification obligations?" },
      { title: "Modern Slavery Compliance", question: "Does this agreement include Modern Slavery Act compliance obligations and rights to audit the vendor's supply chain for slavery and human trafficking?" },
    ],
  },
  {
    id: "disputes",
    label: "Disputes & Litigation",
    questions: [
      { title: "Liability Cap Adequacy", question: "Is the liability cap in this agreement adequate given the value of the contract and the potential losses that could result from a breach? What is excluded from the cap?" },
      { title: "Consequential Loss Exclusion", question: "Does the agreement exclude consequential, indirect, or loss of profit damages? Could this exclusion prevent recovery of the most significant losses in the event of a breach?" },
      { title: "Mandatory Arbitration Fairness", question: "Is the arbitration clause in this agreement fair to both parties? Does it include class action waivers and are those waivers enforceable in the relevant jurisdiction?" },
      { title: "Injunctive Relief Availability", question: "Does this agreement allow either party to seek injunctive or emergency relief from a court without going through the dispute resolution process?" },
      { title: "Set-Off Rights Exclusion", question: "Does this agreement exclude the right to set off amounts owed against disputed invoices? What are the cash flow implications of this exclusion for the client?" },
    ],
  },
];
