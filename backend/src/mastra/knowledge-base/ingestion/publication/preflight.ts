import { hashRevision } from "../schemas/common.js";
import { PublicationManifestSchema, type PublicationManifest } from "../schemas/publication.js";

export interface ApprovedRecordState {
  kind: "provision" | "requirement" | "profile" | "relation";
  id: string;
  revision: number;
  contentHash: string;
  sourceVersionId: string;
  latestReviewId: string | null;
  latestDecision: "approve" | "reject" | "request_changes" | null;
}
export interface SourceReadiness {
  sourceVersionId: string;
  authorityVerified: boolean;
  extractionMapped: boolean;
  structureReviewed: boolean;
}
export interface IndexReadiness {
  indexVersion: string;
  lexicalBackend: "pg_bm25" | "opensearch" | null;
  lexicalVerified: boolean;
  denseVerified: boolean;
  indexedRecordKeys: string[];
}
export interface PublicationIssue { code: string; detail: string }

/** The final gate consumes verified facts, not flags supplied by a model. */
export function publicationPreflight(raw: unknown, sources: SourceReadiness[],
  records: ApprovedRecordState[], index: IndexReadiness): {
    manifest: PublicationManifest; ready: boolean; issues: PublicationIssue[] } {
  const manifest = PublicationManifestSchema.parse(raw);
  const issues: PublicationIssue[] = [];
  const add = (code: string, detail: string) => issues.push({ code, detail });
  const { manifestHash, ...payload } = manifest;
  if (manifestHash !== hashRevision(payload)) add("manifest_hash", "Publication manifest changed");
  if (manifest.state !== "building") add("publication_state", "Only a building publication can be activated");
  if (manifest.lexicalStatus !== "ready" || manifest.denseStatus !== "ready") {
    add("indexes_not_ready", "Both indexes must be complete");
  }
  if (index.indexVersion !== manifest.indexVersion || !index.lexicalBackend ||
      !index.lexicalVerified || !index.denseVerified) {
    add("index_unverified", "The selected lexical backend and dense index need independent verification");
  }
  const sourceIds = new Set(manifest.sourceVersionIds);
  if (sourceIds.size !== manifest.sourceVersionIds.length) add("duplicate_source", "Duplicate source version");
  const readySources = new Map(sources.map(source => [source.sourceVersionId, source]));
  for (const sourceVersionId of sourceIds) {
    const source = readySources.get(sourceVersionId);
    if (!source || !source.authorityVerified || !source.extractionMapped || !source.structureReviewed) {
      add("source_unready", `Source version ${sourceVersionId} is not verified and reviewed`);
    }
  }
  const recordKey = (kind: string, id: string, revision: number) => `${kind}:${id}:${revision}`;
  const current = new Map(records.map(record => [recordKey(record.kind, record.id, record.revision), record]));
  const latestRevision = new Map<string, number>();
  for (const record of records) {
    const identity = `${record.kind}:${record.id}`;
    latestRevision.set(identity, Math.max(latestRevision.get(identity) ?? 0, record.revision));
  }
  const indexed = new Set(index.indexedRecordKeys);
  const approved = new Set<string>();
  for (const entry of manifest.approvedRecords) {
    const key = recordKey(entry.kind, entry.record.id, entry.record.revision);
    if (approved.has(key)) add("duplicate_record", `Duplicate approved record ${key}`);
    approved.add(key);
    const state = current.get(key);
    if (!state || state.revision !== latestRevision.get(`${entry.kind}:${entry.record.id}`) ||
        state.contentHash !== entry.revisionHash ||
        state.latestDecision !== "approve" || state.latestReviewId !== entry.reviewDecisionId ||
        !sourceIds.has(state.sourceVersionId)) {
      add("record_not_approved", `Record ${key} is stale, outside scope, or lacks the latest exact approval`);
    }
    if (entry.kind !== "relation" && !indexed.has(key)) add("record_not_indexed", `Missing index entry for ${key}`);
  }
  for (const scope of manifest.reviewedScope) {
    const key = recordKey("provision", scope.id, scope.revision);
    if (!approved.has(key)) add("scope_not_approved", `Reviewed provision ${key} is absent from publication`);
  }
  return { manifest, ready: issues.length === 0, issues };
}
