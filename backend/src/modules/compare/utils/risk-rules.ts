/**
 * risk-rules.ts
 *
 * Lightweight deterministic rule engine for Risk Analysis (Phase 4).
 *
 * Runs before the LLM so that high-confidence risk patterns are classified
 * without an AI call.  Only ambiguous cases — those no rule fires on — are
 * forwarded to Gemini.
 *
 * Design philosophy:
 *   - Rules are additive: the first rule that matches a difference wins.
 *   - Each rule inspects the clause title(s) and semantic summary via
 *     case-insensitive regex patterns.
 *   - Rules produce RiskFinding objects with source: "deterministic" and
 *     a non-null triggeredRule label for auditability.
 *   - Rules deliberately err on the side of false positives (better to flag
 *     something the LLM later considers LOW than to miss a HIGH risk).
 *
 * Mirrors the deterministic-first philosophy of the clause matcher
 * (utils/deterministic-matcher.ts) and the diff step (steps/diff-detect.ts).
 */

import type {
  ClauseDifference,
  RiskFinding,
  RiskLevel,
  RiskCategory,
} from "../models/compare-state.js";
import type { EnrichedDifference } from "../prompts/risk-prompt.js";

// ─── Rule definition ──────────────────────────────────────────────────────────

interface RiskRule {
  /** Human-readable rule identifier — surfaces in RiskFinding.triggeredRule */
  id: string;
  /**
   * Patterns tested against: title text (both sides, lowercased) +
   * semantic summary (lowercased).  One match is sufficient to fire the rule.
   */
  patterns: RegExp[];
  /**
   * Classifications this rule applies to.
   * A rule only fires when the diff classification matches this set.
   */
  classifications: ClauseDifference["classification"][];
  level: RiskLevel;
  category: RiskCategory;
  rationale: string;
}

