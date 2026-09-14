import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import type { DiagnosticEvent, VerificationDiagnosticOptions, VerificationDiagnosticRun } from "./types.js";

const segment = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 70)
  + "-" + createHash("sha256").update(value).digest("hex").slice(0, 12);

function defaultDirectory(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const suffix = "src/modules/analysis/temp/compliance-verification";
  const candidates = [path.join(process.cwd(), suffix), path.join(process.cwd(), "backend", suffix), path.join(moduleDirectory, suffix), moduleDirectory];
  return path.join(candidates.find(candidate => fs.existsSync(path.join(candidate, "README.md"))) ?? moduleDirectory, "out");
}

/** Each payload has its own file; events.jsonl is a small, append-only index. */
export function createVerificationDiagnosticRun(options: VerificationDiagnosticOptions): VerificationDiagnosticRun {
  const enabled = options.enabled ?? (!process.env.NODE_TEST_CONTEXT && ["1", "true"].includes((process.env.ANALYSIS_DUMP_COMPLIANCE_VERIFICATION ?? "").toLowerCase()));
  const writeErrors: string[] = [];
  if (!enabled) return { record: () => undefined, finish: () => {}, health: () => ({ enabled: false, runDirectory: null, writeErrors: [] }) };
  const root = path.resolve(options.directory ?? defaultDirectory());
  const runId = randomUUID();
  const runDirectory = path.join(root, segment(options.sessionId), runId);
  const startedAt = new Date().toISOString();
  let sequence = 0, status = "running";
  const eventCounts: Record<string, number> = {};
  const checks = new Map(options.checks.map(check => [check.checkId, {
    checkId: check.checkId, ruleId: check.ruleId, status: "pending",
    modelCalls: 0, repairCalls: 0, reviewCalls: 0, validationFailures: [] as unknown[],
    reviewFailures: [] as unknown[], gate: null as unknown, outcomeFile: null as string | null,
    reportedStatus: null as string | null,
  }]));
  const activeCalls = new Map<string, unknown>();
  let summaryRetry: ReturnType<typeof setTimeout> | undefined;
  let summaryRetryCount = 0;
  function fail(error: unknown) {
    const message = String(error);
    if (!writeErrors.includes(message) && writeErrors.length < 20) writeErrors.push(message);
  }
  function writeJson(file: string, data: unknown): void {
    const temporary = file + "." + randomUUID() + ".tmp";
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
    try { fs.renameSync(temporary, file); }
    catch (error) {
      // Only remove the temporary file created by this invocation. Never
      // delete/truncate the last readable summary to work around Windows locks.
      try { fs.unlinkSync(temporary); } catch { /* Preserve the original error. */ }
      throw error;
    }
  }
  function summary() {
    if (summaryRetry) { clearTimeout(summaryRetry); summaryRetry = undefined; }
    try {
    writeJson(path.join(runDirectory, "summary.json"), {
      version: 1, sessionId: options.sessionId, runId, mode: options.mode, status, startedAt,
      updatedAt: new Date().toISOString(), eventCounts, checks: [...checks.values()], activeCalls: [...activeCalls.values()], writeErrors,
      note: "Diagnostic records only. Pending checks and absent raw responses are not legal gaps.",
    });
    summaryRetryCount = 0;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (["EPERM", "EBUSY", "EACCES"].includes(code ?? "") && summaryRetryCount < 3) {
        // Coalesced retries serialize the newest state. They do not delay model
        // work or turn a successful payload write into a missing diagnostic link.
        summaryRetry = setTimeout(summary, 25 * ++summaryRetryCount);
        summaryRetry.unref();
      } else fail(error);
    }
  }
  try {
    fs.mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
    writeJson(path.join(runDirectory, "manifest.json"), {
      version: 1, sessionId: options.sessionId, runId, mode: options.mode, startedAt, expectedChecks: options.checks,
      privacy: "Contains supplied contract text and model responses. Local diagnostic data; do not commit or publish.",
    });
    summary();
    writeJson(path.join(root, "latest.json"), { version: 1, sessionId: options.sessionId, runId, runDirectory, startedAt, summaryPath: path.join(runDirectory, "summary.json") });
  } catch (error) { fail(error); }
  return {
    record(event: DiagnosticEvent): string | undefined {
      try {
        const name = event.event.replace("compliance.shadow.", "compliance.");
        const check = event.checkId ? checks.get(event.checkId) : undefined;
        const number = ++sequence;
        const folder = event.checkId ? path.join(runDirectory, "checks", segment(event.checkId)) : path.join(runDirectory, "run");
        fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
        const file = path.join(folder, `${String(number).padStart(5, "0")}-${name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
        writeJson(file, { version: 1, sequence: number, runId, ...event });
        const relative = path.relative(runDirectory, file);
        fs.appendFileSync(path.join(runDirectory, "events.jsonl"), JSON.stringify({
          sequence: number, event: event.event, timestamp: event.timestamp, checkId: event.checkId,
          requirementId: event.requirementId, phase: event.phase, round: event.round, attempt: event.attempt, file: relative,
        }) + "\n", { encoding: "utf8", mode: 0o600 });
        eventCounts[name] = (eventCounts[name] ?? 0) + 1;
        const callKey = JSON.stringify([event.checkId, event.phase, event.round, event.attempt]);
        if (name.endsWith("attempt.started")) {
          activeCalls.set(callKey, { checkId: event.checkId, phase: event.phase, round: event.round, attempt: event.attempt, startedAt: event.timestamp, file: relative });
          if (check) { check.status = "running"; check.modelCalls++; if (event.repair) check.repairCalls++; if (event.phase !== "verify") check.reviewCalls++; }
        }
        if (name.endsWith("attempt.response") || name.endsWith("attempt.error")) activeCalls.delete(callKey);
        if (check && name.endsWith("attempt.validation") && event.accepted === false)
          check.validationFailures.push({ phase: event.phase, round: event.round, attempt: event.attempt, errors: event.errors, file: relative });
        if (check && (name.endsWith("review.unavailable") || (name.endsWith("review.comparison") && !event.agree)))
          check.reviewFailures.push({ phase: event.phase, round: event.round, differences: event.differences, file: relative });
        if (check && (name === "compliance.lock.audit" || name === "compliance.assessment.replay")) { check.gate = event.assessment; check.outcomeFile = relative; }
        if (check && name === "compliance.verify.outcome") check.status = String(event.status);
        if (check && name === "compliance.outcome.rendered") {
          check.reportedStatus = String(event.status);
          if (check.status === "pending" || check.status === "running") check.status = String(event.status);
        }
        summary();
        return file;
      } catch (error) { fail(error); return undefined; }
    },
    finish(next = "complete") { status = next; try { summary(); } catch (error) { fail(error); } },
    health: () => ({ enabled, runDirectory, writeErrors: [...writeErrors] }),
  };
}
