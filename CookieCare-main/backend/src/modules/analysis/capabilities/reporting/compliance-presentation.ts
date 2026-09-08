import type { AnalysisState } from "../../models/analysis-state.js";
import type {
  CompliancePresentationMode, CompliancePresentationPlan, ComplianceReportDraft,
  ComplianceReportRow, ComplianceReportSnapshot, ComplianceTableColumn,
} from "../../models/compliance-report.js";

// All tables, status labels, recommendations, pointers and quotations are code-owned.
// The planner controls layout only; the writer controls answer/assessment/explanation only.
const LABELS: Record<ComplianceReportRow["status"], string> = {
  present: "Present", partial: "Partial", gap: "Gap", cannot_determine: "Cannot determine",
  not_applicable: "Not applicable", conflicting: "Conflicting", judgment_required: "Judgment required",
  verification_incomplete: "Verification incomplete",
};
const STATUS_MARK: Record<ComplianceReportRow["status"], string> = {
  present: "✅", partial: "⚠️", gap: "⚠️", cannot_determine: "❓",
  not_applicable: "○", conflicting: "⚡", judgment_required: "⚖️",
  verification_incomplete: "🔍",
};
const COLUMNS: ComplianceTableColumn[] = ["Requirement", "Status", "Contract provision", "Assessment"];
const MODES: CompliancePresentationMode[] = ["layered", "short", "detailed", "narrative", "table_only"];
const DETAIL_CAPS: Record<CompliancePresentationMode, number> = { layered: 80, short: 20, detailed: 120, narrative: 80, table_only: 40 };
const KINDS = ["answer", "overview", "details", "limitations", "sources"] as const;
const UNCERTAIN = new Set(["cannot_determine", "conflicting", "judgment_required", "verification_incomplete"]);
type Section = CompliancePresentationPlan["sections"][number];
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const words = (s: string) => s.trim().split(/\s+/u).filter(Boolean).length;
const needsLimitations = (s: ComplianceReportSnapshot) =>
  s.outstandingChecks.length > 0 || s.limitations.length > 0 || s.rows.some(r => UNCERTAIN.has(r.status));
const requiredDetails = (s: ComplianceReportSnapshot, mode: CompliancePresentationMode) =>
  mode === "short" || mode === "table_only" ? [] : s.rows
    .filter(r => mode !== "layered" || (r.status !== "present" && r.status !== "not_applicable"))
    .map(r => r.lockedAssessmentId);

export function resolveCompliancePresentationMode(state: AnalysisState): CompliancePresentationMode {
  const instruction = state.request.instruction.toLowerCase();
  if (/\b(?:table[ _-]only|only (?:a )?table|tabular only|just (?:a |the )?table)\b/.test(instruction)) return "table_only";
  if (/\b(?:no tables?|without (?:a )?tables?|narrative(?: only| format)?|prose only)\b/.test(instruction)) return "narrative";
  if (/\b(?:short|brief|concise|summary only)\b/.test(instruction)) return "short";
  if (/\b(?:detailed|in[ -]depth|comprehensive)\b/.test(instruction)) return "detailed";
  // The API supplies narrative as a default, so answerStyle does not establish user intent.
  const depth = state.plan?.reportSpec?.depth ?? state.intent?.depth;
  return depth === "deep" ? "detailed" : depth === "narrow" ? "short" : "layered";
}

export function defaultCompliancePresentationPlan(
  snapshot: ComplianceReportSnapshot, mode: CompliancePresentationMode,
): CompliancePresentationPlan {
  const sections: Section[] = [];
  const add = (kind: Section["kind"], heading: string, findingIds: string[] = []) => sections.push({
    kind, heading, findingIds, columns: kind === "overview" ? [...COLUMNS] : [], detailWords: DETAIL_CAPS[mode],
  });
  if (mode !== "table_only") add("answer", "Answer");
  if (mode !== "narrative") add("overview", "Compliance overview", snapshot.rows.map(r => r.lockedAssessmentId));
  const details = requiredDetails(snapshot, mode);
  if (details.length) add("details", mode === "layered" ? "Findings requiring attention" : "Requirement details", details);
  if (mode === "table_only" || needsLimitations(snapshot)) add("limitations", mode === "table_only" ? "Scope and limitations" : "Limitations and outstanding checks");
  return { version: 1, mode, rationale: "Complete reviewed coverage with code-owned tables, statuses, actions, pointers and quotations.", sections };
}

