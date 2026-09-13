/**
 * Temp dump — everything compliance produces before report presentation.
 * Writes only latest.json (no console logs, no stamped archives).
 *
 * Disable with ANALYSIS_DUMP_COMPLIANCE_PRE_REPORT=0.
 */

import fs from "node:fs";
import path from "node:path";

export interface CompliancePreReportDumpArgs {
  sessionId?: string;
  stage?: string;
  payload: Record<string, unknown>;
}

function enabled(): boolean {
  // Test workers must not overwrite the user's rolling live-run artifact.
  if (process.env.NODE_TEST_CONTEXT) return false;
  const flag = process.env.ANALYSIS_DUMP_COMPLIANCE_PRE_REPORT;
  if (flag === "0" || flag === "false") return false;
  return true;
}

function dumpDir(): string {
  const candidates = [
    path.join(process.cwd(), "backend/src/modules/analysis/temp/compliance-pre-report"),
    path.join(process.cwd(), "src/modules/analysis/temp/compliance-pre-report"),
    path.join(
      process.cwd(),
      "CookieCare-main/backend/src/modules/analysis/temp/compliance-pre-report"
    ),
    "C:/Program Files/CookieCare/CookieCare-main/backend/src/modules/analysis/temp/compliance-pre-report",
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  const fallback = candidates[0];
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

/** Silent write of pre-report artifacts to out/latest.json only. */
export function dumpCompliancePreReport(args: CompliancePreReportDumpArgs): string | null {
  if (!enabled()) return null;

  try {
    const outDir = path.join(dumpDir(), "out");
    fs.mkdirSync(outDir, { recursive: true });

    const body = {
      sessionId: args.sessionId ?? null,
      stage: args.stage ?? "pre_report",
      dumpedAt: new Date().toISOString(),
      ...args.payload,
    };
    const latest = path.join(outDir, "latest.json");
    fs.writeFileSync(latest, JSON.stringify(body, null, 2), "utf8");
    return latest;
  } catch {
    return null;
  }
}
