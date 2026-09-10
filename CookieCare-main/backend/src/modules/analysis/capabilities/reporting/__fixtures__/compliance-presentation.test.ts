import assert from "node:assert/strict";
import { describe, it } from "node:test";
import MarkdownIt from "markdown-it";
import type { AnalysisState } from "../../../models/analysis-state.js";
import type { CompliancePresentationMode, CompliancePresentationPlan, ComplianceReportRow, ComplianceReportSnapshot } from "../../../models/compliance-report.js";
import {
  defaultCompliancePresentationPlan, deterministicComplianceDraft, renderComplianceMarkdown,
  resolveCompliancePresentationMode, validateComplianceDraft, validateCompliancePresentationPlan,
} from "../compliance-presentation.js";

const statuses = ["present", "partial", "gap", "cannot_determine", "not_applicable", "conflicting", "judgment_required", "verification_incomplete"] as const;
const labels = ["Present", "Partial", "Gap", "Cannot determine", "Not applicable", "Conflicting", "Judgment required", "Verification incomplete"];
const modes: CompliancePresentationMode[] = ["layered", "short", "detailed", "narrative", "table_only"];
function fixture(selected: readonly ComplianceReportRow["status"][] = statuses): ComplianceReportSnapshot {
  return {
    version: 1, instruction: "Review the agreement", scope: "The supplied agreement and reviewed requirements",
    documents: [{ documentId: "doc_internal", title: "Agreement", contentHash: "hash_internal" }],
    rows: selected.map((status, i) => ({
      rowId: `R-row_${i}`, requirementId: `req_internal_${i}`, canonicalKey: `canonical_internal_${i}`,
      lockedAssessmentId: `lock_internal_${i}`, legalCitation: "GDPR Article 28", title: `Requirement ${i + 1}`,
      status, statusLabel: "Present", recommendedAction: "Obtain the verified missing material.",
      supportedElementIds: [`element_internal_${i}`], missingElementIds: [],
      evidence: [{ citationId: `E${i + 1}`, documentId: "doc_internal", documentTitle: "Agreement",
        pointer: `Clause ${i + 1}, paragraph 2`, spanId: `span_internal_${i}`, structuralPath: `Clause ${i + 1}`,
        charRange: [0, 100], quote: `The processor shall retain the records for ${i + 1} days under this agreement.` }],
      whatTheDocumentProvides: "The agreement describes the parties and the processing arrangement.",
      whatIsMissingOrUnclear: "Further assessment depends on the reviewed supporting material.",
      whyItMatters: "This affects the scope of the obligation.", conclusion: "The assessment follows the reviewed supporting material.",
      ruleVersion: "rule_internal", documentHash: "hash_internal",
    })), outstandingChecks: [], limitations: [],
  };
}
const clone = <T>(v: T): T => structuredClone(v);
function state(instruction: string, answerStyle?: "narrative" | "tabular", depth?: "narrow" | "standard" | "deep") {
  return { request: { instruction, answerStyle }, plan: { reportSpec: { depth } } } as AnalysisState;
}
const overview = (p: CompliancePresentationPlan) => p.sections.find(s => s.kind === "overview")!;
const details = (p: CompliancePresentationPlan) => p.sections.find(s => s.kind === "details")!;
const markdownParser = new MarkdownIt({ html: false });
function parsedQuotes(markdown: string): string[] {
  const quotes: string[] = [];
  let current: string[] | undefined;
  for (const token of markdownParser.parse(markdown, {})) {
    if (token.type === "blockquote_open") current = [];
    if (token.type === "inline" && current) current.push((token.children ?? []).map(child =>
      child.type === "softbreak" || child.type === "hardbreak" ? "\n" : child.content).join(""));
    if (token.type === "blockquote_close") { quotes.push(current!.join("\n\n")); current = undefined; }
  }
  return quotes;
}

