import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit, MissingClarification } from "../../models/analysis-plan.js";
import type { Proposition } from "../../models/proposition.js";
import type { InventoryItem } from "./build-inventory.js";
import { executeJsonCompletion, LLMProvider, LLMTask } from "../../../../llm/index.js";
import { extractPlaybookPositions } from "../act/extract-playbook-positions.js";
import { ensureSegmented } from "./build-inventory.js";

/** Operations shaped like "establish something and verify it" — S4 is only worth authoring for these. */
const INVESTIGATION_OPERATIONS = new Set([
  "risk_flag",
  "compliance_check",
  "explain_qa",
  "compare",
]);

const COMPARISON_RE =
  /\b(balanced|one[- ]sided|symmetric|asymmetric|mutual|reciprocal|favor|favou?rable|equitable|fair|equal|unequal|lopsided|disproportionate)\b/i;

const COMPARISON_DIMENSIONS_RE =
  /\b(termination|liability|indemnif|data[- ]?use|data[- ]?processing|confidentiality|ip|intellectual property|non[- ]?compete|exclusivity|warranty|limitation of liability|governing law|jurisdiction|force majeure|assignment|subcontract|audit|breach|cure|notice)\b/gi;

/**
 * §4 step 8b, S2 source only — cross-reference the inventory (Plan-Phase 4)
 * against active doc-type/topic skills' authored `propositionPatterns`
 * (Plan-Phase 5) to generate propositions. A proposition is generated only
 * where the inventory shows a plausible match for the pattern's clause
 * type(s) — no liability-cap clause in the document, no liability-cap
 * proposition. Nothing downstream consumes this yet; wiring into the ACT
 * graph and calling VERIFY are later phases.
 */
export function generateS2Propositions(
  state: AnalysisState,
  inventory: InventoryItem[]
): Proposition[] {
  const skills = state.activeSkills ?? [];
  const foundClauseTypes = new Set(inventory.map((item) => item.clauseType));
  const party = state.intent?.partyPerspective ?? undefined;

  const propositions: Proposition[] = [];
  const seenPatternIds = new Set<string>();

  for (const skill of skills) {
    for (const pattern of skill.propositionPatterns ?? []) {
      if (seenPatternIds.has(pattern.id)) continue;
      if (!pattern.clauseTypes.some((ct) => foundClauseTypes.has(ct))) continue;
      seenPatternIds.add(pattern.id);

      const clusterId = assignClusterToPattern(pattern.clauseTypes);
      propositions.push({
        hypothesis: fillPartyTemplate(pattern.hypothesis, party),
        proofStandard: fillPartyTemplate(pattern.proofStandard, party),
        source: "S2",
        priority: pattern.priority,
        partyPerspective: party,
        clusterId,
      });
    }
  }

  return propositions.sort((a, b) => b.priority - a.priority);
}

function fillPartyTemplate(text: string, party: string | undefined): string {
  if (!text.includes("{{party}}")) return text;
  return text.replaceAll("{{party}}", party ?? "the party seeking this analysis");
}

interface S4AuthoredProposition {
  hypothesis: string;
  proofStandard: string;
  priority: number;
}

const S4_SCHEMA = {
  type: "object",
  properties: {
    hypothesis: { type: "string" },
    proofStandard: { type: "string" },
    priority: { type: "number" },
  },
  required: ["hypothesis", "proofStandard", "priority"],
};

const S4_SYSTEM_PROMPT = [
  "You are a senior contracts lawyer authoring a single investigation item",
  '(a "proposition") for a novel question about a contract that no existing',
  "skill or pattern covers.",
  "",
  "A proposition has two parts:",
  "- hypothesis: a one-sentence statement of what is being investigated,",
  "  phrased so it can turn out true, false, or unaddressed by the document.",
  "- proofStandard: precise instructions for what to look for in the document",
  "  and how to score it, written the way you'd brief a first-year associate —",
  "  specific enough that they know exactly what evidence would prove,",
  "  disprove, or leave the hypothesis unaddressed. Never vague boilerplate",
  '  like "check if this is adequate" — name the concrete textual signals to',
  "  look for.",
  "",
  "Rules:",
  "- You have not read the document, only its clause-type inventory. Do not",
  "  answer the question or assume what the document says — proofStandard is",
  "  instructions for a later verification step, not a conclusion.",
  "- If the question implies a specific scenario or trigger (e.g. \"what",
  "  happens if the vendor is acquired\"), proofStandard must name the exact",
  "  clause/concept a verifier should search for (e.g. a change-of-control or",
  "  assignment clause) and state what counts as addressing it, contradicting",
  "  it, or being silent on it.",
  "- priority is an integer 1-100: how central this question is to what the",
  "  user explicitly asked (a direct, explicit ask should score 70 or above).",
].join("\n");

