import type { SourceMap } from "./source-map.js";
import type { ReconstructionDraft } from "./reconstruct.js";

export interface SourceValidationIssue {
  code: "missing_page" | "unmapped_source" | "unclassified_text" |
    "invalid_provision_span" | "invalid_source_location" | "unresolved_reference" | "missing_structure";
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
  draft: ReconstructionDraft): SourceValidationReport {
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
  for (const provision of draft.provisions) {
    if (provision.start < 0 || provision.end > map.text.length ||
        provision.end <= provision.start ||
        map.text.slice(provision.start, provision.end) !== provision.text) {
      add("invalid_provision_span", `Provision ${provision.id} does not preserve source wording`);
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
    if (relation.status !== "proposed" || !relation.sourceProvisionId || !relation.targetProvisionId) {
      add("unresolved_reference", `Reference ${relation.exactMention} needs review`);
    }
  }
  if (map.warnings.length || draft.warnings.length) {
    add("unmapped_source", "Extraction or reconstruction reported warnings requiring review");
  }
  return { schemaVersion: 1, sourceVersionId, textHash: map.textHash,
    status: issues.length ? "needs_review" : "candidate_ready", issues };
}
