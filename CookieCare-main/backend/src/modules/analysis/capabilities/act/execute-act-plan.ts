import crypto from "crypto";
import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { ClauseObject } from "../../models/clause-object.js";
import type { Finding } from "../../models/finding.js";
import type { EvidenceSpan } from "../../models/locator.js";
import {
  CLAUSE_TAXONOMY,
  CLAUSE_TAXONOMY_VERSION,
  isClauseTaxonomyId,
} from "../../taxonomies/clause-taxonomy.js";
import {
  RISK_TAXONOMY,
  RISK_TAXONOMY_VERSION,
  isRiskTaxonomyId,
} from "../../taxonomies/index.js";
import { segmentDocument, resolveSpan } from "../../segmentation/segment-document.js";
import { topologicalBatches } from "../../utils/topo-batches.js";

/**
 * ACT — execute work-unit graph in dependency batches.
 * Wired: classify_document, extract_clauses, flag_risk, get_span, render_output.
 * Other tools → insufficient_evidence Finding (no silent skip).
 */
export async function executeActPlan(state: AnalysisState): Promise<AnalysisState> {
  if (!state.plan) return state;

  const targeted = state.fixPlan?.targetedOnly === true;
  let units = state.plan.workUnits.map((u) => ({ ...u }));
  const runnable = targeted
    ? units.filter((u) => u.status === "flagged" || u.status === "pending")
    : units.filter((u) => u.status !== "done");

  // Ensure documents are segmented once before LLM work
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
    agent: state.agent
      ? { ...state.agent, docCount: docs.length }
      : state.agent,
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
    case "flag_risk":
      return flagRisk(state, unit, findings);
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

async function classifyDocument(
  state: AnalysisState,
  unit: AnalysisWorkUnit
): Promise<AnalysisState> {
  const docId = String(unit.input.docId ?? "");
  const doc = state.workspace.documents.find((d) => d.docId === docId);
  if (!doc) return state;

  // Deterministic hint from drafting pack aliases + keyword heuristics
  const sample = doc.fullText.slice(0, 4000).toLowerCase();
  let docType = "unknown";
  if (/\bdata processing agreement\b|\bdpa\b|\bprocessor\b/.test(sample)) docType = "dpa";
  else if (/\bnon-?disclosure\b|\bnda\b|\bconfidential information\b/.test(sample))
    docType = "nda";
  else if (/\bmaster service(s)? agreement\b|\bmsa\b/.test(sample)) docType = "msa";
  else if (/\bservice level agreement\b|\bsla\b/.test(sample)) docType = "sla";
  else if (/\bagreement\b|\bcontract\b/.test(sample)) docType = "service-agreement";

  const documents = state.workspace.documents.map((d) =>
    d.docId === docId ? { ...d, docType, role: "primary" as const } : d
  );
  return { ...state, workspace: { ...state.workspace, documents } };
}

async function extractClauses(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const docId = String(unit.input.docId ?? "");
  const doc = state.workspace.documents.find((d) => d.docId === docId);
  if (!doc) {
    return {
      state,
      findings: [
        ...findings,
        insufficient(unit, `Document ${docId} not found for extraction`),
      ],
    };
  }

  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const clauseTypes = CLAUSE_TAXONOMY.filter((c) => c !== "other");

  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        clauseType: { type: "string", enum: [...clauseTypes, "other"] },
        structuralPath: { type: "string" },
        text: { type: "string" },
        startHint: { type: "string" },
      },
      required: ["clauseType", "text"],
    },
  };

  let extracted: Array<{
    clauseType: string;
    structuralPath?: string;
    text: string;
    startHint?: string;
  }> = [];

  try {
    extracted = await executeJsonCompletion(
      [
        "Extract major legal clauses from this document.",
        `Allowed clauseType values: ${clauseTypes.join(", ")}, other`,
        "Return verbatim clause text spans. Prefer numbered clause paths when present.",
        `Document:\n${doc.fullText.slice(0, 80_000)}`,
      ].join("\n\n"),
      "You extract structured clauses. Never invent clause types outside the enum.",
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      tracker
    );
  } catch (err) {
    console.warn("[extractClauses] LLM failed; using segment heuristic:", err);
    extracted = heuristicExtract(doc);
  }

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
    state.agent.extractionUnitsUsed += extracted.length;
  }

  const clauses: ClauseObject[] = extracted.map((e, i) => {
    const type = isClauseTaxonomyId(e.clauseType) ? e.clauseType : "other";
    const match = locateText(doc.fullText, e.text, docId, e.structuralPath, i);
    return {
      clauseId: `cl_${docId}_${i}_${type}`,
      clauseType: type,
      locator: match.locator,
      text: match.text,
      taxonomyVersion: CLAUSE_TAXONOMY_VERSION,
    };
  });

  // Absent expected critical clause types → explicit finding later in flag_risk;
  // still record extraction Finding for completeness of this work unit
  const extractionFinding: Finding = {
    findingId: `f_extract_${unit.workUnitId}`,
    kind: "extraction",
    category: "other_known_risk",
    status: clauses.length > 0 ? "present" : "insufficient_evidence",
    claim:
      clauses.length > 0
        ? `Extracted ${clauses.length} clauses from document ${docId}.`
        : `No clauses could be extracted from document ${docId}.`,
    evidence: clauses.slice(0, 3).map((c) => ({
      locator: c.locator,
      quotedText: c.text.slice(0, 500),
    })),
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
  };

  const documents = state.workspace.documents.map((d) =>
    d.docId === docId ? { ...d, clauses } : d
  );

  return {
    state: { ...state, workspace: { ...state.workspace, documents } },
    findings: [...findings, extractionFinding],
  };
}

