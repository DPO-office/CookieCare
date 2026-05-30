const rawApiBase =
  (
    import.meta as ImportMeta & {
      env?: Record<string, string | undefined>;
    }
  ).env?.VITE_API_BASE_URL?.trim() || "";

export const API_BASE_URL = rawApiBase.replace(/\/+$/, "");

export function buildApiUrl(input: string): string {
  if (!input.startsWith("/api")) {
    return input;
  }

  return API_BASE_URL ? `${API_BASE_URL}${input}` : input;
}
