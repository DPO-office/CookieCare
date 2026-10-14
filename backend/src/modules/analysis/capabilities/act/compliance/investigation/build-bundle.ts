import type {
  EvidenceDecision,
  EvidencePassage,
  EvidenceRole,
  InvestigationDependency,
  InvestigationExclusion,
  InvestigationRequirement,
  RankedEvidenceCandidate,
  RequirementEvidenceBundle,
  RetrievalChannel,
} from "./types.js";
import type {
  Phase3Bundle,
  Phase3BundleItem,
} from "./legacy-retrieval.js";

const ROLE_LIMITS: Record<Exclude<EvidenceRole, "irrelevant">, number> = {
  primary: 3,
  supporting: 4,
  dependency: 3,
  definition: 2,
  limitation: 3,
  contradictory: 3,
  context: 1,
};
const REQUIRED_DEPENDENCY_EFFECTS = new Set([
  "details_provided_by",
  "procedure_provided_by",
  "implements",
  "incorporates",
  "subject_to",
  "exception_provided_by",
  "limits",
  "modifies",
  "overrides",
  "prevails_over",
]);

function accepted(decision: EvidenceDecision): boolean {
  if (decision.role === "irrelevant") return false;
  return decision.confidence >= (decision.role === "primary" ? 0.7 : 0.65);
}

