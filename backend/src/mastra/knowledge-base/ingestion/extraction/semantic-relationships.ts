import { z } from "zod";
import { hashRevision } from "../schemas/common.js";
import type { SourceMap } from "./source-map.js";
import type { DraftRelationship, ReconstructionDraft } from "./reconstruct.js";
import { containingProvision, resolveReferenceTargets } from "./reconstruct.js";
import { externalInstrumentForMention } from "./citation-expression.js";
import { groundedQuote, ownSourceRanges } from "./graph-evidence.js";

export const SEMANTIC_ONTOLOGY_VERSION = "legal-relations-v3";
export const SEMANTIC_PROMPT_VERSION = "explicit-relations-v5";

const Kind = z.enum(["refers_to", "defines", "exempts_from", "exception_to",
  "depends_on", "alternative_to", "interprets", "penalty_for", "defined_term"]);
const DecisionSchema = z.object({ links: z.array(z.object({
  relationId: z.string(), kind: Kind, role: z.string().min(1).max(500),
  evidenceQuote: z.string().min(1).max(500),
  condition: z.string().max(2000).nullable().optional(),
})), issues: z.array(z.string()) });

export type SemanticKind = z.infer<typeof Kind>;
export const DiscoverySchema = z.object({ links: z.array(z.object({
  exactMention: z.string().min(1).max(300), targetCitation: z.string().min(1).max(180),
  kind: Kind, role: z.string().min(1).max(160), condition: z.string().max(400).nullable(),
  typeProposal: z.object({ name: z.string().min(1).max(80),
    definition: z.string().min(1).max(300) }).nullable(),
  evidenceQuote: z.string().min(1).max(500),
})), issues: z.array(z.string()) });
export interface SemanticDiscoveryInput {
  sourceText: string;
  sourceCitation: string;
  parentContext: string;
  directory: Array<{ id: string; citation: string; kind: string }>;
  existingReferences: Array<{ exactMention: string; targetCitation: string | null }>;
}
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
  condition?: string | null;
  typeProposal?: { name: string; definition: string } | null;
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
  discoveryUnits?: Array<{ sourceProvisionId: string; start: number;
    status: "analyzed" | "partial" | "failed"; accepted: number; rejected: number; unresolved: number }>;
}

