import type { FixItem } from "../models/critique-report.js";

export function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function dedupeFixes(fixes: FixItem[]): FixItem[] {
  return dedupeByKey(fixes, (fix) => `${fix.workUnitId}:${fix.sourceItemId}`);
}
