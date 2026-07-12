import React from "react";
import {
  Shield, Award, BadgeCheck, MapPin, Network, BarChart3,
  XCircle, TrendingUp, AlertTriangle, CheckCircle2,
} from "lucide-react";
import type { AnalysisStep, VendorFinding, ComplianceItem, RecommendationSection, FeatureCard } from "./types";

export const ANALYSIS_STEPS: AnalysisStep[] = [
  { id: "read",       label: "Reading uploaded documents",         status: "pending" },
  { id: "identify",   label: "Identifying vendor information",     status: "pending" },
  { id: "privacy",    label: "Reviewing privacy policy",          status: "pending" },
  { id: "gdpr",       label: "Checking GDPR compliance",          status: "pending" },
  { id: "certs",      label: "Verifying security certifications", status: "pending" },
  { id: "residency",  label: "Detecting data residency",          status: "pending" },
  { id: "processors", label: "Identifying sub-processors",        status: "pending" },
  { id: "contracts",  label: "Assessing contractual risks",       status: "pending" },
  { id: "score",      label: "Calculating vendor risk score",     status: "pending" },
  { id: "report",     label: "Generating assessment report",      status: "pending" },
];

export const MOCK_FINDINGS: VendorFinding[] = [
  {
    id: "f1", category: "GDPR Compliance", status: "passed", tag: "Art. 13–14 GDPR",
    description: "The vendor's privacy policy adequately addresses data subject rights and lawful bases for processing personal data in line with GDPR requirements.",
    recommendation: "No critical action required. Consider requesting a formal DPA to document the processing relationship and ensure Article 28 obligations are covered.",
  },
  {
    id: "f2", category: "SOC 2 Availability", status: "warning", tag: "Security",
    description: "SOC 2 Type I report was identified but no SOC 2 Type II report is available. Type II provides stronger assurance over operational effectiveness across a period of time.",
    recommendation: "Request a current SOC 2 Type II report covering at least a 6-month audit period. Verify the report is dated within the last 12 months.",
  },
  {
    id: "f3", category: "ISO 27001 Certification", status: "passed", tag: "ISO",
    description: "Valid ISO 27001:2022 certification identified. The certificate covers information security management systems and is in scope for the vendor's core platform.",
    recommendation: "Verify the certificate has not expired and that the audit scope includes the systems and services relevant to your use case.",
  },
  {
    id: "f4", category: "Privacy Policy Review", status: "warning", tag: "Privacy",
    description: "The privacy policy lacks clear disclosure of all data categories collected and the retention period for each category. Cookie consent mechanisms are referenced but not fully described.",
    recommendation: "Request an updated privacy policy that explicitly lists all personal data categories, their purpose, legal basis and retention periods. Verify cookie banner compliance.",
  },
  {
    id: "f5", category: "Data Residency", status: "passed", tag: "Infrastructure",
    description: "Vendor documentation confirms primary data storage in EU (Frankfurt, AWS eu-central-1). Backup replicas remain within EU regions. No cross-Atlantic transfers identified for primary data.",
    recommendation: "Confirm this in the contractual DPA and request documented evidence of the AWS region configuration for your specific tenant.",
  },
  {
    id: "f6", category: "Sub-processors", status: "warning", tag: "Third Parties",
    description: "Sub-processor list is published but has not been updated in over 14 months. Three sub-processors (Stripe, Intercom, Segment) process personal data and require adequate transfer mechanisms.",
    recommendation: "Request an up-to-date sub-processor list with a commitment to 30-day advance notice of changes. Verify all sub-processors have Standard Contractual Clauses in place.",
  },
  {
    id: "f7", category: "Data Retention", status: "missing", tag: "Privacy",
    description: "No specific data retention schedule has been identified across the reviewed documentation. The privacy policy mentions data is kept 'as long as necessary' without defined periods.",
    recommendation: "Require the vendor to provide a formal data retention schedule before onboarding. Include contractual retention and deletion obligations with specific timeframes.",
  },
  {
    id: "f8", category: "Incident Response", status: "passed", tag: "Security",
    description: "Security documentation includes a documented incident response plan with defined escalation paths, SLA commitments for breach notification (72-hour target aligned with GDPR Art. 33).",
    recommendation: "Confirm the 72-hour notification obligation is reflected in your contractual agreement and that it covers both processor and controller notification paths.",
  },
  {
    id: "f9", category: "Encryption Practices", status: "passed", tag: "Security",
    description: "Documentation confirms AES-256 encryption at rest and TLS 1.2+ in transit. Key management procedures are described with annual rotation policy.",
    recommendation: "Request evidence of key management practices such as HSM usage or AWS KMS configuration. Verify TLS version minimums are enforced at the application layer.",
  },
  {
    id: "f10", category: "HIPAA Readiness", status: "high-risk", tag: "Compliance",
    description: "No HIPAA Business Associate Agreement (BAA) is available and the vendor does not appear to have formal HIPAA compliance documentation. This is a critical gap if PHI will be processed.",
    recommendation: "Do not process Protected Health Information with this vendor until a signed BAA is in place and HIPAA compliance has been independently verified.",
  },
];

