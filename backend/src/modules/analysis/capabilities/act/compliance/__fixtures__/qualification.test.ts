import assert from "node:assert/strict";
import test from "node:test";
import { qualifyOutcomeEvents } from "../diagnostics/index.js";
test("qualification requires every check, including explicit baseline failures",()=>{
 const events=[{event:"compliance.checks.expected",checkIds:["a","b"]},
 {event:"compliance.outcome.rendered",checkId:"a",outcomeId:"oa",kind:"assessment",status:"present",lockedAssessmentId:"la"},
 {event:"compliance.outcome.rendered",checkId:"b",outcomeId:"ob",kind:"incomplete",status:"verification_incomplete"},
 {event:"compliance.outcome.reconciliation",expectedCheckIds:["a","b"],actualCheckIds:["a","b"]}];
 assert.equal(qualifyOutcomeEvents(events).pass,true);
 assert.equal(qualifyOutcomeEvents(events.filter(e=>e.checkId!=="b")).pass,false);
 assert.equal(qualifyOutcomeEvents([...events,events[1]]).pass,false);
 assert.equal(qualifyOutcomeEvents(events.map(e=>e.checkId==="b"?{...e,status:"gap"}:e)).pass,false);
});

