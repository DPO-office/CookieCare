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

export async function fetchLibraryItems(authToken: string) {
  const res = await cachedFetch(apiUrl("/api/library-items?limit=500"), authToken);
  return unwrap(res);
}

export async function fetchDocuments(authToken: string) {
  const res = await cachedFetch(apiUrl("/api/documents?limit=500"), authToken);
  return unwrap(res);
}

export async function deleteFolder(authToken: string, id: string): Promise<boolean> {
  const res = await fetch(apiUrl(`/api/folders/${id}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (res.ok) invalidateVaultCache(authToken);
  return res.ok;
}

export async function deleteDocument(authToken: string, id: string): Promise<boolean> {
  const res = await fetch(apiUrl(`/api/documents/${id}`), {
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
  details: string
) {
  const res = await fetch(apiUrl("/api/library-items"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ type, name, description, tags, details }),
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
