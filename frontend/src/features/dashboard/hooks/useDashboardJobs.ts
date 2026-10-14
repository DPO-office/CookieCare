import { useEffect, useState } from "react";
import { apiUrl } from "../../../config";
import { fetchJobs } from "../../queue/api/queueApi";
import type { DashboardJob } from "../types";
import { normalizeJob } from "../utils";

function mergeJob(prev: DashboardJob[], incoming: DashboardJob): DashboardJob[] {
  const idx = prev.findIndex((j) => j.id === incoming.id);
  if (idx === -1) return [incoming, ...prev];
  const next = [...prev];
  next[idx] = { ...next[idx], ...incoming };
  return next;
}

export function useDashboardJobs(authToken: string) {
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authToken) {
      setJobs([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const rows = await fetchJobs(authToken);
        if (cancelled) return;
        setJobs(
          (Array.isArray(rows) ? rows : [])
            .map(normalizeJob)
            .filter((job): job is DashboardJob => Boolean(job))
        );
      } catch (err) {
        console.error("Failed to load dashboard jobs", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    let sse: EventSource | null = null;
    try {
      sse = new EventSource(apiUrl(`/api/jobs/stream?token=${encodeURIComponent(authToken)}`));
      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event !== "job_update" || !data.job) return;
          const job = normalizeJob(data.job);
          if (!job) return;
          setJobs((prev) => mergeJob(prev, job));
        } catch {
          /* ignore malformed SSE payloads */
        }
      };
    } catch {
      /* stream unavailable — polling below still refreshes */
    }

    const poll = setInterval(load, 8000);
    return () => {
      cancelled = true;
      if (sse) sse.close();
      clearInterval(poll);
    };
  }, [authToken]);

  return { jobs, loading };
}
