import type { AnalysisState } from "../../models/analysis-state.js";
import type { MissingClarification } from "../../models/analysis-plan.js";
import type { DocumentRoleResolution } from "../../models/analysis-plan.js";

/** Known bilateral role vocabularies checked for in the target document text. */
const ROLE_PAIRS: Array<[string, string]> = [
  ["controller", "processor"],
  ["customer", "vendor"],
  ["customer", "supplier"],
  ["licensor", "licensee"],
  ["disclosing", "receiving"],
  ["employer", "employee"],
  ["landlord", "tenant"],
  ["buyer", "seller"],
];

const PERSPECTIVE_NEEDED_RE =
  /\bnegotiat|favorable|favourabl|protect(s|ed)?\s+(us|our|me|customer)|our (side|position)|should we (sign|accept|push back)/i;

export interface PartyPerspectiveResolution {
  partyPerspective: string | null;
  missing?: MissingClarification;
}

/** Is this ask meaningless without knowing whose side we're arguing from (§5.2)? */
function perspectiveNeeded(state: AnalysisState): boolean {
  const intent = state.intent;
  if (!intent) return false;
  if (intent.operation === "risk_flag") return true;
  if (
    intent.requirements?.some(
      (r) => r.type === "adequacy" || r.type === "recommendation"
    )
  ) {
    return true;
  }
  return PERSPECTIVE_NEEDED_RE.test(state.request.instruction);
}

function roleFromInstruction(
  instruction: string,
  pair: [string, string]
): string | null {
  for (const role of pair) {
    const re = new RegExp(
      `\\b(?:as|for|from the (?:perspective|(?:point of )?view) of)\\s+(?:the |a |an )?${role}\\b`,
      "i"
    );
    if (re.test(instruction)) return role;
  }
  return null;
}

/** Minimum mentions for a role word to count as the document's own defined
 * vocabulary rather than an incidental one-off use elsewhere in the text
 * (e.g. an NDA that mentions "customer" once in unrelated boilerplate but
 * is actually built on "Disclosing Party"/"Receiving Party" throughout). */
const MIN_ROLE_MENTIONS = 3;

function countMentions(text: string, word: string): number {
  const re = new RegExp(`\\b${word}\\b`, "gi");
  return (text.match(re) ?? []).length;
}

function detectDefinedPair(text: string): [string, string] | null {
  let best: [string, string] | null = null;
  let bestScore = 0;
  for (const pair of ROLE_PAIRS) {
    const [a, b] = pair;
    const countA = countMentions(text, a);
    const countB = countMentions(text, b);
    if (countA < MIN_ROLE_MENTIONS || countB < MIN_ROLE_MENTIONS) continue;
    const score = Math.min(countA, countB);
    if (score > bestScore) {
      best = pair;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Vendor-drafted templates address the reader in second person ("...as a
 * Processor for You..."). When that pattern names one role for "You", the
 * reader occupies the *other* role in the pair.
 */
function inferSecondPersonRole(
  text: string,
  pair: [string, string]
): string | null {
  const [a, b] = pair;
  for (const namedRole of pair) {
    const re = new RegExp(
      `\\bas an?\\s+${namedRole}\\b[^.]{0,80}\\bfor\\s+you\\b`,
      "i"
    );
    if (re.test(text)) return namedRole === a ? b : a;
  }
  for (const role of pair) {
    const re = new RegExp(
      `\\byou[,]?\\s+(?:are|as)\\s+(?:the\\s+|an?\\s+)?${role}\\b`,
      "i"
    );
    if (re.test(text)) return role;
  }
  return null;
}

/**
 * Resolve whose side the ask is being answered from (§5.2). Inferred from the
 * user's own phrasing first, then from the target document's own defined
 * party vocabulary; asked when genuinely ambiguous rather than guessed.
 */
export function resolvePartyPerspective(
  state: AnalysisState,
  roles: DocumentRoleResolution
): PartyPerspectiveResolution {
  if (!perspectiveNeeded(state)) {
    return { partyPerspective: null };
  }

  const targetText = state.request.documentTexts?.[roles.targetDocId] ?? "";
  const pair = detectDefinedPair(targetText);

  if (!pair) {
    return {
      partyPerspective: null,
      missing: {
        field: "partyPerspective",
        question:
          "This ask depends on whose side you're asking from. Which party are you in this agreement?",
        severity: "critical",
      },
    };
  }

  const fromInstruction = roleFromInstruction(state.request.instruction, pair);
  if (fromInstruction) return { partyPerspective: fromInstruction };

  const fromText = inferSecondPersonRole(targetText, pair);
  if (fromText) return { partyPerspective: fromText };

  return {
    partyPerspective: null,
    missing: {
      field: "partyPerspective",
      question: `This ask depends on whose side you're asking from. Are you the ${pair[0]} or the ${pair[1]} in this agreement?`,
      severity: "critical",
      options: [pair[0], pair[1]],
    },
  };
}
