import { hashRevision } from "../schemas/common.js";
import type { SourceMap, SourceSpan } from "./source-map.js";
import type { DraftProvision, DraftRelationship, ReconstructionDraft } from "./reconstruct.js";

export interface DocumentDirectoryEntry {
  provisionId: string;
  kind: string;
  label: string | null;
  structuralPath: string[];
  parentId: string | null;
  start: number;
  end: number;
  reviewStatus: "candidate" | "needs_review";
}

export interface ReconstructedTableCell {
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
  text: string;
  isHeader: boolean;
  sourceStarts: number[];
  pages: number[];
}

export interface ReconstructedTable {
  id: string;
  provisionId: string | null;
  sourceItemRefs: string[];
  cells: ReconstructedTableCell[];
  headerCells: Array<{ row: number; column: number; text: string }>;
  continuationStatus: "single_block" | "continued" | "uncertain";
  reviewStatus: "candidate" | "needs_review";
  issues: string[];
}

export interface DefinitionScope {
  definitionProvisionId: string;
  scopeProvisionId: string | null;
  scopeStatus: "document" | "structural_parent" | "unresolved";
  reviewStatus: "candidate" | "needs_review";
}

export interface FootnoteAttachment {
  footnoteProvisionId: string;
  targetProvisionId: string | null;
  status: "proposed" | "unresolved";
}

export interface InferredLinkCandidate {
  sourceProvisionId: string;
  targetProvisionId: string;
  kind: "interprets";
  evidenceTerms: string[];
  reviewStatus: "requires_review";
}

export interface ContextManifest {
  targetProvisionId: string;
  includedProvisionIds: string[];
  selections: Array<{ provisionId: string; reason: "target" | "parent_condition" | "explicit_reference" }>;
  unresolvedRelationshipIds: string[];
  unavailableExternalRelationshipIds: string[];
  omitted: Array<{ provisionId: string; reason: "character_limit" | "cycle" }>;
  characterCount: number;
  complete: boolean;
}

export interface DocumentModel {
  schemaVersion: 1;
  sourceVersionId: string;
  textHash: string;
  directory: DocumentDirectoryEntry[];
  tables: ReconstructedTable[];
  footnotes: FootnoteAttachment[];
  definitionScopes: DefinitionScope[];
  relationships: DraftRelationship[];
  inferredLinkCandidates: InferredLinkCandidate[];
  contextManifests: ContextManifest[];
  sourceQualityIssues: Array<{ code: string; detail: string; page: number | null; sourceId: string | null }>;
  reviewStatus: "candidate" | "needs_review";
}

function ownerOf(span: SourceSpan, provisions: DraftProvision[]): DraftProvision | null {
  return provisions.filter(provision => provision.start <= span.start && provision.end >= span.end)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0] ?? null;
}

