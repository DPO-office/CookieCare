import type { VerificationRequest } from "../contracts/index.js";
export function requestFixture(id = "rule.one"): VerificationRequest {
  return {
    check: { checkId: "check:" + id, skillId: "fixture", ruleId: id, reviewScopeId: "document",
      documents: [{ documentId: "document", hash: "document-v1" }], facetIds: ["facet"], selectionReasons: ["explicit"],
      rule: { skillId: "fixture", ruleId: id, title: id, citation: "Fixture rule", version: "1", hash: "rule-v1",
        reviewStatus: "authored", proposition: "Only documented instructions.", proofStandard: "Operative instructions obligation.",
        guidance: [], applicabilityGuidance: "Determine from the stated scope.", relationshipScopes: [], relatedRuleIds: [],
        elements: [{ id: "instructions", description: "Only documented instructions.", kind: "mandatory", required: true }],
        aggregation: { operator: "all", children: [{ elementId: "instructions" }] } } },
    bundle: { bundleId: "bundle:" + id, hash: "bundle-v1", checkId: "check:" + id, documentVersions: [{documentId:"document",hash:"document-v1"}],
      passages: [{ evidenceId: "span", nodeId: "node", documentId: "document", text: "Only documented instructions.",
        range: [0, 29], path: "Clause 4.1", role: "primary", relationshipScope: "unspecified", contributesToElementIds: ["instructions"], reason: "Operative clause", confidence: 1 }],
      dependencies: [], executionStatus: "complete", coverageReasons: [], investigationWarnings: [], unestablishedElementIds: [] },
    context: { instruction: "Review instructions", facts: [{ id: "scope", text: "Processor services are in scope." }], questions: [] },
  };
}
export function responseFixture(r: VerificationRequest) {
  const applicability = { state: "applicable", basis: "Processor services are in scope.", evidenceIds: [], contextFactIds: ["scope"] };
  return { checkId: r.check.checkId, ruleHash: r.check.rule!.hash, bundleHash: r.bundle.hash, applicability,
    elements: r.check.rule!.elements.map(e => ({ elementId: e.id, state: "supported", applicability,
      citations: [{ evidenceId: "span", quote: r.bundle.passages[0]?.text ?? "", use: "proof", explanation: "Operative instruction obligation." }],
      establishedFact: "The processor follows documented instructions.", missingProof: "", roleReassessment: "",
      actorScope:{relationshipScope:"unspecified",basis:"Scope reviewed",evidenceIds:[]},
      limitations:[] as Array<{description:string;evidenceIds:string[];materiality:"material"|"immaterial"|"unknown"}>,
      conflicts:[] as Array<{description:string;evidenceIds:string[];materiality:"material"|"immaterial"|"unknown"}> })),
    dependencies: [], answers: [] };
}
