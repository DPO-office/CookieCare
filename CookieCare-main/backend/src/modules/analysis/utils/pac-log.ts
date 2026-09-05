/** Terminal heartbeat for Analysis PAC — last line is whatever is currently running. */

import type { AnalysisState } from "../models/analysis-state.js";

const TAG = "[Analysis PAC]";

/**
 * Master switch for Analysis PAC console + file inspect traces
 * (PLAN/ACT/AUDIT/CRITIQUE dumps, evidence-pool / VERIFY session files).
 * Set ANALYSIS_LOG=0 (or false/off/no) to silence all of them.
 * Unset or any other value keeps current verbose behavior.
 */
export function analysisLogEnabled(): boolean {
  const raw = process.env.ANALYSIS_LOG;
  if (raw === undefined || raw === "") return true;
  return !["0", "false", "off", "no"].includes(raw.trim().toLowerCase());
}

/**
 * Hold the memo until the renderer starts. PLAN/ACT evaluation must not leak
 * into the chat; once streamRenderOutput is set, tokens may flow live.
 */
export function shouldHoldUserFacingOutput(state: AnalysisState): boolean {
  if (state.streamRenderOutput) return false;
  const phase = state.agent?.phase;
  return phase === "PLAN" || phase === "ACT" || phase === "AUDIT" || phase === "CRITIQUE";
}

/** Open the chat stream for the final report (call from render/synthesis). */
export function beginRenderStreaming(state: AnalysisState): void {
  state.streamRenderOutput = true;
}

/** Stream only renderer-owned output. ACT findings and tool telemetry must never use this path. */
export function emitAnalysisToken(state: AnalysisState, delta: string): void {
  if (!delta) return;
  if (shouldHoldUserFacingOutput(state)) return;
  state.userFacingCharsEmitted = (state.userFacingCharsEmitted ?? 0) + delta.length;
  state.onToken?.(delta);
}

export function pacLog(message: string, extra?: Record<string, unknown>): void {
  if (!analysisLogEnabled()) return;
  const ts = new Date().toISOString().slice(11, 23);
  const suffix =
    extra && Object.keys(extra).length > 0 ? ` ${formatExtra(extra)}` : "";
  console.log(`${TAG} ${ts} ${message}${suffix}`);
}

export function pacWarn(message: string, extra?: Record<string, unknown>): void {
  if (!analysisLogEnabled()) return;
  const ts = new Date().toISOString().slice(11, 23);
  const suffix =
    extra && Object.keys(extra).length > 0 ? ` ${formatExtra(extra)}` : "";
  console.warn(`${TAG} ${ts} WARN ${message}${suffix}`);
}

/** Multi-line inspect dump — keeps PLAN / ACT quality reviews readable in the terminal. */
export function pacLogBlock(title: string, lines: string[]): void {
  if (!analysisLogEnabled()) return;
  const ts = new Date().toISOString().slice(11, 23);
  const bar = "=".repeat(72);
  console.log(`${TAG} ${ts}`);
  console.log(`${TAG} ${bar}`);
  console.log(`${TAG} ${title}`);
  console.log(`${TAG} ${bar}`);
  for (const line of lines) {
    console.log(`${TAG} ${line}`);
  }
  console.log(`${TAG} ${bar}`);
}

function formatExtra(extra: Record<string, unknown>): string {
  return Object.entries(extra)
    .map(([k, v]) => {
      if (v === undefined || v === null || v === "") return null;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        return `${k}=${v}`;
      }
      if (Array.isArray(v)) return `${k}=[${v.length}]`;
      return `${k}=${JSON.stringify(v)}`;
    })
    .filter(Boolean)
    .join(" ");
}