const RULES: RiskRule[] = [
  // ── Liability ──────────────────────────────────────────────────────────────

  {
    id: "LIABILITY_CAP_REMOVED",
    patterns: [
      /\blimitation of liability\b/,
      /\bliability cap\b/,
      /\baggregate liability\b/,
      /\bmaximum liability\b/,
      /\bcap on.*damage/,
    ],
    classifications: ["REMOVED", "MODIFIED_BROADER"],
    level: "HIGH",
    category: "liability",
    rationale:
      "The limitation of liability clause has been removed or materially expanded, " +
      "creating uncapped financial exposure for one or both parties.",
  },

  {
    id: "LIABILITY_CAP_REDUCED",
    patterns: [
      /\blimitation of liability\b/,
      /\bliability cap\b/,
      /\baggregate liability\b/,
    ],
    classifications: ["MODIFIED_NARROWER"],
    level: "MEDIUM",
    category: "liability",
    rationale:
      "The liability cap has been reduced relative to the original agreement, " +
      "lowering the recoverable ceiling for the capped party.",
  },

  {
    id: "UNLIMITED_LIABILITY",
    patterns: [/\bunlimited liability\b/, /\bno.*cap.*liabilit/, /\bliabilit.*uncapped\b/],
    classifications: ["ADDED", "MODIFIED_BROADER"],
    level: "HIGH",
    category: "liability",
    rationale:
      "The revised agreement introduces or expands language creating unlimited " +
      "liability exposure, removing any financial ceiling on damages.",
  },

  {
    id: "CONSEQUENTIAL_DAMAGES_REMOVED",
    patterns: [
      /\bconsequential damage/,
      /\bindirect damage/,
      /\bspecial damage/,
      /\bexclude.*damage/,
    ],
    classifications: ["REMOVED", "MODIFIED_NARROWER"],
    level: "HIGH",
    category: "liability",
    rationale:
      "The exclusion of consequential or indirect damages has been removed or narrowed, " +
      "exposing the party to claims for lost profits, business disruption, and other consequential losses.",
  },

  // ── Indemnity ──────────────────────────────────────────────────────────────

  {
    id: "INDEMNIFICATION_REMOVED",
    patterns: [/\bindemnif/, /\bhold harmless\b/, /\bdefend.*indemnif/],
    classifications: ["REMOVED"],
    level: "HIGH",
    category: "indemnity",
    rationale:
      "An indemnification provision has been removed from the revised agreement, " +
      "eliminating contractual protection against third-party claims in this category.",
  },

  {
    id: "INDEMNIFICATION_SCOPE_EXPANDED",
    patterns: [/\bindemnif/, /\bhold harmless\b/],
    classifications: ["MODIFIED_BROADER"],
    level: "MEDIUM",
    category: "indemnity",
    rationale:
      "The scope of the indemnification obligation has been expanded in the revised agreement, " +
      "increasing the categories of claims the indemnifying party must cover.",
  },

  // ── IP ─────────────────────────────────────────────────────────────────────

  {
    id: "IP_OWNERSHIP_CHANGED",
    patterns: [
      /\bintellectual property\b/,
      /\bip ownership\b/,
      /\bwork for hire\b/,
      /\bwork-for-hire\b/,
      /\bassignment of.*right/,
      /\bpropriet.*right/,
    ],
    classifications: ["MODIFIED_BROADER", "MODIFIED_NARROWER", "REMOVED", "ADDED"],
    level: "HIGH",
    category: "ip",
    rationale:
      "The intellectual property ownership clause has changed, potentially transferring " +
      "or limiting rights that were held under the original agreement.",
  },

  {
    id: "IP_LICENCE_CHANGED",
    patterns: [
      /\blicen[cs]e\b/,
      /\bgrant.*right/,
      /\bright.*use\b/,
      /\bresidul.*right/,
    ],
    classifications: ["MODIFIED_BROADER", "MODIFIED_NARROWER"],
    level: "MEDIUM",
    category: "ip",
    rationale:
      "The IP licence grant has changed in scope or duration, altering the rights " +
      "available to the licensee under the revised agreement.",
  },

  // ── Confidentiality ────────────────────────────────────────────────────────

  {
    id: "CONFIDENTIALITY_REMOVED",
    patterns: [/\bconfidential/, /\bnon.?disclosure\b/, /\bnda\b/, /\bproprietary information\b/],
    classifications: ["REMOVED"],
    level: "HIGH",
    category: "confidentiality",
    rationale:
      "The confidentiality obligation has been removed from the revised agreement, " +
      "leaving sensitive information without contractual protection.",
  },

  {
    id: "CONFIDENTIALITY_NARROWED",
    patterns: [/\bconfidential/, /\bnon.?disclosure\b/],
    classifications: ["MODIFIED_NARROWER"],
    level: "MEDIUM",
    category: "confidentiality",
    rationale:
      "The scope of the confidentiality obligation has been narrowed in the revised " +
      "agreement, reducing the category of information that is contractually protected.",
  },

  // ── Governing Law ──────────────────────────────────────────────────────────

  {
    id: "GOVERNING_LAW_CHANGED",
    patterns: [
      /\bgoverning law\b/,
      /\bchoice of law\b/,
      /\bapplicable law\b/,
      /\bjurisdiction\b/,
      /\bdispute resolution\b/,
    ],
    classifications: ["MODIFIED_BROADER", "MODIFIED_NARROWER", "REMOVED", "ADDED"],
    level: "HIGH",
    category: "governing_law",
    rationale:
      "The governing law or jurisdiction has changed, which may alter the enforceability " +
      "of key provisions and the available remedies in a dispute.",
  },

  // ── Data Protection ────────────────────────────────────────────────────────

  {
    id: "DATA_PROTECTION_CHANGED",
    patterns: [
      /\bdata protection\b/,
      /\bdata processing\b/,
      /\bpersonal data\b/,
      /\bgdpr\b/,
      /\bprivacy\b/,
      /\bdata breach\b/,
      /\bbreach notification\b/,
    ],
    classifications: ["REMOVED", "MODIFIED_NARROWER"],
    level: "HIGH",
    category: "data_protection",
    rationale:
      "A data protection obligation has been removed or narrowed, potentially creating " +
      "regulatory exposure under applicable privacy laws.",
  },

  // ── Audit Rights ───────────────────────────────────────────────────────────

  {
    id: "AUDIT_RIGHTS_UNLIMITED",
    patterns: [
      /\bunlimited.*audit\b/,
      /\baudit.*at.*any.*time\b/,
      /\baudit.*unrestricted\b/,
    ],
    classifications: ["ADDED", "MODIFIED_BROADER"],
    level: "MEDIUM",
    category: "audit_rights",
    rationale:
      "The revised agreement introduces or expands audit rights in a way that may impose " +
      "significant operational burden and cost on the audited party.",
  },

  {
    id: "AUDIT_RIGHTS_REMOVED",
    patterns: [/\baudit right/, /\bright.*audit/, /\baccess.*record/],
    classifications: ["REMOVED"],
    level: "MEDIUM",
    category: "audit_rights",
    rationale:
      "Audit rights that existed in the original agreement have been removed, " +
      "eliminating the ability to verify contractual compliance.",
  },

  // ── Payment ────────────────────────────────────────────────────────────────

  {
    id: "PAYMENT_TERMS_CHANGED",
    patterns: [
      /\bpayment term/,
      /\bfee[s]?\b/,
      /\bpric[ei]/,
      /\binvoic/,
      /\bset.off\b/,
      /\binterest.*rate/,
    ],
    classifications: ["MODIFIED_BROADER", "MODIFIED_NARROWER"],
    level: "MEDIUM",
    category: "payment",
    rationale:
      "Payment terms have been materially changed in the revised agreement, " +
      "altering the financial obligations or timing of one or both parties.",
  },

  // ── Termination ────────────────────────────────────────────────────────────

  {
    id: "TERMINATION_CONVENIENCE_REMOVED",
    patterns: [
      /\btermination for convenience\b/,
      /\bterminate.*convenience\b/,
      /\bconvenience.*terminat/,
    ],
    classifications: ["REMOVED", "MODIFIED_NARROWER"],
    level: "HIGH",
    category: "termination",
    rationale:
      "The right to terminate for convenience has been removed or restricted, " +
      "locking the affected party into the agreement without an exit mechanism.",
  },

  {
    id: "TERMINATION_NOTICE_SHORTENED",
    patterns: [/\bnotice period\b/, /\bnotice.*termination\b/, /\btermination.*notice\b/],
    classifications: ["MODIFIED_NARROWER"],
    level: "MEDIUM",
    category: "termination",
    rationale:
      "The notice period for termination has been shortened, reducing the time " +
      "available to prepare for contract end.",
  },
];

