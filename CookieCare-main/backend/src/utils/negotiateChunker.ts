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
 *  - Cross-location dedup: if the same specific negotiation issue appears at
 *    multiple document locations (body + appendix), the highest-severity
 *    instance is kept and the others are suppressed.
 */

import crypto from "crypto";
import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../llm/index.js";
import { looksLikeCiphertext } from "./crypto.js";
import {
  currentEvalDiag,
  diagId,
  diagRetag,
  diagTag,
  evalDiagEnvEnabled,
  recordChunking,
  recordDocumentIdentity,
  recordDrop,
  recordFinal,
  recordRawChunk,
  recordStage,
  runWithEvalDiag,
  snapCandidate,
  previewText,
} from "./negotiateEvalDiag.js";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Minimal playbook rule shape accepted by the evaluator. */
export interface PlaybookRuleInput {
  topic: string;
  standardPosition: string;
  fallbackPositions: string[];
  walkAwayCondition: string;
}

export interface RawMarkupCandidate {
  /** LLM-assigned label — used only for logging, replaced before return. */
  llmLabel: string;
  original: string;
  replacement: string;
  reasoning: string;
  riskLevel: "RED" | "YELLOW" | "GREEN";
  clauseType: string;
  /**
   * Specific negotiation issue identity — closed enum, used solely for
   * cross-location deduplication inside evaluateFullDocument. Never written
   * to NegotiateMarkup, the DB, or any route response.
   */
  issueTag: IssueTag;
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

// ─── Issue tag taxonomy ───────────────────────────────────────────────────────
//
// A closed 22-value enum identifying the SPECIFIC negotiation issue being
// raised, independently of clause location in the document. Used exclusively
// for cross-location deduplication inside evaluateFullDocument — it is
// internal to RawMarkupCandidate and is never written to NegotiateMarkup,
// the DB, or any route response.
//
// Design intent: two values that are commonly found in adjacent sub-clauses
// (e.g. governing_law_non_domestic + dispute_resolution_mechanism) are kept
// SEPARATE so that proximity alone never causes an incorrect merge. A merge
// only fires when both issueTag AND clauseType match, meaning the model
// independently identified the same specific legal problem at two different
// document locations.

const ISSUE_TAG_TAXONOMY = [
  "breach_notification_deadline",    // timing / fixed deadline for incident notification
  "breach_notification_scope",       // what triggers notification (definition of breach)
  "data_retention_deletion",         // retention limits, deletion obligations, data return
  "subprocessor_approval_objection", // right to approve / object to new sub-processors
  "subprocessor_flow_down",          // obligations must flow down to sub-processors
  "international_transfer_mechanism",// adequacy decision, SCCs, BCRs for intl transfers
  "liability_cap",                   // presence and amount of aggregate liability cap
  "liability_dp_breach_carveout",    // DP breaches carved out of master-agreement cap
  "indemnity_scope",                 // scope and one-sidedness of indemnity obligation
  "termination_for_convenience",     // unilateral termination without cause
  "governing_law_non_domestic",      // governing law outside a favourable jurisdiction
  "dispute_resolution_mechanism",    // arbitration vs. litigation choice, venue
  "audit_rights_scope",              // whether audit / inspection rights exist
  "audit_rights_practical",          // whether audit rights are practically usable
  "confidentiality_scope",           // breadth of confidentiality obligation
  "ip_assignment_breadth",           // breadth of IP assignment or work-for-hire clause
  "force_majeure_scope",             // scope of force majeure exclusions
  "payment_terms_imbalance",         // asymmetric payment / late payment terms
  "assignment_restriction",          // ability to assign without counterparty consent
  "compliance_obligation_scope",     // scope of imposed regulatory compliance obligations
  "warranty_scope",                  // scope and one-sidedness of warranties
  "other",                           // catch-all; excluded from cross-location merge
] as const;

export type IssueTag = (typeof ISSUE_TAG_TAXONOMY)[number];

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
          "issueTag",
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
          issueTag: {
            type: "string",
            enum: ISSUE_TAG_TAXONOMY as unknown as string[],
            description:
              "The single most specific negotiation issue this finding raises. " +
              "Choose the most precise matching value from the enum. " +
              "Use \"other\" only when no specific value applies.",
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

// RISK_GRADING now includes:
//  1. A CALIBRATION block that distinguishes standard variants from genuinely
//     problematic ones — prevents suppression of legitimate issues by giving
//     the model a discrimination signal rather than a broad block-list.
//  2. The three severity tiers (RED / YELLOW / GREEN), unchanged.
//  3. A severity-consistency instruction for same-issue multi-location documents.
const RISK_GRADING = `CALIBRATION — before grading, distinguish the standard variant from a genuinely problematic one:
  • Breach-scope carve-outs: excluding failed logins, automated scanning traffic, or
    denial-of-service attempts from the definition of a personal-data breach is standard
    and market-expected — do NOT flag. Flag only if the carve-out is so broadly drafted
    that it could exclude a genuine data breach (e.g. "any attack by a third party is
    excluded regardless of outcome").
  • Acceptance / formation clauses: click-wrap acceptance language, browse-wrap notices,
    and "by using the service you agree" formation clauses are standard SaaS mechanics —
    do NOT flag. Flag only if the acceptance clause itself waives a material right
    (e.g. waives the right to object to sub-processors or to receive breach notifications).
  • No-admission clauses: "nothing in this agreement constitutes an admission of liability"
    is standard boilerplate — do NOT flag.
  • Data deletion on plan expiry: a provider's contractual right to delete data after a
    free-plan, trial-plan, or lapsed subscription expires is a standard SaaS commercial
    term. Grade YELLOW at most (the timing and notice period may be negotiable), not RED,
    unless the deletion is stated to be immediate, with no export window, or explicitly
    irreversible.
  • Definitions sections: clauses that only define terms without creating operative
    obligations produce no negotiation value — skip them entirely.

RISK GRADING:
  RED    — Uncapped or broad liability exposure, unilateral rights, broad IP assignment,
            non-domestic governing law, unreasonably punitive terms.
  YELLOW — Imbalanced but negotiable: long notice periods, broad audit rights, no
            mutual termination, vague payment timelines, overly broad confidentiality.
  GREEN  — Fair and market-standard. Flag only if a minor improvement is clearly
            available; skip entirely if the clause needs no change.

SEVERITY CONSISTENCY: When the same specific contractual obligation appears at multiple
  locations in the document (for example, a breach-notification deadline stated in both
  a main clause and an appendix), assign the same severity to every instance — do not
  rate an identical obligation differently based solely on where it appears in the document.`;

const EXTRACTION_RULE = `EXTRACTION RULE — CRITICAL:
  The "original" field MUST be copied character-for-character from the [CONTRACT CHUNK]
  below. Do not truncate, paraphrase, merge, or alter any character. If a clause spans
  multiple sentences, include the full relevant span.`;

const ISSUE_TAG_INSTRUCTION = `issueTag field:
  Choose the single most specific value from this closed list that describes the
  negotiation issue this finding raises:
    breach_notification_deadline | breach_notification_scope |
    data_retention_deletion | subprocessor_approval_objection | subprocessor_flow_down |
    international_transfer_mechanism | liability_cap | liability_dp_breach_carveout |
    indemnity_scope | termination_for_convenience | governing_law_non_domestic |
    dispute_resolution_mechanism | audit_rights_scope | audit_rights_practical |
    confidentiality_scope | ip_assignment_breadth | force_majeure_scope |
    payment_terms_imbalance | assignment_restriction | compliance_obligation_scope |
    warranty_scope | other
  Use "other" only when none of the specific values apply. Note: governing_law_non_domestic
  and dispute_resolution_mechanism are distinct issues — do not conflate them.`;

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

${ISSUE_TAG_INSTRUCTION}

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

/** Diagnostic-only reconstruction of the same bounds splitIntoChunks uses. Not used for evaluation. */
function chunkBoundsForDiag(textLength: number): { start: number; end: number }[] {
  if (textLength <= CHUNK_SIZE) return [{ start: 0, end: textLength }];
  const bounds: { start: number; end: number }[] = [];
  let start = 0;
  while (start < textLength) {
    const end = Math.min(start + CHUNK_SIZE, textLength);
    bounds.push({ start, end });
    if (end === textLength) break;
    start = end - CHUNK_OVERLAP;
  }
  return bounds;
}

/**
 * Returns a short deterministic 8-character hex identifier for a clause,
 * derived from the first 256 chars of its verbatim text.
 * Identical text always produces the same ID across calls.
 */
function stableClauseId(original: string): string {
  // Hash the FULL clause text, not just the first 256 chars.
  // Truncating to 256 chars caused collisions when two clauses shared the same
  // opening text (e.g. both start with "The Company shall…" and diverge only
  // after the 256-char window). 8 hex chars = 32 bits of entropy; collisions
  // across 10–20 clauses per document were rare but not impossible once the
  // hash input was artificially shortened. Using the full text eliminates the
  // truncation-induced false collisions while keeping the 8-char output short.
  const fingerprint = crypto
    .createHash("sha256")
    .update(original.trim())
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
 * Applies typographic normalization on top of whitespace normalization.
 * Folds common LLM-emitted typographic variants (curly quotes, en/em dashes,
 * non-breaking spaces) to their ASCII equivalents so that a candidate whose
 * original field was silently mutated by the model can still be located.
 *
 * Applied only in the third locateInDocument pass — does NOT affect the
 * primary exact-match or secondary whitespace-normalized passes.
 */
function typoNorm(text: string): string {
  return text
    // Curly / typographic single quotes → straight apostrophe
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    // Curly / typographic double quotes → straight double quote
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    // En-dash, em-dash, horizontal bar, soft hyphen → ASCII hyphen
    .replace(/[\u2013\u2014\u2015\u00AD]/g, "-")
    // Non-breaking space, narrow no-break space, thin space, zero-width space → space
    .replace(/[\u00A0\u202F\u2009\u200B]/g, " ")
    // Collapse all whitespace runs and lowercase — same as normalise()
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Locates the first occurrence of `original` inside `documentText` using
 * three passes of increasing tolerance:
 *
 *   1. Exact byte match (indexOf).
 *   2. Whitespace-normalised case-insensitive match — handles line-break
 *      variants that the LLM may introduce when producing multi-line spans.
 *   3. Typographic-normalised match — additionally folds curly quotes,
 *      en/em dashes, and non-breaking spaces to their ASCII equivalents,
 *      covering the most common LLM tokenizer mutations.
 *
 * Each pass builds a character-offset map so the returned offset always
 * points into the ORIGINAL (un-normalised) documentText.
 *
 * Returns the character offset, or -1 if not found by any pass.
 */
function locateInDocument(original: string, documentText: string): number {
  // ── Pass 1: exact match ───────────────────────────────────────────────────
  const exact = documentText.indexOf(original);
  if (exact !== -1) return exact;

  // ── Shared helper: build normalised stream + offset map ───────────────────
  // Used by both pass 2 (whitespace only) and pass 3 (typoNorm).
  function buildNormStream(
    source: string,
    normChar: (ch: string) => string | null  // returns null to skip char, or replacement
  ): { normStr: string; normToOrig: number[] } {
    const normChars: string[] = [];
    const normToOrig: number[] = [];
    let prevWasSpace = false;

    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      const mapped = normChar(ch);
      if (mapped === null) continue; // skip (e.g. zero-width space)
      if (mapped === " ") {
        if (!prevWasSpace) {
          normChars.push(" ");
          normToOrig.push(i);
          prevWasSpace = true;
        }
      } else {
        normChars.push(mapped);
        normToOrig.push(i);
        prevWasSpace = false;
      }
    }
    return { normStr: normChars.join(""), normToOrig };
  }

  // ── Pass 2: whitespace-normalised, lowercased ─────────────────────────────
  const normTarget2 = normalise(original);
  if (normTarget2) {
    const { normStr: normDoc2, normToOrig: map2 } = buildNormStream(
      documentText,
      (ch) => (/\s/.test(ch) ? " " : ch.toLowerCase())
    );
    const idx2 = normDoc2.indexOf(normTarget2);
    if (idx2 !== -1) return map2[idx2];
  }

  // ── Pass 3: typographic-normalised ───────────────────────────────────────
  // Maps each source character through the same substitutions as typoNorm()
  // before whitespace collapsing so the offset map stays aligned.
  const typoSubstitute = (ch: string): string | null => {
    // Zero-width space — skip entirely (null = omit from stream)
    if (ch === "\u200B") return null;
    // Non-breaking / narrow / thin space variants → plain space (collapse handled below)
    if (ch === "\u00A0" || ch === "\u202F" || ch === "\u2009") return " ";
    // Curly single quotes → straight apostrophe
    if ("\u2018\u2019\u201A\u201B\u2032\u2035".includes(ch)) return "'";
    // Curly double quotes → straight double quote
    if ("\u201C\u201D\u201E\u201F\u2033\u2036".includes(ch)) return '"';
    // En-dash, em-dash, horizontal bar, soft hyphen → ASCII hyphen
    if ("\u2013\u2014\u2015\u00AD".includes(ch)) return "-";
    // Whitespace (including ASCII) → space token (collapse handled by buildNormStream)
    if (/\s/.test(ch)) return " ";
    return ch.toLowerCase();
  };

  const normTarget3 = typoNorm(original);
  if (normTarget3) {
    const { normStr: normDoc3, normToOrig: map3 } = buildNormStream(documentText, typoSubstitute);
    const idx3 = normDoc3.indexOf(normTarget3);
    if (idx3 !== -1) return map3[idx3];
  }

  return -1;
}

// ─── Risk level ordering (for dedup winner selection) ────────────────────────

const RISK_ORDER: Record<string, number> = { RED: 2, YELLOW: 1, GREEN: 0 };

// ─── Cross-location issue-identity deduplication ─────────────────────────────

/**
 * Merges candidates that represent the SAME specific negotiation issue at
 * different document locations (e.g. a breach-notification deadline stated
 * in both a main clause and an appendix).
 *
 * Merge criterion — ALL three conditions must hold:
 *   1. Same issueTag (closed enum — both candidates identify the same specific
 *      legal problem, not just the same broad clause category).
 *   2. Same clauseType (ensures "other" catch-all and unrelated issues of the
 *      same type are not incorrectly collapsed).
 *   3. Neither candidate's original text is a substring of the other after
 *      normalisation — guards against the overlap-region case where two
 *      chunks flagged slightly different spans of the same clause. Stage B
 *      of the text-key dedup step handles substring-overlap artifacts before
 *      this function runs; any pair that still has a substring relationship
 *      here is left as-is (safer to show a duplicate than to drop a
 *      genuinely distinct same-type finding).
 *
 * Exclusions:
 *   - issueTag === "other": excluded from issue-identity merge to prevent
 *     the catch-all from absorbing unrelated findings.
 *
 * Winner selection when merging a pair:
 *   - Higher RISK_ORDER wins.
 *   - On tie: prefer the candidate whose original text can be located in the
 *     document (locateInDocument probe), to avoid discarding a groundable
 *     candidate in favour of one that will later be dropped by the grounding
 *     loop. On a probe tie, keep the first-encountered.
 *
 * Severity normalization: the surviving winner's riskLevel is set to the
 * maximum of the pair — scoped exclusively to confirmed duplicate clusters,
 * never applied globally across clauseType.
 *
 * Returns the deduplicated candidate array (length ≤ input length).
 */
function mergeByIssueIdentity(
  candidates: RawMarkupCandidate[],
  documentText: string
): RawMarkupCandidate[] {
  if (candidates.length <= 1) return candidates;

  // Build a mutable working set indexed by position.
  const active = new Set<number>(candidates.map((_, i) => i));

  for (let i = 0; i < candidates.length; i++) {
    if (!active.has(i)) continue;
    const a = candidates[i];

    // "other" is excluded from cross-location merge.
    if (a.issueTag === "other") continue;

    for (let j = i + 1; j < candidates.length; j++) {
      if (!active.has(j)) continue;
      const b = candidates[j];

      // Condition 1: same specific issue tag (and neither is "other")
      if (a.issueTag !== b.issueTag || b.issueTag === "other") continue;

      // Condition 2: same broad clause type
      if (a.clauseType !== b.clauseType) continue;

      // Condition 3: not an overlap-region variant (neither is a substring of
      // the other after normalisation). If one contains the other, Stage B of
      // the text-key dedup step should have collapsed them already. If it did
      // not (e.g. different clauseType escaped Stage B), leave both as-is —
      // it is safer to show a duplicate than to silently drop a distinct
      // finding that happens to share the same issueTag and clauseType.
      // Genuine cross-location duplicates have non-overlapping text (same issue
      // stated independently at two document locations — body clause vs appendix
      // clause — so neither contains the other).
      const na = normalise(a.original);
      const nb = normalise(b.original);
      if (na.includes(nb) || nb.includes(na)) continue;

      // All three conditions passed — this is a genuine cross-location duplicate.
      // Determine winner: higher severity first; on tie probe groundability.
      const aRisk = RISK_ORDER[a.riskLevel] ?? 0;
      const bRisk = RISK_ORDER[b.riskLevel] ?? 0;

      let keepIdx: number;
      let dropIdx: number;

      if (aRisk > bRisk) {
        keepIdx = i; dropIdx = j;
      } else if (bRisk > aRisk) {
        keepIdx = j; dropIdx = i;
      } else {
        // Equal severity — prefer the one whose original text is groundable.
        const aLocatable = locateInDocument(a.original, documentText) !== -1;
        const bLocatable = locateInDocument(b.original, documentText) !== -1;
        if (!aLocatable && bLocatable) {
          keepIdx = j; dropIdx = i;
        } else {
          // a is groundable or both are equally un-groundable — keep a (first-encountered).
          keepIdx = i; dropIdx = j;
        }
      }

      // Apply severity normalization: winner inherits max(a.riskLevel, b.riskLevel).
      // Since we already selected winner as the higher-severity candidate, this is
      // a no-op in the aRisk ≠ bRisk case. For ties it keeps the level unchanged.
      const maxRisk = aRisk >= bRisk ? a.riskLevel : b.riskLevel;
      if (candidates[keepIdx].riskLevel !== maxRisk) {
        // Clone to avoid mutating the original array element in place
        const prev = candidates[keepIdx];
        candidates[keepIdx] = { ...prev, riskLevel: maxRisk };
        diagRetag(prev, candidates[keepIdx]);
      }

      const mergeReason =
        aRisk !== bRisk
          ? "issue_identity_higher_risk"
          : keepIdx !== i
            ? "issue_identity_tie_prefer_groundable"
            : "issue_identity_tie_keep_first";
      recordDrop(
        "issueIdentity",
        mergeReason,
        candidates[dropIdx],
        candidates[keepIdx],
        { issueTag: a.issueTag, clauseType: a.clauseType }
      );

      active.delete(dropIdx);
      console.log(
        `[negotiateChunker] Cross-location dedup: merged issueTag="${a.issueTag}" ` +
          `clauseType="${a.clauseType}" — kept "${candidates[keepIdx].original.slice(0, 60)}..." ` +
          `(${maxRisk}), discarded "${candidates[dropIdx].original.slice(0, 60)}..."`
      );
    }
  }

  return candidates.filter((_, i) => active.has(i));
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Evaluates the full document content for negotiation-worthy clauses.
 *
 * 1. Splits into overlapping chunks.
 * 2. Runs one `executeJsonCompletion` call per chunk IN PARALLEL — the
 *    existing `geminiScheduler` inside the LLM layer handles rate-limiting.
 * 3. Deduplicates by normalised original text, keeping the highest-risk finding.
 * 4. Deduplicates cross-location by issueTag + clauseType identity, keeping
 *    the highest-severity grounded instance per specific negotiation issue.
 * 5. Resolves each finding's `charOffset` against the original plaintext.
 * 6. Assigns stable, hash-derived `clauseId` values.
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
  // Temporary diagnostic wrap: when NEGOTIATE_EVAL_DIAG=1 and no trace is
  // already active, record this run and persist it. Recurses once into the
  // same function under AsyncLocalStorage — evaluation logic is unchanged.
  if (!currentEvalDiag() && evalDiagEnvEnabled()) {
    const { result } = await runWithEvalDiag(
      { documentTitle, documentType },
      () => evaluateFullDocument(documentText, documentTitle, documentType, playbookRules),
      { persist: true }
    );
    return result;
  }

  // Defensive boundary: every caller (POST /evaluate, POST /session/resolve)
  // funnels through here. If a caller reads files.content without checking
  // is_encrypted, or a decryption call fails, that must never reach the LLM
  // as if it were contract text — fail loudly instead of silently generating
  // a "finding" out of ciphertext bytes.
  if (looksLikeCiphertext(documentText)) {
    throw new Error(
      `Document "${documentTitle}" content is encrypted or corrupted, not decrypted plaintext — refusing to evaluate.`
    );
  }

  const chunks = splitIntoChunks(documentText);

  console.log(
    `[negotiateChunker] Evaluating "${documentTitle}" — ` +
      `${documentText.length} chars split into ${chunks.length} chunk(s), ` +
      `playbookRules=${playbookRules.length}`
  );

  // Build the system prompt once — shared across all chunks for this call.
  const systemPrompt = buildSystemPrompt(playbookRules);

  recordDocumentIdentity({
    documentText,
    documentTitle,
    documentType,
    playbookRules,
    systemPrompt,
  });
  recordChunking({
    chunks,
    bounds: chunkBoundsForDiag(documentText.length),
    documentText,
  });

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
      result.value.forEach((c, j) => diagTag(c, `c${i}.${j}`));
      allCandidates.push(...result.value);
    } else {
      recordRawChunk({
        chunkIndex: i,
        chunkId: `chunk-${i}`,
        status: "rejected",
        rejectReason: String(result.reason?.message ?? result.reason ?? "unknown"),
        llmReturnedCount: 0,
        invalidDroppedCount: 0,
        invalidPreviews: [],
        clampedToYellowCount: 0,
        candidateCount: 0,
        candidates: [],
      });
      console.warn(
        `[negotiateChunker] Chunk ${i + 1}/${chunks.length} failed: ${result.reason?.message ?? result.reason}`
      );
    }
  }

  {
    const t = currentEvalDiag();
    if (t) t.rawLlm.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  if (allCandidates.length === 0) {
    console.log(`[negotiateChunker] No markup candidates returned for "${documentTitle}"`);
    recordStage("stageA_prefix", { inputCount: 0, outputCount: 0, candidates: [], drops: [] });
    recordStage("stageB_substring", { inputCount: 0, outputCount: 0, candidates: [], drops: [] });
    recordStage("issueIdentity", { inputCount: 0, outputCount: 0, candidates: [], drops: [] });
    recordStage("grounding", { inputCount: 0, outputCount: 0, candidates: [], drops: [] });
    recordFinal([]);
    return [];
  }

  // ── Step 1: Deduplicate by normalised original text ───────────────────────
  // When two chunks overlap and both flag the same clause TEXT, keep the one
  // with the higher risk level. On a tie, keep the first encountered.
  // This handles the same-chunk-boundary artifact only — it does not address
  // the same negotiation issue appearing at different document locations.
  //
  // Two-stage approach:
  //
  // Stage A: 300-char prefix key dedup.
  //   Groups candidates whose normalised text STARTS the same way. Covers the
  //   common case where two overlap-chunks flag the same clause with identical
  //   or near-identical text (same opening sentence, minor tail difference).
  //   300 chars is kept deliberately — using the full string would miss cases
  //   where the LLM truncated a long clause differently in each chunk.
  //
  // Stage B: substring collapse.
  //   After Stage A, scan all surviving candidates for pairs where one
  //   normalised original is a strict substring of the other. These are
  //   overlap-region artifacts where chunk A flagged "sentence 1 sentence 2"
  //   and chunk B flagged just "sentence 1" (or vice versa). The longer span
  //   always wins — it carries more context for the LLM's suggested replacement
  //   and a more precise charOffset. On a risk-level tie the longer span wins;
  //   if the shorter span has a strictly higher risk level it wins instead.
  //   This stage deliberately does NOT apply across different clauseTypes —
  //   a short liability clause that appears verbatim inside a longer indemnity
  //   clause is a genuinely distinct finding and must NOT be suppressed.

  // Stage A: 300-char prefix key
  const seen = new Map<string, RawMarkupCandidate>();

  for (const candidate of allCandidates) {
    const key = normalise(candidate.original).slice(0, 300);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, candidate);
    } else if (RISK_ORDER[candidate.riskLevel] > RISK_ORDER[existing.riskLevel]) {
      recordDrop("stageA_prefix", "stageA_higher_risk", existing, candidate, { prefixKey: key.slice(0, 80) });
      seen.set(key, candidate);
    } else {
      recordDrop(
        "stageA_prefix",
        "stageA_keep_first_equal_or_higher_risk",
        candidate,
        existing,
        { prefixKey: key.slice(0, 80) }
      );
    }
  }

