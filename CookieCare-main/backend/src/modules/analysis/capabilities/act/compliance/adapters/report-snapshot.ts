import type { AnalysisState } from "../../../../models/analysis-state.js";
import type { ComplianceCheckOutcome } from "../contracts/index.js";
import type { ComplianceReportSnapshot, ComplianceReportRow } from "../../../../models/compliance-report.js";
const labels = { present: "Present", partial: "Partial", gap: "Gap", cannot_determine: "Unresolved reference", not_applicable: "Not applicable", conflicting: "Conflicting", judgment_required: "Judgment required", verification_incomplete: "Verification incomplete" } as const;
const NAMED_LABEL = /^\s*(Section|Clause|Article|Paragraph|Schedule|Appendix|Annex(?:ure)?|Exhibit)\s+([A-Za-z0-9]+(?:[.\-][A-Za-z0-9]+)*(?:\([a-z0-9ivx]+\))*)/i;
const LEADING_NUMBER = /^\s*(\d+(?:\.\d+)*(?:\([a-z0-9ivx]+\))*)(?:[.)])?(?=\s|$)/;
const LEADING_SUBPART = /^\s*(\([a-z0-9ivx]+\))(?=\s|$)/i;
const CONTAINER_KINDS = new Set(["appendix", "section", "part", "article"]);
const CLAUSE_KINDS = new Set(["clause", "subclause", "paragraph", "list_item"]);
const titleCase = (word: string) => word[0].toUpperCase() + word.slice(1).toLowerCase();

/** A readable clause label taken from the number a node's own text opens with. */
function labelFromNodeText(text: string | undefined, kind: string | undefined): string | undefined {
  const t = (text ?? "").replace(/^#{1,6}\s+/, "");
  const named = NAMED_LABEL.exec(t);
  if (named) return `${titleCase(named[1])} ${named[2]}`;
  const num = LEADING_NUMBER.exec(t);
  if (num) return `${kind === "section" ? "Section" : "Clause"} ${num[1]}`;
  const sub = LEADING_SUBPART.exec(t);
  return sub ? sub[1] : undefined;
}

/** Last-resort label parsed from the structural path (e.g. "document.appendix_1.clause_2"). */
function labelFromStructuralPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  let container: string | undefined, clause: string | undefined;
  for (const seg of path.split(/[./]/)) {
    const m = /^(appendix|schedule|annex|section|part|article|clause|subclause|paragraph)_(.+)$/i.exec(seg);
    if (!m) continue;
    const kind = m[1].toLowerCase(), num = m[2].replace(/_/g, ".");
    if (["appendix", "schedule", "annex"].includes(kind)) container = `${titleCase(kind)} ${num}`;
    else if (["section", "part", "article"].includes(kind) && !container) container = `${titleCase(kind)} ${num}`;
    else if (["clause", "subclause", "paragraph"].includes(kind)) clause = `Clause ${num}`;
  }
  return [container, clause].filter(Boolean).join(" · ") || undefined;
}

/** A human clause pointer ("Clause 4.1", "Appendix 2 · Clause 1", "(a)") for a
 *  cited node, derived from the node and its ancestors — never a character offset. */
