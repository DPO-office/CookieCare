import { Activity } from "lucide-react";
import type { DashboardJob } from "../types";
import { jobLabel, jobTab, jobTarget, timeAgo } from "../utils";
import { DashboardCard } from "./DashboardCard";

interface JobsRunningProps {
  jobs: DashboardJob[];
  loading: boolean;
  onOpen: (tab: string) => void;
}

export function JobsRunning({ jobs, loading, onOpen }: JobsRunningProps) {
  return (
    <DashboardCard
      overline="Live"
      title="Work in progress"
      action={
        <span className="text-[12px] font-medium tabular-nums text-[#98A2B3]">
          {jobs.length} running
        </span>
      }
      noPadding
    >
      {loading && jobs.length === 0 ? (
        <p className="px-6 py-10 text-center text-[13px] text-dark-200">Loading jobs…</p>
      ) : jobs.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <div className="dashboard-icon-tile mx-auto mb-3">
            <Activity className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <p className="text-[13px] font-medium text-[#1a1a1a]">No jobs running</p>
          <p className="mt-1 text-[12px] text-dark-200">
            Analyze, draft, or scan to see live progress here.
          </p>
        </div>
      ) : (
        <ul>
          {jobs.map((job) => {
            const progress = Math.max(0, Math.min(100, job.progress || 0));
            return (
              <li key={job.id}>
                <button
                  type="button"
                  className="dashboard-activity-row"
                  onClick={() => onOpen(jobTab(job.type))}
                >
                  <div className="dashboard-icon-tile">
                    <Activity className="h-4 w-4" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[#1a1a1a]">
                      {jobLabel(job.type)}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-dark-200">
                      {jobTarget(job)}
                      {job.message ? ` · ${job.message}` : ""}
                    </p>
                    <div className="dashboard-progress-track mt-2 max-w-[220px]">
                      <div className="dashboard-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <div className="shrink-0 pl-2 text-right">
                    <p className="text-[13px] font-semibold tabular-nums text-[#4F5BD9]">
                      {progress}%
                    </p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-[#98A2B3]">
                      {timeAgo(job.createdAt)}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}
