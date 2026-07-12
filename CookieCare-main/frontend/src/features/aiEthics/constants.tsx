import React from "react";
import {
  Scale, Eye, ClipboardCheck, Database, UserCheck, Gauge,
  AlertTriangle, Lock, XCircle,
} from "lucide-react";
import { AnalysisStep, EthicsFinding } from "./types";

export const ANALYSIS_STEPS: AnalysisStep[] = [
  { id: "read",           label: "Reading AI documentation",              status: "pending" },
  { id: "identify",       label: "Identifying AI system information",     status: "pending" },
  { id: "fairness",       label: "Evaluating fairness and bias",          status: "pending" },
  { id: "transparency",   label: "Reviewing transparency practices",      status: "pending" },
  { id: "accountability", label: "Checking accountability controls",      status: "pending" },
  { id: "privacy",        label: "Assessing privacy and data governance", status: "pending" },
  { id: "oversight",      label: "Evaluating human oversight",            status: "pending" },
  { id: "score",          label: "Calculating AI Ethics Score",           status: "pending" },
  { id: "recommendations",label: "Generating recommendations",           status: "pending" },
  { id: "finalize",       label: "Finalizing assessment",                 status: "pending" },
];

export const MOCK_FINDINGS: EthicsFinding[] = [
  { id: "f1", category: "Fairness & Bias", status: "warning", description: "The model documentation references demographic parity as a fairness metric but does not provide quantitative bias audit results across protected attributes including race, gender, and age.", recommendation: "Conduct and publish formal bias audits covering all relevant protected attributes. Adopt multiple fairness metrics (equalized odds, calibration) and disclose test set composition." },
  { id: "f2", category: "Transparency", status: "needs-improvement", description: "Model architecture and training methodology are described at a high level only. No model card or system card has been provided detailing performance across subgroups, known limitations, or out-of-scope use cases.", recommendation: "Publish a comprehensive model card following the Mitchell et al. (2019) framework, including intended use, performance metrics per demographic group, and documented failure modes." },
  { id: "f3", category: "Accountability", status: "passed", description: "An AI governance committee is established with clear ownership. The documentation identifies a named AI Officer responsible for ethics oversight and an escalation path for AI-related concerns.", recommendation: "Consider establishing a formal AI incident register and a process for post-deployment monitoring reviews at defined intervals (e.g. quarterly)." },
  { id: "f4", category: "Privacy & Data Governance", status: "warning", description: "Training data provenance documentation is partially complete. Consent mechanisms for personal data used in training are referenced but not fully evidenced. Data retention for model inputs is undefined.", recommendation: "Document full data lineage including source, consent basis, anonymisation techniques, and retention schedules. Conduct a Data Protection Impact Assessment (DPIA) for high-risk processing." },
  { id: "f5", category: "Human Oversight", status: "passed", description: "The system architecture includes human review checkpoints for high-stakes decisions. An override mechanism is documented and access controls for intervention are defined.", recommendation: "Expand human oversight logging to capture all override events. Define SLAs for human review queues and ensure adequate staffing for peak load scenarios." },
  { id: "f6", category: "Security Controls", status: "needs-improvement", description: "Adversarial robustness testing is not mentioned in the documentation. There is no reference to model security assessments, prompt injection mitigations, or data poisoning controls.", recommendation: "Integrate adversarial testing into the model release pipeline. Document red-teaming results and implement input validation and output filtering controls." },
  { id: "f7", category: "Documentation Quality", status: "warning", description: "Technical documentation is present but lacks version control evidence. Multiple referenced annexes are missing. The risk register has not been updated to reflect the current model version.", recommendation: "Establish a documentation governance policy with versioning requirements. Link the risk register to the model release cycle and assign documentation owners." },
  { id: "f8", category: "Explainability", status: "high-risk", description: "No explainability mechanisms are documented for end-user-facing decisions. Individuals affected by automated decisions have no access to explanations, which may conflict with GDPR Article 22 requirements.", recommendation: "Implement and document an explainability layer (e.g. LIME, SHAP, or rule-based summaries). Provide affected individuals with meaningful information about automated decision logic." },
];

export const ETHICS_BREAKDOWN = [
  { label: "Fairness",        score: 58 },
  { label: "Transparency",    score: 45 },
  { label: "Accountability",  score: 82 },
  { label: "Privacy",         score: 64 },
  { label: "Human Oversight", score: 79 },
  { label: "Governance",      score: 61 },
];

export const FEATURE_CARDS = [
  { icon: Scale,         title: "Fairness & Bias",          description: "Detect potential bias and fairness risks across protected attributes and demographic groups." },
  { icon: Eye,           title: "Transparency",             description: "Review explainability mechanisms, model cards, and documentation quality." },
  { icon: ClipboardCheck,title: "Accountability",           description: "Evaluate AI governance ownership, oversight structures and escalation controls." },
  { icon: Database,      title: "Privacy & Data Governance",description: "Assess responsible handling of personal data in training and inference pipelines." },
  { icon: UserCheck,     title: "Human Oversight",          description: "Review human involvement, override mechanisms and monitoring capabilities." },
  { icon: Gauge,         title: "Risk Assessment",          description: "Generate an overall AI ethics risk evaluation and governance gap analysis." },
];

export const MOCK_RECOMMENDATIONS = [
  { category: "Bias Mitigation",          icon: <Scale className="w-4 h-4" />,        accent: "border-red-200 bg-red-50/40",     items: ["Commission an independent bias audit covering all protected attributes before next model release", "Adopt a bias monitoring pipeline in production with automated alerts for performance drift across groups", "Document fairness constraints applied during training and any trade-offs accepted between fairness metrics"] },
  { category: "Governance Improvements",  icon: <ClipboardCheck className="w-4 h-4" />,accent: "border-amber-200 bg-amber-50/40", items: ["Establish a formal AI incident register with severity classifications and response SLAs", "Define a model lifecycle policy covering versioning, deprecation, and incident retrospectives", "Expand AI governance committee to include external ethics advisory representation", "Introduce mandatory ethics review gates at key stages of the model development lifecycle"] },
  { category: "Transparency Enhancements",icon: <Eye className="w-4 h-4" />,           accent: "border-blue-200 bg-blue-50/40",   items: ["Publish a model card aligned with industry standards covering intended use, limitations, and subgroup performance", "Create a public-facing AI system summary accessible to non-technical stakeholders", "Document training data composition, provenance, and consent basis in a data card"] },
  { category: "Privacy Recommendations",  icon: <Lock className="w-4 h-4" />,          accent: "border-orange-200 bg-orange-50/40",items: ["Complete and publish a DPIA for all high-risk processing activities involving personal data", "Define and enforce data retention schedules for model inputs and outputs", "Review training data consent mechanisms and remediate any gaps before next model update"] },
  { category: "Human Oversight Suggestions",icon: <UserCheck className="w-4 h-4" />,  accent: "border-emerald-200 bg-emerald-50/40",items: ["Extend override logging to capture rationale, reviewer identity, and outcome for audit purposes", "Define escalation thresholds for automated decisions requiring mandatory human review", "Conduct regular tabletop exercises to validate that oversight mechanisms work under load"] },
];
