import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import type { AnalysisState } from "../../../../../models/analysis-state.js";
import { gdprSkill } from "../../../../../__test-helpers__/package-graph-fixtures.js";
import type {
  CanonicalDocumentGraph,
  RelationEdge,
  StructuralNode,
} from "../../../../ingest/document-structure/types.js";
import { buildRequirementSearchPlan } from "../build-queries.js";
import { buildRequirementEvidenceBundle, toPhase3Bundle } from "../build-bundle.js";
import { buildEvidenceUnits, bm25Search } from "../evidence-index.js";
import { resolveEvidenceEmbeddings } from "../embedding-cache-repository.js";
import { evaluateInvestigationQuality, investigationPromotionGates } from "../evaluation.js";
import { expandSelectedEvidence } from "../expand-evidence.js";
import { retrieveHybridCandidates } from "../hybrid-retrieval.js";
import { resolveInvestigationRequirements } from "../requirement-source.js";
import { reviewCandidateBatches } from "../rerank-evidence.js";
import { runGraphNativeInvestigation } from "../run-investigation.js";
import type {
  EvidenceEmbeddingCache,
  EvidenceUnit,
  InvestigationRequirement,
  RankedEvidenceCandidate,
  RequirementEvidenceBundle,
} from "../types.js";
import { complianceInvestigationMode } from "../types.js";

function node(
  nodeId: string,
  text: string,
  start: number,
  parentId = "doc",
  title?: string
): StructuralNode {
  return {
    nodeId,
    kind: "clause",
    parentId,
    childIds: [],
    order: start,
    namespace: "main",
    ordinalPath: `DPA/${nodeId}`,
    displayLabel: nodeId,
    title,
    text,
    sourceRange: [start, start + text.length],
    sourceItemRefs: [],
    provenance: [],
    confidence: 1,
    signals: ["test"],
  };
}

