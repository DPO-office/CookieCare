import fs from "fs";
import path from "path";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { ClauseObject } from "../../models/clause-object.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { SharedEvidenceItem } from "../../models/evidence-package.js";
import { analysisLogEnabled } from "../../utils/pac-log.js";
import { scoreClauseForPackage } from "./extract-shared-evidence.js";

/**
 * Writes a persistent, human-readable trace file per analysis run covering
 * the two extraction stages that happen BEFORE the hybrid retriever ever
 * runs: (1) extract_clauses' dictionary-matched clause pool (all 65-ish
 * clauses), and (2) extract_shared_evidence's cut from that pool down to the
 * ~40-item package. Both stages are deterministic/regex-scored, not
 * embedding-ranked — if the right clause never makes either cut, no amount
 * of downstream VERIFY quality can recover it. This file exists to make
 * that checkable by eye instead of inferred from terminal scrollback.
 */

const LOG_DIR = path.join(process.cwd(), "logs", "analysis");

function resolveLogPath(state: AnalysisState): string {
  // Diagnostics must never become a pipeline dependency. Unit fixtures and
  // recovery paths can legitimately construct a partial state before the
  // request envelope exists.
  const sessionId = state.request?.sessionId || "unknown-session";
  return path.join(LOG_DIR, `${sessionId}.log`);
}

function ensureDirAndHeader(state: AnalysisState): string {
  const filePath = resolveLogPath(state);
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(filePath)) {
    const sessionId = state.request?.sessionId || "unknown-session";
    const documentIds = state.request?.documentIds ?? [];
    const header = [
      "=".repeat(88),
      "EVIDENCE POOL TRACE",
      `session=${sessionId}  docIds=${documentIds.join(",")}`,
      `started=${new Date().toISOString()}`,
      "=".repeat(88),
      "",
    ].join("\n");
    fs.writeFileSync(filePath, header, "utf-8");
    console.log(`[evidence-pool-log] writing trace to ${filePath}`);
  }
  return filePath;
}

/**
 * Exported so other ACT-phase loggers (e.g. verify-inspect-log.ts's
 * per-candidate VERIFY trace, which previously only reached ephemeral
 * console.log/stdout via pacLogBlock — easy to lose across a server restart
 * and hard to correlate with a specific session) can append into this same
 * persistent per-session file instead of maintaining their own.
 */
export function appendSection(state: AnalysisState, title: string, lines: string[]): void {
  // Master kill-switch (ANALYSIS_LOG=0) — same gate as pacLog / inspect dumps.
  if (!analysisLogEnabled()) return;
  // A trace without a real run/session cannot be correlated and only creates
  // test artifacts. Skip it while leaving analysis behavior untouched.
  if (!state.request?.sessionId) return;
  const filePath = ensureDirAndHeader(state);
  const block = [
    "",
    "-".repeat(88),
    title,
    "-".repeat(88),
    ...lines,
    "",
  ].join("\n");
  fs.appendFileSync(filePath, block, "utf-8");
}

