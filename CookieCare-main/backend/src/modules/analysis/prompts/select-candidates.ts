export const SELECT_CANDIDATES_SYSTEM_PROMPT = [
  "You are an evidence-selection engine for a contract-analysis pipeline. You",
  "are given a numbered list of clauses extracted from ONE document, and a set",
  "of requirements — each with a hypothesis and a proof standard describing what",
  "would prove it.",
  "",
  "Your ONLY job is selection, not judgment. For each requirement, pick the",
  "clause refs most likely to contain text that a downstream verifier could use",
  "to prove OR disprove that requirement. You are optimising recall for that",
  "verifier: include any clause that plausibly bears on the requirement, and",
  "rank the most directly-on-point evidence first.",
  "",
  "Critical selection discipline:",
  "- Prefer a clause that STATES the specific fact (an actual scope/subject-",
  "  matter statement, an explicit duration, an enumerated list of data",
  "  categories) over a clause that merely USES the same vocabulary. A",
  "  Definitions section that defines 'Personal Data' or 'Business Purpose' is",
  "  usually NOT where the subject matter / categories are actually specified —",
  "  it just contains the words. Do not let keyword density fool you.",
  "- A clause that points to where a particular is specified (e.g. 'as set out",
  "  in Annex 1', 'the Services specified in the Agreement', 'documented in the",
  "  SOW') IS relevant — it establishes the fact by incorporation. Include it.",
  "- Do NOT pick a clause just because it shares a topic area. If nothing in the",
  "  list plausibly bears on a requirement, return an empty list for it — that",
  "  is a valid, useful answer.",
  "",
  "Pick ONLY from the refs given. Never invent a ref. Return at most the",
  "requested number per requirement, best-first.",
].join("\n");

export interface SelectCandidatesRequirement {
  requirementId: string;
  hypothesis: string;
  proofStandard: string;
}

export interface SelectCandidatesClause {
  ref: string;
  clauseType: string;
  structuralPath?: string;
  snippet: string;
}

export function buildSelectCandidatesUserPrompt(input: {
  requirements: SelectCandidatesRequirement[];
  clauses: SelectCandidatesClause[];
  maxPerRequirement: number;
}): string {
  const clauseLines = input.clauses
    .map(
      (c) =>
        `${c.ref} [${c.clauseType}${c.structuralPath ? ` · ${c.structuralPath}` : ""}] ${c.snippet}`
    )
    .join("\n");

  const reqLines = input.requirements
    .map(
      (r) =>
        `- ${r.requirementId}\n    hypothesis: ${r.hypothesis}\n    proof standard: ${r.proofStandard}`
    )
    .join("\n");

  return [
    `CLAUSES (pick refs only from this list):`,
    clauseLines,
    "",
    `REQUIREMENTS:`,
    reqLines,
    "",
    `For each requirement, return up to ${input.maxPerRequirement} clause refs,`,
    `ranked most-relevant first. Empty list is valid when nothing bears on it.`,
  ].join("\n");
}

export function buildSelectCandidatesSchema(
  requirementIds: string[],
  clauseRefs: string[]
) {
  return {
    type: "array",
    items: {
      type: "object",
      properties: {
        requirementId: { type: "string", enum: requirementIds },
        refs: {
          type: "array",
          items: { type: "string", enum: clauseRefs },
        },
      },
      required: ["requirementId", "refs"],
    },
  };
}
