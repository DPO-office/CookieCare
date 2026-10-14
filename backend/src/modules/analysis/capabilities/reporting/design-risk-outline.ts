import {
  executeJsonCompletion,
  LLMProvider,
  LLMTask,
} from "../../../../llm/index.js";
import type { AnalysisState } from "../../models/analysis-state.js";
import type { Finding } from "../../models/finding.js";
import {
  isConfirmedRiskFinding,
  isProtectiveFinding,
} from "../../shared/finding-semantics.js";
import type { ReportOutlineItem, ReportSectionRole } from "../../models/intent.js";
import { sectionIdForRole, suggestedHeading } from "../../prompts/report-sections.js";
import { roleForSectionId } from "../../prompts/report-sections.js";
import { pacWarn } from "../../utils/pac-log.js";

/**
 * Roles the risk-narrative architect may emit. Deliberately small: each renders
 * distinct material (lead answer / the risks / what to negotiate / bottom line)
 * so no two designed sections restate the same content. `risk_summary` is the
 * only role whose section surfaces the MATERIAL RISKS block per-section
 * (synthesis.ts `includeRisks`), so risks always live there; the others frame
 * around them.
 */
const ALLOWED_RISK_ROLES: ReportSectionRole[] = [
  "executive_summary",
  "risk_summary",
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
  "You are the editor deciding the SHAPE of a risk-analysis answer for a",
  "specific contract and a specific user question. You are given the risks that",
  "were actually confirmed in the document and the points the document was",
  "checked for and found to PROTECT the user on. Design the report's sections",
  "so the answer reads like a sharp analyst wrote it for THIS question — not a",
  "generic compliance template.",
  "",
  "Return an ordered list of sections. For each: a `role` and a `heading`.",
  "- role must be one of: executive_summary, risk_summary, recommendations,",
  "  conclusion.",
  "- executive_summary = the direct answer / the single biggest exposure, up",
  "  front. risk_summary = the ranked risks themselves. recommendations = what",
  "  to negotiate or fix before proceeding. conclusion = the bottom line.",
  "- heading = a specific, user-facing `##` title tailored to what was found",
  '  (e.g. "Your biggest exposure: unlimited sub-processor liability", "What to',
  '  renegotiate before onboarding") — NOT a generic label like "Risk summary".',
  "",
  "Rules:",
  "- Use each role at most once. Order them so the direct answer leads and the",
  "  bottom line ends.",
  "- Only include a section you can fill from the supplied material. If NO",
  "  risks were confirmed, do not invent a risks section or recommendations —",
  "  lead with the reassurance and keep it short.",
  "- Do not invent findings, severities, or clauses. You are choosing structure",
  "  and headings only; another step writes the prose from the same evidence.",
].join("\n");

function toOutlineItem(section: DesignedSection): ReportOutlineItem | null {
  const role = section.role as ReportSectionRole;
  if (!ALLOWED_RISK_ROLES.includes(role)) return null;
  const heading = section.heading?.trim();
  if (!heading) return null;
  const sectionId = sectionIdForRole(role);
  return {
    id: `risk.${role}`,
    role: roleForSectionId(sectionId),
    sectionId,
    heading,
    requirementIds: [],
    source: "catalog_llm",
  };
}

function riskClaims(findings: Finding[], contradicted: boolean): string[] {
  return findings
    .filter((f) =>
      contradicted ? isProtectiveFinding(f) : isConfirmedRiskFinding(f)
    )
    .map((f) => `- ${f.claim}`)
    .slice(0, 20);
}

/**
 * Enforce the invariants the LLM must not break: at most one section per role,
 * a lead section first and a conclusion last, and a risks section whenever
 * risks were actually confirmed. Falls back to the deterministic seed shape.
 */
function normalizeDesigned(
  designed: DesignedSection[],
  seed: ReportOutlineItem[],
  hasConfirmedRisks: boolean
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

  // A recommendations section with nothing confirmed to fix is empty noise.
  const pruned = hasConfirmedRisks
    ? items
    : items.filter((i) => i.role !== "recommendations");

  // Guarantee a risks section exists when there are confirmed risks.
  if (hasConfirmedRisks && !pruned.some((i) => i.role === "risk_summary")) {
    pruned.push({
      id: "risk.risk_summary",
      role: "risk_summary",
      sectionId: "risk_summary",
      heading: suggestedHeading("risk_summary"),
      requirementIds: [],
      source: "catalog_llm",
    });
  }

  // Lead section first, conclusion last.
  const lead = pruned.find((i) => i.role === "executive_summary");
  const conclusion = pruned.find((i) => i.role === "conclusion");
  const middle = pruned.filter(
    (i) => i.role !== "executive_summary" && i.role !== "conclusion"
  );
  const ordered: ReportOutlineItem[] = [];
  ordered.push(
    lead ?? {
      id: "risk.executive_summary",
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
      id: "risk.conclusion",
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
 * Part 3c — for the open risk lane (operation=risk_flag), let an LLM design the
 * report's section shape and headings around the risks that were ACTUALLY
 * found, instead of selecting from the generic section catalog. Grounded (it
 * only sees real confirmed-risk / protection claims), bounded (a 4-role menu,
 * lead-first/conclusion-last enforced deterministically), and safe (any
 * failure or empty result falls back to the deterministic seed outline from
 * deriveSections/deriveReportOutline). Runs at render time because the findings
 * it grounds on do not exist until ACT has run.
 */
export async function designRiskOutline(
  state: AnalysisState,
  findings: Finding[],
  seedOutline: ReportOutlineItem[]
): Promise<ReportOutlineItem[]> {
  const confirmed = riskClaims(findings, false);
  const protectedOn = riskClaims(findings, true);
  if (confirmed.length === 0 && protectedOn.length === 0) return seedOutline;

  const prompt = [
    "User's question:",
    state.request.instruction.slice(0, 800),
    "",
    "Risks CONFIRMED present in the document:",
    confirmed.length > 0 ? confirmed.join("\n") : "(none confirmed)",
    "",
    "Points the document was checked for and found to PROTECT the user on:",
    protectedOn.length > 0 ? protectedOn.join("\n") : "(none)",
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
    return normalizeDesigned(designed, seedOutline, confirmed.length > 0);
  } catch (error) {
    pacWarn("risk outline design failed; using seed outline", {
      error: error instanceof Error ? error.message : String(error),
    });
    return seedOutline;
  }
}
