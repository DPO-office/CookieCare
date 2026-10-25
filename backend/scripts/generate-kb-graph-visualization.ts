import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const runDir = path.resolve(process.argv[2] ??
  "evaluation-runs/DPDPA-2023 Act.pdf/d758231c-78a5-4bdd-a21e-fbd3703703aa");
const outputPath = path.resolve(process.argv[3] ?? path.join(runDir, "dpdpa-knowledge-graph.html"));
const readJson = async (name: string) => JSON.parse(await readFile(path.join(runDir, name), "utf8"));
const [reconstruction, evaluationInput, evaluationReport] = await Promise.all([
  readJson("reconstruction.json"), readJson("evaluation-input.json"), readJson("evaluation-report.json"),
]);

const evaluationCase = evaluationReport.cases?.[0] ?? null;
const evaluationArtifact = evaluationCase ? evaluationInput.artifacts?.[evaluationCase.caseId] : null;
const evaluatedIds = new Set((evaluationArtifact?.provisions ?? []).map((node: any) => node.id));
const failedFields = evaluationCase?.failedExpectedFields ?? [];
const failureMatchers = failedFields.map((field: string) => {
  const match = field.match(/(?:node|edge):Section\s+(\d+)(?:\((\d+)\))?/i);
  return { field, section: match?.[1] ?? null, subsection: match?.[2] ?? null };
});

const provisions = reconstruction.provisions.map((provision: any) => {
  const pages = [...new Set((provision.sourceSpans ?? []).map((span: any) => span.physicalPage).filter(Boolean))];
  const searchable = `${(provision.structuralPath ?? []).join(" > ")} ${provision.label ?? ""} ${provision.text ?? ""}`;
  const failures = failureMatchers.filter((failure: any) => {
    if (!failure.section) return false;
    const section = new RegExp(`(^|[^0-9])${failure.section}\\.`, "i").test(searchable);
    const subsection = !failure.subsection || new RegExp(`\\(\\s*${failure.subsection}\\s*\\)`).test(provision.label ?? provision.text ?? "");
    return section && subsection;
  }).map((failure: any) => failure.field);
  return {
    id: provision.id, label: provision.label || `${provision.kind} ${provision.id.slice(0, 7)}`,
    text: String(provision.text ?? "").replace(/\s+/g, " ").trim().slice(0, 1200),
    kind: provision.kind, status: provision.status, boundary: provision.boundaryStatus,
    pages, page: pages[0] ?? null, evaluated: evaluatedIds.has(provision.id), failures, virtual: false,
  };
});

const provisionIds = new Set(provisions.map((node: any) => node.id));
const links: any[] = [];
const virtualNodes: any[] = [];
for (const provision of reconstruction.provisions) {
  if (provision.parentId && provisionIds.has(provision.parentId)) {
    links.push({ id: `hierarchy:${provision.id}`, source: provision.parentId, target: provision.id,
      type: "hierarchy", status: "structural", mention: "contains" });
  }
}
for (const relationship of reconstruction.relationships) {
  const internalTargets = relationship.targetProvisionIds?.length
    ? relationship.targetProvisionIds.filter((id: string) => provisionIds.has(id))
    : relationship.targetProvisionId && provisionIds.has(relationship.targetProvisionId)
      ? [relationship.targetProvisionId] : [];
  if (internalTargets.length) {
    for (const target of internalTargets) links.push({ id: `${relationship.id}:${target}`,
      source: relationship.sourceProvisionId, target, type: "reference", status: relationship.status,
      mention: relationship.exactMention || relationship.targetHint || "reference" });
    continue;
  }
  const virtualId = `reference:${relationship.id}`;
  const sourceIsEvaluated = evaluatedIds.has(relationship.sourceProvisionId);
  virtualNodes.push({ id: virtualId,
    label: relationship.externalTarget?.instrumentHint || relationship.targetHint || relationship.exactMention || "Unresolved target",
    text: relationship.status === "external_unavailable" ? "External reference target is unavailable in this document."
      : "Reference target was not resolved to an internal provision.",
    kind: "reference_target", status: relationship.status, boundary: null, pages: [], page: null,
    evaluated: sourceIsEvaluated, failures: [], virtual: true });
  links.push({ id: relationship.id, source: relationship.sourceProvisionId, target: virtualId,
    type: "reference", status: relationship.status,
    mention: relationship.exactMention || relationship.targetHint || "reference" });
}