export interface SemanticDecisionClient {
  model: string;
  discover?(input: SemanticDiscoveryInput, options?: { attempt: number }): Promise<unknown>;
  decide(input: { sourceText: string; sourceCitation: string;
    parentContext?: string;
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
  if (offset < 0) {
    const grounded = groundedQuote(source.text, evidenceQuote);
    if (grounded && source.start + grounded.start <= relation.start &&
        source.start + grounded.end >= relation.end) {
      offset = grounded.start;
      evidenceQuote = grounded.text;
    }
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
  const relationIssues = new Map<string, string[]>();
  const discoveryUnits: NonNullable<SemanticReport["discoveryUnits"]> = [];
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
        parentContext: source.inheritedParentIds.flatMap(id => {
          const parent = byId.get(id);
          return parent ? ownSourceRanges(parent, draft.provisions).map(range => map.text.slice(range.start, range.end)) : [];
        }).join("\n"),
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
            if (item.condition) {
              const grounded = [source.text, ...source.inheritedParentIds.map(id => byId.get(id)?.text ?? "")]
                .map(text => groundedQuote(text, item.condition!)).find(Boolean);
              if (!grounded) throw new Error(`Unsupported semantic condition for ${item.relationId}`);
              link.condition = grounded.text;
            }
            accepted.push(link);
          }
          issues.push(...decision.issues.map(issue => `${relation.id}: ${issue}`));
          if (decision.issues.length) relationIssues.set(relation.id, decision.issues);
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
          if (attempt === 1) {
            issues.push(`Semantic call for ${relation.id}: ${error instanceof Error ? error.message : String(error)}`);
            relationIssues.set(relation.id, [message]);
          }
        } finally { if (heartbeat) clearInterval(heartbeat); }
      }
    }
    process.stdout.write(`      ✓ Semantic relationship analysis finished: ${analyzed.size}/${eligible.length} analyzed, ${modelCalls} model call(s), ${issues.length} issue(s)\n`);
  }

  const discovered: DraftRelationship[] = [];
  const discoveryPending: string[] = [];
  if (client?.discover) {
    const directory = draft.provisions.filter(provision => provision.canonicalCitation)
      .map(provision => ({ id: provision.id, citation: provision.canonicalCitation!, kind: provision.kind }));
    const seen = new Set<string>();
    const candidates = draft.provisions.filter(provision =>
      (["section", "article", "rule", "table_row", "schedule"].includes(provision.kind) ||
        !provision.parentId && ["subsection", "paragraph", "point", "subparagraph", "definition", "illustration", "list_item"].includes(provision.kind) ||
        !provision.parentId && provision.kind === "unknown") &&
      provision.text.trim().length > 40)
      .filter(provision => {
        const key = `${provision.start}:${provision.end}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const sources = candidates.flatMap(provision => {
      const windows: Array<{ provision: typeof provision; start: number; text: string }> = [];
      let offset = 0;
      while (offset < provision.text.length) {
        let end = Math.min(offset + 10_000, provision.text.length);
        if (end < provision.text.length) {
          const boundary = provision.text.lastIndexOf("\n", end);
          if (boundary > offset + 7_000) end = boundary + 1;
        }
        windows.push({ provision, start: provision.start + offset,
          text: provision.text.slice(offset, end) });
        offset = end;
      }
      return windows;
    });
    const byCitation = new Map<string, typeof directory>();
    for (const item of directory) {
      const key = item.citation.toLocaleLowerCase("en");
      byCitation.set(key, [...(byCitation.get(key) ?? []), item]);
    }
    for (const source of sources) {
      const sourceKey = `discovery:${source.provision.id}:${source.start}`;
      const ancestors = source.provision.inheritedParentIds.map(id => byId.get(id)).filter(p => !!p);
      const request: SemanticDiscoveryInput = {
        sourceText: source.text, sourceCitation: source.provision.canonicalCitation ??
          source.provision.label ?? source.provision.kind,
        parentContext: ancestors.flatMap(parent => ownSourceRanges(parent, draft.provisions)
          .map(range => map.text.slice(range.start, range.end))).join("\n"),
        directory, existingReferences: draft.relationships.filter(relation =>
          relation.start >= source.start && relation.end <= source.start + source.text.length)
          .map(relation => ({ exactMention: relation.exactMention,
            targetCitation: relation.targetProvisionId ?
              byId.get(relation.targetProvisionId)?.canonicalCitation ?? null : null })),
      };
      if (JSON.stringify(request).length > 85_000) {
        issues.push(`Discovery context exceeds limit for ${sourceKey}`);
        discoveryPending.push(sourceKey);
        discoveryUnits.push({ sourceProvisionId: source.provision.id, start: source.start,
          status: "failed", accepted: 0, rejected: 0, unresolved: 0 });
        continue;
      }
      const inputHash = hashRevision({ sourceVersionId: draft.sourceVersionId, textHash: map.textHash,
        prompt: SEMANTIC_PROMPT_VERSION, ontology: SEMANTIC_ONTOLOGY_VERSION, model: client.model,
        discovery: request });
      const cached = await progress.load?.(inputHash);
      let complete = false;
      const unit: NonNullable<SemanticReport["discoveryUnits"]>[number] = {
        sourceProvisionId: source.provision.id, start: source.start, status: "failed", accepted: 0, rejected: 0, unresolved: 0 };
      process.stdout.write(`      → Discovery ${discoveryUnits.length + 1}/${sources.length}: ${request.sourceCitation}\n`);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (!cached || attempt) {
            if (modelCalls >= maxCalls) break;
            modelCalls++;
          }
          const decision = DiscoverySchema.parse(cached && !attempt ? cached :
            await client.discover(request, { attempt: attempt + 1 }));
          const accepted: Array<{ relation: DraftRelationship; link: SemanticLink }> = [];
          for (const item of decision.links) {
            const quote = groundedQuote(source.text, item.evidenceQuote);
            const mention = quote ? groundedQuote(quote.text, item.exactMention) : null;
            const condition = item.condition ? [source.text, ...ancestors.map(p => p.text)]
              .map(text => groundedQuote(text, item.condition!)).find(Boolean) : null;
            if (!quote || !mention || item.condition && !condition) {
              issues.push(`${sourceKey}: unsupported exact quote or condition`);
              unit.rejected++;
              continue;
            }
            const quoteOffset = quote.start, mentionOffset = mention.start;
            item.evidenceQuote = quote.text; item.exactMention = mention.text;
            if (condition) item.condition = condition.text;
            const start = source.start + quoteOffset + mentionOffset;
            const end = start + item.exactMention.length;
            if (map.text.slice(start, end) !== item.exactMention) {
              issues.push(`${sourceKey}: quote has no matching source offset`);
              continue;
            }
            const owner = containingProvision(start, end, draft.provisions);
            if (!owner) {
              issues.push(`${sourceKey}: citation has no owning provision`);
              unit.rejected++;
              continue;
            }
            const instrument = externalInstrumentForMention(map.text, start, end) ??
              externalInstrumentForMention(item.targetCitation, 0, item.targetCitation.length);
            const targets = instrument ? [] : resolveReferenceTargets(item.targetCitation, owner, draft.provisions);
            if (targets.length !== 1) {
              const external = !!instrument || /\b(?:Act|Code|Regulation|Directive|Convention)\b.*\b\d{4}\b/iu
                .test(item.targetCitation);
              const id = hashRevision({ sourceVersionId: draft.sourceVersionId, source: owner.id,
                targetHint: item.targetCitation, start, end, discovery: SEMANTIC_PROMPT_VERSION });
              if (!draft.relationships.some(relation => relation.id === id) &&
                  !discovered.some(relation => relation.id === id)) discovered.push({
                id, occurrenceId: sourceKey, sourceProvisionId: owner.id,
                targetProvisionId: null, targetProvisionIds: targets.map(target => target.id),
                exactMention: item.exactMention, start, end,
                status: external ? "external_unavailable" : targets.length ? "ambiguous" : "unresolved",
                relationType: external ? "external_reference" : item.kind,
                detectedBy: ["model"], targetHint: item.targetCitation,
                externalTarget: external ? { instrumentHint: instrument ?? item.targetCitation,
                  provisionHint: item.targetCitation, versionStatus: "unresolved", availability: "unavailable" } : null,
                rangeTarget: null, semanticRole: item.role, semanticCondition: item.condition,
                semanticStatus: "needs_review", semanticEvidence: { start: source.start + quoteOffset,
                  end: source.start + quoteOffset + item.evidenceQuote.length,
                  exactQuote: item.evidenceQuote },
              });
              issues.push(`${sourceKey}: target ${item.targetCitation} is missing or ambiguous`);
              unit.unresolved++;
              continue;
            }
            const target = targets[0]!;
            const existing = [...draft.relationships, ...discovered].find(relation =>
              relation.status === "proposed" && relation.targetProvisionIds.length === 1 &&
              relation.sourceProvisionId === owner.id && relation.targetProvisionId === target.id &&
              relation.start === start && relation.end === end);
            const relation: DraftRelationship = existing ?? {
              id: hashRevision({ sourceVersionId: draft.sourceVersionId, source: owner.id,
                target: target.id, start, end, discovery: SEMANTIC_PROMPT_VERSION }),
              occurrenceId: sourceKey, sourceProvisionId: owner.id, targetProvisionId: target.id,
              targetProvisionIds: [target.id], exactMention: item.exactMention, start, end,
              status: "proposed", relationType: item.kind, detectedBy: ["model"],
              referenceType: item.kind === "defined_term" ? "defined_term" : "explicit_reference",
              targetHint: item.targetCitation, externalTarget: null, rangeTarget: null,
            };
            const evidenceStart = source.start + quoteOffset;
            const link: SemanticLink = { id: hashRevision({ relationId: relation.id,
              kind: item.kind, role: item.role, evidenceStart }), relationId: relation.id,
              sourceProvisionId: owner.id, targetProvisionId: target.id, kind: item.kind,
              role: item.role, condition: item.condition, evidenceQuote: item.evidenceQuote,
              typeProposal: item.typeProposal,
              evidenceStart, evidenceEnd: evidenceStart + item.evidenceQuote.length,
              basis: "explicit", status: "proposed", ontologyVersion: SEMANTIC_ONTOLOGY_VERSION };
            if (item.typeProposal) issues.push(`${sourceKey}: proposed ontology type ${item.typeProposal.name} requires review`);
            accepted.push({ relation, link });
          }
          for (const item of accepted) {
            if (!draft.relationships.some(relation => relation.id === item.relation.id) &&
                !discovered.some(relation => relation.id === item.relation.id)) discovered.push(item.relation);
            if (!links.some(link => link.relationId === item.link.relationId &&
                link.kind === item.link.kind && link.role === item.link.role)) links.push(item.link);
          }
          unit.accepted = accepted.length;
          issues.push(...decision.issues.map(issue => `${sourceKey}: ${issue}`));
          if (!decision.issues.length && !unit.rejected) await progress.save?.(inputHash, decision);
          unit.status = unit.rejected || unit.unresolved || decision.issues.length ? "partial" : "analyzed";
          complete = true;
          break;
        } catch (error) {
          if (attempt === 1) issues.push(`${sourceKey}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (!complete) discoveryPending.push(sourceKey);
      else if (unit.status === "partial") discoveryPending.push(sourceKey);
      discoveryUnits.push(unit);
      process.stdout.write(`      ✓ Discovery: ${unit.accepted} accepted, ${unit.rejected} rejected, ${unit.unresolved} unresolved\n`);
    }
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
  const enriched = { ...draft, relationships: [...draft.relationships, ...discovered].map(relation => {
    const interpretations = links.filter(item => item.relationId === relation.id);
    const specific = interpretations.filter(item => item.kind !== "refers_to");
    const kinds = new Set(specific.map(item => item.kind));
    const conflict = kinds.size > 1;
    const problems = [...(relationIssues.get(relation.id) ?? []),
      ...(conflict ? ["Conflicting semantic kinds require adjudication"] : [])];
    // Retain specific source-grounded meaning. Generic discovery cannot erase it.
    const link = [...(specific.length ? specific : interpretations)].sort((a, b) =>
      Number(Boolean(b.condition)) - Number(Boolean(a.condition)))[0];
    if (problems.length) issues.push(`${relation.id}: ${problems.join("; ")}`);
    return link ? { ...relation, referenceType: relation.referenceType ?? relation.relationType,
      relationType: link.kind, semanticRole: link.role,
      semanticCondition: link.condition ?? null,
      semanticIssues: problems,
      semanticStatus: problems.length || link.typeProposal ? "needs_review" as const : "proposed" as const,
      semanticEvidence: { start: link.evidenceStart,
        end: link.evidenceEnd, exactQuote: link.evidenceQuote } } : problems.length
        ? { ...relation, semanticStatus: "needs_review" as const, semanticIssues: problems } : relation;
  }) };
  return { draft: enriched, report: { ontologyVersion: SEMANTIC_ONTOLOGY_VERSION,
    promptVersion: SEMANTIC_PROMPT_VERSION, model: client?.model ?? null,
    links, penalties, analyzedRelationIds: [...analyzed],
    notAnalyzedRelationIds: [...eligible.filter(relation => !analyzed.has(relation.id)).map(relation => relation.id),
      ...discoveryPending],
    issues, modelCalls, discoveryUnits } };
}
