/**
 * Analyze feature — API layer.
 *
 * All network calls for the Analyze feature live here.
 * Components and hooks must not call fetch() directly.
 */

import { apiUrl } from "../../../config";

/**
 * Create a new folder in the document vault.
 * Returns true on success, false on failure.
 */
export async function createAnalyzeFolder(
  authToken: string,
  name: string,
): Promise<boolean> {
  const res = await fetch(apiUrl("/api/folders"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ name }),
  });
  return res.ok;
}
