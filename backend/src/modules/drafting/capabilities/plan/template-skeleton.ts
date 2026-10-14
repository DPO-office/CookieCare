import type { WorkUnit } from "../../models/draft-plan.js";

/**
 * Derives a dynamic WorkUnit[] skeleton by parsing section headings from template text.
 * Falls back to null if fewer than 2 distinct headings are found.
 */
export function deriveSkeletonFromTemplate(templateText: string): WorkUnit[] | null {
  if (!templateText || !templateText.trim()) return null;

  const lines = templateText.split(/\r?\n/);
  const rawHeadings: { heading: string; rawLine: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // Check markdown headings: # Title, ## Section
    const mdMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (mdMatch) {
      const title = mdMatch[1].trim();
      if (title.length > 2 && title.length < 120) {
        rawHeadings.push({ heading: title, rawLine: trimmed });
      }
      continue;
    }

    // Check numbered / roman clause headings: 1. Definitions, 2. STATUS., ARTICLE I: CONFIDENTIAL INFORMATION, CLAUSE 1: ...
    const numberedMatch = trimmed.match(
      /^(?:(?:SECTION|CLAUSE|ARTICLE)\s+)?(?:\d+|[IVXLCDM]+)[\.:]\s+([A-Z][A-Za-z0-9\s,&;:'–\-\(\)/\.]{2,80})$/i
    );
    if (numberedMatch) {
      const title = trimmed
        .replace(/^(?:(?:SECTION|CLAUSE|ARTICLE)\s+)?(?:\d+|[IVXLCDM]+)[\.:]\s*/i, "")
        .replace(/\.+$/, "")
        .trim();
      if (title.length > 2 && title.length < 100) {
        rawHeadings.push({ heading: title, rawLine: trimmed });
      }
      continue;
    }

    // Check Exhibits / Schedules / Appendices / Annexes
    const exhibitMatch = trimmed.match(/^(?:SCHEDULE|EXHIBIT|APPENDIX|ANNEX)\s+[A-Z0-9]+[:.-]?\s*(.*)$/i);
    if (exhibitMatch) {
      rawHeadings.push({ heading: trimmed, rawLine: trimmed });
      continue;
    }

    // Check standalone heading followed by subclause or known title (e.g. "Damages and liability towards third parties" followed by "10.1 ...")
    const isFalseHeading =
      /\b(?:is\s+not\s+used|is\s+deleted|intentionally\s+(?:left\s+)?blank|place\s+and\s+date|signature\s+page|in\s+witness\s+whereof)\b/i.test(trimmed) ||
      /^(?:\d+\.)?\s*\[?(?:processor|controller)\]?\s*$/i.test(trimmed);
    if (isFalseHeading) continue;

    if (/^[A-Z][A-Za-z0-9\s,&;:'–\-\(\)/]{2,120}$/.test(trimmed) && !/[.,;:]$/.test(trimmed)) {
      let followedBySubclause = false;
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        const nextTrim = lines[j].trim();
        if (!nextTrim) continue;
        if (/^\d+\.\d+\s+/.test(nextTrim)) {
          followedBySubclause = true;
          break;
        }
        break;
      }

      const isKnownLegalHeading =
        /^(?:Background|Definitions|Processing|Sub-?Processors|Limitations|Security|Disclosure|Confidentiality|Compensation|Damages|Liability|Indemn|Amendments|Term|Applicable law|Governing law|Dispute)/i.test(
          trimmed
        );

      if (followedBySubclause || isKnownLegalHeading) {
        rawHeadings.push({ heading: trimmed, rawLine: trimmed });
        continue;
      }
    }
  }

  // Deduplicate consecutive identical headings
  const uniqueHeadings: string[] = [];
  for (const item of rawHeadings) {
    const clean = item.heading.replace(/^[\d.#\s:-]+/, "").trim() || item.heading;
    if (clean && !uniqueHeadings.some((h) => h.toLowerCase() === clean.toLowerCase())) {
      uniqueHeadings.push(clean);
    }
  }

  if (uniqueHeadings.length < 2) return null;

  let firstSecId: string | null = null;

  return uniqueHeadings.map((heading, idx) => {
    const isEx = /exhibit|schedule|appendix|annex/i.test(heading);
    const slug = heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);
    const id = `${isEx ? "exhibit" : "sec"}-${idx + 1}-${slug || "part"}`;

    if (!firstSecId && !isEx) {
      firstSecId = id;
    }

    const lower = heading.toLowerCase();
    const clauseTypes: string[] = [];
    if (lower.includes("party") || lower.includes("parties") || lower.includes("recital")) clauseTypes.push("parties");
    if (lower.includes("def")) clauseTypes.push("definitions");
    if (lower.includes("service") || lower.includes("scope") || lower.includes("software")) clauseTypes.push("services");
    if (lower.includes("fee") || lower.includes("payment") || lower.includes("price") || lower.includes("comp")) clauseTypes.push("fees");
    if (lower.includes("data") || lower.includes("sec") || lower.includes("privacy")) clauseTypes.push("data-security");
    if (lower.includes("ip") || lower.includes("intellectual") || lower.includes("prop")) clauseTypes.push("ip");
    if (lower.includes("sla") || lower.includes("support")) clauseTypes.push("sla");
    if (lower.includes("confident")) clauseTypes.push("confidentiality");
    if (lower.includes("liab") || lower.includes("indemn") || lower.includes("damage")) clauseTypes.push("liability");
    if (lower.includes("term")) clauseTypes.push("term");
    if (lower.includes("misc") || lower.includes("govern") || lower.includes("general") || lower.includes("dispute") || lower.includes("amend")) clauseTypes.push("misc");
    if (clauseTypes.length === 0) clauseTypes.push("general");

    const dependsOn: string[] = [];
    if (idx > 0 && firstSecId && id !== firstSecId) {
      dependsOn.push(firstSecId);
    }

    return {
      id,
      kind: isEx ? ("exhibit" as const) : ("section" as const),
      heading,
      dependsOn,
      clauseTypes,
      status: "pending" as const,
    };
  });
}
