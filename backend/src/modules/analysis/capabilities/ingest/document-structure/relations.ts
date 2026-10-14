import { createHash } from "node:crypto";
import type {
  CanonicalDocumentGraph,
  LlmRelationProposal,
  RelationEdge,
  RelationSemanticEffect,
  ScopedDefinition,
  StructuralNode,
  StructureWarning,
  UnresolvedTarget,
} from "./types.js";

interface RelationResult {
  edges: RelationEdge[];
  unresolvedTargets: UnresolvedTarget[];
  warnings: StructureWarning[];
}

const INTERNAL_REFERENCE_RE = /\b(?:(clauses?|sections?|articles?|paragraphs?)\s+((?:\d+(?:\.\d+)*)(?:\([a-zivxlcdm]+\))?)|(appendix|appendices|schedules?|annex|annexes|exhibits?)\s+([a-z0-9]+(?:[.-][a-z0-9]+)*))\b/gi;
const QUALIFIED_REFERENCE_RE = /\b(clauses?|sections?|articles?|paragraphs?)\s+((?:\d+(?:\.\d+)*)(?:\([a-zivxlcdm]+\))?)\s+(?:of|in|under)\s+(?:the\s+)?(appendix|schedule|annex|exhibit)\s+([a-z0-9]+(?:[.-][a-z0-9]+)*)\b/gi;
const RANGE_REFERENCE_RE = /\b(clauses?|sections?)\s+(\d+)\s*(?:-|\u2013|\u2014|to|through)\s*(\d+)\s+(?:of|in|under)\s+(?:the\s+)?(appendix|schedule|annex|exhibit)\s+([a-z0-9]+(?:[.-][a-z0-9]+)*)\b/gi;
const SCC_REFERENCE_RE = /\bSCC\s+clauses?\s+((?:\d+(?:\.\d+)*)(?:\([a-zivxlcdm]+\))?)\b/gi;
const DOCUMENT_REFERENCE_RE = /\b(?:this|main)\s+(?:DPA|data processing addendum|agreement)\b/gi;
const URL_REFERENCE_RE = /\bhttps?:\/\/[^\s<>()]+[^\s<>().,;:'"\]]/gi;
const RELATIVE_REFERENCE_RE = /\b(?:paragraph|clause|section)\s+(\([a-zivxlcdm]+\))\s+(above|below|preceding|following)\b/gi;
const EXTERNAL_REFERENCE_RE = /\b(?:UK GDPR|GDPR|CCPA|CPRA|HIPAA|standard contractual clauses|SCCs|data protection laws?)\b/gi;

function normalize(value: string): string {
  return value.toLowerCase().replace(/["\u201c\u201d'.:,;]/g, "").replace(/\s+/g, " ").trim();
}

function relationId(source: string, mention: string, evidence: string): string {
  return `dre_${createHash("sha256").update(`${source}|${normalize(mention)}|${evidence}`).digest("hex").slice(0, 24)}`;
}

function semanticEffect(context: string): RelationSemanticEffect {
  const value = context.toLowerCase();
  if (/\b(?:as\s+)?defined\s+in\b|\bhas the meaning (?:given|set out) in\b/.test(value)) return "defined_by";
  if (/\bsubject to\b|\bconditional upon\b|\bprovided that\b/.test(value)) return "subject_to";
  if (/\bexcept(?:ion)?\b|\bdoes not apply\b|\bcarve[- ]?out\b/.test(value)) return "exception_provided_by";
  if (/\bnotwithstanding\b|\bprevail(?:s|ing)?\b|\bin the event of (?:a )?conflict\b/.test(value)) return "prevails_over";
  if (/\bprocedure\b|\bprocess\b|\bsteps? (?:set out|described)\b/.test(value)) return "procedure_provided_by";
  if (/\bdetails?\b|\bset (?:forth|out) in\b|\bspecified in\b|\bdescribed in\b|\blisted in\b/.test(value)) return "details_provided_by";
  if (/\bincorporat(?:e|es|ed|ion)\b/.test(value)) return "incorporates";
  if (/\bforms? (?:a )?part of\b/.test(value)) return "forms_part_of";
  if (/\bappl(?:y|ies|icable) to\b/.test(value)) return "applies_to";
  if (/\bsupplement(?:s|ed|al)?\b/.test(value)) return "supplements";
  if (/\brequir(?:e|es|ed)\b/.test(value)) return "requires";
  if (/\blimit(?:s|ed|ation)?\b/.test(value)) return "limits";
  if (/\bimplement(?:s|ed|ing)?\b|\bcomply with\b|\bin accordance with\b/.test(value)) return "implements";
  if (/\bamend(?:s|ed|ing)?\b|\bmodify|modified by\b|\bsupplement(?:s|ed)?\b/.test(value)) return "modifies";
  if (/\bsurviv(?:e|es|ing|al)\b|\bcontinue(?:s|d)? (?:after|following)\b/.test(value)) return "survives";
  return "refers_to";
}

function sentenceAround(text: string, start: number, end: number): { text: string; localRange: [number, number] } {
  const left = Math.max(text.lastIndexOf(".", start - 1), text.lastIndexOf(";", start - 1), text.lastIndexOf("\n", start - 1));
  const rightCandidates = [text.indexOf(".", end), text.indexOf(";", end), text.indexOf("\n", end)].filter((n) => n >= 0);
  const right = rightCandidates.length ? Math.min(...rightCandidates) + 1 : text.length;
  let from = left + 1;
  let to = right;
  while (from < to && /\s/.test(text[from])) from += 1;
  while (to > from && /\s/.test(text[to - 1])) to -= 1;
  return { text: text.slice(from, to), localRange: [from, to] };
}

function typeForNode(node: StructuralNode): string {
  if (["appendix", "schedule", "annex", "exhibit"].includes(node.kind)) return node.kind;
  if (["clause", "subclause", "article", "section", "list_item"].includes(node.kind)) return "provision";
  return node.kind;
}

function singularKind(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "appendices") return "appendix";
  if (normalized === "annexes") return "annex";
  return normalized.replace(/s$/, "");
}

function targetCandidates(nodes: StructuralNode[], source: StructuralNode, mention: string): StructuralNode[] {
  const normalizedMention = normalize(mention);
  const boundary = normalizedMention.match(/^(appendix|appendices|schedules?|annex|annexes|exhibits?)\s+(.+)$/);
  const qualified = normalizedMention.match(/^(?:clauses?|sections?|articles?|paragraphs?)\s+(\d+(?:\.\d+)*(?:\([a-zivxlcdm]+\))?)\s+(?:of|in|under)\s+(?:the\s+)?(appendix|schedule|annex|exhibit)\s+([a-z0-9]+(?:[.-][a-z0-9]+)*)$/);
  const sccProvision = normalizedMention.match(/^scc\s+clauses?\s+(.+)$/);
  const provision = normalizedMention.match(/^(?:clauses?|sections?|articles?|paragraphs?)\s+(.+)$/);
  let matches: StructuralNode[] = [];
  if (/^(?:this|main) (?:dpa|data processing addendum|agreement)$/.test(normalizedMention)) {
    matches = nodes.filter((node) => node.kind === "document");
  } else if (/^(?:sccs?|standard contractual clauses)$/.test(normalizedMention)) {
    matches = nodes.filter((node) => node.kind === "part" && node.namespace.includes("/scc"));
  } else if (qualified) {
    const targetNamespace = `${qualified[2]}:${qualified[3]}`;
    matches = nodes.filter((node) => (node.namespace === targetNamespace || node.namespace.startsWith(`${targetNamespace}/`)) &&
      ["clause", "subclause", "article", "section", "list_item"].includes(node.kind) &&
      normalize(node.displayLabel ?? "") === qualified[1]);
  } else if (boundary) {
    const kind = singularKind(boundary[1]);
    matches = nodes.filter((node) => node.kind === kind && normalize(node.displayLabel ?? "") === boundary[2]);
  } else if (sccProvision) {
    matches = nodes.filter((node) => node.namespace.includes("/scc") &&
      ["clause", "subclause", "article", "section", "list_item"].includes(node.kind) &&
      normalize(node.displayLabel ?? "") === sccProvision[1]);
  } else if (provision) {
    matches = nodes.filter((node) => ["clause", "subclause", "article", "section", "list_item"].includes(node.kind) &&
      normalize(node.displayLabel ?? "") === provision[1]);
  } else {
    matches = nodes.filter((node) => normalize(node.displayLabel ?? "") === normalizedMention || normalize(node.title ?? "") === normalizedMention);
  }
  const sameNamespace = matches.filter((node) => node.namespace === source.namespace);
  return sameNamespace.length ? sameNamespace : matches;
}

function makeEdge(
  nodes: StructuralNode[], source: StructuralNode, mention: string, evidence: string,
  localRange: [number, number], effect: RelationSemanticEffect,
  detectedBy: RelationEdge["detectedBy"], explicit: boolean,
  unresolvedTargets: Map<string, UnresolvedTarget>
): RelationEdge {
  const candidates = targetCandidates(nodes, source, mention);
  const candidateTargetIds = candidates.map((node) => node.nodeId);
  const status = candidateTargetIds.length === 1 ? "resolved" : candidateTargetIds.length > 1 ? "ambiguous" : "unresolved_internal";
  let unresolvedTargetId: string | undefined;
  if (status === "unresolved_internal") {
    const parsed = normalize(mention).match(/^(appendix|appendices|schedules?|annex|annexes|exhibits?|clauses?|sections?|articles?|paragraphs?)\s+(.+)$/);
    const kind = parsed ? singularKind(parsed[1]) : "unknown";
    const label = parsed?.[2] ?? mention;
    const canonicalKey = `${kind}_${normalize(label).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
    unresolvedTargetId = `unresolved://${kind}/${encodeURIComponent(normalize(label).replace(/\s+/g, "-"))}`;
    if (!unresolvedTargets.has(unresolvedTargetId)) unresolvedTargets.set(unresolvedTargetId, {
      unresolvedTargetId, canonicalKey,
      kind: (["clause", "section", "article", "appendix", "schedule", "annex", "exhibit"].includes(kind) ? kind : "unknown") as UnresolvedTarget["kind"],
      label: mention, status: "unresolved", reason: "not_present_in_supplied_artifact",
    });
  }
  return {
    edgeId: relationId(source.nodeId, mention, evidence), sourceNodeId: source.nodeId,
    targetNodeId: candidateTargetIds.length === 1 ? candidateTargetIds[0] : undefined, unresolvedTargetId,
    candidateTargetIds, targetMention: mention, edgeType: "references", semanticEffect: effect,
    evidenceText: evidence,
    evidenceRange: [source.sourceRange[0] + localRange[0], source.sourceRange[0] + localRange[1]],
    explicit, status,
    reason: status === "resolved" ? "unique_target" : status === "ambiguous" ? "multiple_targets_in_scope" : "target_not_present",
    detectedBy, verifiedBy: candidateTargetIds.length === 1 ? ["target_resolver"] : [],
  };
}

function deterministicEdges(nodes: StructuralNode[], unresolvedTargets: Map<string, UnresolvedTarget>): RelationEdge[] {
  const edges: RelationEdge[] = [];
  for (const source of nodes) {
    if (!["clause", "subclause", "paragraph", "list_item", "definition", "section"].includes(source.kind)) continue;
    const qualifiedRanges: Array<[number, number]> = [];
    RANGE_REFERENCE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = RANGE_REFERENCE_RE.exec(source.text)) !== null) {
      qualifiedRanges.push([match.index, RANGE_REFERENCE_RE.lastIndex]);
      const sentence = sentenceAround(source.text, match.index, RANGE_REFERENCE_RE.lastIndex);
      const from = Number(match[2]);
      const to = Number(match[3]);
      if (Number.isInteger(from) && Number.isInteger(to) && to >= from && to - from <= 50) {
        const provisionKind = singularKind(match[1]);
        for (let label = from; label <= to; label++) {
          const mention = `${provisionKind} ${label} of ${match[4]} ${match[5]}`;
          edges.push(makeEdge(nodes, source, mention, sentence.text, sentence.localRange, semanticEffect(sentence.text), ["deterministic_rule"], true, unresolvedTargets));
        }
      }
    }
    QUALIFIED_REFERENCE_RE.lastIndex = 0;
    while ((match = QUALIFIED_REFERENCE_RE.exec(source.text)) !== null) {
      qualifiedRanges.push([match.index, QUALIFIED_REFERENCE_RE.lastIndex]);
      const sentence = sentenceAround(source.text, match.index, QUALIFIED_REFERENCE_RE.lastIndex);
      edges.push(makeEdge(nodes, source, match[0], sentence.text, sentence.localRange, semanticEffect(sentence.text), ["deterministic_rule"], true, unresolvedTargets));
    }
    SCC_REFERENCE_RE.lastIndex = 0;
    while ((match = SCC_REFERENCE_RE.exec(source.text)) !== null) {
      qualifiedRanges.push([match.index, SCC_REFERENCE_RE.lastIndex]);
      const sentence = sentenceAround(source.text, match.index, SCC_REFERENCE_RE.lastIndex);
      edges.push(makeEdge(nodes, source, match[0], sentence.text, sentence.localRange, semanticEffect(sentence.text), ["deterministic_rule"], true, unresolvedTargets));
    }
    DOCUMENT_REFERENCE_RE.lastIndex = 0;
    while ((match = DOCUMENT_REFERENCE_RE.exec(source.text)) !== null) {
      const sentence = sentenceAround(source.text, match.index, DOCUMENT_REFERENCE_RE.lastIndex);
      const effect = semanticEffect(sentence.text);
      if (effect !== "refers_to") edges.push(makeEdge(nodes, source, match[0], sentence.text, sentence.localRange, effect, ["deterministic_rule"], true, unresolvedTargets));
    }
    INTERNAL_REFERENCE_RE.lastIndex = 0;
    while ((match = INTERNAL_REFERENCE_RE.exec(source.text)) !== null) {
      if (qualifiedRanges.some(([start, end]) => match!.index >= start && match!.index < end)) continue;
      const mention = match[1] ? `${match[1]} ${match[2]}` : `${match[3]} ${match[4]}`;
      const sentence = sentenceAround(source.text, match.index, match.index + match[0].length);
      edges.push(makeEdge(nodes, source, mention, sentence.text, sentence.localRange, semanticEffect(sentence.text), ["deterministic_rule"], true, unresolvedTargets));
    }
    RELATIVE_REFERENCE_RE.lastIndex = 0;
    while ((match = RELATIVE_REFERENCE_RE.exec(source.text)) !== null) {
      const sentence = sentenceAround(source.text, match.index, match.index + match[0].length);
      const edge = makeEdge(nodes, source, match[0], sentence.text, sentence.localRange, semanticEffect(sentence.text), ["deterministic_rule"], true, unresolvedTargets);
      edge.status = "ambiguous";
      edge.reason = "relative_reference_requires_adjudication";
      edges.push(edge);
    }
    EXTERNAL_REFERENCE_RE.lastIndex = 0;
    while ((match = EXTERNAL_REFERENCE_RE.exec(source.text)) !== null) {
      if (qualifiedRanges.some(([start, end]) => match!.index >= start && match!.index < end)) continue;
      const sentence = sentenceAround(source.text, match.index, match.index + match[0].length);
      const internalInstrumentTargets = targetCandidates(nodes, source, match[0]);
      if (internalInstrumentTargets.length) {
        edges.push(makeEdge(nodes, source, match[0], sentence.text, sentence.localRange,
          semanticEffect(sentence.text) === "refers_to" ? "incorporates" : semanticEffect(sentence.text),
          ["deterministic_rule"], true, unresolvedTargets));
        continue;
      }
      const externalEffect = semanticEffect(sentence.text);
      edges.push({
        edgeId: relationId(source.nodeId, match[0], sentence.text), sourceNodeId: source.nodeId,
        candidateTargetIds: [], targetMention: match[0], edgeType: "references",
        semanticEffect: externalEffect === "refers_to" ? "external_reference" : externalEffect, evidenceText: sentence.text,
        evidenceRange: [source.sourceRange[0] + sentence.localRange[0], source.sourceRange[0] + sentence.localRange[1]],
        explicit: true, status: "external", reason: "external_legal_instrument",
        detectedBy: ["deterministic_rule"], verifiedBy: ["target_resolver"],
      });
    }
    URL_REFERENCE_RE.lastIndex = 0;
    while ((match = URL_REFERENCE_RE.exec(source.text)) !== null) {
      const sentence = sentenceAround(source.text, match.index, match.index + match[0].length);
      const effect = semanticEffect(sentence.text);
      edges.push({
        edgeId: relationId(source.nodeId, match[0], sentence.text), sourceNodeId: source.nodeId,
        candidateTargetIds: [], targetMention: match[0], edgeType: "references",
        semanticEffect: effect === "refers_to" ? "external_reference" : effect,
        evidenceText: sentence.text,
        evidenceRange: [source.sourceRange[0] + sentence.localRange[0], source.sourceRange[0] + sentence.localRange[1]],
        explicit: true, status: "external", reason: "external_url",
        detectedBy: ["deterministic_rule"], verifiedBy: ["target_resolver"],
      });
    }
  }
  return edges;
}

