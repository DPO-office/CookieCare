import { apiUrl } from "../../../config";

/**
 * How the frontend should render the input for this question.
 * Mirrors backend QuestionInputType from modules/drafting/pac/types,
 * extended with "number" for duration/quantity fields.
 */
export type QuestionInputType = "text" | "textarea" | "date" | "chips" | "chips-multi" | "number";

/** Mirrors backend UserQuestion from modules/drafting/pac/types. */
export type DraftOpenQuestion = {
  id: string;
  field: string;
  question: string;
  severity: "critical" | "optional";
  /** Populated when inputType is "chips" or "chips-multi". */
  options?: string[];
  /**
   * Render hint emitted by the LLM.
   * Falls back to "chips" when options[] is present, "text" otherwise.
   */
  inputType?: QuestionInputType;
};

export type DraftJobResult = {
  status?: string;
  content?: string;
  data?: string;
  draft?: { formattedDocument?: string };
  file_id?: string;
  documentId?: string;
  openQuestions?: DraftOpenQuestion[];
  conversation?: unknown;
  version?: number;
};

export type DraftJobOutcome =
  | {
      kind: "needs_input";
      documentId: string;
      openQuestions: DraftOpenQuestion[];
      result: DraftJobResult;
    }
  | {
      kind: "success";
      content: string;
      documentId?: string;
      result: DraftJobResult;
    }
  | {
      kind: "failed";
      error: string;
    };

export type WaitForDraftJobOptions = {
  authToken: string;
  jobId: string;
  onProgress?: (message: string) => void;
  onToken?: (delta: string) => void;
};

function extractDraftContent(result: DraftJobResult | undefined): string {
  if (!result) return "";
  return (
    result.content ||
    result.data ||
    result.draft?.formattedDocument ||
    ""
  );
}

/**
 * Subscribe to /api/jobs/sse until the given job completes, fails, or pauses for ASK.
 */
export function waitForDraftJob(options: WaitForDraftJobOptions): Promise<DraftJobOutcome> {
  const { authToken, jobId, onProgress, onToken } = options;
  return new Promise((resolve) => {
    const eventSource = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
    let settled = false;
    const finish = (outcome: DraftJobOutcome) => {
      if (settled) return;
      settled = true;
      eventSource.close();
      resolve(outcome);
    };
    eventSource.onmessage = (event) => {
      let payload: any;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (payload.event === "draft_token" && payload.jobId === jobId) {
        const delta = payload.delta || "";
        if (delta) onToken?.(delta);
        return;
      }
      if (payload.event !== "job_update" || payload.job?.id !== jobId) return;
      const job = payload.job;
      if (job.message) onProgress?.(job.message);
      if (job.status === "processing") {
        if (!job.message) onProgress?.("Working…");
        return;
      }
      if (job.status === "failed") {
        finish({ kind: "failed", error: job.error || "Drafting job failed." });
        return;
      }
      if (job.status === "completed") {
        const result = (job.result || {}) as DraftJobResult;
        const documentId = result.file_id || result.documentId || "";
        if (result.status === "needs_input") {
          finish({
            kind: "needs_input",
            documentId,
            openQuestions: result.openQuestions ?? [],
            result,
          });
          return;
        }
        finish({
          kind: "success",
          content: extractDraftContent(result),
          documentId: documentId || undefined,
          result,
        });
      }
    };
    eventSource.onerror = () => {
      finish({
        kind: "failed",
        error: "Connection to drafting engine was interrupted. Please retry.",
      });
    };
  });
}

export async function enqueueDraftingJob(
  authToken: string,
  path: string,
  body: unknown
): Promise<string> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Drafting request failed");
  if (res.status !== 202 || !data.job_id) {
    throw new Error("Expected async job_id from drafting API");
  }
  return data.job_id as string;
}
