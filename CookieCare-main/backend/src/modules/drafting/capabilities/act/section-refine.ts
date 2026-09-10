import type { DraftState, DraftSection, ValidationIssue } from "../../models/draft-state.js";
import { LLMTask, LLMProvider, executeCompletion } from "../../../../llm/index.js";
import {
  renderSections,
  findSectionByHeading,
  findSectionContaining,
} from "../../utils/document-sections.js";
import * as templates from "../../prompts/system-templates.js";

/**
 * SURGICAL REFINEMENT (Phase 2)
 * ---------------------------------------------------------------------------
 * Instead of regenerating the ENTIRE document when validation finds an issue or a
 * user tweaks one clause (a second full Pro call, ~40-60s), we regenerate ONLY the
 * affected DraftSection(s) and splice them back. Falls back to full-doc regen when
 * a change cannot be safely localized (e.g. a whole compulsory section is missing).
 */

export interface SectionPlan {
  section: DraftSection;
  corrections: string[];
}

/** Extract a quoted token from a validation issue description (e.g. the "[● NAME]" token). */
function tokenFromIssue(issue: ValidationIssue): string | undefined {
  const match = issue.description.match(/"([^"]+)"/);
  return match?.[1];
}

/** Strip ```` ```markdown ```` fences a model may wrap a single-section answer in. */
function stripFences(raw: string): string {
  let text = (raw || "").trim();
  if (text.startsWith("```markdown")) text = text.replace(/^```markdown\s*/i, "");
  else if (text.startsWith("```")) text = text.replace(/^```\s*/, "");
  if (text.endsWith("```")) text = text.replace(/\s*```$/, "");
  return text.trim();
}

/**
 * Guarantee the regenerated block keeps its heading so renderSections() reconstructs
 * a well-formed document even if the model dropped the heading line.
 */
function ensureHeadingPreserved(original: DraftSection, newBody: string): string {
  const nb = newBody.trim();
  if (!original.heading) return nb;
  if (nb.toLowerCase().includes(original.heading.toLowerCase())) return nb;
  const originalFirstLine = original.body.split("\n")[0];
  return `${originalFirstLine}\n\n${nb}`;
}

/**
 * Build a plan for validation-triggered surgical refine.
 * Returns null (=> caller should do a full-doc regen) when any critical issue
 * cannot be confidently mapped to an existing section, or is an omission (a whole
 * missing section can't be edited in place).
 */
export function resolveValidationSurgicalPlan(state: DraftState): SectionPlan[] | null {
  const sections = state.draft?.sections ?? [];
  if (sections.length === 0) return null;

  const criticals = (state.validation?.issues ?? []).filter((i) => i.severity === "critical");
  if (criticals.length === 0) return null;

  const byId = new Map<string, SectionPlan>();
  for (const issue of criticals) {
    // A whole compulsory section is missing -> can't patch in place, do full regen.
    if (issue.type === "omission") return null;

    let section: DraftSection | undefined;
    if (issue.targetSection) section = findSectionByHeading(sections, issue.targetSection);
    if (!section) {
      const token = tokenFromIssue(issue);
      if (token) section = findSectionContaining(sections, token);
    }
    if (!section) return null; // cannot localize -> full regen

    const correction = `[${issue.severity.toUpperCase()} - ${issue.type}] In '${issue.targetSection || section.heading || "section"}': ${issue.description}`;
    const existing = byId.get(section.id);
    if (existing) existing.corrections.push(correction);
    else byId.set(section.id, { section, corrections: [correction] });
  }

  return [...byId.values()];
}

/**
 * Build a plan for human-driven refine. Only surgical when the user highlighted text
 * that maps to a single section; otherwise null (=> full-doc refine handles whole-doc
 * instructions like "make the whole thing stricter").
 */
export function planHumanRefine(state: DraftState): SectionPlan[] | null {
  const sections = state.draft?.sections ?? [];
  if (sections.length === 0) return null;

  const highlighted = state.request.highlightedText;
  if (!highlighted || !highlighted.trim()) return null;

  const section = findSectionContaining(sections, highlighted);
  if (!section) return null;

  const corrections = [
    `USER EDITING INSTRUCTION: ${state.request.rawInstructions}`,
    `FOCUS STRICTLY ON THIS HIGHLIGHTED TEXT WITHIN THE SECTION: "${highlighted}"`,
  ];
  return [{ section, corrections }];
}

function buildSectionRefinePrompt(state: DraftState, section: DraftSection, corrections: string[]): string {
  const req = state.requirements;
  return [
    "# TASK: REVISE ONE SECTION OF AN EXISTING LEGAL AGREEMENT",
    "Return ONLY the corrected markdown for THIS section, including its original heading line.",
    "Do NOT add, remove, or renumber other sections. Do NOT output the whole document.",
    "Do NOT wrap the output in code fences and do NOT add any commentary.",
    "Preserve clause numbering and cross-references so the section still fits its surroundings.",
    "",
    "# DOCUMENT CONTEXT",
    `- Contract Type: ${req?.contractType ?? "Agreement"}`,
    `- Governing Law/Jurisdiction: ${req?.jurisdiction ?? "Unspecified"}`,
    req?.parties?.length ? `- Parties: ${req.parties.join(" AND ")}` : "",
    "",
    "# CORRECTIONS TO APPLY TO THIS SECTION",
    ...corrections.map((c, i) => `${i + 1}. ${c}`),
    "",
    "# CURRENT SECTION TEXT (revise this in place)",
    section.body,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Regenerate only the sections in `plan`, splice them back, and return an updated state.
 * One LLM call per targeted section using the fast, scoped SECTION_REFINE preset.
 */
export async function regenerateSections(
  state: DraftState,
  plan: SectionPlan[],
  actor: "user" | "validator",
  provider: LLMProvider = LLMProvider.GEMINI
): Promise<DraftState> {
  if (!state.draft?.sections || state.draft.sections.length === 0) {
    throw new Error("Surgical refine aborted: state has no structured sections.");
  }

  const sections: DraftSection[] = [...state.draft.sections];
  const systemPrompt = state.context?.systemPrompt || templates.REFINEMENT_CORE_GUARDRAILS;
  const changedIds: string[] = [];

  for (const item of plan) {
    const idx = sections.findIndex((s) => s.id === item.section.id);
    if (idx === -1) continue;

    const prompt = buildSectionRefinePrompt(state, sections[idx], item.corrections);
    const raw = await executeCompletion(prompt, systemPrompt, LLMTask.SECTION_REFINE, provider);
    const newBody = ensureHeadingPreserved(sections[idx], stripFences(raw));

    if (newBody) {
      sections[idx] = { ...sections[idx], body: newBody };
      changedIds.push(sections[idx].id);
    }
  }

  const formattedDocument = renderSections(sections);
  const version = (state.draft.version ?? 1) + 1;

  const historyEntry = {
    version,
    actor,
    action: "section-refine",
    instruction: state.request.rawInstructions || undefined,
    changedSectionIds: changedIds,
    timestamp: new Date().toISOString(),
  } as const;

  return {
    ...state,
    draft: {
      rawOutput: formattedDocument,
      formattedDocument,
      sections,
      version,
      parentVersionId: `v${state.draft.version}`,
    },
    history: [...(state.history ?? []), historyEntry],
    metadata: {
      ...state.metadata,
      sectionRefinedAt: new Date().toISOString(),
      surgicalChangedSections: changedIds,
    },
  };
}