function buildTables(map: SourceMap, provisions: DraftProvision[]): ReconstructedTable[] {
  const sourceTables = new Map<string, SourceSpan[]>();
  for (const span of map.spans.filter(item => item.kind === "table_cell")) {
    sourceTables.set(span.itemRef, [...(sourceTables.get(span.itemRef) ?? []), span]);
  }
  const groups = new Map<string, SourceSpan[]>();
  for (const [itemRef, spans] of sourceTables) {
    const start = Math.min(...spans.map(span => span.start)), end = Math.max(...spans.map(span => span.end));
    const structuralOwner = provisions.filter(provision => provision.start <= start && provision.end >= end &&
      ["table", "schedule", "annex"].includes(provision.kind))
      .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    const key = structuralOwner?.id ?? itemRef;
    groups.set(key, [...(groups.get(key) ?? []), ...spans]);
  }
  return [...groups.entries()].map(([key, spans]) => {
    const tableStart = Math.min(...spans.map(span => span.start));
    const tableEnd = Math.max(...spans.map(span => span.end));
    const owner = provisions.filter(provision => provision.start <= tableStart && provision.end >= tableEnd)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0] ?? null;
    const cells = new Map<string, ReconstructedTableCell>();
    const issues: string[] = [];
    for (const span of spans) {
      const row = span.row ?? -1, column = span.column ?? -1;
      if (row < 0 || column < 0) issues.push(`missing_coordinates:${span.itemRef}:${span.start}`);
      issues.push(...(span.extractionWarnings ?? []).map(warning => `${warning}:${span.itemRef}:${span.start}`));
      const cellKey = `${row}:${column}`;
      const existing = cells.get(cellKey);
      if (existing) {
        existing.text += `\n${map.text.slice(span.start, span.end)}`;
        existing.sourceStarts.push(span.start);
        if (span.page !== null && !existing.pages.includes(span.page)) existing.pages.push(span.page);
      } else cells.set(cellKey, { row, column, rowSpan: span.rowSpan ?? 1, columnSpan: span.columnSpan ?? 1,
        text: map.text.slice(span.start, span.end), isHeader: span.isHeader ?? false,
        sourceStarts: [span.start], pages: span.page === null ? [] : [span.page] });
    }
    const sourceItemRefs = [...new Set(spans.map(span => span.itemRef))];
    const pages = new Set(spans.flatMap(span => span.page === null ? [] : [span.page]));
    if (!owner) issues.push("table_not_attached_to_provision");
    const values = [...cells.values()].sort((a, b) => a.row - b.row || a.column - b.column);
    return { id: hashRevision({ sourceVersionId: map.textHash, key, sourceItemRefs }),
      provisionId: owner?.id ?? null, sourceItemRefs, cells: values,
      headerCells: values.filter(cell => cell.isHeader).map(({ row, column, text }) => ({ row, column, text })),
      continuationStatus: sourceItemRefs.length > 1 || pages.size > 1 ? "continued" : "single_block",
      reviewStatus: issues.length ? "needs_review" : "candidate", issues };
  });
}

function significantTerms(text: string): Set<string> {
  return new Set((text.toLocaleLowerCase("en").match(/[a-z][a-z-]{4,}/g) ?? [])
    .filter(term => !["shall", "where", "which", "under", "their", "thereof", "article"].includes(term)));
}

function inferredRecitalCandidates(provisions: DraftProvision[]): InferredLinkCandidate[] {
  const recitals = provisions.filter(provision => provision.kind === "recital");
  const operative = provisions.filter(provision => ["article", "rule", "section", "paragraph"].includes(provision.kind));
  const links: InferredLinkCandidate[] = [];
  for (const recital of recitals) {
    const sourceTerms = significantTerms(recital.text);
    for (const target of operative) {
      const shared = [...significantTerms(target.text)].filter(term => sourceTerms.has(term));
      if (shared.length >= 3) links.push({ sourceProvisionId: recital.id, targetProvisionId: target.id,
        kind: "interprets", evidenceTerms: shared.slice(0, 12), reviewStatus: "requires_review" });
    }
  }
  return links;
}

function buildManifest(target: DraftProvision, provisions: DraftProvision[], relationships: DraftRelationship[],
  maxCharacters: number): ContextManifest {
  const byId = new Map(provisions.map(provision => [provision.id, provision]));
  const selected: DraftProvision[] = [], selections: ContextManifest["selections"] = [];
  const unresolvedRelationshipIds: string[] = [], unavailableExternalRelationshipIds: string[] = [];
  const omitted: ContextManifest["omitted"] = [], visited = new Set<string>(), queued = new Set<string>();
  const queue: Array<{ id: string; reason: ContextManifest["selections"][number]["reason"] }> = [
    { id: target.id, reason: "target" },
    ...target.inheritedParentIds.map(id => ({ id, reason: "parent_condition" as const })),
  ];
  let characterCount = 0;
  while (queue.length) {
    const next = queue.shift()!;
    queued.delete(next.id);
    if (visited.has(next.id)) { omitted.push({ provisionId: next.id, reason: "cycle" }); continue; }
    visited.add(next.id);
    const provision = byId.get(next.id);
    if (!provision) continue;
    if (characterCount + provision.text.length > maxCharacters) {
      omitted.push({ provisionId: provision.id, reason: "character_limit" }); continue;
    }
    selected.push(provision); selections.push({ provisionId: provision.id, reason: next.reason });
    characterCount += provision.text.length;
    for (const relation of relationships.filter(item => item.sourceProvisionId === provision.id)) {
      if (relation.status === "external_unavailable") unavailableExternalRelationshipIds.push(relation.id);
      else if (relation.status !== "proposed" || !relation.targetProvisionIds.length) unresolvedRelationshipIds.push(relation.id);
      else for (const targetId of relation.targetProvisionIds) if (!visited.has(targetId) && !queued.has(targetId)) {
        queue.push({ id: targetId, reason: "explicit_reference" }); queued.add(targetId);
      }
    }
  }
  return { targetProvisionId: target.id, includedProvisionIds: selected.map(provision => provision.id),
    selections, unresolvedRelationshipIds: [...new Set(unresolvedRelationshipIds)],
    unavailableExternalRelationshipIds: [...new Set(unavailableExternalRelationshipIds)], omitted,
    characterCount, complete: !unresolvedRelationshipIds.length && !unavailableExternalRelationshipIds.length && !omitted.length };
}

