import React, { useState, useEffect } from "react";
import { apiUrl } from "../config";
import { 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  RefreshCw, 
  Layers, 
  Terminal, 
  FileEdit, 
  Globe, 
  ShieldAlert, 
  FileText,
  Activity
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
      const res = await fetch(apiUrl("/api/jobs"), {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (err) {
      console.error("[QueueManager] Failed to fetch active background queue:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();

    // Establish live real-time communication channel via Server-Sent Events (SSE)
    let sse: EventSource | null = null;
    if (token) {
      const sseUrl = apiUrl(`/api/jobs/stream?token=${encodeURIComponent(token)}`);
      console.log("[QueueManager SSE] Establishing connection to:", sseUrl);
      
      try {
        sse = new EventSource(sseUrl);

        sse.onopen = () => {
          console.log("[QueueManager SSE] Channel handshake established successfully.");
          setErrorStatus(null);
        };

        sse.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === "job_update" && data.job) {
              const updatedJob = data.job as Job;
              console.log("[QueueManager SSE] Live Job Update Received:", updatedJob.id, updatedJob.progress + "%");
              setJobs((prevJobs) => {
                const index = prevJobs.findIndex((j) => j.id === updatedJob.id);
                if (index !== -1) {
                  const copy = [...prevJobs];
                  copy[index] = updatedJob;
                  return copy;
                } else {
                  return [updatedJob, ...prevJobs];
                }
              });
            }
          } catch (pErr) {
            console.warn("[QueueManager SSE] Message payload parsing bypassed:", pErr);
          }
        };

        sse.onerror = (err) => {
          console.warn("[QueueManager SSE] Active socket retry mapping:", err);
          // Auto-fallback check status periodically in case EventSource is closed or blocked by reverse proxy
          setErrorStatus("SSE Stream listening in polling standby mode...");
        };
      } catch (err: any) {
        console.error("[QueueManager SSE] Init failed:", err.message);
      }
    }

    // Active interval polling fallback to ensure robust sync state (100% durability guarantee)
    const fallbackPoll = setInterval(() => {
      fetchJobs();
    }, 4000);

    return () => {
      if (sse) {
        sse.close();
      }
      clearInterval(fallbackPoll);
    };
  }, [token]);

  const getJobDetails = (job: Job) => {
    switch (job.type) {
      case "file_processing":
        return {
          title: "Ingestion & Parse Inbound File",
          desc: job.payload?.fileTitle || "Uploaded contract PDF/DOCX file",
          icon: <FileText className="w-4 h-4 text-sky-600" />
        };
      case "document_analysis":
        return {
          title: "CUAD Compliance Audit & Risk Scan",
          desc: "Evaluating multi-clause regulatory alignment",
          icon: <Activity className="w-4 h-4 text-violet-600" />
        };
      case "template_drafting":
        return {
          title: "Template-Guided Drafting LLM Pipeline",
          desc: job.payload?.instructions || "Compiling custom contractual covenants",
          icon: <FileEdit className="w-4 h-4 text-emerald-600" />
        };
      case "privacy_scanning":
        return {
          title: "Cookie Consent Crawler Active Probe",
          desc: "Scanning domain tracking scripts",
          icon: <Globe className="w-4 h-4 text-blue-600" />
        };
      case "vulnerability_scanning":
        return {
          title: "SSL & Server Header Vulnerability Probe",
          desc: "Analyzing clickjacking (X-Frame) & TLS protocols",
          icon: <ShieldAlert className="w-4 h-4 text-rose-600" />
        };
      default:
        return {
          title: "System Maintenance Background Loop",
          desc: "General tasks queue processing",
          icon: <Terminal className="w-4 h-4 text-gray-500" />
        };
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-10 font-sans grid-bg min-h-screen">
      
      {/* HEADER SECTION */}
      <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 tracking-tight">
            Background Queue Console
          </h1>
          <p className="text-sm text-gray-500 font-mono tracking-wider uppercase mt-1">
            Real-Time Monitor of Multi-Agent Background Event-Loop
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono text-gray-500 bg-white shadow-xs border border-gray-200/60 rounded-full py-1.5 px-3">
          <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${jobs.some((j) => j.status === "processing") ? "animate-spin" : ""}`} />
          <span>Real-time SSE Tunnel Engaged</span>
        </div>
      </div>

      {/* SSE STANDBY / NOTIFICATIONS BAR */}
      {errorStatus && (
        <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-mono p-3 rounded-none flex items-center space-x-2">
          <Clock className="w-4 h-4 animate-pulse shrink-0" />
          <span>{errorStatus}</span>
        </div>
      )}

      {/* AGENT DISPATCH QUEUE SUMMARY */}
      <div className="bg-white border-2 border-black p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h3 className="font-display font-bold text-sm text-gray-900 uppercase tracking-tight">Active Background Tasks</h3>
          <p className="text-xs text-gray-500 font-sans mt-0.5 leading-normal max-w-xl">
            This module displays running tasks offloaded from the main Express responder. If you upload large agreements (up to 75MB) or run heavy scans, progress can be monitored seamlessly across sessions.
          </p>
        </div>
        <button
          onClick={fetchJobs}
          className="px-4 py-2 border border-gray-300 text-xs font-mono uppercase bg-white text-gray-700 hover:bg-gray-50 cursor-pointer font-bold transition-all shrink-0"
        >
          Force Reload list
        </button>
      </div>

      {/* JOBS MATRIX TABLE */}
      <div className="bg-white border-2 border-black overflow-hidden">
        <div className="border-b-2 border-black bg-gray-50 p-4 shrink-0 hidden md:grid grid-cols-12 gap-4 text-[10px] font-mono uppercase text-gray-500 font-bold tracking-wider">
          <div className="col-span-4">Operational Task / Target</div>
          <div className="col-span-2">Task Category</div>
          <div className="col-span-4">Execution Progress / Active Stage</div>
          <div className="col-span-2 text-right">Job Status</div>
        </div>

        <div className="divide-y divide-gray-200">
          {loading ? (
            <div className="p-12 text-center text-sm font-sans text-gray-400">
              <RefreshCw className="w-8 h-8 text-gray-300 mx-auto mb-3 animate-spin" />
              <span>Querying active queue...</span>
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-12 text-center text-sm font-sans text-gray-400">
              <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <span>No background jobs recorded in your user scope. Try uploading a file or triggering an audit.</span>
            </div>
          ) : (
            jobs.map((job) => {
              const { title, desc, icon } = getJobDetails(job);
              const isActive = job.status === "processing" || job.status === "queued";
              const isCompleted = job.status === "completed";
              const isFailed = job.status === "failed";

              return (
                <div key={job.id} className="p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center hover:bg-gray-50/50 transition-all">
                  {/* Title / Description */}
                  <div className="col-span-1 md:col-span-4 min-w-0">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-7 h-7 bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0">
                        {icon}
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-sm text-gray-900 block truncate leading-tight mb-0.5">
                          {title}
                        </span>
                        <span className="text-[11px] text-gray-500 truncate block font-mono">
                          {job.id} • {new Date(job.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Task Category description */}
                  <div className="col-span-1 md:col-span-2">
                    <span className="text-xs text-gray-700 font-mono font-bold tracking-tight uppercase bg-gray-100 px-2 py-0.5 rounded text-[10px]">
                      {job.type.replace("_", " ")}
                    </span>
                  </div>

                  {/* Progress / Messaging */}
                  <div className="col-span-1 md:col-span-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-gray-600 font-medium truncate block max-w-sm font-mono text-[11px]">
                        {job.message}
                      </span>
                      <span className="text-gray-900 font-bold font-mono shrink-0 ml-2">
                        {job.progress}%
                      </span>
                    </div>
                    {/* Raw Progress Bar representation without motion */}
                    <div className="w-full bg-gray-100 border border-gray-200 h-2.5 rounded-none overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${isFailed ? "bg-rose-500" : isCompleted ? "bg-emerald-600" : "bg-black"}`}
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Status Badges */}
                  <div className="col-span-1 md:col-span-2 text-right">
                    <span className={`inline-block border text-[10px] uppercase font-mono font-black tracking-wider rounded-none px-2.5 py-1 ${
                      isActive 
                        ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse" 
                        : isCompleted 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                        : isFailed 
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : "bg-gray-50 text-gray-600 border-gray-200"
                    }`}>
                      {job.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
