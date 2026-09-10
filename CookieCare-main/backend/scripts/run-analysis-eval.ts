/**
 * Run the production analysis PAC against a local document without requiring
 * the browser file picker. This is intentionally domain-neutral: the document,
 * instruction, thinking mode, and output path all come from CLI arguments.
 *
 * From backend/:
 *   npx tsx scripts/run-analysis-eval.ts \
 *     --document "C:\\path\\agreement.pdf" \
 *     --instruction "Summarize the agreement" \
 *     --mode lite \
 *     --output "C:\\path\\result.json"
 */
import "../src/config/index.js";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PacController } from "../src/modules/analysis/pac/controller.js";
import { defaultPacCapabilities } from "../src/modules/analysis/capabilities/index.js";
import type { AnalysisState } from "../src/modules/analysis/models/analysis-state.js";
import { initAgentRunState } from "../src/modules/analysis/pac/types.js";
import {
  resolveAnalysisProfile,
  resolveThinkingMode,
  type ThinkingMode,
} from "../src/modules/analysis/pac/analysis-profile.js";
import { ensureConversation } from "../src/modules/analysis/memory/conversation-store.js";
import { CLAUSE_TAXONOMY_VERSION } from "../src/modules/analysis/taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../src/modules/analysis/taxonomies/index.js";
import { extractText } from "../src/utils/extractText.js";
import { initQueryLogger } from "../src/middleware/queryLogger.js";

interface CliOptions {
  document: string;
  instruction: string;
  mode: ThinkingMode;
  output?: string;
  answerStyle?: "narrative" | "tabular";
  promptLibraryId?: string;
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseArgs(args: string[]): CliOptions {
  const document = valueAfter(args, "--document");
  const instruction = valueAfter(args, "--instruction");
  const instructionFile = valueAfter(args, "--instruction-file");
  const rawMode = valueAfter(args, "--mode") ?? "lite";
  const answerStyle = valueAfter(args, "--answer-style");

  if (!document) throw new Error("Missing required --document path");
  if (!instruction && !instructionFile) {
    throw new Error("Provide --instruction or --instruction-file");
  }
  if (rawMode !== "lite" && rawMode !== "deep") {
    throw new Error("--mode must be lite or deep");
  }
  if (answerStyle && answerStyle !== "narrative" && answerStyle !== "tabular") {
    throw new Error("--answer-style must be narrative or tabular");
  }

  return {
    document: path.resolve(document),
    instruction:
      instruction ?? fs.readFileSync(path.resolve(instructionFile!), "utf8").trim(),
    mode: rawMode,
    output: valueAfter(args, "--output"),
    answerStyle:
      answerStyle === "narrative" || answerStyle === "tabular"
        ? answerStyle
        : undefined,
    promptLibraryId: valueAfter(args, "--prompt-library"),
  };
}

function mimeTypeFor(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".doc":
      return "application/msword";
    case ".json":
      return "application/json";
    default:
      return "text/plain";
  }
}

function buildSummary(result: AnalysisState, elapsedMs: number) {
  const workUnits = result.plan?.workUnits ?? [];
  return {
    sessionId: result.request.sessionId,
    elapsedMs,
    stoppedReason: result.agent?.stoppedReason,
    phase: result.agent?.phase,
    intent: result.intent,
    plan: result.plan,
    workUnitRollup: {
      total: workUnits.length,
      done: workUnits.filter((item) => item.status === "done").length,
      failed: workUnits.filter((item) => item.status === "failed").length,
      skipped: workUnits.filter((item) => item.status === "skipped").length,
    },
    critique: result.critique,
    auditReport: result.auditReport,
    requirementAssessments: result.requirementAssessments,
    findings: result.findings,
    renderedOutput: result.renderedOutput,
  };
}

async function main() {
  initQueryLogger();
  const options = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(options.document)) {
    throw new Error(`Document does not exist: ${options.document}`);
  }

  const title = path.basename(options.document);
  const text = await extractText(
    fs.readFileSync(options.document),
    mimeTypeFor(options.document)
  );
  if (!text.trim()) throw new Error(`No text extracted from ${title}`);

  const docId = `eval-doc-${crypto.randomUUID()}`;
  const sessionId = `eval_${crypto.randomUUID()}`;
  const thinkingMode = resolveThinkingMode(options.mode);
  const profile = resolveAnalysisProfile(thinkingMode);
  const initial: AnalysisState = ensureConversation({
    entryMode: "CREATE",
    agent: initAgentRunState("CREATE", { maxTurns: profile.maxTurns }),
    analysisProfile: profile,
    request: {
      sessionId,
      instruction: options.instruction,
      promptLibraryId: options.promptLibraryId,
      documentIds: [docId],
      documentRoles: { [docId]: "target" },
      documentTexts: { [docId]: text },
      documentTitles: { [docId]: title },
      thinkingMode,
      answerStyle: options.answerStyle,
    },
    workspace: {
      sessionId,
      documents: [
        { docId, title, role: "target", fullText: text, segments: [], clauses: [] },
      ],
    },
    findings: [],
    draftTasks: [],
    metadata: {
      timestamp: new Date().toISOString(),
      clauseTaxonomyVersion: CLAUSE_TAXONOMY_VERSION,
      riskTaxonomyVersion: RISK_TAXONOMY_VERSION,
      thinkingMode,
      analysisProfile: profile,
      generationParameters: { liveEval: true },
    },
  });

  console.log(
    `[analysis-eval] start session=${sessionId} mode=${thinkingMode} doc=${title} chars=${text.length}`
  );
  const pac = new PacController({
    ...defaultPacCapabilities,
    // The runner is diagnostic. Do not write a fake session into application history.
    persistAnalysis: async (state) => state,
  });
  const started = Date.now();
  const result = await pac.run(initial);
  const summary = buildSummary(result, Date.now() - started);

  if (options.output) {
    const outputPath = path.resolve(options.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.log(`[analysis-eval] output=${outputPath}`);
  }
  console.log(
    `[analysis-eval] done session=${sessionId} ms=${summary.elapsedMs} reason=${summary.stoppedReason} ` +
      `units=${summary.workUnitRollup.total} failed=${summary.workUnitRollup.failed} ` +
      `assessments=${summary.requirementAssessments?.length ?? 0} findings=${summary.findings.length}`
  );
  console.log("\n--- RENDERED OUTPUT ---\n");
  console.log(summary.renderedOutput ?? "(no rendered output)");
}

main().catch((error) => {
  console.error("[analysis-eval] failed", error);
  process.exitCode = 1;
});
