/**
 * AI Ethics Review API layer.
 *
 * Mirrors the Vendor Review pattern exactly:
 *   1. POST /api/ai-ethics  → job_id
 *   2. SSE  /api/jobs/sse   → job_update events
 */

import { apiUrl } from "../../../config";

export interface SubmitAIEthicsReviewResponse {
  success: boolean;
  job_id: string;
}

/**
 * Submit AI documents and/or a website URL for AI Ethics analysis.
 * Returns a job_id to subscribe to via SSE.
 *
 * At least one of files or websiteUrl must be provided (validated server-side).
 */
export async function submitAIEthicsReview(
  files: File[],
  authToken: string,
  websiteUrl?: string
): Promise<SubmitAIEthicsReviewResponse> {
  const formData = new FormData();

  for (const file of files) {
    formData.append("files", file);
  }

  if (websiteUrl && websiteUrl.trim().length > 0) {
    formData.append("websiteUrl", websiteUrl.trim());
  }

  const res = await fetch(apiUrl("/api/ai-ethics"), {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Failed to start AI Ethics review.");
  }

  return data as SubmitAIEthicsReviewResponse;
}

/**
 * Open an SSE connection to the job progress stream.
 * Reuses the same /api/jobs/sse endpoint used by Vendor Review and DPA Reviewer.
 */
export function createJobSSE(authToken: string): EventSource {
  return new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
}
