import { hashRevision } from "../schemas/index.js";
import { PipelineRunSchema, validateCorpus, type CaseOutput, type EvaluationCase } from "./contracts.js";

export interface CaseScore {
  caseId: string;
  category: EvaluationCase["category"];
  checks: number;
  passedChecks: number;
  criticalErrors: string[];
}

function same(actual: unknown, expected: unknown): boolean {
  return hashRevision(actual) === hashRevision(expected);
}

function scoreCase(fixture: EvaluationCase, output: CaseOutput | undefined): CaseScore {
  const score: CaseScore = { caseId: fixture.id, category: fixture.category, checks: 0, passedChecks: 0, criticalErrors: [] };
  function check(ok: boolean, message: string): void {
    score.checks++;
    if (ok) score.passedChecks++;
    else score.criticalErrors.push(message);
  }
  check(!!output, "missing_case");
  if (!output) return score;
  check(same(output.provisions.map(p => p.id).sort(), fixture.expected.provisions.map(p => p.id).sort()), "provision_inventory");
  for (const expected of fixture.expected.provisions) {
    const actual = output.provisions.find(p => p.id === expected.id);
    check(!!actual, `missing_provision:${expected.id}`);
    if (!actual) continue;
    for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
      check(same(actual[key], expected[key]), `provision_${key}:${expected.id}`);
    }
  }
  check(same(output.requirements.map(r => r.ruleId).sort(), fixture.expected.requirements.map(r => r.ruleId).sort()), "requirement_inventory");
  for (const expected of fixture.expected.requirements) {
    const actual = output.requirements.find(r => r.ruleId === expected.ruleId);
    check(!!actual && same(actual, expected), `requirement_semantics_or_context:${expected.ruleId}`);
  }
  const ordered = (rows: CaseOutput["dispositions"]) => [...rows].sort((a, b) => a.blockId.localeCompare(b.blockId));
  check(same(ordered(output.dispositions), ordered(fixture.expected.dispositions)), "block_accounting");
  check(output.coverageStatus === fixture.expected.coverageStatus, "coverage_status");
  check(same([...output.missingPages].sort((a, b) => a - b), [...fixture.expected.missingPages].sort((a, b) => a - b)), "original_page_coverage");
  const blocks = new Map(fixture.blocks.map(b => [b.id, b]));
  for (const provision of output.provisions) {
    for (const fragment of provision.fragments) {
      const block = blocks.get(fragment.blockId);
      check(!!block && block.sourceVersionId === provision.sourceVersionId && fragment.end <= block.text.length,
        `invalid_fragment:${provision.id}:${fragment.blockId}`);
    }
    check(provision.sourceVersionId === fixture.sourceVersionId, `wrong_source_version:${provision.id}`);
  }
  return score;
}

/** Evaluate exported pipeline artifacts. This does not call a parser or a model. */
export function evaluateRun(corpusInput: unknown[], runInput: unknown) {
  const corpus = validateCorpus(corpusInput);
  const run = PipelineRunSchema.parse(runInput);
  const outputs = new Map<string, CaseOutput>();
  const known = new Set(corpus.map(c => c.id));
  for (const output of run.cases) {
    if (!known.has(output.caseId)) throw new Error(`Unknown output case: ${output.caseId}`);
    if (outputs.has(output.caseId)) throw new Error(`Duplicate output case: ${output.caseId}`);
    outputs.set(output.caseId, output);
  }
  const cases = corpus.map(fixture => scoreCase(fixture, outputs.get(fixture.id)));
  const criticalErrorCount = cases.reduce((sum, c) => sum + c.criticalErrors.length, 0);
  const humanCheckedCases = corpus.filter(c => c.humanReview.status === "human_checked").length;
  const splitCounts = Object.fromEntries(["development", "calibration", "held_out"].map(split => [split, corpus.filter(c => c.split === split).length]));
  const blockers: string[] = [];
  if (humanCheckedCases !== corpus.length) blockers.push("Expected answers still need human review");
  if (!splitCounts.calibration) blockers.push("No independent calibration documents");
  if (!splitCounts.held_out) blockers.push("No independent held-out documents");
  if (!corpus.some(c => c.provenance.kind === "original_pdf")) blockers.push("Original pilot PDF and verified page locations are missing");
  // These checks concern artifacts only; access, recovery and consumer tests belong to later phases.
  blockers.push("End-to-end parser, extraction, retrieval and release qualification have not run");
  return {
    pipelineVersion: run.pipelineVersion, corpusVersion: run.corpusVersion,
    artifactChecksPassed: criticalErrorCount === 0,
    releaseQualified: false as const,
    criticalErrorCount,
    corpus: { caseCount: corpus.length, sourceFamilyCount: new Set(corpus.map(c => c.sourceFamily)).size, humanCheckedCases, splitCounts },
    categories: [...new Set(corpus.map(c => c.category))].map(category => {
      const rows = cases.filter(c => c.category === category);
      return { category, caseCount: rows.length, criticalErrors: rows.reduce((sum, row) => sum + row.criticalErrors.length, 0),
        initialCriticalErrorBudget: 0, thresholdStatus: "provisional_unvalidated" as const };
    }),
    blockers, cases,
  };
}

export function compareRuns(corpus: unknown[], baselineInput: unknown, candidateInput: unknown) {
  const baseline = evaluateRun(corpus, baselineInput);
  const candidate = evaluateRun(corpus, candidateInput);
  return {
    baseline, candidate,
    regressions: candidate.cases.flatMap(row => {
      const before = new Set(baseline.cases.find(c => c.caseId === row.caseId)!.criticalErrors);
      return row.criticalErrors.filter(error => !before.has(error)).map(error => ({ caseId: row.caseId, error }));
    }),
    criticalErrorDelta: candidate.criticalErrorCount - baseline.criticalErrorCount,
  };
}
