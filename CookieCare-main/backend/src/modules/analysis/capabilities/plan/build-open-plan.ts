import type { AnalysisState } from "../../models/analysis-state.js";
import type { IntentClassification, IntentRequirement } from "../../models/intent.js";
import type { MissingClarification } from "../../models/analysis-plan.js";
import type { EvidencePackage } from "../../models/evidence-package.js";
import type { Proposition } from "../../models/proposition.js";
import { buildInventory } from "./build-inventory.js";
import {
  generatePropositions,
  generateS3Propositions,
} from "./generate-propositions.js";
import { pacLog } from "../../utils/pac-log.js";

export interface OpenPlanResult {
  state: AnalysisState;
  intent: IntentClassification;
  /** Synthetic runtime package(s) to hand to buildActGraphDetailed. */
  extraPackages: EvidencePackage[];
  /** True when at least one proposition was generated (else caller falls back). */
  hasPropositions: boolean;
  /** Optional PLAN-level clarification (e.g. ambiguous clause interpretation). */
  ambiguity?: MissingClarification;
}

/** Cap so a huge document can't explode into an unbounded proposition set. */
const MAX_OPEN_PROPOSITIONS = 20;

const PRIORITY_REQUIRED_THRESHOLD = 60;

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
  const { state: afterInventory, inventory } = await buildInventory(state, primaryDocId);
  let working = afterInventory;

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
