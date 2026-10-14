import { createHash } from "node:crypto";
import type {
  ParsedBlock,
  ParsedDocument,
  ScopedDefinition,
  StructuralEdge,
  StructuralNode,
  StructuralNodeKind,
  StructureWarning,
} from "./types.js";

interface HierarchyResult {
  nodes: StructuralNode[];
  structuralEdges: StructuralEdge[];
  definitions: ScopedDefinition[];
  warnings: StructureWarning[];
}

interface Marker {
  kind: StructuralNodeKind;
  label?: string;
  title?: string;
  numberingPath?: string[];
  boundary?: boolean;
  namespaceSegment?: string;
}

const BOUNDARY_RE = /^(appendix|schedule|annex|exhibit)\s+([a-z0-9]+(?:[.-][a-z0-9]+)*)(?:\s*[-:\u2013\u2014]\s*(.+)|\s+(.+))?$/i;
const EXPLICIT_NUMBER_RE = /^(clause|section|article)\s+(\d+(?:\.\d+)*(?:\([a-zivxlcdm]+\))?)(?:[.)])?(?:\s*[-:\u2013\u2014.]?\s*(.*))?$/i;
const NUMBER_RE = /^(\d+(?:\.\d+)*(?:\([a-zivxlcdm]+\))?)(?:[.)])?(?:\s+(.+))$/i;
const LIST_RE = /^\(([a-z]|[ivxlcdm]+|\d+)\)\s+(.+)$/i;
const INSTRUMENT_BOUNDARY_RE = /^(?:eu\s+)?(?:standard contractual clauses|sccs?)(?:\s*[-:\u2013\u2014].*)?$/i;
const DEFINITION_STOPWORDS = new Set(["and", "or", "the", "of", "to", "in", "for", "a", "an", "by", "with", "as", "is", "are", "means"]);

interface DefinitionCandidate {
  term: string;
  sourceKind: ScopedDefinition["sourceKind"];
  externalSourceMention?: string;
}

function withoutProvisionLabel(text: string): string {
  return text.replace(/^(?:(?:clause|section|article)\s+)?\d+(?:\.\d+)*(?:\([a-zivxlcdm]+\))?[.)]?\s+/i, "").trim();
}

