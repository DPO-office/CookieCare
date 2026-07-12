import React from "react";
import { FileText, Activity, FileEdit, Globe, ShieldAlert, Terminal } from "lucide-react";
import { Job } from "../types";
import { JOB_STATUS_CONFIG } from "../constants";
import { getJobDetails, getProgressBarColor } from "../utils";

const ICON_MAP: Record<string, React.ElementType> = {
  FileText, Activity, FileEdit, Globe, ShieldAlert, Terminal,
};

interface JobRowProps {
  job: Job;
}

export default function JobRow({ job }: JobRowProps) {
  const { title, iconName } = getJobDetails(job);
  const cfg = JOB_STATUS_CONFIG[job.status] ?? JOB_STATUS_CONFIG.queued;
  const barColor = getProgressBarColor(job.status);
  const Icon = ICON_MAP[iconName] ?? Terminal;

  const iconColorMap: Record<string, string> = {
    FileText: "text-blue-500", Activity: "text-violet-500",
    FileEdit: "text-emerald-500", Globe: "text-blue-500",
    ShieldAlert: "text-rose-500", Terminal: "text-gray-400",
  };

  return (
    <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center hover:bg-gray-50/50 transition-colors">
      <div className="col-span-4 flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
          <Icon className={`w-4 h-4 ${iconColorMap[iconName] ?? "text-gray-400"}`} />
        </div>
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
}
