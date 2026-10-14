import type { AnalysisState } from "../../models/analysis-state.js";
import type { IntentClassification, IntentRequirement } from "../../models/intent.js";
import type { MissingClarification } from "../../models/analysis-plan.js";
import type { EvidencePackage } from "../../models/evidence-package.js";
import type { Proposition } from "../../models/proposition.js";
import { buildInventory, type InventoryItem } from "./build-inventory.js";
import {
  generatePropositions,
  generateS3Propositions,
} from "./generate-propositions.js";
import { pacLog } from "../../utils/pac-log.js";
import { capabilityContractFor } from "../contracts/analysis-capability-contract.js";

export interface OpenPlanResult {
  state: AnalysisState;
  intent: IntentClassification;
  /** Synthetic runtime package(s) to hand to buildActGraphDetailed. */
  extraPackages: EvidencePackage[];
  /** True when at least one proposition was generated (else caller falls back). */
  hasPropositions: boolean;
  /** Optional PLAN-level clarification (e.g. ambiguous clause interpretation). */
  ambiguity?: MissingClarification;
  /** Reference/playbook propositions were converted into a runtime package. */
  handledReference?: boolean;
}

/** Cap so a huge document can't explode into an unbounded proposition set. */
const MAX_OPEN_PROPOSITIONS = 20;

const PRIORITY_REQUIRED_THRESHOLD = 60;

export function operationNeedsOpenInventory(operation: string | undefined): boolean {
  return capabilityContractFor(operation).needsOpenInventory;
}

export function subIntentUsesReferenceDocument(
  subIntent: Pick<IntentClassification, "operation" | "standard">
): boolean {
  return (
    subIntent.operation === "compare" ||
    subIntent.standard.startsWith("reference_document:")
  );
}

/**
 * The open-analysis lane (§4 wired). Reads the document (inventory), asks the
 * existing proposition brain to author propositions with proof standards for
 * whatever the document actually contains + the user's question (S2 skill
 * patterns, S3 playbook, S4 novel), then packages them as a synthetic runtime
 * evidence package. That package runs through the SAME extract_shared_evidence
 * → evaluate_package (selector + VERIFY) → aggregate → render spine as an
 * authored compliance package — no new ACT tool needed, because every
 * proposition carries a proofStandard.
 */
export async function buildOpenPlan(
  state: AnalysisState,
  primaryDocId: string,
  referenceDocId?: string
): Promise<OpenPlanResult> {
  const needsInventory = state.intent?.compound
    ? state.intent.subIntents.some((subIntent) =>
        operationNeedsOpenInventory(subIntent.operation)
      )
    : operationNeedsOpenInventory(state.intent?.operation);
  const { state: afterInventory, inventory } = needsInventory
    ? await buildInventory(state, primaryDocId)
    : { state, inventory: [] };
  let working = afterInventory;

  if (!needsInventory) {
    pacLog("PLAN focused Q&A", {
      inventory: "skipped",
      reason: "targeted document-section selection runs in ACT",
    });
  }

  if (state.intent?.compound && state.intent.subIntents.length > 0) {
    return buildCompoundOpenPlan(working, inventory, referenceDocId);
  }

  const propositions: Proposition[] = [];

  if (referenceDocId) {
    const s3 = await generateS3Propositions(working, referenceDocId);
    working = s3.state;
    propositions.push(...s3.propositions);
  }

  const generated = await generatePropositions(working, inventory);
  propositions.push(...generated.propositions);

  const deduped = dedupeByHypothesis(propositions)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_OPEN_PROPOSITIONS);

  pacLog("PLAN open-analysis propositions", {
    inventoryTypes: new Set(inventory.map((i) => i.clauseType)).size,
    s3: referenceDocId ? "yes" : "no",
    generated: generated.propositions.length,
    kept: deduped.length,
  });

  if (deduped.length === 0) {
    return {
      state: working,
      intent: working.intent ?? state.intent!,
      extraPackages: [],
      hasPropositions: false,
      ambiguity: generated.ambiguity,
    };
  }

  const requirements: IntentRequirement[] = deduped.map((p, i) => ({
    id: `open.p${i + 1}`,
    description: p.hypothesis,
    type: "verification",
    priority: p.priority >= PRIORITY_REQUIRED_THRESHOLD ? "required" : "supporting",
  }));

  const requirementEvidence = Object.fromEntries(
    deduped.map((p, i) => [
      `open.p${i + 1}`,
      {
        hypothesis: p.hypothesis,
        proofStandard: p.proofStandard,
        polarity: p.polarity,
        partyPerspective: p.partyPerspective,
        compareGroup: p.compareGroup,
        compareRole: p.compareRole,
      },
    ])
  );

  const pkg: EvidencePackage = {
    id: "open_analysis",
    kind: "evaluation",
    // Tier B: document-grounded and VERIFY-backed, rendered in the main table.
    // (S3 playbook propositions are folded in here too for Phase A; per-tier
    // separation for playbook items is a later refinement.)
    sourceMode: "authored",
    requirementIds: requirements.map((r) => r.id),
    capabilityIds: [],
    clauseTypes: [...new Set(inventory.map((i) => i.clauseType))],
    extractionTargets: [],
    requirementEvidence,
  };

  const intent: IntentClassification = {
    ...(working.intent ?? state.intent!),
    requirements,
  };

  return {
    state: { ...working, intent },
    intent,
    extraPackages: [pkg],
    hasPropositions: true,
    ambiguity: generated.ambiguity,
    handledReference: Boolean(referenceDocId),
  };
}