function ancestorDistance(source: StructuralNode, scopeNodeId: string, byId: Map<string, StructuralNode>): number | undefined {
  let current: StructuralNode | undefined = source;
  let distance = 0;
  while (current) {
    if (current.nodeId === scopeNodeId) return distance;
    current = current.parentId ? byId.get(current.parentId) : undefined;
    distance += 1;
  }
  return undefined;
}

function definitionEdges(nodes: StructuralNode[], definitions: ScopedDefinition[]): RelationEdge[] {
  const edges: RelationEdge[] = [];
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const byTerm = new Map<string, ScopedDefinition[]>();
  for (const definition of definitions) {
    const key = normalize(definition.term);
    byTerm.set(key, [...(byTerm.get(key) ?? []), definition]);
  }
  for (const source of nodes) {
    if (!["clause", "subclause", "paragraph", "list_item", "section"].includes(source.kind)) continue;
    for (const candidates of byTerm.values()) {
      const applicable = candidates
        .map((definition) => ({ definition, distance: ancestorDistance(source, definition.scopeNodeId, byId) }))
        .filter((item): item is { definition: ScopedDefinition; distance: number } => item.distance !== undefined);
      if (!applicable.length) continue;
      const nearest = Math.min(...applicable.map((item) => item.distance));
      const scoped = applicable.filter((item) => item.distance === nearest).map((item) => item.definition);
      const term = scoped[0].term;
      const useRegex = new RegExp(`(?<![A-Za-z0-9_])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_])`, "g");
      let match: RegExpExecArray | null;
      while ((match = useRegex.exec(source.text)) !== null) {
        const targetIds = [...new Set(scoped.map((definition) => definition.definitionNodeId))];
        const status = targetIds.length === 1 ? "resolved" : "ambiguous";
        edges.push({
          edgeId: relationId(source.nodeId, match[0], match[0]),
          sourceNodeId: source.nodeId,
          targetNodeId: targetIds.length === 1 ? targetIds[0] : undefined,
          candidateTargetIds: targetIds,
          targetMention: match[0],
          edgeType: "references",
          semanticEffect: "defined_by",
          evidenceText: match[0],
          evidenceRange: [source.sourceRange[0] + match.index, source.sourceRange[0] + match.index + match[0].length],
          explicit: false,
          status,
          reason: status === "resolved" ? "nearest_scoped_definition" : "multiple_definitions_in_nearest_scope",
          detectedBy: ["deterministic_rule"],
          verifiedBy: status === "resolved" ? ["target_resolver"] : [],
        });
      }
    }
  }
  return edges;
}

