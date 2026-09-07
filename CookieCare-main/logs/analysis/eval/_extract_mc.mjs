import fs from "fs";
const log = "logs/analysis/an_4fa11225-3e5f-47ff-bdf2-93a1c5075023.compliance.log";
const events = fs
  .readFileSync(log, "utf8")
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

const assess = events.filter((e) => e.event === "compliance.assess.result");
const render = events.filter((e) => e.event === "compliance.render.row");
const lock = events.filter(
  (e) =>
    e.event === "compliance.lock.accepted" ||
    e.event === "compliance.lock.rejected"
);
const out = {
  log,
  assess: assess.map((a) => ({
    requirementId: a.requirementId,
    status: a.status,
    elementStates: a.elementStates,
    reasonCodes: a.reasonCodes,
  })),
  lock: lock.map((l) => ({
    event: l.event,
    requirementId: l.requirementId,
    status: l.status,
    reasonCodes: l.reasonCodes,
  })),
  render: render.map((r) => ({
    requirementId: r.requirementId,
    status: r.status,
    statusLabel: r.statusLabel,
  })),
  eventTypes: [...new Set(events.map((e) => e.event))].sort(),
};
fs.writeFileSync(
  "logs/analysis/eval/_mc_4fa_locked.json",
  JSON.stringify(out, null, 2)
);
console.log(
  "assess",
  out.assess.length,
  "lock",
  out.lock.length,
  "render",
  out.render.length
);
for (const a of out.assess) {
  console.log(a.requirementId, a.status, JSON.stringify(a.elementStates));
}
