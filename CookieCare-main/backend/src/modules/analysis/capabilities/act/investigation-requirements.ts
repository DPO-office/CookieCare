/**
 * STEP 1 — load `ComplianceRequirement[]` for the selected skill/config.
 *
 * Regime-agnostic by construction: a hand-authored `RequirementElementSchema`
 * (Article 28 today) and a plain `RequirementEvidenceProfile` (any other
 * skill that authors hypothesis/proofStandard/evidenceHints) both normalize
 * to the same `ComplianceRequirement` shape. Nothing here special-cases GDPR
 * — a future HIPAA/CPRA/whatever skill that authors either shape works
 * unchanged.
 */

import type { RequirementElementSchema } from "./element-schemas.js";
import type { RequirementEvidenceProfile } from "./isolate-requirement-evidence.js";
import type { ComplianceRequirement } from "./investigation-types.js";

/** From a hand-authored schema (full legal-element decomposition). */
export function requirementFromSchema(
  schema: RequirementElementSchema,
  sourcePackageId?: string
): ComplianceRequirement {
  return {
    requirementId: schema.requirementUid,
    requirementVersion: schema.version,
    title: schema.title,
    legalCitation: schema.legalCitation,
    legalText: schema.title,
    elements: schema.elements.map((el) => ({
      elementId: el.elementId,
      proposition: el.proposition,
    })),
    aggregationRule: schema.aggregationRule,
    // distinctiveTokens/requiredTokenGroups are DELIBERATELY not copied here
    // — they are Phase 4B verification gates, not investigation hints. A
    // narrow, hand-tuned hint list would just re-import the scalability
    // problem this whole system exists to avoid. evidenceHints (below, for
    // the profile path) are used instead, and even those are advisory only.
    sourcePackageId,
  };
}

/** From a plain evidence profile (hypothesis/proofStandard/evidenceHints) —
 * the general path any skill config can use without hand-authoring elements. */
export function requirementFromProfile(
  nativeRequirementId: string,
  profile: RequirementEvidenceProfile,
  sourcePackageId?: string
): ComplianceRequirement | undefined {
  const proposition = (profile.hypothesis ?? profile.proofStandard ?? "").trim();
  if (!proposition) return undefined;
  return {
    requirementId: nativeRequirementId,
    requirementVersion: "profile-1",
    title: proposition.length > 90 ? `${proposition.slice(0, 87)}...` : proposition,
    legalText: profile.proofStandard?.trim() || proposition,
    explanation: profile.proofStandard?.trim() && profile.proofStandard.trim() !== proposition
      ? profile.proofStandard.trim()
      : undefined,
    elements: [{ elementId: "E1", proposition }],
    aggregationRule: "AND",
    retrievalHints: (profile.evidenceHints ?? []).filter(Boolean),
    sourcePackageId,
  };
}