const nodes = [...provisions, ...virtualNodes];
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
}[character]!));
const short = (value: string, limit: number) => value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
const WIDTH = 1400;
const HEIGHT = 760;
type PositionedNode = any & { x: number; y: number };

function layout(scope: "evaluation" | "document") {
  const selected = nodes.filter((node: any) => scope === "document" || node.evaluated);
  const selectedIds = new Set(selected.map((node: any) => node.id));
  const selectedLinks = links.filter(link => selectedIds.has(link.source) && selectedIds.has(link.target));
  const groups = new Map<string, any[]>();
  for (const node of selected) {
    const key = node.virtual ? "Targets" : node.page ? `Page ${node.page}` : "Unpaged";
    const list = groups.get(key) ?? [];
    list.push(node); groups.set(key, list);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === "Targets") return 1; if (b === "Targets") return -1;
    if (a === "Unpaged") return 1; if (b === "Unpaged") return -1;
    return Number(a.replace("Page ", "")) - Number(b.replace("Page ", ""));
  });
  const positioned: PositionedNode[] = [];
  const positions = new Map<string, PositionedNode>();
  keys.forEach((key, columnIndex) => {
    const column = groups.get(key)!;
    column.sort((a, b) => (a.kind === "section" ? -1 : 0) - (b.kind === "section" ? -1 : 0) || a.label.localeCompare(b.label));
    const x = keys.length === 1 ? WIDTH / 2 : 75 + columnIndex * ((WIDTH - 150) / (keys.length - 1));
    column.forEach((node, rowIndex) => {
      const y = column.length === 1 ? HEIGHT / 2 : 78 + rowIndex * ((HEIGHT - 130) / (column.length - 1));
      const placed = { ...node, x, y }; positioned.push(placed); positions.set(node.id, placed);
    });
  });
  return { keys, nodes: positioned, links: selectedLinks, positions };
}

function renderScope(scope: "evaluation" | "document") {
  const graph = layout(scope);
  const guides = graph.keys.map((key, index) => {
    const x = graph.keys.length === 1 ? WIDTH / 2 : 75 + index * ((WIDTH - 150) / (graph.keys.length - 1));
    return `<line class="kg-page-guide" x1="${x}" y1="48" x2="${x}" y2="${HEIGHT - 28}"></line><text class="kg-page-title" x="${x}" y="28" text-anchor="middle">${escapeHtml(key)}</text>`;
  }).join("\n");
  const renderedLinks = graph.links.map(link => {
    const source = graph.positions.get(link.source), target = graph.positions.get(link.target);
    if (!source || !target) return "";
    const classes = ["kg-edge", link.type === "reference" ? "kg-edge-reference" : "kg-edge-hierarchy",
      ["unresolved", "ambiguous", "external_unavailable"].includes(link.status) ? "kg-edge-unresolved" : ""].filter(Boolean).join(" ");
    return `<line class="${classes}" data-link-type="${link.type}" data-link-status="${escapeHtml(link.status)}" data-source="${escapeHtml(link.source)}" data-target="${escapeHtml(link.target)}" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" ${link.type === "reference" ? "marker-end=\"url(#kg-arrow)\"" : ""}></line>`;
  }).join("\n");
  const renderedNodes = graph.nodes.map(node => {
    const structural = ["section", "chapter", "schedule", "article"].includes(node.kind);
    const detail = ["subsection", "paragraph", "list_item", "illustration", "definition"].includes(node.kind);
    const kindClass = node.virtual ? "kg-node-reference" : structural ? "kg-node-structural" : detail ? "kg-node-detail" : "kg-node-unknown";
    const radius = node.virtual ? 7 : structural ? 11 : node.kind === "definition" ? 8 : 6;
    const shouldLabel = scope === "evaluation" || structural || node.failures.length;
    const anchor = node.x > WIDTH - 210 ? "end" : "start";
    const labelX = node.x > WIDTH - 210 ? -14 : 14;
    return `<g class="kg-node-group cursor-interaction ${node.virtual ? "kg-virtual" : ""}" data-node-id="${escapeHtml(node.id)}" data-search="${escapeHtml(`${node.label} ${node.text} ${node.kind}`.toLowerCase())}"><circle class="kg-node ${kindClass} ${node.evaluated ? "kg-node-evaluated" : ""} ${node.failures.length ? "kg-node-failed" : ""}" cx="${node.x}" cy="${node.y}" r="${radius}"></circle>${shouldLabel ? `<text class="kg-node-label" x="${node.x + labelX}" y="${node.y + 4}" text-anchor="${anchor}">${escapeHtml(short(node.label, scope === "evaluation" ? 34 : 24))}</text>` : ""}</g>`;
  }).join("\n");
  return `<g class="kg-scope" data-scope="${scope}" ${scope === "document" ? "hidden" : ""}>${guides}${renderedLinks}${renderedNodes}</g>`;
}

