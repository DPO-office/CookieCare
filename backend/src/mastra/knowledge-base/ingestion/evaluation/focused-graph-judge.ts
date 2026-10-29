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
  reused?: boolean;
  inputHash?: string;
}

export interface FocusedGraphJudgeOptions {
  maxAttempts?: number;
  previousCalls?: FocusedJudgeCall[];
  onProgress?: (calls: readonly FocusedJudgeCall[]) => void | Promise<void>;
}

const words = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (value: unknown) => new Set(words(value).split(" ").filter(token => token.length > 2));
const short = (value: unknown) => String(value).slice(0, 900);

export function referenceTypeCompatible(expected: string, actual: string): boolean {
  return expected === actual || expected === "explicit_reference" &&
    ["explicit_relative_reference", "explicit_procedural_reference"].includes(actual);
}

export function deterministicGraphCheck(input: JudgeInput, field: string, expected: any) {
  const graph = input.evidence[0]?.value as RecordValue | undefined;
  if (!graph || !expected || typeof expected !== "object") return null;
  if (field.startsWith("section-start:") && typeof expected.first_line_exact_text === "string" &&
      typeof expected.physical_page === "number" && Array.isArray(graph.provisions)) {
    const normal = (text: string) => text.replace(/\s+/gu, " ").trim();
    const found = graph.provisions.filter((p: any) => ["section", "article", "rule"].includes(p.kind) &&
      normal(String(p.text ?? "")).startsWith(normal(expected.first_line_exact_text)));
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
      Object.keys(expected).every(key => ["from", "to", "relation", "source_words"].includes(key))) {
    const edge = graph.relationships?.find((r: any) => r.sourceLabel === expected.from &&
      r.targetLabels?.includes(expected.to) && ["proposed", "resolved"].includes(r.status) &&
      (!expected.source_words || r.exactMention === expected.source_words) &&
      referenceTypeCompatible(expected.relation, r.referenceType ?? r.relationType));
    if (edge) return { field, verdict: "pass" as const,
      reason: "Saved edge has matching source, target, mention and compatible reference subtype." };
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
  const section = /^(?:Section\s+)?(\d+)(?:\((\d+)\))?$/i.exec(String(identity));
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
  const detailed = ranked.slice(0, 3).filter(row => row.rank > 0).map(row => row.provision);
  const nearIds = new Set(detailed.map(provision => provision.id));
  const relations: RecordValue[] = artifact.relationships;
  const relationFacts = relations.map(relation => ({
    sourceId: relation.sourceId,
    sourceLabel: relation.sourceLabel?.slice(0, 120),
    targetIds: relation.targetIds,
    targetLabels: relation.targetLabels?.map((label: string) => label?.slice(0, 120)),
    relationType: relation.relationType ?? relation.kind ?? relation.type ?? "explicit_reference",
    referenceType: relation.referenceType,
    exactMention: relation.exactMention,
    status: relation.status,
    range: relation.range,
    external: relation.external,
  }));
  const includeTables = !structuralOverview &&
    /schedule|table|row|penalty/i.test(field + " " + JSON.stringify(expected) + " " + forbidden.join(" "));
  const evidence = {
    selection: artifact.selection,
    sourcePageInventory: artifact.sourcePageInventory ?? null,
    inventory: (structuralOverview ? provisions.filter(provision =>
      isSectionStart || field === "act_section_count" ?
        ["section", "article", "rule"].includes(provision.kind) &&
          /^\s*\d+\./u.test(String(provision.text ?? "")) :
        ["section", "article", "rule", "chapter", "schedule", "annex"].includes(provision.kind)) :
      provisions).map(provision => ({ id: provision.id, kind: provision.kind,
      label: provision.label?.slice(0, 130), parentId: provision.parentId,
      parentLabel: provision.parentLabel?.slice(0, 130),
      textStart: provision.text?.slice(0, 80), boundaryStatus: provision.boundaryStatus,
      canonicalCitation: provision.canonicalCitation, sourceRanges: provision.sourceRanges,
      sourceSpans: provision.sourceSpans,
      status: provision.status })),
    detailedProvisions: detailed.map(provision => ({ ...provision,
      ...(structuralOverview ? { text: String(provision.text ?? "").slice(0, 2_000) } : {}),
      label: provision.label?.slice(0, 160), sourceRanges: provision.sourceRanges?.slice(0, 4) })),
    detailSelection: { policy: "top lexical candidates plus complete compact inventory",
      candidateCount: detailed.length, totalCount: provisions.length,
      fullTextOmittedForOtherNodes: true },
    relationships: structuralOverview ? [] : relationFacts,
    contextPaths: field.startsWith("path:") ? (artifact.contextPaths ?? [])
      .filter((path: RecordValue) => nearIds.has(path.targetId))
      .map((path: RecordValue) => ({ target: path.target?.slice(0, 130), complete: path.complete,
        paths: path.paths?.slice(0, 12), unresolved: path.unresolved?.slice(0, 12),
        missing: path.missing?.slice(0, 12) })) : [],
    tables: includeTables ? artifact.tables ?? [] : [],
  };
  const focused: JudgeInput = { ...input, expected: field ? { [field]: expected } : {}, forbidden,
    source: sourceForField(input, expected ?? forbidden.join(" ")),
    evidence: [{ ref: input.evidence[0]!.ref, value: evidence }] };
  if (JSON.stringify(focused).length > 100_000)
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
    this.inputHash = hashRevision({ evaluator: "focused-graph-v4", model: this.model, input });
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
        const reason = short(`Judge error after ${this.maxAttempts} attempts: ${error instanceof Error ? error.message : String(error)}`);
        fields.push({ field, verdict: "needs_review", reason });
        await this.save({ caseId: input.caseId, field, kind: "expected", inputCharacters: size,
          verdict: "needs_review", reason, attempts: this.maxAttempts });
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
        const reason = short(`Judge error after ${this.maxAttempts} attempts: ${error instanceof Error ? error.message : String(error)}`);
        forbidden.push({ claim, found: false, verdict: "needs_review", reason });
        await this.save({ caseId: input.caseId, field, kind: "forbidden", inputCharacters: size,
          verdict: "needs_review", found: false, reason, attempts: this.maxAttempts });
      }
    }
    return { fields, forbidden };
  }
}
