/**
 * Vault Tags column: short chips only (contract type, status, short region).
 * Splits comma/semicolon lists, drops giant jurisdiction dumps, caps length.
 */
export function parseVaultTags(raw: string | undefined | null): string[] {
  if (!raw || raw === "-") return [];
  const parts = String(raw)
    .split(/[,;|]/)
    .map((p) => p.trim())
    .filter(Boolean);

  const MAX_CHIP = 28;
  const out: string[] = [];
  for (const part of parts) {
    // Skip processing/failed status tokens — shown as badges on the name instead.
    const lower = part.toLowerCase();
    if (lower === "processing" || lower === "failed" || lower === "ready") continue;
    if (lower === "playbook" || lower === "company" || lower === "template") continue;
    if (part.length > MAX_CHIP) continue;
    if (!out.includes(part)) out.push(part);
  }
  return out.slice(0, 4);
}
