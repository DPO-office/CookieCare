import type { AnalysisState } from "../../models/analysis-state.js";
import type { MissingClarification } from "../../models/analysis-plan.js";
import { getSkillById } from "../../skills/runtime/catalog/registry.js";

export interface FrameFitResolution {
  mismatch: boolean;
  missing?: MissingClarification;
}

function regimePackIdFromStandard(standard: string | undefined): string | null {
  if (typeof standard !== "string" || !standard.startsWith("regime_pack:")) {
    return null;
  }
  return standard.slice("regime_pack:".length);
}

function docTypeLabel(docTypeId: string): string {
  return getSkillById(`doc-types/${docTypeId}`)?.label ?? docTypeId;
}

/**
 * §5.3 — before generating S1 (regime) propositions, check whether the
 * classified doc-type actually matches the frame being asked about. A regime
 * skill already declares which doc types it applies to (`appliesToDocTypes`);
 * this just compares that against what classify-document detected and
 * surfaces the mismatch directly instead of confidently investigating the
 * wrong frame (e.g. running GDPR Art 28 checks against an NDA).
 */
export function resolveFrameFit(state: AnalysisState): FrameFitResolution {
  const intent = state.intent;
  if (!intent) return { mismatch: false };

  const regimeId = regimePackIdFromStandard(intent.standard);
  if (!regimeId) return { mismatch: false };

  const docType = intent.docTypeHint;
  if (!docType) return { mismatch: false };

  const regimeSkill = getSkillById(regimeId);
  const appliesTo = regimeSkill?.appliesToDocTypes;
  if (!appliesTo || appliesTo.length === 0) return { mismatch: false };
  if (appliesTo.includes(docType)) return { mismatch: false };

  const regimeLabel = regimeSkill?.label ?? regimeId;
  const detectedLabel = docTypeLabel(docType);
  const expectedLabel = appliesTo.map(docTypeLabel).join(" or ");

  return {
    mismatch: true,
    missing: {
      field: "frameFit",
      question:
        `This doesn't appear to be a ${expectedLabel} — it looks like a ${detectedLabel}. ` +
        `${regimeLabel} obligations apply to a ${expectedLabel}, so this review would not be ` +
        `meaningful against this document. Did you mean to ask about a different regime, or ` +
        `upload the intended document?`,
      severity: "critical",
    },
  };
}
