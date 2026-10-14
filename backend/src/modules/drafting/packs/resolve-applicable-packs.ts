import type { DocumentTypePack } from "./document-types/types.js";
import type { RegimePack } from "./regimes/types.js";
import type { JurisdictionPack } from "./jurisdictions/types.js";
import type { DraftState } from "../models/draft-state.js";
import type { StructuredFacts } from "../models/structured-facts.js";
import { documentTypeRegistry } from "./document-types/registry.js";
import { regimeRegistry } from "./regimes/registry.js";
import { jurisdictionRegistry } from "./jurisdictions/registry.js";
import {
  dpdpaRequested,
  dropEuFamilyForDpdpaOnly,
  gdprFamilyRequested,
  inferPrivacyRegime,
} from "./regimes/dpdpa/signals.js";

export interface ApplicablePacks {
  typePack: DocumentTypePack;
  regimes: RegimePack[];
  jurisdiction?: JurisdictionPack;
  jurisdictionId?: string;
  facts: StructuredFacts;
}

function classifyDocumentType(state: DraftState): string {
  const hint =
    state.structuredFacts?.documentType ||
    state.intakeOverlay?.documentType ||
    state.requirements?.contractType ||
    "";
  return documentTypeRegistry.resolveId(String(hint));
}

/**
 * Instruction text is visible to regime triggers without waiting for EXTRACT_FACTS.
 * Not written back onto persisted structuredFacts.
 */
function factsForRegimeMatch(state: DraftState): StructuredFacts {
  const facts: StructuredFacts = { ...(state.structuredFacts ?? {}) };
  const instructions = [
    state.request?.rawInstructions,
    state.requirements?.instructions,
  ]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join("\n");
  if (instructions) facts.instructionText = instructions;
  const inferred = inferPrivacyRegime(facts);
  if (inferred && !facts.privacyRegime) facts.privacyRegime = inferred;
  return facts;
}

/** Deterministic pack applicability — triggerCondition only; no LLM. */
export function resolveApplicablePacks(state: DraftState): ApplicablePacks {
  const facts = state.structuredFacts ?? {};
  const matchFacts = factsForRegimeMatch(state);
  const docTypeId = classifyDocumentType(state);
  const typePack = documentTypeRegistry.get(docTypeId);
  let regimes = regimeRegistry.all().filter((r) => {
    // If the regime specifies which document types it applies to, enforce it
    const appliesTo = r.skillConfig?.appliesToDocTypes;
    if (appliesTo && appliesTo.length > 0) {
      const docTypeMatches = appliesTo.includes(typePack.id) || appliesTo.includes(docTypeId);
      const instructionStr = typeof matchFacts.instructionText === "string" ? matchFacts.instructionText.toLowerCase() : "";
      const explicitInInstructions =
        instructionStr.length > 0 &&
        (instructionStr.includes("dpa") ||
          instructionStr.includes("data processing") ||
          instructionStr.includes("data protection addendum"));
      if (!docTypeMatches && !explicitInInstructions) {
        return false;
      }
    }
    return r.triggerCondition(matchFacts);
  });
  if (dpdpaRequested(matchFacts) && !gdprFamilyRequested(matchFacts)) {
    regimes = regimes.filter((r) => !dropEuFamilyForDpdpaOnly(r.id));
    const blob = JSON.stringify(matchFacts).toLowerCase();
    const explicitHipaa =
      matchFacts.phiInvolved === true ||
      blob.includes("hipaa") ||
      blob.includes("baa") ||
      blob.includes("business associate");
    if (!explicitHipaa) {
      regimes = regimes.filter((r) => r.id !== "HIPAA_BA");
    }
  }
  const jurisdictionId =
    typeof facts.governingLaw === "string"
      ? jurisdictionRegistry.resolveId(facts.governingLaw)
      : undefined;
  const jurisdiction = jurisdictionId ? jurisdictionRegistry.get(jurisdictionId) : undefined;

  return { typePack, regimes, jurisdiction, jurisdictionId, facts };
}
