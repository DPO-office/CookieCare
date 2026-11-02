import type { EvaluationJudge, JudgeDecision, JudgeInput } from "./review-dataset.js";
import { hashRevision } from "../schemas/common.js";

type RecordValue = Record<string, any>;

export interface FocusedJudgeCall {
  caseId: string;
  field: string;
  kind: "expected" | "forbidden";
  inputCharacters: number;
  verdict: "pass" | "fail" | "needs_review";
  found?: boolean;
  reason: string;
  attempts: number;
  failureCategory?: "evidence_too_large" | "missing_evidence" | "invalid_judge_response" | "judge_request_error";
  reused?: boolean;
  inputHash?: string;
}

export interface FocusedGraphJudgeOptions {
  maxAttempts?: number;
  previousCalls?: FocusedJudgeCall[];
  onProgress?: (calls: readonly FocusedJudgeCall[]) => void | Promise<void>;
}

const words = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const mentionWords = (value: unknown) => words(value).replace(/^(?:the|a|an)\s+/u, "");
const mentionCompatible = (actual: unknown, expected: unknown) => {
  const found = mentionWords(actual), wanted = mentionWords(expected);
  return Boolean(wanted) && (found === wanted || found.endsWith(` ${wanted}`) || found.startsWith(`${wanted} `) || found.includes(wanted));
};
const tokens = (value: unknown) => new Set(words(value).split(" ").filter(token => token.length > 2));
const short = (value: unknown) => String(value).slice(0, 900);
const failureCategory = (error: unknown): NonNullable<FocusedJudgeCall["failureCategory"]> => {
  const message = error instanceof Error ? error.message : String(error);
  if (/evidence.*too large|exceeds.*limit/iu.test(message)) return "evidence_too_large";
  if (/evidence missing|source.*missing/iu.test(message)) return "missing_evidence";
  if (/omitted or renamed|invalid.*response|parse/iu.test(message)) return "invalid_judge_response";
  return "judge_request_error";
};
const identity = (value: unknown) => words(value).replace(/^the /u, "");
const matchesIdentity = (provision: RecordValue, label: string) =>
  identity(provision.canonicalCitation ?? provision.label) === identity(label) ||
  provision.kind === "schedule" && identity(label) === "schedule" &&
    identity(provision.canonicalCitation ?? provision.label).endsWith(" schedule");
const hasCompatibleKind = (expected: string, relation: RecordValue) =>
  relation.semanticStatus !== "needs_review" &&
  [relation.referenceType, relation.relationType].some(actual => typeof actual === "string" &&
    referenceTypeCompatible(expected, actual));
const graphNodes = (graph: RecordValue) => Array.isArray(graph.provisions) ? graph.provisions as RecordValue[] : [];

export function referenceTypeCompatible(expected: string, actual: string): boolean {
  return expected === actual || expected === "explicit_reference" &&
    ["explicit_relative_reference", "explicit_procedural_reference"].includes(actual);
}

