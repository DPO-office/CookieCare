import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { referenceRun } from "../evaluation/fixtures/pilot.js";

const entrypoint = fileURLToPath(new URL("../evaluation/run.ts", import.meta.url));
function invoke(args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", entrypoint, ...args], { encoding: "utf8", timeout: 30000 });
}

test("CLI exports repeatable reference, report and authored comparison artifacts", () => {
  const directory = mkdtempSync(join(tmpdir(), "kb-evaluation-"));
  try {
    const reference = join(directory, "reference.json"), authored = join(directory, "authored.json"), report = join(directory, "report.json");
    const result = invoke(["--export-reference", reference, "--export-authored", authored, "--output", report]);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.mode, "reference_self_check");
    assert.equal(parsed.evaluation.artifactChecksPassed, true);
    assert.equal(parsed.evaluation.releaseQualified, false);
    assert.equal(readFileSync(report, "utf8"), result.stdout);
    assert.deepEqual(JSON.parse(readFileSync(reference, "utf8")), referenceRun());
    assert.equal(JSON.parse(readFileSync(authored, "utf8")).length, 14);

    const good = invoke(["--baseline", reference, "--candidate", reference]);
    assert.equal(good.status, 0, good.stderr);
    assert.deepEqual(JSON.parse(good.stdout).comparison.regressions, []);
    const broken = referenceRun();
    broken.pipelineVersion = "seeded-defect";
    broken.cases[0].requirements[0].exceptions = [];
    const candidate = join(directory, "candidate.json");
    writeFileSync(candidate, JSON.stringify(broken), "utf8");
    const failure = invoke(["--baseline", reference, "--candidate", candidate]);
    assert.equal(failure.status, 1, failure.stderr);
    assert.ok(JSON.parse(failure.stdout).comparison.regressions.length > 0);
  } finally {
    // Only test-created files are removed; no recursive cleanup of a computed Windows path.
    for (const name of readdirSync(directory)) unlinkSync(join(directory, name));
    rmdirSync(directory);
  }
});

test("CLI rejects a comparison without a candidate", () => {
  const result = invoke(["--baseline", "unused.json"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--baseline requires --candidate/);
});
