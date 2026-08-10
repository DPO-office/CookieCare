import type { DraftState } from "../../models/draft-state.js";

/**
 * Resolve semantic anchors [[SEC:id]] to final section numbers once ordering is fixed.
 * Exhibits remain in state.exhibits[] and are appended as an appendix block.
 */
export async function assembleDocument(state: DraftState): Promise<DraftState> {
  const sections = state.draft?.sections ?? [];
  const ordered =
    state.plan?.workUnits
      .filter((u) => u.kind === "section")
      .map((u) => sections.find((s) => s.workUnitId === u.id || s.id === u.id))
      .filter(Boolean) ?? sections;

  const idToNumber = new Map<string, string>();
  ordered.forEach((s, i) => {
    if (s) idToNumber.set(s.workUnitId ?? s.id, String(i + 1));
  });

  const resolveAnchors = (text: string): string =>
    text.replace(/\[\[SEC:([^\]]+)\]\]/g, (_m, id: string) => {
      const n = idToNumber.get(id);
      return n ? `Section ${n}` : `Section (${id})`;
    });

  const resolvedSections = ordered.filter(Boolean).map((s) => ({
    ...s!,
    body: resolveAnchors(s!.body),
  }));

  const exhibitBlocks = (state.exhibits ?? []).map(
    (e, i) => `## Exhibit ${String.fromCharCode(65 + i)} — ${e.title}\n\n${resolveAnchors(e.body)}`
  );

  const formattedDocument = [...resolvedSections.map((s) => s.body), ...exhibitBlocks]
    .join("\n\n")
    .trim();

  return {
    ...state,
    draft: {
      rawOutput: formattedDocument,
      formattedDocument,
      sections: resolvedSections,
      version: (state.draft?.version ?? 0) + 1,
      parentVersionId: state.draft?.parentVersionId,
    },
  };
}