// ─── Rule engine ──────────────────────────────────────────────────────────────

export interface DeterministicRiskResult {
  /** Findings produced by rules — source is always "deterministic" */
  findings: RiskFinding[];
  /** Differences not matched by any rule — forwarded to the LLM */
  residual: EnrichedDifference[];
}

let riskSeq = 0;

function nextRiskId(): string {
  riskSeq += 1;
  return `risk-${riskSeq}`;
}

/**
 * Build the text corpus that a rule tests against for a given difference.
 * Combines titles and semantic summary, all lowercased.
 */
function buildTestCorpus(diff: EnrichedDifference): string {
  return [
    diff.titleA ?? "",
    diff.titleB ?? "",
    diff.semanticSummary,
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Apply all deterministic rules to a set of enriched differences.
 *
 * Returns the rule-matched findings and the residual differences that no
 * rule claimed (these go to the LLM).
 *
 * Each difference can only be claimed by the FIRST matching rule (greedy).
 */
export function runDeterministicRiskRules(
  diffs: EnrichedDifference[]
): DeterministicRiskResult {
  riskSeq = 0; // Reset for a deterministic run

  const findings: RiskFinding[] = [];
  const residual: EnrichedDifference[] = [];

  outer: for (const diff of diffs) {
    const corpus = buildTestCorpus(diff);

    for (const rule of RULES) {
      // Check classification gate first
      if (!rule.classifications.includes(diff.classification)) continue;

      // Test at least one pattern against the corpus
      const matched = rule.patterns.some((rx) => rx.test(corpus));
      if (!matched) continue;

      findings.push({
        id: nextRiskId(),
        pairId: diff.pairId,
        level: rule.level,
        category: rule.category,
        rationale: rule.rationale,
        confidence: 0.85,
        triggeredRule: rule.id,
        source: "deterministic",
      });

      continue outer; // First rule wins — skip remaining rules for this diff
    }

    // No rule matched — forward to LLM
    residual.push(diff);
  }

  return { findings, residual };
}