  // Stage B: substring collapse (same clauseType only)
  const stageAList = [...seen.values()];
  recordStage("stageA_prefix", {
    inputCount: allCandidates.length,
    outputCount: stageAList.length,
    candidates: stageAList.map((c) => snapCandidate(c, diagId(c))),
    drops: [],
  });
  const substrDropped = new Set<number>();

  for (let i = 0; i < stageAList.length; i++) {
    if (substrDropped.has(i)) continue;
    const a = stageAList[i];
    const na = normalise(a.original);

    for (let j = i + 1; j < stageAList.length; j++) {
      if (substrDropped.has(j)) continue;
      const b = stageAList[j];

      // Only collapse within the same clause category — different clauseTypes
      // are assumed to be genuinely distinct findings even if text overlaps.
      if (a.clauseType !== b.clauseType) continue;

      const nb = normalise(b.original);

      // Check strict substring containment (not equality — equality was
      // already handled by Stage A's prefix key).
      const aContainsB = na.includes(nb) && na.length > nb.length;
      const bContainsA = nb.includes(na) && nb.length > na.length;

      if (!aContainsB && !bContainsA) continue;

      // Determine winner: higher risk wins; on tie the LONGER span wins
      // (more context for replacement drafting and charOffset precision).
      const aRisk = RISK_ORDER[a.riskLevel] ?? 0;
      const bRisk = RISK_ORDER[b.riskLevel] ?? 0;

      let dropIdx: number;
      if (aRisk > bRisk) {
        dropIdx = j;
      } else if (bRisk > aRisk) {
        dropIdx = i;
      } else {
        // Equal risk — longer span wins
        dropIdx = aContainsB ? j : i;
      }

      // Apply risk normalization: surviving candidate gets max(a, b) risk
      const keepIdx = dropIdx === i ? j : i;
      const maxRiskLevel = aRisk >= bRisk ? a.riskLevel : b.riskLevel;
      if (stageAList[keepIdx].riskLevel !== maxRiskLevel) {
        const prev = stageAList[keepIdx];
        stageAList[keepIdx] = { ...prev, riskLevel: maxRiskLevel };
        diagRetag(prev, stageAList[keepIdx]);
      }

      const substrReason =
        aRisk !== bRisk
          ? "stageB_higher_risk"
          : aContainsB
            ? "stageB_longer_span"
            : "stageB_longer_span";
      recordDrop(
        "stageB_substring",
        substrReason,
        stageAList[dropIdx],
        stageAList[keepIdx],
        { clauseType: a.clauseType }
      );

      substrDropped.add(dropIdx);
      console.log(
        `[negotiateChunker] Substring dedup: collapsed span overlap ` +
          `clauseType="${a.clauseType}" — kept "${stageAList[keepIdx].original.slice(0, 60)}..." ` +
          `(${maxRiskLevel}), dropped "${stageAList[dropIdx].original.slice(0, 60)}..."`
      );

      // If i was dropped, no point comparing it further
      if (dropIdx === i) break;
    }
  }