function validDefinitionTerm(term: string, quoted: boolean): boolean {
  const value = term.trim().replace(/["\u201c\u201d]/g, "").trim();
  const normalized = value.toLowerCase();
  if (!value || value.length > 80 || DEFINITION_STOPWORDS.has(normalized)) return false;
  if (!/[A-Za-z]/.test(value) || /[.;!?]/.test(value) || value.split(/\s+/).length > 10) return false;
  return quoted || /^[A-Z0-9]/.test(value);
}

function definitionCandidate(text: string): DefinitionCandidate | undefined {
  const body = withoutProvisionLabel(text);
  const quoted = /^["\u201c]/.test(body);
  const match = body.match(/^["\u201c]?([^"\u201d]{1,80})["\u201d]?\s+(means|shall mean|refers to|has the meaning)\b\s*(.*)$/i);
  if (match && validDefinitionTerm(match[1], quoted)) {
    const external = match[2].toLowerCase() === "has the meaning" && match[3].match(/(?:given|assigned|set out)\s+in\s+(.+)$/i)?.[1]?.trim();
    return { term: match[1].trim(), sourceKind: external ? "imported_external" : "local_definition", externalSourceMention: external };
  }
  const colon = body.match(/^["\u201c]?([^:"\u201d]{1,80})["\u201d]?\s*:\s+\S/);
  if (colon && validDefinitionTerm(colon[1], quoted)) return { term: colon[1].trim(), sourceKind: "local_definition" };
  return undefined;
}

function stableId(versionId: string, sourceRef: string, kind: string): string {
  return `dsn_${createHash("sha256").update(`${versionId}|${sourceRef}|${kind}`).digest("hex").slice(0, 24)}`;
}

function headingLike(block: ParsedBlock): boolean {
  return ["title", "section_header"].includes(block.label) || block.level !== undefined ||
    (block.text.length <= 100 && block.text === block.text.toUpperCase());
}

function markerFor(block: ParsedBlock): Marker | undefined {
  const text = block.text.trim();
  if (INSTRUMENT_BOUNDARY_RE.test(text) && headingLike(block)) {
    return { kind: "part", title: text, boundary: true, namespaceSegment: "scc" };
  }
  const boundary = text.match(BOUNDARY_RE);
  if (boundary && (headingLike(block) || text === `${boundary[1]} ${boundary[2]}`)) {
    return {
      kind: boundary[1].toLowerCase() as StructuralNodeKind,
      label: boundary[2],
      title: boundary[3] || boundary[4],
      boundary: true,
    };
  }

  const explicit = text.match(EXPLICIT_NUMBER_RE);
  if (explicit) {
    const prefix = explicit[1].toLowerCase();
    return {
      kind: prefix === "article" ? "article" : prefix === "section" ? "section" : "clause",
      label: explicit[2],
      title: explicit[3],
      numberingPath: explicit[2].match(/\d+|\([a-zivxlcdm]+\)/gi) ?? [explicit[2]],
    };
  }

  const numbered = text.match(NUMBER_RE);
  if (numbered) {
    const dotted = numbered[1].includes(".") || numbered[1].includes("(");
    const punctuated = /^\d+(?:\.\d+)*[.)]\s/.test(text);
    if (headingLike(block) || dotted || punctuated) {
      const depth = (numbered[1].match(/\./g)?.length ?? 0) + (numbered[1].includes("(") ? 1 : 0);
      return {
        kind: depth > 0 ? "subclause" : "clause",
        label: numbered[1],
        title: numbered[2],
        numberingPath: numbered[1].match(/\d+|\([a-zivxlcdm]+\)/gi) ?? [numbered[1]],
      };
    }
  }

  const list = text.match(LIST_RE);
  if (list) return { kind: "list_item", label: `(${list[1]})`, title: list[2], numberingPath: [`(${list[1]})`] };
  if (definitionCandidate(text)) return { kind: "definition" };
  if (block.table) return { kind: "table" };
  if (block.label === "title") return { kind: "title", title: text };
  if (block.label === "section_header") return { kind: "section", title: text };
  if (block.label === "list_item") return { kind: "list_item" };
  if (block.label === "picture") return { kind: "picture" };
  return undefined;
}

function numericBase(label: string): string {
  return label.replace(/\([a-zivxlcdm]+\)$/i, "");
}

function numericParent(label: string): string | undefined {
  const paren = label.match(/^(\d+(?:\.\d+)*)\([a-zivxlcdm]+\)$/i);
  if (paren) return paren[1];
  const parts = label.split(".");
  return parts.length > 1 ? parts.slice(0, -1).join(".") : undefined;
}

function nearestScope(nodesById: Map<string, StructuralNode>, node: StructuralNode): string {
  let current: StructuralNode | undefined = node;
  while (current?.parentId) {
    current = nodesById.get(current.parentId);
    if (current && (/\b(?:europe|european|switzerland|united kingdom|uk-specific|scc)\b/i.test(`${current.title ?? ""} ${current.text}`) || current.signals.includes("namespace_boundary"))) return current.nodeId;
  }
  return node.namespace === "main" ? [...nodesById.values()].find((n) => n.kind === "document")?.nodeId ?? node.nodeId : node.nodeId;
}

export function buildPhysicalHierarchy(parsed: ParsedDocument, documentVersionId: string): HierarchyResult {
  const rootId = stableId(documentVersionId, "#/body", "document");
  const root: StructuralNode = {
    nodeId: rootId, kind: "document", childIds: [], order: 0, namespace: "main", ordinalPath: "document", text: "",
    sourceRange: [0, parsed.canonicalText.length], sourceItemRefs: ["#/body"], provenance: [],
    confidence: 1, signals: ["canonical_root"],
  };
  const nodes: StructuralNode[] = [root];
  const nodesById = new Map([[rootId, root]]);
  const warnings: StructureWarning[] = [];
  const numberIndex = new Map<string, string[]>();
  const definitionMetaByNodeId = new Map<string, DefinitionCandidate>();
  const headingStack: Array<{ level: number; nodeId: string; namespace: string }> = [];
  const listStack: Array<{ rank: number; nodeId: string; ownerId: string }> = [];
  let scopeId = rootId;
  let namespace = "main";
  let currentContainerId = rootId;
  const ordinalCounts = new Map<string, number>();

  const attach = (node: StructuralNode, parentId: string) => {
    node.parentId = parentId;
    const parent = nodesById.get(parentId);
    const segment = node.signals.includes("local_numbering_restart")
      ? `item_${node.displayLabel?.split(".").at(-1) ?? node.order}`
      : node.displayLabel
        ? `${node.kind}_${node.displayLabel}`
        : `${node.kind}_${node.title?.slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || node.order}`;
    const basePath = `${parent?.ordinalPath ?? "document"}.${segment}`;
    const occurrence = (ordinalCounts.get(basePath) ?? 0) + 1;
    ordinalCounts.set(basePath, occurrence);
    node.ordinalPath = occurrence === 1 ? basePath : `${basePath}~${occurrence}`;
    nodes.push(node);
    nodesById.set(node.nodeId, node);
    nodesById.get(parentId)?.childIds.push(node.nodeId);
  };

  const isAncestor = (candidateId: string, descendantId: string): boolean => {
    let current = nodesById.get(descendantId);
    while (current) {
      if (current.nodeId === candidateId) return true;
      current = current.parentId ? nodesById.get(current.parentId) : undefined;
    }
    return false;
  };

  for (const block of parsed.blocks) {
    let marker = markerFor(block);
    let recoveredSplitNumbering = false;
    const activeBefore = nodesById.get(currentContainerId);
    const splitNumber = marker?.label?.match(/^\d+$/) && marker.title?.match(/^(\d+)\s+(.+)$/);
    if (marker?.label && splitNumber && new RegExp(`^${marker.label}\\.\\s*${splitNumber[1]}\\s+`).test(block.text) &&
        activeBefore?.displayLabel?.startsWith(`${marker.label}.`)) {
      const recoveredLabel = `${marker.label}.${splitNumber[1]}`;
      marker = {
        kind: "subclause",
        label: recoveredLabel,
        title: splitNumber[2],
        numberingPath: recoveredLabel.split("."),
      };
      recoveredSplitNumbering = true;
    }
    const candidateDefinition = definitionCandidate(block.text);
    let kind: StructuralNodeKind = candidateDefinition ? "definition" : marker?.kind ?? "paragraph";
    let parentId = currentContainerId || scopeId;
    const signals: string[] = [`docling_label:${block.label}`];
    if (recoveredSplitNumbering) signals.push("recovered_split_numbering");

    if (marker?.boundary) {
      const segment = marker.namespaceSegment ?? `${marker.kind}:${String(marker.label).toLowerCase()}`;
      const nestedBoundary = namespace !== "main" && (Boolean(marker.namespaceSegment) || ["appendix", "annex", "exhibit"].includes(marker.kind));
      parentId = nestedBoundary ? scopeId : rootId;
      namespace = nestedBoundary ? `${namespace}/${segment}` : segment;
      headingStack.length = 0;
      listStack.length = 0;
      signals.push("standalone_boundary_heading", "namespace_boundary");
    } else if (marker?.label && marker.numberingPath) {
      const label = marker.label.toLowerCase();
      const parentLabel = numericParent(label);
      const candidates = parentLabel ? numberIndex.get(`${namespace}|${parentLabel}`) ?? [] : [];
      let indexedParent = [...candidates].reverse().find((candidate) => isAncestor(candidate, currentContainerId));
      const active = nodesById.get(currentContainerId);
      if (!indexedParent && parentLabel && candidates.length && active?.displayLabel && /^\d+$/.test(active.displayLabel)) {
        parentId = active.nodeId;
        signals.push("local_numbering_restart");
      } else if (!indexedParent && parentLabel && active?.signals.includes("local_numbering_restart") && active.parentId && active.displayLabel?.split(".")[0] === parentLabel) {
        parentId = active.parentId;
        signals.push("local_numbering_restart");
      } else {
        indexedParent ??= candidates.length === 1 && isAncestor(candidates[0], currentContainerId) ? candidates[0] : undefined;
        parentId = indexedParent ?? scopeId;
      }
      if (parentLabel && !indexedParent && !signals.includes("local_numbering_restart")) {
        warnings.push({ code: "numbered_parent_missing", severity: "critical",
          message: `Numbered provision ${marker.label} has no matching parent ${parentLabel} in namespace ${namespace}.`,
          sourceItemRef: block.sourceItemRef });
        signals.push("missing_numbered_parent");
      } else {
        signals.push(indexedParent ? "longest_number_prefix" : "scope_root");
      }
      listStack.length = 0;
    } else if (kind === "list_item") {
      const token = marker?.label?.replace(/[()]/g, "") ?? "";
      const isRoman = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(token);
      const rank = /^\d+$/.test(token) ? 1 : isRoman && listStack.length ? 3 : 2;
      while (listStack.length && (listStack.at(-1)!.rank >= rank || listStack.at(-1)!.ownerId !== currentContainerId)) listStack.pop();
      parentId = listStack.at(-1)?.nodeId ?? currentContainerId;
      signals.push("legal_enumeration_stack");
    } else if (kind === "section" && block.level !== undefined) {
      while (headingStack.length && (headingStack.at(-1)!.level >= block.level || headingStack.at(-1)!.namespace !== namespace)) headingStack.pop();
      parentId = headingStack.at(-1)?.nodeId ?? scopeId;
      signals.push("docling_heading_level");
    }

    const definedTerm = candidateDefinition?.term;
    const node: StructuralNode = {
      nodeId: stableId(documentVersionId, block.sourceItemRef, kind), kind, parentId, childIds: [],
      order: nodes.length, namespace, ordinalPath: "", displayLabel: marker?.label, numberingPath: marker?.numberingPath,
      title: marker?.title, text: block.text, sourceRange: block.sourceRange,
      sourceItemRefs: [block.sourceItemRef], provenance: block.provenance,
      confidence: marker ? 0.98 : 0.9, signals, definedTerm, table: block.table,
      pageStart: block.provenance.map((record) => record.page).filter((page): page is number => page !== undefined).sort((a, b) => a - b)[0],
      pageEnd: block.provenance.map((record) => record.page).filter((page): page is number => page !== undefined).sort((a, b) => b - a)[0],
    };
    attach(node, parentId);
    if (candidateDefinition) definitionMetaByNodeId.set(node.nodeId, candidateDefinition);

    if (marker?.boundary) {
      scopeId = node.nodeId;
      currentContainerId = node.nodeId;
    } else if (marker?.label && marker.numberingPath) {
      const label = marker.label.toLowerCase();
      const exactKey = `${namespace}|${label}`;
      numberIndex.set(exactKey, [...(numberIndex.get(exactKey) ?? []), node.nodeId]);
      if (!/\([a-zivxlcdm]+\)$/i.test(label)) {
        const baseKey = `${namespace}|${numericBase(label)}`;
        if (baseKey !== exactKey) numberIndex.set(baseKey, [...(numberIndex.get(baseKey) ?? []), node.nodeId]);
      }
      currentContainerId = node.nodeId;
    } else if (kind === "section" && block.level !== undefined) {
      headingStack.push({ level: block.level, nodeId: node.nodeId, namespace });
      currentContainerId = node.nodeId;
    } else if (kind === "list_item") {
      const token = marker?.label?.replace(/[()]/g, "") ?? "";
      const isRoman = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(token);
      listStack.push({ rank: /^\d+$/.test(token) ? 1 : isRoman && listStack.length ? 3 : 2, nodeId: node.nodeId, ownerId: currentContainerId });
    }
  }

  const structuralEdges: StructuralEdge[] = [];
  for (const parent of nodes) {
    for (const childId of parent.childIds) structuralEdges.push({ edgeType: "parent_of", sourceNodeId: parent.nodeId, targetNodeId: childId });
    for (let index = 1; index < parent.childIds.length; index++) {
      structuralEdges.push({ edgeType: "next_sibling", sourceNodeId: parent.childIds[index - 1], targetNodeId: parent.childIds[index] });
    }
  }

  // A numbered definition is structurally handled like its original clause,
  // then promoted semantically. This preserves numbering parents while
  // allowing the definition index to work independently of node segmentation.
  for (const node of nodes) {
    if (node.kind === "definition" || node.kind === "document") continue;
    let candidate = definitionCandidate(node.text);
    const parent = node.parentId ? nodesById.get(node.parentId) : undefined;
    if (!candidate && node.displayLabel && node.title && parent && /\bdefinitions?\b/i.test(`${parent.title ?? ""} ${parent.text}`) && validDefinitionTerm(node.title, false)) {
      candidate = { term: node.title.trim(), sourceKind: "local_definition" };
    }
    if (candidate) {
      node.kind = "definition";
      node.definedTerm = candidate.term;
      node.signals.push("definition_promoted_after_segmentation");
      definitionMetaByNodeId.set(node.nodeId, candidate);
    }
  }
  const definitions: ScopedDefinition[] = nodes.filter((node) => node.definedTerm).map((node) => {
    const candidate = definitionMetaByNodeId.get(node.nodeId)!;
    return {
      term: node.definedTerm!, termNormalized: node.definedTerm!.toLowerCase().replace(/\s+/g, " ").trim(),
      definitionNodeId: node.nodeId, scopeNodeId: nearestScope(nodesById, node), evidenceRange: node.sourceRange,
      sourceKind: candidate.sourceKind, externalSourceMention: candidate.externalSourceMention,
    };
  });
  return { nodes, structuralEdges, definitions, warnings };
}
