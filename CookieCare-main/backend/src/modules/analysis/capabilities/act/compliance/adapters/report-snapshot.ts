import type { AnalysisState } from "../../../../models/analysis-state.js";
import type { ComplianceCheckOutcome } from "../contracts/index.js";
import type { ComplianceReportSnapshot, ComplianceReportRow } from "../../../../models/compliance-report.js";
const labels = { present: "Present", partial: "Partial", gap: "Gap", cannot_determine: "Cannot determine", not_applicable: "Not applicable", conflicting: "Conflicting", judgment_required: "Judgment required", verification_incomplete: "Verification incomplete" } as const;
function evidencePointer(state: AnalysisState, documentId: string, nodeId: string, range: [
  number,
  number
]): string {
  const node = state.workspace.documents.find(d => d.docId === documentId)?.structureGraph?.nodes.find(n => n.nodeId === nodeId);
  return node?.displayLabel?.trim() || node?.title?.trim() || `Passage at characters ${range[0]}-${range[1]}`;
}
export function outcomesToSnapshot(state: AnalysisState, outcomes: ComplianceCheckOutcome[]): ComplianceReportSnapshot {
  const rows: ComplianceReportRow[] = outcomes.map(o => ({
    outcomeId: o.outcomeId, outcomeKind: o.kind, checkId: o.check.checkId,
    rowId: o.outcomeId, requirementId: o.check.ruleId, canonicalKey: o.check.ruleId, lockedAssessmentId: o.lockedAssessmentId,
    legalCitation: o.check.rule?.citation ?? "", title: o.check.rule?.title ?? o.check.ruleId,
    status: o.status, statusLabel: labels[o.status], ...o.explanation,
    supportedElementIds: (o.verification?.elements ?? (o.kind === "incomplete" ? o.validatedElements : undefined))?.filter(e => e.state === "supported").map(e => e.elementId) ?? [],
    missingElementIds: (o.verification?.elements ?? (o.kind === "incomplete" ? o.validatedElements : undefined))?.filter(e => !["supported", "not_applicable"].includes(e.state)).map(e => e.elementId) ?? [],
    evidence: o.evidence.map((c, i) => ({
      spanId: c.nodeId, quote: c.quote, structuralPath: c.path, charRange: c.range, documentId: c.documentId,
      citationId: o.check.checkId + ":e" + i, documentTitle: state.workspace.documents.find(d => d.docId === c.documentId)?.title ?? c.documentId,
      pointer: evidencePointer(state, c.documentId, c.nodeId, c.range), originalRole: c.originalRole, use: c.use, contribution: c.explanation
    })),
    ruleVersion: o.check.rule?.version ?? "unavailable", documentHash: o.check.documents.map(d => d.hash).join(":"),
    reviewedDocumentIds: o.check.documents.map(d => d.documentId), answers: o.verification?.answers ?? [],
  }));
  return {
    version: 2, outcomes, instruction: state.request.instruction, scope: "Reviewed scope: " + state.workspace.documents.filter(d => outcomes.some(o => o.check.documents.some(x => x.documentId === d.docId))).map(d => d.title ?? d.docId).join("; "),
    documents: state.workspace.documents.map(d => ({ documentId: d.docId, title: d.title ?? d.docId, contentHash: outcomes.flatMap(o => o.check.documents).find(x => x.documentId === d.docId)?.hash ?? "", role: d.role })),
    rows, outstandingChecks: (state.plan?.complianceRequirementResolution?.unresolved ?? []).map(f => ({ requirementId: f.facetId, title: f.sourceText, reason: f.reason, kind: "unmatched" as const })),
    limitations: outcomes.filter(o => o.kind === "incomplete" || ["cannot_determine", "judgment_required"].includes(o.status)).map((o, i) => ({ id: "L" + i, requirementIds: [o.check.ruleId], message: o.explanation.whatIsMissingOrUnclear }))
  };
}
