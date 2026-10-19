import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { config as loadDotEnv } from "dotenv";
import { DigitalOceanEvaluationJudge } from "./digitalocean-judge.js";
import { evaluateReviewDataset } from "./review-dataset.js";

async function json(path: string): Promise<unknown> { return JSON.parse(await readFile(path, "utf8")); }

async function main() {
  loadDotEnv({ path: "../.env" });
  loadDotEnv({ path: ".env", override: true });
  const { values } = parseArgs({ options: {
    dataset: { type: "string" }, "source-pack": { type: "string" },
    pdf: { type: "string" }, run: { type: "string" }, output: { type: "string" },
    "judge-model": { type: "string" },
    artifact: { type: "string", multiple: true },
  }, strict: true });
  for (const required of ["dataset", "source-pack", "pdf", "run"] as const)
    if (!values[required]) throw new Error(`--${required} is required`);
  const model = values["judge-model"] ?? process.env.KB_EVAL_JUDGE_MODEL;
  const judge = model ? new DigitalOceanEvaluationJudge(model) : undefined;
  const run = await json(values.run!) as Record<string, unknown>;
  const artifacts = { ...((run.artifacts ?? {}) as Record<string, unknown>) };
  for (const entry of values.artifact ?? []) {
    const divider = entry.indexOf("=");
    if (divider < 1) throw new Error(`--artifact must use name=path: ${entry}`);
    const name = entry.slice(0, divider), path = entry.slice(divider + 1);
    if (!path || Object.hasOwn(artifacts, name)) throw new Error(`Duplicate or empty artifact: ${name}`);
    artifacts[name] = await json(path);
  }
  run.artifacts = artifacts;
  const report = await evaluateReviewDataset(await json(values.dataset!), run,
    await json(values["source-pack"]!), await readFile(values.pdf!), judge);
  const finalReport = { ...report, judgeUsage: judge?.usage ?? null };
  const output = `${JSON.stringify(finalReport, null, 2)}\n`;
  if (values.output) await writeFile(values.output, output, "utf8");
  process.stdout.write(output);
  if (report.statuses.fail > 0) process.exitCode = 1;
}

main().catch(error => { process.stderr.write(`KB dataset evaluation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1; });
