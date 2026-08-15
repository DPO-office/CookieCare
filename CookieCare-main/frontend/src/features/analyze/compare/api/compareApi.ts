// ─── Compare Documents — API Service ─────────────────────────────────────────
// All backend communication for the Compare Agreements feature.
// Follows the exact same pattern as vendorReviewApi.ts.

import { apiUrl } from "../../../../config";

export interface SubmitCompareResponse {
  success: boolean;
  job_id: string;
}

/**
 * Submit two documents for AI comparison.
 * Returns a job_id to subscribe to via SSE.
 */
export async function submitCompare(
  original: File,
  revised: File,
  authToken: string,
  title?: string
): Promise<SubmitCompareResponse> {
  const formData = new FormData();
  formData.append("original", original);
  formData.append("revised", revised);
  if (title) {
    // Backend schema enforces max 200 chars — truncate to avoid a 400 error
    const safeTitle = title.length > 190 ? title.slice(0, 190) + "…" : title;
    formData.append("title", safeTitle);
  }

  const res = await fetch(apiUrl("/api/compare/start"), {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Failed to start comparison.");
  }

  return data as SubmitCompareResponse;
}

/**
 * Open an SSE connection to the job progress stream.
 * Reuses the same /api/jobs/sse endpoint used by vendor review and DPA review.
 */
export function createJobSSE(authToken: string): EventSource {
  return new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
}
