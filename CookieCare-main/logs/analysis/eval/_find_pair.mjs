import fs from "fs";

// Dig into why F3 might fail despite impact assessment in 3.5.5
const mcPath = fs
  .readdirSync("logs/analysis")
  .filter((n) => n.endsWith(".compliance.log"))
  .map((n) => {
    const p = `logs/analysis/${n}`;
    const st = fs.statSync(p);
    return { n, p, mtime: st.mtimeMs };
  })
  .sort((a, b) => b.mtime - a.mtime);

const results = [];
for (const { n, p } of mcPath.slice(0, 25)) {
  const text = fs.readFileSync(p, "utf8");
  if (!/Mastercard|3\.5\.6 Return and Deletion/i.test(text)) continue;
  const ev = text
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
  const verifyG = ev
    .filter(
      (e) =>
        e.event === "compliance.verify.element" &&
        e.requirementId === "art28_3_g_deletion_return"
    )
    .map((e) => `${e.elementId}:${e.state}`);
  const verifyF = ev
    .filter(
      (e) =>
        e.event === "compliance.verify.element" &&
        e.requirementId === "art28_3_f_security_assistance"
    )
    .map((e) => `${e.elementId}:${e.state}`);
  const assess = ev.filter(
    (e) =>
      e.event === "compliance.assess.requirement" ||
      e.event === "assess.requirement"
  );
  results.push({
    n,
    verifyG,
    verifyF,
    assessG: assess
      .filter((e) => e.requirementId === "art28_3_g_deletion_return")
      .map((e) => ({ status: e.status, codes: e.reasonCodes })),
  });
}

// Bitrix latest
const bx = [];
for (const { n, p } of mcPath.slice(0, 40)) {
  const text = fs.readFileSync(p, "utf8");
  if (!/Alaio|Bitrix|Deletion on Term Expiry/i.test(text)) continue;
  if (/Mastercard|3\.5\.6 Return and Deletion/i.test(text)) continue;
  const ev = text
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
  const verifyG = ev
    .filter(
      (e) =>
        e.event === "compliance.verify.element" &&
        e.requirementId === "art28_3_g_deletion_return"
    )
    .map((e) => `${e.elementId}:${e.state}`);
  const verifyF = ev
    .filter(
      (e) =>
        e.event === "compliance.verify.element" &&
        e.requirementId === "art28_3_f_security_assistance"
    )
    .map((e) => `${e.elementId}:${e.state}`);
  bx.push({ n, verifyG, verifyF });
}

fs.writeFileSync(
  "logs/analysis/eval/_latest_pair_states.json",
  JSON.stringify({ mastercardLike: results.slice(0, 5), bitrixLike: bx.slice(0, 5) }, null, 2)
);
