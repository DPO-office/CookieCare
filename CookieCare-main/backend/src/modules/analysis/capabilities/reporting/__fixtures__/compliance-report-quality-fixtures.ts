import type {
  CompliancePresentationPlan,
  ComplianceReportRow,
  ComplianceReportSnapshot,
  ComplianceTableColumn,
} from "../../../models/compliance-report.js";
import { defaultCompliancePresentationPlan } from "../compliance-presentation.js";

const STATUS_LABELS: Record<ComplianceReportRow["status"], ComplianceReportRow["statusLabel"]> = {
  present: "Present", partial: "Partial", gap: "Gap", cannot_determine: "Unresolved reference",
  not_applicable: "Not applicable", conflicting: "Conflicting", judgment_required: "Judgment required",
  verification_incomplete: "Verification incomplete",
};

function row(index: number, title: string, status: ComplianceReportRow["status"], provides: string, missing: string): ComplianceReportRow {
  return {
    rowId: `saved-row-${index}`, requirementId: `saved-requirement-${index}`, canonicalKey: `saved.requirement.${index}`,
    lockedAssessmentId: `saved-lock-${index}`, legalCitation: "Applicable reviewed requirement", title, status,
    statusLabel: STATUS_LABELS[status], recommendedAction: status === "present" ? "No action indicated within the reviewed scope." : `Clarify or amend the terms addressing ${title.toLowerCase()}.`,
    supportedElementIds: [], missingElementIds: status === "present" ? [] : [`missing-${index}`],
    evidence: status === "gap" ? [] : [{
      citationId: `E${index}`, documentId: "saved-document", documentTitle: "Saved agreement", pointer: `Clause ${index}`,
      spanId: `saved-span-${index}`, structuralPath: `document.clause_${index}`, charRange: [index * 100, index * 100 + 60],
      quote: `The parties agree the verified provision for ${title.toLowerCase()} applies.`, use: "proof",
    }],
    whatTheDocumentProvides: provides, whatIsMissingOrUnclear: missing,
    whyItMatters: `This determines the contractual treatment of ${title.toLowerCase()}.`,
    conclusion: status === "present" ? "The reviewed material supports the requirement." : "The reviewed position remains qualified.",
    ruleVersion: "saved-v1", documentHash: "saved-document-hash",
  };
}

const PRIMARY_REQUESTS = {
  rights: "Review how this agreement addresses data subject rights under GDPR Articles 15-22. Identify: obligations to assist the controller with access, erasure, rectification, and portability requests, defined response timeframes, and any gaps that could result in a GDPR violation.",
  article28: "Perform a rigorous GDPR Article 28 compliance review of this Data Processing Agreement. Verify: subject matter, duration, nature and purpose of processing, categories of data and data subjects, obligations and rights of the controller, and whether all mandatory Article 28(3) clauses are present and adequate.",
  transfers: "Analyse all international data transfer provisions. Identify: whether Standard Contractual Clauses, Binding Corporate Rules, or adequacy decisions are referenced, whether Schrems II supplementary measures are addressed, transfers to third countries and the legal basis for each, and any gaps in transfer mechanisms.",
} as const;

function snapshot(instruction: string, rows: ComplianceReportRow[]): ComplianceReportSnapshot {
  return {
    version: 2, instruction, scope: "The saved agreement and the requirements selected by the request",
    documents: [{ documentId: "saved-document", title: "Saved agreement", contentHash: "saved-document-hash" }],
    rows, outstandingChecks: [], limitations: [],
  };
}

function groupedPlan(
  value: ComplianceReportSnapshot,
  groups: Array<{ heading: string; indexes: number[]; columns: ComplianceTableColumn[] }>,
): CompliancePresentationPlan {
  const plan = defaultCompliancePresentationPlan(value, "layered");
  const overviewIndex = plan.sections.findIndex(section => section.kind === "overview");
  plan.sections.splice(overviewIndex, 1, ...groups.map(group => ({
    id: "S1", requestItemIds: [], questionIds: [],
    kind: "overview" as const, heading: group.heading,
    findingIds: group.indexes.map(index => value.rows[index].lockedAssessmentId!),
    columns: group.columns, detailWords: 60,
  })));
  plan.sections.forEach((section, index) => { section.id = `S${index + 1}`; });
  plan.rationale = "Saved request-specific quality fixture.";
  return plan;
}

export interface ComplianceReportQualityFixture {
  id: string;
  synthetic: true;
  heldOut: boolean;
  snapshot: ComplianceReportSnapshot;
  baselinePlan: CompliancePresentationPlan;
  adaptivePlan: CompliancePresentationPlan;
}

