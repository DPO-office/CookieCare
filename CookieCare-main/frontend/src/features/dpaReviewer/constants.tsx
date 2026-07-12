import React from "react";
import {
  ShieldCheck, ClipboardList, Users, Lock, Globe, Scale,
  XCircle, ChevronUp, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { AnalysisStep, Finding, Recommendation } from "./types";

export const ANALYSIS_STEPS: AnalysisStep[] = [
  { id: "structure",       label: "Reading document structure",               status: "pending" },
  { id: "parties",         label: "Identifying controller and processor",     status: "pending" },
  { id: "article28",       label: "Checking GDPR Article 28 compliance",      status: "pending" },
  { id: "obligations",     label: "Detecting processor obligations",          status: "pending" },
  { id: "security",        label: "Reviewing security measures",              status: "pending" },
  { id: "transfers",       label: "Checking international transfer clauses",  status: "pending" },
  { id: "missing",         label: "Detecting missing contractual clauses",    status: "pending" },
  { id: "risk",            label: "Performing risk assessment",               status: "pending" },
  { id: "recommendations", label: "Generating AI recommendations",            status: "pending" },
  { id: "report",          label: "Finalizing compliance report",             status: "pending" },
];

export const MOCK_FINDINGS: Finding[] = [
  { id: "f1", clause: "Article 28 Compliance", status: "compliant", article: "Art. 28 GDPR", description: "The DPA correctly establishes the processor relationship and includes the required subject-matter, duration, nature and purpose of the processing.", recommendation: "No action required. Consider adding an explicit reference to the supervisory authority for added clarity." },
  { id: "f2", clause: "Processor Obligations", status: "warning", article: "Art. 28(3)(a)", description: "Processor obligations are partially defined. The clause on sub-processor authorisation is present but lacks a mechanism for prior written consent before engaging new sub-processors.", recommendation: "Add a provision requiring the processor to obtain specific prior written consent from the controller before appointing any new sub-processor, with a notification window of at least 30 days." },
  { id: "f3", clause: "Data Subject Rights", status: "compliant", article: "Art. 28(3)(e)", description: "The agreement includes obligations for the processor to assist the controller in responding to data subject requests.", recommendation: "Specify a response timeframe (e.g. within 5 business days) to avoid ambiguity." },
  { id: "f4", clause: "Security Measures (Article 32)", status: "warning", article: "Art. 32 GDPR", description: "Security measures are referenced but described at a high level only. The agreement does not specify technical and organisational measures in sufficient detail.", recommendation: "Attach a dedicated Annex listing specific TOMs (encryption standards, access controls, pseudonymisation, backup procedures, penetration testing frequency)." },
  { id: "f5", clause: "International Data Transfers", status: "missing", article: "Art. 44–49 GDPR", description: "No provisions for international data transfers have been identified. If processing occurs outside the EEA, this is a critical compliance gap.", recommendation: "Add a clause specifying the legal basis for any transfers outside the EEA, referencing Standard Contractual Clauses (SCCs), Binding Corporate Rules, or an adequacy decision as applicable." },
  { id: "f6", clause: "Data Breach Notification", status: "compliant", article: "Art. 33 GDPR", description: "The agreement includes a breach notification obligation requiring the processor to notify the controller without undue delay.", recommendation: "Strengthen by specifying the maximum notification period (e.g. 24 hours) and the required content of breach notifications." },
  { id: "f7", clause: "Audit Rights", status: "warning", article: "Art. 28(3)(h)", description: "The audit rights clause allows the controller to conduct audits but does not specify notice periods, audit scope, or cost allocation.", recommendation: "Define audit notice requirements (minimum 30 days), permitted audit scope, frequency limits, and whether the controller or processor bears audit costs." },
  { id: "f8", clause: "Data Deletion & Return", status: "missing", article: "Art. 28(3)(g)", description: "No clause addresses the deletion or return of personal data upon termination of the agreement.", recommendation: "Add a clause requiring the processor to return all personal data to the controller or delete it upon request, within a specified timeframe (e.g. 30 days), and provide written confirmation." },
];

export const MOCK_RECOMMENDATIONS: Recommendation[] = [
  { category: "International Transfer Clauses",  icon: <Globe className="w-4 h-4" />,         accent: "border-red-200 bg-red-50/40",      items: ["Add a clause specifying the legal basis for any transfers outside the EEA", "Reference Standard Contractual Clauses (SCCs), Binding Corporate Rules, or an adequacy decision as applicable", "Document all third-country recipients and the transfer mechanism used for each"] },
  { category: "Data Deletion & Return",          icon: <XCircle className="w-4 h-4" />,        accent: "border-amber-200 bg-amber-50/40",  items: ["Add a clause requiring the processor to return or delete personal data upon termination", "Specify a deletion timeframe (e.g. 30 days) and require written confirmation", "Clarify whether backup copies are included in the deletion obligation"] },
  { category: "Security Measures",               icon: <Lock className="w-4 h-4" />,           accent: "border-orange-200 bg-orange-50/40",items: ["Attach a dedicated Annex listing specific technical and organisational measures (TOMs)", "Specify encryption standards, access controls, pseudonymisation and backup procedures", "Define penetration testing frequency and vulnerability management obligations"] },
  { category: "Sub-Processor Controls",          icon: <Users className="w-4 h-4" />,          accent: "border-blue-200 bg-blue-50/40",    items: ["Require specific prior written consent from the controller before appointing new sub-processors", "Include a notification window of at least 30 days for sub-processor changes", "Mandate that sub-processors are bound by the same data protection obligations as the processor"] },
  { category: "Audit Rights",                    icon: <ClipboardList className="w-4 h-4" />,  accent: "border-emerald-200 bg-emerald-50/40",items: ["Define audit notice requirements (minimum 30 days) and permitted audit scope", "Specify frequency limits and cost allocation for audits", "Allow for third-party auditor certifications as an alternative to on-site audits"] },
];

export const FEATURE_CARDS = [
  { icon: ShieldCheck,   title: "GDPR Compliance",         description: "Verify alignment with GDPR Article 28 requirements and all mandatory DPA provisions." },
  { icon: ClipboardList, title: "Processor Obligations",   description: "Identify and validate all processor obligations including sub-processor controls." },
  { icon: Users,         title: "Data Subject Rights",     description: "Confirm the agreement covers data subject request handling and response timelines." },
  { icon: Lock,          title: "Security Measures",       description: "Assess Article 32 TOMs and technical safeguards against regulatory standards." },
  { icon: Globe,         title: "International Transfers", description: "Detect cross-border transfer provisions and validate legal transfer mechanisms." },
  { icon: Scale,         title: "Risk Assessment",         description: "Identify missing clauses, contractual risks, and critical compliance gaps." },
];
