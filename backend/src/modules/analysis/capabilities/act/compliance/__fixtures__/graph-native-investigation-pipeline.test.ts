import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../../../models/analysis-state.js";
import { gdprSkill } from "../../../../__test-helpers__/package-graph-fixtures.js";
import type { CanonicalDocumentGraph, StructuralNode } from "../../../ingest/document-structure/types.js";
import { assessRequirement, draftExplanation } from "../assess-compliance-requirements.js";
import { resolveElementSchema } from "../compliance-schema-registry.js";
import { toPhase3Bundle } from "../investigation/build-bundle.js";
import { resolveInvestigationRequirements } from "../investigation/requirement-source.js";
import { runGraphNativeInvestigation } from "../investigation/run-investigation.js";
import type { reviewCandidateBatches } from "../investigation/rerank-evidence.js";
import { lockAssessment } from "../lock-compliance-assessments.js";
import { renderLockedOnly } from "../project-locked-compliance-report.js";
import { verifyRequirement } from "../verify-evidence-deterministically.js";

function fixtureGraph(): CanonicalDocumentGraph {
  const instruction = "Processor shall process Personal Data only on documented instructions from Controller.";
  const security = "Authorised personnel shall follow security instructions and access-control procedures.";
  const canonicalText = `${instruction}\n${security}`;
  const nodes: StructuralNode[] = [
    {
      nodeId: "doc",
      kind: "document",
      childIds: ["instructions", "security"],
      order: 0,
      namespace: "main",
      ordinalPath: "DPA",
      displayLabel: "DPA",
      text: canonicalText,
      sourceRange: [0, canonicalText.length],
      sourceItemRefs: [],
      provenance: [],
      confidence: 1,
      signals: ["fixture"],
    },
    ...[
      ["instructions", "Processing Instructions", instruction, 0],
      ["security", "Security", security, instruction.length + 1],
    ].map(([nodeId, title, text, start], order): StructuralNode => ({
      nodeId: String(nodeId),
      kind: "clause",
      parentId: "doc",
      childIds: [],
      order,
      namespace: "main",
      ordinalPath: `DPA/${nodeId}`,
      displayLabel: String(nodeId),
      title: String(title),
      text: String(text),
      sourceRange: [Number(start), Number(start) + String(text).length],
      sourceItemRefs: [],
      provenance: [],
      confidence: 1,
      signals: ["fixture"],
    })),
  ];
  return {
    artifactId: "graph-1",
    fileId: "doc1",
    documentVersionId: "version-1",
    sourceSha256: "sha",
    schemaVersion: "1.2.0",
    createdAt: new Date(0).toISOString(),
    parser: { name: "text-native", version: "fixture", format: "text/plain", status: "ready" },
    canonicalText,
    nodes,
    structuralEdges: [
      { edgeType: "parent_of", sourceNodeId: "doc", targetNodeId: "instructions" },
      { edgeType: "parent_of", sourceNodeId: "doc", targetNodeId: "security" },
    ],
    relationEdges: [],
    definitions: [],
    unresolvedTargets: [],
    identity: {
      suppliedFileName: "fixture.txt",
      suppliedMimeType: "text/plain",
      contentSha256: "sha",
      detectedEntities: [],
      status: "verified",
      reasons: [],
    },
    quality: {
      status: "ready",
      analysisMode: "full",
      analysisLimitations: [],
      automatedReview: { enabled: false, attemptedRelations: 0, resolvedRelations: 0, remainingRelations: 0 },
      textCoverage: 1,
      sourceBlockCount: 2,
      mappedBlockCount: 2,
      orphanCount: 0,
      unresolvedRequiredParents: 0,
      relationDiscoveryComplete: true,
      resolvedRelations: 0,
      ambiguousRelations: 0,
      unresolvedRelations: 0,
      criticalIssues: [],
    },
    warnings: [],
  };
}

