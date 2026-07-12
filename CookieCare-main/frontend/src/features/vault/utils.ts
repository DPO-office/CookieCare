export function fmtDate(raw: string | undefined): string {
  if (!raw) return "-";
  return new Date(raw)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })
    .replace(/\//g, "-");
}
