import { FileText } from "lucide-react";
import type { DashboardJob } from "../types";
import { jobLabel, jobTab, jobTarget, scanScore, timeAgo, jobTime } from "../utils";
import { DashboardCard } from "./DashboardCard";

interface RecentActivityProps {
  jobs: DashboardJob[];
  onStartDraft: () => void;
  onOpen: (tab: string) => void;
}

export function RecentActivity({ jobs, onStartDraft, onOpen }: RecentActivityProps) {
  return (
    <DashboardCard
      overline="Activity"
      title="Recent jobs"
      action={
        <span className="text-[12px] font-medium tabular-nums text-[#98A2B3]">
          {jobs.length} shown
        </span>
      }
      noPadding
    >
      {jobs.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="mb-1 text-[13px] font-medium text-[#1a1a1a]">No completed jobs yet</p>
          <p className="mb-4 text-[12px] text-dark-200">
            Analyses, drafts, and scans will appear here when they finish.
          </p>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full primary-gradient px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            onClick={onStartDraft}
          >
            Create document
          </button>
        </div>
      ) : (
        <ul>
          {jobs.map((job) => {
            const score = scanScore(job);
            const failed = job.status === "failed";
            return (
              <li key={job.id}>
                <button
                  type="button"
                  className="dashboard-activity-row"
                  onClick={() => onOpen(jobTab(job.type))}
                >
                  <div className="dashboard-icon-tile">
                    <FileText className="h-4 w-4" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[#1a1a1a]">
                      {jobLabel(job.type)}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-dark-200">
                      {jobTarget(job)}
                      {failed
                        ? " · Failed"
                        : score !== null
                          ? ` · Scan score ${score}`
                          : " · Completed"}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-[12px] tabular-nums"
                    style={{ color: failed ? "#B54A45" : "#98A2B3" }}
                  >
                    {timeAgo(jobTime(job))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}
