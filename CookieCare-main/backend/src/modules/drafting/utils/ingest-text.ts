import pdf from "pdf-parse-fork";
import mammoth from "mammoth";

/**
 * Shared text extraction for vault ingest jobs (playbook / template / clause).
 * Accepts either a data: URL, remote URL, or raw base64 + mimeType from the upload payload.
 */
export async function extractIngestText(payload: {
  fileUrl?: string;
  fileBufferBase64?: string;
  mimeType?: string;
}): Promise<{ text: string; mimeType: string }> {
  let buffer: Buffer;
  let mimeType = payload.mimeType || "application/octet-stream";

  if (payload.fileBufferBase64) {
    buffer = Buffer.from(payload.fileBufferBase64, "base64");
  } else if (payload.fileUrl) {
    const fileUrl = payload.fileUrl;
    if (fileUrl.startsWith("data:")) {
      const match = fileUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        throw new Error("Invalid data URL payload for ingest extraction.");
      }
      mimeType = match[1] || mimeType;
      buffer = Buffer.from(match[2], "base64");
    } else {
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(
          `File download failed with status ${response.status} ${response.statusText}`
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get("content-type");
      if (contentType) mimeType = contentType.split(";")[0].trim();
    }
  } else {
    throw new Error("Ingest extraction requires fileUrl or fileBufferBase64.");
  }

  let text = "";
  if (mimeType === "application/pdf") {
    const data = await pdf(buffer);
    text = data.text ?? "";
  } else if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const data = await mammoth.extractRawText({ buffer });
    text = data.value ?? "";
  } else if (mimeType.startsWith("text/") || mimeType === "application/json") {
    text = buffer.toString("utf-8");
  } else {
    text = buffer.toString("utf-8").replace(/[^\x20-\x7E\r\n\t]/g, " ");
  }

  const cleaned = text.replace(/\0/g, "").trim();
  if (!cleaned) {
    throw new Error("Could not extract readable text from the uploaded file.");
  }

  return { text: cleaned, mimeType };
}
