process.env.GOOGLE_CLOUD_PROJECT ??= "generic-handler-domain-lint-test";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ACT_DIR = path.dirname(fileURLToPath(import.meta.url));
const HANDLERS = [
  "check-against-rule.ts",
  "flag-risk.ts",
  "evaluate-matrix-row.ts",
  "inventory-provisions.ts",
  "check-expected-clauses.ts",
  "evaluate-package.ts",
  "classify-document.ts",
  "extract-clauses.ts",
  "web-assisted-reference.ts",
  "execute-act-plan.ts",
];

const REPORTING_HANDLERS = [
  path.join(ACT_DIR, "../../reporting/render-output.ts"),
  path.join(ACT_DIR, "../../reporting/synthesize-report.ts"),
  path.join(ACT_DIR, "../../reporting/limitations-report.ts"),
];

const BUILD_ACT_GRAPH = path.join(ACT_DIR, "../../../skills/runtime/graph/build-act-graph.ts");

const FORBIDDEN =
  /\b(gdpr|ccpa|hipaa|lgpd|pipl|art\s?12\.3|art\s?28\.3|article\s?(12|22|28)|transfer_inventory|data_subject_request)\b/i;

const FORBIDDEN_DOC_TYPES = /\b(nda|dpa|msa|saas)\b/i;

function isAllowedDomainLintLine(line: string): boolean {
  if (/^\s*\| "/.test(line)) return true;
  if (/DocumentTypeId|docTypeId:/.test(line)) return true;
  if (/clauseType:/.test(line)) return true;
  return false;
}

function lineViolatesDomainLint(line: string): boolean {
  if (isAllowedDomainLintLine(line)) return false;
  if (FORBIDDEN.test(line)) return true;
  if (FORBIDDEN_DOC_TYPES.test(line)) return true;
  return false;
}

const FORBIDDEN_IMPORT =
  /from\s+["'][^"']*skills\/(regimes|doc-types|jurisdictions)\//;

describe("generic ACT handler domain-coupling lint", () => {
  it("forbids regime/doc-type tokens in generic ACT handlers", () => {
    const hits: string[] = [];
    for (const file of HANDLERS) {
      const src = readFileSync(path.join(ACT_DIR, "..", file), "utf8");
      const lines = src.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (lineViolatesDomainLint(line)) {
          hits.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    for (const file of REPORTING_HANDLERS) {
      const src = readFileSync(file, "utf8");
      const rel = path.relative(path.join(ACT_DIR, ".."), file);
      src.split(/\r?\n/).forEach((line, index) => {
        if (lineViolatesDomainLint(line)) {
          hits.push(`${rel}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    assert.deepEqual(hits, [], hits.join("\n"));
  });

  it("forbids direct regime/doc-type skill imports in ACT handlers and graph builder", () => {
    const hits: string[] = [];
    for (const file of [
      ...HANDLERS.map((f) => path.join(ACT_DIR, "..", f)),
      ...REPORTING_HANDLERS,
      BUILD_ACT_GRAPH,
    ]) {
      const rel = path.relative(ACT_DIR, file);
      const src = readFileSync(file, "utf8");
      src.split(/\r?\n/).forEach((line, index) => {
        if (FORBIDDEN_IMPORT.test(line)) {
          hits.push(`${rel}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    assert.deepEqual(hits, [], hits.join("\n"));
  });
});
