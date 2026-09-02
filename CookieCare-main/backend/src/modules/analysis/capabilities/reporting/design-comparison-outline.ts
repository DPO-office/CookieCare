import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { Finding } from "../../models/finding.js";
import type { ReportOutlineItem, ReportSectionRole } from "../../models/intent.js";
import { sectionIdForRole, suggestedHeading } from "../../prompts/report-sections.js";
import { roleForSectionId } from "../../prompts/report-sections.js";
import { pacWarn } from "../../utils/pac-log.js";

/**
 * Roles the comparison architect may emit — mirrors design-risk-outline.ts's
 * ALLOWED_RISK_ROLES menu, swapping risk_summary for comparison.
 */
const ALLOWED_COMPARISON_ROLES: ReportSectionRole[] = [
  "executive_summary",
  "comparison",
  "recommendations",
  "conclusion",
];

interface DesignedSection {
  role: string;
  heading: string;
}

const DESIGN_SCHEMA = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: "string" },
          heading: { type: "string" },
        },
        required: ["role", "heading"],
      },
    },
  },
  required: ["sections"],
};

const DESIGN_SYSTEM_PROMPT = [
  "You are the editor deciding the SHAPE of a comparison answer for a",
  "specific contract and a specific user question (e.g. \"is the termination",
  "clause balanced between the parties\"). You are given, for each dimension",
  "compared, what was actually established for each side. Design the report's",
  "sections so the answer reads like a sharp analyst wrote it for THIS",
  "comparison — not a generic compliance template.",
  "",
  "Return an ordered list of sections. For each: a `role` and a `heading`.",
  "- role must be one of: executive_summary, comparison, recommendations,",
  "  conclusion.",
  "- executive_summary = the direct answer up front (balanced, or which side",
  "  it favors, and why in one line). comparison = the dimension-by-dimension",
  "  side-A-vs-side-B material itself. recommendations = what to negotiate to",
  "  correct an imbalance. conclusion = the bottom line.",
  '- heading = a specific, user-facing `##` title tailored to what was found',
  '  (e.g. "Termination rights favor the vendor 3 ways", "What to renegotiate',
  '  to balance termination rights") — NOT a generic label like "Comparison".',
  "",
  "Rules:",
  "- Use each role at most once. Order them so the direct answer leads and the",
  "  bottom line ends.",
  "- Only include a section you can fill from the supplied material. If the",
  "  comparison is genuinely balanced, do not invent a recommendations",
  "  section — lead with that finding and keep it short.",
  "- Do not invent findings, sides, or dimensions. You are choosing structure",
  "  and headings only; another step writes the prose from the same evidence.",
].join("\n");

function toOutlineItem(section: DesignedSection): ReportOutlineItem | null {
  const role = section.role as ReportSectionRole;
  if (!ALLOWED_COMPARISON_ROLES.includes(role)) return null;
  const heading = section.heading?.trim();
  if (!heading) return null;
  const sectionId = sectionIdForRole(role);
  return {
    id: `compare.${role}`,
    role: roleForSectionId(sectionId),
    sectionId,
    heading,
    requirementIds: [],
    source: "catalog_llm",
  };
}

interface ComparisonPair {
  dimension: string;
  sideA: string | null;
  sideB: string | null;
}

function comparisonPairs(findings: Finding[]): ComparisonPair[] {
  const deltas = findings.filter(
    (f) => f.kind === "comparison_delta" && f.visibility !== "internal"
  );
  const groups = new Map<string, Finding[]>();
  for (const f of deltas) {
    const key = f.compareGroup ?? f.requirementId ?? f.findingId;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  return [...groups.entries()].map(([group, members]) => ({
    dimension: group.replace(/^compare_/, "").replace(/_/g, " "),
    sideA: members.find((m) => m.compareRole === "side_a")?.claim ?? null,
    sideB: members.find((m) => m.compareRole === "side_b")?.claim ?? null,
  }));
}

/**
 * Normalize the same way designRiskOutline does: enforce role uniqueness,
 * lead-first/conclusion-last, and prune an empty recommendations section.
 */
function normalizeDesigned(
  designed: DesignedSection[],
  seed: ReportOutlineItem[],
  hasPairs: boolean
): ReportOutlineItem[] {
  const items: ReportOutlineItem[] = [];
  const seenRoles = new Set<ReportSectionRole>();
  for (const section of designed) {
    const item = toOutlineItem(section);
    if (!item) continue;
    if (seenRoles.has(item.role)) continue;
    seenRoles.add(item.role);
    items.push(item);
  }
  if (items.length === 0) return seed;

  const pruned = hasPairs ? items : items.filter((i) => i.role !== "recommendations");

  if (hasPairs && !pruned.some((i) => i.role === "comparison")) {
    pruned.push({
      id: "compare.comparison",
      role: "comparison",
      sectionId: "comparison",
      heading: suggestedHeading("comparison"),
      requirementIds: [],
      source: "catalog_llm",
    });
  }

  const lead = pruned.find((i) => i.role === "executive_summary");
  const conclusion = pruned.find((i) => i.role === "conclusion");
  const middle = pruned.filter(
    (i) => i.role !== "executive_summary" && i.role !== "conclusion"
  );
  const ordered: ReportOutlineItem[] = [];
  ordered.push(
    lead ?? {
      id: "compare.executive_summary",
      role: "executive_summary",
      sectionId: "executive_summary",
      heading: suggestedHeading("executive_summary"),
      requirementIds: [],
      source: "catalog_llm",
    }
  );
  ordered.push(...middle);
  ordered.push(
    conclusion ?? {
      id: "compare.conclusion",
      role: "conclusion",
      sectionId: "conclusion",
      heading: suggestedHeading("conclusion"),
      requirementIds: [],
      source: "catalog_llm",
    }
  );
  return ordered;
}

/**
 * For the compare lane (operation=compare), let an LLM design the report's
 * section shape and headings around the dimensions actually compared,
 * instead of selecting from the generic section catalog. Mirrors
 * design-risk-outline.ts's designRiskOutline: grounded (only sees real
 * side_a/side_b claims), bounded (a 4-role menu, lead-first/conclusion-last
 * enforced deterministically), and safe (any failure or empty result falls
 * back to the deterministic seed outline from deriveSections).
 */
export async function designComparisonOutline(
  state: AnalysisState,
  findings: Finding[],
  seedOutline: ReportOutlineItem[]
): Promise<ReportOutlineItem[]> {
  const pairs = comparisonPairs(findings);
  if (pairs.length === 0) return seedOutline;

  const prompt = [
    "User's question:",
    state.request.instruction.slice(0, 800),
    "",
    "Dimensions compared, and what was established for each side:",
    ...pairs.map(
      (p) =>
        `- ${p.dimension}: Side A — ${p.sideA ?? "(not established)"} | Side B — ${p.sideB ?? "(not established)"}`
    ),
    "",
    "Design the sections for this answer. Return ONLY JSON matching the schema.",
  ].join("\n");

  try {
    const raw = (await executeJsonCompletion(
      prompt,
      DESIGN_SYSTEM_PROMPT,
      DESIGN_SCHEMA as any,
      LLMTask.STRUCTURAL_JSON_LITE,
      LLMProvider.GEMINI
    )) as unknown as { sections?: DesignedSection[] };

    const designed = raw?.sections ?? [];
    if (designed.length === 0) return seedOutline;
    return normalizeDesigned(designed, seedOutline, pairs.length > 0);
  } catch (error) {
    pacWarn("comparison outline design failed; using seed outline", {
      error: error instanceof Error ? error.message : String(error),
    });
    return seedOutline;
  }
}
