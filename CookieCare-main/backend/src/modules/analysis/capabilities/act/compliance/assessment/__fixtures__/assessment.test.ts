import assert from "node:assert/strict";
import test from "node:test";
import { requestFixture, responseFixture } from "../../__fixtures__/verification-fixture.js";
import { validateVerification } from "../../verification/index.js";
import { assessRequirement, lockOutcome, aggregateElements } from "../index.js";
import { buildExplanation } from "../build-explanation.js";
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
  assert.equal(assessRequirement(r, result), "partial");
  result.decision.dependencies[0].materiality = "immaterial";
  assert.equal(assessRequirement(r, result), "present");
  result.decision.dependencies[0].materiality = "unknown";
  assert.equal(assessRequirement(r, result), "partial");
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
  assert.equal(assessRequirement(r,result),"partial");
  result.decision.elements[0].limitations[0].materiality="immaterial";
  assert.equal(assessRequirement(r,result),"present");
});
test("optional elements outside aggregation do not create gaps",()=>{
  const {r,result}=setup(),e=result.decision.elements[0];
  r.check.rule!.elements.push({id:"optional",description:"Optional confirmation.",kind:"optional"});
  result.decision.elements.push({...e,elementId:"optional",state:"not_located",citations:[]});
  assert.equal(assessRequirement(r,result),"present");
});
test("recommended actions reflect the cause, not one generic phrase",()=>{
  const {r,result}=setup();
  const gap=buildExplanation(r,result,"gap").recommendedAction;
  const partial=buildExplanation(r,result,"partial").recommendedAction;
  const incomplete=buildExplanation(r,result,"verification_incomplete").recommendedAction;
  assert.notEqual(gap,partial);
  assert.notEqual(gap,incomplete);
  assert.ok(!/Address the identified contractual shortfall/.test(`${gap} ${partial}`));
  // A material unresolved dependency drives an "obtain the material" action.
  result.decision.dependencies=[{id:"dep",elementIds:["instructions"],materiality:"material",reason:"annex"}];
  assert.match(buildExplanation(r,result,"partial").recommendedAction,/Obtain and review the referenced material/);
});
test("recommended actions use the remediation authored for each failed verification element",()=>{
  const {r,result}=setup();
  r.check.rule!.elements[0].remediationGuidance="Give the controller an express choice between return and deletion of personal data.";
  result.decision.elements[0].state="not_located";
  result.decision.elements[0].citations=[];
  const action=buildExplanation(r,result,"gap").recommendedAction;
  assert.equal(action,"Give the controller an express choice between return and deletion of personal data.");
  assert.doesNotMatch(action,/amend the reviewed provisions|identified shortfall/i);
});
test("a role reassessment only forces judgment when it is the element's sole support",()=>{
  const {r,result}=setup();
  const el=result.decision.elements[0]; // "instructions", proven by a primary citation
  // Independent primary proof present → the reassessment cannot change the verdict → stays present (no flip).
  result.decision.reviewRequired=["role_reassessment:instructions"];
  assert.equal(assessRequirement(r,result),"present");
  // Now the only proof is a reassessed (supporting) passage → load-bearing → judgment_required.
  el.citations.forEach(c=>{ if(c.use==="proof") c.originalRole="supporting"; });
  assert.equal(assessRequirement(r,result),"judgment_required");
  // A review that could not run at all remains cannot_determine.
  result.decision.reviewRequired=["review_unavailable"];
  assert.equal(assessRequirement(r,result),"cannot_determine");
});
test("unknown required conditional applicability cannot produce Present",()=>{
  const {r,result}=setup(),e=result.decision.elements[0];
  r.check.rule!.elements.push({id:"conditional",description:"Notify if required disclosure occurs.",kind:"conditional",applicabilityGuidance:"Only where the disclosure condition is established."});
  r.check.rule!.aggregation={operator:"all",children:[{elementId:"instructions"},{elementId:"conditional"}]};
  result.decision.elements.push({...e,elementId:"conditional",state:"ambiguous",citations:[],applicability:{...e.applicability,state:"unknown"}});
  assert.equal(assessRequirement(r,result),"partial");
});
test("a mandatory shortfall is a gap even beside an untriggered conditional element",()=>{
  const {r,result}=setup(),e=result.decision.elements[0];
  // The mandatory element is searched and not established; the conditional
  // element's trigger is unknown. The definite shortfall is the gap.
  result.decision.elements[0].state="not_located";result.decision.elements[0].citations=[];
  r.check.rule!.elements.push({id:"conditional",description:"Notify if automated decisions occur.",kind:"conditional",applicabilityGuidance:"Only where automated decision-making is established."});
  r.check.rule!.aggregation={operator:"all",children:[{elementId:"instructions"},{elementId:"conditional"}]};
  result.decision.elements.push({...e,elementId:"conditional",state:"not_located",citations:[],applicability:{...e.applicability,state:"unknown"}});
  assert.equal(assessRequirement(r,result),"gap");
});

