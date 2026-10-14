/**
 * Canonical compliance-check pipeline state and diagnostics.
 *
 * Phases 1-8 compute the authoritative matrix, lock, snapshot and diagnostics.
 *
 * Sinks (always on — independent of ANALYSIS_LOG):
 *  1. Console via `pacLogAlways` — short `[compliance]` summary per bundle.
 *  2. `logs/analysis/<sessionId>.compliance.log` — one JSON line per requirement
 *     with the full Phase3Bundle payload (items, partitions, exclusions, deps).
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { AnalysisState } from "../../../../models/analysis-state.js";
import type { ComplianceOutstandingCheck } from "../../../../models/compliance-report.js";
import { buildComplianceSnapshot } from "../../../reporting/compliance-snapshot.js";
import { usesCanonicalComplianceReport } from "../../../reporting/compliance-release.js";
import { humanizeRequirementId } from "../../../../shared/group-assessments.js";
import { pacLogAlways } from "../../../../utils/pac-log.js";
import {
  type StructuralNode,
  type StructuralNodeKind,
} from "../../../../segmentation/structural-nodes.js";
import {
  buildReferenceIndex,
  type BuildIndexResult,
  type ReferenceRecord,
} from "../../../../segmentation/reference-index.js";
import type { CanonicalDocumentGraph } from "../../../ingest/document-structure/types.js";
import type { RequirementBinding } from "../../../../models/analysis-plan.js";
import {
  canonicalRequirementId,
  normalizeRequirementKey,
} from "../../../../shared/requirement-identity.js";
import { articleNumberFromRequirementId } from "../../../../shared/article-linkage.js";
import {
  computePhase3Investigate,
  type Phase3Bundle,
  type Phase3Input,
  type Phase3PerRequirementResult,
} from ".././retrieve-compliance-evidence.js";
import type { RequirementEvidenceProfile } from "../../shared/requirement-evidence.js";
import {
  AUTHORED_ELEMENT_REGISTRY,
  resolveElementSchema,
  type RequirementElementSchema,
} from "./compliance-schema-registry.js";
import { verifyRequirement, type RequirementMatrix } from "./verify-evidence-deterministically.js";
import {
  assessRequirement,
  draftExplanation,
  type AssessmentResult,
  type ExplanationDraft,
} from "./assess-compliance-requirements.js";
import {
  runFallbackForRequirement,
  type FallbackOutcome,
} from "./retrieve-evidence-with-llm.js";
import { buildSectionCandidates } from "../../shared/candidate-selection.js";
import {
  verifyRequirementWithLlm,
  type LlmVerifyOutcome,
} from "./verify-evidence-with-llm.js";
import {
  duplicateCanonicalKeys,
  lockAssessment,
  type LockDecision,
} from "./lock-compliance-assessments.js";
import {
  renderLockedOnly,
  type RenderedReport,
  type SupplementalRequestRow,
} from "./project-locked-compliance-report.js";
import {
  complianceInvestigationMode,
  runGraphNativeInvestigation,
  toPhase3Bundle,
} from ".././investigation/index.js";
import { dumpComplianceBundles } from "../../../../temp/compliance-bundles/dump-compliance-bundles.js";

/** Bump this when the implementation phase advances (Phase 1A → "1A", etc.). */
export const IMPLEMENTATION_PHASE = "live";

/**
 * Default ON — AI verifier judgment is canonical for every requirement,
 * every regime, replacing the deterministic keyword-gated matrix in
 * `t.phase4Matrices` wherever the LLM path validated successfully (and
 * safely deferring to `verification_incomplete`, never a guess, wherever it
 * didn't — see `recordLlmVerifyCanonicalSwap`). Flipped on after a live test
 * round across five real DPAs (Bitrix, Salesforce, Entrust Datacard, an
 * unfilled template, and Mastercard) covering GDPR Article 28 and
 * international-transfer checks, both DOCX and PDF sources, with zero
 * infrastructure-level regressions on the final passes. Set
 * LLM_VERIFY_CANONICAL=0 to fall back to the pure deterministic path if a
 * future regression demands it.
 */
export function llmVerifyCanonicalEnabled(): boolean {
  const raw = process.env.LLM_VERIFY_CANONICAL;
  if (raw === undefined || raw === "") return true;
  return raw === "1" || raw.toLowerCase() === "true";
}

/**
 * PHASE 8 — performance controls for the canonical pipeline.
 *
 * The canonical Phase 3-7 pipeline runs synchronously
 * inside `runCompliancePipeline`.
 * Two of its stages make real LLM calls per requirement (the retrieval
 * fallback and the LLM bundle verifier) — run naively as a sequential loop,
 * 8 requirements x up to 2 rounds is enough latency to threaten the plan's
 * two-minute budget. These three primitives keep it bounded:
 *   - `SIDE_CHANNEL_CONCURRENCY` workers process requirements in parallel.
 *   - `SIDE_CHANNEL_STAGE_BUDGET_MS` is a wall-clock ceiling per stage; once
 *     exceeded, remaining requirements are skipped (not attempted with a
 *     truncated result) and recorded as `budget_exceeded` — never silently
 *     promoted to a worse status.
 *   - Document parsing (Phase 1B structural nodes) is cached across runs by
 *     content hash so re-analysing the same document version is free.
 */
const SIDE_CHANNEL_CONCURRENCY = Math.max(
  1,
  Number(process.env.ANALYSIS_COMPLIANCE_SIDE_CHANNEL_CONCURRENCY || 4)
);
const SIDE_CHANNEL_STAGE_BUDGET_MS = Math.max(
  1000,
  Number(process.env.ANALYSIS_COMPLIANCE_SIDE_CHANNEL_STAGE_BUDGET_MS || 45_000)
);

/** Bounded-concurrency map with an optional wall-clock deadline. Items not
 * started before the deadline are returned via `onSkipped` rather than run
 * with a truncated timeout — an explicit skip, never a partial attempt. */
async function runBoundedWithBudget<T, R>(
  items: T[],
  limit: number,
  budgetMs: number,
  worker: (item: T) => Promise<R>,
  onSkipped: (item: T) => R
): Promise<R[]> {
  const deadline = Date.now() + budgetMs;
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        if (Date.now() >= deadline) {
          results[index] = onSkipped(items[index]);
          continue;
        }
        results[index] = await worker(items[index]);
      }
    }
  );
  await Promise.all(runners);
  return results;
}

function legacyKind(kind: CanonicalDocumentGraph["nodes"][number]["kind"]): StructuralNodeKind {
  if (kind === "document") return "document";
  if (["appendix", "annex", "exhibit"].includes(kind)) return "appendix";
  if (kind === "schedule") return "schedule";
  if (["clause", "subclause", "article"].includes(kind)) return "clause";
  if (["title", "part", "section"].includes(kind)) return "section";
  if (kind === "definition") return "definition";
  if (kind === "table") return "table";
  if (kind === "list") return "list";
  if (kind === "list_item") return "list_item";
  return "paragraph";
}

