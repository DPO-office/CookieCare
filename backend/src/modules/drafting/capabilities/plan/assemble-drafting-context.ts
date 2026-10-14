import type { DraftState } from "../../models/draft-state.js";
import type { WorkUnit } from "../../models/draft-plan.js";
import type {
  DraftingContext,
  DraftingContextTemplate,
  DraftingContextProvenance,
  AssetProvenanceSource,
} from "../../models/drafting-context.js";
import type {
  DraftingSkillConfig,
  ExhibitBrief,
  SectionBrief,
  SkillValidationRule,
} from "../../packs/skill-contract.js";
import type { ApplicablePacks } from "../../packs/resolve-applicable-packs.js";
import type { StructuredFacts } from "../../models/structured-facts.js";
import type { ExhibitSpec } from "../../models/draft-exhibits.js";

/** Collect executable skill configs from applicable packs. */
export function collectSkillConfigs(
  applicable: ApplicablePacks
): DraftingSkillConfig[] {
  const skills: DraftingSkillConfig[] = [];
  if (applicable.typePack.skillConfig) {
    skills.push(applicable.typePack.skillConfig);
  }
  for (const regime of applicable.regimes) {
    if (regime.skillConfig) skills.push(regime.skillConfig);
  }
  return skills;
}

/** Merge conditional work units from skills when predicates match. */
export function resolveConditionalWorkUnits(
  skills: DraftingSkillConfig[],
  facts: StructuredFacts
): WorkUnit[] {
  const units: WorkUnit[] = [];
  const seen = new Set<string>();
  for (const skill of skills) {
    for (const spec of skill.conditionalWorkUnits ?? []) {
      if (!spec.when(facts)) continue;
      if (seen.has(spec.workUnit.id)) continue;
      seen.add(spec.workUnit.id);
      units.push({ ...spec.workUnit, status: "pending" });
      console.log(
        `[assembleDraftingContext] conditional unit ${spec.workUnit.id} from ${skill.skillId} (${spec.id})`
      );
    }
  }
  return units;
}

function scoreHeadingMatch(headingNorm: string, lineNorm: string, lineIndex: number): number {
  if (!headingNorm || !lineNorm) return 0;
  // Skip document title candidates at line 0-2 if they look like agreement titles
  if (lineIndex <= 2 && /^(?:data\s+processing\s+(?:agreement|addendum)|mutual\s+nda|master\s+services\s+agreement)$/i.test(lineNorm)) {
    return 0;
  }

  // Exact match
  if (lineNorm === headingNorm) return 100;
  if (lineNorm.replace(/^\d+[\.:\s]+/, "") === headingNorm) return 90;

  // Substring match
  if (lineNorm.includes(headingNorm)) return 80;
  if (headingNorm.includes(lineNorm.replace(/^\d+[\.:\s]+/, ""))) return 70;

  // Topic keyword intersections
  const topicKeywords = [
    ["liability", "damages", "indemn"],
    ["parties", "background", "recital"],
    ["definition"],
    ["processing", "instructions"],
    ["subprocessor", "sub-processor", "subcontractor"],
    ["transfer", "third country", "cross-border"],
    ["security", "technical and organisational"],
    ["assistance", "data subject rights", "data principal"],
    ["breach", "incident"],
    ["deletion", "return", "erasure"],
    ["audit", "inspection"],
    ["governing law", "jurisdiction", "dispute", "applicable law"],
    ["confidential"],
    ["term", "termination"],
  ];

  for (const group of topicKeywords) {
    const headingHas = group.some((k) => headingNorm.includes(k));
    const lineHas = group.some((k) => lineNorm.includes(k));
    if (headingHas && lineHas) {
      const matches = group.filter((k) => lineNorm.includes(k) && headingNorm.includes(k)).length;
      return 50 + matches * 10;
    }
  }

  return 0;
}

function sliceTemplateByHeading(
  content: string,
  heading: string
): string | undefined {
  if (!content.trim() || !heading.trim()) return undefined;
  const lines = content.split(/\r?\n/);
  const headingNorm = heading.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  let bestStart = -1;
  let bestScore = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNorm = lines[i].toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (lineNorm.length >= 3) {
      const score = scoreHeadingMatch(headingNorm, lineNorm, i);
      if (score > bestScore) {
        bestScore = score;
        bestStart = i;
      }
    }
  }

  if (bestStart < 0 || bestScore < 40) return undefined;
  const start = bestStart;
  let end = lines.length;

  for (let i = start + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // Check markdown header
    if (/^#{1,3}\s+\S/.test(trimmed)) {
      end = i;
      break;
    }
    // Check numbered clause header: 1. Clause, 11. Amendments
    if (/^(?:(?:SECTION|CLAUSE|ARTICLE)\s+)?\d+[\.:]\s+[A-Z]/i.test(trimmed)) {
      end = i;
      break;
    }
    // Check Exhibit/Schedule
    if (/^(?:SCHEDULE|EXHIBIT|APPENDIX|ANNEX)\b/i.test(trimmed)) {
      end = i;
      break;
    }
    // Check standalone heading followed by subclause or known title
    if (/^[A-Z][A-Za-z0-9\s,&;:'–\-\(\)/]{2,90}$/.test(trimmed) && !/[.,;:]$/.test(trimmed)) {
      let isNextHeading = false;
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        const nextTrim = lines[j].trim();
        if (!nextTrim) continue;
        if (/^\d+\.\d+\s+/.test(nextTrim)) {
          isNextHeading = true;
          break;
        }
        break;
      }
      const isKnownLegalHeading =
        /^(?:Background|Definitions|Processing|Sub-?Processors|Limitations|Security|Disclosure|Confidentiality|Compensation|Damages|Liability|Indemn|Amendments|Term|Applicable law|Governing law|Dispute)/i.test(
          trimmed
        );
      if (isNextHeading || isKnownLegalHeading) {
        end = i;
        break;
      }
    }
  }

  return lines.slice(start, end).join("\n").trim();
}