test("Article 28(3)(f) multi-element partial assessment: missing 1 of 3 mandatory elements produces partial with actionable explanation", () => {
  const { r, result } = setup();
  const e = result.decision.elements[0];
  r.check.ruleId = "gdpr.art28.3.f";
  r.check.rule = {
    ruleId: "gdpr.art28.3.f",
    title: "Processor assistance with security, breach, DPIA, and consultation duties",
    citation: "Article 28(3)(f)",
    version: "1.1.0",
    hash: "hash-art28-3-f",
    relationshipScopes: [],
    elements: [
      { id: "security_assistance", description: "Assistance with Article 32 security", kind: "mandatory", remediationGuidance: "Add an Article 32 assistance clause." },
      { id: "breach_assistance", description: "Assistance with Articles 33-34 breach notification", kind: "mandatory", remediationGuidance: "Add breach notification assistance." },
      { id: "dpia_assistance", description: "Assistance with Articles 35-36 DPIAs", kind: "mandatory", remediationGuidance: "Add DPIA assistance." },
    ],
    aggregation: {
      operator: "all",
      children: [
        { elementId: "security_assistance" },
        { elementId: "breach_assistance" },
        { elementId: "dpia_assistance" },
      ],
    },
  };
  result.decision.ruleHash = "hash-art28-3-f";
  result.decision.elements = [
    {
      ...e,
      elementId: "security_assistance",
      state: "not_located",
      citations: [],
      establishedFact: "",
      missingProof: "Controller-side Article 32 security assistance is not established.",
    },
    {
      ...e,
      elementId: "breach_assistance",
      state: "supported",
      establishedFact: "Breach notification assistance is established within 12 hours.",
      missingProof: "",
    },
    {
      ...e,
      elementId: "dpia_assistance",
      state: "supported",
      establishedFact: "DPIA and prior consultation assistance is established.",
      missingProof: "",
    },
  ];

  // Incomplete demo anchor search should NOT abort to cannot_determine when substantive review succeeded
  r.bundle.executionStatus = "incomplete";
  r.bundle.coverageReasons = ["demo_anchor_not_found:security:1"];

  const status = assessRequirement(r, result);
  assert.equal(status, "partial");

  const locked = lockOutcome(r, result);
  assert.equal(locked.status, "partial");
  assert.equal(locked.kind, "assessment");
  assert.match(locked.explanation.whatTheDocumentProvides, /Breach notification assistance/);
  assert.match(locked.explanation.whatIsMissingOrUnclear, /Article 32 security assistance is not established/);
  assert.equal(locked.explanation.recommendedAction, "Add an Article 32 assistance clause.");
});

test("unresolved dependency causes cannot_determine with Cannot determine label and explicit dependency in explanation", () => {
  const { r, result } = setup();
  const e = result.decision.elements[0];
  r.check.rule = {
    ruleId: "dep_rule",
    title: "Security Measures in Schedule",
    citation: "Article 28(3)(c)",
    version: "1.0.0",
    hash: "hash-dep",
    relationshipScopes: [],
    elements: [
      { id: "sec_measures", description: "Security measures", kind: "mandatory" },
    ],
    aggregation: { elementId: "sec_measures" },
  };
  result.decision.ruleHash = "hash-dep";
  result.decision.elements = [
    {
      ...e,
      elementId: "sec_measures",
      state: "unresolved_dependency",
      citations: [],
      establishedFact: "",
      missingProof: "Security measures point to missing Schedule 4.",
    },
  ];
  result.decision.dependencies = [
    { id: "Schedule_4", elementIds: ["sec_measures"], materiality: "material", reason: "Schedule 4 is not supplied in the document bundle." },
  ];

  const status = assessRequirement(r, result);
  assert.equal(status, "cannot_determine");

  const locked = lockOutcome(r, result);
  assert.equal(locked.status, "cannot_determine");
  assert.match(locked.explanation.conclusion, /Schedule_4/);
  assert.match(locked.explanation.recommendedAction, /Obtain and review the referenced material/);
});

