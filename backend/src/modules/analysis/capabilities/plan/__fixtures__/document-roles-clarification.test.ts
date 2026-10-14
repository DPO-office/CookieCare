/**
 * Regression coverage for the documentRoles clarification round-trip:
 * resolveDocumentRoles must surface human filenames (not raw docIds) when it
 * can't tell target from reference apart, and the answer format it asks for
 * must be exactly what applyUserAnswers's parser accepts — previously the
 * options list used a "id:reference_or_target" suffix the parser could never
 * match, so a user's answer was silently discarded.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDocumentRoles } from "../resolve-document-roles.js";
import { applyUserAnswers } from "../../../memory/conversation-store.js";
import type { AnalysisState } from "../../../models/analysis-state.js";

function baseState(overrides: Partial<AnalysisState["request"]>): AnalysisState {
  return {
    request: {
      sessionId: "s1",
      instruction: "Compare this DPA against our playbook",
      documentIds: ["doc_a", "doc_b"],
      documentTexts: {},
      ...overrides,
    },
    workspace: { sessionId: "s1", documents: [] },
    findings: [],
    draftTasks: [],
    metadata: { timestamp: new Date().toISOString() },
  } as unknown as AnalysisState;
}

describe("documentRoles clarification — human labels and parseable answers", () => {
  it("labels each option with the user's uploaded filename, not the docId", () => {
    const state = baseState({
      documentTitles: { doc_a: "Mastercard DPA.pdf", doc_b: "Company Playbook.pdf" },
      documentTexts: {
        // Both score "reference" (normative language, no signature block) —
        // the ambiguous case that triggers the clarification.
        doc_a: "Supplier must comply with all required data protection obligations.",
        doc_b: "Vendors must always require encryption. Preferred position: no data resale.",
      },
    });

    const resolved = resolveDocumentRoles(state);
    assert.ok(resolved.missing, "expected a clarification to be raised");
    assert.equal(resolved.missing?.field, "documentRoles");
    assert.deepEqual(resolved.missing?.perDocumentRoles, [
      { docId: "doc_a", title: "Mastercard DPA.pdf" },
      { docId: "doc_b", title: "Company Playbook.pdf" },
    ]);
  });

  it("falls back to the docId as the label only when no title was supplied", () => {
    const state = baseState({
      documentTexts: {
        doc_a: "Supplier must comply with all required data protection obligations.",
        doc_b: "Vendors must always require encryption. Preferred position: no data resale.",
      },
    });
    const resolved = resolveDocumentRoles(state);
    assert.deepEqual(resolved.missing?.perDocumentRoles, [
      { docId: "doc_a", title: "doc_a" },
      { docId: "doc_b", title: "doc_b" },
    ]);
  });

  it("round-trips a composed per-document answer back into request.documentRoles", async () => {
    const state = baseState({
      documentTitles: { doc_a: "Mastercard DPA.pdf", doc_b: "Company Playbook.pdf" },
    });
    const withOpenQuestion: AnalysisState = {
      ...state,
      agent: {
        openQuestions: [
          {
            id: "q-documentRoles-0",
            field: "documentRoles",
            question: "Mark which document is the playbook and which is the target.",
            severity: "critical",
          },
        ],
      },
    } as unknown as AnalysisState;

    // Exactly the format DocumentRolePicker composes in the frontend.
    const answered = await applyUserAnswers(withOpenQuestion, {
      "q-documentRoles-0": "doc_a:target;doc_b:reference",
    });

    assert.deepEqual(answered.request.documentRoles, {
      doc_a: "target",
      doc_b: "reference",
    });

    // And resolveDocumentRoles now resolves cleanly with no further clarification.
    const resolved = resolveDocumentRoles(answered);
    assert.equal(resolved.missing, undefined);
    assert.equal(resolved.targetDocId, "doc_a");
    assert.equal(resolved.referenceDocId, "doc_b");
  });
});
