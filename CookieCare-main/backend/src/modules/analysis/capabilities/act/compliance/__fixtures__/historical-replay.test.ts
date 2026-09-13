import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { requestFixture } from "./verification-fixture.js";
import { createRun } from "../runtime/create-run.js";
import { executeChecks } from "../runtime/execute-checks.js";
import { outcomesToSnapshot } from "../adapters/report-snapshot.js";
import { adaptPersistedSnapshot } from "../adapters/persisted-snapshot.js";
import { defaultCompliancePresentationPlan, deterministicComplianceDraft, renderComplianceMarkdown, validateComplianceDraft } from "../../../reporting/compliance-presentation.js";
import type { AnalysisState } from "../../../../models/analysis-state.js";
import type { CompliancePresentationMode } from "../../../../models/compliance-report.js";
const historical=JSON.parse(readFileSync(new URL("./historical-dsr-v1.json",import.meta.url),"utf8")) as {
 requirements:Array<{requirementId:string;assessment:string;rejection?:string[];rendered?:string;bundle:{items:Array<{spanId:string;quotedText:string;charRange:[number,number];structuralPath:string;evidenceRole:"supporting"|"primary";scope:{documentId:string}}>;incompleteReasons:string[]}}>;
};
test("frozen DSR record characterizes ten assessments, six rejected locks, four old rows",()=>{
 assert.equal(historical.requirements.length,10);
 assert.equal(historical.requirements.filter(r=>r.assessment).length,10);
 assert.equal(historical.requirements.filter(r=>r.rejection?.includes("GAP_WITHOUT_COMPLETENESS_BASIS")).length,6);
 assert.equal(historical.requirements.filter(r=>r.rendered).length,4);
});
test("historical evidence survives unavailable semantic verification in all report modes",async()=>{
 const requests=historical.requirements.map(h=>{
  const r=requestFixture(h.requirementId);r.check.rule!.title="Review "+h.requirementId;
  r.bundle.passages=h.bundle.items.map(p=>({evidenceId:p.spanId,nodeId:p.spanId,documentId:p.scope.documentId,text:p.quotedText,range:p.charRange,path:p.structuralPath,
    role:p.evidenceRole??"supporting",relationshipScope:"unspecified",contributesToElementIds:[],reason:"Archived investigation",confidence:1}));
  r.check.documents=[{documentId:h.bundle.items[0]?.scope.documentId??"document",hash:"historical"}];
  r.bundle.executionStatus="unknown";r.bundle.coverageReasons=h.bundle.incompleteReasons;return r;
 });
 const run=createRun({analysisId:"historical",checks:requests.map(r=>r.check),context:requests[0].context,emit:()=>{},complete:async()=>{throw Error("Historical replay does not fabricate fresh model judgments");}});
 await executeChecks(run,{bundle:c=>requests.find(r=>r.check.checkId===c.checkId)!.bundle});
 const outcomes=[...run.ledger.outcomes.values()];assert.equal(outcomes.length,10);assert.ok(outcomes.every(o=>o.evidence.length>0));
 const state={request:{instruction:"Review all ten rights requirements"},workspace:{documents:[{docId:requests[0].check.documents[0].documentId,title:"Reviewed agreement"}]}} as unknown as AnalysisState;
 const snapshot=outcomesToSnapshot(state,outcomes);
 for(const mode of ["layered","short","detailed","narrative","table_only"] as CompliancePresentationMode[]){
   const plan=defaultCompliancePresentationPlan(snapshot,mode),draft=deterministicComplianceDraft(snapshot,plan);
   assert.equal(draft.rows.length,10);assert.deepEqual(validateComplianceDraft(draft,snapshot,plan),[]);
   const markdown=renderComplianceMarkdown(snapshot,plan,draft);
   for(const row of snapshot.rows)assert.ok(markdown.includes(row.title),mode+" missing "+row.requirementId);
 }
 const migrated=adaptPersistedSnapshot({...snapshot,version:1});
 assert.deepEqual(migrated.rows.map(r=>r.status),snapshot.rows.map(r=>r.status));
});

