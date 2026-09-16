/**
 * Finalize findings (Stage 4) + map to the existing NegotiateMarkup shape
 * (Stage 7). Applies critic verdicts, deterministic evidence verification, and
 * the deterministic L/N/P model. Never drops a must-catch candidate; never marks
 * an unverified finding as verified.
 */
import type { NegotiateMarkup } from "../../../utils/negotiateChunker.js";
import type { MergedCandidate } from "./merge.js";
import { CriticOutcome, verifyEvidence } from "./critic.js";
import { computeLNP } from "./severity.js";
import { V2Finding, SeverityFactors, ConfidenceBand } from "./types.js";

function applyFactorCorrections(base: SeverityFactors, corr?: Partial<SeverityFactors>): SeverityFactors {
  if (!corr) return base;
  const out = { ...base };
  for (const k of Object.keys(corr) as (keyof SeverityFactors)[]) {
    if (typeof (corr as any)[k] === "boolean") out[k] = (corr as any)[k];
  }
  return out;
}

function deriveClauseType(issueTag: string, ruleId?: string): string {
  const s = (issueTag + " " + (ruleId ?? "")).toLowerCase();
  if (/liabilit|indemn/.test(s)) return "limitation_of_liability";
  if (/transfer/.test(s)) return "data_protection";
  if (/subprocessor|sub-processor/.test(s)) return "data_protection";
  if (/govern|law|jurisdic|dispute/.test(s)) return "governing_law";
  if (/audit|inspect/.test(s)) return "audit_rights";
  if (/termination|deletion|delete/.test(s)) return "termination";
  if (/breach|incident|security/.test(s)) return "data_protection";
  return "data_protection";
}

function confidenceBand(f: V2FindingDraft): ConfidenceBand {
  const hasEvidence = f.isAbsence || f.evidenceCount > 0;
  const strong = f.verified && hasEvidence && (f.rubricBacked || (f.votes > 0 && f.votes === f.ofRuns));
  if (strong) return "strong";
  if (f.verified && hasEvidence) return "moderate";
  return "tentative";
}

interface V2FindingDraft {
  verified: boolean; isAbsence: boolean; evidenceCount: number; rubricBacked: boolean; votes: number; ofRuns: number;
}

export interface FinalizeResult {
  findings: V2Finding[];
  droppedCount: number;
}

export function finalizeFindings(
  candidates: MergedCandidate[],
  critic: CriticOutcome,
  documentText: string,
): FinalizeResult {
  const findings: V2Finding[] = [];
  let dropped = 0;

  candidates.forEach((c, id) => {
    const ev = verifyEvidence(c, documentText);
    const verdict = critic.verdicts.get(id);

    // ── Drop logic ────────────────────────────────────────────────────────
    // Evidence hallucination guard (deterministic): a present-issue candidate
    // with no verbatim evidence is dropped UNLESS it is must-catch.
    if (!c.isAbsence && !ev.ok && !c.mustCatchRule) { dropped++; return; }

    if (critic.criticAvailable && verdict && verdict.verdict === "drop") {
      // Defense-in-depth: never drop a must-catch candidate (critic.ts already
      // coerces this to "minor"; enforce again here). Others are dropped.
      if (!c.mustCatchRule) { dropped++; return; }
    }

    // ── Factors → L/N/P ──────────────────────────────────────────────────
    let factors = c.factors;
    if (critic.criticAvailable && verdict) {
      factors = applyFactorCorrections(factors, verdict.factors);
      if (verdict.marketStandard) factors = { ...factors, marketStandardLanguage: true };
      if (verdict.inScope === false) factors = { ...factors, outOfScopeForDocType: true };
    }
    const lnp = computeLNP(factors);
    // Critic "minor" (or a coerced-must-catch "drop") demotes tier but keeps the finding.
    let tier = lnp.tier;
    if (critic.criticAvailable && (verdict?.verdict === "minor" || verdict?.verdict === "drop")) tier = "minor";

    const verified = critic.criticAvailable && !!verdict && (c.isAbsence || ev.ok);
    const rubricBacked = !!c.ruleId;
    const conf = confidenceBand({
      verified, isAbsence: c.isAbsence, evidenceCount: ev.verifiedQuotes,
      rubricBacked, votes: c.votes ?? 0, ofRuns: c.ofRuns ?? 0,
    });
    const signals: string[] = [];
    if (c.isAbsence) signals.push("structural-rule (absence)");
    if (ev.verifiedQuotes > 0) signals.push(`verbatim evidence ×${ev.verifiedQuotes}`);
    if (c.votes && c.ofRuns) signals.push(`appeared ${c.votes}/${c.ofRuns} checks`);
    if (rubricBacked) signals.push("rubric-backed");
    signals.push(verified ? "critic-verified" : "UNVERIFIED");

    const headEvidence = c.evidence[0];
    findings.push({
      clauseRef: c.clauseRefs[0] ?? "doc-level",
      ruleId: c.ruleId,
      issueTag: verdict?.canonicalRuleId || c.issueTag,
      isAbsence: c.isAbsence,
      riskLevel: lnp.L,
      negotiability: lnp.N,
      priorityScore: lnp.priority,
      tier,
      confidence: conf,
      confidenceSignals: signals,
      factors,
      reasoning: c.reasoning + (verdict?.reason ? ` [critic: ${verdict.reason}]` : ""),
      replacement: "", // redline drafting is deferred (not needed for shadow comparison)
      original: c.isAbsence ? "" : (headEvidence?.quote ?? ""),
      charOffset: headEvidence?.charOffset ?? -1,
      evidence: c.evidence,
      duplicateOfRefs: c.duplicateOfRefs,
      verified,
      clauseType: deriveClauseType(c.issueTag, c.ruleId),
    });
  });

  // Rank by priority (primary first, then descending).
  findings.sort((a, b) => (a.tier === b.tier ? b.priorityScore - a.priorityScore : a.tier === "primary" ? -1 : 1));
  return { findings, droppedCount: dropped };
}

/** Map a V2 finding into the existing NegotiateMarkup shape (+ additive fields). */
export function toNegotiateMarkup(f: V2Finding): NegotiateMarkup & Record<string, any> {
  return {
    clauseId: f.clauseRef,                 // stable, content-anchored id (fits clause_id VARCHAR)
    original: f.original,
    replacement: f.replacement,
    reasoning: f.reasoning,
    riskLevel: f.riskLevel,
    clauseType: f.clauseType,
    charOffset: f.charOffset,
    matchedPlaybookTopic: null,            // playbook grounding unchanged (separate concept)
    // ── additive V2 fields (ignored by V1 consumers) ──
    v2: {
      ruleId: f.ruleId, issueTag: f.issueTag, isAbsence: f.isAbsence,
      negotiability: f.negotiability, priorityScore: f.priorityScore, tier: f.tier,
      confidence: f.confidence, confidenceSignals: f.confidenceSignals,
      factors: f.factors, duplicateOfRefs: f.duplicateOfRefs, verified: f.verified,
    },
  };
}
