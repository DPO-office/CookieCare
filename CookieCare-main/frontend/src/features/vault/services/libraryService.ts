/**
 * libraryService.ts
 *
 * Service layer for Vault / Library data operations.
 * Wraps vaultApi calls and owns the raw-to-domain mapping logic so that
 * hooks and components stay free of networking and transformation details.
 */

import {
  fetchFolders,
  fetchLibraryItems,
  fetchDocuments,
  deleteFolder,
  deleteDocument,
  deleteLibraryItem,
  createFolder,
  createLibraryItem,
  uploadFileToFolder,
  uploadVaultAsset,
  invalidateVaultCache,
  VaultIngestCategory,
} from "../api/vaultApi";
import { LibraryItem } from "../types";

export type { VaultIngestCategory };

// ─── Re-export raw API helpers that hooks still need directly ────────────────
export {
  deleteFolder,
  deleteDocument,
  deleteLibraryItem,
  createFolder,
  createLibraryItem,
  uploadFileToFolder,
  uploadVaultAsset,
  invalidateVaultCache,
};

// ─── Domain model helpers ────────────────────────────────────────────────────

/**
 * Formats an ISO date string into DD-MM-YY.
 * Exported so other vault components (e.g. SavedDraftsTable) can reuse it
 * without duplicating the logic.
 */
export function fmtDate(raw: string | undefined): string {
  if (!raw) return "-";
  return new Date(raw)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })
    .replace(/\//g, "-");
}

/**
 * Converts a byte count into a human-readable size string (KB / MB).
 * Returns "—" when the value is absent or zero.
 */
function fmtFileSize(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildDisplayTags(
  i: any,
  detailsObj: Record<string, unknown> | null
): string {
  const contractType =
    typeof detailsObj?.contractType === "string"
      ? detailsObj.contractType.trim()
      : "";
  const jurisdiction =
    typeof detailsObj?.jurisdiction === "string"
      ? detailsObj.jurisdiction.trim()
      : "";
  const shortJuris =
    jurisdiction &&
    jurisdiction.length <= 28 &&
    !/^not\s*specified$/i.test(jurisdiction)
      ? jurisdiction
      : "";

  if (
    contractType &&
    (i.type === "templates" || i.type === "clauses" || i.type === "rulebook")
  ) {
    return [contractType, shortJuris].filter(Boolean).join(", ");
  }
  return i.tags || "-";
}

function parseDetails(raw: any): Record<string, unknown> | null {
  try {
    if (typeof raw === "string") return JSON.parse(raw);
    if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return null;
}

// ─── Aggregated data loader ──────────────────────────────────────────────────

export interface LibraryData {
  items: LibraryItem[];
  savedDrafts: any[];
}

/**
 * Fetches folders, library items, and documents in parallel, then maps them
 * into domain-ready `LibraryItem[]` and a `savedDrafts` array.
 */
export async function loadLibraryData(authToken: string): Promise<LibraryData> {
  const [foldersData, libraryItemsData, docsData] = await Promise.all([
    fetchFolders(authToken),
    fetchLibraryItems(authToken),
    fetchDocuments(authToken),
  ]);

  const formattedFolders: LibraryItem[] = foldersData.map((f: any) => {
    const fileList = docsData
      .filter((d: any) => d.folder_id === f.id)
      .map((d: any) => ({ id: d.id, name: d.title || d.name, size: fmtFileSize(d.file_size), type: d.type }));

    return {
      id: f.id,
      type: "files" as const,
      name: f.name,
      description: "-",
      tags: "-",
      itemsCount: fileList.length,
      dateModified: fmtDate(f.updated_at),
      createdBy: "User",
      fileList,
    };
  });

  const formattedItems: LibraryItem[] = libraryItemsData.map((i: any) => {
    const detailsObj = parseDetails(i.details);
    return {
      id: i.id,
      type: i.type,
      name: i.name,
      description: i.description || "-",
      tags: buildDisplayTags(i, detailsObj),
      itemsCount: "1 item",
      dateModified: fmtDate(i.updated_at),
      createdBy: "User",
      // Normalise: legacy rows without a source column default to 'private'.
      source: (i.source === "org" ? "org" : "private") as "private" | "org",
      details: i.details,
    };
  });

  return {
    items: [...formattedFolders, ...formattedItems],
    // Only expose type='draft' documents as saved drafts — returning the full
    // docsData here was causing every uploaded file to appear in the
    // Saved Drafts tab of the vault.
    savedDrafts: docsData.filter((d: any) => d.type === "draft"),
  };
}