async function buildCompoundOpenPlan(
  state: AnalysisState,
  inventory: InventoryItem[],
  referenceDocId?: string
): Promise<OpenPlanResult> {
  const originalIntent = state.intent!;
  const packages: EvidencePackage[] = [];
  let working = state;
  let handledReference = false;
  let firstAmbiguity: MissingClarification | undefined;

  for (const [index, subIntent] of originalIntent.subIntents.entries()) {
    const facetId = `facet_${index + 1}`;
    const facetRequirements = subIntent.requirements ?? [];
    const facetInstruction =
      subIntent.description?.trim() ||
      facetRequirements.map((requirement) => requirement.description).join("; ") ||
      state.request.instruction;
    const facetIntent: IntentClassification = {
      ...originalIntent,
      operation: subIntent.operation,
      standard: subIntent.standard,
      outputForm: subIntent.outputForm,
      reportType: subIntent.reportType ?? originalIntent.reportType,
      depth: subIntent.depth ?? originalIntent.depth,
      compound: false,
      subIntents: [],
      requirements: facetRequirements,
    };
    const facetState: AnalysisState = {
      ...working,
      request: { ...working.request, instruction: facetInstruction },
      intent: facetIntent,
    };

    const propositions: Proposition[] = [];
    const usesReference =
      Boolean(referenceDocId) &&
      subIntentUsesReferenceDocument(subIntent);
    if (usesReference && referenceDocId) {
      const s3 = await generateS3Propositions(facetState, referenceDocId);
      working = s3.state;
      propositions.push(...s3.propositions);
      handledReference = true;
    }

    const authoredRegimeFacet =
      subIntent.operation === "compliance_check" &&
      subIntent.standard.startsWith("regime_pack:");
    if (!authoredRegimeFacet) {
      const generated = await generatePropositions(facetState, inventory);
      propositions.push(...generated.propositions);
      firstAmbiguity ??= generated.ambiguity;
    }

    const deduped = dedupeByHypothesis(propositions)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, MAX_OPEN_PROPOSITIONS);
    if (deduped.length === 0) continue;

    const nativeRequirements: IntentRequirement[] = deduped.map(
      (proposition, itemIndex) => ({
        id: `open.${facetId}.p${itemIndex + 1}`,
        description: proposition.hypothesis,
        type: "verification",
        priority:
          proposition.priority >= PRIORITY_REQUIRED_THRESHOLD
            ? "required"
            : "supporting",
      })
    );
    const requirementEvidence = Object.fromEntries(
      deduped.map((proposition, itemIndex) => [
        nativeRequirements[itemIndex]!.id,
        {
          hypothesis: proposition.hypothesis,
          proofStandard: proposition.proofStandard,
          polarity: proposition.polarity,
          partyPerspective: proposition.partyPerspective,
          compareGroup: proposition.compareGroup,
          compareRole: proposition.compareRole,
        },
      ])
    );
    const referenceOnly = deduped.every(
      (proposition) => proposition.source === "S3"
    );
    packages.push({
      id: `open_analysis.${facetId}`,
      facetId,
      kind: "evaluation",
      sourceMode: referenceOnly ? "playbook_runtime" : "authored",
      requirementIds: nativeRequirements.map((requirement) => requirement.id),
      requirementAliases: facetRequirements.map((requirement) => requirement.id),
      capabilityIds: [],
      clauseTypes: [...new Set(inventory.map((item) => item.clauseType))],
      extractionTargets: [],
      requirementEvidence,
      label: subIntent.description ?? `Analysis ${index + 1}`,
      description: facetRequirements
        .map((requirement) => requirement.description)
        .join(" "),
    });
  }

  pacLog("PLAN compound facets", {
    requested: originalIntent.subIntents.length,
    runtimePackages: packages.length,
    handledReference,
    facets: packages.map((pkg) => `${pkg.facetId}:${pkg.requirementIds.length}`),
  });

  return {
    state: { ...working, intent: originalIntent },
    intent: originalIntent,
    extraPackages: packages,
    hasPropositions: packages.length > 0,
    ambiguity: firstAmbiguity,
    handledReference,
  };
}

function dedupeByHypothesis(propositions: Proposition[]): Proposition[] {
  const seen = new Set<string>();
  const out: Proposition[] = [];
  for (const p of propositions) {
    const key = p.hypothesis.trim().toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}
