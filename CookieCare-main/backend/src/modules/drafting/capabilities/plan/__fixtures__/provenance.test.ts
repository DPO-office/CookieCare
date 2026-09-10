import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RequirementContext } from "../../../models/draft-state.js";

/**
 * Provenance tests exercise ClauseRetriever fallback gating without a live DB
 * by importing the allow-gate behavior via env + buildFallbackClauses path.
 * We test the public contract: when DRAFTING_ALLOW_GENERIC_FALLBACK=false and
 * no catalog/library hits, result is empty with fallbackBlocked.
 */

describe("retrieval provenance", () => {
  it("stamps wasFallback on generic fallback clauses when allowed", async () => {
    process.env.DRAFTING_ALLOW_GENERIC_FALLBACK = "true";
    process.env.NODE_ENV = "test";

    // Dynamic import after env set — use a minimal fake Pool that always fails queries.
    const { ClauseRetriever } = await import("../../../retrieval/ClauseRetriever.js");
    const fakeDb = {
      query: async () => {
        throw new Error("no db");
      },
    } as any;

    const retriever = new ClauseRetriever(fakeDb);
    const requirements: RequirementContext = {
      contractType: "dpa",
      jurisdiction: "Ireland",
      industry: "General",
      parties: [],
      requiredClauses: ["Confidentiality"],
      optionalClauses: [],
      language: "English",
      instructions: "",
    };
    const result = await retriever.retrieveClauses(requirements, [], null);
    assert.equal(result.source, "hardcoded_fallback");
    assert.ok(result.clauses.length > 0);
    assert.ok(result.clauses.every((c) => c.wasFallback === true));
    assert.ok(result.clauses.every((c) => c.source === "generic_fallback"));
  });

  it("blocks generic fallback when env disallows", async () => {
    process.env.DRAFTING_ALLOW_GENERIC_FALLBACK = "false";
    const { ClauseRetriever } = await import("../../../retrieval/ClauseRetriever.js");
    const fakeDb = {
      query: async () => {
        throw new Error("no db");
      },
    } as any;
    const retriever = new ClauseRetriever(fakeDb);
    const requirements: RequirementContext = {
      contractType: "dpa",
      jurisdiction: "Ireland",
      industry: "General",
      parties: [],
      requiredClauses: ["Confidentiality"],
      optionalClauses: [],
      language: "English",
      instructions: "",
    };
    const result = await retriever.retrieveClauses(requirements, [], null);
    assert.equal(result.source, "none");
    assert.equal(result.clauses.length, 0);
    assert.equal(result.fallbackBlocked, true);
  });
});
