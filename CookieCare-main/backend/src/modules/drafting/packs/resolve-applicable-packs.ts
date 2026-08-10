import type { DocumentTypePack } from "./document-types/types.js";
import type { RegimePack } from "./regimes/types.js";
import type { JurisdictionPack } from "./jurisdictions/types.js";
import type { DraftState } from "../models/draft-state.js";
import type { StructuredFacts } from "../models/structured-facts.js";
import { documentTypeRegistry } from "./document-types/registry.js";
import { regimeRegistry } from "./regimes/registry.js";
import { jurisdictionRegistry } from "./jurisdictions/registry.js";

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
    "DPA";
  return documentTypeRegistry.resolveId(String(hint));
}

/** Deterministic pack applicability — triggerCondition only; no LLM. */
export function resolveApplicablePacks(state: DraftState): ApplicablePacks {
  const facts = state.structuredFacts ?? {};
  const typePack = documentTypeRegistry.get(classifyDocumentType(state));
  const regimes = regimeRegistry.all().filter((r) => r.triggerCondition(facts));
  const jurisdictionId =
    typeof facts.governingLaw === "string"
      ? jurisdictionRegistry.resolveId(facts.governingLaw)
      : undefined;
  const jurisdiction = jurisdictionId ? jurisdictionRegistry.get(jurisdictionId) : undefined;

  return { typePack, regimes, jurisdiction, jurisdictionId, facts };
}
