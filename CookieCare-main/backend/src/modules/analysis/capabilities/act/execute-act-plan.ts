import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import { segmentDocument, resolveSpan } from "../../segmentation/segment-document.js";
import { topologicalBatches } from "../../utils/topo-batches.js";
import { classifyDocument } from "./classify-document.js";
import { extractClauses } from "./extract-clauses.js";
import { checkExpectedClauses } from "./check-expected-clauses.js";
import { flagRisk } from "./flag-risk.js";
import { checkAgainstRule } from "./check-against-rule.js";
import { renderOutput } from "./render-output.js";
import { insufficient } from "./act-utils.js";

/**
 * ACT orchestrator — executes skill-scoped work-unit graph in dependency batches.
 */
export async function executeActPlan(state: AnalysisState): Promise<AnalysisState> {
  if (!state.plan) return state;

  const targeted = state.fixPlan?.targetedOnly === true;
  let units = state.plan.workUnits.map((u) => ({ ...u }));
  const runnable = targeted
    ? units.filter((u) => u.status === "flagged" || u.status === "pending")
    : units.filter((u) => u.status !== "done");

  state = ensureSegmented(state);

  const batches = topologicalBatches(runnable, 4);
  let findings = [...state.findings];

  for (const batch of batches) {
    for (const unit of batch) {
      const result = await runTool(state, unit, findings);
      state = result.state;
      findings = result.findings;
      units = units.map((u) =>
        u.workUnitId === unit.workUnitId ? { ...u, status: "done" } : u
      );
    }
  }

  return {
    ...state,
    findings,
    plan: { ...state.plan, workUnits: units },
    fixPlan: null,
  };
}

function ensureSegmented(state: AnalysisState): AnalysisState {
  const docs = state.request.documentIds.map((docId) => {
    const existing = state.workspace.documents.find((d) => d.docId === docId);
    if (existing?.segments.length) return existing;
    const text = state.request.documentTexts[docId] ?? existing?.fullText ?? "";
    return segmentDocument(docId, text, {
      title: state.request.documentTitles?.[docId],
      role: "primary",
    });
  });
  return {
    ...state,
    workspace: { ...state.workspace, documents: docs },
    agent: state.agent ? { ...state.agent, docCount: docs.length } : state.agent,
  };
}

async function runTool(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  switch (unit.tool) {
    case "classify_document":
      return { state: await classifyDocument(state, unit), findings };
    case "extract_clauses":
      return extractClauses(state, unit, findings);
    case "check_expected_clauses":
      return checkExpectedClauses(state, unit, findings);
    case "flag_risk":
      return flagRisk(state, unit, findings);
    case "check_against_rule":
      return checkAgainstRule(state, unit, findings);
    case "render_output": {
      const next = renderOutput(state, findings, unit);
      return { state: next, findings: next.findings };
    }
    case "get_span":
      return { state, findings };
    case "request_clarification":
      return {
        state,
        findings: [
          ...findings,
          insufficient(unit, "request_clarification deferred to ASK phase"),
        ],
      };
    default:
      return {
        state,
        findings: [
          ...findings,
          insufficient(
            unit,
            `Tool "${unit.tool}" is not implemented in this release; work unit skipped with explicit status.`
          ),
        ],
      };
  }
}

/** Exported for critique verification. */
export function getSpanFromState(
  state: AnalysisState,
  locator: Finding["evidence"][0]["locator"]
): string | null {
  const doc = state.workspace.documents.find((d) => d.docId === locator.docId);
  if (!doc) return null;
  return resolveSpan(doc, locator);
}
