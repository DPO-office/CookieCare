import crypto from "crypto";
import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { Finding } from "../../models/finding.js";
import type { PlaybookPosition } from "../../models/rule-source.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getRuntimeTaxonomies } from "../../skills/runtime/catalog/registry.js";
import { insufficient, locateText } from "./act-utils.js";

/**
 * Extract normative playbook positions (requirements / preferences / prohibitions)
 * from a reference document — not bilateral contract clauses.
 */
export async function extractPlaybookPositions(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const playbookDocId = String(unit.input.docId ?? unit.input.playbookDocId ?? "");
  const doc = state.workspace.documents.find((d) => d.docId === playbookDocId);
  if (!doc) {
    return {
      state,
      findings: [
        ...findings,
        insufficient(unit, `Playbook document ${playbookDocId} not found`),
      ],
    };
  }

  if (doc.playbookPositions?.length) {
    const statusFinding: Finding = {
      findingId: `f_playbook_cached_${unit.workUnitId}`,
      kind: "extraction",
      category: "other_known_risk",
      status: "present",
      claim: `Reused ${doc.playbookPositions.length} cached playbook positions.`,
      evidence: [],
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
      visibility: "internal",
    };
    return { state, findings: [...findings, statusFinding] };
  }

  const runtime = getRuntimeTaxonomies();
  const clauseTypes = runtime.clauseTypes.filter((c) => c !== "other");
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        clauseType: { type: "string", enum: [...clauseTypes, "uncategorized"] },
        requirementText: { type: "string" },
        severityIfViolated: { type: "string", enum: ["low", "medium", "high"] },
        quoteFromPlaybook: { type: "string" },
      },
      required: ["clauseType", "requirementText", "severityIfViolated", "quoteFromPlaybook"],
    },
  };

  let raw: Array<{
    clauseType: string;
    requirementText: string;
    severityIfViolated: "low" | "medium" | "high";
    quoteFromPlaybook: string;
  }> = [];

  try {
    raw = await executeJsonCompletion(
      [
        "This document is an ORG PLAYBOOK / negotiation position paper — not a signed bilateral agreement.",
        "Extract normative POSITIONS: what the org requires, prefers, or prohibits.",
        "Map each position to the closest clauseType from the enum; use uncategorized if none fits.",
        "requirementText should state the position clearly (paraphrase OK).",
        "quoteFromPlaybook must be a VERBATIM excerpt supporting the position.",
        `Allowed clauseType values: ${clauseTypes.join(", ")}, uncategorized`,
        `Playbook text:\n${doc.fullText.slice(0, 80_000)}`,
      ].join("\n\n"),
      "You extract playbook positions. Never invent clause types outside the enum.",
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      tracker
    );
  } catch (err) {
    console.warn("[extractPlaybookPositions] LLM failed:", err);
    raw = heuristicPositions(doc.fullText);
  }

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
  }

  const positions: PlaybookPosition[] = raw.map((r, i) => {
    const located = locateText(
      doc.fullText,
      r.quoteFromPlaybook || r.requirementText,
      playbookDocId,
      `playbook-position-${i + 1}`,
      i
    );
    return {
      positionId: `pp_${crypto.randomUUID().slice(0, 8)}`,
      clauseType: r.clauseType || "uncategorized",
      requirementText: r.requirementText,
      severityIfViolated: r.severityIfViolated ?? "medium",
      sourceLocator: located.locator,
    };
  });

  const documents = state.workspace.documents.map((d) =>
    d.docId === playbookDocId
      ? { ...d, role: "reference" as const, playbookPositions: positions }
      : d
  );

  const statusFinding: Finding = {
    findingId: `f_playbook_extract_${unit.workUnitId}`,
    kind: "extraction",
    category: "other_known_risk",
    status: "present",
    claim: `Extracted ${positions.length} playbook positions from reference document.`,
    evidence: positions.slice(0, 3).map((p) => ({
      locator: p.sourceLocator,
      quotedText: p.requirementText.slice(0, 200),
      sourceRole: "reference" as const,
    })),
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
    visibility: "internal",
  };

  return {
    state: { ...state, workspace: { ...state.workspace, documents } },
    findings: [...findings, statusFinding],
  };
}

function heuristicPositions(fullText: string): Array<{
  clauseType: string;
  requirementText: string;
  severityIfViolated: "low" | "medium" | "high";
  quoteFromPlaybook: string;
}> {
  const out: ReturnType<typeof heuristicPositions> = [];
  const lines = fullText.split(/\n+/).filter((l) => /\b(must|shall|should|preferred|prohibit|require)\b/i.test(l));
  for (const line of lines.slice(0, 12)) {
    const trimmed = line.trim().slice(0, 500);
    if (trimmed.length < 20) continue;
    out.push({
      clauseType: "uncategorized",
      requirementText: trimmed,
      severityIfViolated: "medium",
      quoteFromPlaybook: trimmed.slice(0, 200),
    });
  }
  return out;
}
