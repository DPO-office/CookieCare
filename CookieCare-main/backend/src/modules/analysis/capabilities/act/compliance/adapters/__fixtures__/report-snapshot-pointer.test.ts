import assert from "node:assert/strict";
import test from "node:test";
import { outcomesToSnapshot } from "../report-snapshot.js";
import type { AnalysisState } from "../../../../../models/analysis-state.js";
import type { ComplianceCheckOutcome } from "../../contracts/index.js";

function node(nodeId: string, kind: string, text: string, parentId?: string) {
  return { nodeId, kind, text, parentId, childIds: [], displayLabel: undefined, title: undefined };
}

function stateWithGraph(): AnalysisState {
  return {
    request: { instruction: "Review the DPA", documentIds: ["doc-1"] },
    workspace: {
      documents: [{
        docId: "doc-1", title: "DPA.pdf", role: "primary",
        structureGraph: {
          nodes: [
            node("doc", "document", "…"),
            node("n-clause", "subclause", "4.1 If the Administrator does not have the ability to correct Personal Data, Alaio will assist.", "doc"),
            node("n-appendix", "appendix", "Appendix 1 SUBJECT MATTER AND DETAILS OF THE DATA PROCESSING", "doc"),
            node("n-bullet", "list_item", "Data subjects about whom Alaio collects personal data in its provision of the Processor Services.", "n-appendix"),
          ],
        },
      }],
    },
  } as unknown as AnalysisState;
}

function outcome(evidence: Array<{ nodeId: string; path: string; quote: string }>): ComplianceCheckOutcome {
  return {
    outcomeId: "outcome:check:1", kind: "assessment", status: "partial", lockedAssessmentId: "L-1",
    check: { checkId: "check:1", ruleId: "gdpr.art28.1", skillId: "s", documents: [{ documentId: "doc-1", hash: "h1" }],
      rule: { citation: "Article 28(1)", title: "Processor due diligence", version: "1" } },
    explanation: { whatTheDocumentProvides: "", whatIsMissingOrUnclear: "", whyItMatters: "", conclusion: "", recommendedAction: "" },
    verification: { elements: [], answers: [] },
    evidence: evidence.map(e => ({ nodeId: e.nodeId, quote: e.quote, path: e.path, range: [0, e.quote.length],
      documentId: "doc-1", originalRole: "primary", use: "proof", explanation: "" })),
  } as unknown as ComplianceCheckOutcome;
}

test("evidence pointers are clause/appendix labels, never character offsets", () => {
  const snapshot = outcomesToSnapshot(stateWithGraph(), [outcome([
    { nodeId: "n-clause", path: "document.subclause_4.1", quote: "4.1 If the Administrator does not have the ability to correct Personal Data, Alaio will assist." },
    { nodeId: "n-bullet", path: "document.appendix_1.list_item_117", quote: "Data subjects about whom Alaio collects personal data in its provision of the Processor Services." },
  ])]);
  const pointers = snapshot.rows[0].evidence.map(e => e.pointer);
  assert.ok(pointers.every(p => !/Passage at characters/.test(p)), `no char offsets, got ${JSON.stringify(pointers)}`);
  // A clause whose text opens with its number is labelled from that number.
  assert.equal(pointers[0], "Clause 4.1");
  // An unnumbered appendix bullet inherits its container label from the ancestor walk.
  assert.equal(pointers[1], "Appendix 1");
});

test("an unknown node falls back to a structural-path label, still not an offset", () => {
  const snapshot = outcomesToSnapshot(stateWithGraph(), [outcome([
    { nodeId: "missing-node", path: "document.clause_5", quote: "Some cited text without a resolvable node." },
  ])]);
  assert.equal(snapshot.rows[0].evidence[0].pointer, "Clause 5");
});

test("reporting handoff retains the original wording for verified dynamic answers", () => {
  const state = stateWithGraph();
  state.plan = { complianceRequirementResolution: { facets: [{ facetId: "timing", sourceText: "What response timeframe applies?" }] } } as AnalysisState["plan"];
  const locked = outcome([]);
  locked.verification.answers = [
    { questionId: "user_request", answer: "The agreement addresses assistance.", elementIds: [], evidenceIds: [] },
    { questionId: "facet:timing", answer: "No period is specified.", elementIds: [], evidenceIds: [] },
  ];
  const answers = outcomesToSnapshot(state, [locked]).rows[0].answers!;
  assert.equal(answers[0].question, state.request.instruction);
  assert.equal(answers[1].question, "What response timeframe applies?");
});