async function flagRisk(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const docId = String(unit.input.docId ?? "");
  const doc = state.workspace.documents.find((d) => d.docId === docId);
  const clauses = doc?.clauses ?? [];

  if (!doc) {
    return {
      state,
      findings: [...findings, insufficient(unit, `Document ${docId} missing for risk flag`)],
    };
  }

  const expectedTypes = [
    "limitation_of_liability",
    "indemnity",
    "termination",
    "governing_law",
  ] as const;

  const absentFindings: Finding[] = [];
  for (const t of expectedTypes) {
    if (!clauses.some((c) => c.clauseType === t)) {
      absentFindings.push({
        findingId: `f_absent_${t}_${unit.workUnitId}`,
        kind: "risk",
        category:
          t === "limitation_of_liability"
            ? "missing_limitation_of_liability"
            : t === "indemnity"
              ? "missing_indemnity"
              : "other_known_risk",
        status: "absent_expected",
        claim: `Expected clause type "${t}" was not found in the document.`,
        evidence: [],
        severity: t === "limitation_of_liability" || t === "indemnity" ? "high" : "medium",
        taxonomyVersion: RISK_TAXONOMY_VERSION,
        workUnitId: unit.workUnitId,
      });
    }
  }

  if (clauses.length === 0) {
    return {
      state,
      findings: [
        ...findings,
        ...absentFindings,
        {
          findingId: `f_risk_empty_${unit.workUnitId}`,
          kind: "risk",
          category: "other_known_risk",
          status: "insufficient_evidence",
          claim: "Cannot flag clause-level risks because no clauses were extracted.",
          evidence: [],
          taxonomyVersion: RISK_TAXONOMY_VERSION,
          workUnitId: unit.workUnitId,
        },
      ],
    };
  }

  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;
  const riskIds = RISK_TAXONOMY.filter((r) => r !== "other_known_risk");

  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        clauseId: { type: "string" },
        category: { type: "string", enum: [...riskIds, "other_known_risk"] },
        claim: { type: "string" },
        severity: { type: "string", enum: ["low", "medium", "high"] },
        quotedText: { type: "string" },
      },
      required: ["clauseId", "category", "claim", "severity", "quotedText"],
    },
  };

  let raw: Array<{
    clauseId: string;
    category: string;
    claim: string;
    severity: "low" | "medium" | "high";
    quotedText: string;
  }> = [];

  try {
    raw = await executeJsonCompletion(
      [
        "Flag contractual risks against the closed risk taxonomy.",
        `Allowed categories: ${riskIds.join(", ")}, other_known_risk`,
        "Every finding must include quotedText copied VERBATIM from the clause.",
        `Clauses:\n${JSON.stringify(
          clauses.map((c) => ({
            clauseId: c.clauseId,
            clauseType: c.clauseType,
            text: c.text.slice(0, 2000),
          }))
        )}`,
      ].join("\n\n"),
      "You are a risk flagger. Never invent taxonomy categories. Always cite verbatim quotes.",
      schema,
      LLMTask.STRUCTURAL_JSON,
      LLMProvider.GEMINI,
      tracker
    );
  } catch (err) {
    console.warn("[flagRisk] LLM failed; heuristic risks:", err);
    raw = heuristicRisks(clauses);
  }

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
  }

  const byId = new Map(clauses.map((c) => [c.clauseId, c]));
  const riskFindings: Finding[] = raw.map((r, i) => {
    const clause = byId.get(r.clauseId);
    const category = isRiskTaxonomyId(r.category) ? r.category : "other_known_risk";
    const evidence: EvidenceSpan[] = [];
    if (clause) {
      const quote = r.quotedText && clause.text.includes(r.quotedText)
        ? r.quotedText
        : clause.text.slice(0, 400);
      evidence.push({ locator: clause.locator, quotedText: quote });
    }
    return {
      findingId: `f_risk_${unit.workUnitId}_${i}`,
      kind: "risk" as const,
      category,
      status: "present" as const,
      claim: r.claim,
      evidence,
      severity: r.severity,
      taxonomyVersion: RISK_TAXONOMY_VERSION,
      workUnitId: unit.workUnitId,
    };
  });

  return {
    state,
    findings: [...findings, ...absentFindings, ...riskFindings],
  };
}

