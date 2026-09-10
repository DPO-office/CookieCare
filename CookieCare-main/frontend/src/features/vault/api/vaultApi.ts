import { apiUrl } from "../../../config";

// ─── Shared fetch cache ──────────────────────────────────────────────────────
// Deduplicates concurrent calls for the same URL+token so the vault page and
// analyze page don't each fire independent requests during the same render cycle.
// Cache entries live for CACHE_TTL_MS then are evicted on the next read.

const CACHE_TTL_MS = 15_000; // 15 s is enough to cover simultaneous mounts

interface CacheEntry {
  promise: Promise<any>;
  resolvedAt: number | null;
}

const _fetchCache = new Map<string, CacheEntry>();

function cachedFetch(url: string, authToken: string): Promise<any> {
  const key = `${url}||${authToken}`;
  const now = Date.now();
  const existing = _fetchCache.get(key);

  // Reuse the in-flight promise, or a recently resolved result.
  if (existing) {
    if (existing.resolvedAt === null || now - existing.resolvedAt < CACHE_TTL_MS) {
      return existing.promise;
    }
    _fetchCache.delete(key);
  }

  const entry: CacheEntry = { promise: null as any, resolvedAt: null };
  entry.promise = fetch(url, { headers: { Authorization: `Bearer ${authToken}` } })
    .then((res) => {
      entry.resolvedAt = Date.now();
      return res.ok ? res.json() : [];
    })
    .catch(() => {
      _fetchCache.delete(key); // don't cache failures
      return [];
    });

  _fetchCache.set(key, entry);
  return entry.promise;
}

/** Manually invalidate cached entries for a given path prefix (call after mutations). */
export function invalidateVaultCache(authToken: string, pathPrefix?: string): void {
  const prefix = pathPrefix ?? "";
  for (const key of _fetchCache.keys()) {
    if (key.includes(authToken) && (prefix === "" || key.includes(prefix))) {
      _fetchCache.delete(key);
    }
  }
}

// ─── API helpers ─────────────────────────────────────────────────────────────

/** Unwrap paginated envelope — returns the `data` array, or the raw value if
 *  the server returns a plain array (backward-compat during rollout). */
function unwrap(response: any): any[] {
  if (Array.isArray(response)) return response;
  if (response && Array.isArray(response.data)) return response.data;
  return [];
}

export async function fetchFolders(authToken: string) {
  const res = await cachedFetch(apiUrl("/api/folders?limit=500"), authToken);
  return unwrap(res);
}

export async function fetchLibraryItems(authToken: string, source?: "private" | "org") {
  const qs = source ? `?limit=500&source=${source}` : "?limit=500";
  const res = await cachedFetch(apiUrl(`/api/library-items${qs}`), authToken);
  return unwrap(res);
}

export async function fetchDocuments(authToken: string) {
  const res = await cachedFetch(apiUrl("/api/documents?limit=500"), authToken);
  return unwrap(res);
}

/**
 * Paginated, filterable document fetch for the Negotiate picker.
 * Returns the full server envelope { data, pagination } so the UI can show
 * totals and render page controls.
 *
 * Does NOT use the shared cache because the picker drives its own loading state
 * and needs up-to-date results immediately after an upload.
 */
