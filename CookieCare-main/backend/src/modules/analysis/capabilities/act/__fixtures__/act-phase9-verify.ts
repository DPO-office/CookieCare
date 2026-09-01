// ACT-Phase 9 verification — narrowed AUDIT.
// 1. Measures groundFindings' wall-clock with a batch of findings, comparing
//    verifiedByProposition (skips the redundant quoteInSource re-check)
//    against the old behavior (every finding re-checked) on the same input.
// 2. Confirms the contradiction sweep (runAudit's maybeAppendVerificationNotes,
//    left completely untouched) still catches a deliberately injected
//    table-vs-narrative contradiction — a real LLM call.
//
// Run with:
//   node --import ./node_modules/tsx/dist/loader.mjs src/modules/analysis/capabilities/act/__fixtures__/act-phase9-verify.ts
// from CookieCare-main/backend/.

import "../../../../../config/index.js";
import { groundFindings } from "../../audit/ground-findings.js";
import { runAudit } from "../../audit/run-audit.js";
import { initAgentRunState } from "../../../pac/types.js";
import { CLAUSE_TAXONOMY_VERSION } from "../../../taxonomies/clause-taxonomy.js";
import { RISK_TAXONOMY_VERSION } from "../../../taxonomies/index.js";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { Finding } from "../../../models/finding.js";

// A moderately large synthetic document — big enough that groundFindings'
// per-finding clause-text substring search (O(clauses) per finding) has a
// measurable cost to skip.
const CLAUSE_COUNT = 80;
const SOURCE_CLAUSES = Array.from({ length: CLAUSE_COUNT }, (_, i) =>
  `Section ${i + 1}. This is filler contractual language for clause number ${i + 1}, ` +
  `establishing an obligation of the parties under this Agreement that has nothing to ` +
  `do with the specific finding under test, repeated to give the document real bulk.`
);
const REAL_SOURCE =
  "Section 99. The Processor shall implement and maintain technical and organisational " +
  "security measures appropriate to the risk, including encryption at rest and in transit.";
const FULL_TEXT = [...SOURCE_CLAUSES, REAL_SOURCE].join("\n\n");

function makeFinding(id: string, verified: boolean): Finding {
  return {
    findingId: id,
    kind: "compliance",
    category: "other_known_risk",
    status: "present",
    claim: "Security measures are named.",
    evidence: [
      {
        locator: { docId: "doc1", structuralPath: "p-security", charRange: [0, REAL_SOURCE.length] },
        quotedText: REAL_SOURCE,
        sourceRole: "target",
      },
    ],
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    requirementId: `req_${id}`,
    verifiedByProposition: verified,
    judgement: verified
      ? {
          compliance: "present",
          evidenceState: "direct",
          referenceBinding: "none",
          evidenceConfidence: "high",
          nli: "entailed",
          materiality: "low",
          recommendationKind: "none",
        }
      : undefined,
  };
}

function baseState(findings: Finding[]): AnalysisState {
  return {
    agent: initAgentRunState("CREATE"),
    request: {
      sessionId: "act_phase9_verify",
      instruction: "test",
      documentIds: ["doc1"],
      documentTexts: { doc1: FULL_TEXT },
    },
    workspace: {
      sessionId: "act_phase9_verify",
      documents: [
        {
          docId: "doc1",
          role: "target",
          fullText: FULL_TEXT,
          segments: [],
          clauses: SOURCE_CLAUSES.map((text, i) => ({
            clauseId: `c${i}`,
            clauseType: "filler",
            text,
            locator: { docId: "doc1", structuralPath: `p${i}`, charRange: [0, text.length] },
            taxonomyVersion: "test",
          })),
        },
      ],
    },
    findings,
    draftTasks: [],
    metadata: {
      timestamp: new Date().toISOString(),
      clauseTaxonomyVersion: CLAUSE_TAXONOMY_VERSION,
      riskTaxonomyVersion: RISK_TAXONOMY_VERSION,
    },
  } as AnalysisState;
}

