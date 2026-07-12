import { AgentMarkup } from "./types";
import { RISK_CONFIG } from "./constants";
import { markdownToHtml } from "../../shared/utils/markdownToHtml";

export function buildRenderedDocumentHtml(
  content: string,
  agentMarkups: AgentMarkup[],
  selectedMarkupId: string | null
): string {
  if (!content) return "";

  const isHtml = /<[a-z][\s\S]*>/i.test(content.trim());
  let html = isHtml ? content : markdownToHtml(content);

  const sorted = [...agentMarkups].sort((a, b) => {
    const order = { RED: 0, YELLOW: 1, GREEN: 2 };
    return order[a.riskLevel] - order[b.riskLevel];
  });

  for (const m of sorted) {
    if (!m.original || m.original.trim().length <= 10) continue;
    const escaped = m.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "");
    if (!regex.test(html)) continue;

    const riskColor = RISK_CONFIG[m.riskLevel].clauseHighlight;
    const isActive = m.clauseId === selectedMarkupId;
    const activeRing = isActive ? "ring-2 ring-offset-1 ring-gray-900" : "";

    const spanOpen =
      `<span ` +
      `data-clause-id="${m.clauseId}" ` +
      `class="negotiate-clause-highlight inline cursor-pointer rounded px-1 py-0.5 border transition-all ${riskColor} ${activeRing}" ` +
      `title="Click to review AI suggestion">` +
      `<span class="line-through text-red-600 text-[0.8125rem]">`;
    const spanClose = `</span></span>`;

    html = html.replace(regex, `${spanOpen}${m.original}${spanClose}`);
  }
  return html;
}
