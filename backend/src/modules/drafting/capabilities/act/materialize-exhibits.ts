import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DraftState } from "../../models/draft-state.js";
import type { ExhibitSpec } from "../../models/draft-exhibits.js";
import { buildDealIdentity } from "./deal-identity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveExhibitsRoot(): string {
  const candidates = [
    process.env.DRAFTING_PACKS_DIR
      ? path.join(process.env.DRAFTING_PACKS_DIR, "exhibits")
      : "",
    path.join(__dirname, "../../packs/exhibits"),
    path.join(process.cwd(), "src/modules/drafting/packs/exhibits"),
    path.join(process.cwd(), "backend/src/modules/drafting/packs/exhibits"),
    path.join(__dirname, "../../../packs/exhibits"),
  ].filter(Boolean);

  for (const c of candidates) {
    if (existsSync(path.join(c, "scc-module-2.md"))) return c;
  }
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0] || path.join(process.cwd(), "src/modules/drafting/packs/exhibits");
}

async function loadExhibitBody(spec: ExhibitSpec): Promise<string> {
  if (spec.sourceText?.trim()) return spec.sourceText.trim();
  if (!spec.sourceFile) return "";
  const full = path.join(resolveExhibitsRoot(), spec.sourceFile);
  try {
    return (await readFile(full, "utf8")).trim();
  } catch (err) {
    console.warn(
      `[materializeExhibits] failed to load ${full}: ${(err as Error).message}`
    );
    return "";
  }
}

function buildHeader(spec: ExhibitSpec, state: DraftState): string {
  const identity = buildDealIdentity(
    state.structuredFacts ?? state.plan?.structuredFacts,
    state.plan?.documentType
  );
  const lines = [
    `# ${spec.title}`,
    "",
    identity
      ? `This ${spec.kind === "sccs" || spec.kind === "idta" ? "annex" : "schedule"} forms part of the Data Processing Agreement between ${identity.partyA} (${identity.roleA}) and ${identity.partyB} (${identity.roleB}).`
      : `This schedule forms part of the Data Processing Agreement between the parties.`,
    identity?.effectiveDate
      ? `Effective Date: ${identity.effectiveDate}.`
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Assign letters A, B, C… in outline order for exhibit work units.
 */
export function assignExhibitLetters(
  specs: ExhibitSpec[],
  workUnitOrder: string[]
): ExhibitSpec[] {
  const ordered = [...specs].sort((a, b) => {
    const ia = workUnitOrder.indexOf(a.id);
    const ib = workUnitOrder.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return ordered.map((s, i) => ({
    ...s,
    letter: String.fromCharCode(65 + i),
  }));
}

/**
 * Materialize full-text exhibits (SCC/IDTA/BAA) from bundled bodies.
 * Briefed exhibits (schedules/TOMs) are left for draftExhibit.
 * Also injects a cross-reference sentence into parent section bodies.
 */
export async function materializeExhibits(state: DraftState): Promise<DraftState> {
  const specs = state.draftingContext?.exhibitSpecs ?? [];
  if (specs.length === 0) return state;

  const workUnitOrder =
    state.plan?.workUnits.filter((u) => u.kind === "exhibit").map((u) => u.id) ??
    specs.map((s) => s.id);

  const withLetters = assignExhibitLetters(specs, workUnitOrder);
  let exhibits = [...(state.exhibits ?? [])];
  let sections = [...(state.draft?.sections ?? [])];

  for (const spec of withLetters) {
    if (spec.referenceOnly) continue;

    if (spec.requiresFullText) {
      const body = await loadExhibitBody(spec);
      const header = buildHeader(spec, state);
      const full = body
        ? `${header}\n\n${body}`
        : `${header}\n\n[Exhibit body unavailable — attach counsel-approved ${spec.kind} text.]`;

      exhibits = [
        ...exhibits.filter((e) => e.workUnitId !== spec.id),
        {
          workUnitId: spec.id,
          title: spec.title,
          body: full,
          clauseProvenance: [
            { spanStart: 0, spanEnd: full.length, source: "generated" as const },
          ],
        },
      ];
      console.log(
        `[materializeExhibits] full-text ${spec.id} letter=${spec.letter} chars=${full.length}`
      );
    }

    // Cross-reference into parent section.
    const parentIdx = sections.findIndex((s) => s.workUnitId === spec.parentSectionId);
    if (parentIdx >= 0 && spec.letter) {
      const xref = `\n\nSee Schedule ${spec.letter} (${spec.title}).`;
      const parent = sections[parentIdx];
      if (!parent.body.includes(`Schedule ${spec.letter}`)) {
        sections[parentIdx] = {
          ...parent,
          body: parent.body.trimEnd() + xref,
        };
      }
    }
  }

  return {
    ...state,
    exhibits,
    draftingContext: state.draftingContext
      ? { ...state.draftingContext, exhibitSpecs: withLetters }
      : state.draftingContext,
    draft: state.draft
      ? {
          ...state.draft,
          sections,
          formattedDocument: state.draft.formattedDocument,
          rawOutput: state.draft.rawOutput,
        }
      : state.draft,
  };
}
