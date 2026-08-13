import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { ClauseObject } from "../../models/clause-object.js";
import type { Finding } from "../../models/finding.js";
import { CLAUSE_TAXONOMY_VERSION } from "../../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getRuntimeTaxonomies } from "../../skills/registry.js";
import { insufficient, locateText } from "./act-utils.js";

async function extractClauses(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const docId = String(unit.input.docId ?? "");
  const instruction = String(unit.input.instruction ?? state.request.instruction ?? "");
  const clauseTypesInput = unit.input.clauseTypes as string[] | undefined;
  const runtime = getRuntimeTaxonomies();
  const clauseTypes = clauseTypesInput?.length
    ? clauseTypesInput.filter((c) => runtime.clauseTypes.includes(c))
    : runtime.clauseTypes.filter((c) => c !== "other");

  const doc = state.workspace.documents.find((d) => d.docId === docId);
  if (!doc) {
    return {
      state,
      findings: [...findings, insufficient(unit, `Document ${docId} not found for extraction`)],
    };
  }

  const skillContext = Object.values(state.skillMarkdown ?? {})
    .join("\n")
    .slice(0, 4000);

  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        clauseType: { type: "string", enum: [...clauseTypes, "other"] },
        structuralPath: { type: "string" },
        text: { type: "string" },
      },
      required: ["clauseType", "text"],
    },
  };

  let extracted: Array<{ clauseType: string; structuralPath?: string; text: string }> = [];

  try {
    extracted = await executeJsonCompletion(
      [
        "Extract legal clauses relevant to the user's analysis instruction.",
        `User instruction: ${instruction}`,
        `Focus clause types: ${clauseTypes.join(", ")}`,
        skillContext ? `Skill guidance (context only):\n${skillContext}` : "",
        `Allowed clauseType values: ${clauseTypes.join(", ")}, other`,
        "Return verbatim clause text spans.",
        `Document:\n${doc.fullText.slice(0, 80_000)}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      "You extract structured clauses. Never invent clause types outside the enum.",
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      tracker
    );
  } catch (err) {
    console.warn("[extractClauses] LLM failed; using segment heuristic:", err);
    extracted = heuristicExtract(doc, clauseTypes);
  }

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
    state.agent.extractionUnitsUsed += extracted.length;
  }

  const clauses: ClauseObject[] = extracted.map((e, i) => {
    const type = runtime.clauseTypes.includes(e.clauseType) ? e.clauseType : "other";
    const match = locateText(doc.fullText, e.text, docId, e.structuralPath, i);
    return {
      clauseId: `cl_${docId}_${i}_${type}`,
      clauseType: type,
      locator: match.locator,
      text: match.text,
      taxonomyVersion: CLAUSE_TAXONOMY_VERSION,
    };
  });

  const extractionFinding: Finding = {
    findingId: `f_extract_${unit.workUnitId}`,
    kind: "extraction",
    category: "other_known_risk",
    status: clauses.length > 0 ? "present" : "insufficient_evidence",
    claim:
      clauses.length > 0
        ? `Extracted ${clauses.length} clauses from document ${docId} (skill-scoped).`
        : `No clauses could be extracted from document ${docId}.`,
    evidence: clauses.slice(0, 3).map((c) => ({
      locator: c.locator,
      quotedText: c.text.slice(0, 500),
    })),
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
    visibility: "internal",
  };

  const documents = state.workspace.documents.map((d) =>
    d.docId === docId ? { ...d, clauses } : d
  );

  return {
    state: { ...state, workspace: { ...state.workspace, documents } },
    findings: [...findings, extractionFinding],
  };
}

function heuristicExtract(
  doc: {
    fullText: string;
    segments: { locator: { structuralPath: string }; text: string; kind: string }[];
  },
  clauseTypes: string[]
): Array<{ clauseType: string; structuralPath?: string; text: string }> {
  const patterns: Array<[RegExp, string]> = [
    [/\bindemnif/i, "indemnity"],
    [/\blimitation of liability\b/i, "limitation_of_liability"],
    [/\bterminat/i, "termination"],
    [/\bgoverning law\b/i, "governing_law"],
    [/\bconfidential/i, "confidentiality"],
    [/\bpersonal data\b|\bprocessing\b/i, "data_protection"],
    [/\bdata subject (request|right)/i, "data_subject_request_handling"],
    [/\bassist(ance|s)? the controller\b|\bprocessor shall assist\b/i, "processor_assistance_obligation"],
    [/\bdpia\b|\bdata protection impact|\bbreach notif/i, "security_dpia_assistance"],
    [/\bdelet(e|ion)|return.*personal data|upon termination/i, "deletion_on_termination"],
    [/\bsub-?processor\b|\bsubprocessor\b/i, "subprocessor_flow_down"],
    [/\bstandard contractual clause|\binternational transfer|\badequacy/i, "international_transfer_mechanism"],
    [/\bautomated decision|\bprofil(e|ing)\b/i, "automated_decision_disclosure"],
    [/\bpayment\b|\binvoice\b/i, "payment"],
    [/\bintellectual property\b|\bwork product\b/i, "intellectual_property"],
  ];

  const allowed = new Set(clauseTypes);
  const out: Array<{ clauseType: string; structuralPath?: string; text: string }> = [];

  for (const seg of doc.segments.filter((s) => s.kind === "clause" || s.kind === "paragraph")) {
    for (const [re, type] of patterns) {
      if (!allowed.has(type)) continue;
      if (re.test(seg.text) && !out.some((o) => o.clauseType === type)) {
        out.push({
          clauseType: type,
          structuralPath: seg.locator.structuralPath,
          text: seg.text,
        });
      }
    }
  }
  return out;
}

export { extractClauses };