export function buildDocumentModel(map: SourceMap, draft: ReconstructionDraft,
  maxContextCharacters = 190_000): DocumentModel {
  if (draft.textHash !== map.textHash) throw new Error("Document model inputs refer to different source text");
  const directory = draft.provisions.map(provision => ({ provisionId: provision.id, kind: provision.kind,
    label: provision.label, structuralPath: provision.structuralPath, parentId: provision.parentId,
    start: provision.start, end: provision.end, reviewStatus: provision.status }));
  const tables = buildTables(map, draft.provisions);
  const footnotes = draft.provisions.filter(provision => provision.kind === "footnote").map(footnote => {
    const target = draft.provisions.filter(provision => provision.id !== footnote.id && provision.end <= footnote.start)
      .sort((a, b) => b.end - a.end)[0] ?? null;
    return { footnoteProvisionId: footnote.id, targetProvisionId: target?.id ?? null,
      status: target ? "proposed" as const : "unresolved" as const };
  });
  const definitionScopes = draft.provisions.filter(provision => provision.kind === "definition").map(definition => ({
    definitionProvisionId: definition.id, scopeProvisionId: definition.parentId,
    scopeStatus: definition.parentId ? "structural_parent" as const : "document" as const,
    reviewStatus: definition.status,
  }));
  const sourceQualityIssues = [
    ...map.pages.filter(page => page.status === "missing" || page.itemCount === 0).map(page => ({
      code: "missing_or_empty_page", detail: `Physical page ${page.physicalPage} has no mapped content`,
      page: page.physicalPage, sourceId: null })),
    ...map.spans.flatMap(span => (span.extractionWarnings ?? []).map(warning => ({ code: warning,
      detail: `Extraction warning for ${span.itemRef}`, page: span.page, sourceId: span.itemRef }))),
    ...draft.unresolvedText.map(gap => ({ code: "unclassified_text", detail: `Unclassified text ${gap.start}-${gap.end}`,
      page: null, sourceId: null })),
  ];
  const contextManifests = draft.provisions.map(provision =>
    buildManifest(provision, draft.provisions, draft.relationships, maxContextCharacters));
  const inferredLinkCandidates = inferredRecitalCandidates(draft.provisions);
  const needsReview = draft.status === "needs_review" || tables.some(table => table.reviewStatus === "needs_review") ||
    footnotes.some(footnote => footnote.status === "unresolved") || sourceQualityIssues.length > 0 ||
    contextManifests.some(manifest => !manifest.complete) || inferredLinkCandidates.length > 0;
  return { schemaVersion: 1, sourceVersionId: draft.sourceVersionId, textHash: map.textHash,
    directory, tables, footnotes, definitionScopes, relationships: draft.relationships,
    inferredLinkCandidates, contextManifests, sourceQualityIssues,
    reviewStatus: needsReview ? "needs_review" : "candidate" };
}
