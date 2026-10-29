import { z } from "zod";
import { hashRevision } from "../schemas/common.js";
import type { SourceMap } from "./source-map.js";
import type { DraftRelationship, ReconstructionDraft } from "./reconstruct.js";

export const SEMANTIC_ONTOLOGY_VERSION = "legal-relations-v1";
export const SEMANTIC_PROMPT_VERSION = "explicit-relations-v3";

const Kind = z.enum(["refers_to", "defines", "exempts_from", "exception_to",
  "depends_on", "alternative_to", "interprets", "penalty_for"]);
const DecisionSchema = z.object({ links: z.array(z.object({
  relationId: z.string(), kind: Kind, role: z.string().min(1).max(500),
  evidenceQuote: z.string().min(1).max(500),
})), issues: z.array(z.string()) });

export type SemanticKind = z.infer<typeof Kind>;
export interface SemanticLink {
  id: string;
  relationId: string;
  sourceProvisionId: string;
  targetProvisionId: string;
  kind: SemanticKind;
  role: string;
  evidenceQuote: string;
  evidenceStart: number;
  evidenceEnd: number;
  basis: "explicit";
  status: "proposed";
  ontologyVersion: typeof SEMANTIC_ONTOLOGY_VERSION;
}
export interface PenaltyAnnotation {
  rowProvisionId: string;
  exactWording: string;
  amountType: "upper_bound" | "conditional" | "unknown";
  sourceStart: number;
  sourceEnd: number;
}
export interface SemanticReport {
  ontologyVersion: typeof SEMANTIC_ONTOLOGY_VERSION;
  promptVersion: typeof SEMANTIC_PROMPT_VERSION;
  model: string | null;
  links: SemanticLink[];
  penalties: PenaltyAnnotation[];
  analyzedRelationIds: string[];
  notAnalyzedRelationIds: string[];
  issues: string[];
  modelCalls: number;
}

export interface SemanticDecisionClient {
  model: string;
  decide(input: { sourceText: string; sourceCitation: string;
    references: Array<{ relationId: string; exactMention: string;
      targetProvisionId: string; targetCitation: string; targetText: string }> },
    options?: { attempt: number }): Promise<unknown>;
}

export interface SemanticProgress {
  load?(inputHash: string): Promise<unknown | null>;
  save?(inputHash: string, decision: unknown): Promise<void>;
}

function makeLink(map: SourceMap, draft: ReconstructionDraft, relation: DraftRelationship,
  kind: SemanticKind, role: string, evidenceQuote: string): SemanticLink | null {
  const source = draft.provisions.find(provision => provision.id === relation.sourceProvisionId);
  const target = relation.targetProvisionId;
  if (!source || !target || relation.status !== "proposed" ||
    !draft.provisions.some(provision => provision.id === target)) return null;
  let offset = source.text.indexOf(evidenceQuote);
  while (offset >= 0 && !(source.start + offset <= relation.start &&
      source.start + offset + evidenceQuote.length >= relation.end)) {
    offset = source.text.indexOf(evidenceQuote, offset + 1);
  }
  if (offset < 0 || map.text.slice(source.start + offset, source.start + offset + evidenceQuote.length) !== evidenceQuote ||
    !evidenceQuote.includes(relation.exactMention)) return null;
  const evidenceStart = source.start + offset;
  return { id: hashRevision({ sourceVersionId: draft.sourceVersionId, relationId: relation.id,
      kind, role, evidenceStart, target }), relationId: relation.id,
    sourceProvisionId: source.id, targetProvisionId: target, kind, role,
    evidenceQuote, evidenceStart, evidenceEnd: evidenceStart + evidenceQuote.length,
    basis: "explicit", status: "proposed", ontologyVersion: SEMANTIC_ONTOLOGY_VERSION };
}

