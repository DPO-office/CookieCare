import type { AnalysisState } from "../models/analysis-state.js";
import type { Finding } from "../models/finding.js";
import type { RightsMatrixRow } from "../skills/runtime/catalog/types.js";
import {
  findingSupportsRequirement,
  isWholeArticleRequirement,
} from "./requirement-identity.js";

/** Authored risk categories that map to a specific GDPR article. */
const CATEGORY_ARTICLE: Record<string, number> = {
  "gdpr.art15.access_gap": 15,
  "gdpr.art16.rectification_gap": 16,
  erasure_termination_only_gap: 17,
  "gdpr.art17.erasure_gap": 17,
  "gdpr.art18.restriction_gap": 18,
  recipient_notification_gap: 19,
  "gdpr.art19.notification_gap": 19,
  portability_format_unaddressed: 20,
  "gdpr.art20.portability_gap": 20,
  "gdpr.art21.objection_gap": 21,
  automated_decision_gap: 22,
  "gdpr.art22.automated_decision_gap": 22,
  dsr_no_response_timeframe: 12,
};

/**
 * Resolve the GDPR/local article number a finding speaks to — matrix row,
 * authored rule id, or category→article reverse lookup.
 */
export function articleNumberForFinding(
  finding: Finding,
  state?: AnalysisState
): number | undefined {
  if (finding.matrixRowId && state) {
    const row = matrixRows(state).find((r) => r.rowId === finding.matrixRowId);
    const fromRow = Number(row?.article.match(/\d+/)?.[0]);
    if (Number.isFinite(fromRow) && fromRow > 0) return fromRow;
  }
  const fromRule = articleNumberFromRuleId(finding.ruleId);
  if (fromRule) return fromRule;
  const fromCategory = CATEGORY_ARTICLE[finding.category];
  if (fromCategory) return fromCategory;
  if (state) {
    const row = matrixRows(state).find((r) => r.findingCategory === finding.category);
    // Only trust category→row when the category is row-specific (not the shared
    // assistance fallback used by several matrix rows).
    if (row && finding.category !== "dsr_assistance_not_operational") {
      const fromCat = Number(row.article.match(/\d+/)?.[0]);
      if (Number.isFinite(fromCat) && fromCat > 0) return fromCat;
    }
    for (const skill of state.activeSkills ?? []) {
      for (const rule of skill.regimeRules ?? []) {
        if (rule.findingCategory === finding.category) {
          const n = articleNumberFromRuleId(rule.ruleId);
          if (n) return n;
        }
      }
    }
  }
  return undefined;
}

export function articleNumberFromRuleId(ruleId?: string): number | undefined {
  if (!ruleId) return undefined;
  const match = ruleId.match(/(?:^|\.)art(\d{1,3})(?:\.|$)/i);
  return match ? Number(match[1]) : undefined;
}

/** Article number encoded in a requirement id such as gdpr.article17.compliance. */
export function articleNumberFromRequirementId(requirementId: string): number | undefined {
  const match = requirementId.match(/\.?articles?_?(\d{1,3})(?:[._]|$)/i);
  if (match) return Number(match[1]);
  const bare = requirementId.match(/(?:^|[._-])art(?:icle)?[._-]?(\d{1,3})(?:[._-]|$)/i);
  return bare ? Number(bare[1]) : undefined;
}

/**
 * Letter/paragraph grain for an id (`28.3.a`, `28.4`, `12.3`). Lettered
 * sub-provisions must not inherit every finding that merely shares the
 * parent article number.
 */
export function subprovisionKeyFromId(id: string): string | undefined {
  if (!id) return undefined;
  const lettered = id.match(
    /(?:^|[._-])art(?:icle)?[._-]?(\d{1,3})[._-](\d+)[._-]([a-h])(?=$|[._-])/i
  );
  if (lettered) {
    return `${lettered[1]}.${lettered[2]}.${lettered[3].toLowerCase()}`;
  }
  const named = id.match(
    /(?:^|[._-])art(?:icle)?[._-]?(\d{1,3})[._-](\d+)[._-](chapeau)(?=$|[._-])/i
  );
  if (named) {
    return `${named[1]}.${named[2]}.chapeau`;
  }
  const paragraph = id.match(
    /(?:^|[._-])art(?:icle)?[._-]?(\d{1,3})[._-](\d+)(?=$|[._-])/i
  );
  if (paragraph) {
    return `${paragraph[1]}.${paragraph[2]}`;
  }
  return undefined;
}

function findingSubprovisionKey(finding: Finding): string | undefined {
  return (
    (finding.requirementId
      ? subprovisionKeyFromId(finding.requirementId)
      : undefined) ||
    (finding.ruleId ? subprovisionKeyFromId(finding.ruleId) : undefined)
  );
}

/**
 * Findings that speak to a requirement — by canonical/alias stamp, lettered
 * subprovision key, or (whole-article requirements only) unstamped same-article
 * matrix/rule/risk findings.
 *
 * Lettered/numbered sub-provisions stay isolated: a deletion finding must
 * not become the evidence row for confidentiality or audit.
 * Particular PLAN ids like `gdpr.article28.duration` must not inherit every
 * unstamped Article 28 risk.
 */
