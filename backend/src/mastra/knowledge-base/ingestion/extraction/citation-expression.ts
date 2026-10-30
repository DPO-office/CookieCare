export interface CitationAddress {
  kind: "article" | "rule" | "section" | "schedule";
  number: string;
  subpoints: string[];
}
const ordinals: Record<string, string> = { first: "1", second: "2", third: "3", fourth: "4",
  fifth: "5", sixth: "6", seventh: "7", eighth: "8", ninth: "9", tenth: "10" };
export const citationKey = (value: string) => value.toLowerCase().replace(/[\u2010-\u2015]/gu, "-")
  .replace(/\s+/gu, " ").replace(/\(\s*/gu, "(").replace(/\s*\)/gu, ")").trim();

/** Preserve explicit target sets and nested addresses; ambiguity is decided per address. */
export function parseCitationExpression(value: string): CitationAddress[] {
  const text = citationKey(value), result: CitationAddress[] = [];
  const schedule = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|the) schedule\b/u.exec(text);
  if (schedule) result.push({ kind: "schedule", number: ordinals[schedule[1]!] ?? "1", subpoints: [] });
  const nested = /\b(?:clauses?|points?|subparagraphs?)\s+(\([a-z0-9]+\)(?:\s*(?:,|and|or)\s*\([a-z0-9]+\))*)\s+of\s+(?:sub-?section|paragraph)\s*\(([a-z0-9]+)\)\s+of\s+(section|article|rule)\s+(\d+[a-z]?)/u.exec(text);
  if (nested) return [...nested[1]!.matchAll(/\(([a-z0-9]+)\)/gu)].map(m => ({
    kind: nested[3] as CitationAddress["kind"], number: nested[4]!, subpoints: [nested[2]!, m[1]!] }));
  const compound = /\b(?:sub-?sections?|clauses?|paragraphs?|points?)\s+(\([a-z0-9]+\)(?:\s*(?:,|and|or)\s*\([a-z0-9]+\))*)\s+of\s+(section|article|rule)s?\s+(\d+[a-z]?)/u.exec(text);
  if (compound) return [...compound[1]!.matchAll(/\(([a-z0-9]+)\)/gu)].map(m => ({
    kind: compound[2] as CitationAddress["kind"], number: compound[3]!, subpoints: [m[1]!] }));
  const number = "(?:\\d+[a-z]?|[ivxlcdm]+|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)";
  const address = `${number}\\b(?:\\s*\\([a-z0-9]+\\))*`;
  const expression = new RegExp(`(?<!sub-)\\b(article|rule|section|schedule)s?\\s+(${address}(?:\\s*(?:,|and|or)\\s*${address})*)`, "gu");
  for (const match of text.matchAll(expression)) {
    for (const part of match[2]!.split(/\s*(?:,|\band\b|\bor\b)\s*/u)) {
      const first = new RegExp(`^(${number})\\b`, "u").exec(part.trim());
      if (first) result.push({ kind: match[1] as CitationAddress["kind"],
        number: ordinals[first[1]!] ?? first[1]!, subpoints: [...part.matchAll(/\(([a-z0-9]+)\)/gu)].map(m => m[1]!) });
    }
  }
  return [...new Map(result.map(item => [JSON.stringify(item), item])).values()];
}

/** The explicit instrument suffix also governs preceding citations in a coordinated list. */
export function externalInstrumentForMention(text: string, start: number, end: number): string | null {
  const mention = text.slice(start, end);
  const instrument = /\b(?:of\s+)?(?:the\s+)?([A-Z][A-Za-z]*(?:[\s-]+[A-Za-z]+){0,14}\s+(?:Act|Code|Regulation|Directive|Convention)(?:,?\s+\d{4}(?:\/\d+)?)?)/u;
  const inMention = instrument.exec(mention);
  if (inMention && !/^(?:this|the)\s+/iu.test(inMention[1]!)) return inMention[1]!.trim();
  const tail = text.slice(end, end + 260);
  const suffix = /^(?:\s*(?:,|and|or)\s*(?:(?:sections?|articles?|rules?)\s+)?\d+[a-z]?(?:\s*\(\s*[a-z0-9]+\s*\))*)*\s+of\s+(?:the\s+)?/iu.exec(tail);
  if (!suffix) return null;
  return instrument.exec(tail.slice(suffix[0].length))?.[1]?.trim() ?? null;
}
