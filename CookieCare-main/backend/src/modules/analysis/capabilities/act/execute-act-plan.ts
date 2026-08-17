import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit, AnalysisToolName } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import { segmentDocument, resolveSpan } from "../../segmentation/segment-document.js";
import { topologicalBatches } from "../../utils/topo-batches.js";
import { classifyDocument } from "./classify-document.js";
import { extractClauses } from "./extract-clauses.js";
import { checkExpectedClauses } from "./check-expected-clauses.js";
import { flagRisk } from "./flag-risk.js";
import { checkAgainstRule } from "./check-against-rule.js";
import { renderOutput } from "./render-output.js";
import { evaluateMatrixRow } from "./evaluate-matrix-row.js";
import { webAssistedReference } from "./web-assisted-reference.js";
import { extractPlaybookPositions } from "./extract-playbook-positions.js";
import { insufficient } from "./act-utils.js";
import { pacLog, pacWarn } from "../../utils/pac-log.js";

const SILENT_SUCCESS_NOTES: Partial<Record<AnalysisToolName, string>> = {
  classify_document: "classification only, no finding by design",
  check_expected_clauses: "expected clause present, no gap to report",
  extract_playbook_positions: "no playbook positions extracted",
  get_span: "locator helper, no finding by design",
};

/**
 * Tools that only emit findings and never mutate shared workspace state, so
 * independent units in the same dependency batch can run concurrently.
 */
const PARALLEL_SAFE_TOOLS = new Set<AnalysisToolName>([
  "check_against_rule",
  "evaluate_matrix_row",
  "flag_risk",
  "check_expected_clauses",
]);

const ACT_CONCURRENCY = Math.max(
  1,
  Number(process.env.ANALYSIS_ACT_CONCURRENCY || 4)
);

async function runConcurrent<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * ACT orchestrator — executes skill-scoped work-unit graph in dependency batches.
 */