  const textDedupedCandidates = stageAList.filter((_, i) => !substrDropped.has(i));
  recordStage("stageB_substring", {
    inputCount: stageAList.length,
    outputCount: textDedupedCandidates.length,
    candidates: textDedupedCandidates.map((c) => snapCandidate(c, diagId(c))),
    drops: [],
  });

  // ── Step 2: Cross-location issue-identity dedup ───────────────────────────
  // Merge candidates that represent the same SPECIFIC negotiation issue at
  // different document locations. Operates on the already text-deduped set
  // (smaller input, no overlap-region artifacts). documentText is passed so
  // the merge can probe groundability when selecting between equal-severity
  // candidates (prevents discarding a groundable candidate in favour of one
  // that will be dropped by the grounding loop below).
  const dedupedCandidates = mergeByIssueIdentity(textDedupedCandidates, documentText);
  recordStage("issueIdentity", {
    inputCount: textDedupedCandidates.length,
    outputCount: dedupedCandidates.length,
    candidates: dedupedCandidates.map((c) => snapCandidate(c, diagId(c))),
    drops: [],
  });

  const crossLocationDropped = textDedupedCandidates.length - dedupedCandidates.length;
  if (crossLocationDropped > 0) {
    console.log(
      `[negotiateChunker] Cross-location dedup removed ${crossLocationDropped} duplicate(s) ` +
        `from ${seen.size} text-deduped candidates`
    );
  }