function structuralPath(graph: CanonicalDocumentGraph, nodeId: string): string {
  const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const direct = byId.get(nodeId)?.ordinalPath;
  if (direct) return direct;
  const parts: string[] = [];
  let node = byId.get(nodeId);
  while (node && node.kind !== "document") {
    parts.unshift(node.displayLabel || node.title || node.kind);
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return parts.join("/") || "document";
}

function legacyNodesFromGraph(graph: CanonicalDocumentGraph): StructuralNode[] {
  return graph.nodes.map((node) => ({
    spanId: node.nodeId,
    documentId: graph.fileId,
    kind: legacyKind(node.kind),
    structuralPath: structuralPath(graph, node.nodeId),
    parentSpanId: node.parentId ?? null,
    order: node.order,
    rawText: node.text,
    normalizedText: node.text.replace(/\s+/g, " ").trim(),
    sourceOffsets: node.sourceRange,
    contentHash: crypto.createHash("sha256").update(node.text).digest("hex"),
    definedTerm: node.definedTerm,
  }));
}

function referenceIndexForState(state: AnalysisState, allNodes: StructuralNode[]): BuildIndexResult {
  const graphs = (state.workspace?.documents ?? []).map((doc) => doc.structureGraph).filter((graph): graph is CanonicalDocumentGraph => Boolean(graph));
  if (!graphs.length) return buildReferenceIndex(allNodes);
  const definitions: BuildIndexResult["definitions"] = [];
  const references: BuildIndexResult["references"] = [];
  for (const graph of graphs) {
    const byId = new Map(graph.nodes.map((node) => [node.nodeId, node]));
    for (const definition of graph.definitions) definitions.push({ term: definition.term, definitionSpanId: definition.definitionNodeId, documentId: graph.fileId });
    for (const edge of graph.relationEdges) {
      const target = edge.targetNodeId ? byId.get(edge.targetNodeId) : undefined;
      const targetKind = target?.kind;
      const referenceKind: ReferenceRecord["referenceKind"] = edge.semanticEffect === "defined_by"
        ? "defined_term"
        : targetKind === "appendix" || targetKind === "schedule" || targetKind === "annex" || targetKind === "exhibit"
        ? targetKind
        : "clause";
      references.push({
        sourceSpanId: edge.sourceNodeId,
        documentId: graph.fileId,
        referenceText: edge.targetMention,
        referenceKind,
        // Candidate IDs on an ambiguous edge are diagnostic possibilities,
        // not verified traversal targets. Only resolved edges may expand the
        // evidence graph used for compliance conclusions.
        targetSpanIds: edge.status === "resolved" && edge.targetNodeId ? [edge.targetNodeId] : [],
        state: edge.status === "resolved"
          ? "resolved_internal"
          : edge.status === "external"
            ? "unresolved_external"
            : edge.status === "unresolved_internal"
              ? "unresolved"
              : "ambiguous",
        sampleText: edge.evidenceText,
      });
    }
  }
  return { definitions, references };
}

/** Canonical stage names used across events (matches the plan §1 pipeline). */
export type ComplianceStage =
  | "ingest"
  | "resolve"
  | "retrieve"
  | "bundle"
  | "verify"
  | "verify_canonical"
  | "assess"
  | "lock"
  | "render";

interface RequirementLifecycle {
  requirementId: string;
  retrieved: boolean;
  verified: boolean;
  assessed: boolean;
  rendered: boolean;
}

interface ComplianceRunTracker {
  sessionId: string;
  startedAtMs: number;
  plannedRequirementIds: string[];
  lifecycle: Map<string, RequirementLifecycle>;
  stageDurationsMs: Record<string, number>;
  markersEmitted: Set<string>;
  structuralNodesByDoc: Map<string, StructuralNode[]>;
  referenceIndexEmitted: boolean;
  requirementRegistryEmitted: boolean;
  requestResolutionEmitted: boolean;
  phase3Emitted: boolean;
  phase3Results: Phase3PerRequirementResult[];
  investigatedDocuments: Map<string, Set<string>>;
  phase4Emitted: boolean;
  phase4Matrices: RequirementMatrix[];
  phase5Emitted: boolean;
  phase5Assessments: AssessmentResult[];
  phase5Explanations: ExplanationDraft[];
  fallbackEmitted: boolean;
  fallbackOutcomes: FallbackOutcome[];
  llmVerifyEmitted: boolean;
  llmVerifyOutcomes: LlmVerifyOutcome[];
  llmVerifyCanonicalSwapEmitted: boolean;
  lockEmitted: boolean;
  lockDecisions: LockDecision[];
  lockDecisionsByRequirement: Map<string, LockDecision>;
  renderEmitted: boolean;
  renderedReport: RenderedReport | null;
  /** Cache for `requirementEvidenceProfiles` — built once per run. */
  requirementProfiles: Map<string, RequirementEvidenceProfile> | null;
  graphNativeInvestigationEmitted: boolean;
}

const RUNS = new Map<string, ComplianceRunTracker>();
const LOG_DIR = path.join(process.cwd(), "logs", "analysis");

function sessionKey(state: AnalysisState): string {
  return state.request?.sessionId || "unknown-session";
}

function tracker(state: AnalysisState): ComplianceRunTracker {
  const key = sessionKey(state);
  let existing = RUNS.get(key);
  if (!existing) {
    existing = {
      sessionId: key,
      startedAtMs: Date.now(),
      plannedRequirementIds: [],
      lifecycle: new Map(),
      stageDurationsMs: {},
      markersEmitted: new Set(),
      structuralNodesByDoc: new Map(),
      referenceIndexEmitted: false,
      requirementRegistryEmitted: false,
      requestResolutionEmitted: false,
      phase3Emitted: false,
      phase3Results: [],
      investigatedDocuments: new Map(),
      phase4Emitted: false,
      phase4Matrices: [],
      phase5Emitted: false,
      phase5Assessments: [],
      phase5Explanations: [],
      fallbackEmitted: false,
      fallbackOutcomes: [],
      llmVerifyEmitted: false,
      llmVerifyOutcomes: [],
      llmVerifyCanonicalSwapEmitted: false,
      lockEmitted: false,
      lockDecisions: [],
      lockDecisionsByRequirement: new Map(),
      renderEmitted: false,
      renderedReport: null,
      requirementProfiles: null,
      graphNativeInvestigationEmitted: false,
    };
    RUNS.set(key, existing);
  }
  return existing;
}

function appendComplianceFile(state: AnalysisState, jsonLine: string): void {
  const sessionId = state.request?.sessionId;
  if (!sessionId) return;
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  const filePath = path.join(LOG_DIR, `${sessionId}.compliance.log`);
  if (!fs.existsSync(filePath)) {
    const header = [
      "=".repeat(72),
      "PHASE 3C EVIDENCE BUNDLES ONLY",
      `session=${sessionId}`,
      `started=${new Date().toISOString()}`,
      "One compliance.bundle.created JSON line per requirement.",
      "=".repeat(72),
      "",
    ].join("\n");
    fs.writeFileSync(filePath, header, "utf-8");
    console.log(`[compliance-observability] writing bundle log to ${filePath}`);
  }
  fs.appendFileSync(filePath, `${jsonLine}\n`, "utf-8");
}

/** Phase 3C bundle + Phase 4 element-registry / verify events. */
const PERSISTED_EVENTS = new Set<string>([
  "compliance.bundle.created",
  "compliance.element.registry",
  "compliance.verify.input",
  "compliance.verify.element",
  "compliance.verify.completeness",
  "compliance.assess.input",
  "compliance.assess.result",
  "compliance.explain.draft",
  "compliance.fallback.round",
  "compliance.fallback.outcome",
  "compliance.verify.llm.element",
  "compliance.verify.llm.completeness",
  "compliance.verify.compare",
  "compliance.verify.canonical",
  "compliance.lock.attempt",
  "compliance.lock.accepted",
  "compliance.lock.rejected",
  "compliance.lock.summary",
  "compliance.render.row",
  "compliance.render.supplemental",
  "compliance.render.bottom_line",
  "compliance.render.reconciliation",
  "compliance.render.coverage_gap",
  "compliance.run.timing",
  "compliance.run.reconciliation",
  // Graph-native hybrid investigation and shadow comparison.
  "compliance.investigation.plan.started",
  "compliance.investigation.plan.completed",
  "compliance.investigation.search.executed",
  "compliance.investigation.candidate.retrieved",
  "compliance.investigation.context.expanded",
  "compliance.investigation.candidate.reviewed",
  "compliance.investigation.followup.started",
  "compliance.investigation.followup.completed",
  "compliance.investigation.bundle.created",
  "compliance.investigation.bundle.validated",
  "compliance.investigation.incomplete",
  "compliance.investigation.timing",
  "compliance.investigation.compare",
  "compliance.investigation.embedding_cache",
  "compliance.investigation.embedding_cache.degraded",
  "compliance.investigation.embedding.degraded",
  "compliance.investigation.retrieval.completed",
  "compliance.investigation.review.completed",
  "compliance.investigation.review.degraded",
  "compliance.investigation.shadow.skipped",
]);
function shouldLogComplianceEvent(event: string): boolean {
  return PERSISTED_EVENTS.has(event);
}

/**
 * Emit one structured event. Non-bundle events are no-ops (computation callers
 * stay unchanged; only logging is filtered).
 */
export function emitComplianceEvent(
  state: AnalysisState,
  event: string,
  payload: Record<string, unknown> = {}
): void {
  if (!shouldLogComplianceEvent(event)) return;
  const base = {
    event,
    analysisId: sessionKey(state),
    timestamp: new Date().toISOString(),
    implementationPhase: IMPLEMENTATION_PHASE,
  };
  const full = { ...base, ...payload };
  // Console: short summary so huge quotedText payloads do not flood the terminal.
  pacLogAlways(`[compliance] ${event}`, {
    analysisId: full.analysisId,
    requirementId: payload.requirementId,
    bundleId: payload.bundleId,
    itemCount: Array.isArray(payload.items) ? payload.items.length : undefined,
    estimatedTokens: payload.estimatedTokens,
    partitionCount: Array.isArray(payload.partitions)
      ? payload.partitions.length
      : undefined,
    exclusionCount: Array.isArray(payload.exclusions)
      ? payload.exclusions.length
      : undefined,
    dependencyCount: Array.isArray(payload.dependencies)
      ? payload.dependencies.length
      : undefined,
  });
  appendComplianceFile(state, JSON.stringify(full));
}

/** Start (or re-open) the per-run tracker; safe to call more than once. */
export function beginComplianceRun(state: AnalysisState, reset = false): void {
  if (reset) RUNS.delete(sessionKey(state));
  const t = tracker(state);
  if (t.startedAtMs === 0) t.startedAtMs = Date.now();
}

/** Record the set of requirement IDs the planner decided to evaluate. */
export function recordPlannedRequirements(
  state: AnalysisState,
  requirementIds: string[]
): void {
  const t = tracker(state);
  t.plannedRequirementIds = [...new Set(requirementIds)];
  for (const id of t.plannedRequirementIds) {
    if (!t.lifecycle.has(id)) {
      t.lifecycle.set(id, {
        requirementId: id,
        retrieved: false,
        verified: false,
        assessed: false,
        rendered: false,
      });
    }
  }
  emitComplianceEvent(state, "compliance.plan.requirements", {
    requirementIds: t.plannedRequirementIds,
    count: t.plannedRequirementIds.length,
  });
}

function markLifecycle(
  state: AnalysisState,
  requirementIds: string[],
  key: keyof Omit<RequirementLifecycle, "requirementId">
): void {
  const t = tracker(state);
  for (const id of requirementIds) {
    const entry = t.lifecycle.get(id) ?? {
      requirementId: id,
      retrieved: false,
      verified: false,
      assessed: false,
      rendered: false,
    };
    entry[key] = true;
    t.lifecycle.set(id, entry);
  }
}

export function markRetrieved(state: AnalysisState, requirementIds: string[]): void {
  markLifecycle(state, requirementIds, "retrieved");
}
export function markVerified(state: AnalysisState, requirementIds: string[]): void {
  markLifecycle(state, requirementIds, "verified");
}
export function markAssessed(state: AnalysisState, requirementIds: string[]): void {
  markLifecycle(state, requirementIds, "assessed");
}
export function markRendered(state: AnalysisState, requirementIds: string[]): void {
  markLifecycle(state, requirementIds, "rendered");
}

/** Report a candidate-pool count at each documented cut point. */
export function recordRetrievalPool(
  state: AnalysisState,
  args: {
    packageId?: string;
    requirementId?: string;
    beforeFilter: number;
    afterScopeFilter: number;
    afterCap: number;
    source?: string;
  }
): void {
  emitComplianceEvent(state, "compliance.retrieval.pool", {
    packageId: args.packageId,
    requirementId: args.requirementId,
    source: args.source,
    beforeFilter: args.beforeFilter,
    afterScopeFilter: args.afterScopeFilter,
    afterCap: args.afterCap,
  });
}

/** Add an elapsed time to a stage bucket (multiple units contribute additively). */
export function recordStageDuration(
  state: AnalysisState,
  stage: ComplianceStage | string,
  ms: number
): void {
  const t = tracker(state);
  t.stageDurationsMs[stage] = (t.stageDurationsMs[stage] ?? 0) + Math.max(0, ms);
}

/**
 * Scan primary documents for the markers called out in Phase 0 §5 and emit
 * one `compliance.source.marker` event per marker. Idempotent within a run.
 */
export function recordSourceMarkers(state: AnalysisState): void {
  const t = tracker(state);
  const docs = state.workspace?.documents ?? [];
  const MARKERS: Array<{
    key: string;
    label: string;
    regex: RegExp;
  }> = [
    {
      key: "appendix_heading",
      label: "Appendix/Schedule heading",
      regex: /\b(?:appendix|schedule|annex(?:ure)?|exhibit)\s+[A-Z0-9]/i,
    },
    {
      key: "appendix_body",
      label: "Appendix body marker",
      regex:
        /\b(?:appendix|schedule|annex(?:ure)?)\s+[A-Z0-9][^\n]{0,80}\n[\s\S]{40,}/i,
    },
    {
      key: "term_definition",
      label: "\"Term\" definition",
      regex:
        /["“]?\bterm\b["”]?\s+(?:means|shall mean|refers to)\b/i,
    },
    {
      key: "data_categories",
      label: "data categories text",
      regex:
        /\b(?:categor(?:ies|y) of (?:personal )?data|data categories?|types? of personal data)\b/i,
    },
    {
      key: "data_subjects",
      label: "data subjects text",
      regex:
        /\b(?:categor(?:ies|y) of data subjects?|data subjects?)\b/i,
    },
  ];
  for (const marker of MARKERS) {
    if (t.markersEmitted.has(marker.key)) continue;
    let present = false;
    let firstDocId: string | undefined;
    for (const doc of docs) {
      if (doc.role === "reference") continue;
      const text = doc.fullText ?? "";
      if (!text) continue;
      if (marker.regex.test(text)) {
        present = true;
        firstDocId = doc.docId;
        break;
      }
    }
    t.markersEmitted.add(marker.key);
    emitComplianceEvent(state, "compliance.source.marker", {
      marker: marker.key,
      label: marker.label,
      present,
      documentId: firstDocId,
    });
  }
}

/**
 * PHASE 1A — reconstruct DOCX table structure from the persisted plaintext
 * (which now carries `\t` cell / `\n` row boundaries) and emit one
 * `compliance.ingest.table` event per table plus one
 * `compliance.ingest.table_row` per row, per the plan §Phase 1A Required logs.
 *
 * A "table" here is a run of two or more consecutive lines where every line
 * contains at least one tab and every line has the same cell count. This is a
 * conservative heuristic — a single tabbed line (e.g. an inline `Key\tValue`)
 * is not treated as a table, so the events describe real DOCX tables rather
 * than incidental tab whitespace.
 */
export function recordIngestTables(state: AnalysisState): void {
  const docs = state.workspace?.documents ?? [];
  for (const doc of docs) {
    if (doc.role === "reference") continue;
    const text = doc.fullText ?? "";
    if (!text) continue;
    const tables = detectTablesInText(text);
    for (const table of tables) {
      emitComplianceEvent(state, "compliance.ingest.table", {
        documentId: doc.docId,
        tableId: table.tableId,
        rowCount: table.rows.length,
        cellCount: table.rows.reduce((n, r) => n + r.cellSpanIds.length, 0),
      });
      for (const row of table.rows) {
        emitComplianceEvent(state, "compliance.ingest.table_row", {
          documentId: doc.docId,
          tableId: table.tableId,
          rowId: row.rowId,
          cellSpanIds: row.cellSpanIds,
          charRange: row.charRange,
        });
      }
    }
  }
}

/**
 * PHASE 1A — augment `compliance.source.marker` events with rawPresent vs
 * normalizedPresent. `raw` here is the pre-boundary approximation: the
 * persisted text with cell tabs collapsed to a single space, which is what
 * the old (Phase 0) DOCX plaintext looked like. A `rawPresent:true,
 * normalizedPresent:false` divergence proves a marker was destroyed by the
 * new boundary insertion; `rawPresent:false, normalizedPresent:true` proves
 * the boundary preservation recovered a marker. Idempotent per run.
 */
export function recordIngestMarkers(state: AnalysisState): void {
  const t = tracker(state);
  const docs = state.workspace?.documents ?? [];
  const MARKERS: Array<{ key: string; regex: RegExp }> = [
    {
      key: "data_categories",
      regex:
        /\b(?:categor(?:ies|y) of (?:personal )?data|data categories?|types? of personal data)\b/i,
    },
    {
      key: "data_subjects",
      regex: /\b(?:categor(?:ies|y) of data subjects?|data subjects?)\b/i,
    },
    {
      key: "term_definition",
      regex: /["“]?\bterm\b["”]?\s+(?:means|shall mean|refers to)\b/i,
    },
    {
      key: "appendix_body",
      regex:
        /\b(?:appendix|schedule|annex(?:ure)?)\s+[A-Z0-9][^\n]{0,80}\n[\s\S]{40,}/i,
    },
  ];
  for (const marker of MARKERS) {
    const eventKey = `ingest:${marker.key}`;
    if (t.markersEmitted.has(eventKey)) continue;
    let rawPresent = false;
    let normalizedPresent = false;
    let firstDocId: string | undefined;
    for (const doc of docs) {
      if (doc.role === "reference") continue;
      const normalized = doc.fullText ?? "";
      if (!normalized) continue;
      const raw = normalized.replace(/\t/g, " ");
      const nHit = marker.regex.test(normalized);
      const rHit = marker.regex.test(raw);
      if (nHit || rHit) {
        rawPresent = rawPresent || rHit;
        normalizedPresent = normalizedPresent || nHit;
        if (!firstDocId) firstDocId = doc.docId;
      }
    }
    t.markersEmitted.add(eventKey);
    emitComplianceEvent(state, "compliance.ingest.marker", {
      marker: marker.key,
      rawPresent,
      normalizedPresent,
      documentId: firstDocId,
    });
  }
}

interface DetectedTableRow {
  rowId: string;
  cellSpanIds: string[];
  charRange: [number, number];
}
interface DetectedTable {
  tableId: string;
  rows: DetectedTableRow[];
}

/**
 * PHASE 1B — build the canonical structural-node graph for every primary
 * document and emit `compliance.structure.summary` + `compliance.structure.node`
 * per document plus `compliance.structure.orphan` for any node whose parent
 * is missing. Structural nodes are stashed on the run tracker so Phase 1C
 * can consume them without rebuilding.
 */
export function recordStructuralNodes(state: AnalysisState): void {
  const t = tracker(state);
  const docs = state.workspace?.documents ?? [];
  for (const doc of docs) {
    if (doc.role === "reference") continue;
    if (!doc.fullText) continue;
    if (t.structuralNodesByDoc.has(doc.docId)) continue;
    if (!doc.structureGraph) {
      throw new Error(`Canonical document graph missing for ${doc.docId}; ACT cannot rebuild structure.`);
    }
    const nodes = legacyNodesFromGraph(doc.structureGraph);
    t.structuralNodesByDoc.set(doc.docId, nodes);
    const countsByKind: Record<string, number> = {};
    const knownIds = new Set(nodes.map((n) => n.spanId));
    let orphanCount = 0;
    for (const n of nodes) {
      countsByKind[n.kind] = (countsByKind[n.kind] ?? 0) + 1;
    }
    emitComplianceEvent(state, "compliance.structure.summary", {
      documentId: doc.docId,
      totalNodes: nodes.length,
      countsByKind,
      orphanCount: 0, // will be re-emitted below if any surface
    });
    for (const n of nodes) {
      if (n.kind === "document") continue;
      const missingParent = n.parentSpanId && !knownIds.has(n.parentSpanId);
      if (missingParent) {
        orphanCount += 1;
        emitComplianceEvent(state, "compliance.structure.orphan", {
          documentId: doc.docId,
          spanId: n.spanId,
          kind: n.kind,
          structuralPath: n.structuralPath,
          reason: "missing_parent",
        });
        continue;
      }
      // Emit a node event only for the structural kinds a reviewer will care
      // about — paragraphs are numerous and captured in the summary.
      const KIND_TO_EMIT: StructuralNodeKind[] = [
        "appendix",
        "schedule",
        "section",
        "clause",
        "table",
        "table_row",
        "list",
        "definition",
        "heading",
      ];
      if (KIND_TO_EMIT.includes(n.kind)) {
        emitComplianceEvent(state, "compliance.structure.node", {
          documentId: doc.docId,
          spanId: n.spanId,
          kind: n.kind,
          structuralPath: n.structuralPath,
          parentSpanId: n.parentSpanId,
          order: n.order,
          contentHash: n.contentHash,
          childCount: nodes.filter((c) => c.parentSpanId === n.spanId).length,
          charRange: n.sourceOffsets,
          normalizedPreview: n.normalizedText.slice(0, 160),
          ...(n.definedTerm ? { definedTerm: n.definedTerm } : {}),
        });
      }
    }
    // Restate summary with the real orphan count now that we've walked nodes.
    if (orphanCount > 0) {
      emitComplianceEvent(state, "compliance.structure.summary", {
        documentId: doc.docId,
        totalNodes: nodes.length,
        countsByKind,
        orphanCount,
      });
    }
  }
}

/**
 * PHASE 1C — run the definition/reference index over cached structural nodes
 * and emit `compliance.definition.indexed`, `compliance.reference.detected`,
 * `compliance.reference.resolved`, and `compliance.reference.unresolved`.
 * Requires `recordStructuralNodes` to have run in the same tick.
 */
export function recordReferenceIndex(state: AnalysisState): void {
  const t = tracker(state);
  if (t.referenceIndexEmitted) return;
  t.referenceIndexEmitted = true;
  const allNodes: StructuralNode[] = [];
  for (const list of t.structuralNodesByDoc.values()) allNodes.push(...list);
  if (allNodes.length === 0) return;
  const index = referenceIndexForState(state, allNodes);
  for (const def of index.definitions) {
    emitComplianceEvent(state, "compliance.definition.indexed", {
      documentId: def.documentId,
      term: def.term,
      definitionSpanId: def.definitionSpanId,
    });
  }
  const seenPairs = new Set<string>();
  for (const ref of index.references) {
    const key = `${ref.sourceSpanId}|${ref.referenceKind}|${ref.referenceText.toLowerCase()}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    emitComplianceEvent(state, "compliance.reference.detected", {
      documentId: ref.documentId,
      sourceSpanId: ref.sourceSpanId,
      referenceText: ref.referenceText,
      referenceKind: ref.referenceKind,
    });
    emitOnResolution(state, ref);
  }
}

function emitOnResolution(state: AnalysisState, ref: ReferenceRecord): void {
  if (ref.state === "resolved_internal") {
    emitComplianceEvent(state, "compliance.reference.resolved", {
      documentId: ref.documentId,
      sourceSpanId: ref.sourceSpanId,
      referenceText: ref.referenceText,
      referenceKind: ref.referenceKind,
      targetSpanIds: ref.targetSpanIds,
    });
    return;
  }
  emitComplianceEvent(state, "compliance.reference.unresolved", {
    documentId: ref.documentId,
    sourceSpanId: ref.sourceSpanId,
    referenceText: ref.referenceText,
    referenceKind: ref.referenceKind,
    resolutionState: ref.state,
    candidateTargetSpanIds: ref.targetSpanIds,
    searchScope: "all_uploaded_documents",
  });
}

function detectTablesInText(text: string): DetectedTable[] {
  const tables: DetectedTable[] = [];
  const lines = text.split(/\n/);
  const lineOffsets: number[] = new Array(lines.length);
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    lineOffsets[i] = offset;
    offset += lines[i].length + 1;
  }
  let i = 0;
  let tIdx = 0;
  while (i < lines.length) {
    if (!lines[i].includes("\t")) {
      i += 1;
      continue;
    }
    const startCells = lines[i].split("\t").length;
    let j = i + 1;
    while (
      j < lines.length &&
      lines[j].includes("\t") &&
      lines[j].split("\t").length === startCells
    ) {
      j += 1;
    }
    const rowSpan = j - i;
    if (rowSpan >= 2) {
      const tableId = `T${tIdx + 1}`;
      const rows: DetectedTableRow[] = [];
      for (let r = i; r < j; r++) {
        const rowId = `${tableId}R${r - i + 1}`;
        const cells = lines[r].split("\t");
        const cellSpanIds = cells.map((_, c) => `${rowId}C${c + 1}`);
        const rowStart = lineOffsets[r];
        const rowEnd = rowStart + lines[r].length;
        rows.push({ rowId, cellSpanIds, charRange: [rowStart, rowEnd] });
      }
      tables.push({ tableId, rows });
      tIdx += 1;
    }
    i = j;
  }
  return tables;
}

/**
 * Compute reconciliation vs the planned set and emit
 * `compliance.requirement.lifecycle` per requirement +
 * `compliance.run.reconciliation` + `compliance.run.timing`. Idempotent per
 * session (multiple calls emit the same snapshot).
 */
export function finalizeComplianceRun(
  state: AnalysisState,
  args: {
    terminalRequirementIds?: string[];
    duplicateRequirementIds?: string[];
    totalMs?: number;
  } = {}
): void {
  const t = tracker(state);
  const terminal = new Set(args.terminalRequirementIds ?? []);
  const duplicate = args.duplicateRequirementIds ?? [];

  // Per-requirement lifecycle rows for every planned + observed requirement.
  const all = new Set<string>([
    ...t.plannedRequirementIds,
    ...t.lifecycle.keys(),
    ...terminal,
  ]);
  for (const requirementId of all) {
    const entry = t.lifecycle.get(requirementId) ?? {
      requirementId,
      retrieved: false,
      verified: false,
      assessed: false,
      rendered: false,
    };
    emitComplianceEvent(state, "compliance.requirement.lifecycle", {
      requirementId,
      retrieved: entry.retrieved,
      verified: entry.verified,
      assessed: entry.assessed,
      rendered: entry.rendered,
      terminal: terminal.has(requirementId),
    });
  }

  const missing = t.plannedRequirementIds.filter((id) => !terminal.has(id));
  emitComplianceEvent(state, "compliance.run.reconciliation", {
    planned: t.plannedRequirementIds.length,
    terminal: terminal.size,
    missingRequirementIds: missing,
    duplicateRequirementIds: duplicate,
  });

  const totalMs = args.totalMs ?? Date.now() - t.startedAtMs;
  emitComplianceEvent(state, "compliance.run.timing", {
    totalMs,
    stages: t.stageDurationsMs,
  });

  // Free the per-session tracker so long-running processes don't leak.
  RUNS.delete(sessionKey(state));
}

/**
 * PHASE 2A — walk the request↔native bindings threaded onto evaluate_package
 * work units and emit `compliance.requirement.resolved` for each unique
 * (inputId → canonicalKey) pair plus `compliance.requirement.conflict` when a
 * legacy alias resolves under a canonical whose article family disagrees with
 * the input's own article family. Idempotent per run.
 */
export function recordRequirementRegistry(state: AnalysisState): void {
  const t = tracker(state);
  if (t.requirementRegistryEmitted) return;
  t.requirementRegistryEmitted = true;
  const bindings = collectBindings(state);
  const seen = new Set<string>();
  for (const b of bindings) {
    const canonicalKey = canonicalRequirementId(b.nativeRequirementId);
    const inputKey = normalizeRequirementKey(b.nativeRequirementId);
    const dedupe = `${inputKey}::${canonicalKey}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const matchedBy: "canonical" | "alias" =
      inputKey === canonicalKey ? "canonical" : "alias";
    emitComplianceEvent(state, "compliance.requirement.resolved", {
      inputId: b.nativeRequirementId,
      canonicalKey,
      matchedBy,
      packageId: b.packageId,
      version: "1",
    });
    // Legally-inconsistent alias: the article numbers disagree.
    const inputArticle = articleNumberFromRequirementId(b.nativeRequirementId);
    const canonicalArticle = articleNumberFromRequirementId(canonicalKey);
    if (inputArticle && canonicalArticle && inputArticle !== canonicalArticle) {
      emitComplianceEvent(state, "compliance.requirement.conflict", {
        inputId: b.nativeRequirementId,
        canonicalKey,
        reason: "citation_content_conflict",
        detail: {
          inputArticle,
          canonicalArticle,
        },
      });
    }
  }
}

/**
 * PHASE 2B — for every user proposition (an `open.p*`-style
 * `IntentRequirement`) emit `compliance.request.resolve` with a `matched` /
 * `split_match` / `supplemental` / `ambiguous` / `unmatched` classification,
 * or `compliance.request.unresolved` when the classifier produced no binding.
 * Idempotent per run.
 */
export function recordRequestResolutions(state: AnalysisState): void {
  const t = tracker(state);
  if (t.requestResolutionEmitted) return;
  t.requestResolutionEmitted = true;
  const requests = state.intent?.requirements ?? [];
  if (requests.length === 0) return;
  const bindings = collectBindings(state);
  const byRequest = new Map<string, RequirementBinding[]>();
  for (const b of bindings) {
    const list = byRequest.get(b.requestRequirementId) ?? [];
    list.push(b);
    byRequest.set(b.requestRequirementId, list);
  }
  for (const req of requests) {
    const list = byRequest.get(req.id) ?? [];
    if (list.length === 0) {
      emitComplianceEvent(state, "compliance.request.unresolved", {
        requestId: req.id,
        reason: "no_catalog_match",
        priority: req.priority,
        requirementType: req.type,
      });
      continue;
    }
    const canonicalKeys = new Set(
      list.map((b) => canonicalRequirementId(b.nativeRequirementId))
    );
    const articles = new Set(
      list
        .map((b) => articleNumberFromRequirementId(b.nativeRequirementId))
        .filter((n): n is number => typeof n === "number")
    );
    const packages = new Set(list.map((b) => b.packageId));
    let resolution: "matched" | "split_match" | "supplemental" | "ambiguous";
    if (canonicalKeys.size === 1 && list.length === 1) {
      resolution = "matched";
    } else if (canonicalKeys.size >= 2 && (articles.size > 1 || packages.size > 1)) {
      resolution = "ambiguous";
    } else if (canonicalKeys.size >= 2) {
      resolution = "split_match";
    } else if (list.some((b) => b.source === "capability" || b.source === "semantic")) {
      resolution = "supplemental";
    } else {
      resolution = "matched";
    }
    emitComplianceEvent(state, "compliance.request.resolve", {
      requestId: req.id,
      resolution,
      priority: req.priority,
      requirementType: req.type,
      canonicalRequirementIds: [...canonicalKeys],
      nativeRequirementIds: [...new Set(list.map((b) => b.nativeRequirementId))],
      packageIds: [...packages],
      articles: [...articles],
      bindingSources: [...new Set(list.map((b) => b.source))],
    });
  }
}

/**
 * GENERAL-PURPOSE - collect atomic rule investigation profiles first. Legacy
 * package profiles and evaluate_package payloads remain compatibility
 * fallbacks for off-mode and persisted pre-rule-first plans.
 */
function requirementEvidenceProfiles(
  state: AnalysisState
): Map<string, RequirementEvidenceProfile> {
  const t = tracker(state);
  if (t.requirementProfiles) return t.requirementProfiles;
  const map = new Map<string, RequirementEvidenceProfile>();

  for (const skill of state.activeSkills ?? []) {
    for (const rule of skill.regimeRules ?? []) {
      if (!rule.investigation) continue;
      map.set(rule.ruleId, {
        hypothesis: rule.investigation.hypothesis,
        evidenceHints: rule.investigation.evidenceHints,
        proofStandard: rule.investigation.proofStandard,
      });
    }
  }

  const packagesById = new Map(
    (state.activeSkills ?? [])
      .flatMap((skill) => skill.evidencePackages ?? [])
      .map((pkg) => [pkg.id, pkg] as const)
  );
  for (const binding of collectBindings(state)) {
    const profile = packagesById.get(binding.packageId)?.requirementEvidence?.[
      binding.nativeRequirementId
    ];
    if (profile && !map.has(binding.nativeRequirementId)) {
      map.set(binding.nativeRequirementId, profile);
    }
  }

  // Compatibility with plans persisted before requirementBindings became
  // canonical at the plan level.
  const units = state.plan?.workUnits ?? [];
  for (const u of units) {
    if (u.tool !== "evaluate_package") continue;
    const requirementEvidence = u.input?.requirementEvidence as
      | Record<string, RequirementEvidenceProfile | undefined>
      | undefined;
    if (!requirementEvidence) continue;
    for (const [requirementId, profile] of Object.entries(requirementEvidence)) {
      if (profile && !map.has(requirementId)) map.set(requirementId, profile);
    }
  }
  t.requirementProfiles = map;
  return map;
}

/**
 * Single call site for schema resolution across every Phase 4-7 emitter —
 * tries the hand-authored registry first, then auto-derives from whatever
 * evidence profile the owning skill config authored for this requirement.
 */
function schemaForRequirement(
  state: AnalysisState,
  nativeRequirementId: string,
  canonicalKey: string
): RequirementElementSchema | undefined {
  const atomicRule = (state.activeSkills ?? [])
    .flatMap((skill) => skill.regimeRules ?? [])
    .find((rule) => rule.ruleId === nativeRequirementId);
  const schemaRequirementId = atomicRule?.legacyRequirementId ?? nativeRequirementId;
  const schemaCanonicalKey = atomicRule?.legacyRequirementId
    ? canonicalRequirementId(atomicRule.legacyRequirementId)
    : canonicalKey;
  const profile = requirementEvidenceProfiles(state).get(nativeRequirementId);
  return resolveElementSchema(schemaRequirementId, schemaCanonicalKey, profile);
}

function collectBindings(state: AnalysisState): RequirementBinding[] {
  const units = state.plan?.workUnits ?? [];
  const seen = new Set<string>();
  const out: RequirementBinding[] = [];
  const add = (binding: RequirementBinding) => {
    const key = `${binding.requestRequirementId}|${binding.nativeRequirementId}|${binding.packageId}|${binding.facetId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(binding);
  };

  if (complianceInvestigationMode() === "canonical") {
    for (const selection of state.plan?.complianceRequirementResolution?.selections ?? []) {
      add({
        requestRequirementId: selection.facetId,
        nativeRequirementId: selection.ruleId,
        packageId: `rule:${selection.skillId}`,
        relation: "direct",
        source: selection.source === "exact_citation" || selection.source === "article_range"
          ? "subprovision"
          : "semantic",
      });
    }
    return out;
  }

  for (const binding of state.plan?.requirementBindings ?? []) add(binding);

  // Compatibility with work units produced by the previous graph shape.
  for (const u of units) {
    const arr = u.input?.requestRequirementBindings as
      | RequirementBinding[]
      | undefined;
    if (!Array.isArray(arr)) continue;
    for (const b of arr) add(b);
  }
  return out;
}

/**
 * Resolve investigation work from the compact compliance work unit, PLAN's
 * explicit bindings, and the selected skills' evidence packages.
 */
export function resolvePhase3InvestigationTasks(state: AnalysisState): Phase3Input[] {
  const complianceUnits = (state.plan?.workUnits ?? []).filter(
    (unit) => unit.tool === "run_compliance_pipeline"
  );
  const packages = (state.activeSkills ?? []).flatMap(
    (skill) => skill.evidencePackages ?? []
  );
  const packagesById = new Map(packages.map((pkg) => [pkg.id, pkg] as const));
  const bindings = collectBindings(state);
  const tasks: Phase3Input[] = [];
  const seen = new Set<string>();

  for (const unit of complianceUnits) {
    const docId = String(unit.input?.docId ?? "");
    if (!docId) continue;
    const requirementIds = ((unit.input?.requirementIds as string[]) ??
      unit.requirementIds ?? []) as string[];
    const planned = new Set(requirementIds);
    const compatibleBindings = bindings.filter(
      (binding) =>
        planned.has(binding.nativeRequirementId) &&
        (binding.facetId === undefined || binding.facetId === unit.facetId)
    );

    const selected = compatibleBindings.length > 0
      ? compatibleBindings.map((binding) => ({
          requirementId: binding.nativeRequirementId,
          packageId: binding.packageId,
        }))
      : requirementIds.flatMap((requirementId) => {
          const owners = packages.filter((pkg) => pkg.requirementIds.includes(requirementId));
          return owners.length === 1
            ? [{ requirementId, packageId: owners[0].id }]
            : [];
        });

    for (const item of selected) {
      const pkg = packagesById.get(item.packageId);
      if (!pkg) continue;
      const key = `${docId}::${pkg.id}::${item.requirementId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tasks.push({
        packageId: pkg.id,
        docId,
        requirementId: item.requirementId,
        profile: pkg.requirementEvidence?.[item.requirementId],
        clauseTypes: pkg.clauseTypes,
        extractionTargets: pkg.extractionTargets,
      });
    }
  }

  return tasks;
}

/**
 * PHASE 3A/3B/3C — batched multi-query retrieval, deterministic structural
 * expansion, and evidence bundle with scope partitions. Side-channel only;
 * verification behaviour remains unchanged (§Phase 3A Stop gate).
 * Logging: one `compliance.bundle.created` per requirement (full bundle body).
 */
export function recordPhase3Investigation(state: AnalysisState): void {
  const t = tracker(state);
  if (t.phase3Emitted) return;
  t.phase3Emitted = true;
  const nodesByDoc = t.structuralNodesByDoc;
  if (nodesByDoc.size === 0) return;
  const references: ReferenceRecord[] = [];
  const allNodes: StructuralNode[] = [];
  for (const list of nodesByDoc.values()) allNodes.push(...list);
  const refIndex = allNodes.length > 0 ? referenceIndexForState(state, allNodes) : { references: [], definitions: [] };
  references.push(...refIndex.references);

  const tasks = resolvePhase3InvestigationTasks(state);
  if (tasks.length === 0) return;

  const results = computePhase3Investigate({
    state,
    requirements: tasks,
    structuralNodesByDoc: nodesByDoc,
    references,
    definitions: refIndex.definitions,
  });
  t.phase3Results = results;
  for (const task of tasks) {
    const ids = t.investigatedDocuments.get(task.requirementId) ?? new Set<string>();
    ids.add(task.docId);
    t.investigatedDocuments.set(task.requirementId, ids);
  }

  // One log line per requirement: the full Phase 3C bundle (no 3A/3B spam).
  for (const r of results) {
    const b = r.bundle;
    emitComplianceEvent(state, "compliance.bundle.created", {
      packageId: r.packageId,
      requirementId: r.requirementId,
      bundleId: b.bundleId,
      estimatedTokens: b.estimatedTokens,
      evidenceSpanIds: b.items.map((i) => i.spanId),
      items: b.items,
      partitions: b.partitions,
      exclusions: b.exclusions,
      dependencies: b.dependencies,
    });
  }

  // Archive only — do not overwrite latest.json here. latest.json is written
  // after the full investigation stage finishes (graph-native when enabled,
  // otherwise immediately below when that path is off).
  dumpComplianceBundles({
    sessionId: sessionKey(state),
    stage: "deterministic_lexical",
    results,
    updateLatest: false,
  });

  if (complianceInvestigationMode() === "off") {
    dumpComplianceBundles({
      sessionId: sessionKey(state),
      stage: "investigation_complete",
      results,
      updateLatest: true,
      meta: {
        investigationPath: "deterministic_lexical_only",
        note: "Graph-native investigation disabled; these are the final bundles for verify.",
      },
    });
  }
}

/**
 * Graph-native hybrid investigation. Requirements come only from PLAN's
 * bindings and selected skill evidence profiles. `shadow` records a diff;
 * `canonical` swaps the adapted bundle consumed by unchanged Phase 4+ code.
 */
export async function recordGraphNativeInvestigation(state: AnalysisState, supplied?: Awaited<ReturnType<typeof runGraphNativeInvestigation>>): Promise<void> {
  const mode = complianceInvestigationMode();
  if (mode === "off") return;
  const t = tracker(state);
  if (t.graphNativeInvestigationEmitted) return;
  t.graphNativeInvestigationEmitted = true;
  const log = (event: string, payload: Record<string, unknown>) => emitComplianceEvent(state, event, payload);
  const dumpFinalLexical = (reason: string) => {
    if (mode === "canonical") {
      dumpComplianceBundles({
        sessionId: sessionKey(state),
        stage: "investigation_incomplete",
        results: [],
        updateLatest: true,
        meta: {
          investigationPath: "graph_native",
          graphNativeMode: mode,
          reason,
          note: "Canonical graph-native investigation failed; legacy evidence was not substituted.",
        },
      });
      return;
    }
    dumpComplianceBundles({
      sessionId: sessionKey(state),
      stage: "investigation_complete",
      results: t.phase3Results,
      updateLatest: true,
      meta: {
        investigationPath: "deterministic_lexical_fallback",
        graphNativeMode: mode,
        reason,
        note: "Graph-native did not finish; latest.json is the lexical Phase 3 bundles.",
      },
    });
  };
  // Unit tests and resumed legacy ledgers may not carry the transient tenant
  // identity. Avoid surprise network/DB calls in shadow mode; canonical mode
  // still runs with an in-memory embedding fallback.
  if (!state.actorUserId && mode === "shadow") {
    log("compliance.investigation.shadow.skipped", { reason: "actor_user_id_unavailable" });
    dumpFinalLexical("actor_user_id_unavailable");
    return;
  }

  let result: Awaited<ReturnType<typeof runGraphNativeInvestigation>>;
  try {
    result = supplied ?? await runGraphNativeInvestigation(state, {
      userId: state.actorUserId,
      logger: log,
    });
  } catch (error) {
    log("compliance.investigation.incomplete", {
      reason: "pipeline_error",
      error: error instanceof Error ? error.message : String(error),
    });
    dumpFinalLexical("pipeline_error");
    return;
  }
  for (const issue of result.resolutionIssues) {
    log("compliance.investigation.incomplete", { ...issue });
  }

  /** Bundles after full investigation (graph-native adapted) — what latest.json should show. */
  const completedResults: Phase3PerRequirementResult[] = [];
  const covered = new Set<string>();

  for (const bundle of result.bundlesByRequirement.values()) {
    const requirementId = bundle.requirementId;
    const oldEntry = t.phase3Results.find((entry) =>
      entry.requirementId === requirementId &&
      (entry.bundle.items[0]?.scope.documentId === bundle.documentId || !entry.bundle.items.length)
    );
    const adapted = toPhase3Bundle(bundle);
    const queryTexts = [...new Set(bundle.candidateProvenance.flatMap((candidate) => candidate.matchedQueries))];
    const queryIdByText = new Map(queryTexts.map((text, index) => [text, `GNQ-${index + 1}`]));
    const graphNativeQueries = queryTexts.map((text, index) => ({
      queryId: `GNQ-${index + 1}`,
      requirementId,
      kind: "requirement" as const,
      text,
    }));
    const graphNativeHits = bundle.candidateProvenance.flatMap((candidate) => {
      const queryIds = candidate.matchedQueries
        .map((text) => queryIdByText.get(text))
        .filter((queryId): queryId is string => Boolean(queryId));
      return queryIds.map((queryId) => ({
        queryId,
        spanId: candidate.nodeId,
        ref: candidate.unitId,
        denseRank: candidate.channelRanks.dense ?? null,
        lexicalRank: candidate.channelRanks.sparse ?? candidate.channelRanks.exact ?? null,
        selectedBy: Object.keys(candidate.channelRanks),
        score: candidate.rerankScore,
        reviewDisposition: candidate.reviewDisposition,
        evidenceRole: candidate.reviewDecision?.role,
        contributesToElementIds: candidate.reviewDecision?.contributesToElementIds,
        reviewConfidence: candidate.reviewDecision?.confidence,
        reviewReason: candidate.reviewDecision?.reason,
        exclusionReason: candidate.exclusionReason,
      }));
    });
    const candidateElementIds = [...new Set(
      bundle.candidateProvenance
        .filter((candidate) =>
          candidate.reviewDisposition === "accepted" &&
          (candidate.reviewDecision?.role === "primary" || candidate.reviewDecision?.role === "supporting")
        )
        .flatMap((candidate) => candidate.reviewDecision?.contributesToElementIds ?? [])
    )];
    const budgetOmittedCandidateCount = bundle.candidateProvenance.filter(
      (candidate) => candidate.reviewDisposition === "role_budget" || candidate.reviewDisposition === "total_budget"
    ).length;
    const graphNativeExpansions = bundle.candidateProvenance
      .filter((candidate) => candidate.expansion && candidate.reviewDisposition === "accepted")
      .map((candidate) => ({
        requirementId,
        seedSpanId: candidate.expansion!.seedNodeId,
        addedSpanId: candidate.nodeId,
        reason: candidate.expansion!.reason,
      }));
    const oldEvidenceSpanIds = oldEntry?.bundle.items.map((item) => item.spanId) ?? [];
    const newEvidenceSpanIds = adapted.items.map((item) => item.spanId);
    const oldEvidenceSet = new Set(oldEvidenceSpanIds);
    const overlapCount = newEvidenceSpanIds.filter((id) => oldEvidenceSet.has(id)).length;
    log("compliance.investigation.compare", {
      mode,
      documentId: bundle.documentId,
      requirementId,
      oldEvidenceSpanIds,
      newEvidenceSpanIds,
      oldItemCount: oldEntry?.bundle.items.length ?? 0,
      newItemCount: adapted.items.length,
      overlapCount,
      overlapRatio: newEvidenceSpanIds.length > 0 ? overlapCount / newEvidenceSpanIds.length : 1,
      candidateCount: bundle.candidateCount,
      retrievalChannelCounts: bundle.retrievalChannelCounts,
      evidenceRoleCounts: bundle.passages.reduce<Record<string, number>>((counts, passage) => {
        counts[passage.role] = (counts[passage.role] ?? 0) + 1;
        return counts;
      }, {}),
      investigationComplete: bundle.investigationComplete,
      incompleteReasons: bundle.incompleteReasons,
      timings: result.timings,
    });

    const completedEntry: Phase3PerRequirementResult = {
      requirementId,
      packageId: bundle.packageId || oldEntry?.packageId || "",
      queries: graphNativeQueries,
      hits: graphNativeHits,
      recall: {
        requirementId,
        uniqueCandidateCount: bundle.candidateCount,
        elementsWithCandidates: candidateElementIds,
        elementsWithoutCandidates: bundle.unresolvedElementIds.filter((id) => !candidateElementIds.includes(id)),
        totalQueries: graphNativeQueries.length,
        proofElementsCovered: bundle.coveredElementIds,
        proofElementsUnresolved: bundle.unresolvedElementIds,
        acceptedCandidateCount: bundle.candidateProvenance.filter(
          (candidate) => candidate.reviewDisposition === "accepted"
        ).length,
        semanticRejectedCandidateCount: bundle.candidateProvenance.filter(
          (candidate) => candidate.reviewDisposition === "semantic_rejection"
        ).length,
        budgetOmittedCandidateCount,
        unclassifiedCandidateCount: bundle.candidateProvenance.filter(
          (candidate) => candidate.reviewDisposition === "not_classified"
        ).length,
      },
      expansions: graphNativeExpansions,
      expansionLimits: [],
      bundle: adapted,
      provenance: {
        queries: "graph_native",
        hits: "graph_native",
        expansions: "graph_native",
        bundle: "graph_native",
      },
    };
    completedResults.push(completedEntry);
    covered.add(requirementId);

    if (mode !== "canonical") continue;
    if (oldEntry) {
      oldEntry.bundle = adapted;
      continue;
    }
    t.phase3Results.push(completedEntry);
  }

  // Shadow comparison remains complete even when a rule-first profile is not
  // yet available. Canonical mode never inherits a lexical-only requirement.
  if (mode === "shadow") {
    for (const entry of t.phase3Results) {
      if (covered.has(entry.requirementId)) continue;
      completedResults.push(entry);
    }
  }

  dumpComplianceBundles({
    sessionId: sessionKey(state),
    stage: "investigation_complete",
    results: completedResults,
    updateLatest: true,
    meta: {
      investigationPath: "graph_native",
      diagnosticsVersion: "2",
      graphNativeMode: mode,
      swappedIntoVerify: mode === "canonical",
      note:
        mode === "canonical"
          ? "Graph-native bundles are canonical for verify; latest.json matches verify input."
          : "Shadow mode: latest.json shows completed graph-native bundles for inspection; verify still uses lexical Phase 3 bundles.",
    },
  });
}

/**
 * PHASE 4A — publish the versioned element-schema registry, once per run.
 * Emits one `compliance.element.registry` event per authored requirement
 * schema with its full element list (proposition, kind, proofGuidance,
 * nonProofTraps, applicabilityRule, remediationGuidance, version).
 */
export function recordElementRegistry(state: AnalysisState): void {
  const emitSchema = (schema: RequirementElementSchema) => {
    emitComplianceEvent(state, "compliance.element.registry", {
      requirementUid: schema.requirementUid,
      canonicalKey: schema.canonicalKey,
      aliases: schema.aliases ?? [],
      legalCitation: schema.legalCitation,
      title: schema.title,
      aggregationRule: schema.aggregationRule,
      version: schema.version,
      reviewStatus: schema.reviewStatus,
      elements: schema.elements.map((el) => ({
        elementId: el.elementId,
        proposition: el.proposition,
        kind: el.kind,
        proofGuidance: el.proofGuidance,
        nonProofTraps: el.nonProofTraps,
        applicabilityRule: el.applicabilityRule,
        remediationGuidance: el.remediationGuidance,
        version: el.version,
      })),
    });
  };

  for (const schema of AUTHORED_ELEMENT_REGISTRY) emitSchema(schema);

  // GENERAL-PURPOSE COVERAGE — publish an `auto_derived` registry entry for
  // every native requirement THIS RUN actually touches (from the plan's own
  // evaluate_package units) that has no hand-authored entry above but DOES
  // have an authored evidence profile (hypothesis/proofStandard/evidenceHints)
  // in its skill config. This is what makes Phase 4B/5/6/7 apply beyond
  // hand-authored Art 28 / DSR schemas — any regime's skill config that
  // authors requirementEvidence gets a schema here, with no hand-typed
  // registry entry required.
  const profiles = requirementEvidenceProfiles(state);
  const bindings = collectBindings(state);
  const seen = new Set<string>();
  for (const b of bindings) {
    if (seen.has(b.nativeRequirementId)) continue;
    seen.add(b.nativeRequirementId);
    const canonical = canonicalRequirementId(b.nativeRequirementId);
    const profile = profiles.get(b.nativeRequirementId);
    if (!profile) continue;
    const resolved = schemaForRequirement(state, b.nativeRequirementId, canonical);
    if (!resolved) continue;
    if (AUTHORED_ELEMENT_REGISTRY.some(
      (schema) =>
        schema.canonicalKey === resolved.canonicalKey ||
        schema.requirementUid === resolved.requirementUid ||
        schema.aliases?.includes(resolved.canonicalKey)
    )) continue;
    emitSchema(resolved);
  }
}

/**
 * PHASE 4B — run the deterministic bundle verifier over every Phase 3C
 * bundle whose requirement has an authored element schema. Emits
 * `compliance.verify.input`, one `compliance.verify.element` per element,
 * and `compliance.verify.completeness` per requirement. Live VERIFY is
 * unchanged unless the canonical LLM verifier is enabled.
 */
export function recordPhase4Verification(state: AnalysisState): void {
  const t = tracker(state);
  if (t.phase4Emitted) return;
  t.phase4Emitted = true;
  const bundlesByRequirement = new Map(
    t.phase3Results.map((r) => [r.requirementId, r] as const)
  );
  const bindings = collectBindings(state);
  const canonicalByRequest = new Map<string, string>();
  for (const b of bindings) {
    const canonical = canonicalRequirementId(b.nativeRequirementId);
    canonicalByRequest.set(b.nativeRequirementId, canonical);
  }
  const matrices: RequirementMatrix[] = [];
  for (const [requirementId, phase3] of bundlesByRequirement) {
    const canonical = canonicalByRequest.get(requirementId) ?? canonicalRequirementId(requirementId);
    const schema = schemaForRequirement(state, requirementId, canonical);
    if (!schema) continue;
    const matrix = verifyRequirement({
      requirementId,
      bundle: phase3.bundle,
      schema,
    });
    matrices.push(matrix);
    emitComplianceEvent(state, "compliance.verify.input", {
      requirementId,
      canonicalKey: canonical,
      schemaCanonicalKey: schema.canonicalKey,
      matchedVia:
        canonical === schema.canonicalKey
          ? "canonicalKey"
          : schema.aliases?.includes(canonical)
            ? "alias"
            : "loose",
      bundleId: matrix.bundleId,
      schemaVersion: matrix.schemaVersion,
      reviewStatus: matrix.reviewStatus,
      elementIds: matrix.expectedElementIds,
      evidenceSpanIds: phase3.bundle.items.map((i) => i.spanId),
      estimatedTokens: matrix.estimatedTokens,
    });
    for (const el of matrix.elements) {
      emitComplianceEvent(state, "compliance.verify.element", {
        requirementId,
        bundleId: matrix.bundleId,
        elementId: el.elementId,
        state: el.state,
        evidenceSpanIds: el.evidenceSpanIds,
        quotes: el.quotes,
        quoteVerified: el.quotes.every((q) => q.quoteVerified),
        scope: el.scope,
        establishedFact: el.establishedFact,
        gapDescription: el.gapDescription,
        contribution: el.contribution,
      });
    }
    emitComplianceEvent(state, "compliance.verify.completeness", {
      requirementId,
      bundleId: matrix.bundleId,
      schemaVersion: matrix.schemaVersion,
      expectedElementIds: matrix.expectedElementIds,
      returnedElementIds: matrix.returnedElementIds,
      missingElementIds: matrix.missingElementIds,
    });
  }
  t.phase4Matrices = matrices;
}

/**
 * PHASE 5A + 5B — deterministic status calculation over the Phase 4B matrix,
 * plus factual explanation assembly. Live rendering / assessment are untouched
 * (§Phase 5A Stop gate). Emits `compliance.assess.input`, `.assess.result`,
 * and `.explain.draft` per requirement with an authored element schema.
 */
export function recordPhase5Assessment(state: AnalysisState): void {
  const t = tracker(state);
  if (t.phase5Emitted) return;
  t.phase5Emitted = true;
  const matrices = t.phase4Matrices;
  if (matrices.length === 0) return;
  const bundlesByRequirement = new Map(
    t.phase3Results.map((r) => [r.requirementId, r] as const)
  );
  const bindings = collectBindings(state);
  const canonicalByRequest = new Map<string, string>();
  for (const b of bindings) {
    canonicalByRequest.set(
      b.nativeRequirementId,
      canonicalRequirementId(b.nativeRequirementId)
    );
  }
  const assessments: AssessmentResult[] = [];
  const explanations: ExplanationDraft[] = [];
  for (const matrix of matrices) {
    const canonical =
      canonicalByRequest.get(matrix.requirementId) ??
      canonicalRequirementId(matrix.requirementId);
    const schema = schemaForRequirement(state, matrix.requirementId, canonical);
    if (!schema) continue;
    const bundle = bundlesByRequirement.get(matrix.requirementId)?.bundle;
    const unresolvedDeps = bundle
      ? bundle.dependencies.filter((d) => d.state !== "resolved_internal").length
      : 0;
    const investigationComplete = bundle
      ? bundle.investigationComplete ?? bundle.exclusions.every((x) => x.reason !== "budget")
      : true;

    emitComplianceEvent(state, "compliance.assess.input", {
      requirementId: matrix.requirementId,
      canonicalKey: canonical,
      schemaVersion: matrix.schemaVersion,
      aggregationRule: schema.aggregationRule,
      elementStates: Object.fromEntries(
        matrix.elements.map((e) => [e.elementId, e.state])
      ),
      completeness: {
        verificationComplete: matrix.missingElementIds.length === 0,
        investigationComplete,
        missingElementIds: matrix.missingElementIds,
        unresolvedDependencyCount: unresolvedDeps,
      },
    });

    const assessment = assessRequirement({
      requirementId: matrix.requirementId,
      schema,
      matrix,
      investigationComplete,
      unresolvedDependencyCount: unresolvedDeps,
    });
    assessments.push(assessment);

    emitComplianceEvent(state, "compliance.assess.result", {
      requirementId: assessment.requirementId,
      canonicalKey: canonical,
      status: assessment.status,
      reasonCodes: assessment.reasonCodes,
      ruleVersion: assessment.ruleVersion,
      elementStates: assessment.elementStates,
      completeness: assessment.completeness,
    });

    const explanation = draftExplanation(assessment, matrix, schema);
    explanations.push(explanation);

    emitComplianceEvent(state, "compliance.explain.draft", {
      requirementId: explanation.requirementId,
      status: explanation.status,
      supportedElementIds: explanation.supportedElementIds,
      missingElementIds: explanation.missingElementIds,
      evidenceSpanIds: explanation.evidenceSpanIds,
      elementReferences: explanation.elementReferences,
      whatTheDocumentProvides: explanation.whatTheDocumentProvides,
      whatIsMissingOrUnclear: explanation.whatIsMissingOrUnclear,
      whyItMatters: explanation.whyItMatters,
      conclusion: explanation.conclusion,
      recommendedAction: explanation.recommendedAction,
      ruleVersion: explanation.ruleVersion,
    });
  }
  t.phase5Assessments = assessments;
  t.phase5Explanations = explanations;
}

/**
 * Bounded LLM-assisted retrieval fallback. Runs AFTER Phase 4B for each
 * requirement whose initial matrix hits a trigger condition
 * (not_located / ambiguous / unresolved_dependency element, or a would-be
 * Partial / Gap status, or unresolved bundle dependencies). This augments the
 * canonical evidence bundle before the final LLM verification pass.
 *
 * Emits one `compliance.fallback.round` per attempted round with the focused
 * fields spec'd by the plan, and one `compliance.fallback.outcome` per
 * requirement summarising the before-vs-after.
 */
export async function recordRetrievalFallback(state: AnalysisState): Promise<void> {
  const t = tracker(state);
  if (t.fallbackEmitted) return;
  t.fallbackEmitted = true;
  const matrices = t.phase4Matrices;
  if (matrices.length === 0) return;

  const nodesByDoc = t.structuralNodesByDoc;
  const allNodes: StructuralNode[] = [];
  for (const list of nodesByDoc.values()) allNodes.push(...list);
  const refIndex = allNodes.length > 0
    ? referenceIndexForState(state, allNodes)
    : { references: [] as ReferenceRecord[], definitions: [] };

  const bundlesByRequirement = new Map(
    t.phase3Results.map((r) => [r.requirementId, r] as const)
  );
  const bindings = collectBindings(state);
  const canonicalByRequest = new Map<string, string>();
  for (const b of bindings) {
    canonicalByRequest.set(
      b.nativeRequirementId,
      canonicalRequirementId(b.nativeRequirementId)
    );
  }

  // PHASE 8 — bounded concurrency + a wall-clock stage budget. Requirements
  // that don't fit the budget are explicitly skipped (not attempted with a
  // shortened timeout), so a skip is always visible as `budget_exceeded`
  // rather than silently degrading a result.
  const runnableMatrices = matrices.filter((matrix) => {
    const canonical =
      canonicalByRequest.get(matrix.requirementId) ??
      canonicalRequirementId(matrix.requirementId);
    return (
      Boolean(schemaForRequirement(state, matrix.requirementId, canonical)) &&
      bundlesByRequirement.has(matrix.requirementId)
    );
  });

  const outcomes = await runBoundedWithBudget(
    runnableMatrices,
    SIDE_CHANNEL_CONCURRENCY,
    SIDE_CHANNEL_STAGE_BUDGET_MS,
    async (matrix): Promise<FallbackOutcome> => {
      const canonical =
        canonicalByRequest.get(matrix.requirementId) ??
        canonicalRequirementId(matrix.requirementId);
      const schema = schemaForRequirement(state, matrix.requirementId, canonical)!;
      const phase3 = bundlesByRequirement.get(matrix.requirementId)!;
      const docId = phase3.bundle.items[0]?.scope.documentId;
      const doc = docId ? state.workspace?.documents.find((d) => d.docId === docId) : undefined;
      if (!docId || !doc) {
        return skippedFallbackOutcome(matrix, phase3.bundle, "no_document");
      }
      const sectionIndex = buildSectionCandidates(doc);
      const nodes = nodesByDoc.get(docId) ?? [];
      try {
        return await runFallbackForRequirement({
          state,
          requirementId: matrix.requirementId,
          schema,
          initialBundle: phase3.bundle,
          initialMatrix: matrix,
          docId,
          sectionIndex,
          structuralNodes: nodes,
          references: refIndex.references,
          definitions: refIndex.definitions,
        });
      } catch (err) {
        // Failure should never silently promote a not_located to a Gap —
        // record the error and carry the initial matrix forward unchanged.
        return skippedFallbackOutcome(
          matrix,
          phase3.bundle,
          `error:${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    (matrix) =>
      skippedFallbackOutcome(
        matrix,
        bundlesByRequirement.get(matrix.requirementId)!.bundle,
        "budget_exceeded"
      )
  );

  for (const outcome of outcomes) {
    // Merge fallback-expanded evidence back into the live bundle by
    // evidence-IDENTITY (added/removed/replaced spans), not item count — a
    // retry round that swaps one wrong candidate for one correct one at the
    // same count must still be picked up. Unconditional (not gated behind
    // LLM_VERIFY_CANONICAL): this is a strict evidence-completeness fix that
    // benefits the deterministic path too, and `recordLlmBundleVerification`
    // (which runs after this stage) reads `t.phase3Results[].bundle` at call
    // time, so it needs no changes to see the merged evidence.
    const initialIds = new Set(outcome.initialBundleEvidenceIds);
    const finalIds = new Set(outcome.finalBundleEvidenceIds);
    const bundleChanged =
      initialIds.size !== finalIds.size ||
      [...finalIds].some((id) => !initialIds.has(id));
    if (bundleChanged) {
      const phase3Entry = bundlesByRequirement.get(outcome.requirementId);
      if (phase3Entry) {
        phase3Entry.bundle = outcome.finalBundle;
      }
      // Refresh the deterministic verdict against the same evidence the
      // fallback round actually judged, so `t.phase4Matrices` and
      // `compliance.verify.compare` never reference a stale pre-retry
      // snapshot. Cheap — no LLM call.
      const matrixEntry = t.phase4Matrices.find(
        (m) => m.requirementId === outcome.requirementId
      );
      if (matrixEntry) {
        const canonical =
          canonicalByRequest.get(outcome.requirementId) ??
          canonicalRequirementId(outcome.requirementId);
        const schema = schemaForRequirement(state, outcome.requirementId, canonical);
        if (schema) {
          const refreshed = verifyRequirement({
            requirementId: outcome.requirementId,
            bundle: outcome.finalBundle,
            schema,
          });
          matrixEntry.elements = refreshed.elements;
          matrixEntry.returnedElementIds = refreshed.returnedElementIds;
          matrixEntry.missingElementIds = refreshed.missingElementIds;
          matrixEntry.estimatedTokens = refreshed.estimatedTokens;
        }
      }
    }
    for (const round of outcome.rounds) {
      emitComplianceEvent(state, "compliance.fallback.round", {
        requirementId: outcome.requirementId,
        round: round.round,
        triggeredBy: round.triggeredBy,
        targetElementIds: round.targetElementIds,
        generatedQueries: round.generatedQueries,
        retrievedCandidateIds: round.retrievedCandidateIds,
        acceptedCandidateIds: round.acceptedCandidateIds,
        rejectedCandidates: round.rejectedCandidates,
        rebuiltBundleEvidenceIds: round.rebuiltBundleEvidenceIds,
        verificationResult: round.verificationResult,
        llmCallOk: round.llmCallOk,
        llmError: round.llmError,
      });
    }
    emitComplianceEvent(state, "compliance.fallback.outcome", {
      requirementId: outcome.requirementId,
      triggered: outcome.triggered,
      triggerReasons: outcome.triggerReasons,
      missingElementIds: outcome.missingElementIdsAtStart,
      initialBundleEvidenceIds: outcome.initialBundleEvidenceIds,
      firstVerificationResult: Object.fromEntries(
        outcome.initialMatrix.elements.map((e) => [e.elementId, e.state])
      ),
      secondVerificationResult: Object.fromEntries(
        outcome.finalMatrix.elements.map((e) => [e.elementId, e.state])
      ),
      rebuiltBundleEvidenceIds: outcome.finalBundleEvidenceIds,
      retrievalComplete: outcome.retrievalComplete,
      unresolvedReferences: outcome.unresolvedReferences,
      investigationIncomplete: outcome.investigationIncomplete,
      roundsRun: outcome.rounds.length,
    });
  }
  t.fallbackOutcomes = outcomes;
}

/** PHASE 8 — the explicit "skipped, not attempted" outcome for a requirement
 * that either has no document to search or blew the stage's time budget.
 * The matrix carried forward is the ORIGINAL Phase 4B matrix — a skip never
 * degrades or promotes a result, it just means the fallback never ran. */
function skippedFallbackOutcome(
  matrix: RequirementMatrix,
  bundle: Phase3Bundle,
  reason: string
): FallbackOutcome {
  const evidenceIds = bundle.items.map((i) => i.spanId);
  return {
    requirementId: matrix.requirementId,
    triggered: false,
    triggerReasons: [reason],
    missingElementIdsAtStart: matrix.elements
      .filter((e) => e.state === "not_located")
      .map((e) => e.elementId),
    initialBundleEvidenceIds: evidenceIds,
    rounds: [],
    finalBundleEvidenceIds: evidenceIds,
    initialMatrix: matrix,
    finalMatrix: matrix,
    finalBundle: bundle,
    retrievalComplete: reason !== "budget_exceeded",
    unresolvedReferences: bundle.dependencies
      .filter((d) => d.state !== "resolved_internal")
      .map((d) => d.reference),
    investigationIncomplete: reason === "budget_exceeded",
  };
}

/**
 * LLM-backed bundle verifier (additive to deterministic Phase 4B).
 *
 * Runs one LLM call per requirement that has an authored element schema and
 * a Phase 3C bundle. Emits per-element + per-completeness events under a
 * `.llm` suffix so a reviewer can diff LLM verdicts against deterministic
 * verdicts on the same bundle. Live retrieval / VERIFY / rendering unchanged.
 */
export async function recordLlmBundleVerification(state: AnalysisState): Promise<void> {
  const t = tracker(state);
  if (t.llmVerifyEmitted) return;
  t.llmVerifyEmitted = true;
  const bundlesByRequirement = new Map(
    t.phase3Results.map((r) => [r.requirementId, r] as const)
  );
  if (bundlesByRequirement.size === 0) return;
  const bindings = collectBindings(state);
  const canonicalByRequest = new Map<string, string>();
  for (const b of bindings) {
    canonicalByRequest.set(
      b.nativeRequirementId,
      canonicalRequirementId(b.nativeRequirementId)
    );
  }
  const detByReq = new Map(
    t.phase4Matrices.map((m) => [m.requirementId, m] as const)
  );

  // PHASE 8 — same bounded-concurrency + wall-clock budget as the retrieval
  // fallback stage. A requirement that doesn't fit the budget is recorded as
  // an explicit skip (llmCallOk:false, llmError:"budget_exceeded"), never
  // attempted with a truncated timeout.
  const runnableEntries = [...bundlesByRequirement.entries()].filter(
    ([requirementId]) => {
      const canonical =
        canonicalByRequest.get(requirementId) ?? canonicalRequirementId(requirementId);
      return Boolean(schemaForRequirement(state, requirementId, canonical));
    }
  );

  const buildFailureOutcome = (
    requirementId: string,
    schema: RequirementElementSchema,
    bundle: Phase3PerRequirementResult["bundle"],
    reason: string
  ): LlmVerifyOutcome => ({
    matrix: {
      requirementId,
      bundleId: bundle.bundleId,
      schemaVersion: schema.version,
      reviewStatus: schema.reviewStatus,
      elements: schema.elements.map((el) => ({
        elementId: el.elementId,
        state: "not_located" as const,
        evidenceSpanIds: [],
        quotes: [],
        scope: {},
        establishedFact: "",
        gapDescription: reason,
        contribution: "individual" as const,
      })),
      expectedElementIds: schema.elements.map((e) => e.elementId),
      returnedElementIds: [],
      missingElementIds: schema.elements.map((e) => e.elementId),
      estimatedTokens: bundle.estimatedTokens,
    },
    llmCallOk: false,
    llmError: reason,
    repairAttempted: false,
    validationErrors: [],
    matrixValidated: false,
  });

  const results = await runBoundedWithBudget(
    runnableEntries,
    SIDE_CHANNEL_CONCURRENCY,
    SIDE_CHANNEL_STAGE_BUDGET_MS,
    async ([requirementId, phase3]): Promise<{ requirementId: string; outcome: LlmVerifyOutcome }> => {
      const canonical =
        canonicalByRequest.get(requirementId) ?? canonicalRequirementId(requirementId);
      const schema = schemaForRequirement(state, requirementId, canonical)!;
      try {
        const outcome = await verifyRequirementWithLlm({
          state,
          requirementId,
          schema,
          bundle: phase3.bundle,
        });
        return { requirementId, outcome };
      } catch (err) {
        return {
          requirementId,
          outcome: buildFailureOutcome(
            requirementId,
            schema,
            phase3.bundle,
            `error:${err instanceof Error ? err.message : String(err)}`
          ),
        };
      }
    },
    ([requirementId, phase3]) => {
      const canonical =
        canonicalByRequest.get(requirementId) ?? canonicalRequirementId(requirementId);
      const schema = schemaForRequirement(state, requirementId, canonical)!;
      return {
        requirementId,
        outcome: buildFailureOutcome(requirementId, schema, phase3.bundle, "budget_exceeded"),
      };
    }
  );

  const outcomes: LlmVerifyOutcome[] = [];
  for (const { requirementId, outcome } of results) {
    outcomes.push(outcome);

    for (const el of outcome.matrix.elements) {
      emitComplianceEvent(state, "compliance.verify.llm.element", {
        requirementId,
        bundleId: outcome.matrix.bundleId,
        elementId: el.elementId,
        state: el.state,
        evidenceSpanIds: el.evidenceSpanIds,
        quotes: el.quotes,
        quoteVerified: el.quotes.every((q) => q.quoteVerified),
        scope: el.scope,
        establishedFact: el.establishedFact,
        gapDescription: el.gapDescription,
      });
    }
    emitComplianceEvent(state, "compliance.verify.llm.completeness", {
      requirementId,
      bundleId: outcome.matrix.bundleId,
      schemaVersion: outcome.matrix.schemaVersion,
      expectedElementIds: outcome.matrix.expectedElementIds,
      returnedElementIds: outcome.matrix.returnedElementIds,
      missingElementIds: outcome.matrix.missingElementIds,
      llmCallOk: outcome.llmCallOk,
      llmError: outcome.llmError,
      repairAttempted: outcome.repairAttempted,
      validationErrors: outcome.validationErrors,
    });

    const det = detByReq.get(requirementId);
    if (det) {
      const detStates = Object.fromEntries(
        det.elements.map((e) => [e.elementId, e.state])
      );
      const llmStates = Object.fromEntries(
        outcome.matrix.elements.map((e) => [e.elementId, e.state])
      );
      const diffs = Object.keys(detStates)
        .filter((k) => detStates[k] !== llmStates[k])
        .map((k) => ({ elementId: k, deterministic: detStates[k], llm: llmStates[k] }));
      emitComplianceEvent(state, "compliance.verify.compare", {
        requirementId,
        bundleId: outcome.matrix.bundleId,
        deterministic: detStates,
        llm: llmStates,
        diffs,
        agreementCount: Object.keys(detStates).length - diffs.length,
      });
    }
  }
  t.llmVerifyOutcomes = outcomes;
}

/**
 * PHASE 5.5 — make LLM verifier judgment canonical over the deterministic
 * keyword-gated matrix, requirement by requirement, when `LLM_VERIFY_CANONICAL`
 * is on. No-op (deterministic matrices in `t.phase4Matrices` stand as-is) when
 * the flag is off.
 *
 * For each requirement:
 *  - LLM outcome validated cleanly (`llmCallOk && validationErrors.length === 0`)
 *    → adopt the LLM matrix's elements/returnedElementIds/missingElementIds/
 *    estimatedTokens in place. `requirementId`/`bundleId`/`schemaVersion`/
 *    `reviewStatus` are left untouched (identity fields, not judgment output).
 *  - Otherwise (no outcome, call failed, or validation failed) → the
 *    deterministic verdict is NOT trusted for ANY element state, not just
 *    `supported`/`contradicted`. `not_located`/`ambiguous` can become a
 *    confident `gap` in Phase 5, and `not_applicable` is itself a keyword
 *    heuristic — so the whole requirement is marked incomplete
 *    (`missingElementIds` = every expected element id), which makes
 *    `assessRequirement` return `verification_incomplete` rather than a
 *    false `present`/`gap`/`conflicting`. The deterministic states remain on
 *    `matrix.elements` for audit visibility only — never treated as the
 *    answer.
 */
export function recordLlmVerifyCanonicalSwap(state: AnalysisState): void {
  if (!llmVerifyCanonicalEnabled()) return;
  const t = tracker(state);
  if (t.llmVerifyCanonicalSwapEmitted) return;
  t.llmVerifyCanonicalSwapEmitted = true;

  const bindings = collectBindings(state);
  const canonicalByRequest = new Map<string, string>();
  for (const b of bindings) {
    canonicalByRequest.set(
      b.nativeRequirementId,
      canonicalRequirementId(b.nativeRequirementId)
    );
  }
  const llmByReq = new Map(
    t.llmVerifyOutcomes.map((o) => [o.matrix.requirementId, o] as const)
  );

  for (const matrix of t.phase4Matrices) {
    const canonical =
      canonicalByRequest.get(matrix.requirementId) ??
      canonicalRequirementId(matrix.requirementId);
    const schema = schemaForRequirement(state, matrix.requirementId, canonical);
    const outcome = llmByReq.get(matrix.requirementId);

    let source: "llm" | "deterministic_fallback";
    let reason:
      | "llm_validated"
      | "llm_not_applicable_no_outcome"
      | "llm_call_failed"
      | "llm_validation_failed";
    if (!outcome) {
      source = "deterministic_fallback";
      reason = "llm_not_applicable_no_outcome";
    } else if (!outcome.llmCallOk) {
      source = "deterministic_fallback";
      reason = "llm_call_failed";
    } else if (!outcome.matrixValidated) {
      // Both the first attempt AND the one bounded repair failed validation —
      // NOT the same as "validationErrors.length > 0", which also fires when
      // a repair fixed everything (validationErrors then holds the FIRST
      // attempt's now-stale errors purely for diagnostics; matrixValidated is
      // the actual trust signal — see LlmVerifyOutcome).
      source = "deterministic_fallback";
      reason = "llm_validation_failed";
    } else {
      source = "llm";
      reason = "llm_validated";
    }

    const deterministicStates = Object.fromEntries(
      matrix.elements.map((e) => [e.elementId, e.state])
    );

    if (source === "llm" && outcome) {
      matrix.elements = outcome.matrix.elements;
      matrix.returnedElementIds = outcome.matrix.returnedElementIds;
      matrix.missingElementIds = outcome.matrix.missingElementIds;
      matrix.estimatedTokens = outcome.matrix.estimatedTokens;
    } else {
      matrix.missingElementIds = matrix.expectedElementIds.slice();
      const note = `Keyword match only — AI verification was unavailable this run (${reason}); no individual element's state (supported, contradicted, not_located, or not_applicable) can be trusted without it. Needs manual review.`;
      matrix.elements = matrix.elements.map((e) => ({
        ...e,
        gapDescription: e.gapDescription ? `${e.gapDescription} ${note}` : note,
      }));
    }

    emitComplianceEvent(state, "compliance.verify.canonical", {
      requirementId: matrix.requirementId,
      canonicalKey: canonical,
      schemaCanonicalKey: schema?.canonicalKey,
      reviewStatus: schema?.reviewStatus,
      source,
      reason,
      llmCallOk: outcome ? outcome.llmCallOk : null,
      validationErrorCount: outcome ? outcome.validationErrors.length : null,
      repairAttempted: outcome ? outcome.repairAttempted : null,
      deterministicStates,
      finalStates: Object.fromEntries(matrix.elements.map((e) => [e.elementId, e.state])),
    });
  }
}

/**
 * PHASE 6 — lock validation.
 *
 * Runs the 12 gates on every requirement whose Phase 5 pipeline produced
 * both an assessment and an explanation. Emits per-attempt + per-accept/reject
 * events plus a run-level summary. Rejected assessments are NOT promoted to
 * legal statuses — they remain visible with reason codes so a reviewer can
 * fix the underlying defect. Nothing consumes this yet (Phase 7 will).
 */
export function recordLockValidation(state: AnalysisState): void {
  const t = tracker(state);
  if (t.lockEmitted) return;
  t.lockEmitted = true;
  const assessments = t.phase5Assessments;
  if (assessments.length === 0) return;
  const explByReq = new Map(t.phase5Explanations.map((e) => [e.requirementId, e] as const));
  const matrixByReq = new Map(t.phase4Matrices.map((m) => [m.requirementId, m] as const));
  const bundlesByRequirement = new Map(
    t.phase3Results.map((r) => [r.requirementId, r] as const)
  );
  const bindings = collectBindings(state);
  const canonicalByRequest = new Map<string, string>();
  for (const b of bindings) {
    canonicalByRequest.set(
      b.nativeRequirementId,
      canonicalRequirementId(b.nativeRequirementId)
    );
  }

  const canonicalPairs = assessments.map((a) => ({
    canonicalKey:
      canonicalByRequest.get(a.requirementId) ??
      canonicalRequirementId(a.requirementId),
  }));
  const duplicates = duplicateCanonicalKeys(canonicalPairs);

  const documentIds = state.request?.documentIds ?? [];
  const decisions: LockDecision[] = [];
  const accepted: string[] = [];
  const rejected: string[] = [];

  for (const assessment of assessments) {
    const canonical =
      canonicalByRequest.get(assessment.requirementId) ??
      canonicalRequirementId(assessment.requirementId);
    const schema = schemaForRequirement(state, assessment.requirementId, canonical);
    const matrix = matrixByReq.get(assessment.requirementId);
    const bundle = bundlesByRequirement.get(assessment.requirementId)?.bundle;
    const explanation = explByReq.get(assessment.requirementId);
    if (!schema || !matrix || !bundle || !explanation) continue;

    const decision = lockAssessment({
      state,
      requirementId: assessment.requirementId,
      canonicalKey: canonical,
      schema,
      matrix,
      bundle,
      assessment,
      explanation,
      documentIds,
      duplicateCanonicalKeys: duplicates,
    });
    decisions.push(decision);
    t.lockDecisionsByRequirement.set(assessment.requirementId, decision);

    emitComplianceEvent(state, "compliance.lock.attempt", {
      requirementId: assessment.requirementId,
      canonicalKey: canonical,
      assessmentHash: decision.assessmentHash,
    });
    if (decision.kind === "accepted") {
      accepted.push(assessment.requirementId);
      emitComplianceEvent(state, "compliance.lock.accepted", {
        requirementId: assessment.requirementId,
        canonicalKey: decision.canonicalKey,
        lockedAssessmentId: decision.lockedAssessmentId,
        assessmentHash: decision.assessmentHash,
        documentHash: decision.documentHash,
        ruleVersion: decision.ruleVersion,
        status: decision.status,
      });
    } else {
      rejected.push(assessment.requirementId);
      emitComplianceEvent(state, "compliance.lock.rejected", {
        requirementId: assessment.requirementId,
        canonicalKey: canonical,
        assessmentHash: decision.assessmentHash,
        reasonCodes: decision.reasonCodes,
        details: decision.details,
      });
    }
  }

  // Reconciliation summary — every planned assessment must reach a lock
  // attempt; anything missing surfaces here.
  const attempted = new Set(assessments.map((a) => a.requirementId));
  const plannedButNotAttempted = t.plannedRequirementIds.filter(
    (id) => !attempted.has(id)
  );
  emitComplianceEvent(state, "compliance.lock.summary", {
    attempted: assessments.length,
    accepted: accepted.length,
    rejected: rejected.length,
    duplicateCanonicalKeys: [...duplicates],
    plannedButNotAttempted,
  });

  t.lockDecisions = decisions;
}

/**
 * PHASE 7 — authoritative locked-result projection.
 *
 * Projects Phase 6 accepted LockedAssessments into the requirement matrix
 * rows + a bottom-line synthesis. Every row is anchored to a
 * `lockedAssessmentId`; unmatched user propositions are surfaced in a
 * separate section. This projection is then converted into the immutable
 * compliance-report snapshot consumed by the reporting capability.
 */
export function recordPhase7Render(state: AnalysisState): void {
  const t = tracker(state);
  if (t.renderEmitted) return;
  t.renderEmitted = true;
  const decisions = t.lockDecisions;

  const bundlesByRequirement = new Map(
    t.phase3Results.map((r) => [r.requirementId, r] as const)
  );
  const matrixByReq = new Map(
    t.phase4Matrices.map((m) => [m.requirementId, m] as const)
  );
  const explByReq = new Map(
    t.phase5Explanations.map((e) => [e.requirementId, e] as const)
  );
  const assessByReq = new Map(
    t.phase5Assessments.map((a) => [a.requirementId, a] as const)
  );

  interface AcceptedRow {
    requirementId: string;
    canonicalKey: string;
    lockedAssessmentId: string;
    documentHash: string;
    ruleVersion: string;
  }
  // Rebuild the accepted set from the emitted events isn't reliable — decisions
  // carry the same info as the emitted `compliance.lock.accepted`. Walk them.
  const acceptedRows: AcceptedRow[] = [];
  // Reconstruct requirementId from the parallel decisions/assessments arrays:
  // `recordLockValidation` iterates assessments in order and pushes decisions
  // in the same order, so index correspondence holds.
  const assessments = t.phase5Assessments;
  for (const a of assessments) {
    const d = t.lockDecisionsByRequirement.get(a.requirementId);
    if (!d) continue;
    if (d.kind !== "accepted") continue;
    acceptedRows.push({
      requirementId: a.requirementId,
      canonicalKey: d.canonicalKey,
      lockedAssessmentId: d.lockedAssessmentId,
      documentHash: d.documentHash,
      ruleVersion: d.ruleVersion,
    });
  }

  const input = {
    accepted: acceptedRows.flatMap((row) => {
      const assessment = assessByReq.get(row.requirementId);
      const explanation = explByReq.get(row.requirementId);
      const matrix = matrixByReq.get(row.requirementId);
      const bundle = bundlesByRequirement.get(row.requirementId)?.bundle;
      const schema = schemaForRequirement(state, row.requirementId, row.canonicalKey);
      if (!assessment || !explanation || !matrix || !bundle || !schema) return [];
      return [{ ...row, assessment, explanation, matrix, bundle, schema }];
    }),
    supplementalRequests: collectSupplementalRequests(state),
  };
  const report = renderLockedOnly(input);

  // Coverage gate (round-2 point 2): a requirement that reached Phase 4
  // (resolved a schema, was eligible for judgment — i.e. appears in
  // t.phase4Matrices) but never produced an accepted locked row must not be
  // silently absent from the rendered report — a log line alone does not
  // stop a wrong-looking "fully compliant" impression. `t.plannedRequirementIds`
  // is captured BEFORE this stage runs (moved ahead of render in
  // execute-act-plan.ts) specifically so this comparison is possible here.
  // Requirements that never resolved a schema at all are a separate,
  // pre-existing gap already surfaced via `compliance.run.reconciliation` —
  // not this gate, which is only about judgment that started but didn't
  // finish.
  const renderedReqIds = new Set(report.rows.map((r) => r.requirementId));
  const decisionByReq = t.lockDecisionsByRequirement;
  const assessedReqIds = new Set(t.phase5Assessments.map((a) => a.requirementId));
  const coverageGap = t.plannedRequirementIds
    .filter((id) => !renderedReqIds.has(id))
    .map((id) => {
      const decision = decisionByReq.get(id);
      const reason =
        decision && decision.kind === "rejected"
          ? `lock rejected: ${decision.reasonCodes.join(", ")}`
          : assessedReqIds.has(id)
            ? "assessed but did not reach an accepted lock"
            : "did not complete assessment";
      return { requirementId: id, reason };
    });

  if (coverageGap.length > 0) {
    report.bottomLine.unshift({
      claim: `${coverageGap.length} required check${coverageGap.length === 1 ? "" : "s"} could not be completed and ${coverageGap.length === 1 ? "is" : "are"} NOT reflected in this assessment: ${coverageGap.map((g) => g.requirementId).join(", ")}.`,
      lockedAssessmentIds: [],
    });
    emitComplianceEvent(state, "compliance.render.coverage_gap", {
      requirementIds: coverageGap.map((g) => g.requirementId),
      details: coverageGap,
    });
  }

  t.renderedReport = report;

  if (usesCanonicalComplianceReport(state)) {
    const bindings = collectBindings(state);
    const requests = state.intent?.requirements ?? [];
    const requestedTitle = (id: string) => requests.find(r => r.id === id)?.description;
    const titleFor = (id: string) =>
      schemaForRequirement(state, id, canonicalRequirementId(id))?.title ||
      requestedTitle(id) || humanizeRequirementId(id);
    const outstanding = new Map<string, ComplianceOutstandingCheck>();
    // Work units can use request IDs while locked assessments use native IDs.
    // A request is satisfied only if ALL of its bound native checks were locked.
    const planned = new Set([...t.plannedRequirementIds, ...requests.map(r => r.id)]);
    for (const id of planned) {
      const mapped = bindings.filter(b => b.requestRequirementId === id).map(b => b.nativeRequirementId);
      const required = mapped.length ? mapped : [id];
      for (const requiredId of required) {
        if (renderedReqIds.has(requiredId)) continue;
        const decision = decisionByReq.get(requiredId);
        const rejected = decision?.kind === "rejected";
        const unmatched = !schemaForRequirement(state, requiredId, canonicalRequirementId(requiredId));
        outstanding.set(requiredId, {
          requirementId: requiredId, title: titleFor(requiredId),
          kind: rejected ? "rejected" : unmatched ? "unmatched" : "unfinished",
          reason: rejected ? "The assessment did not pass verification checks; this is not a finding that the contract is deficient."
            : unmatched ? "This requested requirement could not be matched to a supported compliance check."
              : "Verification of this requirement did not finish. A fresh check is needed before concluding.",
        });
      }
    }
    // The current investigation enumerator can coalesce identical requirements
    // across targets. Expose any target it did not investigate rather than
    // treating a lock from one agreement as proof about another agreement.
    for (const unit of state.plan?.workUnits ?? []) {
      if (unit.tool !== "evaluate_package") continue;
      const docId = String(unit.input.docId ?? "");
      if (!docId) continue;
      const ids = (Array.isArray(unit.input.requirementIds) ? unit.input.requirementIds : unit.requirementIds ?? []) as string[];
      for (const id of ids) {
        if (renderedReqIds.has(id) && !t.investigatedDocuments.get(id)?.has(docId)) {
          const title = state.workspace.documents.find(d => d.docId === docId)?.title || "Additional document";
          outstanding.set(`${id}::${docId}`, {
            requirementId: `${id}::${docId}`, title: `${title}: ${titleFor(id)}`, kind: "unfinished",
            reason: "This requirement was assessed for another document, but verification did not complete for this document. Review it separately before concluding.",
          });
        }
      }
    }
    const snapshotReport: RenderedReport = { ...report, rows: report.rows.map(row => {
      const schema = schemaForRequirement(state, row.requirementId, row.canonicalKey);
      // Auto-derived schemas use an internal ID as their citation and a clipped
      // proposition as title. Format the catalog name, never invent a legal hook.
      return { ...row,
        title: schema?.reviewStatus === "auto_derived" ? humanizeRequirementId(row.requirementId) : row.title,
        legalCitation: row.legalCitation === row.requirementId ? "" : row.legalCitation,
        reviewedDocumentIds: [...(t.investigatedDocuments.get(row.requirementId) ?? [])],
      };
    }) };
    state.complianceReportSnapshot = buildComplianceSnapshot(
      state, snapshotReport, t.structuralNodesByDoc, [...outstanding.values()],
      t.phase3Results.flatMap(r => r.bundle.dependencies
        .filter(d => d.state !== "resolved_internal")
        .map(d => ({ requirementId: r.requirementId, reference: d.reference,
          reason: d.state === "ambiguous" ? "The referenced provision could not be resolved confidently." : "The referenced material was not available for verification." })))
    );
    state.compliancePresentationPlan = undefined;
    state.complianceReportValidation = undefined;
  }

  for (const row of report.rows) {
    emitComplianceEvent(state, "compliance.render.row", {
      requirementId: row.requirementId,
      canonicalKey: row.canonicalKey,
      lockedAssessmentId: row.lockedAssessmentId,
      status: row.status,
      statusLabel: row.statusLabel,
      recommendedAction: row.recommendedAction,
      supportedElementIds: row.supportedElementIds,
      missingElementIds: row.missingElementIds,
      evidenceSpanIds: row.evidence.map((e) => e.spanId),
      evidence: row.evidence,
      whatTheDocumentProvides: row.whatTheDocumentProvides,
      whatIsMissingOrUnclear: row.whatIsMissingOrUnclear,
      whyItMatters: row.whyItMatters,
      conclusion: row.conclusion,
      ruleVersion: row.ruleVersion,
      documentHash: row.documentHash,
    });
  }
  for (const supp of report.supplementalRequests) {
    emitComplianceEvent(state, "compliance.render.supplemental", {
      requestId: supp.requestId,
      reason: supp.reason,
      requirementType: supp.requirementType,
    });
  }
  for (const claim of report.bottomLine) {
    emitComplianceEvent(state, "compliance.render.bottom_line", {
      claim: claim.claim,
      lockedAssessmentIds: claim.lockedAssessmentIds,
    });
  }
  emitComplianceEvent(state, "compliance.render.reconciliation", {
    lockedAssessmentIds: report.reconciliation.lockedAssessmentIds,
    renderedAssessmentIds: report.reconciliation.renderedAssessmentIds,
    missing: report.reconciliation.missing,
    duplicates: report.reconciliation.duplicates,
    rowCount: report.rows.length,
    supplementalCount: report.supplementalRequests.length,
    bottomLineClaimCount: report.bottomLine.length,
  });
}

/** Phase 7 locked report for this session, if Phase 7 already ran. */
export function getComplianceRenderedReport(
  state: AnalysisState
): RenderedReport | null {
  return tracker(state).renderedReport;
}

/** Extract user-request propositions that didn't map to a canonical requirement. */
function collectSupplementalRequests(state: AnalysisState): SupplementalRequestRow[] {
  const requests = state.intent?.requirements ?? [];
  if (requests.length === 0) return [];
  const bindings = collectBindings(state);
  const bound = new Set(bindings.map((b) => b.requestRequirementId));
  const rows: SupplementalRequestRow[] = [];
  for (const r of requests) {
    if (bound.has(r.id)) continue;
    rows.push({
      requestId: r.id,
      reason: "no_catalog_match",
      requirementType: r.type,
    });
  }
  return rows;
}
