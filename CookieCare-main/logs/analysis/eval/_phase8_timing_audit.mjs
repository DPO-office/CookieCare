import fs from "fs";
import path from "path";

const OUT = "logs/analysis/eval/_phase8_timing_audit.json";

const EXPECTED_COMPLIANCE_STAGES = [
  "compliance.structure",
  "compliance.reference_index",
  "compliance.requirement_registry",
  "compliance.request_resolution",
  "compliance.investigate",
  "compliance.element_registry",
  "compliance.verify",
  "compliance.fallback",
  "compliance.llm_verify",
  "compliance.assess",
  "compliance.lock",
  "compliance.render",
];

function load(file) {
  return fs
    .readFileSync(file, "utf8")
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
    .flatMap((e) => (e.items || []).slice(0, 2).map((i) => i.quotedText || ""))
    .join(" ");
  if (/Mastercard|3\.5\.6 Return and Deletion/i.test(sample)) return "mastercard";
  if (/Alaio|Bitrix|Deletion on Term Expiry/i.test(sample)) return "bitrix";
  return "unknown";
}

function audit(file, name) {
  const ev = load(file);
  const timing = ev.find((e) => e.event === "compliance.run.timing");
  const recon = ev.find((e) => e.event === "compliance.run.reconciliation");
  const budgetHits = ev.filter(
    (e) =>
      (Array.isArray(e.triggerReasons) &&
        e.triggerReasons.includes("budget_exceeded")) ||
      e.llmError === "budget_exceeded" ||
      (Array.isArray(e.reasonCodes) &&
        e.reasonCodes.includes("budget_exceeded")) ||
      JSON.stringify(e).includes("budget_exceeded")
  );

  const stages = timing?.stages || timing?.stageTimings || null;
  let stageKeys = [];
  let stageMs = {};
  if (stages && typeof stages === "object") {
    if (Array.isArray(stages)) {
      stageKeys = stages.map((s) => s.name || s.stage || s.id).filter(Boolean);
      for (const s of stages) {
        const k = s.name || s.stage || s.id;
        if (k) stageMs[k] = s.durationMs ?? s.ms ?? s.elapsedMs ?? s.duration;
      }
    } else {
      stageKeys = Object.keys(stages);
      for (const k of stageKeys) {
        const v = stages[k];
        stageMs[k] =
          typeof v === "number"
            ? v
            : v?.durationMs ?? v?.ms ?? v?.elapsedMs ?? v?.duration ?? v;
      }
    }
  }

  const complianceStageKeys = stageKeys.filter((k) =>
    String(k).startsWith("compliance.")
  );
  const liveStageKeys = stageKeys.filter(
    (k) => !String(k).startsWith("compliance.")
  );
  const expectedPresent = EXPECTED_COMPLIANCE_STAGES.filter((k) =>
    stageKeys.includes(k)
  );
  const expectedMissing = EXPECTED_COMPLIANCE_STAGES.filter(
    (k) => !stageKeys.includes(k)
  );

  // document hash if present for cache correlation across sessions
  const lockAcc = ev.find((e) => e.event === "compliance.lock.accepted");
  const renderRow = ev.find((e) => e.event === "compliance.render.row");

  return {
    log: name,
    doc: classify(ev),
    analysisId: ev[0]?.analysisId,
    hasTiming: !!timing,
    hasReconciliation: !!recon,
    timingKeys: timing
      ? Object.keys(timing).filter(
          (k) =>
            !["event", "analysisId", "timestamp", "implementationPhase"].includes(
              k
            )
        )
      : [],
    reconKeys: recon
      ? Object.keys(recon).filter(
          (k) =>
            !["event", "analysisId", "timestamp", "implementationPhase"].includes(
              k
            )
        )
      : [],
    reconSummary: recon
      ? {
          planned: recon.planned ?? recon.plannedCount,
          locked: recon.locked ?? recon.lockedCount,
          rendered: recon.rendered ?? recon.renderedCount,
          keys: Object.keys(recon).filter(
            (k) =>
              ![
                "event",
                "analysisId",
                "timestamp",
                "implementationPhase",
              ].includes(k)
          ),
        }
      : null,
    stageKeys,
    complianceStageKeys,
    liveStageKeys,
    stageMs,
    structureMs: stageMs["compliance.structure"],
    investigateMs: stageMs["compliance.investigate"],
    fallbackMs: stageMs["compliance.fallback"],
    llmVerifyMs: stageMs["compliance.llm_verify"],
    expectedPresent,
    expectedMissing,
    budgetExceededEvents: budgetHits.length,
    budgetSample: budgetHits.slice(0, 3).map((e) => ({
      event: e.event,
      requirementId: e.requirementId,
      triggerReasons: e.triggerReasons,
      llmError: e.llmError,
    })),
    documentHash:
      lockAcc?.documentHash || renderRow?.documentHash || null,
    acceptance: {
      timingPersisted: !!timing,
      reconciliationPersisted: !!recon,
      hasCompliancePrefixedStages: complianceStageKeys.length > 0,
      hasStructureStage: stageKeys.includes("compliance.structure"),
      hasInvestigateStage: stageKeys.includes("compliance.investigate"),
      hasFallbackOrLlmVerify:
        stageKeys.includes("compliance.fallback") ||
        stageKeys.includes("compliance.llm_verify"),
    },
  };
}

const dir = "logs/analysis";
const logs = fs
  .readdirSync(dir)
  .filter((n) => n.endsWith(".compliance.log"))
  .map((n) => {
    const p = path.join(dir, n);
    return { n, p, mtime: fs.statSync(p).mtimeMs, iso: fs.statSync(p).mtime.toISOString() };
  })
  .sort((a, b) => b.mtime - a.mtime);

const withTiming = [];
const recent = [];
for (const L of logs.slice(0, 25)) {
  const text = fs.readFileSync(L.p, "utf8");
  const a = audit(L.p, L.n);
  a.iso = L.iso;
  if (a.hasTiming || a.hasReconciliation || /compliance\.run\./.test(text)) {
    withTiming.push(a);
  }
  if (recent.length < 5) recent.push(a);
  if (withTiming.length >= 6) break;
}

// Compare structure ms for same docHash (cache hint)
const byHash = {};
for (const a of [...withTiming, ...recent]) {
  if (!a.documentHash || a.structureMs == null) continue;
  byHash[a.documentHash] = byHash[a.documentHash] || [];
  byHash[a.documentHash].push({
    log: a.log,
    doc: a.doc,
    structureMs: a.structureMs,
    iso: a.iso,
  });
}

fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      recent,
      withTimingOrRecon: withTiming,
      structureByDocumentHash: byHash,
      overall: {
        anyTimingPersisted: withTiming.some((a) => a.hasTiming),
        anyReconPersisted: withTiming.some((a) => a.hasReconciliation),
        latest: recent[0]
          ? {
              log: recent[0].log,
              doc: recent[0].doc,
              ...recent[0].acceptance,
              structureMs: recent[0].structureMs,
              expectedMissing: recent[0].expectedMissing,
            }
          : null,
      },
    },
    null,
    2
  )
);
