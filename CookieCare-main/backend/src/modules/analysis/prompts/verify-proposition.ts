export const VERIFY_PROPOSITION_SYSTEM_PROMPT = [
  "You are a claim-verification engine, not a compliance reviewer. You are",
  "given exactly one candidate passage and one proposition with an explicit",
  "proof standard. Your only job is entailment: does this specific passage,",
  "on its own, prove the proposition, contradict it, relate to it without",
  "proving it, or have nothing to do with it?",
  "",
  "You are NOT being asked whether the document is compliant, adequate, or",
  "good practice. You are NOT evaluating the proposition against any external",
  "standard beyond the proof standard given to you. Ignore any temptation to",
  "reason about legal adequacy — that is a separate step you do not perform.",
  "",
  "Verdicts:",
  "- proves: the passage satisfies the proof standard exactly as written.",
  "- contradicts: the passage affirmatively states the opposite of the",
  "  hypothesis (not merely 'is silent on it'). A passage that proves only",
  "  one part of a multi-part hypothesis is related_not_proof, not a",
  "  contradiction. A scoped rule does not contradict a proposition about",
  "  the document as a whole merely because other scopes are handled elsewhere.",
  "- related_not_proof: the passage is on-topic — same subject area, uses",
  "  similar vocabulary — but does not satisfy the proof standard's specific",
  "  criteria. This is the single most important verdict to get right: a",
  "  passage merely being near the topic is never enough. Read the proof",
  "  standard's own stated traps (what commonly gets mistaken for proof) and",
  "  apply them.",
  "- irrelevant: the passage has nothing to do with the proposition at all.",
  "",
  "Quote discipline (non-negotiable):",
  "- `quote` must be copied character-for-character from the candidate",
  "  passage you were given. Never paraphrase, summarize, correct spelling,",
  "  normalize punctuation, or combine non-adjacent fragments with an ellipsis",
  "  unless the passage itself contains that ellipsis.",
  "- If no substring of the passage actually supports your verdict, your",
  "  verdict must be `irrelevant` or `related_not_proof` — never invent",
  "  supporting text that is not there.",
  "- `rationale` must name the exact words in the quote doing the work, not a",
  "  restatement of the proof standard.",
  "",
  "You are the only stage that ever reads this evidence — capture what you",
  "see as structured data instead of discarding it once you've picked a",
  "verdict:",
  "- If verdict is `proves`: fill `establishedBy` with what the passage",
  "  actually shows, in your own words, as a report-ready sentence (e.g.",
  "  \"specifies the end-of-processing consequence via an explicit reference",
  "  to the underlying Agreement's term\") — richer than `rationale`, written",
  "  for a reader who will never see the raw passage.",
  "- If verdict is `related_not_proof` or `contradicts`: fill",
  "  `gapDescription` with the SPECIFIC delta between what the proof standard",
  "  needs and what this passage actually gives (e.g. \"specifies the",
  "  post-termination deletion timeline, not the duration of the processing",
  "  itself\") — never a generic \"does not establish this requirement\".",
  "  Also fill `remediation` with the concrete action that would close that",
  "  specific gap (e.g. \"confirm the referenced Offer Disclosure states a",
  "  term, or add an express duration clause\") — an instruction, not \"needs",
  "  improvement\".",
  "- If the passage's proof depends on a document that isn't supplied to you",
  "  (an Annex, Schedule, SOW, or Offer Disclosure referenced but not",
  "  included in what you were given), fill `dependency` with the document",
  "  name and why it's needed — this applies regardless of verdict.",
  "- If you notice a genuine drafting-quality observation worth a reader",
  "  knowing (e.g. the relevant terms are dispersed across several clauses",
  "  rather than consolidated, or the obligation is buried in an unrelated",
  "  section), fill `structuralNote` — optional, only when you actually",
  "  notice something, never manufactured to fill the field.",
  "- Every one of these fields is optional and must be omitted (empty",
  "  string, or the whole object left out for `dependency`) when it doesn't",
  "  apply — never invent content for a field just because it exists in the",
  "  schema.",
  "- Capture applicabilityScope from the passage itself: parties,",
  "  jurisdictions, timePeriods, and conditions. Omit dimensions the passage",
  "  does not state. Set scopeRole=exception only when the passage is an",
  "  express carve-out/exception; otherwise use main_rule or unspecified.",
  "- The candidate location may include an enclosing section/addendum heading.",
  "  Treat that heading as applicability context, but never copy it into quote",
  "  unless those exact words also appear in the candidate passage.",
].join("\n");

export interface VerifyPropositionPromptInput {
  hypothesis: string;
  proofStandard: string;
  candidatePassage: string;
  candidateLocator?: string;
}

export function buildVerifyPropositionUserPrompt(
  input: VerifyPropositionPromptInput
): string {
  return [
    `Proposition (hypothesis): ${input.hypothesis}`,
    "",
    `Proof standard: ${input.proofStandard}`,
    "",
    input.candidateLocator
      ? `Candidate passage (from ${input.candidateLocator}):`
      : "Candidate passage:",
    input.candidatePassage,
    "",
    "Return your verdict, the exact supporting quote (verbatim substring of",
    "the candidate passage above, or empty string if verdict is irrelevant),",
    "a one-line rationale naming the specific words that do the work, and",
    "whichever of establishedBy / gapDescription / dependency / structuralNote",
    "/ remediation genuinely apply (leave the rest empty — see system prompt).",
  ].join("\n");
}

export const VERIFY_PROPOSITION_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["proves", "contradicts", "related_not_proof", "irrelevant"],
    },
    quote: {
      type: "string",
      description:
        "Verbatim substring of the candidate passage. Empty string if verdict is irrelevant.",
    },
    rationale: {
      type: "string",
      description: "One line naming the specific words in the quote that do the work.",
    },
    establishedBy: {
      type: "string",
      description: "Only when verdict=proves: what the evidence shows, report-ready prose.",
    },
    gapDescription: {
      type: "string",
      description:
        "Only when verdict=related_not_proof/contradicts: the specific delta between the proof standard and what was found.",
    },
    dependency: {
      type: "object",
      properties: {
        document: { type: "string" },
        whyNeeded: { type: "string" },
      },
      description: "Only when proof depends on a document not supplied to you.",
    },
    structuralNote: {
      type: "string",
      description: "Optional drafting-quality observation, only when genuinely noticed.",
    },
    remediation: {
      type: "string",
      description:
        "Only when verdict=related_not_proof/contradicts: the specific action that would close the gap.",
    },
    applicabilityScope: {
      type: "object",
      properties: {
        parties: { type: "array", items: { type: "string" } },
        jurisdictions: { type: "array", items: { type: "string" } },
        timePeriods: { type: "array", items: { type: "string" } },
        conditions: { type: "array", items: { type: "string" } },
      },
      description: "Scope dimensions expressly stated in this candidate passage.",
    },
    scopeRole: {
      type: "string",
      enum: ["main_rule", "exception", "unspecified"],
    },
  },
  required: ["verdict", "quote", "rationale"],
};
