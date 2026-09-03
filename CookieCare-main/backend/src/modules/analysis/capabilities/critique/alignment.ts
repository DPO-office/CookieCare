import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { AlignmentIssue, AlignmentReport } from "../../models/critique-report.js";
import { analysisPackageKind } from "../../models/evidence-package.js";
import { resolvePackages } from "../../skills/runtime/graph/resolve-packages.js";
import { pacLog } from "../../utils/pac-log.js";
import { requirementIdsEquivalent } from "../../shared/requirement-identity.js";

function isTerminal(unit: AnalysisWorkUnit): boolean {
  return (
    unit.status === "done" ||
    unit.status === "failed" ||
    unit.status === "skipped"
  );
}

function articleFromRuleId(ruleId: string): number | undefined {
  const match = ruleId.match(/\.art(?:icle)?(\d+)/i) ?? ruleId.match(/art(\d+)/i);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

function articleFromUnitInput(input: Record<string, unknown>): number | undefined {
  const article = input.article;
  if (typeof article === "number") return article;
  if (typeof article === "string") {
    const n = Number(article.match(/\d+/)?.[0]);
    return Number.isFinite(n) ? n : undefined;
  }
  const ruleId = String(input.ruleId ?? "");
  if (ruleId) return articleFromRuleId(ruleId);
  const rowId = String(input.rowId ?? "");
  if (rowId) return articleFromRuleId(rowId);
  return undefined;
}

function scheduledArticles(workUnits: AnalysisWorkUnit[]): number[] {
  const articles = new Set<number>();
  for (const unit of workUnits) {
    if (unit.tool === "render_output" || unit.tool === "aggregate_requirements") {
      continue;
    }
    const article = articleFromUnitInput(unit.input as Record<string, unknown>);
    if (article !== undefined) articles.add(article);
  }
  return [...articles];
}

function packageSkillId(packageId: string): string | undefined {
  if (packageId.startsWith("nda.")) return "doc-types/nda";
  if (packageId.startsWith("dpa.")) return "doc-types/dpa";
  if (packageId.startsWith("gdpr.")) return "regimes/data-protection/gdpr";
  if (packageId.startsWith("ccpa.")) return "regimes/data-protection/ccpa-cpra";
  if (packageId.startsWith("international_transfer")) {
    return "regimes/data-protection/international-transfers";
  }
  return undefined;
}

/**
 * PLAN/ACT alignment check using only PLAN artifacts (P7 §5).
 */
export function validateAlignment(state: AnalysisState): AlignmentReport {
  const issues: AlignmentIssue[] = [];
  const workUnits = state.plan?.workUnits ?? [];
  const paths = state.plan?.requirementExecutionPaths ?? [];
  const explicitScope = state.plan?.focus?.explicitScope;
  const activeSkillIds = new Set(state.activeSkillIds ?? []);
  const supportedRequirementIds = new Set(
    paths
      .filter(
        (p) =>
          p.status === "supported" ||
          p.status === "supported_via_dependency" ||
          p.status === "direct_rule"
      )
      .map((p) => p.requirementId)
  );

  for (const path of paths) {
    if (path.status === "not_supported") {
      // If we have *any* supported execution path for this requirementId,
      // ignore the stale not_supported entry (PLAN/ACT reconciliation case).
      if (supportedRequirementIds.has(path.requirementId)) continue;
      const promotedPackageId = packageIdIfCurrentSkillsCanSupport(
        state,
        path.requirementId
      );
      if (promotedPackageId) {
        // PLAN omitted a package the loaded skills can actually run.
        issues.push({
          kind: "wrong_package",
          action: "targeted_redo",
          requirementId: path.requirementId,
          packageId: promotedPackageId,
          detail:
            path.reason ??
            `Requirement ${path.requirementId} has no supported package in the graph`,
        });
      } else {
        // Unsatisfiable under current skills (e.g. GDPR Art 28 on an NDA-only
        // run). Coverage already records the gap — do not open ACT or PLAN.
        pacLog("critique cause=unsatisfiable_under_skills", {
          requirementId: path.requirementId,
          reason: path.reason,
        });
      }
      continue;
    }

    if (path.packageId) {
      const expectedSkill = packageSkillId(path.packageId);
      if (expectedSkill && !activeSkillIds.has(expectedSkill)) {
        issues.push({
          kind: "wrong_package",
          action: "replan",
          requirementId: path.requirementId,
          packageId: path.packageId,
          detail: `Package ${path.packageId} belongs to skill ${expectedSkill} but that skill is not active`,
        });
      }
    }
  }

  const inventoryOrStructuralPaths = paths.filter((p) => {
    if (!p.packageId) return false;
    const pkgId = p.packageId;
    if (pkgId.includes("structural_review")) return true;
    if (pkgId.includes("transfer_inventory")) return true;
    const skill = state.activeSkills?.find((s) =>
      s.evidencePackages?.some((pkg) => pkg.id === pkgId)
    );
    const pkg = skill?.evidencePackages?.find((pkg) => pkg.id === pkgId);
    if (!pkg) return pkgId.includes("inventory");
    const kind = analysisPackageKind(pkg);
    return kind === "inventory" || pkgId.includes("structural_review");
  });

  for (const path of inventoryOrStructuralPaths) {
    if (!path.packageId) continue;
    const relatedUnits = workUnits.filter(
      (unit) =>
        String(unit.input.packageId ?? "") === path.packageId ||
        (unit.tool === "inventory_provisions" &&
          String(unit.input.packageId ?? "") === path.packageId) ||
        (unit.tool === "evaluate_package" &&
          String(unit.input.packageId ?? "") === path.packageId)
    );
    const executed = relatedUnits.some((u) => isTerminal(u) && u.status !== "failed");
    if (relatedUnits.length === 0 || !executed) {
      // Multiple active skills may contribute paths for the same requirement.
      // Package resolution can intentionally suppress a broad structural
      // package when a more specific peer package is scheduled. Any completed
      // equivalent path therefore satisfies the execution-shape contract.
      const equivalentExecuted = paths
        .filter(
          (candidate) =>
            candidate.packageId &&
            candidate.packageId !== path.packageId &&
            requirementIdsEquivalent(
              candidate.requirementId,
              path.requirementId
            )
        )
        .some((candidate) =>
          workUnits.some(
            (unit) =>
              String(unit.input.packageId ?? "") === candidate.packageId &&
              isTerminal(unit) &&
              unit.status !== "failed"
          )
        );
      if (equivalentExecuted) continue;
      const onlyRules = workUnits.some(
        (u) =>
          u.tool === "check_against_rule" &&
          isTerminal(u) &&
          !relatedUnits.some((r) => r.workUnitId === u.workUnitId)
      );
      if (onlyRules || !executed) {
        issues.push({
          kind: "wrong_execution_shape",
          action: "targeted_redo",
          requirementId: path.requirementId,
          packageId: path.packageId,
          detail: `Expected package ${path.packageId} execution but graph ran a different shape`,
        });
      }
    }
  }

  if (
    explicitScope?.articles?.length &&
    !explicitScope.allowOutOfScopeRules
  ) {
    const allowed = new Set(explicitScope.articles);
    const matrixLinkedAllowed = matrixLinkedAllowedArticles(state);
    for (const article of scheduledArticles(workUnits)) {
      if (allowed.has(article) || matrixLinkedAllowed.has(article)) continue;
      issues.push({
        kind: "scope_creep",
        action: "withhold",
        detail: `ACT scheduled Article ${article} but explicit scope limits to [${[...allowed].join(", ")}]`,
      });
    }
  }

  return { issues };
}

/**
 * Assistance/timeframe rules (e.g. Art 28(3)(e)) that are matrix-linked to
 * in-focus rights rows are supporting context for Arts 15–22 reviews — not
 * scope creep. Flagging them as withhold was wiping the finished memo.
 */
function matrixLinkedAllowedArticles(state: AnalysisState): Set<number> {
  const allowed = new Set<number>();
  const matrixFocus = new Set(state.plan?.focus?.matrixRowIds ?? []);
  if (matrixFocus.size === 0) return allowed;

  for (const skill of state.activeSkills ?? []) {
    for (const rule of skill.regimeRules ?? []) {
      const linked = rule.matrixLinkage?.matrixRowIds ?? [];
      if (!linked.some((id) => matrixFocus.has(id))) continue;
      const article = articleFromRuleId(rule.ruleId);
      if (article !== undefined) allowed.add(article);
    }
  }
  return allowed;
}

export function alignmentNeedsReplan(report: AlignmentReport): boolean {
  return report.issues.some((issue) => issue.action === "replan");
}

export function alignmentNeedsTargetedRedo(report: AlignmentReport): boolean {
  return report.issues.some((issue) => issue.action === "targeted_redo");
}

const SUPPORTED_PATH_STATUSES = new Set([
  "supported",
  "supported_via_dependency",
  "direct_rule",
]);

/**
 * True package-shape miss: current skills would give this requirement a
 * supported path. Otherwise ACT cannot invent a package (limitation, not a loop).
 */
function packageIdIfCurrentSkillsCanSupport(
  state: AnalysisState,
  requirementId: string
): string | undefined {
  const skills = state.activeSkills ?? [];
  if (skills.length === 0) return undefined;
  const resolution = resolvePackages(
    skills,
    state.plan?.focus,
    state.intent?.requirements
  );
  const path = resolution.requirementPaths.find(
    (p) => p.requirementId === requirementId
  );
  if (path && SUPPORTED_PATH_STATUSES.has(path.status) && path.packageId) {
    return path.packageId;
  }
  return resolution.requirementToPackageId[requirementId];
}
