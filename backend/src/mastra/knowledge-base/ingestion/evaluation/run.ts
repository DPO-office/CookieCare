import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { gdprRegimeSkill } from "../../../../../../backend/src/modules/analysis/skills/regimes/data-protection/gdpr/skill.config.js";
import { importAuthoredComparisons } from "./authored-profiles.js";
import { compareRuns, evaluateRun } from "./evaluate.js";
import { loadPilotCorpus, referenceRun } from "./fixtures/pilot.js";

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    candidate: { type: "string" }, baseline: { type: "string" }, output: { type: "string" },
    "export-reference": { type: "string" }, "export-authored": { type: "string" },
  }, strict: true });
  if (values.baseline && !values.candidate) throw new Error("--baseline requires --candidate");
  const corpus = loadPilotCorpus();
  const reference = referenceRun(corpus);
  const authoredInputs = importAuthoredComparisons(gdprRegimeSkill,
    "backend/src/modules/analysis/skills/regimes/data-protection/gdpr/skill.config.ts",
    gdprRegimeSkill.regimeRules.filter(rule => rule.ruleId.startsWith("gdpr.art28.")).map(rule => rule.ruleId));
  if (values["export-reference"]) await writeFile(values["export-reference"], `${JSON.stringify(reference, null, 2)}\n`, "utf8");
  if (values["export-authored"]) await writeFile(values["export-authored"], `${JSON.stringify(authoredInputs, null, 2)}\n`, "utf8");
  const candidateInput = values.candidate ? await readJson(values.candidate) : reference;
  const comparison = values.baseline ? compareRuns(corpus, await readJson(values.baseline), candidateInput) : null;
  const evaluation = comparison?.candidate ?? evaluateRun(corpus, candidateInput);
  const report = {
    mode: values.candidate ? "pipeline_artifact_evaluation" : "reference_self_check",
    note: values.candidate ? "Evaluates supplied artifacts only; does not run ingestion." : "Checks the evaluation foundation only; no PDF parser or model was run.",
    authoredComparison: { count: authoredInputs.length, requiresLegalReview: true, rules: authoredInputs.map(({ ruleId, provenance }) => ({ ruleId, ...provenance })) },
    evaluation,
    ...(comparison ? { comparison: { baselineVersion: comparison.baseline.pipelineVersion, criticalErrorDelta: comparison.criticalErrorDelta, regressions: comparison.regressions } } : {}),
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (values.output) await writeFile(values.output, json, "utf8");
  process.stdout.write(json);
  if (!evaluation.artifactChecksPassed || comparison?.regressions.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`KB evaluation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
