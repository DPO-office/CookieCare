/** Re-present a saved, accepted compliance run without repeating investigation.
 * Example (from repo root): node --import tsx backend/scripts/preview-compliance-report.ts
 * --log logs/analysis/<run>.compliance.log --source-text <exact-extracted-text.txt>
 * --title "DPA" --instruction "Review compliance" --output <new-report.md> [--live]
 * Default is an offline deterministic preview. --live uses the existing approved
 * reporting provider for outline, prose and conformance only. No database writes.
 */
import "../src/config/index.js";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildComplianceSnapshot } from "../src/modules/analysis/capabilities/reporting/compliance-snapshot.js";
import { renderComplianceReport, createComplianceCompletion } from "../src/modules/analysis/capabilities/reporting/compliance-reporting.js";
import { buildStructuralNodes } from "../src/modules/analysis/segmentation/structural-nodes.js";
import { humanizeRequirementId } from "../src/modules/analysis/shared/group-assessments.js";
import type { AnalysisState } from "../src/modules/analysis/models/analysis-state.js";
import type { RenderedReport, RenderedRow } from "../src/modules/analysis/capabilities/act/phase7-render.js";

const argv = process.argv.slice(2);
function option(name: string, required = true): string {
  const i = argv.indexOf(name);
  const value = i >= 0 ? argv[i + 1] : undefined;
  if ((!value || value.startsWith("--")) && required) throw new Error(`Missing ${name}`);
  return value && !value.startsWith("--") ? value : "";
}
const output = path.resolve(option("--output"));
if (fs.existsSync(output) || fs.existsSync(`${output}.json`)) throw new Error("Choose a new output path; previews never overwrite files.");
const events = fs.readFileSync(option("--log"), "utf8").split(/\r?\n/).filter(line => line.startsWith("{")).map(line => JSON.parse(line));
const accepted = new Map(events.filter(e => e.event === "compliance.lock.accepted").map(e => [e.lockedAssessmentId, e]));
const rendered = events.filter(e => e.event === "compliance.render.row");
if (!rendered.length) throw new Error("This log has no saved rendered assessments.");
const docIds = new Set<string>(rendered.flatMap(e => e.evidence ?? []).map(e => e.documentId).filter(Boolean));
if (docIds.size !== 1) throw new Error("This preview accepts exactly one source document; use a saved state for multi-document runs.");
const documentId = [...docIds][0];
const fullText = fs.readFileSync(option("--source-text"), "utf8");
const sourceHash = createHash("sha1").update(documentId).update("\0").update(fullText).update("\0").digest("hex").slice(0, 16);
const sourceMismatch = rendered.some(e => e.documentHash !== sourceHash);
if (sourceMismatch && !argv.includes("--allow-source-mismatch"))
  throw new Error("Source does not match the accepted document hash. Supply the original extracted text, or use --allow-source-mismatch for explicitly labelled presentation QA only.");
const title = option("--title");
const instruction = option("--instruction");
const schemas = events.filter(e => e.event === "compliance.element.registry");
const rows: RenderedRow[] = rendered.map(e => {
  const lock = accepted.get(e.lockedAssessmentId);
  if (!lock || lock.requirementId !== e.requirementId || lock.status !== e.status || lock.documentHash !== e.documentHash)
    throw new Error("A rendered row did not match its accepted lock.");
  const schema = schemas.find(s => s.canonicalKey === e.canonicalKey);
  return { ...e, rowId: `R-${e.canonicalKey}`,
    title: schema?.reviewStatus !== "auto_derived" && schema?.title || humanizeRequirementId(e.requirementId),
    legalCitation: schema?.legalCitation && schema.legalCitation !== e.requirementId ? schema.legalCitation : "",
    evidence: e.evidence ?? [],
  };
});
const state = {
  request: { sessionId: "report-preview", instruction, documentIds: [documentId], documentTexts: { [documentId]: fullText } },
  workspace: { sessionId: "report-preview", documents: [{ docId: documentId, title, role: "target", fullText, segments: [], clauses: [] }] },
  intent: { operation: "compliance_check", standard: "none", requirements: [] }, findings: [], metadata: {},
} as unknown as AnalysisState;
const report: RenderedReport = { rows, supplementalRequests: [], bottomLine: [],
  reconciliation: { lockedAssessmentIds: rows.map(r => r.lockedAssessmentId), renderedAssessmentIds: rows.map(r => r.lockedAssessmentId), missing: [], duplicates: [] } };
const dependencies = events.filter(e => e.event === "compliance.bundle.created").flatMap(e =>
  (e.dependencies ?? []).filter(d => d.state !== "resolved_internal").map(d => ({ requirementId: e.requirementId,
    reference: d.reference, reason: "The referenced material could not be resolved in the saved run." })));
state.complianceReportSnapshot = buildComplianceSnapshot(state, report,
  new Map([[documentId, buildStructuralNodes({ documentId, fullText })]]), [], dependencies);
if (sourceMismatch) {
  state.complianceReportSnapshot.scope = `Presentation QA only; not a fresh or source-version-verified compliance assessment. ${state.complianceReportSnapshot.scope}`;
  state.complianceReportSnapshot.limitations.unshift({ id: "preview-source-version", requirementIds: rows.map(r => r.requirementId),
    message: "Presentation QA only: the supplied text does not match the saved assessment document hash. Statuses are replayed from historical locks and must not be treated as conclusions verified against this source version. A fresh compliance run is required before relying on them." });
}
const before = JSON.stringify(state.complianceReportSnapshot.rows.map(r => [r.lockedAssessmentId, r.status, r.documentHash]));
const live = argv.includes("--live");
const attempts: Array<{ stage: string; result: unknown }> = [];
const transport = createComplianceCompletion(state);
const result = await renderComplianceReport(state, live ? async (stage, payload) => {
  const result = await transport(stage, payload); attempts.push({ stage, result }); return result;
} : async () => { throw new Error("Offline preview"); });
if (JSON.stringify(result.complianceReportSnapshot!.rows.map(r => [r.lockedAssessmentId, r.status, r.documentHash])) !== before)
  throw new Error("Report generation changed a locked assessment.");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, result.renderedOutput!, { flag: "wx" });
fs.writeFileSync(`${output}.json`, JSON.stringify({ snapshot: result.complianceReportSnapshot,
  plan: result.compliancePresentationPlan, validation: result.complianceReportValidation, attempts }, null, 2), { flag: "wx" });
console.log(JSON.stringify({ output, live, rows: rows.length,
  evidence: result.complianceReportSnapshot!.rows.reduce((n, r) => n + r.evidence.length, 0),
  limitations: result.complianceReportSnapshot!.limitations.length,
  validation: result.complianceReportValidation }, null, 2));
