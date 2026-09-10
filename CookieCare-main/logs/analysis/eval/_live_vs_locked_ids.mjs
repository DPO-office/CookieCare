import fs from "fs";
import path from "path";

const dir = "logs/analysis";
const logs = fs
  .readdirSync(dir)
  .filter((n) => n.endsWith(".compliance.log"))
  .map((n) => {
    const p = path.join(dir, n);
    return { n, p, mtime: fs.statSync(p).mtimeMs };
  })
  .sort((a, b) => b.mtime - a.mtime);

const latest = logs[0];
const ev = fs
  .readFileSync(latest.p, "utf8")
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const locks = ev
  .filter((e) => e.event === "compliance.lock.accepted")
  .map((e) => ({
    requirementId: e.requirementId,
    status: e.status,
    canonicalKey: e.canonicalKey,
  }));
const rows = ev
  .filter((e) => e.event === "compliance.render.row")
  .map((e) => ({
    requirementId: e.requirementId,
    statusLabel: e.statusLabel,
    status: e.status,
  }));

fs.writeFileSync(
  "logs/analysis/eval/_live_vs_locked_ids.json",
  JSON.stringify(
    {
      log: latest.n,
      lockedAccepted: locks,
      renderRows: rows,
      note: "Glance table uses live requirementAssessments; overlay only replaces matching requirementId strings.",
    },
    null,
    2
  )
);