const data = { nodes: nodes.map((node: any) => ({ id: node.id, label: node.label, text: node.text,
  kind: node.kind, status: node.status, boundary: node.boundary, pages: node.pages,
  failures: node.failures, virtual: node.virtual })), links, summary: {
  provisions: provisions.length, hierarchy: links.filter(link => link.type === "hierarchy").length,
  references: reconstruction.relationships.length,
  resolved: reconstruction.relationships.filter((relationship: any) => relationship.targetProvisionIds?.length || relationship.targetProvisionId).length,
  evaluationNodes: evaluatedIds.size, caseId: evaluationCase?.caseId ?? "Evaluation",
  status: evaluationCase?.status ?? "not_run", passed: evaluationCase?.expectedChecks?.passed ?? 0,
  failed: evaluationCase?.expectedChecks?.failed ?? 0, review: evaluationCase?.expectedChecks?.needsReview ?? 0,
  total: evaluationCase?.expectedChecks?.total ?? 0, failedFields } };
const serialized = JSON.stringify(data).replace(/</g, "\\u003c");

const html = `<div id="dpdpa-graph-v3">
  <header class="kg-header"><div><h2>DPDPA 2023 knowledge graph</h2><div class="text-small text-muted">Run ${escapeHtml(evaluationReport.runId?.slice(0, 8))} | pipeline ${escapeHtml(evaluationReport.model)} | judge ${escapeHtml(evaluationReport.judgeModel)}</div></div><button type="button" class="btn" id="kg-fit"><i data-lucide="maximize-2" aria-hidden="true"></i> Fit graph</button></header>
  <div class="viz-grid kg-stats">
    <div class="card viz-stat"><span class="text-muted">Extracted provisions</span><span class="viz-stat-value tabular-nums">${data.summary.provisions}</span><span class="text-small text-muted">${data.summary.hierarchy} hierarchy edges</span></div>
    <div class="card viz-stat"><span class="text-muted">Detected references</span><span class="viz-stat-value tabular-nums">${data.summary.references}</span><span class="text-small text-muted">${data.summary.resolved} internal targets resolved</span></div>
    <div class="card viz-stat"><span class="text-muted">${escapeHtml(data.summary.caseId)}</span><span class="viz-stat-value kg-status">${escapeHtml(data.summary.status)}</span><span class="text-small text-muted">${data.summary.passed}/${data.summary.total} checks passed | ${data.summary.review} need review</span></div>
  </div>
  <div class="viz-controls kg-controls">
    <div class="nav nav-pills" role="tablist" aria-label="Graph scope"><button class="nav-link active" id="kg-tab-evaluation" role="tab" aria-controls="kg-svg" aria-selected="true" type="button" data-scope-button="evaluation">Evaluated case (${data.summary.evaluationNodes})</button><button class="nav-link" id="kg-tab-document" role="tab" aria-controls="kg-svg" aria-selected="false" type="button" data-scope-button="document">Whole document (${data.summary.provisions})</button></div>
    <label class="form-label kg-search">Find a node<input class="form-control" id="kg-search" type="search" placeholder="Try Section 8 or personal data breach"></label>
    <label class="form-check"><input class="form-check-input" id="kg-hierarchy" type="checkbox" checked><span class="form-check-label">Hierarchy</span></label>
    <label class="form-check"><input class="form-check-input" id="kg-references" type="checkbox" checked><span class="form-check-label">References</span></label>
    <label class="form-check"><input class="form-check-input" id="kg-unresolved" type="checkbox" checked><span class="form-check-label">Unresolved targets</span></label>
  </div>
  <div class="kg-legend text-small"><span><i class="kg-dot kg-legend-structural"></i>Section / chapter</span><span><i class="kg-dot kg-legend-detail"></i>Subsection / paragraph</span><span><i class="kg-dot kg-legend-unknown"></i>Unclassified</span><span><i class="kg-dot kg-legend-reference"></i>Reference target</span><span><i class="kg-ring"></i>Evaluation scope</span><span><i class="kg-ring kg-ring-fail"></i>Failed check</span></div>
  <section class="kg-canvas" aria-label="DPDPA provision relationship graph"><svg id="kg-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="kg-svg-title kg-svg-desc"><title id="kg-svg-title">DPDPA provision and relationship graph</title><desc id="kg-svg-desc">Pre-rendered graph grouped by source page. Select nodes to inspect their text and relationships.</desc><defs><marker id="kg-arrow" viewBox="0 -5 10 10" refX="17" refY="0" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,-5L10,0L0,5"></path></marker></defs>${renderScope("evaluation")}${renderScope("document")}</svg><div class="tooltip kg-tooltip" id="kg-tooltip" role="tooltip" hidden></div></section>
  <div class="text-small text-muted kg-visible" id="kg-visible">${data.summary.evaluationNodes} evaluated provisions shown</div>
  <section class="card kg-detail" aria-live="polite"><div id="kg-summary"><h3>Evaluation findings</h3><div class="kg-score"><span class="kg-pass">${data.summary.passed} passed</span><span class="kg-fail">${data.summary.failed} failed</span><span>${data.summary.review} review</span></div><div id="kg-failures"></div></div><div id="kg-selection" hidden><button type="button" class="btn btn-ghost" id="kg-back"><i data-lucide="arrow-left" aria-hidden="true"></i> Evaluation findings</button><h3 id="kg-node-label"></h3><div class="kg-meta" id="kg-node-meta"></div><p id="kg-node-text"></p><div id="kg-node-failures"></div><hr><div class="text-small" id="kg-node-links"></div></div></section>
</div>
<style>
#dpdpa-graph-v3{width:100%;color:var(--foreground)}#dpdpa-graph-v3 .kg-header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-right:96px;margin-bottom:14px}#dpdpa-graph-v3 .kg-header h2{margin:0 0 4px}#dpdpa-graph-v3 .kg-stats{grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:14px}#dpdpa-graph-v3 .viz-stat-value{display:block;margin:3px 0}#dpdpa-graph-v3 .kg-status{color:var(--red);text-transform:uppercase}#dpdpa-graph-v3 .kg-controls{align-items:end;margin-bottom:8px}#dpdpa-graph-v3 .kg-search{flex:1 1 260px;margin:0}#dpdpa-graph-v3 .kg-controls .form-check{margin-bottom:8px}#dpdpa-graph-v3 .kg-legend{display:flex;flex-wrap:wrap;gap:8px 16px;color:var(--muted-foreground);margin:8px 0}#dpdpa-graph-v3 .kg-legend span{display:inline-flex;align-items:center;gap:6px}#dpdpa-graph-v3 .kg-dot{width:10px;height:10px;border-radius:50%;display:inline-block}#dpdpa-graph-v3 .kg-legend-structural{background:var(--viz-series-1)}#dpdpa-graph-v3 .kg-legend-detail{background:var(--viz-series-3)}#dpdpa-graph-v3 .kg-legend-unknown{background:var(--viz-series-4)}#dpdpa-graph-v3 .kg-legend-reference{background:var(--viz-series-5)}#dpdpa-graph-v3 .kg-ring{width:12px;height:12px;border-radius:50%;border:2px solid var(--purple);display:inline-block}#dpdpa-graph-v3 .kg-ring-fail{border-color:var(--red)}#dpdpa-graph-v3 .kg-canvas{position:relative;height:690px;overflow:hidden;border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:radial-gradient(circle at center,color-mix(in srgb,var(--viz-series-1) 6%,transparent),transparent 66%)}#dpdpa-graph-v3 #kg-svg{width:100%;height:100%;display:block;touch-action:none}#dpdpa-graph-v3 .kg-page-guide{stroke:var(--border);stroke-width:1;opacity:.32}#dpdpa-graph-v3 .kg-page-title{fill:var(--muted-foreground);font-size:12px}#dpdpa-graph-v3 .kg-edge{stroke:var(--border);stroke-width:1.25;opacity:.68}#dpdpa-graph-v3 .kg-edge-reference{stroke:var(--viz-series-2);stroke-width:1.8}#dpdpa-graph-v3 .kg-edge-unresolved{stroke:var(--orange);stroke-dasharray:5 4}#dpdpa-graph-v3 #kg-arrow path{fill:var(--viz-series-2)}#dpdpa-graph-v3 .kg-node{stroke:var(--background);stroke-width:2}#dpdpa-graph-v3 .kg-node-structural{fill:var(--viz-series-1)}#dpdpa-graph-v3 .kg-node-detail{fill:var(--viz-series-3)}#dpdpa-graph-v3 .kg-node-unknown{fill:var(--viz-series-4)}#dpdpa-graph-v3 .kg-node-reference{fill:var(--viz-series-5)}#dpdpa-graph-v3 .kg-node-evaluated{stroke:var(--purple);stroke-width:3}#dpdpa-graph-v3 .kg-node-failed{stroke:var(--red);stroke-width:5}#dpdpa-graph-v3 .kg-node-selected{stroke:var(--foreground);stroke-width:5}#dpdpa-graph-v3 .kg-node-label{fill:var(--foreground);font-size:12px;paint-order:stroke;stroke:var(--background);stroke-width:3px;stroke-linejoin:round;pointer-events:none}#dpdpa-graph-v3 .kg-node-group:hover .kg-node{stroke:var(--foreground);stroke-width:4}#dpdpa-graph-v3 .kg-dim{opacity:.12}#dpdpa-graph-v3 .kg-tooltip{position:absolute;pointer-events:none;max-width:310px;background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:8px;padding:8px 10px;z-index:5}#dpdpa-graph-v3 .kg-tooltip strong{display:block;margin-bottom:3px;font-weight:500}#dpdpa-graph-v3 .kg-visible{margin:7px 0}#dpdpa-graph-v3 .kg-detail{margin-top:10px}#dpdpa-graph-v3 .kg-detail h3{margin:0 0 8px;overflow-wrap:anywhere}#dpdpa-graph-v3 .kg-score{display:flex;flex-wrap:wrap;gap:8px 14px;margin-bottom:8px}#dpdpa-graph-v3 .kg-pass{color:var(--green)}#dpdpa-graph-v3 .kg-fail{color:var(--red)}#dpdpa-graph-v3 #kg-failures{display:flex;flex-wrap:wrap;gap:6px}#dpdpa-graph-v3 .kg-meta{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}#dpdpa-graph-v3 .kg-node-failure{color:var(--red);margin:5px 0}#dpdpa-graph-v3 .kg-related{margin:4px 0;overflow-wrap:anywhere}@media(max-width:780px){#dpdpa-graph-v3 .kg-header{padding-right:0;flex-direction:column}#dpdpa-graph-v3 .kg-stats{grid-template-columns:1fr}#dpdpa-graph-v3 .kg-canvas{height:540px}}
</style>
<script>
(()=>{const root=document.getElementById("dpdpa-graph-v3"),DATA=${serialized},byId=new Map(DATA.nodes.map(node=>[node.id,node])),svg=root.querySelector("#kg-svg"),search=root.querySelector("#kg-search"),hierarchy=root.querySelector("#kg-hierarchy"),references=root.querySelector("#kg-references"),unresolved=root.querySelector("#kg-unresolved"),tooltip=root.querySelector("#kg-tooltip"),visible=root.querySelector("#kg-visible");let scope="evaluation",viewBox=[0,0,${WIDTH},${HEIGHT}],dragStart=null;const activeGroup=()=>root.querySelector('.kg-scope[data-scope="'+scope+'"]'),shortText=(value,limit)=>value.length>limit?value.slice(0,limit-3)+"...":value;function setViewBox(){svg.setAttribute("viewBox",viewBox.join(" "))}function fit(){viewBox=[0,0,${WIDTH},${HEIGHT}];setViewBox()}function applyFilters(){const group=activeGroup(),query=search.value.trim().toLowerCase(),shown=new Set();group.querySelectorAll(".kg-node-group").forEach(element=>{const node=byId.get(element.dataset.nodeId),hiddenVirtual=node.virtual&&!unresolved.checked;element.hidden=hiddenVirtual;const matches=!query||element.dataset.search.includes(query);element.classList.toggle("kg-dim",!matches);if(!hiddenVirtual)shown.add(node.id)});group.querySelectorAll(".kg-edge").forEach(edge=>{const typeAllowed=edge.dataset.linkType==="hierarchy"?hierarchy.checked:references.checked,unresolvedAllowed=unresolved.checked||!["unresolved","ambiguous","external_unavailable"].includes(edge.dataset.linkStatus);edge.hidden=!typeAllowed||!unresolvedAllowed||!shown.has(edge.dataset.source)||!shown.has(edge.dataset.target);if(query){const source=group.querySelector('.kg-node-group[data-node-id="'+CSS.escape(edge.dataset.source)+'"]'),target=group.querySelector('.kg-node-group[data-node-id="'+CSS.escape(edge.dataset.target)+'"]');edge.classList.toggle("kg-dim",source?.classList.contains("kg-dim")&&target?.classList.contains("kg-dim"))}else edge.classList.remove("kg-dim")});const count=[...group.querySelectorAll(".kg-node-group")].filter(element=>!element.hidden).length;visible.textContent=count+" nodes shown | search highlights matches without hiding the graph"}function chooseScope(next){scope=next;root.querySelectorAll(".kg-scope").forEach(group=>{group.hidden=group.dataset.scope!==scope});root.querySelectorAll("[data-scope-button]").forEach(button=>{const active=button.dataset.scopeButton===scope;button.classList.toggle("active",active);button.setAttribute("aria-selected",String(active))});search.value="";fit();applyFilters()}function showNode(id){const node=byId.get(id);root.querySelector("#kg-summary").hidden=true;root.querySelector("#kg-selection").hidden=false;root.querySelector("#kg-node-label").textContent=node.label;const meta=root.querySelector("#kg-node-meta");meta.innerHTML="";[node.kind.replaceAll("_"," "),node.status,node.pages.length?"page "+node.pages.join(", "):"no source page",node.boundary].filter(Boolean).forEach(value=>{const badge=document.createElement("span");badge.className="viz-badge";badge.textContent=value;meta.append(badge)});root.querySelector("#kg-node-text").textContent=node.text||"No extracted text.";const failureBox=root.querySelector("#kg-node-failures");failureBox.innerHTML="";node.failures.forEach(failure=>{const row=document.createElement("div");row.className="kg-node-failure text-small";row.textContent="Failed evaluation: "+failure;failureBox.append(row)});const related=DATA.links.filter(link=>link.source===id||link.target===id).slice(0,30),linksBox=root.querySelector("#kg-node-links");linksBox.innerHTML="<strong>"+related.length+" relationships</strong>";related.forEach(link=>{const other=byId.get(link.source===id?link.target:link.source),row=document.createElement("div");row.className="kg-related";row.textContent=(link.type==="hierarchy"?"Hierarchy":link.status)+": "+shortText(other?.label||"Unknown",90);linksBox.append(row)});root.querySelectorAll(".kg-node").forEach(circle=>circle.classList.remove("kg-node-selected"));root.querySelectorAll('.kg-node-group[data-node-id="'+CSS.escape(id)+'"] .kg-node').forEach(circle=>circle.classList.add("kg-node-selected"))}root.querySelectorAll("[data-scope-button]").forEach(button=>button.addEventListener("click",()=>chooseScope(button.dataset.scopeButton)));[search,hierarchy,references,unresolved].forEach(control=>control.addEventListener(control===search?"input":"change",applyFilters));root.querySelector("#kg-fit").addEventListener("click",fit);root.querySelector("#kg-back").addEventListener("click",()=>{root.querySelector("#kg-summary").hidden=false;root.querySelector("#kg-selection").hidden=true;root.querySelectorAll(".kg-node").forEach(circle=>circle.classList.remove("kg-node-selected"))});root.querySelectorAll(".kg-node-group").forEach(element=>{element.addEventListener("click",event=>{event.stopPropagation();showNode(element.dataset.nodeId)});element.addEventListener("pointerenter",()=>{const node=byId.get(element.dataset.nodeId);tooltip.hidden=false;tooltip.innerHTML="<strong>"+shortText(node.label,100)+"</strong><span>"+node.kind.replaceAll("_"," ")+(node.pages.length?" | page "+node.pages.join(", "):" | "+node.status)+"</span>"});element.addEventListener("pointermove",event=>{const box=root.querySelector(".kg-canvas").getBoundingClientRect();tooltip.style.left=Math.max(8,Math.min(box.width-320,event.clientX-box.left+14))+"px";tooltip.style.top=Math.max(8,Math.min(box.height-70,event.clientY-box.top+14))+"px"});element.addEventListener("pointerleave",()=>{tooltip.hidden=true})});svg.addEventListener("wheel",event=>{event.preventDefault();const factor=event.deltaY>0?1.12:.89,rect=svg.getBoundingClientRect(),px=viewBox[0]+(event.clientX-rect.left)/rect.width*viewBox[2],py=viewBox[1]+(event.clientY-rect.top)/rect.height*viewBox[3],nextW=Math.max(260,Math.min(2600,viewBox[2]*factor)),nextH=nextW*(${HEIGHT}/${WIDTH});viewBox=[px-(px-viewBox[0])*nextW/viewBox[2],py-(py-viewBox[1])*nextH/viewBox[3],nextW,nextH];setViewBox()},{passive:false});svg.addEventListener("pointerdown",event=>{if(event.target.closest(".kg-node-group"))return;dragStart={x:event.clientX,y:event.clientY,box:[...viewBox]};svg.setPointerCapture(event.pointerId)});svg.addEventListener("pointermove",event=>{if(!dragStart)return;const rect=svg.getBoundingClientRect();viewBox[0]=dragStart.box[0]-(event.clientX-dragStart.x)/rect.width*dragStart.box[2];viewBox[1]=dragStart.box[1]-(event.clientY-dragStart.y)/rect.height*dragStart.box[3];setViewBox()});svg.addEventListener("pointerup",()=>{dragStart=null});const failureList=root.querySelector("#kg-failures");DATA.summary.failedFields.forEach(field=>{const button=document.createElement("button");button.type="button";button.className="btn btn-ghost";button.textContent=field;button.addEventListener("click",()=>{chooseScope("evaluation");search.value=field.replace(/^.*Section /,"Section ").replace(/ ->.*$/,"");applyFilters()});failureList.append(button)});chooseScope("evaluation");if(window.lucide)lucide.createIcons({attrs:{width:16,height:16}})})();
</script>`;

const scripts = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)];
if (!scripts.length) throw new Error("Visualization script missing");
new Function(scripts.at(-1)![1]);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, html, "utf8");
process.stdout.write(`${outputPath}\n${Buffer.byteLength(html)} bytes\n`);