describe("compliance presentation modes and default plans", () => {
  it("resolves explicit format and depth before defaults, independent of compute budget", () => {
    assert.equal(resolveCompliancePresentationMode(state("Review")), "layered");
    assert.equal(resolveCompliancePresentationMode(state("Table only please", "narrative", "deep")), "table_only");
    assert.equal(resolveCompliancePresentationMode(state("Use no tables", "tabular")), "narrative");
    assert.equal(resolveCompliancePresentationMode(state("A brief review", "tabular", "deep")), "short");
    assert.equal(resolveCompliancePresentationMode(state("A detailed review")), "detailed");
    assert.equal(resolveCompliancePresentationMode(state("Review", "narrative")), "layered");
    assert.equal(resolveCompliancePresentationMode(state("Provide short table", "narrative")), "short");
    assert.equal(resolveCompliancePresentationMode(state("Provide detailed table", "narrative")), "detailed");
    assert.equal(resolveCompliancePresentationMode(state("Review", "tabular")), "layered");
    assert.equal(resolveCompliancePresentationMode(state("Review", undefined, "deep")), "detailed");
    assert.equal(resolveCompliancePresentationMode(state("Review", undefined, "narrow")), "short");
  });
  for (const mode of modes) it(`has complete valid deterministic output in ${mode}`, () => {
    const s = fixture();
    const before = clone(s);
    const p = defaultCompliancePresentationPlan(s, mode);
    assert.deepEqual(validateCompliancePresentationPlan(p, s, mode), []);
    assert.ok(p.sections.flatMap(section => section.findingIds).every(id => id.startsWith("lock_internal_")));
    const d = deterministicComplianceDraft(s, p);
    assert.deepEqual(validateComplianceDraft(d, s, p), []);
    const markdown = renderComplianceMarkdown(s, p, d);
    for (const label of labels) assert.ok(markdown.includes(label), label);
    for (const row of s.rows) {
      assert.ok(markdown.includes(row.title));
      assert.ok(markdown.includes("Recommended action: **Obtain the verified missing material.**"));
      assert.ok(!markdown.includes(row.lockedAssessmentId));
      assert.ok(!markdown.includes(row.requirementId));
    }
    assert.deepEqual(s, before);
    assert.equal(renderComplianceMarkdown(s, p, d), markdown);
    if (mode === "narrative") {
      assert.equal(p.sections.filter(sec => sec.kind === "overview").length, 0);
      assert.equal(details(p).findingIds.length, s.rows.length);
      assert.ok(!markdown.split("\n").some(line => line.startsWith("|")));
    } else assert.equal(overview(p).findingIds.length, s.rows.length);
    if (mode === "layered") assert.equal(details(p).findingIds.length, 6);
    if (mode === "detailed") assert.equal(details(p).findingIds.length, 8);
    if (mode === "table_only" || mode === "short") assert.equal(p.sections.filter(sec => sec.kind === "details").length, 0);
    if (mode === "table_only") {
      assert.equal(d.answer, "");
      assert.ok(!markdown.includes("## Answer"));
      assert.ok(!markdown.split("## Sources")[0].split("\n").some(line => line && !line.startsWith("#") && !line.startsWith("|")));
    } else {
      assert.ok(markdown.startsWith("## Answer"));
      for (const label of labels) assert.ok(markdown.includes(`${label}: 1`));
      assert.ok(markdown.includes("Conclusions are limited to this scope"));
    }
  });
  it("does not call all-not-applicable or empty snapshots fully compliant", () => {
    for (const selected of [[], ["not_applicable"], ["present"]] as const) {
      const s = fixture(selected), p = defaultCompliancePresentationPlan(s, "layered");
      const text = renderComplianceMarkdown(s, p, deterministicComplianceDraft(s, p));
      assert.ok(!/fully compliant/i.test(text));
      if (!selected.length) assert.ok(text.includes("No completed requirement assessments"));
      else if (selected[0] === "not_applicable") assert.ok(text.includes("does not establish compliance"));
      else assert.ok(text.includes("All applicable reviewed requirements are supported"));
    }
  });
});

