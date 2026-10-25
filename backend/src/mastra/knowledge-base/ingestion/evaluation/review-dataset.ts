import { createHash } from "node:crypto";
import { z } from "zod";
import { ReviewDatasetSchema, ReviewRunSchema, SourcePackSchema,
  type ReviewDatasetCase, type ReviewRun } from "./dataset-contracts.js";

export const JudgeDecisionSchema = z.object({
  fields: z.array(z.object({ field: z.string().min(1), verdict: z.enum(["pass", "fail", "needs_review"]),
    reason: z.string().min(1).max(1_000) })),
  forbidden: z.array(z.object({ claim: z.string().min(1), found: z.boolean(),
    verdict: z.enum(["pass", "fail", "needs_review"]).optional(),
    reason: z.string().min(1).max(1_000) })),
}).strict();
export type JudgeDecision = z.infer<typeof JudgeDecisionSchema>;
export interface JudgeInput {
  caseId: string; method: string; grading: Record<string, unknown>;
  evaluationScope: string | null; expected: Record<string, unknown>; forbidden: string[];
  source: Array<{ ref: string; text: string }>;
  evidence: Array<{ ref: string; value: unknown }>;
}
export interface EvaluationJudge {
  readonly model: string;
  judge(input: JudgeInput): Promise<JudgeDecision>;
}

export type CaseStatus = "pass" | "fail" | "not_run" | "blocked_by_upstream" | "needs_review";
export interface ReviewCaseResult {
  caseId: string; stage: string; method: string; challengeType: string;
  severity: string; reviewStatus: string;
  status: CaseStatus; preliminaryVerdict: "pass" | "fail" | "needs_review" | null;
  failedExpectedFields: string[]; forbiddenClaimsFound: string[];
  reasons: string[]; evidenceRefs: string[];
  expectedChecks?: { passed: number; failed: number; needsReview: number; total: number };
  requiredTargets?: { found: number; total: number };
}

/** Expand graph fixtures so a missing node or edge is reported by its own name. */
export function expectedForJudge(expected: Record<string, unknown>): Record<string, unknown> {
  const checks: Record<string, unknown> = {};
  const add = (key: string, value: unknown) => {
    if (Object.hasOwn(checks, key)) throw new Error(`Duplicate evaluation graph check: ${key}`);
    checks[key] = value;
  };
  for (const [key, value] of Object.entries(expected)) {
    if ((key === "reference_tree" || key === "article_32_reference_tree") &&
        value && typeof value === "object" && !Array.isArray(value) &&
        Array.isArray((value as Record<string, unknown>).nodes)) {
      for (const node of (value as { nodes: Array<{ id: string }> }).nodes) {
        add(`node:${node.id}`, node);
      }
    } else if ((key === "explicit_reference_edges" || key === "article_32_explicit_reference_edges" ||
                key === "reference_edges") &&
        Array.isArray(value)) {
      for (const edge of value as Array<{ from: string; to: string }>) {
        add(`edge:${edge.from} -> ${edge.to}`, edge);
      }
    } else if (key === "multi_hop_paths" && Array.isArray(value)) {
      for (const path of value as Array<{ path: string[] }>) {
        add(`path:${path.path.join(" -> ")}`, path);
      }
    } else if (key === "rows" && Array.isArray(value)) {
      for (const row of value as Array<{ row: number }>) add(`schedule-row:${row.row}`, row);
    } else if (key === "inherited_conditions" && Array.isArray(value)) {
      for (const condition of value as Array<{ children: string[] }>)
        add(`inherited-condition:${condition.children.join(",")}`, condition);
    } else if (key === "section_starts" && Array.isArray(value)) {
      for (const section of value as Array<{ section: number }>)
        add(`section-start:${section.section}`, section);
    } else if (key === "chapter_markers" && Array.isArray(value)) {
      for (const chapter of value as Array<{ heading_exact_text: string }>)
        add(`chapter:${chapter.heading_exact_text}`, chapter);
    } else {
      add(key, value);
    }
  }
  return checks;
}

