import assert from "node:assert/strict";
import test from "node:test";
import { requestFixture, responseFixture } from "./verification-fixture.js";
import { createRun } from "../runtime/create-run.js";
import { executeChecks } from "../runtime/execute-checks.js";
import { executionBudget, runBudgeted } from "../runtime/budget.js";
import { CheckLedger } from "../runtime/check-ledger.js";
import { compileComplianceRule } from "../../../../skills/runtime/catalog/compile-compliance-rule.js";
import { getRegistryApi } from "../../../../skills/runtime/catalog/registry.js";
import { finalizeRegimeRuleContracts } from "../../../../skills/runtime/catalog/rule-contract-helpers.js";
import { checksFromState, bundleForCheck } from "../adapters/analysis-state.js";
import type { AnalysisState } from "../../../../models/analysis-state.js";
test("all seven regime baselines compile using their own proof element identities",()=>{
  const skills=getRegistryApi().getByAxis("regime");assert.equal(skills.length,7);
  for(const skill of skills)for(const r of skill.regimeRules){
    const compiled=compileComplianceRule(skills,skill.skillId,r.ruleId);
    assert.deepEqual(compiled.elements.map(e=>e.id),r.investigation!.proofElements.map(e=>e.id));
    assert.equal(compiled.reviewStatus,"authored");
  }
  assert.throws(()=>compileComplianceRule(skills,skills[0].skillId,"invented"),/baseline_unavailable/);
});
test("ten checks produce ten outcomes even when six calls fail",async()=>{
  const requests=Array.from({length:10},(_,i)=>requestFixture("rule."+i));
  const run=createRun({analysisId:"coverage",checks:requests.map(r=>r.check),context:requests[0].context,emit:()=>{},
    complete:async prompt=>{const r=requests.find(r=>prompt.includes(r.check.checkId))!;if(Number(r.check.ruleId.split(".")[1])<6)throw Error("model failure");return responseFixture(r);}});
  await executeChecks(run,{bundle:c=>requests.find(r=>r.check.checkId===c.checkId)!.bundle});
  assert.equal(run.ledger.outcomes.size,10);assert.equal([...run.ledger.outcomes.values()].filter(o=>o.kind==="incomplete").length,6);
  assert.deepEqual(run.ledger.reconcile(),{missing:[],unexpected:[],duplicates:[]});
});
test("stage deadline preserves unfinished and skipped checks",async()=>{
  const requests=Array.from({length:10},(_,i)=>requestFixture("timeout."+i));
  const run=createRun({analysisId:"timeout",checks:requests.map(r=>r.check),context:requests[0].context,emit:()=>{},budget:{concurrency:4,stageMs:15},complete:()=>new Promise(()=>{})});
  await executeChecks(run,{bundle:c=>requests.find(r=>r.check.checkId===c.checkId)!.bundle});
  assert.equal(run.ledger.outcomes.size,10);assert.ok([...run.ledger.outcomes.values()].every(o=>o.kind==="incomplete"));
});
test("shared deadline is explicit opt-in and preserves concurrency",()=>{
  assert.deepEqual(executionBudget({}),{concurrency:6,stageMs:null});
  assert.deepEqual(executionBudget({COMPLIANCE_VERIFICATION_DISABLE_TIME_BUDGET:"true",ANALYSIS_COMPLIANCE_SIDE_CHANNEL_STAGE_BUDGET_MS:"100"}),{concurrency:6,stageMs:null});
  assert.deepEqual(executionBudget({COMPLIANCE_VERIFICATION_DISABLE_TIME_BUDGET:"false",ANALYSIS_COMPLIANCE_SIDE_CHANNEL_STAGE_BUDGET_MS:"100"}),{concurrency:6,stageMs:100});
});
test("disabled deadline lets all fourteen checks finish after simulated 45 seconds",async()=>{
  const requests=Array.from({length:14},(_,i)=>requestFixture("unlimited."+i));
  let clock=0,calls=0;
  const run=createRun({analysisId:"unlimited",checks:requests.map(r=>r.check),context:requests[0].context,emit:()=>{},
    now:()=>clock,budget:{concurrency:4,stageMs:null},complete:async prompt=>{
      clock+=46000;calls++;
      return responseFixture(requests.find(r=>prompt.includes(JSON.stringify(r.check.checkId)))!);
    }});
  await executeChecks(run,{bundle:c=>requests.find(r=>r.check.checkId===c.checkId)!.bundle});
  assert.equal(calls,14);assert.equal(run.ledger.outcomes.size,14);
  assert.ok([...run.ledger.outcomes.values()].every(o=>o.kind==="assessment"));
});
test("disabled deadline retains worker limits and isolates provider failures",async()=>{
  let active=0,peak=0;
  const values=await runBudgeted(Array.from({length:14},(_,i)=>i),{concurrency:4,stageMs:null},async i=>{
    active++;peak=Math.max(peak,active);
    try { await new Promise(resolve=>setTimeout(resolve,1));if(i===3)throw Error("provider unavailable");return i; }
    finally { active--; }
  },()=>-1);
  assert.equal(peak,4);assert.equal(active,0);assert.equal(values.length,14);
  assert.equal(values[3],-1);assert.equal(values[13],13);
});
test("ledger rejects duplicates",()=>{const r=requestFixture();assert.throws(()=>new CheckLedger([r.check,r.check]));});
test("unchanged evidence stops the additional investigation loop",async()=>{
  const r=requestFixture();r.bundle.executionStatus="incomplete";let investigations=0;
  const run=createRun({analysisId:"retry",checks:[r.check],context:r.context,emit:()=>{},complete:async()=>{const raw=responseFixture(r);raw.elements[0].state="not_located";raw.elements[0].citations=[];return raw;}});
  await executeChecks(run,{bundle:()=>r.bundle,investigate:async()=>{investigations++;return r.bundle;}});
  assert.equal(investigations,1);assert.equal(run.ledger.outcomes.size,1);
});
test("multiple documents do not overwrite; repeated facets share a check",()=>{
  const skill=getRegistryApi().getByAxis("regime")[0], rule=skill.regimeRules[0];
  const state={activeSkills:[skill],workspace:{documents:[{docId:"a",fullText:"A"},{docId:"b",fullText:"B"}]},
    plan:{complianceRequirementResolution:{selections:[{skillId:skill.skillId,ruleId:rule.ruleId,facetId:"one",reason:"explicit"},{skillId:skill.skillId,ruleId:rule.ruleId,facetId:"two",reason:"explicit"}]},
      workUnits:["a","b"].map(docId=>({tool:"run_compliance_pipeline",input:{docId,requirementIds:[rule.ruleId]}}))}} as unknown as AnalysisState;
  const checks=checksFromState(state);assert.equal(checks.length,2);assert.equal(checks[0].facetIds.length,2);assert.notEqual(checks[0].checkId,checks[1].checkId);
});
test("missing bundle coverage remains unknown/incomplete, not a gap",()=>{
  const r=requestFixture(),state={workspace:{documents:[]}} as unknown as AnalysisState;
  const bundle=bundleForCheck(state,r.check);assert.equal(bundle.executionStatus,"incomplete");assert.deepEqual(bundle.passages,[]);
});
test("selected rules survive absent execution bindings without an invented document scope",()=>{
  const skill=getRegistryApi().getByAxis("regime")[0], [first,second]=skill.regimeRules;
  const state={activeSkills:[skill],workspace:{documents:[{docId:"a",fullText:"A"}]},
    plan:{complianceRequirementResolution:{selections:[first,second].map(rule=>({skillId:skill.skillId,ruleId:rule.ruleId,facetId:rule.ruleId,reason:"explicit"}))},
      workUnits:[{tool:"run_compliance_pipeline",input:{docId:"a",requirementIds:[first.ruleId,"invented.rule"]}}]}} as unknown as AnalysisState;
  const checks=checksFromState(state);
  assert.equal(checks.length,3);
  const unbound=checks.find(c=>c.ruleId===second.ruleId)!;
  assert.equal(unbound.baselineError,"review_scope_unavailable");assert.deepEqual(unbound.documents,[]);
  assert.ok(checks.find(c=>c.ruleId==="invented.rule")!.baselineError);
  state.plan!.workUnits=[];
  assert.equal(checksFromState(state).length,2);
});
test("packages cannot synthesize a missing atomic proof checklist",()=>{
  const skill=structuredClone(getRegistryApi().getByAxis("regime")[1]);
  skill.regimeRules[0].investigation=undefined;
  const materialized=finalizeRegimeRuleContracts(skill,{instrument:"Fixture"});
  assert.equal(materialized.regimeRules[0].investigation,undefined);
  assert.throws(()=>compileComplianceRule([materialized],materialized.skillId,materialized.regimeRules[0].ruleId),/baseline_unavailable/);
});
