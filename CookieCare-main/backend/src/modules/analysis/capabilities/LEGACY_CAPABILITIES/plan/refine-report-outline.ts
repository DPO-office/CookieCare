import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../../llm/index.js";
import type { IntentClassification, ReportOutlineItem, ReportSectionRole } from "../../../models/intent.js";
import { sectionIdForRole } from "../../../prompts/report-sections.js";
import { pacWarn } from "../../../utils/pac-log.js";

const ANALYSIS_ROLES: Set<ReportSectionRole> = new Set([
  "analysis",
  "chapeau_particulars",
  "requirements_matrix",
  "key_findings",
]);

const ALLOWED_ROLES: Set<ReportSectionRole> = new Set([
  "scope",
  "executive_summary",
  "analysis",
  "requirements_matrix",
  "key_findings",
  "chapeau_particulars",
  "material_gaps",
  "risk_summary",
  "qualifications",
  "limitations",
  "recommendations",
  "missing_materials",
  "evidence",
  "conclusion",
]);

const REFINE_SCHEMA = {
  type: "object",
  properties: {
    analysisItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          role: { type: "string" },
          heading: { type: "string" },
          requirementIds: { type: "array", items: { type: "string" } },
          source: { type: "string" },
        },
        required: ["id", "role", "heading", "requirementIds", "source"],
      },
    },
  },
  required: ["analysisItems"],
};

function asSet(values: string[]): Set<string> {
  return new Set(values);
}

function uniqueArray(values: string[]): string[] {
  return [...new Set(values)];
}

function validateRefinedAnalysisItems(
  seedAnalysisItems: ReportOutlineItem[],
  refinedItems: ReportOutlineItem[]
): { valid: boolean; reason?: string } {
  const seedReq = asSet(seedAnalysisItems.flatMap((i) => i.requirementIds));
  const refinedReqList = refinedItems.flatMap((i) => i.requirementIds);
  const refinedReq = asSet(refinedReqList);

  if (seedReq.size === 0) {
    return { valid: refinedItems.length === 0, reason: "seed analysis empty" };
  }

  // Requirement partition invariants: same union, no duplicates.
  for (const id of seedReq) {
    if (!refinedReq.has(id)) {
      return { valid: false, reason: `missing requirementId in refined outline: ${id}` };
    }
  }
  for (const id of refinedReq) {
    if (!seedReq.has(id)) {
      return { valid: false, reason: `extra requirementId in refined outline: ${id}` };
    }
  }
  if (uniqueArray(refinedReqList).length !== refinedReqList.length) {
    return { valid: false, reason: "duplicate requirementIds across refined analysis items" };
  }

  if (refinedItems.some((item) => !ALLOWED_ROLES.has(item.role))) {
    return { valid: false, reason: "refined item contains a disallowed role" };
  }
  if (refinedItems.some((item) => !ANALYSIS_ROLES.has(item.role))) {
    return { valid: false, reason: "refined item role outside analysis roles" };
  }

  return { valid: true };
}

/**
 * Optional PLAN-time LLM refinement of outline headings.
 *
 * Constraints enforced post-hoc:
 * - only `analysisItems` (roles analysis/chapeau_particulars) may change
 * - refinement may merge/split analysis items via requirementIds partition
 * - scope/conclusion/other non-analysis roles remain untouched
 * - refined requirementIds union must match the seed union exactly
 */
export async function refineReportOutlineViaLLM(
  args: {
    instruction: string;
    intent: IntentClassification;
    reportType: string;
    depth: string;
    seedOutline: ReportOutlineItem[];
    executeJsonCompletionFn?: typeof executeJsonCompletion;
  }
): Promise<ReportOutlineItem[]> {
  const {
    instruction,
    seedOutline,
    intent,
    reportType,
    depth,
    executeJsonCompletionFn,
  } = args;

  const seedAnalysisItems = seedOutline.filter((i) => ANALYSIS_ROLES.has(i.role));
  if (seedAnalysisItems.length === 0) return seedOutline;

  const renderedSeed = seedAnalysisItems.map((i) => ({
    id: i.id,
    role: i.role,
    heading: i.heading,
    requirementIds: i.requirementIds,
  }));

  const instructionNote =
    "Refine only the analysis headings and optionally merge/split adjacent analysis items. " +
    "Never change which requirements are covered: the refined analysis items must partition " +
    "the exact same set of requirementIds as the seed. Only edit headings; do not introduce new claims.";

  try {
    const raw = (await (executeJsonCompletionFn ?? executeJsonCompletion)(
      [
        "You are refining the user-visible outline for a document-analysis memo.",
        instructionNote,
        "",
        "Seed outline (analysis items only):",
        JSON.stringify(renderedSeed, null, 2),
        "",
        "User instruction:",
        instruction,
        "",
        "Standard concept (if any):",
        intent.standardConcept ?? "(none)",
        "",
        "Report type:",
        reportType,
        "Depth:",
        depth,
        "",
        "Return ONLY JSON matching the schema.",
      ].join("\n"),
      "json",
      REFINE_SCHEMA as any,
      LLMTask.STRUCTURAL_JSON_LITE,
      LLMProvider.GEMINI
    )) as unknown as { analysisItems?: ReportOutlineItem[] };

    const refinedItems = ((raw.analysisItems ?? []) as ReportOutlineItem[]).map(
      (item) => {
        const seed = seedAnalysisItems.find((candidate) => candidate.id === item.id);
        return {
          ...item,
          sectionId: item.sectionId ?? seed?.sectionId ?? sectionIdForRole(item.role),
          artifactTypes: item.artifactTypes ?? seed?.artifactTypes,
        };
      }
    );
    const validation = validateRefinedAnalysisItems(
      seedAnalysisItems,
      refinedItems
    );
    if (!validation.valid) {
      pacWarn("outline refinement rejected; using seed outline", {
        reason: validation.reason,
      });
      return seedOutline;
    }

    // Rebuild full outline: keep non-analysis items exactly as seed order.
    const nonAnalysis = seedOutline.filter((i) => !ANALYSIS_ROLES.has(i.role));
    const refinedOutline: ReportOutlineItem[] = [];
    let refinedInserted = false;
    for (const item of seedOutline) {
      if (ANALYSIS_ROLES.has(item.role) && !refinedInserted) {
        refinedOutline.push(...refinedItems);
        refinedInserted = true;
      } else if (!ANALYSIS_ROLES.has(item.role)) {
        refinedOutline.push(item);
      }
    }

    // If seed has analysis items interleaved (shouldn't), fall back.
    if (refinedOutline.length === 0) return seedOutline;
    return refinedOutline;
  } catch (error) {
    pacWarn("outline refinement failed; using seed outline", {
      error: error instanceof Error ? error.message : String(error),
    });
    return seedOutline;
  }
}

