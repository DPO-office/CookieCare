import fs from "fs";
import path from "path";

const dir = "logs/analysis";
const logs = fs
  .readdirSync(dir)
  .filter((n) => n.endsWith(".compliance.log"))
  .map((n) => {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    return { n, p, mtime: st.mtimeMs, iso: st.mtime.toISOString() };
  })
  .sort((a, b) => b.mtime - a.mtime);

function load(p) {
  return fs
    .readFileSync(p, "utf8")
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
}

function classify(ev) {
  const sample = ev
    .filter((e) => e.event === "compliance.bundle.created")
    .flatMap((e) => (e.items || []).slice(0, 3).map((i) => i.quotedText || ""))
    .join(" ");
  if (/Mastercard|3\.5\.6 Return and Deletion/i.test(sample)) return "mastercard";
  if (/Alaio|Bitrix|Deletion on Term Expiry/i.test(sample)) return "bitrix";
  return "unknown";
}

function audit(L) {
  const ev = load(L.p);
  const doc = classify(ev);
  const attempts = ev.filter((e) => e.event === "compliance.lock.attempt");
  const accepted = ev.filter((e) => e.event === "compliance.lock.accepted");
  const rejected = ev.filter((e) => e.event === "compliance.lock.rejected");
  const summary = ev.find((e) => e.event === "compliance.lock.summary");
  const verify = (req) =>
    ev
      .filter(
        (e) =>
          e.event === "compliance.verify.element" && e.requirementId === req
      )
      .map((e) => `${e.elementId}=${e.state}`);
  const assess = (req) => {
    const a = ev.find(
      (e) =>
        e.event === "compliance.assess.result" && e.requirementId === req
    );
    return a
      ? {
          status: a.status,
          reasonCodes: a.reasonCodes,
          elementStates: a.elementStates,
        }
      : null;
  };
  const reasonHist = {};
  for (const r of rejected) {
    for (const c of r.reasonCodes || []) {
      reasonHist[c] = (reasonHist[c] || 0) + 1;
    }
  }
  return {
    log: L.n,
    iso: L.iso,
    doc,
    analysisId: ev[0]?.analysisId,
    hasLock: attempts.length > 0,
    lock: {
      attempt: attempts.length,
      accepted: accepted.length,
      rejected: rejected.length,
      summary: summary
        ? {
            attempted: summary.attempted,
            accepted: summary.accepted,
            rejected: summary.rejected,
            duplicateCanonicalKeys: summary.duplicateCanonicalKeys,
            plannedButNotAttempted: summary.plannedButNotAttempted,
          }
        : null,
      acceptedReqs: accepted.map((a) => `${a.requirementId}:${a.status}`),
      rejectedReqs: rejected.map((r) => ({
        requirementId: r.requirementId,
        reasonCodes: r.reasonCodes,
        details: (r.details || []).slice(0, 2),
      })),
      reasonHist,
    },
    matrix: {
      g: verify("art28_3_g_deletion_return"),
      f: verify("art28_3_f_security_assistance"),
      assessG: assess("art28_3_g_deletion_return"),
      assessF: assess("art28_3_f_security_assistance"),
    },
  };
}

// Newest overall + newest mastercard (possibly 2 recent)
const results = [];
let mcCount = 0;
for (const L of logs.slice(0, 15)) {
  const a = audit(L);
  if (!a.hasLock && a.doc === "unknown") continue;
  results.push(a);
  if (a.doc === "mastercard") mcCount++;
  if (results.length >= 4 && mcCount >= 2) break;
}

fs.writeFileSync(
  "logs/analysis/eval/_latest_mc_check.json",
  JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)
);
