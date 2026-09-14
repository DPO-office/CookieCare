import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CompliancePresentationPlan, ComplianceReportSnapshot } from "../../../models/compliance-report.js";
import { deterministicComplianceDraft, renderComplianceMarkdown, validateCompliancePresentationPlan } from "../compliance-presentation.js";
import { COMPLIANCE_REPORT_QUALITY_FIXTURES } from "./compliance-report-quality-fixtures.js";

interface EditorialReview {
  total: number;
  scores: Record<"requestAlignment" | "tableUsefulness" | "evidencePlacement" | "actionUsefulness" | "concision", number>;
  notes: string[];
}

function review(snapshot: ComplianceReportSnapshot, plan: CompliancePresentationPlan, markdown: string): EditorialReview {
  const overview = plan.sections.filter(section => section.kind === "overview");
  const columns = new Set(overview.flatMap(section => section.columns));
  const requestedSpecial = /\btransfer/i.test(snapshot.instruction)
    ? ["Transfer mechanism", "Destination", "Legal basis"]
    : /\btimeframe|deadline|timing/i.test(snapshot.instruction) ? ["Timing"] : [];
  const aligned = requestedSpecial.length
    ? requestedSpecial.filter(column => columns.has(column as never)).length / requestedSpecial.length
    : overview.length > 1 ? 1 : 0.5;
  const requestAlignment = aligned === 1 ? 2 : aligned > 0 ? 1 : 0;
  const tableUsefulness = overview.length > 1 || [...columns].some(column => !["Requirement", "Status", "Contract provision", "Assessment"].includes(column)) ? 2 : 1;
  const evidencePlacement = overview.every(section => section.columns.includes("Contract provision")) ||
    plan.sections.some(section => section.kind === "details") ? 2 : 1;
  const actionable = snapshot.rows.filter(row => row.status !== "present" && row.status !== "not_applicable");
  const detailed = new Set(plan.sections.filter(section => section.kind === "details").flatMap(section => section.findingIds));
  const actionUsefulness = !actionable.length || columns.has("Recommended action") || actionable.every(row => detailed.has(row.lockedAssessmentId!)) ? 2 : 1;
  const overviewIds = overview.flatMap(section => section.findingIds);
  const concise = new Set(overviewIds).size === overviewIds.length && !/No outstanding required proof\./i.test(markdown);
  const concision = concise ? 2 : 0;
  const scores = { requestAlignment, tableUsefulness, evidencePlacement, actionUsefulness, concision };
  const notes = [
    `request alignment ${requestAlignment}/2: ${requestedSpecial.length ? `requested comparison columns ${requestedSpecial.join(", ")}` : "topical grouping assessed"}`,
    `table usefulness ${tableUsefulness}/2: ${overview.length} overview group(s), ${columns.size} distinct column(s)`,
    `evidence placement ${evidencePlacement}/2: source provisions remain with findings or in details`,
    `action usefulness ${actionUsefulness}/2: ${actionable.length} actionable finding(s) remain visible`,
    `concision ${concision}/2: overview coverage is non-duplicative and boilerplate is absent`,
  ];
  return { total: Object.values(scores).reduce((sum, score) => sum + score, 0), scores, notes };
}

describe("saved compliance snapshot editorial regression", () => {
  for (const fixture of COMPLIANCE_REPORT_QUALITY_FIXTURES) {
    it(`renders and reviews old vs request-adaptive structure on the same ${fixture.id} snapshot`, () => {
      assert.deepEqual(validateCompliancePresentationPlan(fixture.baselinePlan, fixture.snapshot, "layered"), []);
      assert.deepEqual(validateCompliancePresentationPlan(fixture.adaptivePlan, fixture.snapshot, "layered"), []);
      const before = renderComplianceMarkdown(fixture.snapshot, fixture.baselinePlan, deterministicComplianceDraft(fixture.snapshot, fixture.baselinePlan));
      const after = renderComplianceMarkdown(fixture.snapshot, fixture.adaptivePlan, deterministicComplianceDraft(fixture.snapshot, fixture.adaptivePlan));
      const beforeReview = review(fixture.snapshot, fixture.baselinePlan, before);
      const afterReview = review(fixture.snapshot, fixture.adaptivePlan, after);
      assert.ok(afterReview.total >= beforeReview.total, `${fixture.id}: ${afterReview.notes.join("; ")}`);
      assert.ok(afterReview.total >= 8, `${fixture.id}: ${afterReview.notes.join("; ")}`);
      assert.notEqual(after, before);
      for (const row of fixture.snapshot.rows) assert.ok(after.includes(row.title));
    });
  }
});

