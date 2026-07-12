import React, { useState, useEffect } from "react";
import { apiUrl } from "../config";
import {
  Clock,
  CheckCircle,
  RefreshCw,
  Terminal,
  FileEdit,
  Globe,
  ShieldAlert,
  FileText,
  Activity,
  AlertCircle,
} from "lucide-react";

export interface Job {
  id: string;
  userId: string;
  type: "file_processing" | "document_analysis" | "template_drafting" | "privacy_scanning" | "vulnerability_scanning";
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  message: string;
  payload?: any;
  createdAt: string;
  completedAt?: string;
  result?: any;
  error?: string;
}

export default function QueueManager() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  const token = localStorage.getItem("lex_token") || "";

  const fetchJobs = async () => {
    try {
      const res = await fetch(apiUrl("/api/jobs"), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setJobs(await res.json());
    } catch (err) {
      console.error("[QueueManager] Failed to fetch queue:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
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
    const poll = setInterval(fetchJobs, 4000);
    return () => { if (sse) sse.close(); clearInterval(poll); };
  }, [token]);

  const getJobDetails = (job: Job) => {
    switch (job.type) {
      case "file_processing":     return { title: "File ingestion & parse",       icon: <FileText className="w-4 h-4 text-blue-500" /> };
      case "document_analysis":   return { title: "Compliance audit & risk scan",  icon: <Activity className="w-4 h-4 text-violet-500" /> };
      case "template_drafting":   return { title: "Template-guided drafting",      icon: <FileEdit className="w-4 h-4 text-emerald-500" /> };
      case "privacy_scanning":    return { title: "Cookie consent crawler",        icon: <Globe className="w-4 h-4 text-blue-500" /> };
      case "vulnerability_scanning": return { title: "SSL & header vulnerability probe", icon: <ShieldAlert className="w-4 h-4 text-rose-500" /> };
      default:                    return { title: "Background system task",        icon: <Terminal className="w-4 h-4 text-gray-400" /> };
    }
  };

  const statusConfig = {
    queued:     { label: "Queued",     cls: "bg-gray-100 text-gray-600 border-gray-200" },
    processing: { label: "Processing", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    completed:  { label: "Completed",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    failed:     { label: "Failed",     cls: "bg-red-50 text-red-700 border-red-200" },
  };

  return (
    <div className="flex-1 overflow-y-auto px-10 py-8 bg-[#FAFAFB] min-h-screen">

      {/* Header */}
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900 tracking-tight">Active Queue</h1>
          <p className="text-[13px] text-gray-500 mt-1">Real-time monitor of background AI processing tasks.</p>
        </div>
        <div className="flex items-center gap-2">
          {jobs.some((j) => j.status === "processing") && (
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 bg-white border border-gray-200 rounded-full px-3.5 py-1.5 shadow-xs">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Processing
            </span>
          )}
          <button onClick={fetchJobs} className="h-9 px-4 flex items-center gap-2 text-[13px] font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition shadow-xs">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {errorStatus && (
        <div className="mb-5 px-4 py-3 bg-amber-50 border border-amber-200 text-amber-800 text-[13px] rounded-xl flex items-center gap-2">
          <Clock className="w-4 h-4 shrink-0" />
          <span>{errorStatus}</span>
        </div>
      )}

      {/* Jobs table */}
      <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
        {/* Header row */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3.5 border-b border-gray-100 bg-gray-50">
          <div className="col-span-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Task</div>
          <div className="col-span-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Type</div>
          <div className="col-span-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Progress</div>
          <div className="col-span-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">Status</div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 text-gray-300 mx-auto mb-2 animate-spin" />
            <p className="text-[13px] text-gray-400">Loading queue...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="w-8 h-8 text-gray-200 mx-auto mb-3" />
            <p className="text-[13px] font-medium text-gray-500 mb-1">No active jobs</p>
            <p className="text-[12px] text-gray-400">Upload a file or trigger an audit to see tasks here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {jobs.map((job) => {
              const { title, icon } = getJobDetails(job);
              const cfg = statusConfig[job.status] || statusConfig.queued;
              const barColor = job.status === "failed" ? "bg-red-400" : job.status === "completed" ? "bg-emerald-500" : "bg-gray-900";

              return (
                <div key={job.id} className="px-6 py-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center hover:bg-gray-50/50 transition-colors">
                  <div className="col-span-4 flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">{icon}</div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">{title}</p>
                      <p className="text-[11px] text-gray-400 truncate font-mono">{job.id.slice(0, 16)}… · {new Date(job.createdAt).toLocaleTimeString()}</p>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-600">
                      {job.type.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="col-span-4">
                    <div className="flex items-center justify-between text-[12px] mb-1.5">
                      <span className="text-gray-500 truncate max-w-[200px]">{job.message || "Processing…"}</span>
                      <span className="font-bold text-gray-900 ml-2 shrink-0 tabular-nums">{job.progress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${job.progress}%` }} />
                    </div>
                  </div>

                  <div className="col-span-2 flex justify-end">
                    <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${cfg.cls} ${job.status === "processing" ? "animate-pulse" : ""}`}>
                      {cfg.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