function renderOutput(
  state: AnalysisState,
  findings: Finding[],
  unit: AnalysisWorkUnit
): AnalysisState {
  const schemaId = String(unit.input.schemaId ?? "checklist");
  const lines: string[] = [];

  if (schemaId === "memo") {
    lines.push("# Analysis Memo", "");
    lines.push(`Instruction: ${state.request.instruction}`, "");
    lines.push("## Findings", "");
    for (const f of findings.filter((x) => x.kind === "risk")) {
      lines.push(
        `- **[${f.status}] ${f.category}** (${f.severity ?? "n/a"}): ${f.claim}`
      );
      if (f.evidence[0]) {
        lines.push(`  - Evidence: "${f.evidence[0].quotedText.slice(0, 200)}"`);
      }
    }
  } else {
    lines.push("# Risk Checklist", "");
    lines.push("| Status | Category | Severity | Claim |");
    lines.push("|---|---|---|---|");
    for (const f of findings.filter((x) => x.kind === "risk" || x.kind === "extraction")) {
      lines.push(
        `| ${f.status} | ${f.category} | ${f.severity ?? "—"} | ${f.claim.replace(/\|/g, "/")} |`
      );
    }
  }

  // Completeness note for this work unit
  const renderFinding: Finding = {
    findingId: `f_render_${unit.workUnitId}`,
    kind: "summary_point",
    category: "other_known_risk",
    status: "present",
    claim: `Rendered ${schemaId} output with ${findings.length} prior findings.`,
    evidence: [],
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
  };

  return {
    ...state,
    renderedOutput: lines.join("\n"),
    findings: [...findings, renderFinding],
  };
}

function insufficient(unit: AnalysisWorkUnit, claim: string): Finding {
  return {
    findingId: `f_insuff_${unit.workUnitId}_${crypto.randomUUID().slice(0, 8)}`,
    kind: "risk",
    category: "other_known_risk",
    status: "insufficient_evidence",
    claim,
    evidence: [],
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    workUnitId: unit.workUnitId,
  };
}

function locateText(
  fullText: string,
  excerpt: string,
  docId: string,
  structuralPath: string | undefined,
  index: number
): { locator: ClauseObject["locator"]; text: string } {
  const needle = excerpt.trim();
  const idx = fullText.indexOf(needle.slice(0, Math.min(80, needle.length)));
  if (idx >= 0) {
    const end = Math.min(fullText.length, idx + needle.length);
    return {
      text: fullText.slice(idx, end),
      locator: {
        docId,
        structuralPath: structuralPath || `clause-extracted-${index + 1}`,
        charRange: [idx, end],
      },
    };
  }
  return {
    text: needle,
    locator: {
      docId,
      structuralPath: structuralPath || `clause-extracted-${index + 1}`,
      charRange: [0, Math.min(fullText.length, needle.length)],
    },
  };
}

function heuristicExtract(doc: {
  fullText: string;
  docId: string;
  segments: { locator: { structuralPath: string; charRange: [number, number] }; text: string; kind: string }[];
}): Array<{ clauseType: string; structuralPath?: string; text: string }> {
  const out: Array<{ clauseType: string; structuralPath?: string; text: string }> = [];
  const map: Array<[RegExp, string]> = [
    [/\bindemnif/i, "indemnity"],
    [/\blimitation of liability\b|\bliability shall not exceed\b/i, "limitation_of_liability"],
    [/\bterminat/i, "termination"],
    [/\bgoverning law\b|\bjurisdiction\b/i, "governing_law"],
    [/\bconfidential/i, "confidentiality"],
  ];
  for (const seg of doc.segments.filter((s) => s.kind === "clause" || s.kind === "paragraph")) {
    for (const [re, type] of map) {
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

function heuristicRisks(
  clauses: ClauseObject[]
): Array<{
  clauseId: string;
  category: string;
  claim: string;
  severity: "low" | "medium" | "high";
  quotedText: string;
}> {
  const out: ReturnType<typeof heuristicRisks> = [];
  for (const c of clauses) {
    if (c.clauseType === "limitation_of_liability" && /unlimited|without limit/i.test(c.text)) {
      out.push({
        clauseId: c.clauseId,
        category: "uncapped_liability",
        claim: "Limitation of liability appears uncapped or effectively unlimited.",
        severity: "high",
        quotedText: c.text.slice(0, 300),
      });
    }
    if (c.clauseType === "indemnity" && /solely|only the\b/i.test(c.text) === false && /indemnif/i.test(c.text)) {
      if (/customer shall indemnify|you shall indemnify/i.test(c.text)) {
        out.push({
          clauseId: c.clauseId,
          category: "one_sided_indemnity",
          claim: "Indemnity appears one-sided against the customer.",
          severity: "medium",
          quotedText: c.text.slice(0, 300),
        });
      }
    }
  }
  return out;
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
