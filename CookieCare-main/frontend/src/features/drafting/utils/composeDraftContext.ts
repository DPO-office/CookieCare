import { DraftLibraryItem } from "../hooks/useDraftLibrary";

export function composeDraftContext(params: {
  playbook?: DraftLibraryItem | null;
  template?: DraftLibraryItem | null;
  clauses: DraftLibraryItem[];
}): string {
  const parts: string[] = [];

  if (params.playbook) {
    const body = params.playbook.details || params.playbook.description;
    parts.push(
      `Playbook — ${params.playbook.name}${body ? `\n${body}` : ""}`
    );
  }

  if (params.template) {
    const body = params.template.details || params.template.description;
    parts.push(
      `Use this structural template: ${params.template.name}${body ? `\n${body}` : ""}`
    );
  }

  if (params.clauses.length > 0) {
    const list = params.clauses
      .map((c) => {
        const body = c.details || c.description;
        return body ? `- ${c.name}: ${body}` : `- ${c.name}`;
      })
      .join("\n");
    parts.push(`Include these clauses:\n${list}`);
  }

  return parts.join("\n\n");
}
