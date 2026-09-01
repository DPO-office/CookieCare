/**
 * negotiateChunker.ts
 *
 * Splits a contract document into overlapping text chunks suitable for a
 * single Gemini Flash context window, runs one LLM evaluation call per chunk
 * in parallel, then merges and deduplicates the resulting markup candidates.
 *
 * Design goals:
 *  - No silent truncation: every character of the document is covered.
 *  - Stable clauseId: derived from a short deterministic hash of the verbatim
 *    original text, not invented by the LLM.
 *  - Reliable charOffset: resolved against the original plaintext BEFORE any
 *    Markdown→HTML transformation, so the frontend can use it as a fallback
 *    when regex matching on rendered HTML fails.
 *  - Deduplication: if two chunks both flag the same clause text, the higher-
 *    risk finding wins and only one markup is emitted.
 */

import crypto from "crypto";
import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../llm/index.js";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Minimal playbook rule shape accepted by the evaluator. */
export interface PlaybookRuleInput {
  topic: string;
  standardPosition: string;
  fallbackPositions: string[];
  walkAwayCondition: string;
}

export interface RawMarkupCandidate {
  /** LLM-assigned label — used only for deduplication, replaced before return. */
  llmLabel: string;
  original: string;
  replacement: string;
  reasoning: string;
  riskLevel: "RED" | "YELLOW" | "GREEN";
  clauseType: string;
  /**
   * Populated only when the LLM matched a playbook rule to this clause.
   * Value is the rule's topic string exactly as it appeared in the prompt.
   * null / undefined means the finding is generic (no playbook backing).
   */
  matchedPlaybookTopic?: string | null;
}

export interface NegotiateMarkup {
  /** Stable hash-based ID: "clause-<8-hex-chars>" */
  clauseId: string;
  original: string;
  replacement: string;
  reasoning: string;
  riskLevel: "RED" | "YELLOW" | "GREEN";
  clauseType: string;
  /**
   * Zero-based character offset of `original` in the original plaintext.
   * -1 when the text could not be located (should not occur in practice).
   */
  charOffset: number;
  /**
   * Topic of the playbook rule that grounded this finding.
   * null means the finding came from generic legal-risk analysis only.
   */
  matchedPlaybookTopic: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum characters per chunk sent to the LLM.
 * Gemini Flash supports ~1 M tokens; 14 000 chars ≈ 3 500 tokens — a safe
 * per-chunk budget that leaves ample room for system prompt + JSON output.
 */
const CHUNK_SIZE = 14_000;

/**
 * How many characters to repeat at the start of each subsequent chunk.
 * Overlap ensures clauses that straddle a chunk boundary are captured in full
 * by at least one chunk.
 */
const CHUNK_OVERLAP = 1_500;

// ─── Clause taxonomy (mirrors backend clause-taxonomy.ts) ─────────────────────

const CLAUSE_TAXONOMY = [
  "indemnity",
  "limitation_of_liability",
  "termination",
  "governing_law",
  "confidentiality",
  "assignment",
  "force_majeure",
  "payment",
  "intellectual_property",
  "non_compete",
  "data_protection",
  "warranties",
  "dispute_resolution",
  "audit_rights",
  "change_of_control",
  "representations",
  "compliance",
  "other",
] as const;

export type ClauseType = (typeof CLAUSE_TAXONOMY)[number];

// ─── JSON schema for a single chunk evaluation call ───────────────────────────

const CHUNK_MARKUP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["markups"],
  properties: {
    markups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "llmLabel",
          "original",
          "replacement",
          "reasoning",
          "riskLevel",
          "clauseType",
        ],
        properties: {
          llmLabel: {
            type: "string",
            description: "Short identifier the model used for this clause within the chunk.",
          },
          original: {
            type: "string",
            description:
              "The exact, verbatim clause text as it appears in [CONTRACT CHUNK]. Do NOT truncate, paraphrase, or alter any character.",
          },
          replacement: {
            type: "string",
            description:
              "A commercially balanced, protective replacement clause. Must be a complete, standalone contractual sentence or paragraph.",
          },
          reasoning: {
            type: "string",
            description: "One to two sentences explaining the legal / commercial risk of the original clause.",
          },
          riskLevel: {
            type: "string",
            enum: ["RED", "YELLOW", "GREEN"],
          },
          clauseType: {
            type: "string",
            enum: CLAUSE_TAXONOMY as unknown as string[],
          },
          matchedPlaybookTopic: {
            type: ["string", "null"],
            description:
              "The exact topic string from the PLAYBOOK RULES section that applies to this clause. " +
              "Set to null if no playbook rule was relevant. NEVER invent a topic not listed in the playbook.",
          },
        },
      },
    },
  },
};

