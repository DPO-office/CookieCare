import React from "react";
import { FileCheck, Radio, ShieldAlert, ArrowRight, FileText } from "lucide-react";
import { DashboardHomeProps } from "./types";
import { DASHBOARD_SHORTCUTS } from "./constants";
import { buildDocumentLogs } from "./utils";

export default function DashboardHome({ userName, setActiveTab, stats, documents }: DashboardHomeProps) {
  const continuousLogs = buildDocumentLogs(documents);

  return (
    <div className="flex-1 overflow-y-auto px-10 py-8 bg-[#FAFAFB] min-h-screen">

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-[26px] font-bold text-gray-900 tracking-tight leading-tight">Dashboard</h1>
            <p className="text-[13px] text-gray-500 mt-1">Welcome back, {userName}</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-full py-1.5 px-3.5 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>All systems operational</span>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {[
          { label: "Active Documents", value: stats.totalDocs, sub: "Stored in secure vault", icon: FileCheck, color: "text-gray-600" },
          { label: "Pending Signatures", value: stats.pendingSigs, sub: "Awaiting signers", icon: Radio, color: "text-amber-600" },
          { label: "Active Redlines", value: stats.redlinesPending, sub: "Pending resolution", icon: ShieldAlert, color: "text-rose-600" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-gray-200 rounded-[18px] p-7 shadow-xs hover:shadow-sm transition-shadow flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{kpi.label}</p>
              <h3 className="text-[32px] font-bold text-gray-900 tracking-tight leading-none">{kpi.value}</h3>
              <p className="text-[12px] text-gray-400 mt-2">{kpi.sub}</p>
            </div>
            <div className={`w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center ${kpi.color}`}>
              <kpi.icon className="w-6 h-6" />
            </div>
          </div>
        ))}
      </div>

      {/* Shortcut cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {DASHBOARD_SHORTCUTS.map((s) => (
          <div
            key={s.tab}
            onClick={() => setActiveTab(s.tab)}
            className="group bg-white border border-gray-200 rounded-[18px] p-6 shadow-xs hover:shadow-md hover:border-gray-300 transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center text-gray-600 mb-5 group-hover:bg-gray-900 group-hover:text-white transition-all shadow-xs">
                <s.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-[15px] text-gray-900 mb-2 tracking-tight">{s.title}</h3>
              <p className="text-[13px] text-gray-500 leading-relaxed">{s.desc}</p>
            </div>
            <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-[13px] font-medium text-gray-600">
              <span>{s.cta}</span>
              <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-gray-400" />
            </div>
          </div>
        ))}
      </div>

      {/* Document ledger */}
      <div className="bg-white border border-gray-200 rounded-[18px] shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2.5 bg-gray-50">
          <FileText className="w-4 h-4 text-gray-500" />
          <h4 className="font-bold text-[13px] text-gray-900 tracking-tight">Document Ledger</h4>
          <span className="ml-auto text-[11px] font-medium text-gray-400">{documents.length} documents</span>
        </div>

        {continuousLogs.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <FileText className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-[13px] text-gray-400">No documents yet. Create or import a document to get started.</p>
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
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
        )}
      </div>

    </div>
  );
}
