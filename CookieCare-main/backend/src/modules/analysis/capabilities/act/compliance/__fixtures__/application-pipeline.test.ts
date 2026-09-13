import assert from "node:assert/strict";
import test from "node:test";
import { executeCompliancePipeline } from "../runtime/index.js";
import { getRegistryApi } from "../../../../skills/runtime/catalog/registry.js";
import { checksFromState, bundleForCheck, outcomesToSnapshot } from "../adapters/index.js";
import { lockOutcome } from "../assessment/index.js";
import { qualifyOutcomeEvents, type OutcomeEvent } from "../diagnostics/index.js";
import type { AnalysisState } from "../../../../models/analysis-state.js";
import type { InvestigationRunResult } from "../investigation/index.js";
import { verificationMode } from "../runtime/rollout.js";
import { assessRequirement as assessPreviousRequirement, draftExplanation } from "../legacy/assess-compliance-requirements.js";
import { elementSchemaFor } from "../legacy/compliance-schema-registry.js";
import { lockAssessment } from "../legacy/lock-compliance-assessments.js";
function stateFixture():AnalysisState {
 const skill=getRegistryApi().getByAxis("regime").find(s=>s.skillId.endsWith("/gdpr"))!;
 const ids=["gdpr.art12.3","gdpr.art15","gdpr.art16","gdpr.art17","gdpr.art18","gdpr.art19","gdpr.art20","gdpr.art21","gdpr.art22","gdpr.art28.3.e"];
 return {request:{sessionId:"integration",instruction:"Review the ten selected requirements"},activeSkills:[skill],
 workspace:{documents:[{docId:"document",title:"DPA",fullText:"The processor assists with requests."}]},
 plan:{workUnits:[{tool:"run_compliance_pipeline",input:{docId:"document",requirementIds:ids}}],
 complianceRequirementResolution:{facets:[{facetId:"rights",sourceText:"Review rights",legalReferences:[],actors:[],actions:[],objects:[]}],
 selections:ids.map(ruleId=>({skillId:skill.skillId,ruleId,facetId:"rights",reason:"Explicit scope",source:"exact_citation",confidence:1,required:true})),unresolved:[],complete:true}}} as unknown as AnalysisState;
}
const emptyInvestigation:InvestigationRunResult={bundlesByRequirement:new Map(),resolutionIssues:[],timings:{indexMs:0,retrievalMs:0,reviewMs:0,expansionMs:0,totalMs:0}};
test("previous verification is default; archived modes require explicit selection", () => {
 assert.equal(verificationMode({}), "legacy");
 for (const mode of ["legacy", "shadow", "canonical"] as const)
   assert.equal(verificationMode({ COMPLIANCE_VERIFICATION_MODE: mode }), mode);
 assert.throws(() => verificationMode({ COMPLIANCE_VERIFICATION_MODE: "invalid" }));
});

test("restores previous aggregation without the refactor's blanket Cannot determine override", () => {
 const schema = elementSchemaFor("art21_objection")!;
 const ids = schema.elements.map(e => e.elementId);
 const matrix = {
   requirementId: "art21_objection", bundleId: "fixture", schemaVersion: schema.version,
   reviewStatus: schema.reviewStatus, expectedElementIds: ids, returnedElementIds: ids,
   missingElementIds: [], estimatedTokens: 0,
   elements: ids.map(elementId => ({elementId, state: "supported" as const, evidenceSpanIds: ["span"],
     quotes: [], scope: {}, establishedFact: "Recorded supported element", gapDescription: "", contribution: "individual" as const})),
 };
 const input = {requirementId: matrix.requirementId, schema, matrix, unresolvedDependencyCount: 0};
 assert.equal(assessPreviousRequirement({...input, investigationComplete: false}).status, "present");
 assert.equal(assessPreviousRequirement({...input, investigationComplete: true}).status, "present");
 const partial = {...matrix, elements: matrix.elements.map((e, i) => i === 0 ? e : {...e, state: "not_located" as const, evidenceSpanIds: []})};
 assert.equal(assessPreviousRequirement({...input, matrix: partial, investigationComplete: false}).status, "partial");
 const missing = {...matrix, elements: matrix.elements.map(e => ({...e, state: "not_located" as const, evidenceSpanIds: []}))};
 const assessment = assessPreviousRequirement({...input, matrix: missing, investigationComplete: false});
 assert.equal(assessment.status, "gap");
 const locked = lockAssessment({
   state: stateFixture(), requirementId: matrix.requirementId, canonicalKey: schema.canonicalKey,
   schema, matrix: missing, assessment, explanation: draftExplanation(assessment, missing, schema),
   bundle: {bundleId: "fixture", requirementId: matrix.requirementId, items: [], partitions: [], exclusions: [], dependencies: [], estimatedTokens: 0},
   documentIds: ["document"], duplicateCanonicalKeys: new Set(),
 });
 assert.equal(locked.kind, "rejected");
 if (locked.kind === "rejected") {
   assert.ok(locked.reasonCodes.includes("GAP_WITHOUT_COMPLETENESS_BASIS"));
   assert.ok(!locked.reasonCodes.includes("STATUS_AGGREGATION_MISMATCH"));
 }
 assert.equal(assessPreviousRequirement({...input, investigationComplete: false,
   matrix: {...matrix, missingElementIds: [ids[0]]}}).status, "verification_incomplete");
});

