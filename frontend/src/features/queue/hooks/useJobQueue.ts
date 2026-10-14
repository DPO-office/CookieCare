import { useState, useEffect } from "react";
import { Job } from "../types";
import { fetchJobs } from "../api/queueApi";
import { apiUrl } from "../../../config";

export function useJobQueue() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  const token = localStorage.getItem("lex_token") || "";

  const loadJobs = async () => {
    try {
      setJobs(await fetchJobs(token));
    } catch (err) {
      console.error("[QueueManager] Failed to fetch queue:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    let sse: EventSource | null = null;
    if (token) {
      try {
        sse = new EventSource(apiUrl(`/api/jobs/stream?token=${encodeURIComponent(token)}`));
        sse.onopen = () => setErrorStatus(null);
        sse.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === "job_update" && data.job) {
              setJobs((prev) => {
                const idx = prev.findIndex((j) => j.id === data.job.id);
                if (idx !== -1) { const copy = [...prev]; copy[idx] = data.job; return copy; }
                return [data.job, ...prev];
              });
            }
          } catch {}
        };
        sse.onerror = () => setErrorStatus("SSE stream in polling standby...");
      } catch {}
    }
    const poll = setInterval(loadJobs, 4000);
    return () => { if (sse) sse.close(); clearInterval(poll); };
  }, [token]);

  return { jobs, loading, errorStatus, loadJobs };
}