/**
 * §4 step 8b, S4 fallback — for a question no S1/S2 source covers, author a
 * bespoke proposition directly from the user's own phrasing. Not wired into
 * ACT/VERIFY yet; this only produces the proposition.
 */
export async function generateS4Proposition(
  state: AnalysisState,
  inventory: InventoryItem[]
): Promise<Proposition | null> {
  const instruction = state.request.instruction.trim();
  if (!instruction) return null;

  const party = state.intent?.partyPerspective ?? undefined;
  const clauseTypes = [...new Set(inventory.map((item) => item.clauseType))];

  const prompt = [
    `User's question: "${instruction}"`,
    `The document's own clause-type inventory found: ${clauseTypes.join(", ") || "(nothing recognized)"}.`,
    party ? `The user is asking from the perspective of: ${party}.` : "",
    "Author a single proposition to investigate this question against the document.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const authored = await executeJsonCompletion<S4AuthoredProposition>(
    prompt,
    S4_SYSTEM_PROMPT,
    S4_SCHEMA,
    LLMTask.STRUCTURAL_JSON_LITE,
    LLMProvider.GEMINI
  );

  return {
    hypothesis: authored.hypothesis,
    proofStandard: authored.proofStandard,
    source: "S4",
    priority: authored.priority,
    partyPerspective: party,
  };
}

/**
 * extract_playbook_positions locates each position's `sourceLocator` with a
 * naive raw-text `indexOf` (act-utils.ts's locateText) that silently falls
 * back to charRange [0, needle.length] whenever the exact 80-char slice
 * isn't found verbatim — e.g. because the source text wraps mid-line with
 * leading whitespace. That fallback makes every unmatched position "quote"
 * the same wrong opening text. Re-searching here with whitespace normalized
 * on both sides is far more forgiving and catches those cases; when even
 * that fails, requirementText itself (still the playbook's own extracted
 * wording, just paraphrased) is the honest fallback — never a copy of some
 * other position's text.
 */
function findVerbatimSpan(fullText: string, needle: string): string | null {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const normalizedFull = normalize(fullText);
  const normalizedNeedle = normalize(needle).slice(0, 120);
  if (!normalizedNeedle) return null;

  const idx = normalizedFull.indexOf(normalizedNeedle);
  if (idx < 0) return null;

  const len = Math.max(normalizedNeedle.length, normalize(needle).length);
  return normalizedFull.slice(idx, idx + len).trim();
}

function severityToPriority(severity: "low" | "medium" | "high"): number {
  return severity === "high" ? 90 : severity === "medium" ? 60 : 30;
}

/**
 * §4 step 8b, S3 source — one proposition per distinct playbook position, no
 * more. Faithful to the playbook's own wording: quotes the verbatim span
 * `extract_playbook_positions` located in the playbook text (not the
 * paraphrased `requirementText`), so the proof standard says what the
 * playbook actually says. Does not judge alignment — that's COMPARE, which
 * needs VERIFY (Part 4); this only produces the proposition.
 */
export async function generateS3Propositions(
  state: AnalysisState,
  referenceDocId: string
): Promise<{ state: AnalysisState; propositions: Proposition[] }> {
  // classify-intent only ever populates the *primary* documentIds[0] into
  // workspace.documents — a reference/playbook doc (almost always the
  // second upload) needs the same one-off segmentation step build-inventory
  // already needed for its own target doc.
  const segmented = ensureSegmented(state, referenceDocId);

  const unit: AnalysisWorkUnit = {
    workUnitId: "propositions_extract_playbook_positions",
    tool: "extract_playbook_positions",
    input: { docId: referenceDocId },
    dependsOn: [],
    outputSchema: "Finding[]",
    status: "pending",
  };

  const { state: next } = await extractPlaybookPositions(segmented, unit, []);
  const doc = next.workspace.documents.find((d) => d.docId === referenceDocId);
  const positions = doc?.playbookPositions ?? [];
  const party = next.intent?.partyPerspective ?? undefined;

  const playbookText = doc?.fullText ?? "";

  const propositions: Proposition[] = positions.map((position) => {
    const verbatim = findVerbatimSpan(playbookText, position.requirementText);
    const quoteText = verbatim ?? position.requirementText;
    const quoteLabel = verbatim
      ? "quoted verbatim from the playbook"
      : "as extracted from the playbook (paraphrased from the source wording)";

    return {
      hypothesis: `The agreement aligns with this playbook position: "${position.requirementText}"`,
      proofStandard:
        `Compare the agreement's own text against this playbook requirement, ${quoteLabel}: ` +
        `"${quoteText}". Determine only whether the agreement's text satisfies, contradicts, ` +
        `or is silent on this specific requirement as the playbook states it here — do not ` +
        `judge against any other standard. Severity if this position is violated: ` +
        `${position.severityIfViolated}.`,
      source: "S3",
      priority: severityToPriority(position.severityIfViolated),
      partyPerspective: party,
    };
  });

  return { state: next, propositions };
}