export const MOCK_COMPLIANCE: ComplianceItem[] = [
  { label: "GDPR",      status: "compliant" },
  { label: "SOC 2",     status: "partial"   },
  { label: "ISO 27001", status: "compliant" },
  { label: "HIPAA",     status: "missing"   },
  { label: "CCPA",      status: "partial"   },
  { label: "PCI DSS",   status: "na"        },
];

export const MOCK_RECOMMENDATIONS: RecommendationSection[] = [
  {
    category: "Missing Documentation",
    icon: React.createElement(XCircle, { className: "w-4 h-4" }),
    accent: "border-red-200 bg-red-50/40",
    items: [
      "Formal data retention schedule with per-category timeframes",
      "HIPAA Business Associate Agreement before any PHI processing",
      "SOC 2 Type II report (Type I only is insufficient for enterprise onboarding)",
    ],
  },
  {
    category: "Suggested Improvements",
    icon: React.createElement(TrendingUp, { className: "w-4 h-4" }),
    accent: "border-amber-200 bg-amber-50/40",
    items: [
      "Request an updated sub-processor list with 30-day change notification commitment",
      "Obtain a fully executed DPA referencing GDPR Article 28 obligations",
      "Clarify cookie consent mechanisms and add granular retention periods to privacy policy",
      "Confirm EU data residency is contractually guaranteed for your tenant",
    ],
  },
  {
    category: "Risk Mitigation",
    icon: React.createElement(AlertTriangle, { className: "w-4 h-4" }),
    accent: "border-orange-200 bg-orange-50/40",
    items: [
      "Block onboarding until a current SOC 2 Type II report is received",
      "Verify Stripe, Intercom and Segment SCCs are in scope before data sharing",
      "Conduct annual vendor review with updated certification and policy checks",
    ],
  },
  {
    category: "Compliance Recommendations",
    icon: React.createElement(CheckCircle2, { className: "w-4 h-4" }),
    accent: "border-emerald-200 bg-emerald-50/40",
    items: [
      "Add this vendor to your data processing register (ROPA) with processing details",
      "Link the executed DPA to the vendor record in your contract management system",
      "Schedule a 12-month renewal review aligned with ISO 27001 certificate expiry",
    ],
  },
];

export const VENDOR_INFO = {
  name: "Acme Technologies Ltd.",
  industry: "Cloud Infrastructure",
  headquarters: "Amsterdam, Netherlands",
  dataRegions: "EU (AWS eu-central-1, eu-west-1)",
  primaryServices: "SaaS platform, API services, analytics",
} as const;

export const FEATURE_CARDS: FeatureCard[] = [
  { icon: Shield,     title: "Privacy Practices",       description: "Review privacy policies and data handling practices against GDPR and regional requirements." },
  { icon: Award,      title: "Security Certifications", description: "Identify SOC 2, ISO 27001 and other active certifications and their audit scope." },
  { icon: BadgeCheck, title: "Compliance Standards",    description: "Evaluate GDPR, CCPA, HIPAA and other privacy compliance posture." },
  { icon: MapPin,     title: "Data Residency",          description: "Detect where customer data is stored and processed across cloud regions." },
  { icon: Network,    title: "Sub-processors",          description: "Identify third-party processors, vendor dependencies and transfer mechanisms." },
  { icon: BarChart3,  title: "Vendor Risk",             description: "Assess overall onboarding risk, contractual gaps and compliance readiness." },
];

export const VENDOR_RISK_SCORE = 62;
export const PRIVACY_SCORE     = 71;
export const SECURITY_SCORE    = 78;

export const ACCEPTED_FILE_TYPES = ".pdf,.docx,.txt";
export const MAX_FILE_SIZE_LABEL = "Max 25 MB per file";

export const UPLOAD_BADGES = [
  { iconName: "Sparkles",   label: "AI Powered"         },
  { iconName: "Shield",     label: "Privacy Review"     },
  { iconName: "Lock",       label: "Security Assessment"},
  { iconName: "BadgeCheck", label: "Enterprise Ready"   },
] as const;
