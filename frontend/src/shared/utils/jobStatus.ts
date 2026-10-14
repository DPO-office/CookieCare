import { apiUrl } from "../../config";

export interface JobSnapshot {
  id: string;
  status: string;
  progress?: number | null;
  message?: string | null;
  result?: any;
  error?: string | null;
}

export interface WaitForJobOptions {
  onProgress?: (progress: number, message?: string) => void;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 1200;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJob(authToken: string, jobId: string): Promise<JobSnapshot | null> {
  const res = await fetch(apiUrl(`/api/jobs/${jobId}`), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Resolves with the job result once the job reaches a terminal state.
 *
 * Jobs begin executing before the upload response is delivered, so a "completed"
 * SSE broadcast can fire before any listener is attached and would never be seen.
 * Polling the persisted job row observes the terminal state regardless of timing.
 */
export async function waitForJob(
  authToken: string,
  jobId: string,
  options: WaitForJobOptions = {}
): Promise<any> {
  const {
    onProgress,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const startedAt = Date.now();
  let consecutiveFailures = 0;
  let lastProgress = -1;
  let lastMessage: string | undefined;

  for (;;) {
    let job: JobSnapshot | null = null;
    try {
      job = await fetchJob(authToken, jobId);
      consecutiveFailures = 0;
    } catch {
      consecutiveFailures++;
      if (consecutiveFailures >= 5) {
        throw new Error("Lost connection while checking processing status.");
      }
    }

    if (job) {
      const status = String(job.status || "").toLowerCase();
      const progress = typeof job.progress === "number" ? job.progress : undefined;
      const message = job.message || undefined;

      if (onProgress && (progress !== lastProgress || message !== lastMessage)) {
        lastProgress = progress ?? lastProgress;
        lastMessage = message;
        onProgress(progress ?? 0, message);
      }

      if (status === "completed") {
        onProgress?.(100, message || "Done");
        return job.result;
      }
      if (status === "failed") {
        throw new Error(job.error || message || "Processing failed.");
      }
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Processing timed out. The document may still finish in the background.");
    }

    await delay(pollIntervalMs);
  }
}