  // ── Build final NegotiateMarkup list ─────────────────────────────────────
  const markups: NegotiateMarkup[] = [];
  const groundedSnaps: ReturnType<typeof snapCandidate>[] = [];
  const finalDiag: {
    clauseId: string;
    issueTag: string;
    clauseType: string;
    riskLevel: string;
    originalHash: string;
    originalPreview: string;
    charOffset: number;
    matchedPlaybookTopic: string | null;
  }[] = [];

  for (const candidate of dedupedCandidates) {
    const charOffset = locateInDocument(candidate.original, documentText);

    if (charOffset === -1) {
      // The LLM returned text that doesn't exist verbatim in the document
      // (even after whitespace and typographic normalization). This is a
      // hallucination/paraphrase — discard the candidate.
      recordDrop("grounding", "original_not_found_in_document", candidate);
      console.warn(
        `[negotiateChunker] Discarding candidate — original text not found in document. ` +
          `Preview: "${candidate.original.slice(0, 80)}..."`
      );
      continue;
    }

    groundedSnaps.push(snapCandidate(candidate, diagId(candidate)));

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

    // issueTag is intentionally NOT forwarded to NegotiateMarkup —
    // it is an internal dedup signal only and must not reach the DB or API.
    const clauseId = stableClauseId(candidate.original);
    markups.push({
      clauseId,
      original: candidate.original,
      replacement: candidate.replacement,
      reasoning: candidate.reasoning,
      riskLevel: candidate.riskLevel,
      clauseType: candidate.clauseType,
      charOffset,
      matchedPlaybookTopic,
    });
    finalDiag.push({
      clauseId,
      issueTag: candidate.issueTag,
      clauseType: candidate.clauseType,
      riskLevel: candidate.riskLevel,
      originalHash: snapCandidate(candidate).originalHash,
      originalPreview: previewText(candidate.original),
      charOffset,
      matchedPlaybookTopic,
    });
  }