/**
 * Detects whether the user's instruction is a comparison/balance/fairness
 * question — one that needs decomposition into paired sub-propositions
 * rather than a single S4 proposition.
 */
function isComparisonShaped(instruction: string): boolean {
  return COMPARISON_RE.test(instruction);
}

function extractDimension(instruction: string): string | null {
  const matches = instruction.match(COMPARISON_DIMENSIONS_RE);
  if (!matches || matches.length === 0) return null;
  return matches[0].toLowerCase();
}

interface DecomposedPair {
  dimension: string;
  side_a: { hypothesis: string; proofStandard: string };
  side_b: { hypothesis: string; proofStandard: string };
}

const DECOMPOSE_SCHEMA = {
  type: "object",
  properties: {
    dimension: {
      type: "string",
      description: "The contractual dimension being compared (e.g. 'termination rights')",
    },
    side_a: {
      type: "object",
      properties: {
        hypothesis: { type: "string" },
        proofStandard: { type: "string" },
      },
      required: ["hypothesis", "proofStandard"],
    },
    side_b: {
      type: "object",
      properties: {
        hypothesis: { type: "string" },
        proofStandard: { type: "string" },
      },
      required: ["hypothesis", "proofStandard"],
    },
  },
  required: ["dimension", "side_a", "side_b"],
};

const DECOMPOSE_SYSTEM_PROMPT = [
  "You are a senior contracts lawyer decomposing a comparison question into",
  "two independent investigation items. The user is asking whether something",
  'in a contract is "balanced", "fair", "one-sided", or similar — this',
  "requires examining BOTH sides independently before comparing.",
  "",
  "You must produce exactly two sub-propositions:",
  "- side_a: what one party can do / what rights or obligations one party has",
  "- side_b: what the other party can do / what rights or obligations the other party has",
  "",
  "Each sub-proposition has:",
  "- hypothesis: a one-sentence statement of what to establish about ONE side",
  "  (never referencing the other side or judging balance — that's COMPARE's job)",
  "- proofStandard: precise instructions for what to look for in the document",
  "  for THIS side only — specific clause references, textual signals, the",
  "  exact factual question a verifier should answer. Written as you'd brief",
  "  a first-year associate. Never vague.",
  "",
  "Rules:",
  '- Each sub-proposition must be independently investigable — a verifier',
  "  can answer it by reading only the relevant clauses, without needing the",
  "  other sub-proposition's result.",
  '- Never put the comparison judgment ("balanced", "fair") into either',
  "  sub-proposition — that belongs to a later COMPARE step, not here.",
  "- dimension: name the contractual concept being compared (e.g.",
  '  "termination rights", "liability exposure", "data processing scope").',
].join("\n");

/**
 * §Phase 8 — decompose a comparison-shaped ask into two linked
 * sub-propositions. Each is independently investigable via VERIFY; only
 * COMPARE (Part 4) will later judge the relationship between their results.
 */
export async function decomposeReasoningAsk(
  state: AnalysisState,
  inventory: InventoryItem[]
): Promise<Proposition[]> {
  const instruction = state.request.instruction.trim();
  if (!instruction) return [];

  const party = state.intent?.partyPerspective ?? undefined;
  const clauseTypes = [...new Set(inventory.map((item) => item.clauseType))];
  const hintedDimension = extractDimension(instruction);

  const prompt = [
    `User's question: "${instruction}"`,
    `The document's clause-type inventory found: ${clauseTypes.join(", ") || "(nothing recognized)"}.`,
    hintedDimension
      ? `The question appears to be about: ${hintedDimension}.`
      : "",
    party ? `The user is asking from the perspective of: ${party}.` : "",
    "Decompose this into two independently investigable sub-propositions,",
    "one for each side of the comparison.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const decomposed = await executeJsonCompletion<DecomposedPair>(
    prompt,
    DECOMPOSE_SYSTEM_PROMPT,
    DECOMPOSE_SCHEMA,
    LLMTask.STRUCTURAL_JSON_LITE,
    LLMProvider.GEMINI
  );

  const groupId = `compare_${decomposed.dimension.replace(/\s+/g, "_").toLowerCase()}`;

  return [
    {
      hypothesis: decomposed.side_a.hypothesis,
      proofStandard: decomposed.side_a.proofStandard,
      source: "S4",
      priority: 80,
      partyPerspective: party,
      compareGroup: groupId,
      compareRole: "side_a",
    },
    {
      hypothesis: decomposed.side_b.hypothesis,
      proofStandard: decomposed.side_b.proofStandard,
      source: "S4",
      priority: 80,
      partyPerspective: party,
      compareGroup: groupId,
      compareRole: "side_b",
    },
  ];
}