function evidencePointer(state: AnalysisState, documentId: string, nodeId: string, structuralPath: string): string {
  const graph = state.workspace.documents.find(d => d.docId === documentId)?.structureGraph;
  const byId = graph ? new Map(graph.nodes.map(n => [n.nodeId, n])) : undefined;
  const node = byId?.get(nodeId);
  const ownLabel = node?.displayLabel?.trim() || labelFromNodeText(node?.text, node?.kind);
  let clause = ownLabel || node?.title?.trim();
  let container: string | undefined;
  let numberedAncestor: string | undefined;
  const seen = new Set<string>([nodeId]);
  let cur = node && byId ? byId.get(node.parentId ?? "") : undefined;
  while (cur && byId && !seen.has(cur.nodeId)) {
    seen.add(cur.nodeId);
    const label = cur.displayLabel?.trim() || cur.title?.trim() || labelFromNodeText(cur.text, cur.kind);
    if (label) {
      if (!clause && CLAUSE_KINDS.has(cur.kind)) clause = label;
      if (!numberedAncestor && CLAUSE_KINDS.has(cur.kind) && /\d/.test(label)) numberedAncestor = label;
      if (!container && CONTAINER_KINDS.has(cur.kind) && NAMED_LABEL.test(label)) container = label;
    }
    cur = byId.get(cur.parentId ?? "");
  }
  if (clause && /^\d+(?:\.\d+)*(?:\([a-z0-9ivx]+\))*$/i.test(clause)) clause = `Clause ${clause}`;
  else if (clause && /^\([a-z0-9ivx]+\)$/i.test(clause) && numberedAncestor) {
    clause = `Clause ${numberedAncestor.replace(/^(?:Clause|Section|Article|Paragraph)\s+/i, "")}${clause}`;
  }
  return [container, clause].filter((value, index, values) => value && values.indexOf(value) === index).join(" · ") || labelFromStructuralPath(structuralPath) || "Cited provision";
}
export function outcomesToSnapshot(state: AnalysisState, outcomes: ComplianceCheckOutcome[]): ComplianceReportSnapshot {
  const questions = new Map<string, string>([
    ["user_request", state.request.instruction],
    ...(state.plan?.complianceRequirementResolution?.facets ?? []).map(f => [`facet:${f.facetId}`, f.sourceText] as const),
  ]);
  const rows: ComplianceReportRow[] = outcomes.map(o => ({
    outcomeId: o.outcomeId, outcomeKind: o.kind, checkId: o.check.checkId,
    rowId: o.outcomeId, requirementId: o.check.ruleId, canonicalKey: o.check.ruleId, lockedAssessmentId: o.lockedAssessmentId,
    legalCitation: o.check.rule?.citation ?? "", title: o.check.rule?.title ?? o.check.ruleId,
    requirementStandard: o.check.rule?.proposition,
    status: o.status, statusLabel: labels[o.status], ...o.explanation,
    supportedElementIds: (o.verification?.elements ?? (o.kind === "incomplete" ? o.validatedElements : undefined))?.filter(e => e.state === "supported").map(e => e.elementId) ?? [],
    missingElementIds: (o.verification?.elements ?? (o.kind === "incomplete" ? o.validatedElements : undefined))?.filter(e => !["supported", "not_applicable"].includes(e.state)).map(e => e.elementId) ?? [],
    evidence: o.evidence.map((c, i) => ({
      spanId: c.nodeId, quote: c.quote, structuralPath: c.path, charRange: c.range, documentId: c.documentId,
      citationId: o.check.checkId + ":e" + i, documentTitle: state.workspace.documents.find(d => d.docId === c.documentId)?.title ?? c.documentId,
      pointer: evidencePointer(state, c.documentId, c.nodeId, c.path), originalRole: c.originalRole, use: c.use, contribution: c.explanation
    })),
    ruleVersion: o.check.rule?.version ?? "unavailable", documentHash: o.check.documents.map(d => d.hash).join(":"),
    reviewedDocumentIds: o.check.documents.map(d => d.documentId),
    answers: (o.verification?.answers ?? []).map(answer => ({
      ...answer,
      question: questions.get(answer.questionId),
    })),
  }));
  return {
    version: 2, outcomes, instruction: state.request.instruction,
    presentationDepth: (state.analysisProfile?.thinkingMode ?? state.request.thinkingMode) === "deep" ? "deep" : "lite",
    scope: "Reviewed scope: " + state.workspace.documents.filter(d => outcomes.some(o => o.check.documents.some(x => x.documentId === d.docId))).map(d => d.title ?? d.docId).join("; "),
    documents: state.workspace.documents.map(d => ({ documentId: d.docId, title: d.title ?? d.docId, contentHash: outcomes.flatMap(o => o.check.documents).find(x => x.documentId === d.docId)?.hash ?? "", role: d.role })),
    rows, outstandingChecks: (state.plan?.complianceRequirementResolution?.unresolved ?? []).map(f => ({ requirementId: f.facetId, title: f.sourceText, reason: f.reason, kind: "unmatched" as const })),
    limitations: outcomes.filter(o => o.kind === "incomplete" || ["cannot_determine", "judgment_required"].includes(o.status)).map((o, i) => ({ id: "L" + i, requirementIds: [o.check.ruleId], message: o.explanation.whatIsMissingOrUnclear }))
  };
}