function graphWithClauses(relations: RelationEdge[] = []): CanonicalDocumentGraph {
  const primary = "Processor shall process Personal Data only on documented instructions from Controller.";
  const security = "Authorised staff shall follow security instructions and access-control procedures.";
  const audit = "Processor shall provide annual security audit reports to Controller.";
  const canonicalText = `${primary}\n${security}\n${audit}`;
  const primaryStart = 0;
  const securityStart = primary.length + 1;
  const auditStart = securityStart + security.length + 1;
  const children = [
    node("instructions", primary, primaryStart, "doc", "Processing Instructions"),
    node("security", security, securityStart, "doc", "Security"),
    node("audit", audit, auditStart, "doc", "Audit"),
  ];
  return {
    artifactId: "artifact",
    fileId: "doc1",
    documentVersionId: "v1",
    sourceSha256: "source",
    schemaVersion: "1.2.0",
    createdAt: new Date(0).toISOString(),
    parser: { name: "text-native", version: "test", format: "text/plain", status: "ready" },
    canonicalText,
    nodes: [
      {
        nodeId: "doc",
        kind: "document",
        childIds: children.map((child) => child.nodeId),
        order: 0,
        namespace: "main",
        ordinalPath: "DPA",
        displayLabel: "DPA",
        text: canonicalText,
        sourceRange: [0, canonicalText.length],
        sourceItemRefs: [],
        provenance: [],
        confidence: 1,
        signals: ["test"],
      },
      ...children,
    ],
    structuralEdges: children.map((child) => ({ edgeType: "parent_of", sourceNodeId: "doc", targetNodeId: child.nodeId })),
    relationEdges: relations,
    definitions: [],
    unresolvedTargets: [],
    identity: {
      suppliedFileName: "test.txt",
      suppliedMimeType: "text/plain",
      contentSha256: "source",
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
      sourceBlockCount: 3,
      mappedBlockCount: 3,
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

function stateFor(requirementIds: string[], graph = graphWithClauses()): AnalysisState {
  const skill = gdprSkill();
  const packages = (skill.evidencePackages ?? []).filter((pkg) =>
    pkg.id === "gdpr.art28.particulars" || pkg.id === "gdpr.art28.3.mandatory_clauses"
  );
  const packageFor = (requirementId: string) => packages.find((pkg) => pkg.requirementIds.includes(requirementId))!;
  return {
    request: { sessionId: "s1", instruction: "Check Article 28", documentIds: ["doc1"], documentTexts: {} },
    workspace: {
      sessionId: "s1",
      documents: [{ docId: "doc1", role: "primary", fullText: graph.canonicalText, segments: [], clauses: [], structureGraph: graph }],
    },
    activeSkills: [skill],
    plan: {
      intent: {} as never,
      workUnits: [{
        workUnitId: "compliance",
        tool: "run_compliance_pipeline",
        input: { docId: "doc1", requirementIds },
        requirementIds,
        dependsOn: [],
        outputSchema: "ComplianceReportSnapshot",
        status: "pending",
      }],
      requirementBindings: requirementIds.map((requirementId) => ({
        requestRequirementId: requirementId,
        nativeRequirementId: requirementId,
        packageId: packageFor(requirementId).id,
        relation: "direct",
        source: "canonical",
      })),
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

describe("graph-native compliance investigation", () => {
  it("resolves all 15 Article 28 requirements from PLAN bindings and skills without evaluate_package", () => {
    const skill = gdprSkill();
    const ids = (skill.evidencePackages ?? [])
      .filter((pkg) => pkg.id === "gdpr.art28.particulars" || pkg.id === "gdpr.art28.3.mandatory_clauses")
      .flatMap((pkg) => pkg.requirementIds);
    assert.equal(ids.length, 15);
    const resolution = resolveInvestigationRequirements(stateFor(ids));
    assert.equal(resolution.issues.length, 0);
    assert.equal(resolution.requirements.length, 15);
    const instructions = resolution.requirements.find((item) => item.requirementId === "art28_3_a_instructions");
    assert.match(instructions?.profile.hypothesis ?? "", /documented instructions/i);
  });

  it("consumes PLAN rule selections directly and preserves authored proof elements", () => {
    const state = stateFor(["art28_3_a_instructions"]);
    state.plan!.complianceRequirementResolution = {
      facets: [{
        facetId: "requested_instructions",
        sourceText: "documented processing instructions",
        legalReferences: ["28"],
        actors: ["processor"],
        actions: [],
        objects: [],
      }],
      selections: [{
        facetId: "requested_instructions",
        skillId: "regimes/data-protection/gdpr",
        ruleId: "gdpr.art28.3.a",
        source: "exact_citation",
        confidence: 0.98,
        required: true,
        reason: "test",
      }],
      unresolved: [],
      complete: true,
    };
    const resolution = resolveInvestigationRequirements(state);
    assert.equal(resolution.requirements.length, 1);
    assert.equal(resolution.requirements[0].requirementId, "gdpr.art28.3.a");
    assert.deepEqual(
      resolution.requirements[0].elementIds,
      resolution.requirements[0].proofElements?.map((element) => element.id)
    );
    assert.ok(resolution.requirements[0].elementIds.length > 0);
    assert.ok(!resolution.requirements[0].elementIds.includes("E1"));
  });

  it("builds exact graph-backed leaf units and BM25 prefers the distinctive obligation", () => {
    const graph = graphWithClauses();
    const units = buildEvidenceUnits(graph);
    assert.deepEqual(units.map((unit) => unit.nodeId), ["instructions", "security", "audit"]);
    assert.equal(units[0].sourceRange[0], 0);
    assert.equal(bm25Search(units, "documented instructions", 1)[0]?.unit.nodeId, "instructions");
  });

  it("uses proofStandard for review, not as a retrieval query", () => {
    const requirement = resolveInvestigationRequirements(stateFor(["art28_3_a_instructions"])).requirements[0];
    const plan = buildRequirementSearchPlan(requirement);
    assert.ok(plan.exactQueries.includes("documented instructions"));
    assert.ok(plan.denseQueries.includes(requirement.profile.hypothesis!));
    assert.ok(!plan.sparseQueries.includes(requirement.profile.proofStandard!));
  });

  it("dense retrieval recovers the semantic clause and preserves hybrid channel evidence", async () => {
    const requirement = resolveInvestigationRequirements(stateFor(["art28_3_a_instructions"])).requirements[0];
    const units = buildEvidenceUnits(graphWithClauses());
    const vectors = new Map(units.map((unit) => [unit.unitId, unit.nodeId === "instructions" ? [1, 0] : [0, 1]]));
    const candidates = await retrieveHybridCandidates({
      requirement,
      plan: buildRequirementSearchPlan(requirement),
      units,
      unitEmbeddings: vectors,
      embedQueries: async (texts) => texts.map(() => [1, 0]),
    });
    assert.equal(candidates[0]?.unit.nodeId, "instructions");
    assert.ok(candidates[0]?.channelRanks.sparse);
    assert.ok(candidates[0]?.channelRanks.dense);
  });

  it("loads valid vectors, embeds only misses, and upserts the lazy cache", async () => {
    const units = buildEvidenceUnits(graphWithClauses());
    const writes: string[][] = [];
    const cache: EvidenceEmbeddingCache = {
      async load() {
        return new Map([
          [units[0].unitId, { contentHash: units[0].contentHash, vector: [1, 0] }],
          [units[1].unitId, { contentHash: "stale-content-hash", vector: [9, 9] }],
        ]);
      },
      async upsert(_key, rows) { writes.push(rows.map((row) => row.nodeId)); },
    };
    let embedded = 0;
    const result = await resolveEvidenceEmbeddings({
      units,
      userId: "user1",
      cache,
      embed: async (texts) => { embedded = texts.length; return texts.map(() => [0, 1]); },
    });
    assert.equal(result.size, 3);
    assert.equal(embedded, 2);
    assert.deepEqual(writes.flat().sort(), ["audit", "security"]);
  });

  it("keeps exact and sparse retrieval available when embeddings fail", async () => {
    const units = buildEvidenceUnits(graphWithClauses());
    const events: string[] = [];
    const vectors = await resolveEvidenceEmbeddings({
      units,
      embed: async () => { throw new Error("embedding offline"); },
      logger: (event) => events.push(event),
    });
    const requirement = resolveInvestigationRequirements(stateFor(["art28_3_a_instructions"])).requirements[0];
    const candidates = await retrieveHybridCandidates({
      requirement,
      plan: buildRequirementSearchPlan(requirement),
      units,
      unitEmbeddings: vectors,
      embedQueries: async () => { throw new Error("query embedding offline"); },
    });
    assert.equal(vectors.size, 0);
    assert.ok(events.includes("compliance.investigation.embedding.degraded"));
    assert.equal(candidates[0]?.unit.nodeId, "instructions");
    assert.equal(candidates.some((candidate) => candidate.channelRanks.dense !== undefined), false);
  });

  it("hard-excludes an explicitly incompatible relationship scope", async () => {
    const requirement = resolveInvestigationRequirements(stateFor(["art28_3_a_instructions"])).requirements[0];
    assert.ok(requirement.evidenceScope?.relationshipScopes?.includes("controller_to_processor"));
    const units = buildEvidenceUnits(graphWithClauses());
    units[0].relationshipScope = "controller_to_controller";
    const candidates = await retrieveHybridCandidates({
      requirement,
      plan: buildRequirementSearchPlan(requirement),
      units,
      unitEmbeddings: new Map(),
    });
    assert.equal(candidates.some((candidate) => candidate.unit.nodeId === "instructions"), false);
  });

  it("expands only resolved, typed one-hop dependencies", () => {
    const resolved: RelationEdge = {
      edgeId: "r1", sourceNodeId: "instructions", targetNodeId: "audit", candidateTargetIds: [],
      targetMention: "Audit", edgeType: "references", semanticEffect: "details_provided_by",
      evidenceText: "see Audit", evidenceRange: [0, 9], explicit: true, status: "resolved", reason: "test",
      detectedBy: ["deterministic_rule"], verifiedBy: ["target_resolver"],
    };
    const ambiguous: RelationEdge = { ...resolved, edgeId: "r2", targetNodeId: undefined, candidateTargetIds: ["security"], status: "ambiguous" };
    const units = buildEvidenceUnits(graphWithClauses([resolved, ambiguous]));
    const primary = units.find((unit) => unit.nodeId === "instructions")!;
    const candidate: RankedEvidenceCandidate = {
      unit: primary, fusedScore: 1, rerankScore: 1, channelRanks: { exact: 1 }, channelScores: { exact: 1 }, matchedQueries: [], signals: [],
    };
    const requirement = resolveInvestigationRequirements(stateFor(["art28_3_a_instructions"], primary.sourceGraph)).requirements[0];
    const expanded = expandSelectedEvidence({
      requirement,
      candidates: [candidate],
      decisions: [{ nodeId: primary.unitId, role: "primary", confidence: 0.9, contributesToElementIds: ["E1"], reason: "direct" }],
    });
    assert.ok(expanded.some((item) => item.unit.nodeId === "audit"));
    assert.ok(!expanded.some((item) => item.unit.nodeId === "security"));
  });

  it("pulls the relevant container descendant in even when it trails many others in document order", () => {
    // Reproduces the Article 28 appendix regression: a resolved
    // `details_provided_by` reference points at a large schedule whose relevant
    // section (the data categories) appears only after many unrelated bullets.
    // Taken in raw document order under a tight cap, the relevant section is
    // starved; it must be admitted on relevance instead.
    const nodes: StructuralNode[] = [
      node("pointer", "The categories of data are described in Schedule 1.", 0, "doc", "Data Categories"),
    ];
    let offset = 100;
    // 15 unrelated descendants first — more than the expansion cap.
    for (let i = 0; i < 15; i += 1) {
      nodes.push(node(`filler_${i}`, `The parties shall meet on a quarterly basis for governance review number ${i}.`, offset, "schedule1"));
      offset += 120;
    }
    // The relevant section, last in document order.
    nodes.push(node("categories", "Categories of data processed include contact details and identity records.", offset, "schedule1"));
    const schedule: StructuralNode = { ...node("schedule1", "Schedule 1", 90, "doc", "Schedule 1"), kind: "section", childIds: nodes.filter((n) => n.parentId === "schedule1").map((n) => n.nodeId) };
    const graph: CanonicalDocumentGraph = {
      ...graphWithClauses(),
      nodes: [
        { ...graphWithClauses().nodes[0], childIds: ["pointer", "schedule1"] },
        schedule,
        ...nodes,
      ],
      relationEdges: [{
        edgeId: "e1", sourceNodeId: "pointer", targetNodeId: "schedule1", candidateTargetIds: [],
        targetMention: "Schedule 1", edgeType: "references", semanticEffect: "details_provided_by",
        evidenceText: "see Schedule 1", evidenceRange: [0, 10], explicit: true, status: "resolved", reason: "test",
        detectedBy: ["deterministic_rule"], verifiedBy: ["target_resolver"],
      }],
    };
    const units = buildEvidenceUnits(graph);
    const pointerUnit = units.find((unit) => unit.nodeId === "pointer")!;
    const requirement: InvestigationRequirement = {
      requestRequirementId: "r", requirementId: "r", packageId: "p", documentId: "doc1",
      profile: { hypothesis: "The contract sets out the categories of data processed.", evidenceHints: ["categories of data"] },
      clauseTypes: [], extractionTargets: [], elementIds: ["cats"],
      proofElements: [{ id: "cats", description: "The contract sets out the categories of data processed.", kind: "mandatory" }],
    };
    const expanded = expandSelectedEvidence({
      requirement,
      candidates: [{ unit: pointerUnit, fusedScore: 1, rerankScore: 1, channelRanks: { exact: 1 }, channelScores: { exact: 1 }, matchedQueries: [], signals: [] }],
      decisions: [{ nodeId: pointerUnit.unitId, role: "primary", confidence: 0.95, contributesToElementIds: ["cats"], reason: "direct" }],
    });
    assert.ok(expanded.some((item) => item.unit.nodeId === "categories"),
      "relevant trailing descendant should be admitted on relevance, not skipped for document order");
  });

  it("produces a bounded primary bundle through the complete investigation entrypoint", async () => {
    const state = stateFor(["art28_3_a_instructions"]);
    const reviewer = async ({ entries }: Parameters<typeof reviewCandidateBatches>[0]) => {
      const decisionsByRequirement = new Map();
      const unresolvedByRequirement = new Map();
      for (const { requirement, candidates } of entries) {
        decisionsByRequirement.set(requirement.requirementId, candidates.map((candidate) => ({
          nodeId: candidate.unit.unitId,
          role: candidate.unit.nodeId === "instructions" ? "primary" : "irrelevant",
          contributesToElementIds: candidate.unit.nodeId === "instructions" ? ["E1"] : [],
          confidence: 0.95,
          reason: "fixture review",
        })));
        unresolvedByRequirement.set(requirement.requirementId, []);
      }
      return { decisionsByRequirement, unresolvedByRequirement, unavailableRequirementIds: new Set<string>() };
    };
    const result = await runGraphNativeInvestigation(state, {
      embedUnits: async (texts) => texts.map((text) => text.includes("documented") ? [1, 0] : [0, 1]),
      embedQueries: async (texts) => texts.map(() => [1, 0]),
      reviewer,
    });
    const bundle = [...result.bundlesByRequirement.values()][0];
    assert.equal(bundle.investigationComplete, true);
    assert.equal(bundle.passages.length, 1);
    assert.equal(bundle.passages[0].nodeId, "instructions");
    assert.equal(bundle.passages[0].role, "primary");
    assert.ok(bundle.candidateProvenance.length > 0);
  });

  it("preserves optional proof coverage without making it a completion prerequisite", () => {
    const graph = graphWithClauses();
    const requirement = resolveInvestigationRequirements(
      stateFor(["art28_3_a_instructions"], graph)
    ).requirements[0];
    requirement.elementIds = ["required"];
    requirement.proofElements = [
      { id: "required", description: "Required element", required: true },
      { id: "optional", description: "Conditional element", required: false },
    ];
    const unit = buildEvidenceUnits(graph).find((item) => item.nodeId === "instructions")!;
    const bundle = buildRequirementEvidenceBundle({
      requirement,
      candidates: [{
        unit,
        fusedScore: 1,
        rerankScore: 1,
        channelRanks: { exact: 1 },
        channelScores: { exact: 1 },
        matchedQueries: ["documented instructions"],
        signals: [],
      }],
      decisions: [{
        nodeId: unit.unitId,
        role: "primary",
        contributesToElementIds: ["required", "optional"],
        confidence: 0.95,
        reason: "covers required and conditional particulars",
      }],
      unresolvedElementIds: [],
    });
    assert.deepEqual(bundle.coveredElementIds.sort(), ["optional", "required"]);
    assert.deepEqual(bundle.unresolvedElementIds, []);
    assert.equal(bundle.investigationComplete, true);
  });

  it("does not leave an element unresolved after accepted evidence covers it", () => {
    const graph = graphWithClauses();
    const requirement = resolveInvestigationRequirements(
      stateFor(["art28_3_a_instructions"], graph)
    ).requirements[0];
    const unit = buildEvidenceUnits(graph).find((item) => item.nodeId === "instructions")!;
    const candidate: RankedEvidenceCandidate = {
      unit,
      fusedScore: 1,
      rerankScore: 1,
      channelRanks: { exact: 1 },
      channelScores: { exact: 1 },
      matchedQueries: ["documented instructions"],
      signals: [],
    };
    const bundle = buildRequirementEvidenceBundle({
      requirement,
      candidates: [candidate],
      decisions: [{
        nodeId: unit.unitId,
        role: "primary",
        contributesToElementIds: ["E1"],
        confidence: 0.95,
        reason: "direct proof",
      }],
      // A reviewer may conservatively return an unresolved ID in the same
      // response. Accepted proof is authoritative for bundle reconciliation.
      unresolvedElementIds: ["E1"],
    });
    assert.deepEqual(bundle.coveredElementIds, ["E1"]);
    assert.deepEqual(bundle.unresolvedElementIds, []);
    assert.equal(bundle.investigationComplete, true);
  });

  it("preserves limitation evidence without treating it as proof", () => {
    const graph = graphWithClauses();
    const requirement = resolveInvestigationRequirements(
      stateFor(["art28_3_a_instructions"], graph)
    ).requirements[0];
    const unit = buildEvidenceUnits(graph).find((item) => item.nodeId === "instructions")!;
    const candidate: RankedEvidenceCandidate = {
      unit,
      fusedScore: 1,
      rerankScore: 1,
      channelRanks: { dense: 1 },
      channelScores: { dense: 1 },
      matchedQueries: [],
      signals: [],
    };
    const bundle = buildRequirementEvidenceBundle({
      requirement,
      candidates: [candidate],
      decisions: [{
        nodeId: unit.unitId,
        role: "limitation",
        contributesToElementIds: [],
        confidence: 0.95,
        reason: "allocates responsibility away from the obligated party",
      }],
      unresolvedElementIds: [],
    });
    assert.equal(bundle.passages[0]?.role, "limitation");
    assert.deepEqual(bundle.coveredElementIds, []);
    assert.equal(bundle.investigationComplete, false);
  });

  it("distinguishes semantic rejection from a genuine bundle-budget omission", () => {
    const graph = graphWithClauses();
    const requirement = resolveInvestigationRequirements(
      stateFor(["art28_3_a_instructions"], graph)
    ).requirements[0];
    const unit = buildEvidenceUnits(graph).find((item) => item.nodeId === "security")!;
    const bundle = buildRequirementEvidenceBundle({
      requirement,
      candidates: [{
        unit,
        fusedScore: 0.2,
        rerankScore: 0.3,
        channelRanks: { sparse: 2, dense: 4 },
        channelScores: { sparse: 0.4, dense: 0.5 },
        matchedQueries: ["instructions"],
        signals: [],
      }],
      decisions: [{
        nodeId: unit.unitId,
        role: "irrelevant",
        contributesToElementIds: [],
        confidence: 0.95,
        reason: "security instructions do not prove processing instructions",
      }],
      unresolvedElementIds: ["E1"],
    });
    assert.equal(bundle.candidateProvenance[0]?.reviewDisposition, "semantic_rejection");
    assert.equal(bundle.candidateProvenance[0]?.reviewDecision?.role, "irrelevant");
    const adapted = toPhase3Bundle(bundle);
    assert.equal(adapted.exclusions[0]?.reason, "semantic_rejection");
    assert.ok(adapted.exclusions.every((item) => item.reason !== "budget"));
  });

  it("emits an explicit incomplete bundle when the canonical graph is unavailable", async () => {
    const state = stateFor(["art28_3_a_instructions"]);
    state.workspace.documents[0].structureGraph = undefined;
    const result = await runGraphNativeInvestigation(state);
    const bundle = result.bundlesByRequirement.get("doc1::art28_3_a_instructions");
    assert.equal(bundle?.investigationComplete, false);
    assert.deepEqual(bundle?.incompleteReasons, ["graph_missing"]);
    assert.equal(bundle?.passages.length, 0);
  });

  it("rejects invented reviewer node IDs and never promotes parent context", () => {
    const graph = graphWithClauses();
    const requirement = resolveInvestigationRequirements(stateFor(["art28_3_a_instructions"], graph)).requirements[0];
    const unit = buildEvidenceUnits(graph)[0];
    const candidate: RankedEvidenceCandidate = {
      unit,
      fusedScore: 0,
      rerankScore: 0,
      channelRanks: {},
      channelScores: {},
      matchedQueries: ["structural:parent_context"],
      signals: ["graph_expansion", "structural:parent_context"],
    };
    const bundle = buildRequirementEvidenceBundle({
      requirement,
      candidates: [candidate],
      decisions: [
        { nodeId: "invented-node", role: "primary", contributesToElementIds: ["E1"], confidence: 1, reason: "invented" },
        { nodeId: unit.unitId, role: "primary", contributesToElementIds: ["E1"], confidence: 1, reason: "parent" },
      ],
      unresolvedElementIds: [],
    });
    assert.ok(bundle.exclusions.some((item) => item.reason === "review_returned_unknown_node"));
    assert.equal(bundle.passages[0]?.role, "context");
    assert.equal(bundle.investigationComplete, false);
  });

  it("uses canonical graph-native investigation without an environment switch", () => {
    assert.equal(complianceInvestigationMode(), "canonical");
  });

  it("calculates the explicit shadow promotion gates from human-reviewed labels", () => {
    const graph = graphWithClauses();
    const bundle: RequirementEvidenceBundle = {
      bundleId: "b1",
      requirementId: "art28_3_a_instructions",
      packageId: "gdpr.art28.3.mandatory_clauses",
      documentId: "doc1",
      passages: [{
        unitId: "instructions",
        nodeId: "instructions",
        documentId: "doc1",
        role: "primary",
        rawText: graph.nodes.find((item) => item.nodeId === "instructions")!.text,
        structuralPath: "DPA/instructions",
        sourceRange: [0, 83],
        contributesToElementIds: ["E1"],
        confidence: 0.99,
        reason: "gold fixture",
        retrievalChannels: ["exact", "sparse", "dense"],
        matchedQueries: ["documented instructions"],
      }],
      coveredElementIds: ["E1"],
      unresolvedElementIds: [],
      dependencies: [],
      exclusions: [],
      investigationComplete: true,
      incompleteReasons: [],
      candidateCount: 2,
      retrievalChannelCounts: { exact: 1, sparse: 2, dense: 2 },
      candidateProvenance: [],
    };
    const metrics = evaluateInvestigationQuality({
      gold: [{
        documentId: "doc1",
        requirementId: "art28_3_a_instructions",
        labels: { instructions: "primary", security: "irrelevant" },
        prohibitedPrimaryNodeIds: ["security"],
      }],
      observations: [{
        documentId: "doc1",
        requirementId: "art28_3_a_instructions",
        candidateNodeIds: ["instructions", "security"],
        bundle,
      }],
      terminalRequirementIds: ["art28_3_a_instructions"],
    });
    assert.equal(metrics.candidateRecallAt40, 1);
    assert.equal(metrics.finalBundlePrecision, 1);
    assert.equal(metrics.prohibitedPrimaryAdmissions, 0);
    assert.equal(investigationPromotionGates({
      baselineGoldPrimaryCandidateRecall: 1,
      metrics,
    }).pass, true);
  });

  it("enforces the investigation-to-schema import boundary", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const forbidden = [/compliance-schema-registry/, /AUTHORED_ELEMENT_REGISTRY/, /element-schemas/];
    for (const file of fs.readdirSync(root).filter((name) => name.endsWith(".ts"))) {
      const source = fs.readFileSync(path.join(root, file), "utf8");
      for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${file} crosses schema boundary`);
    }
  });
});
