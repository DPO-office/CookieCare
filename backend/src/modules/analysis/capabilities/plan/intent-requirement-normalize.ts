import type {
  IntentRequirement,
  IntentRequirementPriority,
  IntentRequirementType,
  OperationAxis,
  UnresolvedIntentNeed,
} from "../../models/intent.js";
import { pacWarn } from "../../utils/pac-log.js";
import { extractArticleNumbers } from "../../skills/runtime/focus/extract-instruction-focus.js";

/** Matches umbrella ids like gdpr_articles_15_22_overview / articles_15_22_analysis. */
const UMBRELLA_RANGE_ID_RE =
  /(?:^|[._-])articles?[._-]?\d{1,3}[._-]\d{1,3}[._-]?(?:overview|analysis|summary|compliance)?$/i;

const REQUIREMENT_TYPES = new Set<IntentRequirementType>([
  "verification",
  "adequacy",
  "extraction",
  "comparison",
  "coverage",
  "recommendation",
  "other",
]);

const REQUIREMENT_PRIORITIES = new Set<IntentRequirementPriority>([
  "required",
  "supporting",
]);

export function normalizeRequirements(
  requirements: IntentRequirement[] | undefined
): IntentRequirement[] {
  if (!requirements?.length) return [];

  const seen = new Set<string>();
  const normalized: IntentRequirement[] = [];

  for (const item of requirements) {
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const description = typeof item.description === "string" ? item.description.trim() : "";
    const type = REQUIREMENT_TYPES.has(item.type as IntentRequirementType)
      ? (item.type as IntentRequirementType)
      : "other";
    const priority = REQUIREMENT_PRIORITIES.has(item.priority as IntentRequirementPriority)
      ? (item.priority as IntentRequirementPriority)
      : "required";

    if (!id || !description || seen.has(id)) continue;
    seen.add(id);
    normalized.push({ id, description, type, priority });
  }

  return normalized;
}

export function normalizeUnresolvedNeeds(
  unresolvedNeeds: UnresolvedIntentNeed[] | undefined
): UnresolvedIntentNeed[] {
  if (!unresolvedNeeds?.length) return [];

  const normalized: UnresolvedIntentNeed[] = [];
  for (const item of unresolvedNeeds) {
    if (!item || typeof item !== "object") continue;
    const description =
      typeof item.description === "string" ? item.description.trim() : "";
    const reason = typeof item.reason === "string" ? item.reason.trim() : "";
    if (!description) continue;
    normalized.push({
      description,
      reason: reason || "Could not express as a structured requirement",
    });
  }
  return normalized;
}

export function parseRequirementsFromRaw(value: unknown): IntentRequirement[] {
  if (!Array.isArray(value)) return [];
  const parsed: IntentRequirement[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    parsed.push({
      id: typeof record.id === "string" ? record.id : "",
      description: typeof record.description === "string" ? record.description : "",
      type: (typeof record.type === "string"
        ? record.type
        : "other") as IntentRequirementType,
      priority: (typeof record.priority === "string"
        ? record.priority
        : "required") as IntentRequirementPriority,
    });
  }
  return normalizeRequirements(parsed);
}

export function parseUnresolvedNeedsFromRaw(value: unknown): UnresolvedIntentNeed[] {
  if (!Array.isArray(value)) return [];
  const parsed: UnresolvedIntentNeed[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    parsed.push({
      description: typeof record.description === "string" ? record.description : "",
      reason: typeof record.reason === "string" ? record.reason : "",
    });
  }
  return normalizeUnresolvedNeeds(parsed);
}

/**
 * Drop umbrella range-scoped requirements and ensure every explicit article in
 * the instruction has its own verification requirement. The range is the union
 * of its members — never an extra overview/analysis requirement.
 */
export function expandArticleRangeRequirements(
  instruction: string,
  requirements: IntentRequirement[],
  regimePrefix = "gdpr"
): IntentRequirement[] {
  const articles = extractArticleNumbers(instruction);
  const withoutUmbrellas = requirements.filter(
    (req) => !isUmbrellaRangeRequirement(req)
  );

  if (articles.length === 0) return withoutUmbrellas;

  const covered = new Set<number>();
  for (const req of withoutUmbrellas) {
    const n = articleFromRequirementId(req.id);
    if (n) covered.add(n);
  }

  const expanded = [...withoutUmbrellas];
  for (const article of articles) {
    if (covered.has(article)) continue;
    expanded.push({
      id: `${regimePrefix}.article${article}.compliance`,
      description: `Verify compliance with ${regimePrefix.toUpperCase()} Article ${article}.`,
      type: "verification",
      priority: "required",
    });
    covered.add(article);
  }
  return expanded;
}

export function isUmbrellaRangeRequirement(req: IntentRequirement): boolean {
  if (UMBRELLA_RANGE_ID_RE.test(req.id)) return true;
  const desc = req.description.toLowerCase();
  const id = req.id.toLowerCase();
  if (
    (id.includes("articles_") || id.includes("articles-") || /articles?\d+_\d+/.test(id)) &&
    (id.includes("overview") ||
      id.includes("analysis") ||
      id.includes("summary") ||
      /\barticles?\s+\d+\s*[-–—to]+\s*\d+\b/i.test(desc))
  ) {
    return true;
  }
  return (
    /\b(?:overview|analysis|summary)\b/i.test(desc) &&
    /\barticles?\s+\d+\s*[-–—to,]+\s*\d+/i.test(desc) &&
    !/\barticle\s+\d+\b(?!\s*[-–—to,])/i.test(
      desc.replace(/\barticles?\s+\d+\s*[-–—to,]+\s*\d+/gi, "")
    )
  );
}

function articleFromRequirementId(id: string): number | undefined {
  const match = id.match(/\.?articles?_?(\d{1,3})(?:[._]|$)/i);
  if (match) return Number(match[1]);
  const bare = id.match(/(?:^|[._-])art(?:icle)?[._-]?(\d{1,3})(?:[._-]|$)/i);
  return bare ? Number(bare[1]) : undefined;
}

/**
 * Conservative post-classification guard — logs under-extraction; never replaces LLM output.
 */
export function warnRequirementCoverageGuard(
  instruction: string,
  operation: OperationAxis,
  requirements: IntentRequirement[]
): void {
  const trimmed = instruction.trim();
  if (!trimmed) return;

  if (
    (operation === "compliance_check" ||
      operation === "extract" ||
      operation === "compare") &&
    requirements.length === 0
  ) {
    pacWarn("semantic coverage warning: operation expects requirements but none extracted", {
      operation,
      instructionPreview: trimmed.slice(0, 200),
    });
    return;
  }

  const enumerationSignals =
    /\b(?:verify|check|assess|ensure|confirm)\b[^.!?]{0,120}(?:,|\band\b)/gi;
  const enumMatches = trimmed.match(enumerationSignals) ?? [];
  if (
    operation === "compliance_check" &&
    enumMatches.length >= 2 &&
    requirements.length <= 1
  ) {
    pacWarn(
      "semantic coverage warning: enumerated instruction but few requirements extracted",
      {
        requirementCount: requirements.length,
        enumerationHints: enumMatches.length,
        instructionPreview: trimmed.slice(0, 200),
      }
    );
  }
}

export function countRequirementsByPriority(requirements: IntentRequirement[]): {
  required: number;
  supporting: number;
} {
  let required = 0;
  let supporting = 0;
  for (const requirement of requirements) {
    if (requirement.priority === "supporting") supporting += 1;
    else required += 1;
  }
  return { required, supporting };
}
