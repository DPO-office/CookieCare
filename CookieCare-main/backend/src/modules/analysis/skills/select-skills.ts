import {
  findSkillByPromptId,
  getRegistryApi,
  getSkillById,
  resolveDocTypeSkill,
} from "./registry.js";
import { getManifestEntry } from "./manifest.js";
import type { AnalysisSkillConfig, SkillSelectionResult } from "./types.js";
import { pacLog } from "../utils/pac-log.js";

export const SKILL_SCORE_THRESHOLD = 2;
export const SKILL_AMBIGUITY_MARGIN = 1;

/**
 * Embedding shortlist only activates once candidate count justifies it.
 * At current ~10–15 skills, Stage 1 exact matching should resolve almost everything.
 */
export const EMBEDDING_SHORTLIST_THRESHOLD = 20;

const JURISDICTION_ID_ALIASES: Record<string, string> = {
  england: "england-wales",
  uk: "england-wales",
  "united-kingdom": "england-wales",
  "unitedkingdom": "england-wales",
  "england-and-wales": "england-wales",
};

function canonicalizeJurisdictionId(jurisdiction: string): string {
  const jid = jurisdiction.toLowerCase().replace(/\s+/g, "-");
  return JURISDICTION_ID_ALIASES[jid] ?? jid;
}

export interface SelectSkillsInput {
  instruction: string;
  promptLibraryId?: string;
  docType?: string;
  jurisdiction?: string;
}

function matchesTriggerPhrases(instruction: string, phrases: string[]): boolean {
  const hay = instruction.toLowerCase();
  for (const phrase of phrases) {
    if (hay.includes(phrase.toLowerCase())) return true;
    const words = phrase.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (words.length >= 2 && words.filter((w) => hay.includes(w)).length >= 2) return true;
  }
  return false;
}

/**
 * Stage 1 — deterministic filter. Stage 2 — embedding shortlist (gated; logged).
 * Embeddings never finalize selection alone.
 */
export function shortlistAndConfirm(
  candidates: AnalysisSkillConfig[],
  docType: string,
  instructionText: string,
  opts?: { multi?: boolean }
): AnalysisSkillConfig[] {
  const exact = candidates.filter(
    (c) =>
      (docType && c.appliesToDocTypes.includes(docType)) ||
      matchesTriggerPhrases(instructionText, c.triggerPhrases)
  );
  if (exact.length > 0) return opts?.multi ? exact : [exact[0]];

  if (candidates.length < EMBEDDING_SHORTLIST_THRESHOLD) return [];

  pacLog("select-skills Stage-2 embedding shortlist", {
    candidates: candidates.length,
    docType,
  });
  // Placeholder: real embeddings land when skill count exceeds the threshold.
  // Until then, refuse empty so we never accept an unverified top-k.
  const shortlist = embeddingShortlist(instructionText, candidates, { topK: 5 });
  const confirmed = shortlist.filter((c) => deterministicConfirm(c, instructionText));
  return opts?.multi ? confirmed : confirmed.slice(0, 1);
}

/** Stub — only invoked above EMBEDDING_SHORTLIST_THRESHOLD. */
function embeddingShortlist(
  _instructionText: string,
  _candidates: AnalysisSkillConfig[],
  _opts: { topK: number }
): AnalysisSkillConfig[] {
  return [];
}

function deterministicConfirm(skill: AnalysisSkillConfig, instructionText: string): boolean {
  return matchesTriggerPhrases(instructionText, skill.triggerPhrases);
}

function draftWarnings(skills: AnalysisSkillConfig[]): string[] {
  const warnings: string[] = [];
  for (const skill of skills) {
    const entry = getManifestEntry(skill.skillId);
    if (entry?.status === "draft") {
      warnings.push(
        `Partial coverage: skill "${skill.label}" (${skill.skillId}) is status=draft` +
          (entry.coverageNote ? ` — ${entry.coverageNote}` : ".")
      );
    }
  }
  return warnings;
}

function composeWithGlobal(skills: AnalysisSkillConfig[]): AnalysisSkillConfig[] {
  const global = getSkillById("_global");
  const out: AnalysisSkillConfig[] = [];
  if (global) out.push(global);
  for (const s of skills) {
    if (s.skillId === "_global") continue;
    if (!out.some((x) => x.skillId === s.skillId)) out.push(s);
  }
  return out;
}

/**
 * Default multi-skill composition across axes.
 * PLAN routes on skill.config.ts only — never on SKILL.md prose.
 */
