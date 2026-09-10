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

function sliceTemplateByHeading(
  content: string,
  heading: string
): string | undefined {
  if (!content.trim() || !heading.trim()) return undefined;
  const lines = content.split(/\r?\n/);
  const headingNorm = heading.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const lineNorm = lines[i].toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (
      lineNorm.includes(headingNorm) ||
      headingNorm.includes(lineNorm.replace(/^\d+\s*/, ""))
    ) {
      if (lineNorm.length >= 4) {
        start = i;
        break;
      }
    }
  }
  if (start < 0) return undefined;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,3}\s+\S/.test(lines[i]) || /^\d+\.\s+[A-Z]/.test(lines[i])) {
      end = i;
      break;
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
