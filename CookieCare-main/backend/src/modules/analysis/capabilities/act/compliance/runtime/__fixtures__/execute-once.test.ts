import assert from "node:assert/strict";
import test from "node:test";
import { requestFixture, responseFixture } from "../../__fixtures__/verification-fixture.js";
import { createRun } from "../create-run.js";
import { executeChecksOnce } from "../execute-checks-once.js";
import type { VerificationRequest } from "../../contracts/index.js";

/** Build a run over N checks, each backed by its own fixture request/bundle. A
 *  `respond(request, callNumberForCheck)` callback returns the raw model wire
 *  response; every call is counted so tests can assert the exact model-call
 *  budget of the one-call executor. */
function harness(requests: VerificationRequest[]) {
  const byCheck = new Map(requests.map(r => [r.check.checkId, r]));
  const perCheckCalls = new Map<string, number>();
  const events: Array<Record<string, unknown>> = [];
  let calls = 0;
  const make = (respond: (r: VerificationRequest, nth: number) => unknown) => {
    const run = createRun({
      analysisId: "an_test",
      checks: requests.map(r => r.check),
      context: { instruction: "Review", facts: requests[0].context.facts, questions: [] },
      complete: async (prompt: string) => {
        calls++;
        const checkId = [...byCheck.keys()].find(id => prompt.includes('"' + id + '"'))!;
        const nth = (perCheckCalls.get(checkId) ?? 0) + 1;
        perCheckCalls.set(checkId, nth);
        return respond(byCheck.get(checkId)!, nth);
      },
      emit: e => events.push(e as Record<string, unknown>),
    });
    return { run, services: { bundle: (c: { checkId: string }) => byCheck.get(c.checkId)!.bundle } };
  };
  return { make, events, totalCalls: () => calls };
}

function requests(n: number): VerificationRequest[] {
  return Array.from({ length: n }, (_, i) => requestFixture("rule." + i));
}

test("N valid checks make exactly N initial calls and N present rows", async () => {
  const rs = requests(10);
  const h = harness(rs);
  const { run, services } = h.make(r => responseFixture(r));
  await executeChecksOnce(run, services);
  assert.equal(h.totalCalls(), 10, "one call per check, no extra passes");
  assert.equal(run.ledger.outcomes.size, 10);
  assert.ok([...run.ledger.outcomes.values()].every(o => o.status === "present"));
});

test("a rule with four proof elements is still judged in a single call", async () => {
  const r = requestFixture("rule.multi");
  r.check.rule!.elements = ["a", "b", "c", "d"].map(id => ({ id, description: "Only documented instructions.", kind: "mandatory", required: true }));
  r.check.rule!.aggregation = { operator: "all", children: r.check.rule!.elements.map(e => ({ elementId: e.id })) };
  const h = harness([r]);
  const { run, services } = h.make(req => responseFixture(req));
  await executeChecksOnce(run, services);
  assert.equal(h.totalCalls(), 1);
  const outcome = [...run.ledger.outcomes.values()][0];
  assert.equal(outcome.status, "present");
});

test("one invalid response costs exactly one repair; the check is preserved", async () => {
  const rs = requests(3);
  const h = harness(rs);
  const { run, services } = h.make((r, nth) => {
    const raw = responseFixture(r);
    // The first check fails its first attempt (bad quote) and is repaired on retry.
    if (r.check.ruleId === "rule.0" && nth === 1)
      raw.elements[0].citations[0].quote = "An invented clause not in the source";
    return raw;
  });
  await executeChecksOnce(run, services);
  assert.equal(h.totalCalls(), 4, "3 initial + 1 repair");
  assert.equal(run.ledger.outcomes.size, 3);
  assert.ok([...run.ledger.outcomes.values()].every(o => o.status === "present"));
});

test("a permanently invalid check yields a preserved incomplete row, not a drop", async () => {
  const rs = requests(3);
  const h = harness(rs);
  const { run, services } = h.make(r => {
    const raw = responseFixture(r);
    if (r.check.ruleId === "rule.1")
      raw.elements[0].citations[0].quote = "Never present in the source";
    return raw;
  });
  await executeChecksOnce(run, services);
  assert.equal(h.totalCalls(), 4, "rule.1 uses both attempts, the others one each");
  assert.equal(run.ledger.outcomes.size, 3, "every check still terminal");
  const bad = [...run.ledger.outcomes.values()].find(o => o.check.ruleId === "rule.1")!;
  assert.equal(bad.kind, "incomplete");
  assert.equal(bad.status, "verification_incomplete");
});

test("a borderline verdict is resampled and the majority wins", async () => {
  const r = requestFixture("rule.borderline");
  r.check.rule!.elements = ["a", "b"].map(id => ({ id, description: "Only documented instructions.", kind: "mandatory" as const, required: true }));
  r.check.rule!.aggregation = { operator: "all", children: [{ elementId: "a" }, { elementId: "b" }] };
  const h = harness([r]);
  const { run, services } = h.make((req, nth) => {
    const raw = responseFixture(req); // both elements supported → present
    if (nth <= 2) { // first two samples: element "b" absent → partial (borderline)
      const b = raw.elements.find(e => e.elementId === "b")!;
      b.state = "not_located"; b.citations = [];
    }
    return raw;
  });
  await executeChecksOnce(run, services);
  assert.equal(h.totalCalls(), 3, "three self-consistency samples for the borderline check");
  assert.equal([...run.ledger.outcomes.values()][0].status, "partial", "majority (2 of 3) wins");
});

test("a confident verdict is not resampled (stays one call)", async () => {
  const rs = requests(4);
  const h = harness(rs);
  const { run, services } = h.make(req => responseFixture(req)); // all present
  await executeChecksOnce(run, services);
  assert.equal(h.totalCalls(), 4, "present is confident — no resampling");
});

test("the one-call executor never runs additional investigation, reverify or second-review", async () => {
  const rs = requests(4);
  const h = harness(rs);
  const { run, services } = h.make(r => responseFixture(r));
  await executeChecksOnce(run, services);
  assert.ok(!h.events.some(e => /additional_investigation|cross_review|review\.started|evidence_retry/.test(String(e.event))));
  const reconciliation = h.events.find(e => e.event === "compliance.run.reconciliation")!;
  assert.deepEqual(reconciliation.missingRequirementIds, []);
  assert.equal(reconciliation.terminal, 4);
});
