/**
 * Temp dump — write investigation evidence bundles as JSON.
 *
 * `latest.json` is updated only when investigation is fully complete
 * (`updateLatest: true`). Mid-pipeline lexical dumps may still write a
 * stamped archive without touching latest.
 *
 * Disable with ANALYSIS_DUMP_COMPLIANCE_BUNDLES=0.
 */

import fs from "node:fs";
import path from "node:path";
import type { Phase3PerRequirementResult } from "../../capabilities/act/compliance/retrieve-compliance-evidence.js";

export interface ComplianceBundleDumpArgs {
  sessionId?: string;
  stage: string;
  results: Phase3PerRequirementResult[];
  /** When true (default), overwrite latest.json + per-requirement files. */
  updateLatest?: boolean;
  /** Extra diagnostics stored on the payload (mode, notes, …). */
  meta?: Record<string, unknown>;
}

function enabled(): boolean {
  const flag = process.env.ANALYSIS_DUMP_COMPLIANCE_BUNDLES;
  if (flag === "0" || flag === "false") return false;
  return true;
}

function bundlesDir(): string {
  const candidates = [
    path.join(process.cwd(), "backend/src/modules/analysis/temp/compliance-bundles"),
    path.join(process.cwd(), "src/modules/analysis/temp/compliance-bundles"),
    path.join(
      process.cwd(),
      "CookieCare-main/backend/src/modules/analysis/temp/compliance-bundles"
    ),
    "C:/Program Files/CookieCare/CookieCare-main/backend/src/modules/analysis/temp/compliance-bundles",
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  const fallback = candidates[0];
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

function slug(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100);
}

/** Best-effort dump of investigation bundles into temp/compliance-bundles/out/*.json */
export function dumpComplianceBundles(args: ComplianceBundleDumpArgs): string | null {
  if (!enabled()) return null;

  try {
    const outDir = path.join(bundlesDir(), "out");
    fs.mkdirSync(outDir, { recursive: true });
    const updateLatest = args.updateLatest !== false;

    const payload = {
      sessionId: args.sessionId ?? null,
      stage: args.stage,
      dumpedAt: new Date().toISOString(),
      requirementCount: args.results.length,
      ...(args.meta ? { meta: args.meta } : {}),
      results: args.results.map((r) => ({
        requirementId: r.requirementId,
        packageId: r.packageId,
        recall: r.recall,
        queries: r.queries,
        hits: r.hits,
        expansions: r.expansions,
        expansionLimits: r.expansionLimits,
        bundle: r.bundle,
        provenance: r.provenance,
      })),
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sessionSlug = slug(args.sessionId || "session");
    const stamped = path.join(outDir, `${sessionSlug}-${slug(args.stage)}-${stamp}.json`);
    const json = JSON.stringify(payload, null, 2);
    fs.writeFileSync(stamped, json, "utf8");

    if (updateLatest) {
      const latest = path.join(outDir, "latest.json");
      fs.writeFileSync(latest, json, "utf8");

      for (const r of args.results) {
        fs.writeFileSync(
          path.join(outDir, `${slug(r.requirementId)}.json`),
          JSON.stringify(
            {
              sessionId: args.sessionId ?? null,
              stage: args.stage,
              dumpedAt: payload.dumpedAt,
              requirementId: r.requirementId,
              packageId: r.packageId,
              recall: r.recall,
              queries: r.queries,
              hits: r.hits,
              expansions: r.expansions,
              expansionLimits: r.expansionLimits,
              bundle: r.bundle,
              provenance: r.provenance,
            },
            null,
            2
          ),
          "utf8"
        );
      }

      return latest;
    }

    return stamped;
  } catch {
    return null;
  }
}
