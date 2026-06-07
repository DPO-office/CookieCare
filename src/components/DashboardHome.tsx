import React from "react";
import { ShieldCheck, ShieldAlert, Settings, FileCheck, Layers, Radio, HelpCircle, ArrowRight } from "lucide-react";
import { LegalDocument } from "../types";

interface DashboardHomeProps {
  userName: string;
  setActiveTab: (tab: string) => void;
  documents: LegalDocument[];
  stats: {
    totalDocs: number;
    pendingSigs: number;
    redlinesPending: number;
  };
}

export default function DashboardHome({ userName, setActiveTab, stats, documents }: DashboardHomeProps) {
  const timeAgo = (isoDate: string) => {
    const createdAt = new Date(isoDate).getTime();
    const diffMs = Date.now() - createdAt;
    const minutes = Math.max(1, Math.round(diffMs / 60000));

    if (minutes < 60) {
      return `${minutes} min ago`;
    }

    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }

    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  };

 const continuousLogs = (documents && documents.length > 0)
    ? documents.map((doc) => {
        // Ultimate safety using standard optional chaining before length property
        const riskCount = (doc as any)?.analysis?.risks?.length ?? 0;
        const pendingRedlines = ((doc as any)?.redlines || [])?.filter((r: any) => r.status === "pending")?.length ?? 0;
        const score = Math.max(0, 100 - (riskCount * 15) - (pendingRedlines * 5));
        
        // Fully bypassed type-safe fallback for multi-environment
        const sharedCount = ((doc as any)?.shared_with || (doc as any)?.sharedWith || []).length;
        const bannerState = (doc as any)?.type === "NDA" || (doc as any)?.type === "DPA" ? "FOUND" : (sharedCount > 0 ? "FOUND" : "MISSING");

        return {
          target: (doc as any)?.title || "Untitled Document",
          score,
          issues: riskCount + pendingRedlines,
          banner: bannerState,
          scanTime: timeAgo((doc as any)?.updatedAt || (doc as any)?.createdAt || new Date().toISOString()),
        };
      })
    : [];
    
  return (
    <div className="flex-1 overflow-y-auto p-10 font-sans grid-bg min-h-screen">
      {/* Header section */}
      <div className="mb-10 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-display font-bold text-gray-900 tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-gray-400 font-mono tracking-wider uppercase mt-1">
            PrivSecAI Auditing Console
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono text-gray-500 bg-white shadow-xs border border-gray-200/60 rounded-full py-1.5 px-3">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>Scanning nodes online</span>
        </div>
      </div>

      {/* Greeting Card with precise layout */}
      <div className="mb-10">
        <h2 className="text-2xl font-display font-medium text-gray-900">
          Welcome back, {userName}
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          Monitor your continuous privacy posture and compliance indicators below
        </p>
      </div>

      {/* DYNAMIC METRICS KPI PANEL - SECURE LIVE BOUNDARIES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white border-2 border-black p-6 rounded-none flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-mono uppercase text-gray-400 font-black tracking-widest mb-1">
              Active Documents
            </p>
            <h3 className="text-3xl font-display font-black text-gray-900">
              {stats.totalDocs}
            </h3>
            <p className="text-[10px] text-gray-500 font-mono mt-1">
              Stored securely in multitenant Vault
            </p>
          </div>
          <div className="w-12 h-12 bg-gray-50 border border-gray-200/80 flex items-center justify-center text-gray-700">
            <FileCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border-2 border-black p-6 rounded-none flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-mono uppercase text-gray-400 font-black tracking-widest mb-1">
              Pending Signatures
            </p>
            <h3 className="text-3xl font-display font-black text-gray-900">
              {stats.pendingSigs}
            </h3>
            <p className="text-[10px] text-gray-500 font-mono mt-1">
              Awaiting corporate signers
            </p>
          </div>
          <div className="w-12 h-12 bg-gray-50 border border-gray-200/80 flex items-center justify-center text-amber-600">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        <div className="bg-white border-2 border-black p-6 rounded-none flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-mono uppercase text-gray-400 font-black tracking-widest mb-1">
              Active Redlines
            </p>
            <h3 className="text-3xl font-display font-black text-gray-900">
              {stats.redlinesPending}
            </h3>
            <p className="text-[10px] text-gray-500 font-mono mt-1">
              Required compromise revisions
            </p>
          </div>
          <div className="w-12 h-12 bg-gray-50 border border-gray-200/80 flex items-center justify-center text-rose-600">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Key functional shortcuts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        
        {/* Cookie Scanner Shortcut Card */}
        <div 
          onClick={() => setActiveTab("cookie-scanner")}
          className="group cursor-pointer bg-white border border-gray-200/80 rounded-none p-6 shadow-xs hover:border-black transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-none bg-gray-50 flex items-center justify-center border border-gray-200/80 mb-5 text-gray-700 font-bold group-hover:bg-black group-hover:text-white group-hover:border-black transition-all">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-gray-900 mb-2">
              Cookie Scanner
            </h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Scrape URLs to isolate active tracker scripts, check opt-in compliance, and perform dynamic traffic light regulations scoring.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-50 flex items-center justify-between text-xs font-semibold text-gray-900">
            <span>Scan Domain Target</span>
            <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </div>
        </div>

        {/* Vulnerability Scanner Shortcut Card */}
        <div 
          onClick={() => setActiveTab("vulnerability-scanner")}
          className="group cursor-pointer bg-white border border-gray-200/80 rounded-none p-6 shadow-xs hover:border-black transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-none bg-gray-50 flex items-center justify-center border border-gray-200/80 mb-5 text-gray-700 font-bold group-hover:bg-black group-hover:text-white group-hover:border-black transition-all">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-gray-900 mb-2">
              Vulnerability Scanner
            </h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Initiate network profiling, verify certificate domains and track missing security headers (HSTS, CSP, X-Frame) instantly.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-50 flex items-center justify-between text-xs font-semibold text-gray-900">
            <span>Isolate Server Vulnerability</span>
            <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </div>
        </div>

        {/* Legal Review tab */}
        <div 
          onClick={() => setActiveTab("legal-review")}
          className="group cursor-pointer bg-white border border-gray-200/80 rounded-none p-6 shadow-xs hover:border-black transition-all flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-none bg-gray-50 flex items-center justify-center border border-gray-200/80 mb-5 text-gray-700 font-bold group-hover:bg-black group-hover:text-white group-hover:border-black transition-all">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-gray-900 mb-2">
              Legal Review Suite
            </h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Edit NDAs, DPAs, and SLA agreements. Coordinate peer redlining, execute electronic signatures, and leverage AI analysis to redact risks.
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-50 flex items-center justify-between text-xs font-semibold text-gray-900">
            <span>Manage Agreement Matrix</span>
            <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </div>
        </div>

      </div>

      {/* CONTINUOUS SCANNING TELEMETRY MATRIX */}
      <div className="bg-white border-2 border-black p-6 rounded-none mb-10">
        <h4 className="text-xs font-semibold text-black font-mono tracking-wider uppercase mb-5 flex items-center space-x-2">
          <Radio className="w-4 h-4 text-emerald-600 animate-pulse animate-duration-1000" />
          <span>Original Document Ledger</span>
        </h4>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs text-gray-800">
            <thead>
              <tr className="border-b border-gray-300 uppercase tracking-wider text-[10px] text-gray-400 font-black">
                <th className="pb-3 pr-4">Document</th>
                <th className="pb-3 px-4">Compliance Score</th>
                <th className="pb-3 px-4">Open Issues</th>
                <th className="pb-3 px-4">Type</th>
                <th className="pb-3 pl-4 text-right">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {continuousLogs.length > 0 ? continuousLogs.map((log, i) => {
                let scoreColor = "text-emerald-700 font-bold bg-emerald-50 border border-emerald-100";
                if (log.score < 50) scoreColor = "text-red-700 font-bold bg-red-50 border border-red-100";
                else if (log.score < 80) scoreColor = "text-amber-700 font-bold bg-amber-50 border border-amber-100";

                return (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3.5 pr-4 text-gray-900 font-bold">{log.target}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] inline-block text-center min-w-10 ${scoreColor}`}>
                        {log.score}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-gray-600">{log.issues} Issues</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-tight inline-block bg-gray-50 text-gray-700 border border-gray-100">
                        {log.banner}
                      </span>
                    </td>
                    <td className="py-3.5 pl-4 text-right text-gray-400">{log.scanTime}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td className="py-5 pr-4 text-gray-500" colSpan={5}>
                    No documents found yet. Create or import a document to populate the original ledger.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