export function deterministicGraphCheck(input: JudgeInput, field: string, expected: any) {
  const graph = input.evidence[0]?.value as RecordValue | undefined;
  if (!graph) return null;
  const completeGraph = graph.selection?.completeGraph === true;
  const nodesAll = graphNodes(graph);
  if (completeGraph && ["act_section_count", "chapter_count"].includes(field) && typeof expected === "number") {
    const found = new Set(nodesAll.filter(p => field === "chapter_count" ? p.kind === "chapter" :
      ["section", "article", "rule"].includes(p.kind) && /^(Section|Article|Rule)\s+\w+$/u.test(p.canonicalCitation ?? ""))
      .map(p => identity(p.canonicalCitation ?? p.label))).size;
    return { field, verdict: found === expected ? "pass" as const : "fail" as const,
      reason: `Complete graph contains ${found} distinct units; expected ${expected}.` };
  }
  if (!expected || typeof expected !== "object") return null;
  if (completeGraph && Array.isArray(expected) && field === "lettered_points") {
    const missing = expected.filter(label => !nodesAll.some(p => matchesIdentity(p, label)));
    return { field, verdict: missing.length ? "fail" as const : "pass" as const,
      reason: missing.length ? `Missing canonical nodes: ${missing.join(", ")}` : "Every required point exists in the complete graph." };
  }
  if (field === "boundary" && expected.provision && expected.nextProvision) {
    const nodes = graphNodes(graph);
    const subsection = nodes.find(node => matchesIdentity(node, expected.provision));
    const next = nodes.find(node => matchesIdentity(node, expected.nextProvision));
    if (subsection && next && Array.isArray(subsection.sourceRanges)) {
      const pages = new Set(subsection.sourceRanges.map((range: RecordValue) => range.page));
      const correct = pages.has(expected.startsOnPage) && pages.has(expected.continuesOnPage) &&
        subsection.end <= next.start;
      return { field, verdict: correct ? "pass" as const : "fail" as const,
        reason: correct ? "The provision has the required pages and ends before the next provision." :
          "The provision does not have the required page span or boundary." };
    }
  }
  if (field === "illustrations_parent" && typeof expected.parent === "string") {
    const nodes = graphNodes(graph);
    const parent = nodes.find(node => matchesIdentity(node, expected.parent));
    const next = nodes.find(node => matchesIdentity(node, expected.before));
    if (parent && next) {
      const illustrations = nodes.filter(node => node.kind === expected.kind &&
        node.start >= parent.start && node.start < next.start);
      const byId = new Map(nodes.map(node => [node.id, node]));
      const attached = (node: RecordValue) => {
        let cursor = node.parentId;
        const seen = new Set<string>();
        while (cursor && !seen.has(cursor)) {
          if (cursor === parent.id) return true;
          seen.add(cursor);
          cursor = byId.get(cursor)?.parentId;
        }
        return false;
      };
      const correct = illustrations.length > 0 && illustrations.every(attached);
      return { field, verdict: correct ? "pass" as const : "fail" as const,
        reason: correct ? "Illustrations before the next subsection belong to the specified parent." :
          "Illustrations before the next subsection are missing or attached to another parent." };
    }
  }
  if (field.startsWith("section-start:") && typeof expected.first_line_exact_text === "string" &&
      typeof expected.physical_page === "number" && Array.isArray(graph.provisions)) {
    const normal = (text: string) => text.replace(/\s+/gu, " ")
      .replace(/\(\s*/gu, "(").replace(/\s*\)/gu, ")").replace(/[\u2010-\u2015]/gu, "-").trim();
    const found = graph.provisions.filter((p: any) => ["section", "article", "rule"].includes(p.kind) &&
      normal(`${p.sourceMarker && !String(p.text).trimStart().startsWith(p.sourceMarker) ? p.sourceMarker + " " : ""}${p.text ?? ""}`)
        .startsWith(normal(expected.first_line_exact_text)));
    if (!found.length) return null; // Absence in a selected view is not proof of absence in the source.
    const pages = found.flatMap((p: any) => {
      const spans = p.sourceRanges ?? p.sourceSpans ?? [];
      const start = typeof p.start === "number" ? p.start + String(p.text).search(/\S/u) : null;
      if (start !== null) return spans.filter((s: any) => s.start <= start && s.end > start)
        .map((s: any) => s.page ?? s.physicalPage);
      const uniquePages = [...new Set(spans.map((s: any) => s.page ?? s.physicalPage))];
      return uniquePages.length === 1 ? uniquePages : [];
    });
    if (pages.includes(expected.physical_page)) return { field, verdict: "pass" as const,
      reason: "Exact first-line wording and physical page are present in saved graph evidence." };
  }
  if (field.startsWith("edge:") && typeof expected.relation === "string" &&
      Object.keys(expected).every(key => ["from", "to", "relation", "source_words", "explanation"].includes(key))) {
    const source = graphNodes(graph).find(node => matchesIdentity(node, expected.from));
    const target = graphNodes(graph).find(node => matchesIdentity(node, expected.to));
    const sourceMatches = graphNodes(graph).filter(node => matchesIdentity(node, expected.from));
    const targetMatches = graphNodes(graph).filter(node => matchesIdentity(node, expected.to));
    if (sourceMatches.length > 1 || targetMatches.length > 1) return { field, verdict: "needs_review" as const,
      reason: "Ambiguous canonical identity: more than one node matches an endpoint." };
    const edge = graph.relationships?.find((r: any) => (source ? r.sourceId === source.id :
      identity(r.sourceLabel) === identity(expected.from)) &&
      (target ? r.targetIds?.includes(target.id) : r.targetLabels?.some((label: string) =>
        identity(label) === identity(expected.to))) && ["proposed", "resolved"].includes(r.status) &&
      (!expected.source_words || mentionCompatible(r.exactMention, expected.source_words)) &&
      hasCompatibleKind(expected.relation, r));
    if (edge) return { field, verdict: "pass" as const,
      reason: "Saved edge has matching source, target, mention and compatible reference subtype." };
    // A broad semantic kind plus role/condition requires source-backed interpretation.
    // Exact spelling of a fixture's semantic name is not a factual edge-existence check.
    const structuralKind = ["explicit_reference", "explicit_relative_reference", "range_reference", "defined_term"].includes(expected.relation);
    if (!structuralKind) return null;
    if (completeGraph && (!source || !target)) return { field, verdict: "fail" as const,
      reason: `Missing canonical ${!source ? "source" : "target"} node in the complete graph.` };
    if (source && target) return { field, verdict: "fail" as const,
      reason: "Source and target nodes exist, but no matching directed relationship is saved." };
  }
  if (field.startsWith("path:") && Array.isArray(expected.path) &&
      expected.path.length === expected.relation_sequence?.length + 1) {
    const nodes = expected.path.map((label: string) => graphNodes(graph).find(node => matchesIdentity(node, label)));
    if (nodes.every(Boolean)) {
      if (expected.relation_sequence.some((kind: string) => !["contains", "explicit_reference", "explicit_relative_reference", "range_reference", "defined_term"].includes(kind))) return null;
      const complete = expected.relation_sequence.every((kind: string, index: number) => {
        const from = nodes[index]!, to = nodes[index + 1]!;
        if (kind === "contains") return to.parentId === from.id;
        return graph.relationships?.some((relation: RecordValue) => relation.sourceId === from.id &&
          relation.targetIds?.includes(to.id) && ["proposed", "resolved"].includes(relation.status) &&
          hasCompatibleKind(kind, relation));
      });
      return { field, verdict: complete ? "pass" as const : "fail" as const,
        reason: complete ? "Every directed edge and parent link in the saved path exists." :
          "One or more directed edges or parent links in the saved path are absent." };
    }
    if (completeGraph && nodes.some((node: any) => !node)) return { field, verdict: "fail" as const,
      reason: "At least one canonical node in the required path is absent from the complete graph." };
  }
  return null;
}

