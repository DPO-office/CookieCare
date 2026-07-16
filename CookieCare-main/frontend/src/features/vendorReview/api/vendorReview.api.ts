/**
 * Vendor Review API layer.
 *
 * Mirrors the DPA Reviewer pattern exactly:
 *   1. POST /api/vendor-review  → job_id
 *   2. SSE  /api/jobs/sse       → job_update events
 */

import { apiUrl } from "../../../config";

export interface SubmitVendorReviewResponse {
  success: boolean;
  job_id: string;
}

/**
 * Submit vendor documents and/or a website URL for AI analysis.
 * Returns a job_id to subscribe to via SSE.
 *
 * At least one of files or vendorUrl must be provided (validated server-side).
 */
export async function submitVendorReview(
  files: File[],
  authToken: string,
  vendorUrl?: string,
): Promise<SubmitVendorReviewResponse> {
  const formData = new FormData();

  for (const file of files) {
    formData.append("files", file);
  }

  if (vendorUrl && vendorUrl.trim().length > 0) {
    formData.append("vendorUrl", vendorUrl.trim());
  }

  const res = await fetch(apiUrl("/api/vendor-review"), {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Failed to start vendor review.");
  }

  return data as SubmitVendorReviewResponse;
}

/**
 * Open an SSE connection to the job progress stream.
 * Reuses the same /api/jobs/sse endpoint used by DPA Reviewer and Analyze.
 */
export function createJobSSE(authToken: string): EventSource {
  return new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
}