export function buildRequirementEvidenceBundle(args: {
  requirement: InvestigationRequirement;
  candidates: RankedEvidenceCandidate[];
  decisions: EvidenceDecision[];
  unresolvedElementIds: string[];
  incompleteReasons?: string[];
}): RequirementEvidenceBundle {
  const candidateById = new Map(args.candidates.map((candidate) => [candidate.unit.unitId, candidate]));
  const decisionById = new Map<string, EvidenceDecision>();
  const validElementIds = new Set(
    args.requirement.proofElements?.map((element) => element.id) ?? args.requirement.elementIds
  );
  const exclusions: InvestigationExclusion[] = [];
  const byRole = new Map<Exclude<EvidenceRole, "irrelevant">, EvidencePassage[]>();

  for (const decision of args.decisions) {
    const candidate = candidateById.get(decision.nodeId);
    if (!candidate) {
      exclusions.push({ nodeId: decision.nodeId, reason: "review_returned_unknown_node" });
      continue;
    }
    decisionById.set(decision.nodeId, decision);
    if (!accepted(decision)) {
      exclusions.push({ nodeId: decision.nodeId, reason: `rejected:${decision.role}:${decision.confidence}` });
      continue;
    }
    // A parent is useful orientation, but can never independently prove the
    // requirement even if a reviewer over-promotes it.
    const role = candidate.signals.includes("structural:parent_context")
      ? "context"
      : decision.role as Exclude<EvidenceRole, "irrelevant">;
    const source = candidate.unit.sourceGraph.canonicalText.slice(
      candidate.unit.sourceRange[0],
      candidate.unit.sourceRange[1]
    );
    if (source && !source.includes(candidate.unit.rawText) && !candidate.unit.rawText.includes(source.trim())) {
      exclusions.push({ nodeId: decision.nodeId, reason: "source_quote_mismatch" });
      continue;
    }
    const list = byRole.get(role) ?? [];
    list.push({
      unitId: candidate.unit.unitId,
      nodeId: candidate.unit.nodeId,
      documentId: candidate.unit.documentId,
      relationshipScope: candidate.unit.relationshipScope,
      role,
      rawText: candidate.unit.rawText,
      structuralPath: candidate.unit.structuralPath,
      sourceRange: candidate.unit.sourceRange,
      contributesToElementIds: [...new Set(decision.contributesToElementIds)].filter((id) =>
        validElementIds.has(id)
      ),
      confidence: decision.confidence,
      reason: decision.reason,
      retrievalChannels: Object.keys(candidate.channelRanks) as RetrievalChannel[],
      matchedQueries: [...new Set(candidate.matchedQueries)],
    });
    byRole.set(role, list);
  }

  for (const candidate of args.candidates) {
    if (!decisionById.has(candidate.unit.unitId)) {
      exclusions.push({
        nodeId: candidate.unit.unitId,
        reason: "review_omitted_candidate",
      });
    }
  }

  const passages: EvidencePassage[] = [];
  for (const role of ["primary", "supporting", "dependency", "limitation", "contradictory", "definition", "context"] as const) {
    const rows = (byRole.get(role) ?? []).sort((a, b) => b.confidence - a.confidence);
    // Unique element proof and potential blockers must not lose to a presentation quota.
    const covered = new Set<string>();
    const retained = rows.filter((row, index) => {
      const essential = ["dependency", "limitation", "contradictory"].includes(role)
        || (role === "primary" && row.contributesToElementIds.some(id => !covered.has(id)));
      if (essential || index < ROLE_LIMITS[role]) {
        row.contributesToElementIds.forEach(id => covered.add(id));
        return true;
      }
      return false;
    });
    passages.push(...retained);
    for (const omitted of rows.filter(row => !retained.includes(row))) {
      exclusions.push({ nodeId: omitted.unitId, reason: `role_budget:${role}` });
    }
  }
  // The verifier enforces the full-text input budget. Never truncate operative
  // evidence merely to fit a fixed number of passages.

  const selectedNodeIds = new Set(passages.map((passage) => passage.nodeId));
  const dependencyNodeIds = new Set(
    passages.filter((passage) => passage.role === "dependency").map((passage) => passage.nodeId)
  );
  const dependencies: InvestigationDependency[] = [];
  const incompleteReasons = [...(args.incompleteReasons ?? [])];
  const graph = args.candidates[0]?.unit.sourceGraph;
  if (graph) {
    for (const edge of graph.relationEdges) {
      if (!selectedNodeIds.has(edge.sourceNodeId)) continue;
      const state = edge.status === "resolved"
        ? "resolved_internal"
        : edge.status;
      dependencies.push({
        edgeId: edge.edgeId,
        referenceText: edge.evidenceText,
        referenceRange: edge.evidenceRange,
        targetMention: edge.targetMention,
        sourceNodeId: edge.sourceNodeId,
        targetNodeIds: edge.status === "resolved" && edge.targetNodeId ? [edge.targetNodeId] : [],
        semanticEffect: edge.semanticEffect,
        state,
      });
      if (
        edge.status !== "resolved" &&
        dependencyNodeIds.has(edge.sourceNodeId) &&
        REQUIRED_DEPENDENCY_EFFECTS.has(edge.semanticEffect)
      ) {
        incompleteReasons.push(`unresolved_required_dependency:${edge.edgeId}`);
      }
    }
  }

  const coveredElementIds = [...new Set(
    passages
      .filter((passage) => passage.role === "primary")
      .flatMap((passage) => passage.contributesToElementIds)
  )];
  const unresolvedElementIds = [...new Set([
    ...args.unresolvedElementIds,
    ...args.requirement.elementIds.filter((id) => !coveredElementIds.includes(id)),
  ])].filter((id) => !coveredElementIds.includes(id));
  if (
    args.requirement.elementIds.length > 0 &&
    !passages.some((passage) => passage.role === "primary")
  ) {
    incompleteReasons.push("primary_evidence_missing");
  }
  for (const id of unresolvedElementIds) incompleteReasons.push(`element_unresolved:${id}`);

  // Execution coverage and proof availability are independent facts.
  const coverageReasons = [...new Set([
    ...(args.incompleteReasons ?? []),
    ...exclusions.filter(e => !e.reason.startsWith("rejected:")).map(e => e.reason),
  ])];
  const coverageIssues = exclusions.filter(e => !e.reason.startsWith("rejected:")).map(exclusion => {
    const decision = exclusion.nodeId ? decisionById.get(exclusion.nodeId) : undefined;
    // Budget pruning is immaterial by construction: the retention pass above
    // never drops an element's only primary proof, nor any dependency,
    // limitation or contradiction — it only sheds evidence that is redundant
    // with what was kept. So a role_budget omission cannot change a verdict.
    // Every other omission (a definition, proof, unknown candidate or
    // restriction the reviewer could not classify) may, and stays unknown.
    const orientationOnly = exclusion.reason.startsWith("role_budget:");
    return { reason: exclusion.reason, evidenceIds: exclusion.nodeId ? [exclusion.nodeId] : [],
      elementIds: decision?.contributesToElementIds ?? [],
      materiality: orientationOnly ? "immaterial" as const : "unknown" as const };
  });

  const counts: Record<RetrievalChannel, number> = { exact: 0, sparse: 0, dense: 0 };
  for (const candidate of args.candidates) {
    for (const channel of Object.keys(candidate.channelRanks) as RetrievalChannel[]) counts[channel] += 1;
  }
  return {
    bundleId: `INV-${args.requirement.requirementId}-${args.requirement.documentId}`.slice(0, 120),
    requirementId: args.requirement.requirementId,
    packageId: args.requirement.packageId,
    documentId: args.requirement.documentId,
    passages,
    coveredElementIds,
    unresolvedElementIds,
    dependencies,
    exclusions,
    investigationComplete: [...new Set(incompleteReasons)].length === 0,
    executionStatus: (args.incompleteReasons?.length || exclusions.some(e => ["review_returned_unknown_node", "source_quote_mismatch"].includes(e.reason))) ? "incomplete" : "complete",
    coverageReasons,
    coverageIssues,
    incompleteReasons: [...new Set(incompleteReasons)],
    candidateCount: args.candidates.length,
    retrievalChannelCounts: counts,
    candidateProvenance: args.candidates.map((candidate) => {
      const decision = decisionById.get(candidate.unit.unitId);
      const selected = passages.some((passage) => passage.unitId === candidate.unit.unitId);
      const exclusion = exclusions.find((item) => item.nodeId === candidate.unit.unitId);
      const reviewDisposition = selected
        ? "accepted"
        : exclusion?.reason.startsWith("rejected:")
          ? "semantic_rejection"
          : exclusion?.reason.startsWith("role_budget:")
            ? "role_budget"
            : exclusion?.reason === "total_bundle_budget"
              ? "total_budget"
              : exclusion?.reason === "review_omitted_candidate"
                ? "not_classified"
                : "validation_rejection";
      return {
        unitId: candidate.unit.unitId,
        nodeId: candidate.unit.nodeId,
        fusedScore: candidate.fusedScore,
        rerankScore: candidate.rerankScore,
        channelRanks: { ...candidate.channelRanks },
        channelScores: { ...candidate.channelScores },
        matchedQueries: [...new Set(candidate.matchedQueries)],
        signals: [...new Set(candidate.signals)],
        reviewDisposition,
        ...(decision ? { reviewDecision: { ...decision, contributesToElementIds: [...decision.contributesToElementIds] } } : {}),
        ...(exclusion ? { exclusionReason: exclusion.reason } : {}),
        ...(candidate.expansion ? { expansion: { ...candidate.expansion } } : {}),
      };
    }),
  };
}