function snippet(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Raw structured output of the headings-only LLM fallback, when it ran. */
export function logHeadingsFallbackResult(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  missingTypes: string[],
  mapped: Array<{ clauseType: string; structuralPaths: string[] }>
): void {
  const lines: string[] = [];
  lines.push(`unit=${unit.workUnitId}`);
  lines.push(`clause types the dictionary match found NOTHING for: ${missingTypes.join(", ") || "(none)"}`);
  lines.push("");
  lines.push("LLM was shown ONLY the heading index (never document body) and asked to map each");
  lines.push("missing type to a heading path. Raw result:");
  lines.push("");
  for (const m of mapped) {
    lines.push(
      `  ${m.clauseType.padEnd(32)} → ${m.structuralPaths.length > 0 ? m.structuralPaths.join(", ") : "(no match — LLM found nothing either)"}`
    );
  }
  appendSection(state, `[extract_clauses] headings-fallback LLM result — ${unit.workUnitId}`, lines);
}

/** Every clause extract_clauses located, dictionary-matched, one document read. */
export function logExtractedClausePool(
  state: AnalysisState,
  unit: AnalysisWorkUnit,
  clauses: ClauseObject[]
): void {
  const byType = new Map<string, number>();
  for (const c of clauses) byType.set(c.clauseType, (byType.get(c.clauseType) ?? 0) + 1);

  const lines: string[] = [];
  lines.push(`unit=${unit.workUnitId}  total clauses=${clauses.length}`);
  lines.push(
    `by type: ${[...byType.entries()].map(([t, n]) => `${t}=${n}`).join(", ")}`
  );
  lines.push("");
  clauses.forEach((c, i) => {
    const flags = [
      c.evidenceStatus,
      c.truncated ? "truncated" : "",
      c.matchReason ? `via=${c.matchReason}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    lines.push(
      `[${String(i + 1).padStart(3, "0")}] ${c.clauseType.padEnd(32)} ${flags.padEnd(30)} path=${c.locator.structuralPath}`
    );
    lines.push(`      ${snippet(c.text)}`);
  });
  appendSection(state, `[extract_clauses] full clause pool (dictionary-matched, one document read) — ${unit.workUnitId}`, lines);
}

/**
 * extract_shared_evidence's cut from the full clause pool down to ~40 items
 * per package. Shows EVERY clause ranked by scoreClauseForPackage — the same
 * regex-based scorer that does the cutting — with the cutoff line marked, so
 * a clause that scored just below the cap (or was penalized by one of the
 * topic-specific regex branches in that scorer) is visible, not silently gone.
 */
export function logSharedEvidenceCut(
  state: AnalysisState,
  packageId: string,
  allClauses: ClauseObject[],
  clauseTypes: string[],
  extractionTargets: string[],
  cap: number,
  pooledIds: Set<string>
): void {
  const scored = allClauses
    .map((c) => ({
      clause: c,
      score: scoreClauseForPackage(c, clauseTypes, extractionTargets),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.clause.locator.charRange[0] ?? 0) - (b.clause.locator.charRange[0] ?? 0);
    });

  const lines: string[] = [];
  lines.push(`packageId=${packageId}`);
  lines.push(`clauseTypes (boost ranking, do not hard-filter): ${clauseTypes.join(", ") || "(none)"}`);
  lines.push(`extractionTargets (drives topic-specific regex boosts/penalties below): ${extractionTargets.join(", ") || "(none)"}`);
  lines.push(`pool cap: ${cap} of ${allClauses.length} clauses`);
  lines.push("");

  let cutoffPrinted = false;
  scored.forEach(({ clause, score }, i) => {
    if (!cutoffPrinted && i === cap) {
      lines.push(
        `      ${"▼".repeat(20)} cutoff — below this line is EXCLUDED from the ${cap}-item pool ${"▼".repeat(20)}`
      );
      cutoffPrinted = true;
    }
    const kept = pooledIds.has(clauseKey(clause));
    const marker = kept ? "KEPT" : "cut ";
    lines.push(
      `  [${String(i + 1).padStart(3, "0")}] ${marker}  score=${String(score).padStart(4)}  ${clause.clauseType.padEnd(32)} path=${clause.locator.structuralPath}`
    );
    lines.push(`        ${snippet(clause.text, 200)}`);
  });

  appendSection(state, `[extract_shared_evidence] ranked cut to ${cap} — ${packageId}`, lines);
}

export function clauseKey(clause: ClauseObject): string {
  return (
    clause.clauseId ||
    `${clause.clauseType}:${clause.locator.structuralPath}:${clause.locator.charRange.join("-")}`
  );
}

/**
 * The hybrid retriever's per-requirement scoring table: every one of the ~40
 * pool items with its dense (cosine) score + rank, lexical score + rank, and
 * fused RRF score, sorted by fused, with the top-`cap` that VERIFY will
 * actually check marked SENT. This is where "the right clause was in the pool
 * but the wrong 4 got picked" becomes visible — read the SENT rows against
 * the ones just below them to see exactly which arm (dense vs lexical) pulled
 * a generic clause above a role-correct one.
 */
export function logRetrievalRanking(
  state: AnalysisState,
  requirementId: string,
  queryText: string,
  rows: Array<{
    ref: string;
    clauseType: string;
    structuralPath?: string;
    denseScore: number | null;
    denseRank: number | null;
    lexScore: number;
    lexRank: number | null;
    fused: number;
    kept: boolean;
  }>
): void {
  const fmtNum = (n: number | null, digits: number): string =>
    n === null ? "  -  " : n.toFixed(digits);
  const fmtRank = (n: number | null): string => (n === null ? " - " : String(n).padStart(2));

  const lines: string[] = [];
  lines.push(`requirement=${requirementId}`);
  lines.push(`query (proofStandard, embedded for the dense arm): ${snippet(queryText, 260)}`);
  lines.push("");
  lines.push("rank  SENT?  ref    dense    dRank  lex    lRank  fused     clauseType / path");
  rows.forEach((r, i) => {
    lines.push(
      `[${String(i + 1).padStart(2, "0")}]  ${(r.kept ? "SENT" : "    ").padEnd(5)}  ${r.ref.padEnd(5)}  ${fmtNum(r.denseScore, 3).padStart(5)}   ${fmtRank(r.denseRank)}   ${String(r.lexScore).padStart(4)}   ${fmtRank(r.lexRank)}   ${r.fused.toFixed(5)}   ${r.clauseType} ${r.structuralPath ? `(${r.structuralPath})` : ""}`
    );
  });
  appendSection(state, `[retriever] per-requirement ranking of the pool — ${requirementId}`, lines);
}

/**
 * What the LLM candidate selector chose per requirement — the ranked refs it
 * decided are worth verifying, from the whole pool. Read this against the full
 * pool dump above to see whether the model grabbed the role-correct clauses
 * (e.g. the Roles/Scope clause for subject matter) instead of the vocabulary-
 * dense definitions blobs the keyword/embedding path kept picking.
 */
export function logSelectedCandidates(
  state: AnalysisState,
  packageId: string,
  selectionByReq: Map<string, SharedEvidenceItem[]>
): void {
  const lines: string[] = [];
  lines.push(`packageId=${packageId}`);
  lines.push("");
  for (const [requirementId, items] of selectionByReq) {
    if (items.length === 0) {
      lines.push(`${requirementId}: (none — model found nothing in the pool bearing on this)`);
      lines.push("");
      continue;
    }
    lines.push(`${requirementId}: ${items.map((i) => i.ref).join(", ")}`);
    items.forEach((item, i) => {
      lines.push(
        `   ${i + 1}. ${item.ref} [${item.clauseType}${item.structuralPath ? ` · ${item.structuralPath}` : ""}]`
      );
      lines.push(`      ${snippet(item.quotedText, 200)}`);
    });
    lines.push("");
  }
  appendSection(state, `[selector] LLM-chosen candidates per requirement — ${packageId}`, lines);
}