function atPointer(value: unknown, pointer: string): unknown {
  if (pointer === "") return value;
  if (!pointer.startsWith("/")) throw new Error(`Invalid JSON pointer: ${pointer}`);
  let current = value;
  for (const token of pointer.slice(1).split("/").map(s => s.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}

function resolveEvidence(ref: string, artifacts: Record<string, unknown>): unknown {
  const divider = ref.indexOf("#");
  if (divider < 1) throw new Error(`Evidence reference needs artifact#pointer: ${ref}`);
  const key = ref.slice(0, divider), pointer = ref.slice(divider + 1);
  if (!Object.hasOwn(artifacts, key)) throw new Error(`Unknown evidence artifact: ${key}`);
  const value = atPointer(artifacts[key], pointer);
  if (value === undefined) throw new Error(`Evidence pointer is absent: ${ref}`);
  return value;
}

function requiredTargets(row: ReviewDatasetCase, evidence: JudgeInput["evidence"]):
  { found: number; total: number } | undefined {
  const direct = row.expected.direct_retrieval;
  if (!direct || typeof direct !== "object" || Array.isArray(direct)) return undefined;
  const expected = (direct as Record<string, unknown>).must_include;
  if (!Array.isArray(expected) || !expected.every(v => typeof v === "string")) return undefined;
  // An observation must explicitly expose ranked citation labels. Do not infer labels from prose.
  const observed = evidence.map(item => item.value).find(value => value && typeof value === "object" &&
    Array.isArray((value as Record<string, unknown>).retrieved_targets)) as Record<string, unknown> | undefined;
  if (!observed) return undefined;
  const k = (direct as Record<string, unknown>).k;
  const ranked = (observed.retrieved_targets as unknown[]).slice(0, typeof k === "number" ? k : 10);
  return { found: expected.filter(target => ranked.includes(target)).length, total: expected.length };
}

function sourceComparisonText(unit: { comparison_text?: string;
  fragments?: Array<{ text: string }> }): string {
  return unit.comparison_text ?? unit.fragments?.map(fragment => fragment.text).join("\n") ?? "";
}

function physicalPages(row: ReviewDatasetCase, evidence: JudgeInput["evidence"]):
  { found: number; total: number; extras: number } | undefined {
  const expected = row.expected.physical_pages;
  if (!Array.isArray(expected) || !expected.every(v => typeof v === "number")) return undefined;
  const observed = evidence.map(item => item.value).find(value => value && typeof value === "object" &&
    Array.isArray((value as Record<string, unknown>).pages)) as Record<string, unknown> | undefined;
  if (!observed) return undefined;
  const pages = (observed.pages as unknown[]).map(page => typeof page === "number" ? page :
    page && typeof page === "object" ? (page as Record<string, unknown>).physicalPage : undefined);
  const unique = new Set(pages.filter((page): page is number => typeof page === "number"));
  return { found: expected.filter(page => unique.has(page)).length, total: expected.length,
    extras: [...unique].filter(page => !expected.includes(page)).length };
}

/** Score one saved provider run; no ingestion or publication is performed here. */
export async function evaluateReviewDataset(datasetInput: unknown, runInput: unknown,
  sourcePackInput: unknown, pdfBytes: Uint8Array, judge?: EvaluationJudge) {
  const dataset = ReviewDatasetSchema.parse(datasetInput);
  const run = ReviewRunSchema.parse(runInput);
  const sourcePack = SourcePackSchema.parse(sourcePackInput);
  const actualHash = createHash("sha256").update(pdfBytes).digest("hex");
  if (actualHash !== dataset.source.sha256 || run.source_sha256 !== actualHash ||
      sourcePack.source_sha256 !== actualHash || pdfBytes.byteLength !== dataset.source.byte_size) {
    throw new Error("PDF bytes, dataset, source pack and run must identify the same source");
  }
  if (run.dataset_id !== dataset.dataset_id) throw new Error("Run uses another dataset");
  const known = new Set(dataset.cases.map(row => row.id));
  const observations = new Map<string, ReviewRun["results"][number]>();
  for (const result of run.results) {
    if (!known.has(result.case_id) || observations.has(result.case_id))
      throw new Error(`Unknown or duplicate run case: ${result.case_id}`);
    observations.set(result.case_id, result);
  }
  for (const row of dataset.cases) for (const ref of row.source_refs)
    if (!Object.hasOwn(sourcePack.units, ref)) throw new Error(`Missing source reference ${row.id}: ${ref}`);
  const artifacts = run.artifacts ?? {};
  const cases: ReviewCaseResult[] = [];
  const caseStage = new Map(dataset.cases.map(row => [row.id, Number(row.stage.slice(1))]));
  for (const row of dataset.cases) {
    const observation = observations.get(row.id);
    const result: ReviewCaseResult = { caseId: row.id, stage: row.stage, method: row.grading.method,
      challengeType: row.challenge_type ?? "untagged",
      severity: row.severity, reviewStatus: row.human_review.status, status: "not_run",
      preliminaryVerdict: null, failedExpectedFields: [], forbiddenClaimsFound: [],
      reasons: [], evidenceRefs: observation?.evidence_refs ?? [] };
    cases.push(result);
    if (!observation?.evidence_refs.length && observation?.blocked_by_case_ids?.length) {
      const invalid = observation.blocked_by_case_ids.filter(id => !caseStage.has(id) ||
        caseStage.get(id)! >= Number(row.stage.slice(1)));
      if (invalid.length) throw new Error(`Invalid upstream case references for ${row.id}: ${invalid.join(", ")}`);
      if (observation.blocked_by_case_ids.some(id => cases.some(previous =>
        previous.caseId === id && previous.status === "fail"))) {
        result.status = "blocked_by_upstream"; result.reasons.push("Named prerequisite case failed"); continue;
      }
      result.status = "needs_review"; result.reasons.push("Named upstream failure was not confirmed"); continue;
    }
    if (!observation?.evidence_refs.length) { result.reasons.push("No saved output evidence"); continue; }
    let evidence: JudgeInput["evidence"];
    try { evidence = observation.evidence_refs.map(ref => ({ ref, value: resolveEvidence(ref, artifacts) })); }
    catch (error) { result.reasons.push(error instanceof Error ? error.message : String(error)); continue; }
    const targets = requiredTargets(row, evidence);
    if (targets) result.requiredTargets = targets;
    // v1.1 scores passage coverage by source content, not exact chunk/article labels.
    // Only the legacy must_include contract supports this deterministic label check.
    const direct = row.expected.direct_retrieval;
    const needsTargets = !!direct && typeof direct === "object" && !Array.isArray(direct) &&
      Array.isArray((direct as Record<string, unknown>).must_include);
    const pages = physicalPages(row, evidence);
    if ((needsTargets && !targets) || (Array.isArray(row.expected.physical_pages) && !pages)) {
      result.status = "needs_review";
      result.reasons.push("Required structured retrieval or page-inventory observation is missing");
      continue;
    }
    if ((targets && targets.found < targets.total) ||
        (pages && (pages.found < pages.total || pages.extras > 0))) {
      result.preliminaryVerdict = "fail";
      result.status = "fail";
      result.reasons.push(targets && targets.found < targets.total ?
        "Required retrieval target absent from top k" : "Physical PDF page inventory differs");
      if (row.human_review.status !== "approved") result.reasons.push("Expected answer awaits human approval");
      continue;
    }
    if (!judge) { result.reasons.push("LLM judge was not configured"); continue; }
    const expected = expectedForJudge(row.expected);
    const input: JudgeInput = { caseId: row.id, method: row.grading.method,
      grading: row.grading, evaluationScope: typeof row.evaluation_scope === "string" ?
        row.evaluation_scope : null,
      expected, forbidden: row.must_not,
      source: row.source_refs.map(ref => ({ ref, text: sourceComparisonText(sourcePack.units[ref]!) })),
      evidence };
    let decision: JudgeDecision;
    try { decision = JudgeDecisionSchema.parse(await judge.judge(input)); }
    catch (error) { result.status = "needs_review";
      result.reasons.push(`Judge error: ${error instanceof Error ? error.message : String(error)}`); continue; }
    const complete = (value: JudgeDecision) => {
      const fields = new Set(value.fields.map(field => field.field));
      const forbidden = new Set(value.forbidden.map(claim => claim.claim));
      return fields.size === value.fields.length && forbidden.size === value.forbidden.length &&
        fields.size === Object.keys(expected).length && forbidden.size === row.must_not.length &&
        Object.keys(expected).every(field => fields.has(field)) &&
        row.must_not.every(claim => forbidden.has(claim));
    };
    if (!complete(decision)) {
      try { decision = JudgeDecisionSchema.parse(await judge.judge(input)); }
      catch (error) { result.status = "needs_review";
        result.reasons.push(`Judge retry error: ${error instanceof Error ? error.message : String(error)}`); continue; }
    }
    if (!complete(decision)) {
      result.status = "needs_review"; result.reasons.push("Judge omitted or duplicated rubric items"); continue;
    }
    result.failedExpectedFields = decision.fields.filter(field => field.verdict === "fail").map(field => field.field);
    result.expectedChecks = {
      passed: decision.fields.filter(field => field.verdict === "pass").length,
      failed: result.failedExpectedFields.length,
      needsReview: decision.fields.filter(field => field.verdict === "needs_review").length,
      total: decision.fields.length,
    };
    const forbiddenVerdict = (claim: JudgeDecision["forbidden"][number]) =>
      claim.found ? "fail" : claim.verdict ?? "pass";
    result.forbiddenClaimsFound = decision.forbidden.filter(claim => claim.found ||
      forbiddenVerdict(claim) === "fail").map(claim => claim.claim);
    result.reasons = [...decision.fields.filter(field => field.verdict !== "pass").map(field => `${field.field}: ${field.reason}`),
      ...decision.forbidden.filter(claim => forbiddenVerdict(claim) !== "pass")
        .map(claim => `${forbiddenVerdict(claim) === "fail" ? "Forbidden" : "Forbidden check needs review"}: ${claim.reason}`)];
    result.preliminaryVerdict = result.failedExpectedFields.length || result.forbiddenClaimsFound.length ? "fail" :
      decision.fields.some(field => field.verdict === "needs_review") ||
      decision.forbidden.some(claim => forbiddenVerdict(claim) === "needs_review") ? "needs_review" : "pass";
    result.status = result.preliminaryVerdict;
    if (row.human_review.status !== "approved") result.reasons.push("Expected answer awaits human approval");
  }
  const counts = (rows: ReviewCaseResult[]) => Object.fromEntries(
    (["pass", "fail", "not_run", "blocked_by_upstream", "needs_review"] as CaseStatus[])
      .map(status => [status, rows.filter(row => row.status === status).length]));
  const passRate = (rows: ReviewCaseResult[]) => {
    const passed = rows.filter(row => row.status === "pass").length;
    const failed = rows.filter(row => row.status === "fail").length;
    return { passed, evaluated: passed + failed, value: passed + failed ? passed / (passed + failed) : null };
  };
  const groups = (key: "stage" | "method" | "challengeType") => Object.fromEntries([...new Set(cases.map(row => row[key]))]
    .map(value => { const rows = cases.filter(row => row[key] === value);
      return [value, { cases: rows.length, statuses: counts(rows), evaluatedPassRate: passRate(rows) }]; }));
  const recall = (rows: ReviewCaseResult[]) => {
    const retrieval = rows.map(row => row.requiredTargets).filter((value): value is { found: number; total: number } => !!value);
    const found = retrieval.reduce((n, row) => n + row.found, 0), total = retrieval.reduce((n, row) => n + row.total, 0);
    return { found, total, value: total ? found / total : null,
      note: "Required targets only; no full precision or nDCG claim" };
  };
  const advisory = { pass: cases.filter(row => row.preliminaryVerdict === "pass").length,
    fail: cases.filter(row => row.preliminaryVerdict === "fail").length,
    needsReview: cases.filter(row => row.preliminaryVerdict === "needs_review").length };
  return { datasetId: dataset.dataset_id, runId: run.run_id, sourceSha256: actualHash,
    provider: run.provider, model: run.model, pipelineVersion: run.pipeline_version,
    modelAssignments: run.model_assignments ?? [],
    promptVersion: run.prompt_version, processingStrategy: run.processing_strategy ?? null,
    configurationHash: run.configuration_hash ?? null, reasoningSetting: run.reasoning_setting,
    judgeModel: judge?.model ?? null, split: dataset.split,
    humanApprovedCases: dataset.cases.filter(row => row.human_review.status === "approved").length,
    humanReviewPendingCases: dataset.cases.filter(row => row.human_review.status === "pending").length,
    referenceStatus: "provisional_ai_drafted" as const,
    passRateIsHumanValidated: dataset.cases.every(row => row.human_review.status === "approved"),
    statuses: counts(cases), evaluatedPassRate: passRate(cases), advisory,
    byLayer: groups("stage"), byChallengeType: groups("challengeType"),
    byCheckingMethod: groups("method"),
    requiredTargetRecall: recall(cases),
    humanReviewedRequiredTargetRecall: recall(cases.filter(row => row.reviewStatus === "approved")),
    advisoryRequiredTargetRecall: recall(cases),
    metrics: run.metrics ?? null, releaseQualified: false,
    cases };
}
