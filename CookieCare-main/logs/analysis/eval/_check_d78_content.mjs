import fs from "fs";

const path =
  "logs/analysis/an_d78ffdf0-563a-4118-8486-52a6a0fcf094.compliance.log";
const lines = fs
  .readFileSync(path, "utf8")
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));

function dig(id) {
  const e = lines.find((x) => x.requirementId === id);
  const items = e.items || [];
  const hits = [];
  for (const i of items) {
    const q = i.quotedText || "";
    const p = i.structuralPath || "";
    const flags = [];
    if (/appendix/i.test(p) || /appendix\s*1/i.test(q)) flags.push("appendix");
    if (/term\b|\"Term\"|definition of/i.test(p + " " + q)) flags.push("term");
    if (/●|personal details|contact details|processing subject matter/i.test(q))
      flags.push("listish");
    if (/assist|secur|breach|article 32|6\.4|clause 10/i.test(q))
      flags.push("f_related");
    if (/30754|30465|32965/.test(i.spanId || "")) flags.push("app_offset");
    if (flags.length) {
      hits.push({
        flags,
        path: p,
        src: i.source,
        span: i.spanId?.slice(-40),
        q: q.slice(0, 160).replace(/\s+/g, " "),
      });
    }
  }
  return { n: items.length, hits: hits.slice(0, 8), hitCount: hits.length };
}

const out = {
  subject_matter: dig("subject_matter"),
  data_categories: dig("data_categories"),
  duration: dig("duration"),
  f: dig("art28_3_f_security_assistance"),
};

// token budget sanity
const toks = lines.map((e) => e.estimatedTokens);
out.tokenStats = {
  min: Math.min(...toks),
  max: Math.max(...toks),
  over4000: toks.filter((x) => x > 4000).length,
  over6000: toks.filter((x) => x > 6000).length,
};

// duplicate first expansion path across reqs
const firstPaths = lines.map((e) => e.items?.[0]?.structuralPath);
out.firstItemPathCounts = firstPaths.reduce((m, p) => {
  m[p] = (m[p] || 0) + 1;
  return m;
}, {});

fs.writeFileSync(
  "logs/analysis/eval/_check_d78_content.txt",
  JSON.stringify(out, null, 2)
);