export async function executeActPlan(state: AnalysisState): Promise<AnalysisState> {
  const plan = state.plan;
  if (!plan) return state;

  const targeted = state.fixPlan?.targetedOnly === true;
  let units = plan.workUnits.map((u) => ({ ...u }));

  if (targeted && state.fixPlan?.items.length) {
    const fixByUnit = new Map(
      state.fixPlan.items.map((item) => [item.workUnitId, item])
    );
    units = units.map((u) => {
      const fix = fixByUnit.get(u.workUnitId);
      if (!fix?.previousAttemptFeedback) return u;
      return {
        ...u,
        input: {
          ...u.input,
          previousAttemptFeedback: fix.previousAttemptFeedback,
        },
      };
    });
    // A targeted retry can change the findings that the user should see.
    // Always regenerate the final output after the retried units complete.
    units = units.map((u) =>
      u.tool === "render_output" ? { ...u, status: "flagged" as const } : u
    );
  }

  const runnable = targeted
    ? units.filter((u) => u.status === "flagged" || u.status === "pending")
    : units.filter((u) => u.status !== "done" && u.status !== "failed");

  state = ensureSegmented(state);
  if (!targeted) {
    void state.onProgress?.(40, "Running document analysis…");
  }

  const batches = topologicalBatches(runnable, 4);
  let findings = [...state.findings];

  if (targeted) {
    const redoUnitIds = new Set(
      units
        .filter((unit) => unit.status === "flagged" && unit.tool !== "render_output")
        .map((unit) => unit.workUnitId)
    );
    if (redoUnitIds.size > 0) {
      findings = findings.filter(
        (finding) =>
          !finding.workUnitId ||
          !redoUnitIds.has(finding.workUnitId) ||
          finding.status === "not_covered"
      );
    }
  }

  pacLog("ACT graph", {
    mode: targeted ? "targeted-redo" : "full",
    runnable: runnable.length,
    batches: batches.length,
    total: units.length,
  });

  for (const batch of batches) {
    const parallel = batch.filter((u) => PARALLEL_SAFE_TOOLS.has(u.tool));
    const serial = batch.filter((u) => !PARALLEL_SAFE_TOOLS.has(u.tool));

    if (parallel.length > 1) {
      const base = findings;
      const baseIds = new Set(base.map((f) => f.findingId));
      const outcomes = await runConcurrent(parallel, ACT_CONCURRENCY, async (unit) => {
        const started = Date.now();
        pacLog(`ACT ▶ ${unit.tool}`, { id: unit.workUnitId });
        try {
          const result = await runTool(state, unit, base);
          const emitted = result.findings.filter((f) => !baseIds.has(f.findingId));
          pacLog(`ACT ✓ ${unit.tool}`, {
            id: unit.workUnitId,
            ms: Date.now() - started,
            findings: emitted.length,
            tokens: state.agent?.tokensUsed,
          });
          return { unit, emitted, failed: false as const };
        } catch (err) {
          pacWarn(`ACT ✗ ${unit.tool}`, {
            id: unit.workUnitId,
            ms: Date.now() - started,
            err: err instanceof Error ? err.message : String(err),
          });
          return {
            unit,
            emitted: [] as Finding[],
            failed: true as const,
            note: err instanceof Error ? err.message : String(err),
          };
        }
      });

      for (const outcome of outcomes) {
        findings = [...findings, ...outcome.emitted];
        units = units.map((u) =>
          u.workUnitId === outcome.unit.workUnitId
            ? outcome.failed
              ? {
                  ...u,
                  status: "failed" as const,
                  completionNote: outcome.note,
                }
              : {
                  ...u,
                  status: "done" as const,
                  findingsEmitted: outcome.emitted.length,
                  completionNote:
                    outcome.emitted.length === 0
                      ? SILENT_SUCCESS_NOTES[outcome.unit.tool] ??
                        "completed with no findings"
                      : u.completionNote,
                }
            : u
        );
      }
    } else {
      serial.push(...parallel);
    }

    for (const unit of serial) {
      const prior = findings;
      const started = Date.now();
      pacLog(`ACT ▶ ${unit.tool}`, { id: unit.workUnitId });
      try {
        const result = await runTool(state, unit, findings);
        state = result.state;
        findings = result.findings;
        const emitted = findings.length - prior.length;
        units = units.map((u) =>
          u.workUnitId === unit.workUnitId
            ? {
                ...u,
                status: "done" as const,
                findingsEmitted: emitted,
                completionNote:
                  emitted === 0
                    ? SILENT_SUCCESS_NOTES[unit.tool] ?? "completed with no findings"
                    : u.completionNote,
              }
            : u
        );
        pacLog(`ACT ✓ ${unit.tool}`, {
          id: unit.workUnitId,
          ms: Date.now() - started,
          findings: emitted,
          tokens: state.agent?.tokensUsed,
        });
      } catch (err) {
        pacWarn(`ACT ✗ ${unit.tool}`, {
          id: unit.workUnitId,
          ms: Date.now() - started,
          err: err instanceof Error ? err.message : String(err),
        });
        units = units.map((u) =>
          u.workUnitId === unit.workUnitId
            ? {
                ...u,
                status: "failed" as const,
                findingsEmitted: 0,
                completionNote: err instanceof Error ? err.message : String(err),
              }
            : u
        );
      }
    }
  }

  return {
    ...state,
    findings,
    plan: { ...plan, workUnits: units },
    fixPlan: null,
  };
}

function ensureSegmented(state: AnalysisState): AnalysisState {
  const roles = state.request.documentRoles ?? {};
  const docs = state.request.documentIds.map((docId) => {
    const existing = state.workspace.documents.find((d) => d.docId === docId);
    if (existing?.segments.length) {
      const role = roles[docId];
      if (role && existing.role !== role && existing.role !== "reference") {
        return {
          ...existing,
          role: role === "reference" ? ("reference" as const) : ("target" as const),
        };
      }
      return existing;
    }
    const text = state.request.documentTexts[docId] ?? existing?.fullText ?? "";
    const roleHint = roles[docId];
    return segmentDocument(docId, text, {
      title: state.request.documentTitles?.[docId],
      role:
        roleHint === "reference"
          ? "reference"
          : roleHint === "target"
            ? "target"
            : existing?.role && existing.role !== "unknown"
              ? existing.role
              : "primary",
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
    case "evaluate_matrix_row":
      return evaluateMatrixRow(state, unit, findings);
    case "extract_playbook_positions":
      return extractPlaybookPositions(state, unit, findings);
    case "web_assisted_reference":
      return webAssistedReference(state, unit, findings);
    case "render_output": {
      const next = await renderOutput(state, findings, unit);
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
