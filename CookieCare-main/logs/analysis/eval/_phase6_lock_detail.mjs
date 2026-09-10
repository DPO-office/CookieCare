import fs from "fs";

const ev = fs
  .readFileSync(
    "logs/analysis/an_d780c453-6d3f-4bfe-ab99-22582fb4ea5c.compliance.log",
    "utf8"
  )
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));

const accepted = ev.filter((e) => e.event === "compliance.lock.accepted");
const summary = ev.find((e) => e.event === "compliance.lock.summary");
const explain = ev.filter((e) => e.event === "compliance.explain.draft");
const assess = ev.filter((e) => e.event === "compliance.assess.result");
const verifyEl = ev.filter((e) => e.event === "compliance.verify.element");

// Do supported verdicts carry quotes? (Gate 5 only fires when quotes exist)
const supportedWithQuotes = verifyEl
  .filter((e) => e.state === "supported")
  .map((e) => ({
    req: e.requirementId,
    el: e.elementId,
    quoteCount: Array.isArray(e.quotes) ? e.quotes.length : e.quotes ? 1 : 0,
    evidenceCount: (e.evidenceSpanIds || []).length,
  }));

const g = {
  assessG: assess.find((a) => a.requirementId === "art28_3_g_deletion_return"),
  explainG: explain.find((a) => a.requirementId === "art28_3_g_deletion_return"),
  lockG: accepted.find((a) => a.requirementId === "art28_3_g_deletion_return"),
  verifyG: verifyEl
    .filter((e) => e.requirementId === "art28_3_g_deletion_return")
    .map((e) => `${e.elementId}=${e.state}`),
};

fs.writeFileSync(
  "logs/analysis/eval/_phase6_lock_detail.json",
  JSON.stringify(
    {
      acceptedRequirementIds: accepted.map((a) => a.requirementId),
      summary,
      g,
      supportedQuoteStats: {
        n: supportedWithQuotes.length,
        withQuotes: supportedWithQuotes.filter((x) => x.quoteCount > 0).length,
        withoutQuotes: supportedWithQuotes.filter((x) => x.quoteCount === 0)
          .length,
        sample: supportedWithQuotes.slice(0, 8),
      },
      note: "Phase 6 validates artifact consistency; it can accept a legally-wrong G4=not_located if explain/assess/matrix agree.",
    },
    null,
    2
  )
);