export interface DocumentPage {
  data: any[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

export async function fetchDocumentsPaginated(
  authToken: string,
  params: {
    type?: "upload" | "draft";
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<DocumentPage> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit ?? 10));
  qs.set("offset", String(params.offset ?? 0));
  if (params.type)   qs.set("type",   params.type);
  if (params.search) qs.set("search", params.search);

  const res = await fetch(apiUrl(`/api/documents?${qs.toString()}`), {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch documents (${res.status})`);
  }

  const json = await res.json();

  // Normalise — the backend always returns { data, pagination } but guard anyway.
  const data: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
  const pagination = json?.pagination ?? {
    total: data.length,
    limit: params.limit ?? 10,
    offset: params.offset ?? 0,
    hasMore: false,
  };

  return { data, pagination };
}

export async function deleteFolder(authToken: string, id: string): Promise<boolean> {
  const res = await fetch(apiUrl(`/api/folders/${id}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (res.ok) invalidateVaultCache(authToken);
  return res.ok;
}

/**
 * Delete a document from the `files` table (uploaded files, drafts).
 * Used for items whose ID starts with `doc_`.
 */
export async function deleteDocument(authToken: string, id: string): Promise<boolean> {
  const res = await fetch(apiUrl(`/api/documents/${id}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (res.ok) invalidateVaultCache(authToken);
  return res.ok;
}

/**
 * Delete an item from the `library_items` table (rulebook, templates, clauses,
 * prompts, questions, websites, tags). Used for items whose ID starts with `lib_`.
 */
export async function deleteLibraryItem(authToken: string, id: string): Promise<boolean> {
  const res = await fetch(apiUrl(`/api/library-items/${id}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (res.ok) invalidateVaultCache(authToken);
  return res.ok;
}

export async function createFolder(authToken: string, name: string) {
  const res = await fetch(apiUrl("/api/folders"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ name }),
  });
  if (res.ok) invalidateVaultCache(authToken);
  if (!res.ok) return null;
  return res.json();
}

export async function createLibraryItem(
  authToken: string,
  type: string,
  name: string,
  description: string,
  tags: string,
  details: string,
  source: "private" | "org" = "private"
) {
  const res = await fetch(apiUrl("/api/library-items"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ type, name, description, tags, details, source }),
  });
  if (res.ok) invalidateVaultCache(authToken);
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
  invalidateVaultCache(authToken);
  if (res.status === 202 && data.job_id) {
    onJobId(data.job_id);
    return { sync: false };
  }
  return { sync: true };
}

/**
 * Fetch the original uploaded file binary from GET /api/documents/:id/raw.
 * Returns an ArrayBuffer + the mime type so the caller can open it as a blob,
 * or null if the file isn't available / access is denied.
 */
export async function fetchRawDocument(
  authToken: string,
  fileId: string
): Promise<{ buffer: ArrayBuffer; mimeType: string; title: string } | null> {
  try {
    const res = await fetch(apiUrl(`/api/documents/${fileId}/raw`), {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return null;
    const mimeType = res.headers.get("Content-Type") || "application/octet-stream";
    // Strip any params (e.g. "; charset=utf-8") for clean blob construction.
    const cleanMime = mimeType.split(";")[0].trim();
    // Try to read the filename from Content-Disposition.
    const disposition = res.headers.get("Content-Disposition") || "";
    const nameMatch = disposition.match(/filename="?([^"]+)"?/i);
    const title = nameMatch ? decodeURIComponent(nameMatch[1]) : fileId;
    const buffer = await res.arrayBuffer();
    return { buffer, mimeType: cleanMime, title };
  } catch {
    return null;
  }
}

/**
 * Upload a document for a single Negotiate session only — does NOT persist to Vault.
 *
 * Sends ephemeral=true so the backend stores type='ephemeral_upload' with no
 * folder_id. The getDocuments query excludes ephemeral_upload, so this file
 * will never appear in Vault → Files or any other Vault list.
 *
 * Returns the file_id of the created ephemeral record so the caller can fetch
 * its content via GET /api/documents/:id and use it directly.
 */
export async function uploadEphemeralDocument(
  authToken: string,
  file: File
): Promise<{ fileId: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("ephemeral", "true");
  // No folder_id — ephemeral files have no vault folder.
  // No category — defaults to "upload" but with ephemeral=true becomes "ephemeral_upload".

  const res = await fetch(apiUrl("/api/documents/upload"), {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");

  const fileId: string = data.file_id;
  if (!fileId) throw new Error("Upload succeeded but no file_id was returned.");

  // Do NOT call invalidateVaultCache — this upload is invisible to Vault
  // and there is nothing to invalidate.
  return { fileId };
}

/**
 * Upload a vault asset for structured ingest (playbook / templates / clauses).
 * Backend routes on `category`. contractType is required only for templates.
 * source controls ownership scope: 'private' (default) or 'org'.
 */
export type VaultIngestCategory = "playbook" | "templates" | "clauses";

export async function uploadVaultAsset(
  authToken: string,
  params: {
    file: File;
    category: VaultIngestCategory;
    contractType?: string;
    jurisdiction?: string;
    folderId?: string;
    source?: "private" | "org";
  },
  onJobId: (jobId: string) => void
): Promise<{ sync: boolean; fileId?: string; libraryItemId?: string }> {
  const formData = new FormData();
  formData.append("file", params.file);
  formData.append("category", params.category);
  if (params.contractType) formData.append("contractType", params.contractType);
  if (params.jurisdiction) formData.append("jurisdiction", params.jurisdiction);
  if (params.folderId) formData.append("folder_id", params.folderId);
  formData.append("source", params.source ?? "private");

  const res = await fetch(apiUrl("/api/documents/upload"), {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Vault asset upload failed");
  invalidateVaultCache(authToken);
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
