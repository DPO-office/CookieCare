import type { EvidenceSpan } from "./locator.js";
import type { RuleSourceTier } from "./rule-source.js";
import type { TerminalStatus } from "./work-unit-outcome.js";
import type { RequirementJudgement } from "./requirement-assessment.js";

export type FindingKind =
  | "risk"
  | "compliance"
  | "comparison_delta"
  | "extraction"
  | "summary_point";

export type FindingStatus =
  | "present"
  | "absent_expected"
  | "insufficient_evidence"
  /** System coverage gap — rule not authored; distinct from document-level insufficient_evidence. */
  | "not_covered";

export type FindingVisibility = "internal" | "user_facing";

export type MatrixAddressing = "named" | "generic" | "absent";

export interface Finding {
  findingId: string;
  kind: FindingKind;
  /** Member of risk taxonomy or rule_id — versioned. */
  category: string;
  status: FindingStatus;
  claim: string;
  evidence: EvidenceSpan[];
  ruleId?: string;
  ruleVersion?: string;
  severity?: "low" | "medium" | "high";
  taxonomyVersion: string;
  workUnitId?: string;
  skillId?: string;
  /** Package that emitted this finding, when the unit was package-scoped. */
  packageId?: string;
  /** Audit vs user report. Default treated as user_facing when omitted. */
  visibility?: FindingVisibility;
  matrixRowId?: string;
  matrixAddressing?: MatrixAddressing;
  gap?: string;
  /** Authored relatedChecks subgraph — render under "Related, not requested". */
  relatedNotRequested?: boolean;
  /** Org playbook override — never blended silently into skill findings. */
  orgPlaybook?: boolean;
  orgPlaybookNote?: string;
  /**
   * Tier C live-search finding. Must never render in the same table as
   * authored (Tier B) compliance findings.
   */
  unverified?: boolean;
  sourceUrl?: string;
  /** ISO retrieval time for Tier C staleness visibility. */
  retrievedAt?: string;
  /**
   * Trust tier for renderer separation:
   * B = authored regime, P = playbook-derived, C = web-derived.
   */
  ruleSourceTier?: RuleSourceTier;
  playbookPositionId?: string;
  /** Set when CRITIQUE resolves a unit as not_covered or retries_exhausted. */
  terminalStatus?: TerminalStatus;
  /**
   * PLAN requirement id this finding helps establish. Enables per-requirement
   * aggregation (RequirementAssessment) and independent CRITIQUE verification
   * without making the finding itself requirement-scoped.
   *
   * Optional at the type level because handlers emit raw findings before the
   * generic `stampRequirementIdsOnNewFindings` / `stampFindingsByCapability`
   * helpers (act-utils.ts) enrich them post-hoc — a required field here would
   * force every handler to supply a placeholder before stamping runs.
   * Effectively required by the time a finding leaves ACT for any
   * user-facing (`visibility !== "internal"`) `compliance`/`risk` finding —
   * enforced at runtime by `critique/validators/findings.ts`'s
   * `validateFindings` (ACT-Phase 1).
   */
  requirementId?: string;
  /**
   * Phase 2 (requirement binding graph) — the PLAN/classifier requirement ids
   * this finding answers, computed structurally at PLAN time and threaded onto
   * the work unit (never re-derived by fuzzy id matching downstream). ADDS to,
   * never replaces, the native `requirementId` above: a package finding keeps
   * its authored native identity for evaluation, while this carries the
   * request-vocabulary id(s) every join site reads to reach it. Empty/undefined
   * means no binding was computed — join sites fall back to the legacy
   * canonical-id match, and a request requirement with no binding renders as an
   * engine coverage gap, never a fabricated "insufficient data" conclusion.
   */
  requestRequirementIds?: string[];
  /**
   * Locked per-requirement axes stamped at evaluation. Aggregation prefers
   * this over re-deriving from Finding.status alone.
   */
  judgement?: RequirementJudgement;
  /**
   * ACT-Phase 5 — true only for findings constructed directly from a
   * `verifyProposition()` verdict (never re-derived by the generic
   * `judgementForResult` heuristics, which don't know about VERIFY and could
   * silently upgrade/downgrade its verdict). Lets aggregation enforce "LOCK
   * only promotes proves/contradicts-verdict findings" as a structural
   * guarantee for this path specifically, with zero effect on any other.
   */
  verifiedByProposition?: boolean;
  /**
   * ACT-Phase 7 enrichment — VERIFY is the only stage that ever reads the
   * evidence, so it captures the rich reasoning behind a verdict as
   * structured data instead of discarding it. Only ever populated on
   * `verifiedByProposition` findings; aggregation copies whichever of these
   * are present onto the locked RequirementAssessment (models/
   * requirement-assessment.ts's matching fields from ACT-Phase 2).
   */
  establishedBy?: string;
  gapDescription?: string;
  dependency?: { document: string; whyNeeded: string };
  structuralNote?: string;
  remediation?: string;
  /**
   * Set only on kind:"comparison_delta" findings, threaded from the
   * originating Proposition (models/proposition.ts) through
   * RequirementEvidenceProfile so render/synthesis can pair side_a/side_b
   * findings back into one comparison instead of two unrelated rows.
   */
  compareGroup?: string;
  compareRole?: string;
}
