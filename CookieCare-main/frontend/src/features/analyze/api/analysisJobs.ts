import { apiUrl } from "../../../config";

/** Mirrors backend UserQuestion from modules/analysis/pac/types. */
export type AnalysisOpenQuestion = {
  id: string;
  field: string;
  question: string;
  severity: "critical" | "optional";
  options?: string[];
};

export type AnalysisFinding = {
  findingId?: string;
  kind?: string;
  category?: string;
  status?: string;
  claim?: string;
  severity?: string;
  evidence?: Array<{ quotedText?: string }>;
};

export type AnalysisJobResult = {
  status?: string;
  sessionId?: string;
  findings?: AnalysisFinding[];
  renderedOutput?: string;
  declineMessage?: string;
  openQuestions?: AnalysisOpenQuestion[];
  conversation?: unknown;
  critique?: unknown;
};

export type AnalysisJobOutcome =
  | {
      kind: "needs_input";
      sessionId: string;
      openQuestions: AnalysisOpenQuestion[];
      result: AnalysisJobResult;
    }
  | {
      kind: "out_of_scope";
      sessionId?: string;
      declineMessage: string;
      result: AnalysisJobResult;
    }
  | {
      kind: "success";
      sessionId?: string;
      report: string;
      findings: AnalysisFinding[];
      result: AnalysisJobResult;
    }
  | {
      kind: "failed";
      error: string;
    };

export type WaitForAnalysisJobOptions = {
  authToken: string;
  jobId: string;
  onProgress?: (message: string) => void;
  onToken?: (delta: string) => void;
};

export const ANALYSIS_MAX_DOCS = 10;

/** Category ids that map to Analysis PAC skills via promptLibraryId. */
const SKILL_PROMPT_LIBRARY_IDS = new Set([
  "general-review",
  "commercial",
  "privacy",
  "privacy-gdpr-dpa",
]);

export function toPromptLibraryId(categoryId?: string): string | undefined {
  if (!categoryId) return undefined;
  const id = categoryId.trim().toLowerCase();
  return SKILL_PROMPT_LIBRARY_IDS.has(id) ? id : undefined;
}

function formatFindingsFallback(findings: AnalysisFinding[]): string {
  if (!findings.length) return "";
  const lines = [
    "# Analysis Report",
    "",
    "| Status | Kind | Category | Severity | Claim |",
    "|---|---|---|---|---|",
  ];
  for (const f of findings) {
    const claim = (f.claim || "").replace(/\|/g, "/");
    lines.push(
      `| ${f.status || "—"} | ${f.kind || "—"} | ${f.category || "—"} | ${f.severity || "—"} | ${claim} |`
    );
  }
  return lines.join("\n");
}

export function extractAnalysisReport(result: AnalysisJobResult | undefined): string {
  if (!result) return "";
  const rendered = result.renderedOutput?.trim();
  if (rendered) return rendered;
  const decline = result.declineMessage?.trim();
  if (decline) return decline;
  return formatFindingsFallback(result.findings ?? []);
}

/**
 * Subscribe to /api/jobs/sse until the given analysis PAC job completes, fails, or pauses for ASK.
 */
export function waitForAnalysisJob(
  options: WaitForAnalysisJobOptions
): Promise<AnalysisJobOutcome> {
  const { authToken, jobId, onProgress, onToken } = options;

  return new Promise((resolve) => {
    const eventSource = new EventSource(apiUrl(`/api/jobs/sse?token=${authToken}`));
    let settled = false;

    const finish = (outcome: AnalysisJobOutcome) => {
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
        if (!job.message) onProgress?.("Thinking…");
        return;
      }

      if (job.status === "failed") {
        finish({ kind: "failed", error: job.error || "Analysis job failed." });
        return;
      }

      if (job.status === "completed") {
        const result = (job.result || {}) as AnalysisJobResult;
        const sessionId = result.sessionId || "";

        if (result.status === "needs_input") {
          finish({
            kind: "needs_input",
            sessionId,
            openQuestions: result.openQuestions ?? [],
            result,
          });
          return;
        }

        if (result.status === "out_of_scope") {
          finish({
            kind: "out_of_scope",
            sessionId: sessionId || undefined,
            declineMessage:
              result.declineMessage ||
              "This request is outside document analysis. Please rephrase as a document-analysis question.",
            result,
          });
          return;
        }

        const report = extractAnalysisReport(result);
        finish({
          kind: "success",
          sessionId: sessionId || undefined,
          report: report || "Analysis complete.",
          findings: result.findings ?? [],
          result,
        });
      }
    };

    eventSource.onerror = () => {
      if (eventSource.readyState !== EventSource.CLOSED) return;
      finish({
        kind: "failed",
        error: "Connection to the analysis engine was interrupted. Please retry.",
      });
    };
  });
}

export async function enqueueAnalysisJob(
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
  if (!res.ok) throw new Error(data.error || "Analysis request failed");
  if (res.status !== 202 || !data.job_id) {
    throw new Error("Expected async job_id from analysis API");
  }
  return data.job_id as string;
}