  recordStage("grounding", {
    inputCount: dedupedCandidates.length,
    outputCount: groundedSnaps.length,
    candidates: groundedSnaps,
    drops: [],
  });

  // Sort by document position so the panel lists clauses in reading order
  markups.sort((a, b) => a.charOffset - b.charOffset);
  finalDiag.sort((a, b) => a.charOffset - b.charOffset);
  recordFinal(finalDiag);

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

  const rawMarkups = Array.isArray(parsed?.markups) ? parsed.markups : [];

  // ── Post-filter 1: structural validity ───────────────────────────────────
  // Removes candidates where the LLM produced an empty or suspiciously short
  // original (< 15 chars is almost certainly a mis-extraction), a missing
  // replacement, or an invalid riskLevel enum value.
  const valid = rawMarkups.filter(
    (m) =>
      m &&
      typeof m.original === "string" &&
      m.original.trim().length >= 15 &&
      typeof m.replacement === "string" &&
      m.replacement.trim().length > 0 &&
      typeof m.reasoning === "string" &&
      ["RED", "YELLOW", "GREEN"].includes(m.riskLevel)
  );

  const validSet = new Set(valid);
  const invalidPreviews = rawMarkups
    .filter((m) => !validSet.has(m))
    .map((m) => previewText(typeof m?.original === "string" ? m.original : String(m ?? ""), 80));

