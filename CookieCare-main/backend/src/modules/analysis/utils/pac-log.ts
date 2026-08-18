/** Terminal heartbeat for Analysis PAC — last line is whatever is currently running. */

const TAG = "[Analysis PAC]";

export function pacLog(message: string, extra?: Record<string, unknown>): void {
  const ts = new Date().toISOString().slice(11, 23);
  const suffix =
    extra && Object.keys(extra).length > 0 ? ` ${formatExtra(extra)}` : "";
  console.log(`${TAG} ${ts} ${message}${suffix}`);
}

export function pacWarn(message: string, extra?: Record<string, unknown>): void {
  const ts = new Date().toISOString().slice(11, 23);
  const suffix =
    extra && Object.keys(extra).length > 0 ? ` ${formatExtra(extra)}` : "";
  console.warn(`${TAG} ${ts} WARN ${message}${suffix}`);
}

/** Multi-line inspect dump — keeps PLAN / ACT quality reviews readable in the terminal. */
export function pacLogBlock(title: string, lines: string[]): void {
  const ts = new Date().toISOString().slice(11, 23);
  const bar = "=".repeat(72);
  console.log(`${TAG} ${ts}`);
  console.log(`${TAG} ${bar}`);
  console.log(`${TAG} ${title}`);
  console.log(`${TAG} ${bar}`);
  for (const line of lines) {
    console.log(`${TAG} ${line}`);
  }
  console.log(`${TAG} ${bar}`);
}

function formatExtra(extra: Record<string, unknown>): string {
  return Object.entries(extra)
    .map(([k, v]) => {
      if (v === undefined || v === null || v === "") return null;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        return `${k}=${v}`;
      }
      if (Array.isArray(v)) return `${k}=[${v.length}]`;
      return `${k}=${JSON.stringify(v)}`;
    })
    .filter(Boolean)
    .join(" ");
}