describe("planner structural validation", () => {
  it("accepts reordered columns and multiple disjoint detail groups", () => {
    const s = fixture(), p = defaultCompliancePresentationPlan(s, "detailed");
    overview(p).columns.reverse();
    const group = details(p);
    p.sections.splice(3, 0, { ...group, heading: "Additional requirement details", findingIds: group.findingIds.splice(4) });
    assert.deepEqual(validateCompliancePresentationPlan(p, s, "detailed"), []);
  });
  it("enforces the mode detail cap on every section", () => {
    const caps = { layered: 80, short: 20, detailed: 120, narrative: 80, table_only: 40 };
    for (const mode of modes) {
      const s = fixture(), p = defaultCompliancePresentationPlan(s, mode);
      assert.ok(p.sections.every(section => section.detailWords === caps[mode]));
      p.sections[0].detailWords = caps[mode] + 1;
      assert.ok(validateCompliancePresentationPlan(p, s, mode).some(e => e.includes("detailWords")));
    }
  });
  it("rejects malformed containers, extra fields and missing metadata without throwing", () => {
    const s = fixture(), good = defaultCompliancePresentationPlan(s, "layered");
    const bad: unknown[] = [null, [], {}, { ...good, sections: null }, { ...good, status: "present" },
      { ...good, sections: [null] }, { ...good, sections: [{ ...good.sections[0], findingIds: {} }] },
      { ...good, sections: [{ ...good.sections[0], columns: [null] }] }, { ...good, sections: [{ kind: "answer" }] }];
    for (const value of bad) assert.ok(validateCompliancePresentationPlan(value, s, "layered").length);
    const sparse = clone(good); sparse.sections.length++;
    assert.ok(validateCompliancePresentationPlan(sparse, s, "layered").length);
  });
  it("rejects duplicate and unknown IDs, wrong ID domains, omissions, extra columns and headings that assert verdicts", () => {
    const s = fixture(), good = defaultCompliancePresentationPlan(s, "layered");
    const edits: ((p: CompliancePresentationPlan) => void)[] = [
      p => { overview(p).findingIds.pop(); },
      p => { overview(p).findingIds.push(overview(p).findingIds[0]); },
      p => { overview(p).findingIds[0] = "unknown"; },
      p => { overview(p).findingIds[0] = s.rows[0].rowId; },
      p => { details(p).findingIds.pop(); },
      p => { p.sections.push(clone(details(p))); },
      p => { overview(p).columns.pop(); },
      p => { overview(p).columns[0] = "Severity" as never; },
      p => { overview(p).columns[0] = "Status"; },
      p => { p.sections[0].heading = "Critical risks"; },
      p => { p.sections[0].heading = "Agreement is fully compliant"; },
      p => { p.sections[0].heading = "Contract is enforceable"; },
      p => { p.sections[0].heading = "<script>alert</script>"; },
      p => { p.sections[0].heading = s.rows[0].lockedAssessmentId; },
      p => { p.sections[0].detailWords = 19; }, p => { p.sections[0].detailWords = 121; },
      p => { p.sections[0].detailWords = 80.5; },
      p => { p.sections.reverse(); }, p => { p.sections.push(clone(p.sections[0])); },
      p => { p.sections = p.sections.filter(sec => sec.kind !== "limitations"); },
    ];
    for (const edit of edits) { const p = clone(good); edit(p); assert.ok(validateCompliancePresentationPlan(p, s, "layered").length, edit.toString()); }
  });
  it("requires limitations for each uncertain status, outstanding check or explicit limitation", () => {
    for (const status of ["cannot_determine", "conflicting", "judgment_required", "verification_incomplete"] as const) {
      const s = fixture([status]), p = defaultCompliancePresentationPlan(s, "short");
      p.sections = p.sections.filter(sec => sec.kind !== "limitations");
      assert.ok(validateCompliancePresentationPlan(p, s, "short").some(e => e.includes("limitations")));
    }
    for (const kind of ["outstanding", "limitation"]) {
      const s = fixture(["present"]);
      if (kind === "outstanding") s.outstandingChecks.push({ requirementId: "unmatched_internal", title: "Transfer review", reason: "No completed check", kind: "unmatched" });
      else s.limitations.push({ id: "lim_internal", requirementIds: [], message: "The annex was unavailable" });
      const p = defaultCompliancePresentationPlan(s, "layered");
      assert.ok(p.sections.some(sec => sec.kind === "limitations"));
      const output = renderComplianceMarkdown(s, p, deterministicComplianceDraft(s, p));
      if (kind === "outstanding") {
        assert.ok(output.includes("### Outstanding checks"));
        assert.ok(!output.split("\n").filter(l => l.startsWith("|")).join("\n").includes("Transfer review"));
      }
    }
  });
  it("enforces mode-specific section restrictions", () => {
    const s = fixture();
    for (const mode of ["short", "table_only", "narrative"] as const) {
      const p = defaultCompliancePresentationPlan(s, mode), extra = defaultCompliancePresentationPlan(s, "detailed");
      p.sections.push(clone(mode === "narrative" ? overview(extra) : details(extra)));
      assert.ok(validateCompliancePresentationPlan(p, s, mode).length);
    }
  });
});

