import type { AnalysisState } from "../../models/analysis-state.js";
import type { AnalysisWorkUnit } from "../../models/analysis-plan.js";
import type { AlignmentIssue, AlignmentReport } from "../../models/critique-report.js";
import { analysisPackageKind } from "../../models/evidence-package.js";

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
      issues.push({
        kind: "wrong_package",
        action: "replan",
        requirementId: path.requirementId,
        detail: path.reason ?? `Requirement ${path.requirementId} has no supported package`,
      });
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
      const onlyRules = workUnits.some(
        (u) =>
          u.tool === "check_against_rule" &&
          isTerminal(u) &&
          !relatedUnits.some((r) => r.workUnitId === u.workUnitId)
      );
      if (onlyRules || !executed) {
        issues.push({
          kind: "wrong_execution_shape",
          action: "replan",
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
    for (const article of scheduledArticles(workUnits)) {
      if (!allowed.has(article)) {
        issues.push({
          kind: "scope_creep",
          action: "withhold",
          detail: `ACT scheduled Article ${article} but explicit scope limits to [${[...allowed].join(", ")}]`,
        });
      }
    }
  }

  return { issues };
}

export function alignmentNeedsReplan(report: AlignmentReport): boolean {
  return report.issues.some((issue) => issue.action === "replan");
}
