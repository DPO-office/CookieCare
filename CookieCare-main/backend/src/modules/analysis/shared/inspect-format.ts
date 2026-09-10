/** Shared formatting helpers for PLAN / ACT / CRITIQUE inspect logs. */

export function summarizeTools(units: { tool: string }[]): string {
  const counts = new Map<string, number>();
  for (const unit of units) {
    counts.set(unit.tool, (counts.get(unit.tool) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tool, count]) => (count > 1 ? `${tool} x${count}` : tool))
    .join(" → ");
}

export function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function wrapPrefixed(prefix: string, text: string, width = 92): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [`${prefix}(empty)`];
  const lines: string[] = [];
  let current = prefix;
  for (const word of words) {
    if (current.length === prefix.length) {
      current += word;
      continue;
    }
    if (current.length + 1 + word.length <= width) {
      current += ` ${word}`;
      continue;
    }
    lines.push(current);
    current = `${prefix}${word}`;
  }
  if (current.length > prefix.length) lines.push(current);
  return lines;
}

export function truncate(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}
