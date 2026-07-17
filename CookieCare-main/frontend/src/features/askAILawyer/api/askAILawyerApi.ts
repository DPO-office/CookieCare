import { apiUrl } from "../../../config";
import { KBFolder, OutputFormat } from "../types";

export async function fetchSettings(authToken: string) {
  const [jRes, wRes] = await Promise.all([
    fetch(apiUrl("/api/settings/jurisdictions"), {
      headers: { Authorization: `Bearer ${authToken}` },
    }),
    fetch(apiUrl("/api/settings/web_discovery_sources"), {
      headers: { Authorization: `Bearer ${authToken}` },
    }),
  ]);
  if (!jRes.ok || !wRes.ok) throw new Error("Failed to load settings");
  const jurisdictions = await jRes.json();
  const webSources = await wRes.json();
  return { jurisdictions, webSources };
}

export async function fetchKnowledgeBase(authToken: string): Promise<KBFolder[]> {
  const [fRes, dRes] = await Promise.all([
    fetch(apiUrl("/api/folders"), { headers: { Authorization: `Bearer ${authToken}` } }),
    fetch(apiUrl("/api/documents"), { headers: { Authorization: `Bearer ${authToken}` } }),
  ]);
  if (!fRes.ok || !dRes.ok) throw new Error("Failed to load knowledge base");
  const fData = await fRes.json();
  const dData = await dRes.json();
  return fData.map((f: any) => ({
    id: f.id,
    name: f.name,
    isSelected: true,
    files: dData
      .filter((d: any) => d.folder_id === f.id)
      .map((d: any) => ({
        id: d.id,
        name: d.title || d.name,
        type: d.type || "DOC",
        size: "N/A",
        // Document content is NOT loaded into the frontend.
        // The backend retrieves content server-side via document ID.
      })),
  }));
}

export async function uploadDocument(authToken: string, file: File, folderId?: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", file.name);
  if (folderId && !folderId.startsWith("folder_")) {
    formData.append("folder_id", folderId);
  }
  const res = await fetch(apiUrl("/api/documents/upload"), {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "Upload failed");
  return { status: res.status, payload };
}

export async function askLawyer(
  authToken: string,
  query: string,
  jurisdictions: string[],
  format: OutputFormat,
  folders: KBFolder[]
) {
  // Send only document IDs — the backend retrieves content server-side via RAG / DB lookup.
  const activeDocumentIds = folders
    .filter((f) => f.isSelected)
    .flatMap((f) => f.files.map((fi) => fi.id))
    .filter(Boolean);

  const response = await fetch(apiUrl("/api/lawyer/ask"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      prompt: query,
      jurisdiction: jurisdictions,
      outputFormat: format,
      documentIds: activeDocumentIds,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Advisory failed.");
  return { status: response.status, data };
}

export function createJobSSE(authToken: string) {
  return new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
}
