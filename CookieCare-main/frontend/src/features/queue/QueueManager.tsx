import React from "react";
import { Clock, RefreshCw } from "lucide-react";
import { useJobQueue } from "./hooks/useJobQueue";
import JobRow from "./components/JobRow";

export default function QueueManager() {
  const { jobs, loading, errorStatus, loadJobs } = useJobQueue();

  return (
    <div className="flex-1 overflow-y-auto px-10 py-8 bg-[#FAFAFB] min-h-screen">

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
          <button onClick={loadJobs} className="h-9 px-4 flex items-center gap-2 text-[13px] font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition shadow-xs">
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

      <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
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
            {jobs.map((job) => <JobRow key={job.id} job={job} />)}
          </div>
        )}
      </div>
    </div>
  );
}