function fixtureState(): AnalysisState {
  const graph = fixtureGraph();
  const skill = gdprSkill();
  return {
    request: { sessionId: "integration", instruction: "Check Article 28(3)(a)", documentIds: ["doc1"], documentTexts: {} },
    workspace: {
      sessionId: "integration",
      documents: [{ docId: "doc1", role: "primary", fullText: graph.canonicalText, segments: [], clauses: [], structureGraph: graph }],
    },
    activeSkills: [skill],
    plan: {
      intent: {} as never,
      workUnits: [{
        workUnitId: "compliance",
        tool: "run_compliance_pipeline",
        input: { docId: "doc1", requirementIds: ["art28_3_a_instructions"] },
        requirementIds: ["art28_3_a_instructions"],
        dependsOn: [],
        outputSchema: "ComplianceReportSnapshot",
        status: "pending",
      }],
      requirementBindings: [{
        requestRequirementId: "art28_3_a_instructions",
        nativeRequirementId: "art28_3_a_instructions",
        packageId: "gdpr.art28.3.mandatory_clauses",
        relation: "direct",
        source: "canonical",
      }],
      missingClarifications: [],
      outputForm: "memo",
      rendererSchemaId: "memo",
      pinnedVersions: { clauseTaxonomyVersion: "test", riskTaxonomyVersion: "test" },
    },
    findings: [],
    draftTasks: [],
    metadata: { timestamp: new Date(0).toISOString(), clauseTaxonomyVersion: "test", riskTaxonomyVersion: "test" },
  } as unknown as AnalysisState;
}

describe("graph-native investigation downstream compatibility", () => {
  it("flows through existing verify, assess, lock, and render unchanged", async () => {
    const state = fixtureState();
    const reviewer = async ({ entries }: Parameters<typeof reviewCandidateBatches>[0]) => {
      const decisionsByRequirement = new Map();
      const unresolvedByRequirement = new Map();
      for (const { requirement, candidates } of entries) {
        decisionsByRequirement.set(requirement.requirementId, candidates.map((candidate) => ({
          nodeId: candidate.unit.unitId,
          role: candidate.unit.nodeId === "instructions" ? "primary" : "irrelevant",
          contributesToElementIds: candidate.unit.nodeId === "instructions" ? ["E1"] : [],
          confidence: 0.99,
          reason: "integration fixture review",
        })));
        unresolvedByRequirement.set(requirement.requirementId, []);
      }
      return { decisionsByRequirement, unresolvedByRequirement, unavailableRequirementIds: new Set<string>() };
    };
    const investigation = await runGraphNativeInvestigation(state, {
      embedUnits: async (texts) => texts.map((text) => text.includes("documented") ? [1, 0] : [0, 1]),
      embedQueries: async (texts) => texts.map(() => [1, 0]),
      reviewer,
    });
    const requirement = resolveInvestigationRequirements(state).requirements[0];
    const canonical = [...investigation.bundlesByRequirement.values()][0];
    const bundle = toPhase3Bundle(canonical);
    const schema = resolveElementSchema(requirement.requirementId, requirement.requirementId, requirement.profile)!;
    const matrix = verifyRequirement({ requirementId: requirement.requirementId, bundle, schema });
    const assessment = assessRequirement({
      requirementId: requirement.requirementId,
      schema,
      matrix,
      investigationComplete: canonical.investigationComplete,
      unresolvedDependencyCount: canonical.dependencies.filter((item) => item.state !== "resolved_internal").length,
    });
    const explanation = draftExplanation(assessment, matrix, schema);
    const lock = lockAssessment({
      state,
      requirementId: requirement.requirementId,
      canonicalKey: schema.canonicalKey,
      schema,
      matrix,
      bundle,
      assessment,
      explanation,
      documentIds: ["doc1"],
      duplicateCanonicalKeys: new Set(),
    });

    assert.equal(bundle.items.length, 1);
    assert.equal(bundle.items[0].evidenceRole, "primary");
    assert.equal(matrix.elements.find((item) => item.elementId === "A1")?.state, "supported");
    assert.equal(lock.kind, "accepted");
    assert.equal(canonical.passages.some((item) => item.nodeId === "security"), false);
    if (lock.kind !== "accepted") return;
    const report = renderLockedOnly({
      accepted: [{
        requirementId: requirement.requirementId,
        canonicalKey: schema.canonicalKey,
        lockedAssessmentId: lock.lockedAssessmentId,
        documentHash: lock.documentHash,
        ruleVersion: lock.ruleVersion,
        assessment,
        explanation,
        matrix,
        bundle,
        schema,
      }],
      supplementalRequests: [],
    });
    assert.equal(report.rows.length, 1);
    assert.equal(report.reconciliation.missing.length, 0);
  });
});