function score(provision: RecordValue, value: unknown): number {
  if (value === null || value === undefined) return 0;
  const expected = typeof value === "object" ? value as RecordValue : { text_hint: String(value) };
  const exact = expected.exact_source_text ?? expected.first_line_exact_text ?? expected.breach_exact_text ?? expected.text_hint ?? "";
  const expectedTokens = tokens(exact);
  const observedTokens = tokens(provision.text);
  const overlap = expectedTokens.size ? [...expectedTokens].filter(token => observedTokens.has(token)).length /
    expectedTokens.size : 0;
  const identity = expected.id ?? expected.from ?? expected.section ?? expected.path?.[0] ?? "";
  const id = words(identity);
  const label = words(provision.label);
  const headingMatch = id && (label.startsWith(id) || words(provision.text).startsWith(id)) ? 1 : 0;
  const section = /^(?:Section\s+)?(\d+(?:\.\d+)*)(?:\(([^)]+)\))?$/i.exec(String(identity));
  const lead = String(provision.text ?? "").trimStart();
  const numberedHeading = section ? section[2]
    ? new RegExp(`^(?:${section[1]}\\.\\s*)?\\(\\s*${section[2]}\\s*\\)`).test(lead) &&
      (section[2] !== "1" || lead.startsWith(`${section[1]}.`) || words(provision.parentLabel).includes(`section ${section[1]}`))
    : new RegExp(`^${section[1]}\\.`).test(lead) : false;
  return overlap * 4 + headingMatch * 10 + (numberedHeading ? 12 : 0);
}