function tableRole(map: SourceMap, draft: ReconstructionDraft, relation: DraftRelationship):
    { kind: SemanticKind; role: string } | null {
  const source = draft.provisions.find(provision => provision.id === relation.sourceProvisionId);
  if (!source?.tableItemRef || source.kind !== "table_row") return null;
  if (!isPenaltyTable(map, source.tableItemRef)) return null;
  const cell = map.spans.find(span => span.itemRef === source.tableItemRef && span.kind === "table_cell" &&
    span.start <= relation.start && span.end >= relation.end);
  if (!cell) return null;
  const rows = map.spans.filter(span => span.itemRef === source.tableItemRef && span.row === cell.row);
  const lastColumn = Math.max(...rows.map(span => span.column ?? -1));
  const description = rows.find(span => span.column !== 0 && span.column !== lastColumn);
  if (cell.column === lastColumn && lastColumn >= 2) {
    const penalty = map.text.slice(cell.start, cell.end).toLocaleLowerCase("en");
    if (/\b(?:penalty|proceeding|extent)\b/u.test(penalty)) {
      return { kind: "depends_on", role: "penalty_limit_basis" };
    }
    return null;
  }
  if (description && cell.column === description.column &&
    /\b(?:breach|failure|contravention|violation)\b/iu.test(map.text.slice(description.start, description.end))) {
    return { kind: "penalty_for", role: /\bundertaking\b/iu.test(source.text)
      ? "undertaking_basis" : "breached_provision" };
  }
  return null;
}

function isPenaltyTable(map: SourceMap, itemRef: string): boolean {
  return map.spans.some(span => span.itemRef === itemRef && span.isHeader &&
    /\bpenalt(?:y|ies)\b/iu.test(map.text.slice(span.start, span.end)));
}