// ─── System prompt builder ────────────────────────────────────────────────────

const GENERIC_SCOPE = `SCOPE — flag any clause that falls into at least one of these categories:
  • Indemnity & hold-harmless obligations
  • Limitation of liability (caps, exclusions, carve-outs)
  • Termination rights and notice periods
  • Intellectual property ownership and assignment
  • Confidentiality and non-disclosure obligations
  • Non-compete and non-solicitation restrictions
  • Governing law and jurisdiction / venue
  • Dispute resolution (arbitration, expert determination, litigation)
  • Payment terms, late payment, set-off rights
  • Data protection, data processing, sub-processor obligations
  • Warranties and representations
  • Assignment, change of control, novation
  • Force majeure scope and duration
  • Audit rights and record-keeping obligations
  • Compliance obligations (regulatory, statutory)
  Be thorough — if a clause is one-sided or creates commercial exposure, flag it.`;

const RISK_GRADING = `RISK GRADING:
  RED    — Uncapped or broad liability exposure, unilateral rights, broad IP assignment,
            non-domestic governing law, unreasonably punitive terms.
  YELLOW — Imbalanced but negotiable: long notice periods, broad audit rights, no
            mutual termination, vague payment timelines, overly broad confidentiality.
  GREEN  — Fair and market-standard. Flag only if a minor improvement is clearly
            available; skip entirely if the clause needs no change.`;

const EXTRACTION_RULE = `EXTRACTION RULE — CRITICAL:
  The "original" field MUST be copied character-for-character from the [CONTRACT CHUNK]
  below. Do not truncate, paraphrase, merge, or alter any character. If a clause spans
  multiple sentences, include the full relevant span.`;

/**
 * Builds the system prompt for a chunk evaluation call.
 *
 * When playbook rules are supplied, the model is instructed to:
 *   1. Compare each clause against the listed rules first.
 *   2. Set matchedPlaybookTopic to the exact rule topic when a rule applies.
 *   3. Leave matchedPlaybookTopic null when no rule applies — generic risk
 *      analysis still applies but must not be labelled as playbook-backed.
 *
 * When no playbook rules are supplied, the prompt falls back to the original
 * generic risk-analysis behaviour and matchedPlaybookTopic is always null.
 */
function buildSystemPrompt(playbookRules: PlaybookRuleInput[]): string {
  const hasPlaybook = playbookRules.length > 0;

  let playbookSection = "";
  if (hasPlaybook) {
    const ruleLines = playbookRules
      .map((r, i) => {
        const fallbacks =
          r.fallbackPositions.length > 0
            ? `\n     Fallback: ${r.fallbackPositions.join(" | ")}`
            : "";
        const walkAway = r.walkAwayCondition
          ? `\n     Walk-away: ${r.walkAwayCondition}`
          : "";
        return (
          `  ${i + 1}. Topic: ${r.topic}\n` +
          `     Standard position: ${r.standardPosition}` +
          fallbacks +
          walkAway
        );
      })
      .join("\n\n");

    playbookSection = `
PLAYBOOK RULES (company negotiation standards — primary authority):
${ruleLines}

PLAYBOOK MATCHING INSTRUCTIONS:
  • For each flagged clause, check whether any playbook rule above applies.
  • If a rule applies, set matchedPlaybookTopic to the EXACT topic string from the rule (e.g. "Indemnity Cap").
  • The replacement clause for a playbook-matched finding MUST implement the playbook's standard position.
  • If no playbook rule applies to a clause, set matchedPlaybookTopic to null.
  • Do NOT invent a playbook topic. Do NOT attach a rule to a clause it does not cover.
  • A clause may still be flagged using generic risk analysis even when no rule applies — but matchedPlaybookTopic must be null in that case.`;
  }

  const matchedTopicInstruction = hasPlaybook
    ? `  matchedPlaybookTopic: set to the exact playbook rule topic string when a playbook rule applies; null otherwise.`
    : `  matchedPlaybookTopic: always null (no playbook supplied).`;

  return `You are an expert Corporate Counsel and Contract Risk Evaluator.

You will receive a SECTION of a contract. Your task is to identify every negotiation-worthy clause in that section and return structured JSON.
${playbookSection}

${GENERIC_SCOPE}

${RISK_GRADING}

${EXTRACTION_RULE}

matchedPlaybookTopic field:
${matchedTopicInstruction}

OUTPUT:
  Return ONLY the JSON object. No markdown fences, no preamble, no commentary.
  If no negotiation-worthy clauses exist in this section, return { "markups": [] }.`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Splits `text` into overlapping chunks of `CHUNK_SIZE` characters.
 * Each chunk after the first starts `CHUNK_OVERLAP` characters before the
 * previous chunk ended, so no clause is silently cut off at a boundary.
 */
function splitIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - CHUNK_OVERLAP;
  }

  return chunks;
}

