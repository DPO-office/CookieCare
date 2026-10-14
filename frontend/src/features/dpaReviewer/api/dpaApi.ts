import { apiUrl } from "../../../config";

/**
 * Upload a DPA document for review.
 * Returns the job_id to subscribe to via SSE.
 */
export async function submitDPAReview(
  file: File,
  authToken: string
): Promise<{ job_id: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(apiUrl("/api/dpa/review"), {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Failed to start DPA review.");
  }

  return data; // { success: true, job_id: string }
}

/**
 * Open an SSE connection to the job progress stream.
 * Reuses the same /api/jobs/sse endpoint used by Analyze and Ask AI Lawyer.
 */
export function createJobSSE(authToken: string): EventSource {
  return new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
}
