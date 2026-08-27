import type { AnalysisState } from "../../models/analysis-state.js";
import type { Finding } from "../../models/finding.js";
import type { AuditReport } from "../../models/audit-report.js";
import {
  isCoveredLike,
  withRecommendationKind,
  type RequirementStatus,
} from "../../models/requirement-assessment.js";
import { getSpanFromState } from "../act/execute-act-plan.js";
import { aggregateRequirements } from "../act/aggregate-requirements.js";
import { normalizeWhitespaceLower } from "../../shared/text-normalize.js";
import { subprovisionKeyFromId } from "../../shared/article-linkage.js";

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

function siblingKey(finding: Finding): string | undefined {
  const fromReq = finding.requirementId
    ? subprovisionKeyFromId(finding.requirementId)
    : undefined;
  if (fromReq) return parentKey(fromReq);
  const fromRule = finding.ruleId ? subprovisionKeyFromId(finding.ruleId) : undefined;
  return fromRule ? parentKey(fromRule) : undefined;
}

function parentKey(subprovision: string): string {
  const parts = subprovision.split(".");
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return subprovision;
}

function letteredSibling(finding: Finding): string | undefined {
  return (
    (finding.requirementId
      ? subprovisionKeyFromId(finding.requirementId)
      : undefined) ||
    (finding.ruleId ? subprovisionKeyFromId(finding.ruleId) : undefined)
  );
}

function downgradeInsufficient(finding: Finding, gap: string): void {
  finding.status = "insufficient_evidence";
  finding.gap = finding.gap ?? gap;
  if (finding.judgement) {
    finding.judgement = withRecommendationKind({
      ...finding.judgement,
      compliance: "insufficient_evidence",
      evidenceConfidence: "low",
    });
  }
}

/**
 * Deterministic grounding audit. Downgrades ungrounded claims in place.
 * Never schedules ACT redo and never rewrites the memo.
 */
export function groundFindings(state: AnalysisState): AnalysisState {
  const report: AuditReport = {
    findingsChanged: [],
    assessmentsChanged: [],
    contradictions: [],
    notes: [],
  };
  const findings = (state.findings ?? []).map((finding) => ({
    ...finding,
    judgement: finding.judgement ? { ...finding.judgement } : undefined,
  }));
  const seenSiblingQuotes = new Map<string, string>();

  for (const finding of findings) {
    if (finding.visibility === "internal") continue;
    if (finding.status === "present" && !quoteInSource(state, finding)) {
      report.findingsChanged.push({
        findingId: finding.findingId,
        from: finding.status,
        to: "insufficient_evidence",
        reason: "quote_not_in_source",
      });
      downgradeInsufficient(
        finding,
        "Quoted evidence was not found in the source text."
      );
    }
    if (finding.matrixAddressing && !finding.matrixRowId) {
      report.findingsChanged.push({
        findingId: finding.findingId,
        from: finding.status,
        to: "insufficient_evidence",
        reason: "matrix_missing_row_id",
      });
      downgradeInsufficient(finding, "Matrix addressing lacked a row id.");
    }
    const letter = letteredSibling(finding);
    const family = siblingKey(finding);
    const quote = primaryQuote(finding);
    if (letter && family && quote) {
      const key = `${family}::${quote}`;
      const owner = seenSiblingQuotes.get(key);
      if (owner && owner !== finding.findingId) {
        report.findingsChanged.push({
          findingId: finding.findingId,
          from: finding.status,
          to: "insufficient_evidence",
          reason: "duplicate_sibling_quote",
        });
        downgradeInsufficient(
          finding,
          "This requirement reused an identical quote already assigned to a sibling requirement."
        );
      } else {
        seenSiblingQuotes.set(key, finding.findingId);
      }
    }
    if (
      finding.judgement &&
      (finding.judgement.compliance === "insufficient_evidence" ||
        finding.judgement.evidenceState === "truncated" ||
        finding.judgement.evidenceState === "unavailable" ||
        finding.judgement.evidenceState === "incorporated") &&
      finding.judgement.recommendationKind === "amend"
    ) {
      report.findingsChanged.push({
        findingId: finding.findingId,
        from: finding.status,
        to: finding.status,
        reason: "amend_from_incomplete_evidence",
      });
      const { recommendationKind: _ignored, ...axes } = finding.judgement;
      finding.judgement = withRecommendationKind(axes);
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
      return {
        ...assessment,
        status: "cannot_determine" as RequirementStatus,
        judgement: assessment.judgement
          ? withRecommendationKind({
              ...assessment.judgement,
              compliance: "insufficient_evidence",
              evidenceConfidence: "low",
            })
          : assessment.judgement,
        recommendation:
          "Obtain or confirm the referenced materials or unread remainder of the clause. Do not amend the agreement from incomplete evidence.",
      };
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
