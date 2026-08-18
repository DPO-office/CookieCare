import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { ClauseObject, EvidenceStatus } from "../../models/clause-object.js";
import type { Finding } from "../../models/finding.js";
import type { SegmentedDocument } from "../../models/document-workspace.js";
import { CLAUSE_TAXONOMY_VERSION } from "../../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../../taxonomies/index.js";
import { getRuntimeTaxonomies, getSkillById } from "../../skills/registry.js";
import type { AnalysisSkillConfig } from "../../skills/types.js";
import { insufficient } from "./act-utils.js";
import { pacLog } from "../../utils/pac-log.js";
import {
  buildRetrievalDictionary,
  groupDocumentSections,
  locateEvidence,
  type ClauseCandidate,
  type ClauseLocatorResult,
} from "./locate-evidence.js";

async function extractClauses(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  findings: Finding[]
): Promise<{ state: AnalysisState; findings: Finding[] }> {
  const started = Date.now();
  const docId = String(unit.input.docId ?? "");
  const clauseTypesInput = unit.input.clauseTypes as string[] | undefined;
  const skillIds = (unit.input.skillIds as string[]) ?? state.activeSkillIds ?? [];
  const runtime = getRuntimeTaxonomies();

  let clauseTypes = clauseTypesInput?.length
    ? clauseTypesInput.filter((c) => runtime.clauseTypes.includes(c) || c === "uncategorized")
    : runtime.clauseTypes.filter((c) => c !== "other");

  if (unit.input.unionPlaybookClauseTypes === true) {
    const referenceDocId = String(unit.input.referenceDocId ?? "");
    const refDoc = state.workspace.documents.find((d) => d.docId === referenceDocId);
    const fromPlaybook = (refDoc?.playbookPositions ?? [])
      .map((p) => p.clauseType)
      .filter((t) => t && t !== "uncategorized");
    clauseTypes = [...new Set([...clauseTypes, ...fromPlaybook])].filter(
      (c) => runtime.clauseTypes.includes(c) || c === "uncategorized"
    );
  }

  const doc = state.workspace.documents.find((d) => d.docId === docId);
  if (!doc) {
    return {
      state,
      findings: [...findings, insufficient(unit, `Document ${docId} not found for extraction`)],
    };
  }

  const skills = skillIds
    .map((id) => getSkillById(id))
    .filter((s): s is AnalysisSkillConfig => Boolean(s));
  const expectedTypes = skills.flatMap((s) => s.expectedClauses.map((e) => e.clauseType));
  const neededTypes = [...new Set([...clauseTypes, ...expectedTypes])].filter(
    (c) => runtime.clauseTypes.includes(c) || c === "uncategorized"
  );

  const dictionary = buildRetrievalDictionary(skills, neededTypes);

  const locStart = Date.now();
  let located = locateEvidence(doc, neededTypes, dictionary);
  const locMs = Date.now() - locStart;
  const candidateCount = located.reduce((n, r) => n + r.candidates.length, 0);

  const missing = located
    .filter((r) => r.status === "not_found" && r.candidates.length === 0)
    .map((r) => r.clauseType);

  let fallbackCalls = 0;
  let fallbackMs = 0;
  const tracker = state.agent ? { tokensUsed: state.agent.tokensUsed } : undefined;

  if (missing.length > 0) {
    const fbStart = Date.now();
    try {
      const mapped = await headingsFallback(doc, missing, tracker);
      fallbackCalls = 1;
      located = mergeFallback(located, mapped, doc);
    } catch (err) {
      console.warn("[extractClauses] headings fallback failed; using heuristic:", err);
      located = mergeHeuristic(located, heuristicExtract(doc, missing), doc);
    }
    fallbackMs = Date.now() - fbStart;
  }

  const mergeStart = Date.now();
  const clauses = materializeClauses(docId, located, runtime.clauseTypes);
  const mergeMs = Date.now() - mergeStart;

  if (state.agent && tracker) {
    state.agent.tokensUsed = tracker.tokensUsed;
    state.agent.extractionUnitsUsed += clauses.length;
  }

  pacLog("extract_clauses diagnostic", {
    id: unit.workUnitId,
    documentSegmentationMs: 0,
    candidateRetrievalMs: locMs,
    candidateSections: candidateCount,
    llmExtractionCalls: fallbackCalls,
    llmExtractionWall: fallbackMs,
    mergeMs,
    total: Date.now() - started,
    neededTypes: neededTypes.length,
    found: located.filter((r) => r.status === "found" || r.status === "multiple_candidates")
      .length,
    referencedElsewhere: located.filter((r) => r.status === "referenced_elsewhere").length,
    notFound: located.filter((r) => r.status === "not_found").length,
    clauses: clauses.length,
    docChars: doc.fullText.length,
  });

  const extractionFinding: Finding = {
    findingId: `f_extract_${unit.workUnitId}`,
    kind: "extraction",
    category: "other_known_risk",
    status: clauses.length > 0 ? "present" : "insufficient_evidence",
    claim:
      clauses.length > 0
        ? `Located ${clauses.length} evidence spans from document ${docId} (skill-scoped).`
        : `No clauses could be extracted from document ${docId}.`,
    evidence: clauses.slice(0, 3).map((c) => ({
      locator: c.locator,
      quotedText: c.text.slice(0, 500),
      sourceRole: "target" as const,
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

/**
 * One cheap JSON call over heading lines + first-line previews. Never sends
 * the document body.
 */
async function headingsFallback(
  doc: SegmentedDocument,
  missingTypes: string[],
  tracker?: { tokensUsed: number }
): Promise<Array<{ clauseType: string; structuralPaths: string[] }>> {
  const sections = groupDocumentSections(doc);
  const headingIndex = sections
    .map(
      (s, i) =>
        `${i}. path=${s.headingPath} heading="${s.headingText.slice(0, 120)}" preview="${s.firstLine.slice(0, 160)}"`
    )
    .join("\n");

  const prompt = [
    "Map each requested clause type to the most likely section path(s) from the heading index.",
    "Use only the heading and one-line preview. Do not invent paths.",
    "If no heading looks relevant, return an empty structuralPaths array for that type.",
    `Clause types:\n${missingTypes.map((t) => `- ${t}`).join("\n")}`,
    `Heading index:\n${headingIndex.slice(0, 12_000)}`,
  ].join("\n\n");

  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        clauseType: { type: "string", enum: missingTypes },
        structuralPaths: { type: "array", items: { type: "string" } },
      },
      required: ["clauseType", "structuralPaths"],
    },
  };

  return executeJsonCompletion(
    prompt,
    "You map clause types to document headings. Never invent paths that are not in the index.",
    schema,
    LLMTask.STRUCTURAL_JSON_LITE,
    LLMProvider.GEMINI,
    tracker
  );
}

function mergeFallback(
  located: ClauseLocatorResult[],
  mapped: Array<{ clauseType: string; structuralPaths: string[] }>,
  doc: SegmentedDocument
): ClauseLocatorResult[] {
  const byType = new Map(mapped.map((m) => [m.clauseType, m.structuralPaths ?? []]));
  const sections = groupDocumentSections(doc);
  return located.map((result) => {
    if (result.status !== "not_found") return result;
    const paths = byType.get(result.clauseType) ?? [];
    const candidates: ClauseCandidate[] = [];
    for (const path of paths) {
      const section = sections.find((s) => s.headingPath === path);
      if (!section) continue;
      candidates.push({
        clauseType: result.clauseType,
        segmentId: section.headingPath,
        sectionTitle: section.title,
        startOffset: section.startOffset,
        endOffset: section.endOffset,
        text: section.text.slice(0, 2_400),
        matchReason: "headings_llm",
        score: 50,
      });
    }
    if (candidates.length === 0) return result;
    return {
      clauseType: result.clauseType,
      status: candidates.length > 1 ? "multiple_candidates" : "found",
      candidates,
    };
  });
}

function mergeHeuristic(
  located: ClauseLocatorResult[],
  extracted: Array<{ clauseType: string; structuralPath?: string; text: string }>,
  doc: SegmentedDocument
): ClauseLocatorResult[] {
  const byType = new Map<string, typeof extracted>();
  for (const e of extracted) {
    const list = byType.get(e.clauseType) ?? [];
    list.push(e);
    byType.set(e.clauseType, list);
  }
  return located.map((result) => {
    if (result.status !== "not_found") return result;
    const hits = byType.get(result.clauseType) ?? [];
    if (hits.length === 0) return result;
    const candidates: ClauseCandidate[] = hits.map((h, i) => {
      const idx = doc.fullText.indexOf(h.text.slice(0, 80));
      const start = idx >= 0 ? idx : 0;
      const end = Math.min(doc.fullText.length, start + h.text.length);
      return {
        clauseType: result.clauseType,
        segmentId: h.structuralPath ?? `heuristic-${i}`,
        startOffset: start,
        endOffset: end,
        text: h.text.slice(0, 2_400),
        matchReason: "heuristic",
        score: 30,
      };
    });
    return {
      clauseType: result.clauseType,
      status: "insufficient_evidence",
      candidates,
    };
  });
}

function materializeClauses(
  docId: string,
  located: ClauseLocatorResult[],
  allowedTypes: string[]
): ClauseObject[] {
  const clauses: ClauseObject[] = [];
  let index = 0;
  for (const result of located) {
    if (result.status === "not_found" && result.candidates.length === 0) continue;
    const type = allowedTypes.includes(result.clauseType) ? result.clauseType : "other";
    const status: EvidenceStatus = result.status;
    const source =
      result.candidates.length > 0
        ? result.candidates
        : [
            {
              clauseType: type,
              segmentId: `missing-${type}`,
              startOffset: 0,
              endOffset: 0,
              text: "",
              matchReason: "not_found",
              score: 0,
            } satisfies ClauseCandidate,
          ];
    for (const candidate of source) {
      clauses.push({
        clauseId: `cl_${docId}_${index}_${type}`,
        clauseType: type,
        locator: {
          docId,
          structuralPath: candidate.segmentId,
          charRange: [candidate.startOffset, candidate.endOffset],
        },
        text: candidate.text,
        taxonomyVersion: CLAUSE_TAXONOMY_VERSION,
        evidenceStatus: status,
        matchReason: candidate.matchReason,
        referencedDocuments: result.referencedDocuments,
      });
      index += 1;
    }
  }
  return clauses;
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
