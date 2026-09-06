import fs from "fs";

const dir = "logs/analysis";
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".compliance.log"))
  .map((f) => ({
    f,
    mtime: fs.statSync(`${dir}/${f}`).mtimeMs,
  }))
  .sort((a, b) => b.mtime - a.mtime);

const scan = [];
for (const { f, mtime } of files) {
  const t = fs.readFileSync(`${dir}/${f}`, "utf8");
  const phase = (t.match(/"implementationPhase":"([^"]+)"/) || [])[1];
  scan.push({
    f,
    phase,
    mtime: new Date(mtime).toISOString(),
    resolved: (t.match(/compliance\.requirement\.resolved/g) || []).length,
    conflict: (t.match(/compliance\.requirement\.conflict/g) || []).length,
    requestResolve: (t.match(/"event":"compliance\.request\.resolve"/g) || [])
      .length,
    requestUnresolved: (
      t.match(/"event":"compliance\.request\.unresolved"/g) || []
    ).length,
  });
}
fs.writeFileSync(
  "logs/analysis/eval/_phase2_scan.txt",
  JSON.stringify(scan, null, 2)
);

// Deep-accept on any log that has Phase 2 events; else newest
const target =
  scan.find((s) => s.resolved > 0 || s.requestResolve > 0 || s.phase?.startsWith("2")) ||
  scan[0];
if (!target) {
  fs.writeFileSync("logs/analysis/eval/_phase2_accept.txt", "NO_LOGS");
  process.exit(0);
}

const events = fs
  .readFileSync(`${dir}/${target.f}`, "utf8")
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

const by = (n) => events.filter((e) => e.event === n);
const out = [];
out.push(`TARGET=${target.f}`);
out.push(`phase=${target.phase}`);
out.push(JSON.stringify(target));

const resolved = by("compliance.requirement.resolved");
const byCanon = new Map();
for (const r of resolved) {
  const list = byCanon.get(r.canonicalKey) || [];
  list.push(r.inputId);
  byCanon.set(r.canonicalKey, list);
}
out.push("\n=== canonicalKey groups ===");
for (const [key, inputs] of [...byCanon.entries()].sort((a, b) =>
  a[0].localeCompare(b[0])
)) {
  const uniq = [...new Set(inputs)];
  out.push(
    JSON.stringify({
      key,
      inputs: uniq,
      aliasCount: uniq.filter((i) => i !== key && !normalizeEq(i, key)).length,
    })
  );
}
function normalizeEq(a, b) {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

const conflicts = by("compliance.requirement.conflict");
out.push(`\n=== conflicts (${conflicts.length}) ===`);
for (const c of conflicts.slice(0, 20)) {
  out.push(
    JSON.stringify({
      inputId: c.inputId,
      canonicalKey: c.canonicalKey,
      detail: c.detail,
      reason: c.reason,
    })
  );
}

const resolves = by("compliance.request.resolve");
out.push(`\n=== request.resolve (${resolves.length}) ===`);
for (const r of resolves) {
  const n = (r.nativeRequirementIds || []).length;
  const ok =
    r.resolution === "matched"
      ? n === 1
      : r.resolution === "split_match"
        ? n > 1
        : r.resolution === "ambiguous"
          ? true
          : true;
  out.push(
    JSON.stringify({
      requestId: r.requestId,
      resolution: r.resolution,
      nativeLen: n,
      natives: r.nativeRequirementIds,
      canons: r.canonicalRequirementIds,
      shapeOk: ok,
    })
  );
}

const unresolved = by("compliance.request.unresolved");
out.push(`\n=== request.unresolved (${unresolved.length}) ===`);
for (const u of unresolved) {
  out.push(
    JSON.stringify({
      requestId: u.requestId,
      reason: u.reason,
      type: u.requirementType,
    })
  );
}

const openUnresolved = unresolved.filter((u) =>
  String(u.requestId || "").startsWith("open.p")
);
const openResolve = resolves.filter((r) =>
  String(r.requestId || "").startsWith("open.p")
);
out.push(
  `\nopen.p* resolve=${openResolve.length} unresolved=${openUnresolved.length}`
);

fs.writeFileSync("logs/analysis/eval/_phase2_accept.txt", out.join("\n"));
