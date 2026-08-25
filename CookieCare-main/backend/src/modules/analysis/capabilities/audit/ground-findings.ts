import type { AnalysisState } from "../../models/analysis-state.js";
import type { Finding } from "../../models/finding.js";
import type { AuditReport } from "../../models/audit-report.js";
import {
  isCoveredLike,
  type RequirementStatus,
} from "../../models/requirement-assessment.js";
import { getSpanFromState } from "../act/execute-act-plan.js";
import { aggregateRequirements } from "../act/aggregate-requirements.js";
import { normalizeWhitespaceLower } from "../../shared/text-normalize.js";

const ART28_3_REQ_RE = /^art28_3_/;

function quoteInSource(state: AnalysisState, finding: Finding): boolean {
  if (finding.evidence.length === 0) return finding.status !== "present";
  for (const evidence of finding.evidence) {
    const quote = normalizeWhitespaceLower(evidence.quotedText ?? "");
    if (!quote) continue;
    const span = getSpanFromState(state, evidence.locator);
    if (span && normalizeWhitespaceLower(span).includes(quote)) return true;
    const doc = state.workspace.documents.find((d) => d.docId === evidence.locator.docId);
    if (doc && normalizeWhitespaceLower(doc.fullText ?? "").includes(quote)) return true;
    const inClause = (doc?.clauses ?? []).some((clause) =>
      normalizeWhitespaceLower(clause.text).includes(quote)
    );
    if (inClause) return true;
  }
  return false;
}

function primaryQuote(finding: Finding): string {
  return normalizeWhitespaceLower(finding.evidence[0]?.quotedText ?? "");
}

/**
 * Deterministic grounding audit. Downgrades ungrounded claims in place.
 * Never schedules ACT redo.
 */
export function groundFindings(state: AnalysisState): AnalysisState {
  const report: AuditReport = {
    findingsChanged: [],
    assessmentsChanged: [],
    contradictions: [],
    notes: [],
  };
  const findings = (state.findings ?? []).map((finding) => ({ ...finding }));
  const seenArt28Quotes = new Map<string, string>();

  for (const finding of findings) {
    if (finding.visibility === "internal") continue;
    if (finding.status === "present" && !quoteInSource(state, finding)) {
      report.findingsChanged.push({
        findingId: finding.findingId,
        from: finding.status,
        to: "insufficient_evidence",
        reason: "quote_not_in_source",
      });
      finding.status = "insufficient_evidence";
      finding.gap = finding.gap ?? "Quoted evidence was not found in the source text.";
    }
    if (finding.matrixAddressing && !finding.matrixRowId) {
      report.findingsChanged.push({
        findingId: finding.findingId,
        from: finding.status,
        to: "insufficient_evidence",
        reason: "matrix_missing_row_id",
      });
      finding.status = "insufficient_evidence";
    }
    if (finding.requirementId && ART28_3_REQ_RE.test(finding.requirementId)) {
      const quote = primaryQuote(finding);
      if (quote) {
        const owner = seenArt28Quotes.get(quote);
        if (owner && owner !== finding.findingId) {
          report.findingsChanged.push({
            findingId: finding.findingId,
            from: finding.status,
            to: "insufficient_evidence",
            reason: "duplicate_art28_quote",
          });
          finding.status = "insufficient_evidence";
          finding.gap =
            finding.gap ??
            "This Article 28(3) row reused an identical quote already assigned to another lettered requirement.";
        } else {
          seenArt28Quotes.set(quote, finding.findingId);
        }
      }
    }
  }

  const aggregated = aggregateRequirements(
    { ...state, findings },
    { workUnitId: "wu-audit-ground", input: {}, tool: "aggregate_requirements", dependsOn: [], outputSchema: "Finding[]", status: "done" },
    findings
  );
  const assessments = (aggregated.state.requirementAssessments ?? []).map((assessment) => {
    const support = findings.filter(
      (f) =>
        assessment.supportingFindingIds.includes(f.findingId) && f.status === "present"
    );
    if (isCoveredLike(assessment.status) && support.length === 0) {
      report.assessmentsChanged.push({
        requirementId: assessment.requirementId,
        from: assessment.status,
        to: "cannot_determine",
        reason: "covered_without_support",
      });
      return { ...assessment, status: "cannot_determine" as RequirementStatus };
    }
    return assessment;
  });

  if (report.findingsChanged.length || report.assessmentsChanged.length) {
    report.notes.push(
      `Grounding audit downgraded ${report.findingsChanged.length} finding(s) and ${report.assessmentsChanged.length} assessment(s).`
    );
  }

  return {
    ...aggregated.state,
    findings,
    requirementAssessments: assessments,
    auditReport: report,
  };
}