describe("draft validation and deterministic fallback", () => {
  it("rejects unknown, duplicate, missing rows and additional model-controlled fields", () => {
    const s = fixture(), p = defaultCompliancePresentationPlan(s, "layered"), d = deterministicComplianceDraft(s, p);
    const bad: unknown[] = [null, [], {}, { ...d, rows: null }, { ...d, rows: [null] }, { ...d, citations: [] },
      { ...d, rows: d.rows.slice(1) }, { ...d, rows: [...d.rows, d.rows[0]] },
      { ...d, rows: [{ ...d.rows[0], findingId: s.rows[0].rowId }, ...d.rows.slice(1)] },
      { ...d, rows: [{ ...d.rows[0], status: "gap" }, ...d.rows.slice(1)] },
      { ...d, rows: [{ ...d.rows[0], recommendedAction: "Invented action" }, ...d.rows.slice(1)] }];
    for (const value of bad) assert.ok(validateComplianceDraft(value, s, p).length);
    const sparse = clone(d); sparse.rows.length++;
    assert.ok(validateComplianceDraft(sparse, s, p).length);
  });
  it("rejects references, quotations, markup, leaked identifiers and invented numerals", () => {
    const s = fixture(), p = defaultCompliancePresentationPlan(s, "layered"), d = deterministicComplianceDraft(s, p);
    for (const text of ["See [E1].", "Clause 1 confirms this.", "See https://example.com", 'The text says "agreed".',
      "The text says 'agreed'.", s.rows[0].evidence[0].quote, "**Everything** is supported.", "Text | injected cell", "<img src=x>",
      "Line one\n# heading", `Result for ${s.rows[0].lockedAssessmentId}`, `Result for ${s.rows[0].canonicalKey}`,
      "The term is 999 days.", "The term is 8 days.", "The requirement is Gap.", "The requirement is not Present.",
      "1. A numbered list", "---", "The text says ‘agreed’."]) {
      const edited = clone(d); edited.rows[0].assessment = text;
      assert.ok(validateComplianceDraft(edited, s, p).length, text);
    }
    const valid = clone(d); valid.rows[0].assessment = "The term is 1 days.";
    assert.deepEqual(validateComplianceDraft(valid, s, p), []);
  });
  it("rejects negated canonical statuses even when the label matches the row", () => {
    const s = fixture(["gap"]), p = defaultCompliancePresentationPlan(s, "layered"), d = deterministicComplianceDraft(s, p);
    for (const assessment of ["There is no gap.", "This is not a gap.", "The gap does not exist.", "This is gap-free."]) {
      const edited = clone(d); edited.rows[0].assessment = assessment;
      assert.ok(validateComplianceDraft(edited, s, p).length, assessment);
    }
  });
  it("identifies exact forbidden syntax, citation, pointer and quotation tokens for writer repair", () => {
    const s = fixture(["present"]), p = defaultCompliancePresentationPlan(s, "short"), d = deterministicComplianceDraft(s, p);
    s.rows[0].evidence[0].pointer = "Transfer provision";
    for (const [assessment, token] of [["See Article 28(3).", "Article 28(3)"], ["See Clause 12.3.", "Clause 12.3"],
      ["See [E1].", "["], ["**The requirement**", "*"], ["Refer to Transfer provision.", "Transfer provision"]]) {
      const edited = clone(d); edited.rows[0].assessment = assessment;
      assert.ok(validateComplianceDraft(edited, s, p).some(error => error.includes(JSON.stringify(token))), token);
    }
    const edited = clone(d); edited.rows[0].assessment = s.rows[0].evidence[0].quote;
    assert.ok(validateComplianceDraft(edited, s, p).some(error => error.includes(JSON.stringify(s.rows[0].evidence[0].quote.slice(0, 80)))));
  });
  it("rejects status-only assessment cells and requires at least four descriptive words", () => {
    const s = fixture(), p = defaultCompliancePresentationPlan(s, "layered"), d = deterministicComplianceDraft(s, p);
    for (const assessment of ["obligation satisfied", "gap", "partial", "The obligation is satisfied.", "The requirement is present."]) {
      const edited = clone(d); edited.rows[0].assessment = assessment;
      assert.ok(validateComplianceDraft(edited, s, p).some(error => error.includes("at least 4 words")), assessment);
    }
    const edited = clone(d); edited.rows[0].assessment = "The agreement requires approval."; edited.rows[0].explanation = "Reviewed.";
    assert.deepEqual(validateComplianceDraft(edited, s, p), []);
    for (const row of s.rows) row.whatTheDocumentProvides = row.conclusion = "obligation satisfied";
    const fallback = deterministicComplianceDraft(s, p);
    assert.deepEqual(validateComplianceDraft(fallback, s, p), []);
    assert.ok(fallback.rows.every(row => row.assessment.split(/\s+/).length >= 4));
  });
  it("prefers the descriptive provision and does not turn rejected clause references into fallback prose", () => {
    const s = fixture(["present"]), r = s.rows[0]; r.supportedElementIds = ["E1"];
    r.whatTheDocumentProvides = "E1: Transfers outside the agreed region require written approval.";
    r.conclusion = "A controller or processor transfers personal data to a third country or international o... is present - every mandatory element is supported by scope-compatible evidence.";
    const p = defaultCompliancePresentationPlan(s, "layered");
    assert.equal(deterministicComplianceDraft(s, p).rows[0].assessment, "Transfers outside the agreed region require written approval.");
    for (const text of ["E1: Article 28. Processing permitted.", "E1: Art. 28. Processing permitted.", "E1: Clause E1: Processing permitted."]) {
      r.whatTheDocumentProvides = text;
      const d = deterministicComplianceDraft(s, p);
      assert.deepEqual(validateComplianceDraft(d, s, p), []);
      assert.ok(!d.rows[0].assessment.includes("Processing permitted"));
      assert.ok(!d.rows[0].assessment.includes("every mandatory element"));
    }
  });
  it("bounds prose using the selected per-row detail budget", () => {
    const s = fixture(), p = defaultCompliancePresentationPlan(s, "detailed"); details(p).detailWords = 20;
    const d = deterministicComplianceDraft(s, p);
    assert.deepEqual(validateComplianceDraft(d, s, p), []);
    for (const field of ["answer", "assessment", "explanation"] as const) {
      const edited = clone(d);
      if (field === "answer") edited.answer = "word ".repeat(121);
      else edited.rows[0][field] = "word ".repeat(field === "assessment" ? 61 : 21);
      assert.ok(validateComplianceDraft(edited, s, p).some(e => e.includes("length limit")));
    }
  });
  it("falls back to bounded canonical prose when verified prose contains formatting, IDs or another status", () => {
    const s = fixture();
    for (const r of s.rows) { r.conclusion = "Fully compliant **forever**"; r.whatTheDocumentProvides = r.lockedAssessmentId; }
    for (const mode of modes) {
      const p = defaultCompliancePresentationPlan(s, mode), d = deterministicComplianceDraft(s, p);
      assert.deepEqual(validateComplianceDraft(d, s, p), []);
    }
  });
  it("rejects writer-authored overall compliance and status counts", () => {
    const s = fixture(["not_applicable"]), p = defaultCompliancePresentationPlan(s, "short"), d = deterministicComplianceDraft(s, p);
    for (const answer of ["Fully compliant.", "Present: 1.", "All requirements are compliant."]) {
      assert.ok(validateComplianceDraft({ ...d, answer }, s, p).length);
    }
  });
  it("keeps meaningful verified fallback prose after removing internal evidence prefixes and technical wording", () => {
    const s = fixture(["present"]), r = s.rows[0];
    r.supportedElementIds = ["E1", "E2"];
    r.whatTheDocumentProvides = "E1: Transfers outside the agreed region require written approval. E2: The processor maintains scope-compatible safeguards.";
    r.whatIsMissingOrUnclear = "No unresolved elements.";
    r.whyItMatters = "This determines where the processing may take place.";
    r.conclusion = "The transfer requirement is present – every mandatory element has supporting material.";
    r.evidence[0].quote = "E1: Original source prefix must remain unchanged.";
    const p = defaultCompliancePresentationPlan(s, "detailed"), d = deterministicComplianceDraft(s, p);
    assert.deepEqual(validateComplianceDraft(d, s, p), []);
    assert.ok(d.rows[0].explanation.includes("Transfers outside the agreed region require written approval"));
    assert.ok(d.rows[0].explanation.includes("No unresolved elements"));
    assert.ok(d.rows[0].explanation.includes("within the reviewed scope"));
    assert.ok(!d.rows[0].explanation.includes("E1:")); assert.ok(!d.rows[0].explanation.includes("E2:"));
    assert.equal(d.rows[0].assessment, "Transfers outside the agreed region require written approval.");
    assert.ok(parsedQuotes(renderComplianceMarkdown(s, p, d)).includes(r.evidence[0].quote));
  });
  it("does not discard useful verified fragments when another fragment is invalid or exceeds the budget", () => {
    const s = fixture(["partial"]), r = s.rows[0];
    r.supportedElementIds = ["E1", "E2"];
    r.whatTheDocumentProvides = "E1/E2: Written approval is required for transfers.";
    r.whatIsMissingOrUnclear = "See [unverified reference].";
    r.whyItMatters = "The approval controls where processing may take place.";
    const p = defaultCompliancePresentationPlan(s, "short"), d = deterministicComplianceDraft(s, p);
    assert.deepEqual(validateComplianceDraft(d, s, p), []);
    assert.ok(d.rows[0].explanation.includes("Written approval is required for transfers"));
    assert.ok(d.rows[0].explanation.includes("The approval controls"));
    assert.ok(!d.rows[0].explanation.includes("unverified reference"));
    assert.ok(d.rows[0].explanation.split(/\s+/).length <= 20);
  });
});