/**
 * Returns a short deterministic 8-character hex identifier for a clause,
 * derived from the first 256 chars of its verbatim text.
 * Identical text always produces the same ID across calls.
 */
function stableClauseId(original: string): string {
  const fingerprint = crypto
    .createHash("sha256")
    .update(original.slice(0, 256).trim())
    .digest("hex")
    .slice(0, 8);
  return `clause-${fingerprint}`;
}

/**
 * Normalises a string for deduplication comparison:
 * collapses all whitespace runs to a single space and lowercases.
 */
function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Locates the first occurrence of `original` inside `documentText` using:
 *   1. Exact match (indexOf).
 *   2. Normalised-whitespace case-insensitive match as fallback.
 * Returns the character offset, or -1 if not found.
 */
function locateInDocument(original: string, documentText: string): number {
  // Exact match first
  const exact = documentText.indexOf(original);
  if (exact !== -1) return exact;

  // Normalised fallback — build a collapsed version of the document and
  // map normalised positions back to original positions.
  const normTarget = normalise(original);
  if (!normTarget) return -1;

  // Walk document chars, building a parallel normalised stream + offset map
  const normChars: string[] = [];
  const normToOrig: number[] = [];
  let prevWasSpace = false;

  for (let i = 0; i < documentText.length; i++) {
    const ch = documentText[i];
    if (/\s/.test(ch)) {
      if (!prevWasSpace) {
        normChars.push(" ");
        normToOrig.push(i);
        prevWasSpace = true;
      }
    } else {
      normChars.push(ch.toLowerCase());
      normToOrig.push(i);
      prevWasSpace = false;
    }
  }

  const normDoc = normChars.join("");
  const idx = normDoc.indexOf(normTarget);
  if (idx === -1) return -1;

  return normToOrig[idx];
}

// ─── Risk level ordering (for dedup winner selection) ────────────────────────

const RISK_ORDER: Record<string, number> = { RED: 2, YELLOW: 1, GREEN: 0 };

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Evaluates the full document content for negotiation-worthy clauses.
 *
 * 1. Splits into overlapping chunks.
 * 2. Runs one `executeJsonCompletion` call per chunk IN PARALLEL — the
 *    existing `geminiScheduler` inside the LLM layer handles rate-limiting.
 * 3. Deduplicates by normalised original text, keeping the highest-risk finding.
 * 4. Resolves each finding's `charOffset` against the original plaintext.
 * 5. Assigns stable, hash-derived `clauseId` values.
 *
 * @param documentText  Full plain-text content of the contract.
 * @param documentTitle Human-readable title for logging.
 * @param documentType  Contract type label (e.g. "MSA", "NDA").
 * @param playbookRules Optional array of playbook rules to inject into the
 *                      evaluation prompt. When supplied the LLM compares each
 *                      clause against these rules and sets matchedPlaybookTopic
 *                      only when a genuine match exists.
 */
