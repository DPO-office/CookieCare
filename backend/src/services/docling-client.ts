/** Wire contract shared by the analysis parser and KB extractor. No native addon is loaded here. */
export type DoclingMode = "analysis-pdf" | "analysis-document" | "analysis-recovery" | "kb-pdf";
export interface DoclingConversion { status: "success" | "partial_success" | "failure"; document: Record<string, unknown> }

const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024;

export function doclingServiceConfigured(): boolean {
  return Boolean(process.env.DOCLING_SERVICE_URL?.trim());
}

export function doclingServiceSettings(): { url: string; token: string } {
  const url = process.env.DOCLING_SERVICE_URL?.trim();
  const token = process.env.DOCLING_SERVICE_TOKEN?.trim();
  if (!url || !token) throw new Error("DOCLING_SERVICE_URL and DOCLING_SERVICE_TOKEN are required");
  const parsed = new URL(url);
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("DOCLING_SERVICE_URL must use HTTPS in production");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.search || parsed.hash) {
    throw new Error("DOCLING_SERVICE_URL is invalid");
  }
  return { url: new URL("v1/convert", parsed.href.endsWith("/") ? parsed : `${parsed.href}/`).href, token };
}

export async function convertWithDoclingService(
  bytes: Uint8Array, fileName: string, format: string, mode: DoclingMode,
  options: { timeoutMs?: number; fetcher?: typeof fetch } = {},
): Promise<DoclingConversion> {
  if (!bytes.length || bytes.length > MAX_INPUT_BYTES) throw new Error("Docling input size is invalid");
  if (!/^[a-z0-9]{1,12}$/.test(format) || !fileName || /[\r\n]/.test(fileName)) {
    throw new Error("Docling input name or format is invalid");
  }
  const { url, token } = doclingServiceSettings();
  const timeoutMs = options.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      method: "POST", signal: controller.signal, body: Buffer.from(bytes),
      headers: {
        Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream",
        "X-Docling-Name": encodeURIComponent(fileName), "X-Docling-Format": format,
        "X-Docling-Mode": mode,
      },
    });
    if (!response.ok) throw new Error(`Docling service returned HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
      throw new Error("Docling response exceeds size limit");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Docling response body is missing");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("Docling response exceeds size limit"); }
      chunks.push(value);
    }
    let value: unknown;
    try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new Error("Docling service returned malformed JSON"); }
    const result = value as Partial<DoclingConversion> | null;
    if (!result || !["success", "partial_success", "failure"].includes(String(result.status)) ||
        !result.document || typeof result.document !== "object" || Array.isArray(result.document) ||
        typeof result.document.body !== "object" || !result.document.body ||
        Array.isArray(result.document.body)) {
      throw new Error("Docling service returned an invalid document");
    }
    return result as DoclingConversion;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Docling service timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
