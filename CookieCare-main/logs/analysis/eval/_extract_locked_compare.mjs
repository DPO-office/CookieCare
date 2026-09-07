/**
 * Extract locked Phase 4–7 rows from compliance logs for competitor compare.
 */
import fs from "fs";
import path from "path";

const logsDir = path.resolve("logs/analysis");
const files = fs
  .readdirSync(logsDir)
  .filter((f) => f.endsWith(".compliance.log"))
  .map((f) => ({
    f,
    mtime: fs.statSync(path.join(logsDir, f)).mtimeMs,
  }))
  .sort((a, b) => b.mtime - a.mtime);

const out = [];
for (const { f } of files.slice(0, 12)) {
  const raw = fs.readFileSync(path.join(logsDir, f), "utf8");
  const events = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  const renders = events.filter((e) => e.event === "compliance.render.row");
  const locks = events.filter(
    (e) =>
      e.event === "compliance.lock.accepted" ||
      e.event === "compliance.lock.rejected"
  );
  const assesses = events.filter((e) => e.event === "compliance.assess.result");
  const bottom = events.filter((e) => e.event === "compliance.render.bottom_line");
  const docHint =
    events.find((e) => e.documentTitle || e.sourceFile || e.fileName)?.documentTitle ||
    events.find((e) => typeof e.documentHash === "string")?.documentHash ||
    null;
  // Heuristic doc tag from phase3 / registry
  const sampleQuote = JSON.stringify(renders[0] || assesses[0] || {}).slice(0, 200);
  out.push({
    log: f,
    eventCount: events.length,
    renderRows: renders.map((r) => ({
      requirementId: r.requirementId,
      status: r.status,
      statusLabel: r.statusLabel,
      title: r.title,
      supportedElementIds: r.supportedElementIds,
      missingElementIds: r.missingElementIds,
      recommendedAction: r.recommendedAction,
      whatIsMissingOrUnclear: (r.whatIsMissingOrUnclear || "").slice(0, 180),
      evidence: (r.evidence || []).slice(0, 1).map((ev) => ({
        path: ev.structuralPath,
        quote: (ev.quote || "").replace(/\s+/g, " ").slice(0, 140),
      })),
    })),
    lockSummary: locks.map((l) => ({
      event: l.event,
      requirementId: l.requirementId,
      reasonCodes: l.reasonCodes,
    })),
    assessSummary: assesses.map((a) => ({
      requirementId: a.requirementId,
      status: a.status,
      supported: a.supportedElementIds,
      missing: a.missingElementIds,
    })),
    bottomLine: bottom.flatMap((b) => b.claims || b.bottomLine || []).slice(0, 8),
    sampleQuote,
    docHint,
  });
}

const dest = path.join(logsDir, "eval", "_locked_compare_extract.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log("wrote", dest, "runs", out.length);
for (const r of out) {
  console.log(
    "\n===",
    r.log,
    "renders=",
    r.renderRows.length,
    "===",
    r.renderRows.map((x) => `${x.requirementId}:${x.statusLabel || x.status}`).join(" | ")
  );
}