const RISK_CLUSTERS: Record<string, string[]> = {
  "risk_exposure": [
    "limitation_of_liability",
    "indemnity",
    "warranty",
    "insurance",
  ],
  "exit_and_control": [
    "termination",
    "assignment",
    "change_of_control",
    "force_majeure",
  ],
  "data_governance": [
    "data_processing",
    "data_retention",
    "data_transfer",
    "subprocessor",
    "breach_notification",
    "audit_rights",
  ],
};

function clauseTypeToCluster(clauseType: string): string | undefined {
  for (const [clusterId, types] of Object.entries(RISK_CLUSTERS)) {
    if (types.includes(clauseType)) return clusterId;
  }
  return undefined;
}

function assignClusterToPattern(clauseTypes: string[]): string | undefined {
  for (const ct of clauseTypes) {
    const cluster = clauseTypeToCluster(ct);
    if (cluster) return cluster;
  }
  return undefined;
}

export interface PropositionGenerationResult {
  propositions: Proposition[];
  ambiguity?: MissingClarification;
}

/**
 * §Phase 11 — detect when multiple S2 patterns fire for the same clause type
 * in the inventory. When a clause could be interpreted under two different
 * risk patterns, the user should clarify which interpretation matters rather
 * than PLAN silently picking both.
 */
export function detectPropositionAmbiguity(
  state: AnalysisState,
  inventory: InventoryItem[]
): MissingClarification | undefined {
  const skills = state.activeSkills ?? [];
  const foundClauseTypes = new Set(inventory.map((item) => item.clauseType));

  const clauseToPatterns = new Map<string, string[]>();

  for (const skill of skills) {
    for (const pattern of skill.propositionPatterns ?? []) {
      for (const ct of pattern.clauseTypes) {
        if (!foundClauseTypes.has(ct)) continue;
        const arr = clauseToPatterns.get(ct) ?? [];
        arr.push(pattern.id);
        clauseToPatterns.set(ct, arr);
      }
    }
  }

  for (const [clauseType, patternIds] of clauseToPatterns) {
    if (patternIds.length > 1) {
      return {
        field: "propositionAmbiguity",
        question:
          `The clause type "${clauseType}" matches multiple risk patterns ` +
          `(${patternIds.join(", ")}). Which interpretation is most relevant ` +
          `to your analysis, or should all be investigated?`,
        severity: "optional",
        options: [...patternIds, "investigate_all"],
      };
    }
  }

  return undefined;
}

function applyExhaustivenessTrim(
  propositions: Proposition[],
  state: AnalysisState
): Proposition[] {
  const ex = state.intent?.exhaustiveness;
  if (!ex || ex.mode !== "user_capped" || !ex.limit) return propositions;
  const sorted = [...propositions].sort((a, b) => b.priority - a.priority);
  return sorted.slice(0, ex.limit);
}

/**
 * Orchestrates S2 → decomposition → S4: comparison-shaped asks get decomposed
 * into paired sub-propositions; non-comparison investigation asks fall through
 * to single S4. Applies exhaustiveness trim (Phase 9) when the user scoped
 * explicitly ("top 3 risks"). Detects ambiguity (Phase 11) when multiple
 * patterns fire for the same clause type.
 */
export async function generatePropositions(
  state: AnalysisState,
  inventory: InventoryItem[]
): Promise<PropositionGenerationResult> {
  const ambiguity = detectPropositionAmbiguity(state, inventory);

  const s2 = generateS2Propositions(state, inventory);
  if (s2.length > 0) {
    return {
      propositions: applyExhaustivenessTrim(s2, state),
      ambiguity,
    };
  }

  const operation = state.intent?.operation;
  if (!operation || !INVESTIGATION_OPERATIONS.has(operation)) {
    return { propositions: [] };
  }

  const instruction = state.request.instruction.trim();
  if (isComparisonShaped(instruction)) {
    const paired = await decomposeReasoningAsk(state, inventory);
    if (paired.length > 0) {
      return { propositions: applyExhaustivenessTrim(paired, state) };
    }
  }

  const s4 = await generateS4Proposition(state, inventory);
  return { propositions: s4 ? applyExhaustivenessTrim([s4], state) : [] };
}