test("default previous path never runs multi-pass verification or additional investigation", async () => {
 const state = stateFixture(), events: OutcomeEvent[] = [];
 let investigations = 0, previousCalls = 0, multiPassCalls = 0;
 const text = state.workspace.documents[0].fullText;
 const checks = checksFromState(state);
 const bundles = checks.map(check => ({
   bundleId: "bundle:" + check.checkId, requirementId: check.ruleId, packageId: "rule:" + check.skillId,
   documentId: "document", passages: [{ unitId: "span", nodeId: "span", documentId: "document", role: "primary" as const,
     rawText: text, sourceRange: [0, text.length] as [number, number], structuralPath: "clause.1",
     contributesToElementIds: [], confidence: 1, reason: "Test evidence", retrievalChannels: [], matchedQueries: [] }],
   coveredElementIds: [], unresolvedElementIds: [], dependencies: [], exclusions: [], investigationComplete: true,
   executionStatus: "complete" as const, coverageReasons: [], coverageIssues: [], incompleteReasons: [], candidateCount: 1,
   retrievalChannelCounts: {exact: 1, sparse: 0, dense: 0}, candidateProvenance: [],
 }));
 const investigation = {...emptyInvestigation, bundlesByRequirement: new Map(bundles.map(b => [b.requirementId, b]))};
 const out = await executeCompliancePipeline(state, {
   mode: verificationMode({}),
   investigate: async () => { investigations++; return investigation; },
   legacy: async (_state, supplied) => { previousCalls++; assert.equal(supplied, investigation); return undefined; },
   complete: async () => { multiPassCalls++; throw new Error("Archived verifier must not run"); },
   emit: event => events.push(event),
 });
 assert.equal(investigations, 1);
 assert.equal(previousCalls, 1);
 assert.equal(multiPassCalls, 0);
 assert.equal(out.complianceReportSnapshot!.rows.length, 10);
 assert.equal(qualifyOutcomeEvents(events).pass, true);
 assert.ok(!events.some(e => /additional_investigation|verification\.review\.started|verification\.attempt\.started/.test(e.event)));
 const policy = events.find(e => e.event === "compliance.verification.execution_policy")!;
 assert.equal(policy.engine, "previous");
 assert.equal(policy.archivedMultiPassEnabled, false);
 assert.equal(policy.verificationEvidenceRetryLimit, 0);
});
for(const mode of ["legacy","shadow","canonical"] as const)test(mode+" preserves all expected outcomes through report handoff",async()=>{
 const state=stateFixture(),events:OutcomeEvent[]=[];
 const out=await executeCompliancePipeline(state,{mode,investigate:async()=>emptyInvestigation,complete:async()=>{throw Error("simulated provider outage");},legacy:async()=>undefined,emit:e=>events.push(e)});
 assert.equal(out.complianceReportSnapshot!.version,2);assert.equal(out.complianceReportSnapshot!.rows.length,10);
 assert.equal(qualifyOutcomeEvents(events).pass,true);
 assert.ok(out.complianceReportSnapshot!.rows.every(r=>r.status==="verification_incomplete" && !r.lockedAssessmentId));
});
test("metadata and whole-document changes version the bundle",()=>{
 const state=stateFixture(),check=checksFromState(state)[0];
 const bundle=bundleForCheck(state,check);
 const next=bundleForCheck(state,{...check,documents:[{documentId:"document",hash:"new-source-version"}]});
 assert.notEqual(bundle.hash,next.hash);
 const withSource={bundleId:"source",requirementId:check.ruleId,packageId:"rule:"+check.skillId,documentId:"document",passages:[],coveredElementIds:[],unresolvedElementIds:[],dependencies:[],exclusions:[],
 investigationComplete:true,executionStatus:"complete" as const,coverageReasons:[],incompleteReasons:[],candidateCount:0,retrievalChannelCounts:{exact:0,sparse:0,dense:0},candidateProvenance:[]};
 assert.notEqual(bundleForCheck(state,check,withSource).hash,bundleForCheck(state,check,{...withSource,coverageReasons:["budget_omission"]}).hash);
});
test("failed event sinks cannot suppress outcomes",async()=>{
 const state=stateFixture();
 await executeCompliancePipeline(state,{mode:"canonical",investigate:async()=>emptyInvestigation,complete:async()=>{throw Error("outage");},emit:()=>{throw Error("log unavailable");}});
 assert.equal(state.complianceReportSnapshot!.rows.length,10);
});
test("unavailable baseline remains an explicit row",()=>{
 const state=stateFixture(),check=checksFromState(state)[0];check.rule=undefined;check.baselineError="baseline_unavailable";
 const outcome=lockOutcome({check,bundle:bundleForCheck(state,check),context:{instruction:"review",questions:[],facts:[]}},
 {kind:"incomplete",reason:"baseline_unavailable",errors:[],attempts:0});
 const snapshot=outcomesToSnapshot(state,[outcome]);assert.equal(snapshot.rows[0].outcomeKind,"incomplete");assert.equal(snapshot.rows[0].lockedAssessmentId,undefined);
});
