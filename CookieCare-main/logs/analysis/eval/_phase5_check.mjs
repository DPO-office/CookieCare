import fs from "fs";

const dir = "logs/analysis";
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".compliance.log"))
  .map((f) => ({ f, m: fs.statSync(`${dir}/${f}`).mtimeMs }))
  .sort((a, b) => b.m - a.m);

function load(f) {
  return fs
    .readFileSync(`${dir}/${f}`, "utf8")
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

function fingerprint(events) {
  const by = (n) => events.filter((e) => e.event === n);
  const dur = by("compliance.bundle.created").find((b) => b.requirementId === "duration");
  const parts = (dur?.partitions || []).map((p) => p.scope?.relationship);
  const excl = {};
  for (const b of by("compliance.bundle.created")) {
    for (const x of b.exclusions || []) excl[x.reason] = (excl[x.reason] || 0) + 1;
  }
  const hasAssess = by("compliance.assess.result").length > 0;
  const fp =
    (excl.incompatible_scope || 0) > 20 || parts.includes("controller_to_controller")
      ? "MC-like"
      : "Bitrix-like";
  return { fp, parts, excl, hasAssess, phase: events[0]?.implementationPhase };
}

function analyze(f, label) {
  const events = load(f);
  const by = (n) => events.filter((e) => e.event === n);
  const meta = fingerprint(events);
  const out = [];
  out.push(`\n======== ${label || meta.fp} ${f} ========`);
  out.push(
    `phase=${meta.phase} assess=${meta.hasAssess} parts=${JSON.stringify(meta.parts)} excl=${JSON.stringify(meta.excl)}`
  );

  const counts = {};
  for (const e of events) counts[e.event] = (counts[e.event] || 0) + 1;
  out.push(`counts=${JSON.stringify(counts)}`);

  if (!meta.hasAssess) {
    out.push("NO Phase 5 assess/explain events — skip");
    return out.join("\n");
  }

  const inputs = by("compliance.assess.input");
  const results = by("compliance.assess.result");
  const explains = by("compliance.explain.draft");
  const verifyEls = by("compliance.verify.element");

  out.push(
    `assess.input=${inputs.length} assess.result=${results.length} explain.draft=${explains.length}`
  );

  // Build verify span sets and supported elements per requirement
  const verifyByReq = new Map();
  for (const e of verifyEls) {
    const r = e.requirementId;
    if (!verifyByReq.has(r)) verifyByReq.set(r, { spans: new Set(), supported: new Set(), states: {} });
    const bag = verifyByReq.get(r);
    for (const s of e.evidenceSpanIds || []) bag.spans.add(s);
    bag.states[e.elementId] = e.state;
    if (e.state === "supported") bag.supported.add(e.elementId);
  }

  out.push("\n--- assess.results ---");
  for (const r of results) {
    out.push(
      JSON.stringify({
        req: r.requirementId,
        canonicalKey: r.canonicalKey,
        status: r.status,
        reasonCodes: r.reasonCodes,
        ruleVersion: r.ruleVersion,
      })
    );
  }

  // Bitrix (g) checks
  const g = results.find(
    (r) =>
      /3g|deletion|28\.3g/i.test(String(r.canonicalKey || "")) ||
      r.requirementId === "art28_3_g_deletion_return"
  );
  out.push("\n--- (g) acceptance ---");
  if (!g) out.push("NO (g) result");
  else {
    const codes = new Set(g.reasonCodes || []);
    const wantPartial = g.status === "partial";
    const hasDelete = codes.has("DELETE_PRESENT");
    const hasReturnMissing = codes.has("RETURN_NOT_LOCATED");
    const hasRetention = codes.has("LEGAL_RETENTION_NOT_LOCATED");
    const hasChoice =
      codes.has("CONTROLLER_CHOICE_NOT_LOCATED") ||
      codes.has("CONTROLLER_CHOICE_CONTRADICTED");
    out.push(
      JSON.stringify({
        status: g.status,
        reasonCodes: g.reasonCodes,
        pass_partial: wantPartial,
        pass_DELETE_PRESENT: hasDelete,
        pass_RETURN_NOT_LOCATED: hasReturnMissing,
        pass_LEGAL_RETENTION_NOT_LOCATED: hasRetention,
        pass_choice: hasChoice,
        bitrix_g_accept:
          wantPartial && hasDelete && hasReturnMissing && hasRetention && hasChoice,
      })
    );
  }

  // (f)
  const fRes = results.find(
    (r) =>
      /3f|security_assistance|controller_assistance/i.test(String(r.canonicalKey || "")) ||
      r.requirementId === "art28_3_f_security_assistance"
  );
  out.push("\n--- (f) ---");
  out.push(
    JSON.stringify(
      fRes && {
        status: fRes.status,
        reasonCodes: fRes.reasonCodes,
        matrix: verifyByReq.get("art28_3_f_security_assistance")?.states,
      }
    )
  );

  // (a)
  const a = results.find(
    (r) =>
      /3a|documented_instructions/i.test(String(r.canonicalKey || "")) ||
      r.requirementId === "art28_3_a_instructions"
  );
  out.push("\n--- (a) ---");
  out.push(
    JSON.stringify(
      a && {
        status: a.status,
        reasonCodes: a.reasonCodes,
        matrix: verifyByReq.get("art28_3_a_instructions")?.states,
      }
    )
  );

  // particulars
  out.push("\n--- particulars ---");
  for (const id of [
    "subject_matter",
    "duration",
    "nature_purpose",
    "data_categories",
    "data_subject_categories",
  ]) {
    const r = results.find((x) => x.requirementId === id);
    out.push(
      `${id}: status=${r?.status} reasons=${JSON.stringify(r?.reasonCodes)} matrix=${JSON.stringify(verifyByReq.get(id)?.states)}`
    );
  }

  // retrieval failure never gap
  out.push("\n--- verification_incomplete not gap ---");
  const badGap = results.filter(
    (r) => r.status === "gap" && (r.reasonCodes || []).includes("VERIFICATION_INCOMPLETE")
  );
  const incomplete = results.filter((r) => r.status === "verification_incomplete");
  const incompleteAsGap = incomplete.filter((r) => r.status === "gap"); // impossible
  out.push(
    `status=verification_incomplete count=${incomplete.length}; gap+VERIFICATION_INCOMPLETE reason=${badGap.length}`
  );
  const anyIncompleteStatusIsGap = results.filter(
    (r) => r.status === "verification_incomplete"
  );
  out.push(
    `verification_incomplete rows never status gap: ${anyIncompleteStatusIsGap.every((r) => r.status !== "gap")}`
  );

  // unresolved dependency => cannot_determine not gap
  out.push("\n--- unresolved deps ---");
  for (const inp of inputs) {
    const unc = inp.completeness?.unresolvedDependencyCount ?? inp.unresolvedDependencyCount;
    if (unc > 0) {
      const r = results.find((x) => x.requirementId === inp.requirementId);
      const states = Object.values(inp.elementStates || inp.elementStates || {});
      out.push(
        `${inp.requirementId}: unresolvedDependencyCount=${unc} status=${r?.status} elementStates=${JSON.stringify(inp.elementStates)}`
      );
    }
  }
  // also from matrix
  for (const [req, bag] of verifyByReq) {
    const unresolved = Object.entries(bag.states).filter(([, s]) => s === "unresolved_dependency");
    if (unresolved.length) {
      const r = results.find((x) => x.requirementId === req);
      out.push(
        `matrix unresolved ${req}: ${unresolved.map(([id]) => id).join(",")} => status=${r?.status}`
      );
    }
  }

  // explain cite integrity
  out.push("\n--- explain cite integrity ---");
  let spanOk = 0,
    spanBad = 0,
    suppOk = 0,
    suppBad = 0,
    conclOk = 0,
    conclBad = 0;
  for (const ex of explains) {
    const req = ex.requirementId;
    const bag = verifyByReq.get(req) || { spans: new Set(), supported: new Set(), states: {} };
    const res = results.find((x) => x.requirementId === req);
    for (const sid of ex.evidenceSpanIds || []) {
      if (bag.spans.has(sid)) spanOk++;
      else {
        spanBad++;
        if (spanBad <= 5)
          out.push(`BAD_SPAN ${req}: ${sid?.slice(-40)}`);
      }
    }
    for (const eid of ex.supportedElementIds || []) {
      if (bag.states[eid] === "supported") suppOk++;
      else {
        suppBad++;
        out.push(`BAD_SUPPORTED ${req}: ${eid} state=${bag.states[eid]}`);
      }
    }
    const concl = (ex.conclusion || "").toLowerCase();
    const st = (res?.status || "").toLowerCase();
    // conclusion should use exact status word
    const uses =
      st &&
      (concl.includes(st) ||
        (st === "cannot_determine" && concl.includes("cannot determine")) ||
        (st === "verification_incomplete" && concl.includes("verification")));
    if (uses) conclOk++;
    else {
      conclBad++;
      out.push(
        `BAD_CONCL ${req}: status=${res?.status} conclusion=${JSON.stringify((ex.conclusion || "").slice(0, 120))}`
      );
    }
  }
  out.push(
    `span cites ok=${spanOk} bad=${spanBad}; supportedIds ok=${suppOk} bad=${suppBad}; conclusion ok=${conclOk} bad=${conclBad}`
  );

  // sample g explain
  const gEx = explains.find((e) => e.requirementId === "art28_3_g_deletion_return");
  if (gEx) {
    out.push("\n--- (g) explain sample ---");
    out.push(
      JSON.stringify({
        conclusion: gEx.conclusion,
        whatProvides: (gEx.whatTheDocumentProvides || "").slice(0, 200),
        whatMissing: (gEx.whatIsMissingOrUnclear || "").slice(0, 200),
        action: gEx.recommendedAction,
        supportedElementIds: gEx.supportedElementIds,
        missingElementIds: gEx.missingElementIds,
        nSpans: (gEx.evidenceSpanIds || []).length,
      })
    );
  }

  return out.join("\n");
}

// Pick newest with assess, plus newest MC-like and Bitrix-like with assess
const ranked = files.map((x) => {
  const events = load(x.f);
  return { ...x, ...fingerprint(events), events };
});

const withAssess = ranked.filter((x) => x.hasAssess);
const out = [];
out.push(`newest_logs=${files.slice(0, 5).map((x) => x.f).join(" | ")}`);
out.push(`with_assess=${withAssess.length}`);

const newest = withAssess[0];
if (newest) out.push(analyze(newest.f));

const bitrix = withAssess.find((x) => x.fp === "Bitrix-like");
const mc = withAssess.find((x) => x.fp === "MC-like");
if (bitrix && bitrix.f !== newest?.f) out.push(analyze(bitrix.f, "Bitrix-like"));
if (mc && mc.f !== newest?.f) out.push(analyze(mc.f, "MC-like"));
if (bitrix && bitrix.f === newest?.f && mc) out.push(analyze(mc.f, "MC-like"));
if (mc && mc.f === newest?.f && bitrix) out.push(analyze(bitrix.f, "Bitrix-like"));

// If only one assess log, still print fingerprint clearly
if (withAssess.length === 1) {
  out.push(`(only one Phase 5 log found: ${withAssess[0].fp})`);
}

fs.writeFileSync("logs/analysis/eval/_phase5_check.txt", out.join("\n"));
console.log("ok", withAssess.map((x) => x.f + ":" + x.fp).join(", "));