function buildFixtures(): ComplianceReportQualityFixture[] {
  const rights = snapshot(PRIMARY_REQUESTS.rights, [
    row(1, "Assistance with access, erasure, rectification and portability requests", "partial", "The processor promises reasonable assistance with data-subject requests.", "The assistance language does not separately address every requested right."),
    row(2, "Response timeframe for assistance", "gap", "No contractual response period was identified.", "The reviewed terms do not state a response timeframe."),
  ]);
  rights.rows[1].answers = [{ questionId: "facet:timing", question: "What response timeframe applies?", answer: "No response period is specified.", elementIds: [], evidenceIds: [] }];

  const article28 = snapshot(PRIMARY_REQUESTS.article28, [
    row(3, "Subject matter, duration, nature and purpose of processing", "present", "The processing schedule describes these core particulars.", "No material qualification was identified."),
    row(4, "Categories of data and data subjects", "partial", "The schedule identifies general categories.", "Some categories remain dependent on customer configuration."),
    row(5, "Controller instructions and confidentiality duties", "present", "The processor is limited to documented instructions and confidentiality commitments.", "No material qualification was identified."),
    row(6, "Security and audit obligations", "partial", "Security and audit duties are stated.", "The referenced security schedule was not supplied for review."),
  ]);

  const transfers = snapshot(PRIMARY_REQUESTS.transfers, [
    row(7, "Standard Contractual Clauses transfer mechanism", "present", "The agreement incorporates the Standard Contractual Clauses as a transfer mechanism.", "The applicable module depends on the parties' roles."),
    row(8, "Third-country destination", "cannot_determine", "The reviewed terms permit international transfers.", "No destination country is identified in the reviewed material."),
    row(9, "Legal basis for each transfer", "partial", "The terms refer to contractual transfer safeguards.", "A legal basis is not mapped to each destination."),
    row(10, "Supplementary transfer measures", "gap", "No separately described supplementary measures were identified.", "The reviewed terms do not state supplementary measures."),
  ]);
  transfers.rows[0].answers = [{ questionId: "facet:mechanism", question: "Which transfer mechanism applies?", answer: "The Standard Contractual Clauses are referenced.", elementIds: [], evidenceIds: [] }];
  transfers.rows[1].answers = [{ questionId: "facet:destination", question: "Which third-country destination is identified?", answer: "No destination country is identified.", elementIds: [], evidenceIds: [] }];
  transfers.rows[2].answers = [{ questionId: "facet:basis", question: "What legal basis applies to each transfer?", answer: "A basis is not mapped to each destination.", elementIds: [], evidenceIds: [] }];

  const dependency = snapshot("Review the security obligation and identify any missing schedules or incorporated material.", [
    row(11, "Security measures in the incorporated schedule", "cannot_determine", "The agreement incorporates a security schedule.", "The incorporated schedule was not supplied."),
  ]);

  const fixtures: Array<[string, ComplianceReportSnapshot, Array<{ heading: string; indexes: number[]; columns: ComplianceTableColumn[] }>]> = [
    ["rights", rights, [{ heading: "Rights assistance and timing", indexes: [0, 1], columns: ["Requirement", "Status", "Assessment", "Contract provision", "Recommended action", "Timing"] }]],
    ["article28", article28, [
      { heading: "Processing description", indexes: [0, 1], columns: ["Requirement", "Status", "Assessment", "Contract provision", "Recommended action"] },
      { heading: "Operational duties", indexes: [2, 3], columns: ["Requirement", "Status", "Assessment", "Contract provision", "Recommended action"] },
    ]],
    ["transfers", transfers, [
      { heading: "Transfer mechanism", indexes: [0], columns: ["Requirement", "Status", "Assessment", "Contract provision", "Recommended action", "Transfer mechanism"] },
      { heading: "Transfer destination", indexes: [1], columns: ["Requirement", "Status", "Assessment", "Contract provision", "Recommended action", "Destination"] },
      { heading: "Transfer basis", indexes: [2], columns: ["Requirement", "Status", "Assessment", "Contract provision", "Recommended action", "Legal basis"] },
      { heading: "Supplementary measures", indexes: [3], columns: ["Requirement", "Status", "Assessment", "Contract provision", "Recommended action"] },
    ]],
    ["missing-dependency", dependency, [{ heading: "Security dependency", indexes: [0], columns: ["Requirement", "Status", "Assessment", "Contract provision", "Recommended action"] }]],
  ];
  return fixtures.map(([id, value, groups]) => ({
    id, synthetic: true as const, heldOut: id === "missing-dependency",
    snapshot: value, baselinePlan: defaultCompliancePresentationPlan(value, "layered"), adaptivePlan: groupedPlan(value, groups),
  }));
}

export const COMPLIANCE_REPORT_QUALITY_FIXTURES = buildFixtures();