describe("code-owned Markdown assembly", () => {
  it("renders each actionable recommendation once and omits actions on satisfied or inapplicable rows", () => {
    const s = fixture();
    for (const [i, r] of s.rows.entries()) r.recommendedAction = `Canonical action ${i + 1}`;
    for (const mode of modes) {
      const p = defaultCompliancePresentationPlan(s, mode), output = renderComplianceMarkdown(s, p, deterministicComplianceDraft(s, p));
      for (const r of s.rows) assert.equal(output.split(r.recommendedAction).length - 1, r.status === "present" || r.status === "not_applicable" ? 0 : 1);
      if (mode === "layered" || mode === "detailed") assert.ok(!output.split("\n").filter(line => line.startsWith("|")).join("\n").includes("Recommended action"));
    }
  });
  it("uses canonical status enums, full quotes, inline pointers, legal citations and actions", () => {
    const s = fixture(["gap"]), p = defaultCompliancePresentationPlan(s, "short");
    const output = renderComplianceMarkdown(s, p, deterministicComplianceDraft(s, p));
    const row = output.split("\n").find(line => line.startsWith("| **Requirement 1"))!;
    assert.ok(row.includes("⚠️ **Gap**"));
    assert.ok(row.includes("GDPR Article 28"));
    assert.ok(row.includes("**Clause 1, paragraph 2** [E1]"));
    assert.ok(row.includes("The processor shall retain the records for 1 days"));
    assert.ok(row.includes("Recommended action"));
    assert.ok(!output.includes("## Sources"));
  });
  it("escapes hostile source Markdown, HTML, separators and multiline quotes", () => {
    const s = fixture(["present"]), r = s.rows[0];
    r.title = "Requirement | evil\n## injected";
    r.legalCitation = "Law <script>bad</script>";
    r.whatTheDocumentProvides = "[click](javascript:bad) | cell\n# heading";
    r.recommendedAction = "<img src=x> | action";
    r.evidence[0].documentTitle = "**Document** | forged";
    r.evidence[0].pointer = "Clause | locator";
    r.evidence[0].quote = "Full | quote\n# forged heading\n<script>bad</script> & &#124; [link](https://evil.test)";
    for (const mode of ["short", "narrative", "table_only"] as const) {
      const p = defaultCompliancePresentationPlan(s, mode), output = renderComplianceMarkdown(s, p, deterministicComplianceDraft(s, p));
      assert.ok(!output.includes("<script>")); assert.ok(!output.includes("<img"));
      assert.ok(!output.includes("\n# forged")); assert.ok(!output.includes("\n## injected"));
      assert.ok(!output.includes("[click](")); assert.ok(!output.includes("[link]("));
      assert.ok(!output.includes("<br>"));
      if (mode === "narrative") assert.ok(parsedQuotes(output).includes(r.evidence[0].quote));
      assert.ok(!output.includes("## Sources"));
      for (const line of output.split("\n").filter(l => l.startsWith("| **Requirement &#124;"))) assert.equal(line.split("|").length, 6);
    }
  });
  it("deduplicates shared sources and allocates stable references for malformed or colliding citation IDs", () => {
    const s = fixture(["present", "gap"]);
    s.rows[1].evidence.push(clone(s.rows[0].evidence[0]));
    s.rows[1].evidence[0].citationId = s.rows[0].evidence[0].citationId;
    s.rows[0].evidence.push({ ...clone(s.rows[0].evidence[0]), pointer: "Other provision", quote: "Other full quote", citationId: "technical_citation" });
    const p = defaultCompliancePresentationPlan(s, "short"), output = renderComplianceMarkdown(s, p, deterministicComplianceDraft(s, p));
    assert.ok(!output.includes("technical_citation"));
    assert.ok(!output.includes("## Sources"));
  });
  it("places the answer first, displays only nonzero counts and keeps provision cells to pointers", () => {
    const s = fixture(["gap"]), p = defaultCompliancePresentationPlan(s, "layered"), d = deterministicComplianceDraft(s, p);
    d.answer = "The reviewed obligation needs further work. The available material does not support the required protection.";
    const output = renderComplianceMarkdown(s, p, d);
    assert.ok(output.startsWith("## Answer\n\nThis review checked 1 requirement."));
    assert.ok(output.includes("The reviewed obligation needs further work"));
    assert.ok(output.includes("Gap: 1"));
    assert.ok(!output.includes("Present: 0"));
    const row = output.split("\n").find(line => line.startsWith("| **Requirement 1"))!;
    assert.ok(!row.split("|")[3].includes(s.rows[0].whatTheDocumentProvides));
    assert.ok(row.split("|")[3].includes("**Clause 1, paragraph 2** [E1]"));
    assert.ok(row.split("|")[3].includes("The processor shall retain the records for 1 days"));
    const detail = output.split("## Findings requiring attention")[1];
    assert.ok(detail.includes("**Contract provision**"));
    assert.ok(detail.includes("**Status:** ⚠️ **Gap**"));
    assert.equal(detail.match(/Assessment:/g)?.length, 1);
    assert.ok(detail.includes(`**Assessment:** ${d.rows[0].explanation}`));
  });
  it("uses honest no-evidence wording and qualifies unresolved conclusions", () => {
    const s = fixture(["gap", "cannot_determine"]); s.rows.forEach(r => { r.evidence = []; });
    const p = defaultCompliancePresentationPlan(s, "short"), output = renderComplianceMarkdown(s, p, deterministicComplianceDraft(s, p));
    assert.ok(output.includes("No matching provision found in reviewed scope"));
    assert.ok(output.includes("Evidence unavailable for this assessment"));
    assert.ok(output.includes("qualified by the limitations"));
    assert.ok(!output.includes("## Sources"));
  });
  it("preserves exact decoded canonical quotations, including source IDs, whitespace and hostile syntax", () => {
    const s = fixture(["gap"]), r = s.rows[0];
    r.evidence[0].quote = `  Source ${r.lockedAssessmentId} | <b>literal</b> & &#124;\n\t[link](https://example.test) **literal**  \n\nFinal paragraph.`;
    for (const mode of modes) {
      const p = defaultCompliancePresentationPlan(s, mode), output = renderComplianceMarkdown(s, p, deterministicComplianceDraft(s, p));
      assert.ok(!output.includes("## Sources"));
      if (mode !== "short" && mode !== "table_only") assert.deepEqual(parsedQuotes(output), [r.evidence[0].quote]);
      assert.ok(!output.includes("<br>"));
      const html = markdownParser.render(output);
      assert.ok(!html.includes("<b>literal</b>"));
      assert.ok(!html.includes('<a href="https://example.test"'));
    }
  });
  it("maps known identifiers to human names outside quotations", () => {
    const s = fixture(["gap"]), r = s.rows[0];
    r.supportedElementIds = ["documented_instructions"];
    r.recommendedAction = `Review ${r.requirementId} and documented_instructions in doc_internal.`;
    const p = defaultCompliancePresentationPlan(s, "short"), output = renderComplianceMarkdown(s, p, deterministicComplianceDraft(s, p));
    assert.ok(output.includes("Review Requirement 1 and documented instructions in Agreement"));
    assert.ok(!output.includes("internal reference")); assert.ok(!output.includes(r.requirementId));
  });
  it("keeps readable punctuation in public prose while escaping source markup and table separators", () => {
    const s = fixture(["gap"]), r = s.rows[0];
    r.title = "Transfers (non-EU): review";
    r.legalCitation = "Article 45(1) - GDPR";
    r.evidence[0].pointer = "Clause 12.3 (transfers): non-EU";
    r.recommendedAction = "Complete the review (including annexes): check cross-border transfers.";
    const p = defaultCompliancePresentationPlan(s, "short"), d = deterministicComplianceDraft(s, p);
    const output = renderComplianceMarkdown(s, p, d), publicPart = output.split("## Sources")[0];
    assert.ok(publicPart.includes(r.title)); assert.ok(publicPart.includes(r.legalCitation));
    assert.ok(publicPart.includes(r.evidence[0].pointer)); assert.ok(publicPart.includes(r.recommendedAction));
    assert.ok(!/&#(?:40|41|45|46|58);/.test(publicPart));
    const html = markdownParser.render(output);
    assert.ok(html.includes("Article 45(1) - GDPR"));
    assert.ok(!output.includes("## Sources"));
  });
  it("always includes reviewed scope in table-only output, including an empty or all-present review", () => {
    for (const selected of [[], ["present"], ["not_applicable"]] as const) {
      const s = fixture(selected), p = defaultCompliancePresentationPlan(s, "table_only");
      assert.deepEqual(validateCompliancePresentationPlan(p, s, "table_only"), []);
      const output = renderComplianceMarkdown(s, p, deterministicComplianceDraft(s, p));
      assert.ok(output.includes(`| Reviewed scope | ${s.scope}; conclusions are limited to this scope. |`));
      assert.ok(!output.includes("## Answer"));
      assert.equal(overview(p).findingIds.length, s.rows.length);
      p.sections = p.sections.filter(section => section.kind !== "limitations");
      assert.ok(validateCompliancePresentationPlan(p, s, "table_only").some(error => error.includes("scope")));
    }
  });
  it("strips only associated recommendation label prefixes and preserves legal and unknown labels", () => {
    const s = fixture(["gap"]), r = s.rows[0];
    r.supportedElementIds = ["E1", "TM2"];
    r.missingElementIds = ["SM1", "SM2", "custom-control"];
    r.recommendedAction = "E1: Establish the protection. TM2: Complete the annexes; SM1: Review the destination.\nSM2: Document the measures. custom-control: Assign an owner. XX9: Retain unknown label. Clause E1: Retain the clause reference. Article 28: Retain the legal reference.";
    r.evidence[0].quote = r.recommendedAction;
    for (const mode of modes) {
      const p = defaultCompliancePresentationPlan(s, mode), output = renderComplianceMarkdown(s, p, deterministicComplianceDraft(s, p));
      const publicPart = output.split("## Sources")[0].split("\n").filter(line => !line.startsWith(">")).join("\n");
      assert.ok(publicPart.includes("Recommended action: **Establish the protection. Complete the annexes; Review the destination."));
      assert.ok(publicPart.includes("Assign an owner. XX9: Retain unknown label. Clause E1: Retain the clause reference. Article 28: Retain the legal reference."));
      assert.ok(!output.includes("## Sources"));
    }
  });
  it("refuses invalid drafts and plans rather than rendering unchecked model structures", () => {
    const s = fixture(), p = defaultCompliancePresentationPlan(s, "layered"), d = deterministicComplianceDraft(s, p);
    assert.throws(() => renderComplianceMarkdown(s, p, { ...d, answer: "**Injected**" }), /Invalid compliance draft/);
    overview(p).findingIds.pop();
    assert.throws(() => renderComplianceMarkdown(s, p, d), /Invalid compliance presentation plan/);
  });
});
