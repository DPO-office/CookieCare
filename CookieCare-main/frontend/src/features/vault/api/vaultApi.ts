import { apiUrl } from "../../../config";

export async function fetchFolders(authToken: string) {
  const res = await fetch(apiUrl("/api/folders"), { headers: { Authorization: `Bearer ${authToken}` } });
  return res.ok ? res.json() : [];
}

export async function fetchLibraryItems(authToken: string) {
  const res = await fetch(apiUrl("/api/library-items"), { headers: { Authorization: `Bearer ${authToken}` } });
  return res.ok ? res.json() : [];
}

export async function fetchDocuments(authToken: string) {
  const res = await fetch(apiUrl("/api/documents"), { headers: { Authorization: `Bearer ${authToken}` } });
  return res.ok ? res.json() : [];
}

export async function deleteFolder(authToken: string, id: string): Promise<boolean> {
  const res = await fetch(apiUrl(`/api/folders/${id}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.ok;
}

export async function deleteDocument(authToken: string, id: string): Promise<boolean> {
  const res = await fetch(apiUrl(`/api/documents/${id}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.ok;
}

export async function createFolder(authToken: string, name: string) {
  const res = await fetch(apiUrl("/api/folders"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ name }),
  });
  return res.ok;
}

export async function createLibraryItem(
  authToken: string,
  type: string,
  name: string,
  description: string,
  tags: string,
  details: string
) {
  const res = await fetch(apiUrl("/api/library-items"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ type, name, description, tags, details }),
  });
  return res.ok;
}

export async function uploadFileToFolder(
  authToken: string,
  folderId: string,
  file: File,
  onJobId: (jobId: string) => void
): Promise<{ sync: boolean }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder_id", folderId);
  formData.append("isTemplate", "false");
  const res = await fetch(apiUrl("/api/documents/upload"), {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  if (res.status === 202 && data.job_id) {
    onJobId(data.job_id);
    return { sync: false };
  }
  return { sync: true };
}
