import assert from "node:assert/strict";
import test from "node:test";
import { requestFixture, responseFixture } from "../../__fixtures__/verification-fixture.js";
import { validateVerification, locateSourceQuote } from "../validate-result.js";
import { verifyRequirement } from "../verify-requirement.js";
import { runVerification } from "../run-verification.js";
const signal = () => new AbortController().signal;
test("quotes resolve to exact original typography and offsets", () => {
  const source = "The \u201cwritten\u201d  instructions apply.";
  const range = locateSourceQuote(source, '"written" instructions');
  assert.ok(range);
  assert.equal(source.slice(...range), "\u201cwritten\u201d  instructions");
  assert.equal(locateSourceQuote("text text", "text"), undefined);
  assert.equal(locateSourceQuote("Only instructions", "Fake instructions"), undefined);
});
test("valid decision retains source identity", () => {
  const r = requestFixture(), d = validateVerification(responseFixture(r), r);
  assert.deepEqual(d.errors, []);
  assert.equal(d.decision!.elements[0].citations[0].originalRole, "primary");
});
for (const invalid of ["quote", "id", "version", "duplicate", "missing", "scope", "citation"] as const)
  test("rejects " + invalid, () => {
    const r = requestFixture(), raw = responseFixture(r);
    if (invalid === "quote")
      raw.elements[0].citations[0].quote = "An invented clause";
    if (invalid === "id")
      raw.elements[0].citations[0].evidenceId = "invented";
    if (invalid === "version")
      raw.bundleHash = "old";
    if (invalid === "duplicate")
      raw.elements.push(raw.elements[0]);
    if (invalid === "missing")
      raw.elements = [];
    if (invalid === "scope") {
      r.check.rule!.relationshipScopes = ["controller_to_processor"];
      r.bundle.passages[0].relationshipScope = "controller_to_controller";
    }
    if (invalid === "citation")
      raw.elements[0].citations = [];
    assert.ok(validateVerification(raw, r).errors.length);
  });
test("supporting evidence needs a explained reassessment and targeted second review", async () => {
  const r = requestFixture();
  r.bundle.passages[0].role = "supporting";
  const raw = responseFixture(r);
  assert.ok(validateVerification(raw, r).errors.length);
  raw.elements[0].roleReassessment = "Although retrieved as supporting, this operative sentence states the required obligation.";
  let calls = 0;
  const result = await runVerification(r, async () => { calls++; return raw; }, signal());
  assert.equal(calls, 2);
  assert.equal(result.kind, "verified");
  if (result.kind === "verified") {
    assert.deepEqual(result.decision.reviewRequired, []);
    assert.equal(result.decision.elements[0].citations[0].originalRole, "supporting");
  }
});
test("review disagreement is not resolved in favor of the more positive result", async () => {
  const r = requestFixture();
  r.bundle.passages[0].role = "supporting";
  let calls = 0;
  const result = await runVerification(r, async () => {
    const raw = responseFixture(r);
    raw.elements[0].roleReassessment = "The operative text establishes the obligation.";
    if (calls++ > 0) {
      raw.elements[0].state = "ambiguous";
      raw.elements[0].citations[0].use = "related";
    }
    return raw;
  }, signal());
  assert.equal(result.kind, "verified");
  if (result.kind === "verified")
    assert.ok(result.decision.reviewRequired.includes("semantic_disagreement"));
});
test("silence cannot establish N/A", () => {
  const r = requestFixture(), raw = responseFixture(r);
  raw.applicability = { state: "not_applicable", basis: "Not mentioned", evidenceIds: [], contextFactIds: [] };
  raw.elements[0].applicability = raw.applicability;
  raw.elements[0].state = "not_applicable";
  assert.ok(validateVerification(raw, r).errors.some(e => e.includes("ungrounded_not_applicable")));
});
test("complete passages beyond character 900 reach the model", async () => {
  const r = requestFixture();
  r.bundle.passages[0].text = "x".repeat(1000) + " Decisive text.";
  r.bundle.passages[0].range = [0, r.bundle.passages[0].text.length];
  const result = await verifyRequirement(r, async (prompt) => { assert.ok(prompt.includes("Decisive text.")); return responseFixture(r); }, signal());
  assert.equal(result.kind, "verified");
});
test("one repair only, and oversize input does not call model", async () => {
  const r = requestFixture();
  let calls = 0;
  const result = await verifyRequirement(r, async () => { calls++; return {}; }, signal());
  assert.equal(calls, 2);
  assert.equal(result.kind, "incomplete");
  const over = await verifyRequirement(r, async () => { throw Error("must not call"); }, signal(), 1);
  assert.equal(over.kind, "incomplete");
  if (over.kind === "incomplete")
    assert.equal(over.reason, "input_budget_exceeded");
});
test("context alone cannot prove an operative obligation", () => {
  const r = requestFixture();
  r.bundle.passages[0].role = "definition";
  const raw = responseFixture(r);
  raw.elements[0].roleReassessment = "It defines instructions.";
  assert.ok(validateVerification(raw, r).errors.some(e => e.includes("context_only_proof")));
});
test("grounded whole-rule N/A receives targeted review", async () => {
  const r = requestFixture();
  r.context.facts = [{ id: "exclusion", text: "The reviewed scope expressly excludes processor services." }];
  const raw = responseFixture(r);
  raw.applicability = { state: "not_applicable", basis: "Explicit scope exclusion", evidenceIds: [], contextFactIds: ["exclusion"] };
  for (const e of raw.elements) {
    e.state = "not_applicable";
    e.applicability = raw.applicability;
    e.citations = [];
  }
  let calls = 0;
  const result = await runVerification(r, async () => { calls++; return raw; }, signal());
  assert.equal(calls, 2);
  assert.equal(result.kind, "verified");
});
test("joint support preserves separate citations and rejects incompatible actors", () => {
  const r = requestFixture();
  r.bundle.passages.push({ ...r.bundle.passages[0], evidenceId: "other", nodeId: "other", role: "supporting" });
  const raw = responseFixture(r);
  raw.elements[0].citations.push({ ...raw.elements[0].citations[0], evidenceId: "other" });
  raw.elements[0].roleReassessment = "The clauses jointly establish the instruction restriction.";
  assert.equal(validateVerification(raw, r).decision?.elements[0].citations.length, 2);
  r.bundle.passages[0].relationshipScope = "controller_to_processor";
  r.bundle.passages[1].relationshipScope = "controller_to_controller";
  assert.ok(validateVerification(raw, r).errors.some(e => e.includes("incompatible_joint_scope")));
});