function mergeProposal(nodes: StructuralNode[], edges: RelationEdge[], proposal: LlmRelationProposal, warnings: StructureWarning[], unresolvedTargets: Map<string, UnresolvedTarget>) {
  const source = nodes.find((node) => node.nodeId === proposal.sourceNodeId);
  if (!source) return;
  const evidenceAt = source.text.indexOf(proposal.evidenceText);
  if (evidenceAt < 0 || !proposal.evidenceText.trim()) {
    warnings.push({ code: "llm_relation_evidence_not_grounded", severity: "warning",
      message: "An LLM relation proposal was rejected because its evidence was not an exact source span.", nodeId: source.nodeId });
    return;
  }
  const proposed = makeEdge(nodes, source, proposal.targetMention, proposal.evidenceText,
    [evidenceAt, evidenceAt + proposal.evidenceText.length], proposal.semanticEffect, ["llm_discovery"], proposal.explicit, unresolvedTargets);
  const existing = edges.find((edge) => edge.sourceNodeId === proposed.sourceNodeId && normalize(edge.targetMention) === normalize(proposed.targetMention));
  if (!existing) {
    edges.push(proposed);
    return;
  }
  if (!existing.detectedBy.includes("llm_discovery")) existing.detectedBy.push("llm_discovery");
  if (existing.semanticEffect === "refers_to" && proposed.semanticEffect !== "unknown") {
    existing.semanticEffect = proposed.semanticEffect;
  } else if (proposal.semanticEffect !== "unknown" && existing.semanticEffect !== proposal.semanticEffect) {
    existing.status = "ambiguous";
    existing.reason = "deterministic_and_llm_relation_disagreement";
  }
}

export function buildRelations(
  graph: Pick<CanonicalDocumentGraph, "nodes" | "definitions">,
  llmProposals: LlmRelationProposal[] = []
): RelationResult {
  const warnings: StructureWarning[] = [];
  const unresolvedTargets = new Map<string, UnresolvedTarget>();
  const edges = [...deterministicEdges(graph.nodes, unresolvedTargets), ...definitionEdges(graph.nodes, graph.definitions)];
  for (const proposal of llmProposals) mergeProposal(graph.nodes, edges, proposal, warnings, unresolvedTargets);
  const unique = new Map<string, RelationEdge>();
  for (const edge of edges) {
    const key = `${edge.sourceNodeId}|${normalize(edge.targetMention)}|${edge.semanticEffect}`;
    const current = unique.get(key);
    if (!current) unique.set(key, edge);
    else for (const detector of edge.detectedBy) if (!current.detectedBy.includes(detector)) current.detectedBy.push(detector);
  }
  return { edges: [...unique.values()], unresolvedTargets: [...unresolvedTargets.values()], warnings };
}

export function relationTargetType(node: StructuralNode): string {
  return typeForNode(node);
}