export function selectActiveSkills(
  instruction: string,
  docType: string,
  jurisdiction?: string,
  promptLibraryId?: string
): SkillSelectionResult {
  const registry = getRegistryApi();
  const instructionText = instruction;
  const dt = (docType ?? "unknown").toLowerCase();

  // Path A — library click: deterministic composition
  if (promptLibraryId) {
    const id = promptLibraryId.trim().toLowerCase();
    if (id === "privacy" || id === "privacy-gdpr-dpa" || id === "gdpr") {
      const dpa = getSkillById("doc-types/dpa");
      const gdpr = getSkillById("regimes/data-protection/gdpr");
      const skills = composeWithGlobal(
        [dpa, gdpr].filter(Boolean) as AnalysisSkillConfig[]
      );
      return {
        skills,
        selectionPath: "library",
        partialCoverageWarning: draftWarnings(skills),
      };
    }
    const skill = findSkillByPromptId(promptLibraryId);
    if (skill) {
      const resolved =
        skill.axis === "doc-type" ? resolveDocTypeSkill(skill.skillId) : skill;
      const skills = composeWithGlobal([resolved]);
      // Privacy library also pulls DPA when GDPR regime is selected alone via alias
      if (resolved.skillId === "regimes/data-protection/gdpr") {
        const dpa = getSkillById("doc-types/dpa");
        if (dpa && !skills.some((s) => s.skillId === dpa.skillId)) {
          skills.splice(1, 0, dpa);
        }
      }
      return {
        skills,
        selectionPath: "library",
        partialCoverageWarning: draftWarnings(skills),
      };
    }
    const fallback = composeWithGlobal([]);
    return {
      skills: fallback,
      selectionPath: "fallback",
      partialCoverageWarning: draftWarnings(fallback),
    };
  }

  const active = composeWithGlobal([]);

  const docTypeMatches = shortlistAndConfirm(
    registry.getByAxis("doc-type"),
    dt,
    instructionText,
    { multi: false }
  );
  for (const raw of docTypeMatches) {
    active.push(resolveDocTypeSkill(raw.skillId));
  }

  const regimeMatches = shortlistAndConfirm(
    registry.getByAxis("regime"),
    dt,
    instructionText,
    { multi: true }
  );
  for (const r of regimeMatches) {
    if (!active.some((s) => s.skillId === r.skillId)) active.push(r);
  }

  const topicMatches = shortlistAndConfirm(
    registry.getByAxis("topic"),
    dt,
    instructionText,
    { multi: true }
  );
  for (const t of topicMatches) {
    if (!active.some((s) => s.skillId === t.skillId)) active.push(t);
  }

  // Auto-pair: GDPR regime ⇒ include DPA doc-type when doc looks like a DPA
  if (
    active.some((s) => s.skillId === "regimes/data-protection/gdpr") &&
    !active.some((s) => s.skillId === "doc-types/dpa") &&
    (dt === "dpa" || /dpa|data processing/i.test(instructionText))
  ) {
    const dpa = getSkillById("doc-types/dpa");
    if (dpa) active.splice(1, 0, dpa);
  }

  if (jurisdiction) {
    const jid = canonicalizeJurisdictionId(jurisdiction);
    const jurisdictionSkill = registry
      .getByAxis("jurisdiction")
      .find(
        (s) =>
          s.skillId.endsWith(`/${jid}`) ||
          s.skillId.endsWith(jid) ||
          matchesTriggerPhrases(jid, s.triggerPhrases)
      );
    if (jurisdictionSkill && !active.some((s) => s.skillId === jurisdictionSkill.skillId)) {
      active.push(jurisdictionSkill);
    }
  } else if (
    matchesTriggerPhrases(instructionText, [
      "california",
      "delaware",
      "ireland",
      "england and wales",
      "english law",
      "england",
      "united kingdom",
      "uk law",
    ])
  ) {
    const jMatches = shortlistAndConfirm(
      registry.getByAxis("jurisdiction"),
      dt,
      instructionText,
      { multi: true }
    );
    for (const j of jMatches) {
      if (!active.some((s) => s.skillId === j.skillId)) active.push(j);
    }
  }

  // Ambiguity: two doc-types close in score without a clear winner
  const docCandidates = registry.getByAxis("doc-type").filter(
    (c) =>
      c.appliesToDocTypes.includes(dt) ||
      matchesTriggerPhrases(instructionText, c.triggerPhrases)
  );
  if (docCandidates.length >= 2 && docTypeMatches.length === 0) {
    const scored = docCandidates
      .map((skill) => ({ skill, score: scoreSkill(skill, instructionText.toLowerCase(), dt) }))
      .sort((a, b) => b.score - a.score);
    const top = scored[0];
    const second = scored[1];
    if (
      top &&
      second &&
      top.score - second.score <= SKILL_AMBIGUITY_MARGIN &&
      top.score >= SKILL_SCORE_THRESHOLD
    ) {
      const skills = composeWithGlobal([top.skill]);
      return {
        skills,
        selectionPath: "free_text",
        ambiguous: true,
        candidateSkillIds: [top.skill.skillId, second.skill.skillId],
        partialCoverageWarning: draftWarnings(skills),
      };
    }
  }

  const specialized = active.filter((s) => s.skillId !== "_global");
  if (specialized.length === 0) {
    return {
      skills: active,
      selectionPath: "fallback",
      partialCoverageWarning: draftWarnings(active),
    };
  }

  return {
    skills: active,
    selectionPath: "free_text",
    partialCoverageWarning: draftWarnings(active),
  };
}

/** Back-compat wrapper used by resolve-skills. */
export function selectSkills(input: SelectSkillsInput): SkillSelectionResult {
  return selectActiveSkills(
    input.instruction,
    input.docType ?? "unknown",
    input.jurisdiction,
    input.promptLibraryId
  );
}

function scoreSkill(
  skill: AnalysisSkillConfig,
  instruction: string,
  docType: string
): number {
  let score = 0;
  if (skill.appliesToDocTypes.includes(docType)) score += 3;
  for (const phrase of skill.triggerPhrases) {
    if (instruction.includes(phrase.toLowerCase())) score += 2;
  }
  for (const phrase of skill.triggerPhrases) {
    const words = phrase.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const hits = words.filter((w) => instruction.includes(w)).length;
    if (hits >= 2) score += 1;
  }
  return score;
}

export function buildSkillAmbiguityClarification(
  candidateSkillIds: string[]
): { field: string; question: string; severity: "critical"; options: string[] } {
  const labels = candidateSkillIds.map((id) => getSkillById(id)?.label ?? id);
  return {
    field: "skillId",
    question: `Your request could match multiple analysis types: ${labels.join(" or ")}. Which should we run?`,
    severity: "critical",
    options: candidateSkillIds,
  };
}