function exactKeys(value: Record<string, unknown>, keys: string[], path: string, errors: string[]) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push(`${path}: unexpected field ${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) errors.push(`${path}: missing field ${key}`);
}

function technicalIds(s: ComplianceReportSnapshot): string[] {
  return [...new Set([
    ...s.documents.flatMap(d => [d.documentId, d.contentHash]),
    ...s.rows.flatMap(r => [r.rowId, r.requirementId, r.canonicalKey, r.lockedAssessmentId,
      r.ruleVersion, r.documentHash, ...r.supportedElementIds, ...r.missingElementIds,
      ...r.evidence.flatMap(e => [e.spanId, e.documentId])]),
    ...s.outstandingChecks.map(c => c.requirementId), ...s.limitations.flatMap(l => [l.id, ...l.requirementIds]),
  ].filter(Boolean))];
}
const regexEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function idPattern(id: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${regexEscape(id)}(?![\\p{L}\\p{N}_])`, "gu");
}
function leaksId(text: string, s: ComplianceReportSnapshot) {
  return technicalIds(s).some(id => idPattern(id).test(text)) ||
    /\b(?:lockedAssessmentId|findingId|spanId|canonicalKey|requirementId|documentHash)\b|\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/i.test(text);
}

export function validateCompliancePresentationPlan(
  raw: unknown, snapshot: ComplianceReportSnapshot, mode: CompliancePresentationMode,
): string[] {
  const errors: string[] = [];
  if (!isObject(raw)) return ["plan must be an object"];
  exactKeys(raw, ["version", "mode", "rationale", "sections"], "plan", errors);
  if (raw.version !== 1) errors.push("plan.version must be 1");
  if (!MODES.includes(mode) || raw.mode !== mode) errors.push("plan.mode must match requested mode");
  if (typeof raw.rationale !== "string" || !raw.rationale.trim() || raw.rationale.length > 1000) errors.push("plan.rationale must be bounded text");
  if (!Array.isArray(raw.sections)) return [...errors, "plan.sections must be an array"];
  const known = new Set(snapshot.rows.map(r => r.lockedAssessmentId));
  const byKind = new Map<string, Set<string>>();
  const counts = new Map<string, number>();
  Array.from(raw.sections).forEach((section, i) => {
    const path = `sections[${i}]`;
    if (!isObject(section)) { errors.push(`${path} must be an object`); return; }
    exactKeys(section, ["kind", "heading", "findingIds", "columns", "detailWords"], path, errors);
    const kind = typeof section.kind === "string" ? section.kind : "";
    if (!(KINDS as readonly string[]).includes(kind)) errors.push(`${path}: unknown section kind`);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (typeof section.heading !== "string" || !/^[\p{L}\p{N}][\p{L}\p{N} ,:()/'’–—-]{0,99}$/u.test(section.heading) ||
      /\b(?:critical|severe|severity|high|medium|low|urgent|risk|compliant|noncompliant|lawful|unlawful|legal|illegal|valid|invalid|enforceable|unenforceable|breach|breaches|violates|violation|satisfies|satisfied|meets|met|guarantees|safe|unsafe|fully|always|never|must|shall)\b/i.test(section.heading) ||
      leaksId(section.heading, snapshot)) errors.push(`${path}: heading must be plain and must not invent severity or a verdict`);
    if (!Number.isInteger(section.detailWords) || Number(section.detailWords) < 20 || Number(section.detailWords) > DETAIL_CAPS[mode])
      errors.push(`${path}: detailWords must be an integer from 20 to ${DETAIL_CAPS[mode]}`);
    if (!Array.isArray(section.columns) || Array.from(section.columns).some(c => typeof c !== "string")) errors.push(`${path}: columns must be a string array`);
    else if (kind === "overview") {
      const columns = section.columns;
      if (columns.length !== 4 || new Set(columns).size !== 4 || COLUMNS.some(c => !columns.includes(c)))
        errors.push(`${path}: overview requires exactly Requirement, Status, Contract provision, Assessment`);
    } else if (section.columns.length) errors.push(`${path}: columns are only permitted on overview`);
    if (!Array.isArray(section.findingIds)) { errors.push(`${path}: findingIds must be an array`); return; }
    const seen = byKind.get(kind) ?? new Set<string>();
    byKind.set(kind, seen);
    for (const id of section.findingIds) {
      if (typeof id !== "string" || !known.has(id)) { errors.push(`${path}: unknown finding ID`); continue; }
      if (seen.has(id)) errors.push(`${path}: duplicate finding ID within ${kind}`);
      seen.add(id);
    }
    if ((kind === "answer" || kind === "limitations") && section.findingIds.length) errors.push(`${path}: ${kind} must not select findings`);
  });
  for (const kind of KINDS) if (kind !== "details" && (counts.get(kind) ?? 0) > 1) errors.push(`Only one ${kind} section is permitted`);
  if (mode === "table_only") {
    if ((counts.get("answer") ?? 0) || (counts.get("details") ?? 0)) errors.push("table_only permits only overview, limitations and sources");
  } else if (counts.get("answer") !== 1 || !isObject(raw.sections[0]) || raw.sections[0].kind !== "answer") errors.push("Exactly one answer must be first");
  if (mode === "narrative") {
    if (counts.get("overview")) errors.push("narrative must not contain an overview table");
  } else if (counts.get("overview") !== 1) errors.push("Exactly one overview is required");
  if (mode === "short" && counts.get("details")) errors.push("short must omit details");
  const cover = (kind: string, ids: string[]) => {
    if (ids.some(id => !byKind.get(kind)?.has(id))) errors.push(`${kind}: missing required finding coverage`);
  };
  if (mode !== "narrative") cover("overview", [...known]);
  cover("details", requiredDetails(snapshot, mode));
  if ((mode === "table_only" || needsLimitations(snapshot)) && counts.get("limitations") !== 1) errors.push("A limitations section is required to retain scope and qualifications");
  return errors;
}

const FALLBACK: Record<ComplianceReportRow["status"], string> = {
  present: "The reviewed material supports this requirement.",
  partial: "The reviewed material supports only part of this requirement.",
  gap: "The required obligation was not found in the reviewed scope.",
  cannot_determine: "The available material does not allow a determination for this requirement.",
  not_applicable: "This requirement does not apply to the reviewed arrangement.",
  conflicting: "The reviewed provisions conflict and require reconciliation.",
  judgment_required: "This requirement needs contextual legal judgment before a conclusion can be reached.",
  verification_incomplete: "Verification did not complete for this requirement and a further check is needed.",
};
const CANNED = new Set([...Object.values(FALLBACK), "obligation satisfied", "partial", "gap",
  "The obligation is satisfied.", "The requirement is present."].map(text => text.replace(/[.!]+$/u, "").toLowerCase()));
function isCanned(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim().replace(/[.!]+$/u, "").toLowerCase();
  return !normalized || CANNED.has(normalized);
}

function verifiedFields(row: ComplianceReportRow): string[] {
  return [row.title, row.legalCitation, row.whatTheDocumentProvides, row.whatIsMissingOrUnclear,
    row.whyItMatters, row.conclusion, row.recommendedAction, ...row.evidence.map(e => e.quote)];
}
function detailLimit(plan: CompliancePresentationPlan, id: string) {
  return Math.min(plan.sections.find(s => s.kind === "details" && s.findingIds.includes(id))?.detailWords ?? DETAIL_CAPS[plan.mode], DETAIL_CAPS[plan.mode]);
}
const numerals = (s: string) => s.match(/\d+(?:[.,]\d+)*/g) ?? [];
function descriptiveAssessment(text: string): boolean {
  return words(text) >= 4 && !/^(?:(?:the|this|reviewed)\s+)?(?:requirement|obligation|assessment|status)(?:\s+(?:is|was|remains))?\s+(?:present|partial|gap|cannot determine|not applicable|conflicting|judgment required|verification incomplete|satisfied)[.!]?$/i.test(text.trim());
}
// Plain text only. References, pointers, quotations and source formatting belong to code.
const FORBIDDEN_PROSE = /[\r\n<>|`#*_\[\]\\~"“”«»]|(?:^|\s)[+-]\s|^\s*(?:\d+[.)]\s|[-=]{3,}\s*$)|\b(?:https?:|www\.|E\d+\b)|\b(?:article|section|clause|paragraph|schedule|annex|page)\s+(?:\d|[IVX]+\b)|\b(?:citation|source|reference)\s*[:#\[]|\([^)]*\b\d{4}\b[^)]*\)/i;
function proseErrors(text: unknown, path: string, limit: number, verified: string[], s: ComplianceReportSnapshot,
  row?: ComplianceReportRow): string[] {
  if (typeof text !== "string" || !text.trim()) return [`${path}: nonempty prose is required`];
  const errors: string[] = [];
  if (words(text) > limit || text.length > limit * 30) errors.push(`${path}: prose exceeds length limit`);
  const forbiddenToken = /\b(?:article|section|clause|paragraph|schedule|annex|page)\s+(?:\d+(?:[.,]\d+)*(?:\([a-z0-9]+\))*|[IVX]+\b)/i.exec(text)?.[0]
    ?? FORBIDDEN_PROSE.exec(text)?.[0]
    ?? /\b(?:arts?\.?|chapter|appendix)\s+(?:\d+(?:[.,]\d+)*|[IVX]+\b)/i.exec(text)?.[0]
    ?? /(?:^|\s)(?:'[^']+'|‘[^’]+’)(?:\s|[.,;!?]|$)/.exec(text)?.[0]
    ?? s.rows.flatMap(r => r.evidence).find(e => e.pointer.trim().length >= 4 && text.includes(e.pointer))?.pointer;
  if (forbiddenToken !== undefined)
    errors.push(`${path}: references, quotations and Markdown are forbidden; remove token ${JSON.stringify(forbiddenToken)}`);
  if (leaksId(text, s)) errors.push(`${path}: internal ID leaked`);
  const allowedNumbers = new Set(verified.flatMap(numerals));
  const inventedNumeral = numerals(text).find(n => !allowedNumbers.has(n));
  if (inventedNumeral !== undefined) errors.push(`${path}: invented numeral ${JSON.stringify(inventedNumeral)}`);
  // Match longer labels first: "not present" must not be accepted as "present".
  const statusTerms = /\b(?:verification incomplete|cannot determine|not applicable|judgment required|not present|fully compliant|non[ -]?compliant|compliant|partially met|partially compliant|present|partial|gap|conflicting)\b/gi;
  for (const match of text.matchAll(statusTerms)) {
    const term = match[0].toLowerCase();
    const own = row && (term === LABELS[row.status].toLowerCase() ||
      (row.status === "gap" && term === "not present") || (row.status === "partial" && term === "partially met"));
    if (!own) errors.push(`${path}: immutable status term ${term}`);
    else if (/\b(?:not|never|no|no longer|without|isn.t|aren.t)\s+(?:(?:a|an|the)\s+)?$/i.test(text.slice(0, match.index)) ||
      /^(?:[ -]free\b|\s+(?:does not|doesn.t|is not|isn.t)\s+(?:exist|apply|remain))/i.test(text.slice(match.index! + match[0].length)))
      errors.push(`${path}: negated immutable status`);
  }
  // Even unmarked verbatim source quotations must be left to the source renderer.
  const quotedSource = s.rows.flatMap(r => r.evidence).find(e => words(e.quote) >= 5 && text.toLowerCase().includes(e.quote.toLowerCase().trim()));
  if (quotedSource) errors.push(`${path}: source quotation is code-owned; remove quoted text beginning ${JSON.stringify(quotedSource.quote.trim().slice(0, 80))}`);
  return errors;
}

/** Strip only verified element labels at the start of an explanation/action item. */
function stripElementLabels(value: string, row: ComplianceReportRow): string {
  const ids = [...new Set([...row.supportedElementIds, ...row.missingElementIds])]
    .filter(id => /^[A-Za-z][A-Za-z0-9_.-]*$/.test(id) && !/^(?:art(?:icle)?|clause|section|paragraph|schedule|annex|appendix|page)(?:[._-]?\d.*)?$/i.test(id))
    .sort((a, b) => b.length - a.length).map(regexEscape);
  if (!ids.length) return value;
  const label = `(?:${ids.join("|")})`;
  return value.replace(new RegExp(`(^|[\\r\\n]+|[.;]\\s+)\\s*${label}(?:\\s*[/,]\\s*${label})*\\s*:\\s*`, "g"), "$1");
}

export function deterministicComplianceDraft(snapshot: ComplianceReportSnapshot, plan: CompliancePresentationPlan): ComplianceReportDraft {
  // These transformations apply only to verified explanation fields, never source quotations.
  const readable = (value: string, row: ComplianceReportRow) => humanText(stripElementLabels(value, row), snapshot)
    .replace(/\bscope[ -]compatible evidence\b/gi, "evidence from the reviewed scope")
    .replace(/\bscope[ -]compatible\b/gi, "within the reviewed scope")
    .replace(/\b(?:accepted )?locked assessments?\b/gi, "reviewed assessment")
    .replace(/\s+/g, " ").trim();
  return {
    answer: plan.mode === "table_only" ? "" : conclusion(snapshot),
    rows: snapshot.rows.map(row => {
      const candidatesFor = (value: string, limit: number) => {
        const text = readable(value, row);
        const errors = proseErrors(text, "fallback", limit, verifiedFields(row), snapshot, row);
        // Do not split a rejected citation into a fragment that merely looks like ordinary prose.
        if (errors.some(error => error.includes("references, quotations") || error.includes("source quotation"))) return [];
        return text.split(/(?<=[.!?])\s+(?=[\p{Lu}\d])/u);
      };
      const limit = detailLimit(plan, row.lockedAssessmentId);
      const parts: string[] = [];
      for (const value of [row.whatTheDocumentProvides, row.whatIsMissingOrUnclear, row.whyItMatters]) {
        const candidates = candidatesFor(value, limit);
        for (const candidate of candidates) {
          if (!candidate || parts.some(part => part.includes(candidate))) continue;
          const joined = [...parts, candidate].join(" ");
          if (!proseErrors(joined, "fallback", limit, verifiedFields(row), snapshot, row).length) parts.push(candidate);
        }
      }
      const assessmentCandidates = [row.whatTheDocumentProvides,
        ...(row.status !== "present" && row.status !== "not_applicable" ? [row.whatIsMissingOrUnclear] : []),
        ...(/\.{3}|\u2026|mandatory elements?|completeness gates|evidence bundle|scope[ -]compatible/i.test(row.conclusion) ? [] : [row.conclusion])]
        .flatMap(value => candidatesFor(value, 40));
      return { findingId: row.lockedAssessmentId,
        assessment: assessmentCandidates.find(text => descriptiveAssessment(text) && !proseErrors(text, "fallback", 40, verifiedFields(row), snapshot, row).length) || FALLBACK[row.status],
        explanation: parts.join(" ") || FALLBACK[row.status],
      };
    }),
  };
}

export function validateComplianceDraft(raw: unknown, snapshot: ComplianceReportSnapshot, plan: CompliancePresentationPlan): string[] {
  if (!isObject(raw)) return ["draft must be an object"];
  const errors: string[] = [];
  exactKeys(raw, ["answer", "rows"], "draft", errors);
  if (plan.mode === "table_only") {
    if (raw.answer !== "") errors.push("table_only answer must be empty");
  } else errors.push(...proseErrors(raw.answer, "answer", 120, snapshot.rows.flatMap(verifiedFields), snapshot));
  if (!Array.isArray(raw.rows)) return [...errors, "draft.rows must be an array"];
  const known = new Map(snapshot.rows.map(r => [r.lockedAssessmentId, r]));
  const seen = new Set<string>();
  Array.from(raw.rows).forEach((value, i) => {
    const path = `rows[${i}]`;
    if (!isObject(value)) { errors.push(`${path}: must be an object`); return; }
    exactKeys(value, ["findingId", "assessment", "explanation"], path, errors);
    const row = typeof value.findingId === "string" ? known.get(value.findingId) : undefined;
    if (!row) { errors.push(`${path}: unknown finding ID`); return; }
    if (seen.has(row.lockedAssessmentId)) errors.push(`${path}: duplicate finding ID`);
    seen.add(row.lockedAssessmentId);
    if (typeof value.assessment === "string" && !descriptiveAssessment(value.assessment))
      errors.push(`${path}.assessment: use at least 4 words describing the contract position, not a status-only label`);
    errors.push(...proseErrors(value.assessment, `${path}.assessment`, 60, verifiedFields(row), snapshot, row));
    errors.push(...proseErrors(value.explanation, `${path}.explanation`, detailLimit(plan, row.lockedAssessmentId), verifiedFields(row), snapshot, row));
  });
  if (snapshot.rows.some(r => !seen.has(r.lockedAssessmentId))) errors.push("draft.rows: missing required finding coverage");
  return errors;
}

/** Encode source punctuation as entities; only this module emits Markdown structure. */
function escapeSource(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/[<>"'\\`*_{}\[\]()#+\-.!|~:]/g, c => `&#${c.charCodeAt(0)};`);
}
function humanText(text: string, s: ComplianceReportSnapshot): string {
  const humanize = (id: string) => id.replace(/[_./:-]+/g, " ").replace(/\s+/g, " ").trim();
  const names = new Map<string, string>();
  for (const d of s.documents) { names.set(d.documentId, d.title || "reviewed document"); names.set(d.contentHash, "reviewed document"); }
  for (const r of s.rows) {
    for (const id of [r.rowId, r.requirementId, r.canonicalKey, r.lockedAssessmentId]) names.set(id, r.title || "reviewed requirement");
    for (const id of [...r.supportedElementIds, ...r.missingElementIds]) names.set(id, humanize(id));
    names.set(r.ruleVersion, "review criterion"); names.set(r.documentHash, "reviewed document");
    for (const e of r.evidence) { names.set(e.spanId, "cited provision"); names.set(e.documentId, e.documentTitle || "reviewed document"); }
  }
  for (const c of s.outstandingChecks) names.set(c.requirementId, c.title || "outstanding requirement");
  for (const l of s.limitations) { names.set(l.id, "review limitation"); for (const id of l.requirementIds) if (!names.has(id)) names.set(id, "reviewed requirement"); }
  let result = text;
  for (const id of technicalIds(s).sort((a, b) => b.length - a.length)) result = result.replace(idPattern(id), () => names.get(id) || "reviewed material");
  return result;
}
function publicText(text: string, s: ComplianceReportSnapshot): string {
  // These fields appear in inline/table contexts. Ordinary punctuation cannot create markup.
  return humanText(text, s).replace(/\r\n?|\n/g, "; ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/&/g, "&amp;").replace(/[<>\\`*_\[\]#|~]/g, c => `&#${c.charCodeAt(0)};`)
    .replace(/^(\s*\d+)([.)])(?=\s)/, (_, digits: string, punctuation: string) => `${digits}&#${punctuation.charCodeAt(0)};`)
    .replace(/^\s*([-+])(?=\s|[-+]*$)/, (_, punctuation: string) => `&#${punctuation.charCodeAt(0)};`);
}
/** Table excerpts stay literal. Do not rewrite quotation text through identifier substitution. */
function escapeInline(text: string): string {
  return text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/&/g, "&amp;").replace(/[<>\\`*_\[\]#|~]/g, c => `&#${c.charCodeAt(0)};`)
    .replace(/^(\s*\d+)([.)])(?=\s)/, (_, digits: string, punctuation: string) => `${digits}&#${punctuation.charCodeAt(0)};`);
}
const TABLE_EXCERPT_CHARS = 220;
function tableExcerpt(quote: string): string {
  const flat = quote.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (flat.length <= TABLE_EXCERPT_CHARS) return escapeInline(flat);
  const cut = flat.slice(0, TABLE_EXCERPT_CHARS).replace(/\s+\S*$/, "").trimEnd();
  return `${escapeInline(cut || flat.slice(0, TABLE_EXCERPT_CHARS).trimEnd())}…`;
}
function statusMark(status: ComplianceReportRow["status"]): string {
  return `${STATUS_MARK[status]} **${LABELS[status]}**`;
}
function withoutDocumentTitle(text: string): string {
  return text
    .replace(/(?:^|[\s;])[^\n;|]*?\.(?:pdf|docx?|txt|rtf)\s*[—–-]\s*/gi, (match) => match.startsWith(" ") || match.startsWith(";") ? match[0] : "")
    .replace(/\bReviewed documents?:\s*[^\n.;]*?(?:\.(?:pdf|docx?|txt|rtf))?\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.;])/g, "$1")
    .trim();
}
function conclusion(s: ComplianceReportSnapshot): string {
  const applicable = s.rows.filter(r => r.status !== "not_applicable");
  return !s.rows.length ? "No completed requirement assessments are available." : !applicable.length
    ? "None of the reviewed requirements applies to this arrangement; this does not establish compliance."
    : s.rows.some(r => r.status === "gap" || r.status === "partial") ? "The reviewed requirements are not fully satisfied."
    : s.rows.some(r => UNCERTAIN.has(r.status)) ? "Compliance cannot be concluded for all reviewed requirements."
    : "All applicable reviewed requirements are supported by the reviewed material.";
}
function shortName(title: string): string {
  const name = title.replace(/\s+/g, " ").trim().replace(/\s*\([^)]*\)\s*$/u, "").trim();
  return name.length > 90 ? `${name.slice(0, 87).replace(/\s+\S*$/u, "").trim()}…` : name;
}
function joinNames(names: string[]): string {
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  const list = shown.length <= 1 ? shown[0] ?? ""
    : shown.length === 2 ? `${shown[0]} and ${shown[1]}`
    : `${shown.slice(0, -1).join(", ")}, and ${shown[shown.length - 1]}`;
  return rest > 0 ? `${list}, and ${rest} more` : list;
}
function answerOverview(s: ComplianceReportSnapshot): string {
  if (!s.rows.length) return "No completed requirement assessments are available.";
  const named = (status: ComplianceReportRow["status"]) => joinNames(
    s.rows.filter(r => r.status === status).map(r => shortName(r.title)).filter(Boolean));
  const count = (status: ComplianceReportRow["status"]) => s.rows.filter(r => r.status === status).length;
  const present = named("present");
  const partial = named("partial");
  const gap = named("gap");
  const incomplete = named("verification_incomplete");
  const unclear = joinNames(["cannot_determine", "conflicting", "judgment_required"]
    .flatMap(status => s.rows.filter(r => r.status === status).map(r => shortName(r.title))).filter(Boolean));
  const bits = [`This review checked ${s.rows.length} requirement${s.rows.length === 1 ? "" : "s"}.`];
  if (present) bits.push(`${count("present")} ${count("present") === 1 ? "is" : "are"} present, including ${present}.`);
  if (partial) bits.push(`${count("partial")} ${count("partial") === 1 ? "is" : "are"} only partial, including ${partial}.`);
  if (gap) bits.push(`${count("gap")} ${count("gap") === 1 ? "was" : "were"} not found, including ${gap}.`);
  if (incomplete) bits.push(`${count("verification_incomplete")} could not be fully verified, including ${incomplete}.`);
  if (unclear) bits.push(`These still need a further look: ${unclear}.`);
  bits.push(conclusion(s));
  return bits.join(" ");
}

