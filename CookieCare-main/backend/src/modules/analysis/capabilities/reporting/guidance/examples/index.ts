import type { ComplianceReportSnapshot } from "../../../../models/compliance-report.js";
import type { ReportingExample } from "../types.js";

export const COMPLIANCE_REPORTING_EXAMPLES: ReportingExample[] = [
  {
    id: "transfer-comparison",
    version: "1.0.0",
    signals: [/\btransfer|third countr|cross[- ]border\b/i, /\bSCCs?|standard contractual clauses?|BCRs?|binding corporate rules?|adequacy\b/i],
    annotation: `Composition example — transfer comparison: start with the available transfer position, then use a compact comparison whose columns reflect separately verified concepts such as mechanism, destination, legal basis, and supporting provision. Do not populate a destination from an SCC reference or from governing law. Put longer qualifications and missing supplementary measures below the table.`,
  },
  {
    id: "timing-and-assistance",
    version: "1.0.0",
    signals: [/\btimeframe|deadline|timing|without undue delay|within \d+|notice|notif/i, /\baccess|erasure|rectification|portability|data subject|assist/i],
    annotation: `Composition example — operational duties: use the overview to compare the duty and its status, with Timing only where the verified finding actually establishes timing. In prose, keep actor, required action, trigger, and period distinct; a prompt-notification duty is not a deadline for completing the underlying request. Explain gaps after describing the assistance that is present.`,
  },
  {
    id: "coverage-matrix",
    version: "1.0.0",
    signals: [/\brigorous|comprehensive|all mandatory|full review|audit\b/i, /\bsubject matter|duration|nature and purpose|categories|controller obligations?\b/i],
    annotation: `Composition example — broad requirement review: group related requirements into a small number of topical overview tables when that improves navigation. Keep Requirement and Status in every table; add Contract provision and Assessment or Gap or qualification according to the requested emphasis. Avoid repeating every table sentence in the detail section.`,
  },
  {
    id: "missing-dependency",
    version: "1.0.0",
    signals: [/\bannex|appendix|schedule|incorporat|referenced material|missing document\b/i],
    annotation: `Composition example — missing dependency: state what the reviewed agreement says, identify the incorporated material that was unavailable, and qualify the affected conclusion nearby. Do not convert unavailable material into a contract gap, and consolidate the supported next step instead of repeating it in unrelated prose.`,
  },
];

function reportingSignals(instruction: string, snapshot?: ComplianceReportSnapshot): string {
  return [instruction, snapshot?.scope ?? "", ...(snapshot?.rows ?? []).flatMap(row => [
    row.title, row.legalCitation, row.whatTheDocumentProvides, row.whatIsMissingOrUnclear,
    ...(row.answers ?? []).flatMap(answer => [answer.question ?? "", answer.answer]),
  ])].join("\n");
}

/** Examples influence composition only. They never select findings or alter rendering. */
export function selectComplianceReportingExamples(
  instruction: string,
  snapshot?: ComplianceReportSnapshot,
  maximum = 2,
): ReportingExample[] {
  const signals = reportingSignals(instruction, snapshot);
  return COMPLIANCE_REPORTING_EXAMPLES
    .map((example, order) => ({ example, order, score: example.signals.filter(pattern => pattern.test(signals)).length }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, maximum)
    .map(item => item.example);
}