export function findingsLinkedToRequirement(
  requirementId: string,
  findings: Finding[],
  state?: AnalysisState
): Finding[] {
  const direct = findings.filter((f) =>
    findingSupportsRequirement(f.requirementId, requirementId)
  );
  const meta = metaRequirementFindings(requirementId, findings);
  if (meta) return dedupeFindings([...direct, ...meta]);

  const reqKey = subprovisionKeyFromId(requirementId);
  if (reqKey) {
    const keyed = findings.filter((f) => {
      if (f.visibility === "internal") return false;
      if (findingSupportsRequirement(f.requirementId, requirementId)) return true;
      // Already-stamped findings belong only to their requirement (or alias).
      if (f.requirementId) return false;
      return findingSubprovisionKey(f) === reqKey;
    });
    return dedupeFindings(keyed);
  }

  // Particular / topic requirements: aliases only — no article-wide risk dump.
  if (!isWholeArticleRequirement(requirementId)) {
    return dedupeFindings(direct);
  }

  const article = articleNumberFromRequirementId(requirementId);
  if (!article) return dedupeFindings(direct);

  const linked = findings.filter((f) => {
    if (findingSupportsRequirement(f.requirementId, requirementId)) return false;
    if (f.visibility === "internal") return false;
    // A finding already stamped to another requirement is that row's
    // evidence, not a generic same-article hit.
    if (f.requirementId) return false;
    if (findingSubprovisionKey(f)) return false;
    return articleNumberForFinding(f, state) === article;
  });
  return dedupeFindings([...direct, ...linked]);
}

function metaRequirementFindings(
  requirementId: string,
  findings: Finding[]
): Finding[] | undefined {
  const id = requirementId.toLowerCase();
  if (id === "dsr.response_timeframes" || id.endsWith(".response_timeframes")) {
    return findings.filter(
      (f) =>
        f.visibility !== "internal" &&
        (f.ruleId === "gdpr.art12.3" || f.category === "dsr_no_response_timeframe")
    );
  }
  if (id === "dsr.gap_analysis" || id.endsWith(".gap_analysis")) {
    return findings.filter(
      (f) =>
        f.visibility !== "internal" &&
        !f.relatedNotRequested &&
        (f.status === "absent_expected" ||
          (f.kind === "risk" &&
            (f.severity === "medium" || f.severity === "high")) ||
          Boolean(f.gap))
    );
  }
  return undefined;
}

function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const f of findings) {
    if (seen.has(f.findingId)) continue;
    seen.add(f.findingId);
    out.push(f);
  }
  return out;
}

/**
 * Material gap findings that should appear in a matrix Gap cell for a given
 * article. Excludes the matrix row finding itself and internal/related noise.
 */
export function gapFindingsForArticle(
  article: number,
  findings: Finding[],
  state: AnalysisState,
  excludeFindingIds?: Set<string>
): Finding[] {
  const exclude = excludeFindingIds ?? new Set<string>();
  return findings.filter((f) => {
    if (exclude.has(f.findingId)) return false;
    if (f.visibility === "internal" || f.relatedNotRequested || f.orgPlaybook || f.unverified) {
      return false;
    }
    if (articleNumberForFinding(f, state) !== article) return false;
    if (f.matrixRowId && f.matrixAddressing === "named" && !f.gap) return false;
    return isMaterialGapFinding(f);
  });
}

export function isMaterialGapFinding(finding: Finding): boolean {
  if (finding.status === "absent_expected") return true;
  if (finding.status === "insufficient_evidence" && finding.gap) return true;
  if (finding.gap && finding.matrixAddressing === "named") return true;
  if (
    finding.kind === "risk" &&
    finding.status === "present" &&
    (finding.severity === "medium" || finding.severity === "high")
  ) {
    return true;
  }
  if (
    finding.matrixAddressing === "generic" ||
    finding.matrixAddressing === "absent"
  ) {
    return Boolean(finding.gap);
  }
  return Boolean(finding.gap && finding.status !== "present");
}

/** Horizontal obligations (Art 12(3) timeframe) that apply across every matrix row. */
export function crossCuttingTimeframeFindings(
  findings: Finding[],
  state: AnalysisState
): Finding[] {
  return findings.filter((f) => {
    if (f.visibility === "internal" || f.relatedNotRequested) return false;
    if (f.ruleId && /\.art12\.3(?:\.|$)/i.test(f.ruleId)) return true;
    if (f.category === "dsr_no_response_timeframe") return true;
    const hook = findResponseTimeframeRule(state);
    return Boolean(hook && f.ruleId === hook);
  });
}

function findResponseTimeframeRule(state: AnalysisState): string | undefined {
  for (const skill of state.activeSkills ?? []) {
    for (const rule of skill.regimeRules ?? []) {
      if (rule.rendererHooks?.responseTimeframeSection) return rule.ruleId;
    }
  }
  return undefined;
}

function matrixRows(state: AnalysisState): RightsMatrixRow[] {
  return state.activeSkills?.flatMap((s) => s.rightsMatrixRows ?? []) ?? [];
}
