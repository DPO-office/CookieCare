import assert from "node:assert/strict";
import { test } from "node:test";
import { assembleLegalContext } from "../interpretation/context-assembly.js";
import { evaluateApplicability, validateDraftMeaning, validateDraftProfiles } from "../interpretation/legal-meaning.js";
import type { LegalRelationRevision } from "../schemas/legal-structure.js";
import { KB_SCHEMA_VERSION } from "../schemas/common.js";
import { RuleProfileSchema } from "../schemas/requirement.js";

test("unknown applicability remains visible through nested conditions", () => {
  const expression = { operator: "all" as const, children: [
    { componentId: "scope" }, { operator: "not" as const, child: { componentId: "exception" } },
  ] };
  assert.equal(evaluateApplicability(expression, { scope: true }), "unknown");
  assert.equal(evaluateApplicability(expression, { scope: true, exception: false }), true);
  assert.equal(evaluateApplicability(expression, { scope: false }), false);
});

test("context assembly retains dependencies and reports missing ones without truncation", () => {
  const provisions = [
    { id: "rule", revision: 1, sourceVersionId: "rules-v1", text: "Rule text" },
    { id: "schedule", revision: 1, sourceVersionId: "rules-v1", text: "Schedule text" },
  ];
  const relation = { id: "link", revision: 1, source: { id: "rule", revision: 1 },
    target: { id: "schedule", revision: 1 } } as LegalRelationRevision;
  const full = assembleLegalContext({ id: "rule", revision: 1 }, provisions, [relation],
    new Set(["rule:1", "schedule:1"]), 100);
  assert.equal(full.complete, true);
  assert.deepEqual(full.provisions.map(item => item.id), ["rule", "schedule"]);
  assert.equal(assembleLegalContext({ id: "rule", revision: 1 }, provisions, [relation],
    new Set(["rule:1"]), 100).complete, false);
  assert.throws(() => assembleLegalContext({ id: "rule", revision: 1 }, provisions, [relation],
    new Set(["rule:1", "schedule:1"]), 5), /exceeds/);
});

test("draft validation rejects unsupported wording and model-claimed approval", () => {
  const raw = {
    schemaVersion: KB_SCHEMA_VERSION, id: "r1", revision: 1, contentHash: "a".repeat(64),
    createdAt: new Date().toISOString(), authorship: { kind: "generated", model: "test", promptVersion: "1" },
    ruleId: "rule", title: "Duty", actor: "Fiduciary", action: "notify", object: "person",
    modality: "must", applicability: { jurisdictions: ["IN"], relationshipScopes: [], guidance: "Apply if covered" },
    conditions: [], exceptions: [], alternatives: [], unresolvedIssues: [], reviewStatus: "approved",
    sources: [{ provision: { id: "p1", revision: 1 }, role: "target",
      exactQuote: "invented", start: 0, end: 8 }],
    meaning: { applicabilityExpression: { componentId: "scope" }, components: [{ id: "scope",
      kind: "condition", statement: "Covered", supportingPassages: [{ sourceVersionId: "v1",
        provision: { id: "p1", revision: 1 }, exactQuote: "Actual", start: 0, end: 6 }] }] },
  };
  const result = validateDraftMeaning(raw, [{ id: "p1", revision: 1, sourceVersionId: "v1", text: "Actual law" }]);
  assert.deepEqual(result.issues.map(issue => issue.code), ["model_claimed_approval", "unsupported_quote"]);
  const profile = RuleProfileSchema.parse({ schemaVersion: KB_SCHEMA_VERSION, id: "profile-1",
    revision: 1, contentHash: "b".repeat(64), createdAt: new Date().toISOString(),
    authorship: { kind: "generated", model: "test", promptVersion: "1" },
    rule: { id: "r1", revision: 1 }, module: "drafting", reviewStatus: "draft",
    content: { considerations: [], clauseGuidance: ["Notify the person"], unresolvedIssues: [] },
    supportingPassages: [{ sourceVersionId: "v1", provision: { id: "p1", revision: 1 },
      exactQuote: "Actual", start: 0, end: 6 }] });
  const guidanceIssues = validateDraftProfiles([profile], [result.requirement],
    [{ id: "p1", revision: 1, sourceVersionId: "v1", text: "Actual law" }]);
  assert.equal(guidanceIssues.filter(issue => issue.code === "missing_module_profile").length, 2);
  assert.equal(guidanceIssues.some(issue => issue.code === "unsupported_quote"), false);
  assert.ok(validateDraftProfiles([{ ...profile, supportingPassages: [] }], [result.requirement],
    [{ id: "p1", revision: 1, sourceVersionId: "v1", text: "Actual law" }])
    .some(issue => issue.code === "unsupported_guidance"));
});
