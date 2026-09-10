import fs from "fs";
const j = JSON.parse(fs.readFileSync("logs/analysis/eval/_locked_compare_extract.json", "utf8"));
const lines = [];
for (const r of j) {
  const g = r.renderRows.find((x) => String(x.requirementId).includes("deletion"));
  const a = r.renderRows.find((x) => String(x.requirementId).includes("instructions"));
  const ev = r.renderRows[0]?.evidence?.[0]?.quote || "";
  lines.push(
    [
      r.log,
      "rows=" + r.renderRows.length,
      "g=" + (g?.statusLabel || g?.status || "-"),
      "a=" + (a?.statusLabel || a?.status || "-"),
      "ev=" + ev.slice(0, 70),
    ].join(" | ")
  );
}
fs.writeFileSync("logs/analysis/eval/_locked_runs_summary.txt", lines.join("\n"));
console.log(lines.join("\n"));