function sourceForField(input: JudgeInput, value: unknown) {
  const selector = words(JSON.stringify(value));
  const ranked = [...input.source].sort((a, b) => {
    const scoreRef = (ref: string) => tokens(ref).size ? [...tokens(ref)].filter(token => selector.includes(token)).length : 0;
    return scoreRef(b.ref) - scoreRef(a.ref);
  });
  let budget = 16_000;
  return ranked.map(item => {
    const text = item.text.slice(0, Math.max(0, Math.min(12_000, budget)));
    budget -= text.length;
    return { ref: item.ref, text, sourceTruncated: text.length !== item.text.length };
  }).filter(item => item.text);
}

export function focusGraphJudgeInput(input: JudgeInput, field: string, expected: unknown,
  forbidden: string[] = []): JudgeInput {
  const artifact = input.evidence[0]?.value as RecordValue | undefined;
  if (!artifact || !Array.isArray(artifact.provisions) || !Array.isArray(artifact.relationships))
    throw new Error(`Graph evidence missing for ${input.caseId}`);
  const provisions: RecordValue[] = artifact.provisions;
  const isSectionStart = field.startsWith("section-start:");
  const structuralOverview = isSectionStart || field.startsWith("chapter:") ||
    ["act_section_count", "chapter_count", "schedule_presence"].includes(field);
  const ranked = [...provisions].map(provision => ({ provision, rank: score(provision, expected) }))
    .sort((a, b) => b.rank - a.rank);
  const requirement = expected && typeof expected === "object" ? expected as RecordValue : {};
  const named = field.startsWith("node:") ? [field.slice(5)] :
    field.startsWith("edge:") ? [requirement.from, requirement.to] :
      field.startsWith("path:") ? requirement.path ?? [] :
        field === "boundary" && requirement.provision ? [requirement.provision, requirement.nextProvision] :
          field === "illustrations_parent" ? [requirement.parent, requirement.before] :
            field.startsWith("inherited-condition:") ? requirement.children ?? field.slice("inherited-condition:".length).split(",") :
              field === "lettered_points" && Array.isArray(expected) ? expected : [];
  if (!named.length && !structuralOverview) {
    for (const key of Object.keys(input.expected)) if (/^node:(?:Section|Article|Rule)\s+\w+$/u.test(key)) named.push(key.slice(5));
  }
  const exact = provisions.filter(provision => named.some((label: string) => matchesIdentity(provision, label)));
  const ancestorNodes = exact.flatMap(node => {
    const ancestors: RecordValue[] = [], seen = new Set<string>();
    let cursor = node.parentId;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor); const parent = provisions.find(p => p.id === cursor);
      if (!parent) break; ancestors.push(parent); cursor = parent.parentId;
    }
    return ancestors;
  });
  let detailed = [...new Map([...exact, ...ancestorNodes, ...ranked.filter(row => row.rank > 0)
    .slice(0, structuralOverview ? 1 : 3).map(row => row.provision)]
    .map(provision => [provision.id, provision])).values()].slice(0, 5);
  if (!detailed.length && provisions.length) detailed = provisions.slice(0, 3);
  const nearIds = new Set(detailed.map(provision => provision.id));
  for (const provision of detailed) if (provision.parentId) nearIds.add(provision.parentId);
  for (const provision of provisions) if (provision.parentId && nearIds.has(provision.parentId))
    nearIds.add(provision.id);
  const relations: RecordValue[] = artifact.relationships;
  const relevantRelations = relations.filter(relation => nearIds.has(relation.sourceId) ||
    relation.targetIds?.some((id: string) => nearIds.has(id))).sort((a, b) => {
      const priority = (r: RecordValue) => Number(exact.some(p => p.id === r.sourceId)) * 2 +
        Number(r.targetIds?.some((id: string) => exact.some(p => p.id === id)));
      return priority(b) - priority(a);
    });
  const relationFacts = relevantRelations.slice(0, 40).map(relation => ({
    sourceId: relation.sourceId,
    sourceLabel: relation.sourceLabel?.slice(0, 120),
    targetIds: relation.targetIds,
    targetLabels: relation.targetLabels?.map((label: string) => label?.slice(0, 120)),
    relationType: relation.relationType ?? relation.kind ?? relation.type ?? "explicit_reference",
    referenceType: relation.referenceType,
    semanticRole: relation.semanticRole,
    semanticCondition: relation.semanticCondition,
    semanticStatus: relation.semanticStatus,
    semanticIssues: relation.semanticIssues,
    exactMention: relation.exactMention,
    status: relation.status,
    range: relation.range,
    external: relation.external,
  }));
  const includeTables = !structuralOverview &&
    /schedule|table|row|penalty/i.test(field + " " + JSON.stringify(expected) + " " + forbidden.join(" "));
  const evidence = {
    evaluationInstructions: "Check legal meaning using kind, role, condition and source evidence together. " +
      "Generic refers_to is not proof of an exemption. parentId represents containment. " +
      "Omitted text or relationships are not evidence of absence; use needs_review when the packet cannot establish a claim.",
    graphFacts: { completeGraphAvailable: artifact.selection?.completeGraph === true,
      totalProvisions: provisions.length, totalRelationships: relations.length,
      requestedNodes: named.map((label: string) => ({ label,
        matchingIds: provisions.filter(p => matchesIdentity(p, label)).map(p => p.id) })),
      omittedRelevantRelationships: Math.max(0, relevantRelations.length - relationFacts.length) },
    selection: artifact.selection,
    sourcePageInventory: artifact.sourcePageInventory ?? null,
    inventory: (structuralOverview ? provisions.filter(provision =>
      isSectionStart || field === "act_section_count" ?
        ["section", "article", "rule"].includes(provision.kind) &&
          /^\s*\d+\./u.test(String(provision.text ?? "")) :
        ["section", "article", "rule", "chapter", "schedule", "annex"].includes(provision.kind)) :
      (provisions.length <= 40 ? provisions : provisions.filter(provision => nearIds.has(provision.id))).slice(0, 40)).map(provision => ({ id: provision.id, kind: provision.kind,
      label: provision.label?.slice(0, 130), parentId: provision.parentId,
      parentLabel: provision.parentLabel?.slice(0, 130),
      textStart: provision.text?.slice(0, 80), boundaryStatus: provision.boundaryStatus,
      canonicalCitation: provision.canonicalCitation,
      sourceRanges: provision.sourceRanges?.slice(0, structuralOverview ? 2 : 8),
      status: provision.status })),
    detailedProvisions: (() => {
      let textBudget = 18_000;
      return detailed.map(provision => {
        const text = String(provision.text ?? "").slice(0, Math.min(textBudget,
          structuralOverview ? 2_000 : 8_000));
        textBudget -= text.length;
        return { ...provision, text, textTruncated: text.length < String(provision.text ?? "").length,
          label: provision.label?.slice(0, 160), sourceRanges: provision.sourceRanges?.slice(0, 4) };
      });
    })(),
    detailSelection: { policy: "named nodes and nearby lexical candidates",
      candidateCount: detailed.length, totalCount: provisions.length,
      fullTextOmittedForOtherNodes: true },
    relationships: structuralOverview ? [] : relationFacts,
    contextPaths: field.startsWith("path:") ? (artifact.contextPaths ?? [])
      .filter((path: RecordValue) => nearIds.has(path.targetId)).slice(0, 10)
      .map((path: RecordValue) => ({ target: path.target?.slice(0, 130), complete: path.complete,
        paths: path.paths?.slice(0, 5), unresolved: path.unresolved?.slice(0, 5),
        missing: path.missing?.slice(0, 12) })) : [],
    tables: includeTables ? (artifact.tables ?? []).map((table: RecordValue) => ({
      id: table.id, provisionId: table.provisionId, continuationStatus: table.continuationStatus,
      cells: field.startsWith("schedule-row:") ? table.cells?.filter((cell: RecordValue) =>
        cell.isHeader || cell.row === Number(field.slice("schedule-row:".length))) : table.cells,
    })) : [],
  };
  const focused: JudgeInput = { ...input, expected: field ? { [field]: expected } : {}, forbidden,
    source: sourceForField(input, expected ?? forbidden.join(" ")),
    evidence: [{ ref: input.evidence[0]!.ref, value: evidence }] };
  if (!structuralOverview && !detailed.length && !(forbidden.length && provisions.length <= 80))
    throw new Error(`Graph evidence missing for ${input.caseId}/${field}: no relevant provision selected`);
  if (JSON.stringify(focused).length > 140_000)
    throw new Error(`Focused graph evidence remains too large for ${input.caseId}/${field}`);
  return focused;
}