function extractExclusions(raw: string): string[] {
  const exclusions: string[] = [];
  const re =
    /\b(?:exclud(?:e|ed|ing)|omit|do not include|without)\s+([^.;\n]{3,80})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    exclusions.push(m[1].trim());
  }
  const fromFacts = (raw.match(/\bexcludedRequirements?\b/i) ? [] : []);
  return [...exclusions, ...fromFacts];
}

function mapTemplateSource(
  src: string | undefined
): AssetProvenanceSource {
  if (src === "vault") return "vault";
  if (src === "default_type") return "default_type";
  if (src === "source_upload") return "source_upload";
  if (src === "none") return "none";
  return (src as AssetProvenanceSource) || "none";
}

/**
 * Assemble DraftingContext after packs + retrieval + requirement resolve.
 */
export function assembleDraftingContext(
  state: DraftState,
  applicable: ApplicablePacks,
  workUnits: WorkUnit[]
): DraftingContext {
  const skills = collectSkillConfigs(applicable);
  const facts = (state.structuredFacts ?? {}) as StructuredFacts;

  const sectionBriefs: Record<string, SectionBrief> = {};
  const exhibitBriefs: Record<string, ExhibitBrief> = {};
  const validationRules: SkillValidationRule[] = [];
  const exhibitSpecs: ExhibitSpec[] = [];
  const seenExhibitIds = new Set<string>();

  for (const skill of skills) {
    for (const brief of skill.sectionBriefs ?? []) {
      const prior = sectionBriefs[brief.workUnitId];
      if (!prior) {
        sectionBriefs[brief.workUnitId] = brief;
      } else {
        sectionBriefs[brief.workUnitId] = {
          ...prior,
          ...brief,
          requiredContent: [
            ...new Set([...prior.requiredContent, ...brief.requiredContent]),
          ],
          requiredLegalElements: [
            ...new Set([
              ...(prior.requiredLegalElements ?? []),
              ...(brief.requiredLegalElements ?? []),
            ]),
          ],
          requiredFacts: [
            ...new Set([
              ...(prior.requiredFacts ?? []),
              ...(brief.requiredFacts ?? []),
            ]),
          ],
        };
      }
    }
    for (const brief of skill.exhibitBriefs ?? []) {
      exhibitBriefs[brief.workUnitId] = brief;
    }
    for (const rule of skill.validationRules ?? []) {
      validationRules.push(rule);
    }
    for (const spec of skill.exhibitSpecs ?? []) {
      if (seenExhibitIds.has(spec.id)) continue;
      // Only include if work unit is in the plan (conditional exhibits).
      if (!workUnits.some((u) => u.id === spec.id) && spec.requiresFullText) {
        // Still register if the corresponding unit exists OR it's a required exhibit.
        if (!(skill.requiredExhibits ?? []).includes(spec.id)) continue;
      }
      if (!workUnits.some((u) => u.id === spec.id)) continue;
      seenExhibitIds.add(spec.id);
      exhibitSpecs.push({ ...spec });
    }
  }

  // Fuzzy brief fallback for template-derived skeletons.
  // When a user template overrides the skeleton, work unit IDs are generated as
  // "sec-1-parties", "sec-2-definitions", etc. — they never exactly match the
  // static brief IDs ("sec-parties", "sec-definitions") authored in skill configs.
  // This pass attaches the closest authored brief to any unmatched work unit using
  // heading substring matching, so the LLM still gets structured guidance.
  const authoredBriefs = Object.values(sectionBriefs);
  for (const unit of workUnits) {
    if (sectionBriefs[unit.id]) continue; // already matched
    if (unit.kind === "exhibit") continue; // exhibits handled separately
    const headingNorm = unit.heading.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    let bestBrief: SectionBrief | undefined;
    let bestScore = 0;
    for (const brief of authoredBriefs) {
      const briefNorm = brief.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const briefId = brief.workUnitId.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      let score = 0;
      // Full heading contains brief title or vice versa
      if (headingNorm.includes(briefNorm) || briefNorm.includes(headingNorm)) score += 4;
      // Partial word overlap
      const headingWords = headingNorm.split(" ").filter((w) => w.length > 3);
      const briefWords = briefNorm.split(" ").filter((w) => w.length > 3);
      for (const w of headingWords) {
        if (briefWords.some((bw) => bw.includes(w) || w.includes(bw))) score += 2;
      }
      // ID slug overlap
      if (headingNorm.split(" ").some((w) => w.length > 3 && briefId.includes(w))) score += 1;
      if (score > bestScore) {
        bestScore = score;
        bestBrief = brief;
      }
    }
    if (bestBrief && bestScore >= 3) {
      sectionBriefs[unit.id] = bestBrief;
      console.log(
        `[assembleDraftingContext] fuzzy brief fallback: ${unit.id} (${unit.heading}) → ${bestBrief.workUnitId} (score=${bestScore})`
      );
    }
  }

  // Derive ExhibitSpec from exhibit briefs when skill didn't declare exhibitSpecs.
  for (const [id, brief] of Object.entries(exhibitBriefs)) {
    if (seenExhibitIds.has(id)) continue;
    if (!workUnits.some((u) => u.id === id)) continue;
    seenExhibitIds.add(id);
    const kind =
      id.includes("scc")
        ? ("sccs" as const)
        : id.includes("idta")
          ? ("idta" as const)
          : id.includes("security") || id.includes("tom")
            ? ("toms" as const)
            : id.includes("hipaa") || id.includes("baa")
              ? ("baa" as const)
              : ("schedule" as const);
    exhibitSpecs.push({
      id,
      title: brief.title,
      kind,
      requiresFullText: kind === "sccs" || kind === "idta",
      parentSectionId: brief.relatedSections?.[0] || "sec-misc",
      sourceFile:
        kind === "sccs"
          ? "scc-module-2.md"
          : kind === "idta"
            ? "uk-idta.md"
            : undefined,
    });
  }

  let template: DraftingContextTemplate | undefined;
  const matched = state.retrieval.matchedTemplate;
  if (matched) {
    const sectionSlices: Record<string, string> = {};
    for (const unit of workUnits) {
      const slice = sliceTemplateByHeading(matched, unit.heading);
      if (slice) sectionSlices[unit.id] = slice;
    }
    template = {
      id:
        state.retrieval.templateId ||
        state.request.templateId ||
        state.request.vaultDocumentId ||
        "matched-template",
      source: state.retrieval.templateSource || "vault",
      content: matched,
      sectionSlices:
        Object.keys(sectionSlices).length > 0 ? sectionSlices : undefined,
    };
  }

  const clauses = state.retrieval.fallbackClauses ?? [];
  const provenance: DraftingContextProvenance = {
    template: template
      ? {
          id: template.id,
          source: mapTemplateSource(state.retrieval.templateSource),
          wasFallback: state.retrieval.templateSource === "default_type",
        }
      : undefined,
    playbook: {
      id: state.retrieval.playbookId ?? state.request.playbookId ?? "none",
      source: state.retrieval.playbookId
        ? "exact_id"
        : state.retrieval.applicablePlaybookRules?.length
          ? "contract_type_default"
          : "none",
    },
    clauses: clauses.map((c) => ({
      id: c.id,
      source: (c.source as AssetProvenanceSource) ||
        (c.wasFallback
          ? "generic_fallback"
          : state.retrieval.clauseSource === "clause_catalog"
            ? "clause_catalog"
            : state.retrieval.clauseSource === "library_items"
              ? "library_items"
              : state.retrieval.clauseSource === "hardcoded_fallback"
                ? "generic_fallback"
                : "none"),
      wasFallback: c.wasFallback === true || c.source === "generic_fallback",
    })),
  };

  const exclusionsFromFacts = Array.isArray(facts.excludedRequirements)
    ? facts.excludedRequirements.filter((e): e is string => typeof e === "string")
    : [];

  const ctx: DraftingContext = {
    documentType: applicable.typePack.id,
    skillIds: skills.map((s) => s.skillId),
    facts,
    draftRequirements: state.draftRequirements,
    requirements: state.draftRequirements,
    userIntent: {
      rawInstructions: state.request.rawInstructions || "",
      exclusions: [
        ...extractExclusions(state.request.rawInstructions || ""),
        ...exclusionsFromFacts,
      ],
      preferences: [],
    },
    conflicts: state.draftRequirements?.conflicts ?? [],
    gaps: state.plan?.missingFacts ?? [],
    outline: workUnits.map((u) => ({ ...u })),
    provenance,
    template,
    playbook: {
      id: state.retrieval.playbookId ?? state.request.playbookId ?? undefined,
      rules: state.retrieval.applicablePlaybookRules ?? [],
    },
    clauses,
    sectionBriefs,
    exhibitBriefs,
    exhibitSpecs,
    validationRules,
    // Keep skills in runtime memory only — stripped on persist (functions not cloneable).
    skills,
  };

  console.log(
    `[assembleDraftingContext] docType=${ctx.documentType} skills=${ctx.skillIds.join(",") || "(none)"} briefs=${Object.keys(sectionBriefs).length} exhibits=${exhibitSpecs.length} template=${template?.id ?? "none"} playbook=${ctx.playbook?.id ?? "none"} rules=${ctx.playbook?.rules.length ?? 0} gaps=${ctx.gaps.length}`
  );

  return ctx;
}
