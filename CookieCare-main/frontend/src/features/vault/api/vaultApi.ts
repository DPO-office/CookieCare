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

export type VaultIngestCategory = "playbook" | "templates" | "clauses";

/**
 * Upload a vault asset for structured ingest (playbook / templates / clauses).
 * Backend routes on `category`. contractType is required only for templates.
 */
export async function uploadVaultAsset(
  authToken: string,
  params: {
    file: File;
    category: VaultIngestCategory;
    contractType?: string;
    jurisdiction?: string;
    folderId?: string;
  },
  onJobId: (jobId: string) => void
): Promise<{ sync: boolean; fileId?: string; libraryItemId?: string }> {
  const formData = new FormData();
  formData.append("file", params.file);
  formData.append("category", params.category);
  if (params.contractType) formData.append("contractType", params.contractType);
  if (params.jurisdiction) formData.append("jurisdiction", params.jurisdiction);
  if (params.folderId) formData.append("folder_id", params.folderId);

  const res = await fetch(apiUrl("/api/documents/upload"), {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Vault asset upload failed");
  if (res.status === 202 && data.job_id) {
    onJobId(data.job_id);
    return {
      sync: false,
      fileId: data.file_id,
      libraryItemId: data.library_item_id,
    };
  }
  return {
    sync: true,
    fileId: data.file_id,
    libraryItemId: data.library_item_id,
  };
}