export async function enrichSemanticRelationships(map: SourceMap, draft: ReconstructionDraft,
  client?: SemanticDecisionClient, maxCalls = Number.MAX_SAFE_INTEGER, progress: SemanticProgress = {}): Promise<{ draft: ReconstructionDraft; report: SemanticReport }> {
  if (map.textHash !== draft.textHash) throw new Error("Semantic input does not match the source map");
  const links: SemanticLink[] = [];
  const issues: string[] = [];
  const analyzed = new Set<string>();
  const byId = new Map(draft.provisions.map(provision => [provision.id, provision]));
  const eligible = draft.relationships.filter(relation => relation.status === "proposed" &&
    relation.sourceProvisionId && relation.targetProvisionId && relation.targetProvisionIds.length === 1 &&
    relation.relationType !== "defined_term");
  for (const relation of eligible) {
    const role = tableRole(map, draft, relation);
    if (!role) continue;
    const source = byId.get(relation.sourceProvisionId!)!;
    const link = makeLink(map, draft, relation, role.kind, role.role, source.text);
    if (link) { links.push(link); analyzed.add(relation.id); }
  }

  let modelCalls = 0;
  if (client) {
    const pending = eligible.filter(relation => !analyzed.has(relation.id));
    process.stdout.write(`      → Semantic relationship analysis: ${pending.length} model-backed relation(s), ${analyzed.size} resolved deterministically\n`);
    let relationIndex = 0;
    for (const relation of pending) {
      relationIndex++;
      const source = byId.get(relation.sourceProvisionId!)!;
      const target = byId.get(relation.targetProvisionId!)!;
      const request = { sourceText: source.text, sourceCitation: source.canonicalCitation ?? source.label ?? source.kind,
        references: [{ relationId: relation.id, exactMention: relation.exactMention,
          targetProvisionId: target.id, targetCitation: target.canonicalCitation ?? target.label ?? target.kind,
          targetText: target.text }] };
      if (JSON.stringify(request).length > 100_000) {
        issues.push(`Semantic context exceeds limit for ${relation.id}; full source and target required`);
        process.stdout.write(`      ⚠ Semantic relation ${relationIndex}/${pending.length} skipped: context exceeds limit (${relation.id})\n`);
        continue;
      }
      const inputHash = hashRevision({ sourceVersionId: draft.sourceVersionId, textHash: map.textHash,
        prompt: SEMANTIC_PROMPT_VERSION, ontology: SEMANTIC_ONTOLOGY_VERSION, model: client.model, request });
      const cached = await progress.load?.(inputHash);
      for (let attempt = 0; attempt < 2; attempt++) {
        const usingCheckpoint = Boolean(cached && !attempt);
        const started = Date.now();
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        try {
          if (!usingCheckpoint) {
            if (modelCalls >= maxCalls) { issues.push(`Semantic budget pending: ${relation.id}`); break; }
            modelCalls++;
            process.stdout.write(`      → Semantic relation ${relationIndex}/${pending.length}, attempt ${attempt + 1}/2: calling model (${relation.id})\n`);
            heartbeat = setInterval(() => process.stdout.write(
              `      … Semantic relation ${relationIndex}/${pending.length} still waiting after ${Math.round((Date.now() - started) / 1000)}s (${relation.id})\n`,
            ), 15_000);
          } else {
            process.stdout.write(`      ✓ Semantic relation ${relationIndex}/${pending.length} loaded from checkpoint (${relation.id})\n`);
          }
          const decision = DecisionSchema.parse(usingCheckpoint ? cached : await client.decide(request, { attempt: attempt + 1 }));
          const accepted: SemanticLink[] = [];
          for (const item of decision.links) {
            if (item.relationId !== relation.id) throw new Error(`Unknown semantic relation ${item.relationId}`);
            const link = makeLink(map, draft, relation, item.kind, item.role, item.evidenceQuote);
            if (!link) throw new Error(`Unsupported semantic evidence for ${item.relationId}`);
            accepted.push(link);
          }
          issues.push(...decision.issues.map(issue => `${relation.id}: ${issue}`));
          links.push(...accepted);
          if (!decision.issues.length) {
            analyzed.add(relation.id);
            await progress.save?.(inputHash, decision);
          }
          process.stdout.write(`      ✓ Semantic relation ${relationIndex}/${pending.length} completed in ${((Date.now() - started) / 1000).toFixed(1)}s (${accepted.length} link(s))\n`);
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          process.stdout.write(`      ⚠ Semantic relation ${relationIndex}/${pending.length}, attempt ${attempt + 1}/2 failed after ${((Date.now() - started) / 1000).toFixed(1)}s: ${message}\n`);
          if (attempt === 1) issues.push(`Semantic call for ${relation.id}: ${error instanceof Error ? error.message : String(error)}`);
        } finally { if (heartbeat) clearInterval(heartbeat); }
      }
    }
    process.stdout.write(`      ✓ Semantic relationship analysis finished: ${analyzed.size}/${eligible.length} analyzed, ${modelCalls} model call(s), ${issues.length} issue(s)\n`);
  }

  const penalties: PenaltyAnnotation[] = draft.provisions.filter(provision => provision.kind === "table_row" &&
    /^\d+$/u.test(provision.label ?? "") && provision.tableItemRef &&
    isPenaltyTable(map, provision.tableItemRef)).flatMap(row => {
    const cells = map.spans.filter(span => span.itemRef === row.tableItemRef && span.kind === "table_cell" &&
      span.start >= row.start && span.end <= row.end);
    const lastColumn = Math.max(...cells.map(cell => cell.column ?? -1));
    if (lastColumn < 2) return [];
    const penaltyCell = cells.find(cell => cell.column === lastColumn);
    if (!penaltyCell) return [];
    const exactWording = map.text.slice(penaltyCell.start, penaltyCell.end);
    return [{ rowProvisionId: row.id, exactWording,
      amountType: /\b(?:up to the extent|depending on|subject to)\b/iu.test(exactWording)
        ? "conditional" as const : /\bmay\s*extend\s*to|\bup to\b/iu.test(exactWording)
          ? "upper_bound" as const : "unknown" as const,
      sourceStart: penaltyCell.start, sourceEnd: penaltyCell.end }];
  });
  const enriched = { ...draft, relationships: draft.relationships.map(relation => {
    const link = links.find(item => item.relationId === relation.id);
    return link ? { ...relation, referenceType: relation.referenceType ?? relation.relationType,
      relationType: link.kind, semanticRole: link.role,
      semanticStatus: "proposed" as const, semanticEvidence: { start: link.evidenceStart,
        end: link.evidenceEnd, exactQuote: link.evidenceQuote } } : relation;
  }) };
  return { draft: enriched, report: { ontologyVersion: SEMANTIC_ONTOLOGY_VERSION,
    promptVersion: SEMANTIC_PROMPT_VERSION, model: client?.model ?? null,
    links, penalties, analyzedRelationIds: [...analyzed],
    notAnalyzedRelationIds: eligible.filter(relation => !analyzed.has(relation.id)).map(relation => relation.id),
    issues, modelCalls } };
}
