import fs from "fs";

const f =
  "logs/analysis/an_d78ffdf0-563a-4118-8486-52a6a0fcf094.compliance.log";
const t = fs.readFileSync(f, "utf8");
const lines = t
  .split(/\n/)
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l));

const out = [];
out.push(`header_bundle_only=${t.includes("EVIDENCE BUNDLES ONLY")}`);
out.push(`jsonLines=${lines.length}`);
out.push(
  `all_bundle_created=${lines.every((e) => e.event === "compliance.bundle.created")}`
);
out.push(`phase=${lines[0]?.implementationPhase}`);
out.push(`other_events=${[...new Set(lines.map((e) => e.event))].join(",")}`);

const reqs = lines.map((e) => e.requirementId);
out.push(`reqs=${JSON.stringify(reqs)}`);
out.push(`unique=${new Set(reqs).size}`);

for (const e of lines) {
  const items = e.items || [];
  const parts = e.partitions || [];
  const excl = e.exclusions || [];
  const deps = e.dependencies || [];
  const exclR = {};
  for (const x of excl) exclR[x.reason] = (exclR[x.reason] || 0) + 1;
  const depS = {};
  for (const d of deps) depS[d.state] = (depS[d.state] || 0) + 1;
  const sources = {};
  for (const i of items) sources[i.source] = (sources[i.source] || 0) + 1;
  const partScopes = parts.map(
    (p) => `${p.partitionId}:${p.scope?.relationship || "?"}/${p.scope?.exception || "main"}#${(p.itemSpanIds || []).length}`
  );
  const hasText = items.every(
    (i) => typeof i.quotedText === "string" && i.quotedText.length > 0
  );
  const fieldsOK = items.every(
    (i) =>
      i.spanId &&
      i.ref &&
      Array.isArray(i.charRange) &&
      i.charRange.length === 2 &&
      typeof i.structuralPath === "string" &&
      i.scope &&
      (i.source === "seed" || i.source === "expansion")
  );
  out.push(
    [
      e.requirementId,
      `items=${items.length}`,
      `tok=${e.estimatedTokens}`,
      `parts=${parts.length}[${partScopes.join(";")}]`,
      `excl=${JSON.stringify(exclR)}`,
      `deps=${deps.length}${JSON.stringify(depS)}`,
      `src=${JSON.stringify(sources)}`,
      `textOK=${hasText}`,
      `fieldsOK=${fieldsOK}`,
      `spanIdsMatch=${
        Array.isArray(e.evidenceSpanIds) &&
        e.evidenceSpanIds.length === items.length
      }`,
    ].join(" | ")
  );
}

function reqItems(id) {
  return lines.find((x) => x.requirementId === id)?.items || [];
}
function sampleQuotes(id, n = 2) {
  return reqItems(id)
    .slice(0, n)
    .map((i) => ({
      path: i.structuralPath,
      src: i.source,
      rel: i.scope?.relationship,
      q: (i.quotedText || "").slice(0, 140).replace(/\s+/g, " "),
    }));
}

out.push("---content_samples---");
out.push(
  "data_categories: " + JSON.stringify(sampleQuotes("data_categories"), null, 0)
);
out.push("duration: " + JSON.stringify(sampleQuotes("duration"), null, 0));
out.push(
  "art28_3_f: " +
    JSON.stringify(sampleQuotes("art28_3_f_security_assistance"), null, 0)
);

const catItems = reqItems("data_categories");
const durItems = reqItems("duration");
const fItems = reqItems("art28_3_f_security_assistance");
out.push("---content_flags---");
out.push(
  `categories_has_appendix_path=${catItems.some((i) => /appendix/i.test(i.structuralPath || ""))}`
);
out.push(
  `categories_has_list_body=${catItems.some((i) => /●|personal details|contact details|categories/i.test(i.quotedText || ""))}`
);
out.push(
  `duration_has_term_path=${durItems.some((i) => /term/i.test(i.structuralPath || ""))}`
);
out.push(
  `duration_has_term_text=${durItems.some((i) => /\bTerm\b|terminat|duration of/i.test(i.quotedText || ""))}`
);
out.push(
  `f_has_assist_or_security=${fItems.some((i) =>
    /assist|secur|breach|article 32|incident/i.test(i.quotedText || "")
  )}`
);
out.push(`any_empty_items=${lines.some((e) => (e.items || []).length === 0)}`);
out.push(
  `tok_gt_4000=${
    lines
      .filter((e) => e.estimatedTokens > 4000)
      .map((e) => e.requirementId + ":" + e.estimatedTokens)
      .join(",") || "none"
  }`
);
out.push(
  `incompatible_scope_total=${lines.reduce(
    (n, e) =>
      n + (e.exclusions || []).filter((x) => x.reason === "incompatible_scope").length,
    0
  )}`
);

fs.writeFileSync("logs/analysis/eval/_check_d78.txt", out.join("\n"));
console.log("ok");