/** Each graph fact gets a bounded prompt and its own verdict. Failed calls remain review-required. */
export class FocusedGraphJudge implements EvaluationJudge {
  readonly model: string;
  readonly calls: FocusedJudgeCall[];
  private completedCalls = 0;
  private readonly maxAttempts: number;
  private readonly onProgress?: FocusedGraphJudgeOptions["onProgress"];
  private inputHash = "";

  constructor(private readonly delegate: EvaluationJudge, options: FocusedGraphJudgeOptions = {}) {
    this.model = delegate.model;
    this.maxAttempts = Math.max(1, Math.min(3, options.maxAttempts ?? 1));
    this.calls = [...(options.previousCalls ?? [])];
    this.onProgress = options.onProgress;
  }

  private reusable(caseId: string, field: string) {
    return this.calls.find(call => call.caseId === caseId && call.field === field && call.inputHash === this.inputHash &&
      (call.verdict === "pass" || call.verdict === "fail"));
  }

  private async save(call: FocusedJudgeCall) {
    call.inputHash = this.inputHash;
    this.calls.push(call);
    await this.onProgress?.(this.calls);
  }

  private async callJudge(input: JudgeInput, field: string, focused: JudgeInput):
    Promise<{ decision: JudgeDecision; attempts: number }> {
    const total = Object.keys(input.expected).length + input.forbidden.length;
    const number = ++this.completedCalls;
    const size = JSON.stringify(focused).length;
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const started = Date.now();
      process.stdout.write(`[judge ${number}/${total}] ${input.caseId} · ${field} · ${size.toLocaleString()} chars · attempt ${attempt}/${this.maxAttempts} · sending...\n`);
      const timer = setInterval(() => {
        process.stdout.write(`[judge ${number}/${total}] ${field} · attempt ${attempt}/${this.maxAttempts} · still waiting · ${Math.round((Date.now() - started) / 1000)}s\n`);
      }, 15_000);
      try {
        const decision = await this.delegate.judge(focused);
        process.stdout.write(`[judge ${number}/${total}] ${field} · response received in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
        return { decision, attempts: attempt };
      } catch (error) {
        lastError = error;
        process.stdout.write(`[judge ${number}/${total}] ${field} · attempt ${attempt}/${this.maxAttempts} failed after ${((Date.now() - started) / 1000).toFixed(1)}s: ${error instanceof Error ? error.message : String(error)}\n`);
        if (attempt < this.maxAttempts) process.stdout.write(`[judge ${number}/${total}] retrying only this check; completed checks are kept.\n`);
      } finally { clearInterval(timer); }
    }
    throw lastError;
  }

  async judge(input: JudgeInput): Promise<JudgeDecision> {
    this.inputHash = hashRevision({ evaluator: "focused-graph-v7", model: this.model, input });
    this.completedCalls = 0;
    const fields: JudgeDecision["fields"] = [];
    const total = Object.keys(input.expected).length + input.forbidden.length;
    process.stdout.write(`Scoring ${input.caseId}: ${total} focused checks (${Object.keys(input.expected).length} expected facts, ${input.forbidden.length} forbidden claims). Each failed response gets ${this.maxAttempts} attempt(s).\n`);
    for (const [field, expected] of Object.entries(input.expected)) {
      const deterministic = deterministicGraphCheck(input, field, expected);
      if (deterministic) {
        fields.push(deterministic);
        await this.save({ caseId: input.caseId, field, kind: "expected", inputCharacters: 0,
          verdict: deterministic.verdict, reason: deterministic.reason, attempts: 0 });
        continue;
      }
      const cached = this.reusable(input.caseId, field);
      if (cached) {
        fields.push({ field, verdict: cached.verdict, reason: cached.reason });
        process.stdout.write(`[judge checkpoint] ${input.caseId} · ${field} · reusing ${cached.verdict}\n`);
        continue;
      }
      let size = 0;
      try {
        const focused = focusGraphJudgeInput(input, field, expected);
        size = JSON.stringify(focused).length;
        const { decision, attempts } = await this.callJudge(input, field, focused);
        let found = decision.fields.find(item => item.field === field);
        if (!found) {
          const normalize = (s: string) => s.replace(/^(node|edge|path|chapter|section-start|schedule-row|inherited-condition):/i, "").trim().toLowerCase();
          found = decision.fields.find(item => normalize(item.field) === normalize(field));
        }
        if (!found && decision.fields.length === 1 && Object.keys(focused.expected).length === 1) {
          found = decision.fields[0];
        }
        if (!found) throw new Error(`Judge omitted or renamed the requested field: expected "${field}", got ${decision.fields.map(f => `"${f.field}"`).join(", ")}`);
        const resolvedField = { ...found, field };
        fields.push(resolvedField);
        await this.save({ caseId: input.caseId, field, kind: "expected", inputCharacters: size,
          verdict: resolvedField.verdict, reason: resolvedField.reason, attempts });
      } catch (error) {
        const category = failureCategory(error);
        const reason = short(`${category}: ${error instanceof Error ? error.message : String(error)}`);
        fields.push({ field, verdict: "needs_review", reason });
        await this.save({ caseId: input.caseId, field, kind: "expected", inputCharacters: size,
          verdict: "needs_review", reason, attempts: size ? this.maxAttempts : 0,
          failureCategory: category });
      }
    }
    const forbidden: JudgeDecision["forbidden"] = [];
    for (const claim of input.forbidden) {
      const field = `forbidden:${claim}`;
      const cached = this.reusable(input.caseId, field);
      if (cached) {
        const found = cached.found ?? cached.verdict === "fail";
        forbidden.push({ claim, found, verdict: cached.verdict, reason: cached.reason });
        process.stdout.write(`[judge checkpoint] ${input.caseId} · ${field} · reusing ${cached.verdict}\n`);
        continue;
      }
      let size = 0;
      try {
        const focused = focusGraphJudgeInput(input, "", { text_hint: claim }, [claim]);
        size = JSON.stringify(focused).length;
        const { decision, attempts } = await this.callJudge(input, field, focused);
        let found = decision.forbidden.find(item => item.claim === claim);
        if (!found) {
          const normalize = (s: string) => s.replace(/^forbidden:\s*/i, "").trim().toLowerCase();
          found = decision.forbidden.find(item => normalize(item.claim) === normalize(claim));
        }
        if (!found && decision.forbidden.length === 1 && focused.forbidden.length === 1) {
          found = decision.forbidden[0];
        }
        if (!found) throw new Error(`Judge omitted or renamed the forbidden claim: expected "${claim}", got ${decision.forbidden.map(c => `"${c.claim}"`).join(", ")}`);
        const verdict = found.found ? "fail" : found.verdict ?? "pass";
        const resolvedClaim = { ...found, claim, verdict };
        forbidden.push(resolvedClaim);
        await this.save({ caseId: input.caseId, field, kind: "forbidden", inputCharacters: size,
          verdict, found: found.found, reason: found.reason, attempts });
      } catch (error) {
        const category = failureCategory(error);
        const reason = short(`${category}: ${error instanceof Error ? error.message : String(error)}`);
        forbidden.push({ claim, found: false, verdict: "needs_review", reason });
        await this.save({ caseId: input.caseId, field, kind: "forbidden", inputCharacters: size,
          verdict: "needs_review", found: false, reason, attempts: size ? this.maxAttempts : 0,
          failureCategory: category });
      }
    }
    return { fields, forbidden };
  }
}
