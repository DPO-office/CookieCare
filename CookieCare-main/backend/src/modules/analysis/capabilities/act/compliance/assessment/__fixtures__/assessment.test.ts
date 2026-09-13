import assert from "node:assert/strict";
import test from "node:test";
import { requestFixture, responseFixture } from "../../__fixtures__/verification-fixture.js";
import { validateVerification } from "../../verification/index.js";
import { assessRequirement, lockOutcome, aggregateElements } from "../index.js";
import type { VerificationResult } from "../../contracts/index.js";
function setup() { const r = requestFixture(); const result: VerificationResult = { kind: "verified", attempts: 1, decision: validateVerification(responseFixture(r), r).decision! }; return { r, result }; }
test("Assess and Lock use exactly the same aggregation", () => {
  const { r, result } = setup();
  assert.equal(assessRequirement(r, result), "present");
  assert.equal(lockOutcome(r, result).status, "present");
  result.decision.elements[0].state = "not_located";
  result.decision.elements[0].citations = [];
  assert.equal(assessRequirement(r, result), "gap");
  assert.equal(lockOutcome(r, result).status, "gap");
  r.bundle.executionStatus = "unknown";
  assert.equal(lockOutcome(r, result).status, "cannot_determine");
});
test("invalid lock preserves an explicit outcome and related evidence", () => {
  const { r, result } = setup();
  result.decision.elements[0].citations[0].quote = "fabricated";
  const o = lockOutcome(r, result);
  assert.equal(o.kind, "incomplete");
  assert.equal(o.lockedAssessmentId, undefined);
  assert.equal(o.evidence.length, 1);
});
test("dependency materiality affects only relevant elements", () => {
  const { r, result } = setup();
  r.bundle.dependencies = [{ id: "dep", sourceNodeId: "node", targetNodeIds: [], state: "external", effect: "supplements" }];
  result.decision.dependencies = [{ id: "dep", elementIds: ["instructions"], materiality: "material", reason: "Required annex" }];
  assert.equal(assessRequirement(r, result), "cannot_determine");
  result.decision.dependencies[0].materiality = "immaterial";
  assert.equal(assessRequirement(r, result), "present");
  result.decision.dependencies[0].materiality = "unknown";
  assert.equal(assessRequirement(r, result), "cannot_determine");
});
test("empty applicable groups never imply Present", () => {
  const { r, result } = setup();
  result.decision.elements[0].applicability.state = "not_applicable";
  result.decision.elements[0].state = "not_applicable";
  assert.equal(assessRequirement(r, result), "cannot_determine");
});
test("generic all/any nesting supports alternatives without law-specific IDs", () => {
  const { result } = setup();
  const e = result.decision.elements[0];
  const elements = [e, { ...e, elementId: "other", state: "not_located" as const }];
  assert.equal(aggregateElements({ operator: "any", children: [{ elementId: "instructions" }, { elementId: "other" }] }, elements).state, "satisfied");
  assert.equal(aggregateElements({ operator: "all", children: [{ elementId: "instructions" }, { elementId: "other" }] }, elements).state, "missing");
});
test("material limitations survive reviewer agreement and block Present",()=>{
  const {r,result}=setup();
  result.decision.elements[0].limitations=[{description:"An unresolved exception limits the operative instruction duty.",evidenceIds:["span"],materiality:"material"}];
  assert.equal(assessRequirement(r,result),"cannot_determine");
  result.decision.elements[0].limitations[0].materiality="immaterial";
  assert.equal(assessRequirement(r,result),"present");
});
test("optional elements outside aggregation do not create gaps",()=>{
  const {r,result}=setup(),e=result.decision.elements[0];
  r.check.rule!.elements.push({id:"optional",description:"Optional confirmation.",kind:"optional"});
  result.decision.elements.push({...e,elementId:"optional",state:"not_located",citations:[]});
  assert.equal(assessRequirement(r,result),"present");
});
test("unknown required conditional applicability cannot produce Present",()=>{
  const {r,result}=setup(),e=result.decision.elements[0];
  r.check.rule!.elements.push({id:"conditional",description:"Notify if required disclosure occurs.",kind:"conditional",applicabilityGuidance:"Only where the disclosure condition is established."});
  r.check.rule!.aggregation={operator:"all",children:[{elementId:"instructions"},{elementId:"conditional"}]};
  result.decision.elements.push({...e,elementId:"conditional",state:"ambiguous",citations:[],applicability:{...e.applicability,state:"unknown"}});
  assert.equal(assessRequirement(r,result),"cannot_determine");
});