/** Compatibility adapter: verification still receives the established Phase3Bundle. */
export function toPhase3Bundle(bundle: RequirementEvidenceBundle): Phase3Bundle {
  const items: Phase3BundleItem[] = bundle.passages.map((passage) => ({
    spanId: passage.nodeId,
    ref: passage.unitId,
    quotedText: passage.rawText,
    structuralPath: passage.structuralPath,
    charRange: passage.sourceRange,
    scope: { documentId: passage.documentId, structuralPath: passage.structuralPath, relationship: passage.relationshipScope === "controller_to_processor" ? "controller_to_processor" : passage.relationshipScope === "controller_to_controller" ? "controller_to_controller" : passage.relationshipScope === "processor_to_processor" ? "processor_to_processor" : "unspecified" },
    source: passage.role === "dependency" || passage.role === "definition" || passage.role === "limitation" || passage.role === "contradictory" || passage.role === "context"
      ? "expansion"
      : "seed",
    evidenceRole: passage.role,
    contributesToElementIds: passage.contributesToElementIds,
    investigationConfidence: passage.confidence,
    investigationReason: passage.reason,
    retrievalChannels: passage.retrievalChannels,
    matchedQueries: passage.matchedQueries,
  }));
  return {
    bundleId: bundle.bundleId,
    requirementId: bundle.requirementId,
    items,
    partitions: items.length > 0
      ? [{ partitionId: "P1", scope: { documentId: bundle.documentId }, itemSpanIds: items.map((item) => item.spanId) }]
      : [],
    exclusions: bundle.exclusions.map((exclusion) => {
      const reason = exclusion.reason.startsWith("rejected:")
        ? "semantic_rejection" as const
        : exclusion.reason.startsWith("role_budget:")
          ? "role_budget" as const
          : exclusion.reason === "total_bundle_budget"
            ? "budget" as const
            : "validation_rejection" as const;
      return {
        spanId: exclusion.nodeId ?? "__investigation__",
        reason,
        detail: exclusion.reason,
      };
    }),
    dependencies: bundle.dependencies.map((dependency) => ({
      reference: `${dependency.sourceNodeId}:${dependency.semanticEffect}`,
      state: dependency.state === "resolved_internal"
        ? "resolved_internal"
        : dependency.state === "ambiguous"
          ? "ambiguous"
          : "unresolved_external",
      targetSpanIds: dependency.targetNodeIds,
    })),
    estimatedTokens: Math.ceil(items.reduce((sum, item) => sum + item.quotedText.length, 0) / 4),
    investigationComplete: bundle.investigationComplete,
    incompleteReasons: bundle.incompleteReasons,
  };
}