/** Full quotes bypass ID substitution. Entity-encoded indentation cannot become Markdown code. */
function quoteBlock(quote: string): string {
  return quote.split("\n").map(line => `> ${escapeSource(line).replace(/[ \t\r]/g, c => `&#${c.charCodeAt(0)};`)}`).join("\n");
}

export function renderComplianceMarkdown(snapshot: ComplianceReportSnapshot, plan: CompliancePresentationPlan, draft: ComplianceReportDraft): string {
  const planErrors = validateCompliancePresentationPlan(plan, snapshot, plan.mode);
  if (planErrors.length) throw new Error(`Invalid compliance presentation plan: ${planErrors.join("; ")}`);
  const draftErrors = validateComplianceDraft(draft, snapshot, plan);
  if (draftErrors.length) throw new Error(`Invalid compliance draft: ${draftErrors.join("; ")}`);
  const clean = (s: string) => publicText(s, snapshot);
  const rows = new Map(snapshot.rows.map(r => [r.lockedAssessmentId, r]));
  const prose = new Map(draft.rows.map(r => [r.findingId, r]));
  const allEvidence = snapshot.rows.flatMap(r => r.evidence);
  // Preserve canonical E references where supplied; otherwise allocate stable display-only references.
  const evidenceKey = (e: typeof allEvidence[number]) => JSON.stringify([e.documentId, e.pointer, e.quote, e.charRange]);
  const refs = new Map<string, string>();
  const reserved = new Set(allEvidence.map(e => e.citationId).filter(id => /^E[1-9]\d*$/.test(id)));
  const used = new Set<string>();
  for (const e of allEvidence) {
    const key = evidenceKey(e);
    if (refs.has(key)) continue;
    let ref = /^E[1-9]\d*$/.test(e.citationId) && !used.has(e.citationId) ? e.citationId : "";
    if (!ref) { let n = 1; while (used.has(`E${n}`) || reserved.has(`E${n}`)) n++; ref = `E${n}`; }
    refs.set(key, ref); used.add(ref);
  }
  const locator = (e: typeof allEvidence[number]) => {
    const heading = withoutDocumentTitle(clean(e.pointer || e.structuralPath || "Location unavailable"));
    return `**${heading || "Location unavailable"}** [${refs.get(evidenceKey(e))}]`;
  };
  const requirement = (r: ComplianceReportRow) => `**${clean(r.title)}**${r.legalCitation ? ` (${clean(r.legalCitation)})` : ""}`;
  const provisionItem = (e: typeof allEvidence[number]) => {
    const excerpt = tableExcerpt(e.quote);
    return excerpt ? `${locator(e)} — ${excerpt}` : locator(e);
  };
  const noProvision = (r: ComplianceReportRow) => r.status === "gap"
    ? "No matching provision found in reviewed scope" : "Evidence unavailable for this assessment";
  const provision = (r: ComplianceReportRow) => r.evidence.length
    ? [...new Set(r.evidence.map(provisionItem))].join(" · ")
    : noProvision(r);
  const evidence = (r: ComplianceReportRow) => r.evidence.length ? r.evidence.map((e, index) => {
    const end = [...e.quote.matchAll(/\S+/g)][59]?.index;
    const excerpt = end === undefined ? e.quote : e.quote.slice(0, end).trimEnd();
    return `**${index + 1}.** ${locator(e)}\n\n${quoteBlock(excerpt)}`;
  }).join("\n\n") : noProvision(r);
  const needsAction = (r: ComplianceReportRow) => r.status !== "present" && r.status !== "not_applicable" && !!r.recommendedAction.trim();
  const action = (r: ComplianceReportRow) => clean(stripElementLabels(r.recommendedAction, r));
  const shownAssessment = (r: ComplianceReportRow) => {
    const text = prose.get(r.lockedAssessmentId)!.assessment;
    return isCanned(text) ? "—" : clean(text);
  };
  const assessment = (r: ComplianceReportRow) => {
    const shown = shownAssessment(r);
    if (!((plan.mode === "short" || plan.mode === "table_only") && needsAction(r))) return shown;
    return shown === "—" ? `Recommended action: **${action(r)}**` : `${shown} Recommended action: **${action(r)}**`;
  };
  const shownExplanation = (r: ComplianceReportRow) => {
    const text = prose.get(r.lockedAssessmentId)!.explanation;
    return isCanned(text) ? "" : clean(text);
  };
  const table = (headers: string[], cells: string[][]) => [
    `| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...cells.map(c => `| ${c.join(" | ")} |`),
  ].join("\n");
  const blocks: string[] = [];
  for (const section of plan.sections) {
    const selected = section.findingIds.map(id => rows.get(id)!);
    let body = "";
    switch (section.kind) {
      case "answer": {
        const counts = Object.entries(LABELS).map(([status, label]) => ({ label, count: snapshot.rows.filter(r => r.status === status).length }))
          .filter(item => item.count).map(item => `${item.label}: ${item.count}`).join("; ");
        const writer = clean(draft.answer);
        const canned = writer === conclusion(snapshot) || isCanned(draft.answer);
        body = [answerOverview(snapshot), ...(!canned && writer ? [writer] : []),
          ...(needsLimitations(snapshot) ? ["This conclusion is qualified by the limitations and any outstanding checks below."] : []),
          ...(counts ? [counts] : []), "Conclusions are limited to this scope."].join("\n\n");
        break;
      }
      case "overview": body = table(section.columns, selected.map(r => {
        const cells: Record<ComplianceTableColumn, string> = {
          Requirement: requirement(r), Status: statusMark(r.status), "Contract provision": provision(r), Assessment: assessment(r),
        };
        return section.columns.map(c => cells[c]);
      })); break;
      case "details": body = selected.map(r => {
        const explanation = shownExplanation(r);
        return [
          `### ${requirement(r)}`,
          `**Status:** ${statusMark(r.status)}`,
          `**Contract provision**`,
          evidence(r),
          ...(explanation ? [`**Assessment:** ${explanation}`] : []),
          ...(needsAction(r) ? [`Recommended action: **${action(r)}**`] : []),
        ].join("\n\n");
      }).join("\n\n"); break;
      case "limitations": {
        const limitations = snapshot.limitations.map(l => ["Review limitation", clean(l.message)]);
        for (const r of snapshot.rows.filter(r => UNCERTAIN.has(r.status))) limitations.push([
          requirement(r), `${LABELS[r.status]}: ${clean(r.whatIsMissingOrUnclear || FALLBACK[r.status])}`,
        ]);
        const outstanding = snapshot.outstandingChecks.map(c => [clean(c.title || "Outstanding requirement"), clean(c.reason),
          c.kind === "rejected" ? "Assessment not accepted" : c.kind === "unmatched" ? "Not matched to a completed assessment" : "Check unfinished"]);
        body = plan.mode === "table_only" ? [
          table(["Limitation", "Explanation"], [["Reviewed scope", `${clean(snapshot.scope || "Available reviewed material")}; conclusions are limited to this scope.`], ...limitations]),
          ...(outstanding.length ? ["### Outstanding checks", table(["Outstanding check", "Reason", "Review state"], outstanding)] : []),
        ].join("\n\n") : [
          ...limitations.map(([title, text]) => `- ${title}: ${text}`),
          ...(outstanding.length ? ["\n### Outstanding checks\n", ...outstanding.map(([title, reason, state]) => `- ${title}: ${reason} (${state}).`)] : []),
        ].join("\n");
        break;
      }
      case "sources":
        // Clause text is already shown with each finding. Do not append a second Sources list.
        continue;
    }
    blocks.push(`## ${clean(section.heading)}\n\n${body}`);
  }
  return blocks.join("\n\n");
}
