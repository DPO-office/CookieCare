import type { SourceMap } from "./source-map.js";
import { isSubstantiveZone } from "./layout-zones.js";
import type { ReconstructionDraft } from "./reconstruct.js";
import type { DocumentModel } from "./document-model.js";

export interface SourceValidationIssue {
  code: "missing_page" | "unmapped_source" | "unclassified_text" |
    "invalid_provision_span" | "invalid_source_location" | "unresolved_reference" | "missing_structure" |
    "unknown_structure" | "hierarchy_cycle" | "invalid_parent_containment" | "damaged_table" |
    "unresolved_footnote" | "unavailable_external_source" | "incomplete_context" | "source_quality" |
    "unreconciled_boundary" | "heuristic_relationship" | "duplicate_citation" | "missing_numbered_boundary";
  detail: string;
}

export interface SourceValidationReport {
  schemaVersion: 1;
  sourceVersionId: string;
  textHash: string;
  status: "needs_review" | "candidate_ready";
  issues: SourceValidationIssue[];
}

/** Independent coverage checks over the original page inventory and exact source map. */
export function validateReconstruction(sourceVersionId: string, map: SourceMap,
  draft: ReconstructionDraft, document?: DocumentModel): SourceValidationReport {
  const issues: SourceValidationIssue[] = [];
  const add = (code: SourceValidationIssue["code"], detail: string) => issues.push({ code, detail });
  for (const page of map.pages) {
    if (page.status !== "mapped" || page.itemCount === 0) {
      add("missing_page", `Physical page ${page.physicalPage} has no mapped content`);
    }
  }
  for (const span of map.spans) {
    if (span.page === null || span.page < 1 || span.page > map.pages.length) {
      add("unmapped_source", `Source item ${span.itemRef} has uncertain physical page`);
    }
  }
  if (draft.sourceVersionId !== sourceVersionId || draft.textHash !== map.textHash) {
    throw new Error("Reconstruction does not match the source map");
  }
  if (!draft.provisions.length) add("missing_structure", "No provisions were reconstructed");
  const citations = new Map<string, string>();
  for (const provision of draft.provisions) {
    const citation = provision.canonicalCitation;
    if (!citation || !/^(?:Section|Article|Rule)\s+\S/u.test(citation)) continue;
    const existing = citations.get(citation);
    if (existing && existing !== provision.id) add("duplicate_citation", `${citation}: ${existing}, ${provision.id}`);
    else citations.set(citation, provision.id);
  }
  for (const span of map.spans.filter(s => s.kind === "text" && isSubstantiveZone(s.layoutZone) && !["page_header", "page_footer"].includes(s.blockType ?? ""))) {
    for (const marker of map.text.slice(span.start, span.end).matchAll(/(?:^|\n)[ \t]*(?:\d+[a-z]?\.[ \t]+|\((?:\d+[a-z]?|[a-z]|[ivxlcdm]+)\)[ \t]+)/giu)) {
      const start = span.start + marker.index! + marker[0].search(/\S/u);
      if (!draft.provisions.some(p => p.start === start)) add("missing_numbered_boundary", `Numbered source opening at ${start} has no distinct provision`);
    }
  }
  for (const provision of draft.provisions) {
    if (provision.start < 0 || provision.end > map.text.length ||
        provision.end <= provision.start ||
        map.text.slice(provision.start, provision.end) !== provision.text) {
      add("invalid_provision_span", `Provision ${provision.id} does not preserve source wording`);
    }
    if (provision.kind === "unknown") add("unknown_structure", `Provision ${provision.id} is preserved as unknown`);
    if (provision.boundaryStatus !== "complete") {
      add("unreconciled_boundary", `Provision ${provision.id} has ${provision.boundaryStatus} boundaries`);
    }
    if (["paragraph", "subsection", "point"].includes(provision.kind) && !/[.!?;:]\s*$/u.test(provision.text)) {
      const next = draft.provisions.filter(p => p.start >= provision.end && p.id !== provision.id &&
        p.kind === provision.kind && p.parentId === provision.parentId).sort((a, b) => a.start - b.start)[0];
      const lastPage = provision.sourceSpans.at(-1)?.physicalPage;
      const nextPage = next?.sourceSpans[0]?.physicalPage;
      if (next && lastPage && nextPage === lastPage + 1 && /^\s*\p{Ll}/u.test(next.text)) {
        add("unreconciled_boundary", `Possible cross-page continuation ${provision.id} -> ${next.id}; explicit evidence required`);
      }
    }
    if (provision.parentId) {
      const parent = draft.provisions.find(item => item.id === provision.parentId);
      const attachedTableRow = parent && ["table_row", "table"].includes(provision.kind) && provision.tableItemRef &&
        ["schedule", "annex"].includes(parent.kind) && parent.sourceSpans.some(location =>
          map.spans.some(span => span.itemRef === location.itemRef && span.parentRef === provision.tableItemRef));
      if (!parent || !attachedTableRow && (parent.start > provision.start || parent.end < provision.end)) {
        add("invalid_parent_containment", `Parent does not contain provision ${provision.id}`);
      }
      const seen = new Set([provision.id]);
      let cursor = parent;
      while (cursor) {
        if (seen.has(cursor.id)) { add("hierarchy_cycle", `Hierarchy cycle includes ${provision.id}`); break; }
        seen.add(cursor.id);
        cursor = cursor.parentId ? draft.provisions.find(item => item.id === cursor!.parentId) : undefined;
      }
    }
    for (const location of provision.sourceSpans) {
      if (!map.spans.some(span => span.itemRef === location.itemRef &&
          span.page === location.physicalPage && span.start <= location.start &&
          span.end >= location.end)) {
        add("invalid_source_location", `Provision ${provision.id} has an unmatched PDF location`);
      }
    }
  }
  for (const gap of draft.unresolvedText) {
    if (gap.text.trim()) add("unclassified_text", `Source text ${gap.start}-${gap.end} is unclassified`);
  }
  for (const span of map.spans) {
    if (!isSubstantiveZone(span.layoutZone)) continue;
    if (!map.text.slice(span.start, span.end).trim()) continue;
    const intervals = draft.provisions.filter(provision =>
      provision.start < span.end && provision.end > span.start)
      .map(provision => ({ start: Math.max(span.start, provision.start),
        end: Math.min(span.end, provision.end) }))
      .sort((a, b) => a.start - b.start);
    let coveredUntil = span.start;
    for (const interval of intervals) {
      if (interval.start > coveredUntil && map.text.slice(coveredUntil, interval.start).trim()) break;
      coveredUntil = Math.max(coveredUntil, interval.end);
    }
    if (coveredUntil < span.end && map.text.slice(coveredUntil, span.end).trim()) {
      add("unclassified_text", `Mapped item ${span.itemRef} is not within a complete provision`);
    }
  }
  for (const relation of draft.relationships) {
    const completeRange = relation.status === "proposed" && relation.rangeTarget?.complete === true &&
      relation.targetProvisionIds.length === relation.rangeTarget.to - relation.rangeTarget.from + 1;
    if (relation.status !== "proposed" || relation.semanticStatus === "needs_review" || !relation.sourceProvisionId ||
        (!relation.targetProvisionId && !completeRange)) {
      add("unresolved_reference", `Reference ${relation.exactMention} needs review`);
    }
  }
  if (document) {
    if (document.textHash !== map.textHash || document.sourceVersionId !== sourceVersionId) {
      throw new Error("Document model does not match the source map");
    }
    for (const table of document.tables) for (const issue of table.issues) {
      add("damaged_table", `${table.id}: ${issue}`);
    }
    for (const footnote of document.footnotes) {
      if (footnote.status === "unresolved") add("unresolved_footnote", `Footnote ${footnote.footnoteProvisionId} is unattached`);
      else add("heuristic_relationship", `Footnote ${footnote.footnoteProvisionId} has a provisional attachment`);
    }
    for (const definition of document.definitionScopes) {
      add("heuristic_relationship", `Definition ${definition.definitionProvisionId} has a provisional scope`);
    }
    for (const relation of document.relationships) if (relation.status === "external_unavailable") {
      add("unavailable_external_source", `External target unavailable for ${relation.exactMention}`);
    }
    for (const manifest of document.contextManifests) if (!manifest.complete) {
      add("incomplete_context", `Context for ${manifest.targetProvisionId} has unresolved, unavailable or limited dependencies`);
    }
    for (const issue of document.sourceQualityIssues) add("source_quality", issue.detail);
  }
  if (map.warnings.length || draft.warnings.length) {
    add("unmapped_source", "Extraction or reconstruction reported warnings requiring review");
  }
  return { schemaVersion: 1, sourceVersionId, textHash: map.textHash,
    status: issues.length ? "needs_review" : "candidate_ready", issues };
}
