import React from "react";
import { PRIMARY_BRAND } from "../../shared/theme/colors";
import { FileCheck, Radio, ShieldAlert, FileText } from "lucide-react";
import { DashboardHomeProps } from "./types";
import { buildDocumentLogs } from "./utils";

export default function DashboardHome({ userName, setActiveTab, stats, documents }: DashboardHomeProps) {
  const continuousLogs = buildDocumentLogs(documents);

  return (
    <div className="flex-1 overflow-y-auto px-10 py-8 bg-[#FAFAFB] min-h-screen">
      <div className="w-full max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight leading-tight" style={{ color: "#2175D9" }}>Dashboard</h1>
        <p className="text-[13px] text-gray-500 mt-1">Welcome back, {userName}</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Active Documents", value: stats.totalDocs, sub: "Stored in secure vault", icon: FileCheck, color: "text-gray-600" },
          { label: "Pending Signatures", value: stats.pendingSigs, sub: "Awaiting signers", icon: Radio, color: "text-amber-600" },
          { label: "Active Redlines", value: stats.redlinesPending, sub: "Pending resolution", icon: ShieldAlert, color: "text-rose-600" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-gray-200 rounded-[18px] px-5 py-4 shadow-xs hover:shadow-sm transition-shadow flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{kpi.label}</p>
              <h3 className="text-[30px] font-bold tracking-tight leading-none" style={{ color: "#2175D9" }}>{kpi.value}</h3>
              <p className="text-[12px] text-gray-400 mt-1.5">{kpi.sub}</p>
            </div>
            <div className={`w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center ${kpi.color}`}>
              <kpi.icon className="w-4.5 h-4.5" />
            </div>
          </div>
        ))}
      </div>



      {/* Document ledger */}
      <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2.5 bg-gray-50 rounded-t-[18px]">
          <FileText className="w-4 h-4 text-gray-500" />
          <h4 className="font-bold text-[13px] text-gray-900 tracking-tight">Document ledger</h4>
          <span className="ml-auto text-[11px] font-medium text-gray-400">{documents.length} documents</span>
        </div>

        {continuousLogs.length === 0 ? (
          <div className="px-6 py-14 text-center flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
              <FileText className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-[13px] font-semibold text-gray-500 mb-1">No documents yet</p>
            <p className="text-[12px] text-gray-400">Create or import a document to get started.</p>
          </div>
        ) : (
          <div className="overflow-y-auto scrollbar-hide" style={{ maxHeight: "320px" }}>
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Document</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Score</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Issues</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {continuousLogs.map((log, i) => {
                  const scoreClass =
                    log.score >= 80 ? "bg-emerald-50 text-emerald-700" :
                    log.score >= 50 ? "bg-amber-50 text-amber-700" :
                    "bg-red-50 text-red-700";

                  return (
                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3.5 font-medium text-gray-900">{log.target}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-bold ${scoreClass}`}>
                          {log.score}%
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">{log.issues} issues</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-block px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-600">
                          {log.type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-400 text-right text-[12px]">{log.scanTime}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </div>
    </div>
  );
}