  // ── Post-filter 2: data_retention_deletion RED → YELLOW clamp ────────────
  // A provider's right to delete data on free-plan / trial-plan expiry is a
  // standard SaaS commercial term. The prompt calibration guides the model to
  // rate these YELLOW, but as a belt-and-suspenders guard we clamp any RED
  // finding with issueTag=data_retention_deletion to YELLOW unless the
  // reasoning contains an explicit aggravating signal (immediate/irreversible
  // deletion with no export window). This guard is scoped precisely to the
  // issueTag — it cannot affect other termination or data-protection findings.
  let clampedToYellowCount = 0;
  const out = valid.map((m) => {
    if (
      m.issueTag === "data_retention_deletion" &&
      m.riskLevel === "RED" &&
      !/immedi|no.{0,10}export|no.{0,10}retriev|irrecov|permanently.{0,10}delet/i.test(m.reasoning)
    ) {
      clampedToYellowCount += 1;
      return { ...m, riskLevel: "YELLOW" as const };
    }
    return m;
  });

  recordRawChunk({
    chunkIndex,
    chunkId: `chunk-${chunkIndex}`,
    status: "fulfilled",
    llmReturnedCount: rawMarkups.length,
    invalidDroppedCount: invalidPreviews.length,
    invalidPreviews,
    clampedToYellowCount,
    candidateCount: out.length,
    candidates: out.map((c, j) => snapCandidate(c, `c${chunkIndex}.${j}`)),
  });

  return out;
}