export async function evaluateFullDocument(
  documentText: string,
  documentTitle: string,
  documentType: string,
  playbookRules: PlaybookRuleInput[] = []
): Promise<NegotiateMarkup[]> {
  const chunks = splitIntoChunks(documentText);

  console.log(
    `[negotiateChunker] Evaluating "${documentTitle}" — ` +
      `${documentText.length} chars split into ${chunks.length} chunk(s), ` +
      `playbookRules=${playbookRules.length}`
  );

  // Build the system prompt once — shared across all chunks for this call.
  const systemPrompt = buildSystemPrompt(playbookRules);

  // ── Fire all chunk evaluations in parallel ────────────────────────────────
  const chunkResults = await Promise.allSettled(
    chunks.map((chunk, idx) =>
      evaluateChunk(chunk, idx, chunks.length, documentTitle, documentType, systemPrompt)
    )
  );

  // ── Collect candidates; log any chunk failures ────────────────────────────
  const allCandidates: RawMarkupCandidate[] = [];

  for (let i = 0; i < chunkResults.length; i++) {
    const result = chunkResults[i];
    if (result.status === "fulfilled") {
      allCandidates.push(...result.value);
    } else {
      console.warn(
        `[negotiateChunker] Chunk ${i + 1}/${chunks.length} failed: ${result.reason?.message ?? result.reason}`
      );
    }
  }

  if (allCandidates.length === 0) {
    console.log(`[negotiateChunker] No markup candidates returned for "${documentTitle}"`);
    return [];
  }

  // ── Deduplicate by normalised original text ───────────────────────────────
  // When two chunks overlap and both flag the same clause, keep the one with
  // the higher risk level. On a tie, keep the first encountered.
  const seen = new Map<string, RawMarkupCandidate>();

  for (const candidate of allCandidates) {
    const key = normalise(candidate.original).slice(0, 300);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, candidate);
    } else if (RISK_ORDER[candidate.riskLevel] > RISK_ORDER[existing.riskLevel]) {
      seen.set(key, candidate);
    }
  }

  // ── Build final NegotiateMarkup list ─────────────────────────────────────
  const markups: NegotiateMarkup[] = [];

  for (const candidate of seen.values()) {
    const charOffset = locateInDocument(candidate.original, documentText);

    if (charOffset === -1) {
      // The LLM returned text that doesn't exist verbatim in the document.
      // This is a hallucination/paraphrase — discard the candidate.
      console.warn(
        `[negotiateChunker] Discarding candidate — original text not found in document. ` +
          `Preview: "${candidate.original.slice(0, 80)}..."`
      );
      continue;
    }

    // Sanitise matchedPlaybookTopic: only accept truthy strings that are not
    // literally "null" or "undefined" (LLM may return the string form).
    const rawTopic = candidate.matchedPlaybookTopic;
    const matchedPlaybookTopic: string | null =
      rawTopic && typeof rawTopic === "string" &&
      rawTopic.toLowerCase() !== "null" &&
      rawTopic.toLowerCase() !== "undefined" &&
      rawTopic.trim().length > 0
        ? rawTopic.trim()
        : null;

    markups.push({
      clauseId: stableClauseId(candidate.original),
      original: candidate.original,
      replacement: candidate.replacement,
      reasoning: candidate.reasoning,
      riskLevel: candidate.riskLevel,
      clauseType: candidate.clauseType,
      charOffset,
      matchedPlaybookTopic,
    });
  }

  // Sort by document position so the panel lists clauses in reading order
  markups.sort((a, b) => a.charOffset - b.charOffset);

  const playbookGrounded = markups.filter((m) => m.matchedPlaybookTopic !== null).length;
  console.log(
    `[negotiateChunker] Final markups for "${documentTitle}": ` +
      `${markups.length} (${playbookGrounded} playbook-grounded, ` +
      `${markups.length - playbookGrounded} generic) ` +
      `from ${allCandidates.length} raw candidates across ${chunks.length} chunk(s)`
  );

  return markups;
}

// ─── Per-chunk LLM call ───────────────────────────────────────────────────────

async function evaluateChunk(
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
  documentTitle: string,
  documentType: string,
  systemPrompt: string
): Promise<RawMarkupCandidate[]> {
  const userPrompt = `Document: ${documentTitle} (${documentType})
Chunk ${chunkIndex + 1} of ${totalChunks}

[CONTRACT CHUNK]
${chunk}`;

  const parsed = await executeJsonCompletion<{ markups: RawMarkupCandidate[] }>(
    userPrompt,
    systemPrompt,
    CHUNK_MARKUP_SCHEMA,
    LLMTask.STRUCTURAL_JSON,
    LLMProvider.GEMINI
  );

  const markups = Array.isArray(parsed?.markups) ? parsed.markups : [];

  // Filter out any candidates where the LLM produced an empty or suspiciously
  // short original (less than 15 chars is almost certainly a mis-extraction).
  return markups.filter(
    (m) =>
      m &&
      typeof m.original === "string" &&
      m.original.trim().length >= 15 &&
      typeof m.replacement === "string" &&
      m.replacement.trim().length > 0 &&
      typeof m.reasoning === "string" &&
      ["RED", "YELLOW", "GREEN"].includes(m.riskLevel)
  );
}