function timeIt(label: string, fn: () => void): number {
  const t0 = performance.now();
  fn();
  const ms = performance.now() - t0;
  console.log(`  ${label}: ${ms.toFixed(3)}ms`);
  return ms;
}

async function main() {
  console.log("=== Part 1: groundFindings wall-clock, verified vs unverified ===\n");
  const N = 200;

  const unverifiedFindings = Array.from({ length: N }, (_, i) => makeFinding(`u${i}`, false));
  const verifiedFindings = Array.from({ length: N }, (_, i) => makeFinding(`v${i}`, true));

  // Warm up (JIT).
  groundFindings(baseState(unverifiedFindings.slice(0, 10)));
  groundFindings(baseState(verifiedFindings.slice(0, 10)));

  const trials = 5;
  let unverifiedTotal = 0;
  let verifiedTotal = 0;
  for (let t = 0; t < trials; t++) {
    unverifiedTotal += timeIt(
      `trial ${t + 1} — ${N} unverified findings (old behavior, re-checks every quote)`,
      () => groundFindings(baseState(unverifiedFindings))
    );
    verifiedTotal += timeIt(
      `trial ${t + 1} — ${N} verifiedByProposition findings (ACT-Phase 9, skips redundant re-check)`,
      () => groundFindings(baseState(verifiedFindings))
    );
  }
  const unverifiedAvg = unverifiedTotal / trials;
  const verifiedAvg = verifiedTotal / trials;
  console.log(`\n  Average, unverified: ${unverifiedAvg.toFixed(3)}ms`);
  console.log(`  Average, verified:   ${verifiedAvg.toFixed(3)}ms`);
  console.log(
    `  Reduction: ${(((unverifiedAvg - verifiedAvg) / unverifiedAvg) * 100).toFixed(1)}%`
  );

  // Correctness: verified findings must still all read "present" — nothing
  // was incorrectly downgraded by skipping the redundant check.
  const verifiedResult = groundFindings(baseState(verifiedFindings));
  const stillPresent = verifiedResult.findings.every((f) => f.status === "present");
  console.log(`\n  All ${N} verified findings still status="present": ${stillPresent}`);
  console.log(`  findingsChanged count: ${verifiedResult.auditReport?.findingsChanged.length}`);

  console.log("\n=== Part 2: contradiction sweep still catches an injected contradiction ===\n");

  // A finding the memo will contradict: audit rights are absent, but the
  // memo (deliberately) claims they are present — classic
  // table-vs-narrative mismatch.
  const auditFinding: Finding = {
    findingId: "f-audit",
    kind: "compliance",
    category: "other_known_risk",
    status: "absent_expected",
    claim: "No audit or inspection right is granted to the controller.",
    gap: "The processor does not grant the controller a right to audit or inspect its compliance.",
    evidence: [],
    taxonomyVersion: RISK_TAXONOMY_VERSION,
    requirementId: "audit_rights",
    visibility: "user_facing",
  };

  const contradictingMemo = [
    "## Executive Summary",
    "This agreement is fully compliant with all Article 28 requirements.",
    "",
    "## Requirements Matrix",
    "| Requirement | Status |",
    "| --- | --- |",
    "| Audit rights | Present |",
    "",
    "The processor grants the controller a full, unrestricted right to audit and inspect ",
    "its data-processing controls at any time, with no limitations whatsoever.",
  ].join("\n");

  const stateWithContradiction = {
    ...baseState([auditFinding]),
    renderedOutput: contradictingMemo,
  } as AnalysisState;

  console.log("Calling runAudit() with a memo that contradicts the locked finding...");
  const auditResult = await runAudit(stateWithContradiction);

  console.log(`\nauditReport.contradictions: ${JSON.stringify(auditResult.auditReport?.contradictions, null, 2)}`);
  console.log(`\nCaught a contradiction: ${(auditResult.auditReport?.contradictions?.length ?? 0) > 0}`);
}

main().catch((err) => {
  console.error("[act-phase9-verify] failed:", err);
  process.exitCode = 1;
});
