import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendConversationTurns,
  ensureConversation,
  applyUserAnswers,
} from "../src/modules/drafting/memory/conversation-store.js";
import {
  conversationWindowText,
  windowConversation,
} from "../src/modules/drafting/memory/conversation-window.js";
import type { DraftState } from "../src/modules/drafting/models/draft-state.js";

function emptyState(): DraftState {
  return {
    request: {
      intent: "CREATE",
      rawInstructions: "Draft a DPA",
      payloadFields: { documentId: "doc_test" },
    },
    requirements: null,
    retrieval: {
      matchedTemplate: null,
      applicablePlaybookRules: [],
      fallbackClauses: [],
      historicalReferences: [],
    },
    context: null,
    draft: null,
    validation: null,
    riskReview: null,
    metadata: {
      generationParameters: {},
      playbookVersion: "1.0.0",
      timestamp: new Date().toISOString(),
    },
  };
}

test("ensureConversation seeds documentId", () => {
  const state = ensureConversation(emptyState());
  assert.equal(state.conversation?.documentId, "doc_test");
  assert.equal(state.conversation?.turns.length, 0);
});

test("appendConversationTurns accumulates user/assistant turns", () => {
  let state = ensureConversation(emptyState());
  state = appendConversationTurns(state, [
    { role: "user", content: "Make liability mutual" },
    { role: "assistant", content: "Updated misc section", documentVersion: 2 },
  ]);
  assert.equal(state.conversation!.turns.length, 2);
  assert.equal(state.conversation!.turns[0].role, "user");
});

test("windowConversation keeps last N and summarizes older", () => {
  let state = ensureConversation(emptyState());
  for (let i = 0; i < 20; i++) {
    state = appendConversationTurns(state, [{ role: "user", content: `msg ${i}` }]);
  }
  const windowed = windowConversation(state.conversation, 5);
  assert.equal(windowed.turns.length, 5);
  assert.ok(windowed.summary && windowed.summary.length > 0);
  const text = conversationWindowText(state.conversation, 5);
  assert.match(text, /Earlier summary/);
  assert.match(text, /msg 19/);
});

test("applyUserAnswers merges facts and clears open questions", () => {
  let state = emptyState();
  state.requirements = {
    contractType: "NDA",
    jurisdiction: "Not specified",
    industry: "General",
    parties: [],
    requiredClauses: [],
    optionalClauses: [],
    language: "English",
    instructions: "Draft a NDA",
  };
  state.agent = {
    phase: "ASK",
    entryMode: "CREATE",
    turn: 0,
    maxTurns: 8,
    tokensUsed: 0,
    tokenBudget: 500000,
    askRounds: 1,
    maxAskRounds: 2,
    openQuestions: [
      { id: "q-governingLaw-0", field: "governingLaw", question: "Law?", severity: "critical" },
    ],
  };
  state = applyUserAnswers(state, { "q-governingLaw-0": "delaware" });
  assert.equal(state.structuredFacts?.governingLaw, "delaware");
  assert.equal(state.requirements?.jurisdiction, "delaware");
  assert.equal(state.agent?.openQuestions.length, 0);
  assert.equal(state.agent?.phase, "PLAN");
  assert.ok(state.conversation!.turns.some((t) => t.role === "user"));
});
